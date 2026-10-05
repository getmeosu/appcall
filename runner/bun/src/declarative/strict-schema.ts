import { isRecord } from "./template";
import type { JSONSchema } from "./validate";

const MAX_DEPTH = 64;
const MAX_NODES = 4096;
const forbidden = new Set(["__proto__", "constructor", "prototype"]);
const supported = new Set(["type", "enum", "properties", "required", "additionalProperties", "items", "minItems", "minLength", "minimum", "maximum", "title", "description", "anyOf", "allOf", "oneOf"]);
// Bounded combinators, shared with the control plane validator
// (crates/appcall-connectors/src/schema.rs): each branch is a schema node that
// counts toward MAX_NODES and MAX_DEPTH, and a combinator holds 1..64 branches.
const COMBINATORS = ["anyOf", "allOf", "oneOf"] as const;
const MAX_COMBINATOR_BRANCHES = 64;

// Annotation-only keywords the control plane's schema checker accepts
// (crates/appcall-connectors/src/schema.rs `check_schema`). They never
// constrain a value, so registry dispatch validation may skip over them.
const annotations = new Set(["default", "examples", "$schema", "$id", "$comment", "readOnly", "writeOnly", "deprecated"]);

export function assertStrictSchema(schema: JSONSchema, depth = 0, state = { nodes: 0 }, allowAnnotations = false): void {
  if (!isRecord(schema)) throw new Error("Invalid strict-generated schema");
  if (depth > MAX_DEPTH || ++state.nodes > MAX_NODES) throw new Error("Schema nesting exceeds limit");
  for (const key of Object.keys(schema)) {
    if (!supported.has(key) && !(allowAnnotations && (annotations.has(key) || key.startsWith("x-")))) throw new Error(`Unsupported strict-generated schema constraint: ${key}`);
  }
  const types = schema.type;
  if (types !== undefined && !(typeof types === "string" || (Array.isArray(types) && types.length > 0 && types.every((t) => typeof t === "string")))) throw new Error("Invalid schema type");
  for (const type of (typeof types === "string" ? [types] : Array.isArray(types) ? types : [])) {
    if (!["string", "number", "integer", "boolean", "array", "object", "null"].includes(type)) throw new Error(`Invalid schema type: ${type}`);
  }
  for (const key of ["minItems", "minLength"]) if (schema[key] !== undefined && (!Number.isInteger(schema[key]) || (schema[key] as number) < 0)) throw new Error(`${key} must be a non-negative integer`);
  for (const key of ["minimum", "maximum"]) if (schema[key] !== undefined && (typeof schema[key] !== "number" || !Number.isFinite(schema[key]) || Math.abs(schema[key] as number) > Number.MAX_SAFE_INTEGER)) throw new Error(`${key} must be a finite safe number`);
  if (schema.enum !== undefined && (!Array.isArray(schema.enum) || schema.enum.length === 0)) throw new Error("enum must be a non-empty array");
  if (schema.required !== undefined && (!Array.isArray(schema.required) || !schema.required.every((x) => typeof x === "string" && !forbidden.has(x)))) throw new Error("required must be an array of safe property names");
  if (schema.additionalProperties !== undefined && typeof schema.additionalProperties !== "boolean" && !isRecord(schema.additionalProperties)) throw new Error("additionalProperties must be boolean or schema");
  if (isRecord(schema.properties)) for (const [key, child] of Object.entries(schema.properties)) { if (forbidden.has(key)) throw new Error("Forbidden property name"); assertStrictSchema(child as JSONSchema, depth + 1, state, allowAnnotations); }
  else if (schema.properties !== undefined) throw new Error("properties must be an object");
  if (schema.items !== undefined && !isRecord(schema.items)) throw new Error("items must be a schema");
  if (isRecord(schema.items)) assertStrictSchema(schema.items, depth + 1, state, allowAnnotations);
  if (isRecord(schema.additionalProperties)) assertStrictSchema(schema.additionalProperties, depth + 1, state, allowAnnotations);
  for (const key of COMBINATORS) {
    const branches = schema[key];
    if (branches === undefined) continue;
    if (!Array.isArray(branches) || branches.length === 0 || branches.length > MAX_COMBINATOR_BRANCHES) throw new Error(`${key} must be an array of 1-${MAX_COMBINATOR_BRANCHES} schemas`);
    for (const branch of branches) {
      if (!isRecord(branch)) throw new Error(`${key} branches must be schemas`);
      assertStrictSchema(branch, depth + 1, state, allowAnnotations);
    }
  }
}

// A resource-limit failure inside a combinator branch must not be mistaken
// for "this branch does not match"; it always propagates.
class InputLimitError extends Error {}

