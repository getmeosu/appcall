import { describe, expect, it } from "bun:test";
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
