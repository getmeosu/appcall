import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { assertStrictSchema, validateStrictInput } from "../../src/declarative/strict-schema";

describe("strict-generated schema", () => {
  it("preserves missing versus explicit null and validates nested required", () => {
    const schema = { type: "object", properties: { profile: { type: "object", properties: { name: { type: ["string", "null"] } }, required: ["name"] } }, required: ["profile"] };
    expect(() => validateStrictInput({ profile: {} }, schema)).toThrow("name is required");
    expect(validateStrictInput({ profile: { name: null } }, schema)).toEqual({ profile: { name: null } });
  });
  it("uses deep enum equality and bounds", () => {
    const schema = { type: "object", properties: { mode: { enum: [{ a: 1 }] }, count: { type: "integer", minimum: 1, maximum: 3 }, text: { type: "string", minLength: 2 } }, additionalProperties: false };
    expect(validateStrictInput({ mode: { a: 1 }, count: 2, text: "😀a" }, schema)).toEqual({ mode: { a: 1 }, count: 2, text: "😀a" });
    expect(() => validateStrictInput({ mode: { a: 2 }, count: 2, text: "ok" }, schema)).toThrow();
    expect(() => validateStrictInput({ mode: { a: 1 }, count: 4, text: "ok" }, schema)).toThrow();
    expect(validateStrictInput({ amount: 0.5 }, { type: "object", properties: { amount: { type: "number", minimum: 0.5 } } })).toEqual({ amount: 0.5 });
  });
  it("preserves default unknown fields and bounds untyped nested data", () => {
    expect(validateStrictInput({ extra: { deep: [1, { ok: true }] } }, { type: "object" })).toEqual({ extra: { deep: [1, { ok: true }] } });
    const deep: any = {}; let cursor = deep; for (let i = 0; i < 65; i++) { cursor.x = {}; cursor = cursor.x; }
    expect(() => validateStrictInput(deep, { type: "object" })).toThrow("nesting");
    expect(() => validateStrictInput(JSON.parse('{"extra":{"__proto__":true}}'), { type: "object" })).toThrow("Forbidden");
  });
  it("rejects unsupported constraints and bounded deep schemas", () => {
    expect(() => assertStrictSchema({ type: "string", pattern: "x" })).toThrow("Unsupported");
    let schema: any = { type: "string" }; for (let i = 0; i < 66; i++) schema = { type: "array", items: schema };
    expect(() => assertStrictSchema(schema)).toThrow("nesting");
  });
  it("allows injected credential fields without allowing arbitrary extras", () => {
    const schema = { type: "object", properties: { name: { type: "string" } }, additionalProperties: false };
    expect(validateStrictInput({ name: "A", apiKey: "secret" }, schema, new Set(["apiKey"]))).toEqual({ name: "A" });
    expect(() => validateStrictInput({ name: "A", nope: true }, schema, new Set(["apiKey"]))).toThrow("Unsupported");
  });
  it("strips injected-only credentials from permissive validated projections", () => {
    const credentials = new Set(["apiKey", "fetch"]);
    expect(validateStrictInput({ x: "hello", apiKey: "secret", fetch: () => {} }, { type: "object", properties: { x: { type: "string" } } }, credentials)).toEqual({ x: "hello" });
    expect(validateStrictInput({ x: "hello", userField: 1, apiKey: "secret" }, { type: "object", properties: { x: { type: "string" } }, additionalProperties: true }, credentials)).toEqual({ x: "hello", userField: 1 });
    expect(validateStrictInput({ x: "hello", apiKey: "user-visible" }, { type: "object", properties: { x: { type: "string" }, apiKey: { type: "string" } } }, credentials)).toEqual({ x: "hello", apiKey: "user-visible" });
  });
  it("rejects non-finite numbers in untyped nested data", () => {
    expect(() => validateStrictInput({ extra: { values: [1, Infinity] } }, { type: "object" })).toThrow("finite");
  });
  it("rejects an empty type union", () => {
    expect(() => assertStrictSchema({ type: [] })).toThrow("Invalid schema type");
  });
});