export function validateStrictInput(input: unknown, schema: JSONSchema, credentialKeys: ReadonlySet<string> = new Set<string>()): Record<string, unknown> {
  return compileStrictValidator(schema, { credentialKeys })(input);
}

export type StrictValidatorOptions = {
  // Top-level keys injected by the runtime rather than the caller (credential
  // fields, the test-only fetch override): exempt from additionalProperties:false.
  credentialKeys?: ReadonlySet<string>;
  // Registry dispatch mode mirrors the control plane validator
  // (crates/appcall-connectors/src/schema.rs): annotation keywords are
  // tolerated, an undeclared credential key is not checked against an
  // additionalProperties schema (the control plane strips it first), input
  // size is bounded by maxInputBytes rather than a node count, and an
  // unsupported field is named in the error.
  registry?: boolean;
};

// compileStrictValidator checks the schema once and compiles it into a tree of
// node checkers with every keyword lookup resolved up front, so the returned
// validator only walks the input. Callers on a hot path keep the returned
// function; the schema is never re-checked or re-read per call. Error messages
// are byte-identical to the original interpretive walker.
type Ctx = { nodes: number };
// A node receives its parent path and its own key rather than a prebuilt path,
// so leaf values never pay for path strings; the path is only materialized for
// an error message or when descending into a container.
type NodeCheck = (value: unknown, parent: string, key: string | number | undefined, depth: number, ctx: Ctx) => void;

const childPath = (path: string, key: string) => (path ? `${path}.${key}` : key);
const pathOf = (parent: string, key: string | number | undefined) =>
  key === undefined ? parent : typeof key === "number" ? `${parent}[${key}]` : childPath(parent, key);

