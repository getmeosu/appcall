import { isRecord } from "./template";
import type { JSONSchema } from "./validate";

const MAX_DEPTH = 64;
const MAX_NODES = 4096;
const forbidden = new Set(["__proto__", "constructor", "prototype"]);
const supported = new Set(["type", "enum", "properties", "required", "additionalProperties", "items", "minItems", "minLength", "minimum", "maximum", "title", "description"]);

export function assertStrictSchema(schema: JSONSchema, depth = 0, state = { nodes: 0 }): void {
  if (!isRecord(schema)) throw new Error("Invalid strict-generated schema");
  if (depth > MAX_DEPTH || ++state.nodes > MAX_NODES) throw new Error("Schema nesting exceeds limit");
  for (const key of Object.keys(schema)) {
    if (!supported.has(key)) throw new Error(`Unsupported strict-generated schema constraint: ${key}`);
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
  if (isRecord(schema.properties)) for (const [key, child] of Object.entries(schema.properties)) { if (forbidden.has(key)) throw new Error("Forbidden property name"); assertStrictSchema(child as JSONSchema, depth + 1, state); }
  else if (schema.properties !== undefined) throw new Error("properties must be an object");
  if (schema.items !== undefined && !isRecord(schema.items)) throw new Error("items must be a schema");
  if (isRecord(schema.items)) assertStrictSchema(schema.items, depth + 1, state);
  if (isRecord(schema.additionalProperties)) assertStrictSchema(schema.additionalProperties, depth + 1, state);
}

export function validateStrictInput(input: unknown, schema: JSONSchema, credentialKeys = new Set<string>()): Record<string, unknown> {
  let nodes = 0;
  assertStrictSchema(schema);
  const walk = (value: unknown, s: JSONSchema, path: string, depth: number): unknown => {
    if (depth > MAX_DEPTH || ++nodes > MAX_NODES) throw new Error("Input nesting exceeds limit");
    if (typeof value === "number" && !Number.isFinite(value)) throw new Error(`${path || "input"} must be finite`);
    const types = typeof s.type === "string" ? [s.type] : Array.isArray(s.type) ? s.type as string[] : [];
    if (types.length && !types.some((t) => (t === "null" ? value === null : t === "object" ? isRecord(value) : t === "array" ? Array.isArray(value) : t === "integer" ? typeof value === "number" && Number.isSafeInteger(value) : t === "number" ? typeof value === "number" && Number.isFinite(value) : typeof value === t))) throw new Error(`${path || "input"} has an invalid type`);
    if (s.enum && !(s.enum as unknown[]).some((x) => deepEqual(x, value))) throw new Error(`${path || "input"} is not an allowed value`);
    if (typeof value === "string") { const n = [...value].length; if (s.minLength !== undefined && n < (s.minLength as number)) throw new Error(`${path} is too short`); }
    if (typeof value === "number") { if (s.minimum !== undefined && value < (s.minimum as number)) throw new Error(`${path} is below minimum`); if (s.maximum !== undefined && value > (s.maximum as number)) throw new Error(`${path} is above maximum`); }
    if (Array.isArray(value)) { if (s.minItems !== undefined && value.length < (s.minItems as number)) throw new Error(`${path} has too few items`); value.forEach((v, i) => walk(v, isRecord(s.items) ? s.items : {}, `${path}[${i}]`, depth + 1)); }
    if (isRecord(value)) { const props = isRecord(s.properties) ? s.properties : {}; for (const k of (s.required as string[] ?? [])) if (!Object.hasOwn(value, k)) throw new Error(`${path ? `${path}.` : ""}${k} is required`); for (const [k, v] of Object.entries(value)) { if (forbidden.has(k)) throw new Error("Forbidden input field"); if (Object.hasOwn(props, k)) walk(v, props[k] as JSONSchema, `${path ? `${path}.` : ""}${k}`, depth + 1); else if (isRecord(s.additionalProperties)) walk(v, s.additionalProperties, `${path ? `${path}.` : ""}${k}`, depth + 1); else if (s.additionalProperties === false && !(path === "" && credentialKeys.has(k))) throw new Error("Unsupported input field"); else walk(v, {}, `${path ? `${path}.` : ""}${k}`, depth + 1); } }
    return value;
  };
  walk(input, schema, "", 0);
  const out: Record<string, unknown> = {};
  if (isRecord(input)) {
    const props = isRecord(schema.properties) ? schema.properties : {};
    for (const [k, v] of Object.entries(input)) {
      const declared = Object.hasOwn(props, k);
      if (declared || (schema.additionalProperties !== false && !credentialKeys.has(k))) out[k] = v;
    }
  }
  return out;
}

function deepEqual(a: unknown, b: unknown): boolean { if (Object.is(a, b)) return true; if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => deepEqual(v, b[i])); if (isRecord(a) && isRecord(b)) { const ak = Object.keys(a); const bk = Object.keys(b); return ak.length === bk.length && ak.every((k) => Object.hasOwn(b, k) && deepEqual(a[k], b[k])); } return false; }