describe("strict-schema sibling constraints", () => {
  it("accepts maxLength/maxItems and sibling keywords and enforces them", () => {
    const schema = {
      type: "object",
      properties: {
        name: { type: "string", minLength: 1, maxLength: 3 },
        tags: { type: "array", minItems: 1, maxItems: 2, uniqueItems: true, items: { type: "string" } },
        score: { type: "number", exclusiveMinimum: 0, exclusiveMaximum: 10 },
        kind: { const: "alpha" },
      },
      minProperties: 1,
      maxProperties: 4,
      additionalProperties: false,
    };
    expect(validateStrictInput({ name: "ab", tags: ["a"], score: 5, kind: "alpha" }, schema)).toEqual({
      name: "ab", tags: ["a"], score: 5, kind: "alpha",
    });
    expect(validateStrictInput({ name: "😀😀😀" }, { type: "object", properties: { name: { type: "string", maxLength: 3 } } })).toEqual({ name: "😀😀😀" });
    expect(() => validateStrictInput({ name: "😀😀😀😀" }, { type: "object", properties: { name: { type: "string", maxLength: 3 } } })).toThrow("too long");
    expect(() => validateStrictInput({ name: "abcd" }, schema)).toThrow("too long");
    expect(() => validateStrictInput({ tags: ["a", "b", "c"] }, schema)).toThrow("too many items");
    expect(() => validateStrictInput({ tags: ["a", "a"] }, schema)).toThrow("duplicate items");
    expect(() => validateStrictInput({ score: 0 }, schema)).toThrow("below minimum");
    expect(() => validateStrictInput({ score: 10 }, schema)).toThrow("above maximum");
    expect(() => validateStrictInput({ kind: "beta" }, schema)).toThrow("not an allowed value");
    expect(() => validateStrictInput({}, { type: "object", minProperties: 1 })).toThrow("too few properties");
    expect(() => validateStrictInput({ a: 1, b: 2, c: 3 }, { type: "object", maxProperties: 2 })).toThrow("too many properties");
  });

  it("rejects malformed sibling keyword values", () => {
    expect(() => assertStrictSchema({ type: "string", maxLength: -1 })).toThrow("maxLength must be a non-negative integer");
    expect(() => assertStrictSchema({ type: "string", maxLength: 1.5 })).toThrow("maxLength must be a non-negative integer");
    expect(() => assertStrictSchema({ type: "array", maxItems: -1 })).toThrow("maxItems must be a non-negative integer");
    expect(() => assertStrictSchema({ type: "number", exclusiveMinimum: Infinity })).toThrow("exclusiveMinimum must be a finite safe number");
    expect(() => assertStrictSchema({ type: "object", minProperties: -1 })).toThrow("minProperties must be a non-negative integer");
    expect(() => assertStrictSchema({ type: "array", uniqueItems: "yes" as never })).toThrow("uniqueItems must be a boolean");
  });

  it("treats format as an annotation in registry mode and still rejects pattern", () => {
    expect(() => assertStrictSchema({ type: "string", format: "email" }, 0, { nodes: 0 }, true)).not.toThrow();
    expect(() => assertStrictSchema({ type: "string", format: "email" })).toThrow("Unsupported");
    expect(() => assertStrictSchema({ type: "string", pattern: "^a+$" }, 0, { nodes: 0 }, true)).toThrow("Unsupported");
  });

  it("compiles every registry connector inputSchema in registry mode", () => {
    const root = new URL("../../../connectors", import.meta.url).pathname;
    const combinatorOps = new Set([
      "deployments.create", "deployments.get", "discussions.comments.create", "discussions.comments.list",
      "discussions.comments.update", "discussions.get", "discussions.update", "environments.get", "releases.assets.get",
    ]);
    const strip = (node: unknown): unknown => {
      if (Array.isArray(node)) return node.map(strip);
      if (!node || typeof node !== "object") return node;
      return Object.fromEntries(
        Object.entries(node as Record<string, unknown>)
          .filter(([k]) => !["anyOf", "allOf", "oneOf"].includes(k))
          .map(([k, v]) => [k, k === "enum" ? v : strip(v)]),
      );
    };
    let compiled = 0;
    for (const dir of readdirSync(root)) {
      const path = `${root}/${dir}/manifest.json`;
      if (!existsSync(path)) continue;
      const manifest = JSON.parse(readFileSync(path, "utf8")) as { key: string; operations?: Record<string, { inputSchema?: unknown }> };
      for (const [op, spec] of Object.entries(manifest.operations ?? {})) {
        const schema = spec?.inputSchema;
        if (!schema || typeof schema !== "object") continue;
        const cleaned = manifest.key === "github" && combinatorOps.has(op) ? strip(schema) : schema;
        expect(() => assertStrictSchema(cleaned as never, 0, { nodes: 0 }, true), `${manifest.key}.${op}`).not.toThrow();
        compiled += 1;
      }
    }
    expect(compiled).toBeGreaterThan(3900);
  });
});
