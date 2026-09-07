import { describe, expect, it } from "bun:test";
import { validateAgainstSchema } from "../../src/declarative/validate";

const schema = {
  type: "object",
  properties: {
    from: { type: "string" },
    to: { type: ["string", "array"], items: { type: "string" } },
    subject: { type: "string" },
    limit: { type: "integer" },
    draft: { type: "boolean" },
    fields: { type: "object" },
  },
  required: ["from", "to", "subject"],
};

describe("validateAgainstSchema", () => {
  it("returns the declared properties that are present", () => {
    const validated = validateAgainstSchema(
      { from: "a@x.com", to: "b@y.com", subject: "Hi", limit: 5 },
      schema,
    );
    expect(validated).toEqual({ from: "a@x.com", to: "b@y.com", subject: "Hi", limit: 5 });
  });

  it("drops properties that are not declared in the schema", () => {
    const validated = validateAgainstSchema(
      { from: "a@x.com", to: "b@y.com", subject: "Hi", apiKey: "secret", fetch: () => {} },
      schema,
    );
    expect(validated).toEqual({ from: "a@x.com", to: "b@y.com", subject: "Hi" });
  });

  it("throws when input is not an object", () => {
    expect(() => validateAgainstSchema("nope", schema)).toThrow("input must be an object");
  });

  it("throws naming the first missing required field", () => {
    expect(() => validateAgainstSchema({ to: "b@y.com", subject: "Hi" }, schema)).toThrow("from is required");
    expect(() => validateAgainstSchema({ from: "a@x.com", subject: "Hi" }, schema)).toThrow("to is required");
  });

  it("treats an empty string as a missing required field", () => {
    expect(() => validateAgainstSchema({ from: "", to: "b", subject: "Hi" }, schema)).toThrow("from is required");
  });

  it("accepts any of a union type", () => {
    const validated = validateAgainstSchema(
      { from: "a@x.com", to: ["b@y.com", "c@y.com"], subject: "Hi" },
      schema,
    );
    expect(validated.to).toEqual(["b@y.com", "c@y.com"]);
  });

  it("throws on a type mismatch", () => {
    expect(() => validateAgainstSchema({ from: 1, to: "b", subject: "Hi" }, schema)).toThrow("from must be a string");
    expect(() => validateAgainstSchema({ from: "a", to: "b", subject: "Hi", limit: "5" }, schema)).toThrow("limit must be an integer");
    expect(() => validateAgainstSchema({ from: "a", to: "b", subject: "Hi", draft: "yes" }, schema)).toThrow("draft must be a boolean");
    expect(() => validateAgainstSchema({ from: "a", to: "b", subject: "Hi", fields: [] }, schema)).toThrow("fields must be an object");
  });

  it("rejects a non-integer number for an integer property", () => {
    expect(() => validateAgainstSchema({ from: "a", to: "b", subject: "Hi", limit: 1.5 }, schema)).toThrow("limit must be an integer");
  });

  it("ignores an optional property that is undefined or null", () => {
    const validated = validateAgainstSchema(
      { from: "a", to: "b", subject: "Hi", limit: undefined, draft: null },
      schema,
    );
    expect(validated).toEqual({ from: "a", to: "b", subject: "Hi" });
  });

  it("accepts an empty schema and returns an empty payload", () => {
    expect(validateAgainstSchema({ anything: 1 }, { type: "object" })).toEqual({});
  });

  it("enforces enum membership", () => {
    const enumSchema = { type: "object", properties: { mode: { type: "string", enum: ["a", "b"] } }, required: ["mode"] };
    expect(validateAgainstSchema({ mode: "a" }, enumSchema)).toEqual({ mode: "a" });
    expect(() => validateAgainstSchema({ mode: "c" }, enumSchema)).toThrow("mode must be one of: a, b");
  });
});