export function compileStrictValidator(schema: JSONSchema, options: StrictValidatorOptions = {}): (input: unknown) => Record<string, unknown> {
  const credentialKeys = options.credentialKeys ?? new Set<string>();
  const registry = options.registry === true;
  const maxNodes = registry ? Number.POSITIVE_INFINITY : MAX_NODES;
  assertStrictSchema(schema, 0, { nodes: 0 }, registry);

  const typeMatchers: Record<string, (value: unknown) => boolean> = {
    null: (value) => value === null,
    object: (value) => isRecord(value),
    array: (value) => Array.isArray(value),
    integer: (value) => typeof value === "number" && Number.isSafeInteger(value),
    number: (value) => typeof value === "number" && Number.isFinite(value),
    string: (value) => typeof value === "string",
    boolean: (value) => typeof value === "boolean",
  };

  let empty: NodeCheck = () => undefined;
  const compileNode = (s: JSONSchema): NodeCheck => {
    const types = typeof s.type === "string" ? [s.type] : Array.isArray(s.type) ? s.type as string[] : [];
    const matchers = types.map((t) => typeMatchers[t] ?? ((value: unknown) => typeof value === t));
    const expected = registry ? ` (expected ${types.join(" or ")})` : "";
    const enumValues = s.enum ? s.enum as unknown[] : undefined;
    const minLength = s.minLength as number | undefined;
    const minimum = s.minimum as number | undefined;
    const maximum = s.maximum as number | undefined;
    const minItems = s.minItems as number | undefined;
    const props = isRecord(s.properties) ? s.properties : {};
    const propChecks = new Map<string, NodeCheck>();
    for (const [k, child] of Object.entries(props)) propChecks.set(k, compileNode(child as JSONSchema));
    const required = (s.required as string[] | undefined) ?? [];
    const additional = isRecord(s.additionalProperties) ? compileNode(s.additionalProperties) : undefined;
    const closed = s.additionalProperties === false;
    const items = isRecord(s.items) ? compileNode(s.items) : undefined;
    const check: NodeCheck = (value, parent, key, depth, ctx) => {
      if (depth > MAX_DEPTH || ++ctx.nodes > maxNodes) throw new InputLimitError("Input nesting exceeds limit");
      if (typeof value === "number" && !Number.isFinite(value)) throw new Error(`${pathOf(parent, key) || "input"} must be finite`);
      if (matchers.length) {
        let matched = false;
        for (let i = 0; i < matchers.length && !matched; i++) matched = matchers[i](value);
        if (!matched) throw new Error(`${pathOf(parent, key) || "input"} has an invalid type${expected}`);
      }
      if (enumValues) {
        let allowed = false;
        for (let i = 0; i < enumValues.length && !allowed; i++) allowed = deepEqual(enumValues[i], value);
        if (!allowed) throw new Error(`${pathOf(parent, key) || "input"} is not an allowed value`);
      }
      if (typeof value === "string") { if (minLength !== undefined && [...value].length < minLength) throw new Error(`${pathOf(parent, key)} is too short`); return; }
      if (typeof value === "number") { if (minimum !== undefined && value < minimum) throw new Error(`${pathOf(parent, key)} is below minimum`); if (maximum !== undefined && value > maximum) throw new Error(`${pathOf(parent, key)} is above maximum`); return; }
      if (Array.isArray(value)) {
        const path = pathOf(parent, key);
        if (minItems !== undefined && value.length < minItems) throw new Error(`${path} has too few items`);
        const item = items ?? empty;
        for (let i = 0; i < value.length; i++) item(value[i], path, i, depth + 1, ctx);
        return;
      }
      if (isRecord(value)) {
        const path = pathOf(parent, key);
        for (const k of required) if (!Object.hasOwn(value, k)) throw new Error(`${childPath(path, k)} is required`);
        const atTop = path === "";
        for (const k in value) {
          if (!Object.hasOwn(value, k)) continue;
          if (forbidden.has(k)) throw new Error("Forbidden input field");
          const declared = propChecks.get(k);
          if (declared !== undefined && Object.hasOwn(props, k)) declared(value[k], path, k, depth + 1, ctx);
          else if (registry && atTop && credentialKeys.has(k)) continue;
          else if (additional) additional(value[k], path, k, depth + 1, ctx);
          else if (closed && !(atTop && credentialKeys.has(k))) throw new Error(registry ? `Unsupported input field: ${childPath(path, k)}` : "Unsupported input field");
          else empty(value[k], path, k, depth + 1, ctx);
        }
      }
    };
    const allOf = Array.isArray(s.allOf) ? (s.allOf as JSONSchema[]).map(compileNode) : undefined;
    const anyOf = Array.isArray(s.anyOf) ? (s.anyOf as JSONSchema[]).map(compileNode) : undefined;
    const oneOf = Array.isArray(s.oneOf) ? (s.oneOf as JSONSchema[]).map(compileNode) : undefined;
    if (!allOf && !anyOf && !oneOf) return check;
    // "requires one of: a | b+c" when every anyOf branch only lists required
    // keys (the github identifier alternatives); a generic message otherwise.
    const anyOfRequired = Array.isArray(s.anyOf) && (s.anyOf as JSONSchema[]).every((b) => Object.keys(b).length === 1 && Array.isArray(b.required) && b.required.length > 0)
      ? (s.anyOf as JSONSchema[]).map((b) => (b.required as string[]).join("+")).join(" | ")
      : undefined;
    const matches = (branch: NodeCheck, value: unknown, parent: string, key: string | number | undefined, depth: number, ctx: Ctx): boolean => {
      try {
        branch(value, parent, key, depth + 1, ctx);
        return true;
      } catch (error) {
        if (error instanceof InputLimitError) throw error;
        return false;
      }
    };
    return (value, parent, key, depth, ctx) => {
      check(value, parent, key, depth, ctx);
      if (allOf) for (const branch of allOf) branch(value, parent, key, depth + 1, ctx);
      if (anyOf) {
        let matched = false;
        for (let i = 0; i < anyOf.length && !matched; i++) matched = matches(anyOf[i], value, parent, key, depth, ctx);
        if (!matched) throw new Error(anyOfRequired ? `${pathOf(parent, key) || "input"} requires one of: ${anyOfRequired}` : `${pathOf(parent, key) || "input"} does not match any allowed alternative`);
      }
      if (oneOf) {
        let matched = 0;
        for (let i = 0; i < oneOf.length && matched < 2; i++) if (matches(oneOf[i], value, parent, key, depth, ctx)) matched += 1;
        if (matched !== 1) throw new Error(`${pathOf(parent, key) || "input"} must match exactly one allowed alternative`);
      }
    };
  };
  empty = compileNode({});
  const root = compileNode(schema);
  const rootProps = isRecord(schema.properties) ? schema.properties : {};

  return (input: unknown): Record<string, unknown> => {
    root(input, "", undefined, 0, { nodes: 0 });
    // Registry dispatch only needs the verdict; the handler receives the
    // original input untouched.
    if (registry) return input as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    if (isRecord(input)) {
      for (const [k, v] of Object.entries(input)) {
        const declared = Object.hasOwn(rootProps, k);
        if (declared || (schema.additionalProperties !== false && !credentialKeys.has(k))) out[k] = v;
      }
    }
    return out;
  };
}

function deepEqual(a: unknown, b: unknown): boolean { if (Object.is(a, b)) return true; if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => deepEqual(v, b[i])); if (isRecord(a) && isRecord(b)) { const ak = Object.keys(a); const bk = Object.keys(b); return ak.length === bk.length && ak.every((k) => Object.hasOwn(b, k) && deepEqual(a[k], b[k])); } return false; }
