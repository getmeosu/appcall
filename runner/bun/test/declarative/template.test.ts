import { describe, expect, it } from "bun:test";
import { renderTemplate, renderPath, hasPlaceholder } from "../../src/declarative/template";

describe("renderTemplate", () => {
  it("returns a whole-value substitution with its original type", () => {
    expect(renderTemplate("{{limit}}", { limit: 25 })).toBe(25);
    expect(renderTemplate("{{ids}}", { ids: ["a", "b"] })).toEqual(["a", "b"]);
    expect(renderTemplate("{{flag}}", { flag: false })).toBe(false);
    expect(renderTemplate("{{obj}}", { obj: { a: 1 } })).toEqual({ a: 1 });
  });

  it("resolves dotted and indexed paths", () => {
    expect(renderTemplate("{{user.name}}", { user: { name: "ada" } })).toBe("ada");
    expect(renderTemplate("{{items.0.id}}", { items: [{ id: "x" }] })).toBe("x");
  });

  it("returns undefined for an unresolved whole-value placeholder", () => {
    expect(renderTemplate("{{missing}}", {})).toBeUndefined();
    expect(renderTemplate("{{user.missing}}", { user: {} })).toBeUndefined();
  });

  it("interpolates placeholders embedded in a larger string", () => {
    expect(renderTemplate("Bearer {{apiKey}}", { apiKey: "k1" })).toBe("Bearer k1");
    expect(renderTemplate("{{a}}-{{b}}", { a: "x", b: 2 })).toBe("x-2");
  });

  it("returns undefined when an embedded placeholder is unresolved", () => {
    expect(renderTemplate("Bearer {{apiKey}}", {})).toBeUndefined();
  });

  it("passes through strings with no placeholder", () => {
    expect(renderTemplate("application/json", {})).toBe("application/json");
  });

  it("drops object keys whose value is unresolved", () => {
    const out = renderTemplate({ a: "{{a}}", b: "{{b}}" }, { a: 1 });
    expect(out).toEqual({ a: 1 });
  });

  it("recurses into nested objects and arrays", () => {
    const out = renderTemplate(
      { to: ["{{to}}"], meta: { subject: "{{subject}}", skip: "{{nope}}" } },
      { to: "b@y.com", subject: "Hi" },
    );
    expect(out).toEqual({ to: ["b@y.com"], meta: { subject: "Hi" } });
  });

  it("drops unresolved array elements", () => {
    expect(renderTemplate(["{{a}}", "{{b}}"], { b: 2 })).toEqual([2]);
  });

  it("preserves non-string literals", () => {
    expect(renderTemplate({ page: 1, on: true }, {})).toEqual({ page: 1, on: true });
  });

  it("treats an empty string as resolved", () => {
    expect(renderTemplate("{{q}}", { q: "" })).toBe("");
  });

  it("treats null as unresolved", () => {
    expect(renderTemplate("{{q}}", { q: null })).toBeUndefined();
  });
});

describe("renderPath", () => {
  it("interpolates and URL-encodes path segments", () => {
    expect(renderPath("/records/{{recordId}}", { recordId: "rec 1/2" })).toBe("/records/rec%201%2F2");
  });

  it("leaves a path with no placeholder untouched", () => {
    expect(renderPath("/v3/contacts", {})).toBe("/v3/contacts");
  });

  it("throws when a path placeholder is unresolved", () => {
    expect(() => renderPath("/records/{{recordId}}", {})).toThrow("recordId is required");
  });

  it("stringifies a numeric path value", () => {
    expect(renderPath("/lists/{{listId}}", { listId: 42 })).toBe("/lists/42");
  });

  it("rejects dot path segments", () => {
    expect(() => renderPath("/records/{{recordId}}", { recordId: "." })).toThrow(/dot path segment/);
    expect(() => renderPath("/records/{{recordId}}", { recordId: ".." })).toThrow(/dot path segment/);
    expect(() => renderPath("/parent/.{{recordId}}", { recordId: "." })).toThrow(/dot path segment/);
    expect(() => renderPath("/parent/{{left}}{{right}}", { left: ".", right: "." })).toThrow(/dot path segment/);
    expect(() => renderPath("/parent/../child", {})).toThrow(/dot path segment/);
    expect(() => renderPath("/parent/%2e%2e/child", {})).toThrow(/dot path segment/);
  });

  it("allows dot characters inside a non-segment value", () => {
    expect(renderPath("/records/{{recordId}}", { recordId: "v1.2" })).toBe("/records/v1.2");
  });
});

describe("hasPlaceholder", () => {
  it("detects placeholders anywhere in a template tree", () => {
    expect(hasPlaceholder("{{a}}")).toBe(true);
    expect(hasPlaceholder({ a: ["x", { b: "{{c}}" }] })).toBe(true);
    expect(hasPlaceholder({ a: ["x"] })).toBe(false);
  });
});
