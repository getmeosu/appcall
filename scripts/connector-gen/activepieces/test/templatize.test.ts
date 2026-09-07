import { describe, expect, it } from "bun:test";
import { buildSentinels, splitURL, templatize, authSentinel } from "../templatize";

const schema = {
  type: "object" as const,
  properties: {
    email: { type: "string" },
    firstName: { type: "string" },
    count: { type: "number" },
    tags: { type: "array" },
    fields: { type: "object" },
    draft: { type: "boolean" },
  },
};

describe("buildSentinels", () => {
  it("gives each input a traceable, type-appropriate value", () => {
    const { values, untraceable } = buildSentinels(schema);
    expect(values.email).toBe("__AP_email__");
    expect(typeof values.count).toBe("number");
    expect(values.tags).toEqual(["__AP_tags__"]);
    expect(values.fields).toEqual({ __AP_fields__: "__AP_fields__" });
    expect(values.draft).toBe(true);
    expect(untraceable).toEqual(["draft"]);
  });

  it("gives distinct numbers to distinct numeric inputs", () => {
    const { values } = buildSentinels({
      type: "object",
      properties: { a: { type: "number" }, b: { type: "number" } },
    });
    expect(values.a).not.toBe(values.b);
  });
});

describe("templatize", () => {
  const { sentinels } = buildSentinels(schema);

  it("recovers a renamed body field", () => {
    expect(templatize({ first_name: "__AP_firstName__", email: "__AP_email__" }, sentinels))
      .toEqual({ first_name: "{{firstName}}", email: "{{email}}" });
  });

  it("recovers a numeric input", () => {
    const { values, sentinels: s } = buildSentinels(schema);
    expect(templatize({ limit: values.count }, s)).toEqual({ limit: "{{count}}" });
  });

  it("maps a whole array input to one placeholder", () => {
    expect(templatize({ labels: ["__AP_tags__"] }, sentinels)).toEqual({ labels: "{{tags}}" });
  });

  it("maps a whole object input to one placeholder", () => {
    expect(templatize({ custom: { __AP_fields__: "__AP_fields__" } }, sentinels))
      .toEqual({ custom: "{{fields}}" });
  });

  it("recurses into nested structures", () => {
    expect(templatize({ contact: { emails: [{ value: "__AP_email__" }] } }, sentinels))
      .toEqual({ contact: { emails: [{ value: "{{email}}" }] } });
  });

  it("interpolates a sentinel embedded in a larger string", () => {
    expect(templatize("Bearer __AP_email__", sentinels)).toBe("Bearer {{email}}");
  });

  it("leaves literals the action hard-coded alone", () => {
    expect(templatize({ source: "activepieces", page: 1, draft: true }, sentinels))
      .toEqual({ source: "activepieces", page: 1, draft: true });
  });
});

describe("splitURL", () => {
  const { sentinels } = buildSentinels(schema);

  it("splits origin, path, and query and templatizes each", () => {
    const parts = splitURL("https://api.demo.test/v1/prospects/__AP_email__?limit=__AP_firstName__&fixed=1", sentinels);
    expect(parts.baseUrl).toBe("https://api.demo.test");
    expect(parts.path).toBe("/v1/prospects/{{email}}");
    expect(parts.query).toEqual({ limit: "{{firstName}}", fixed: "1" });
  });

  it("recovers a sentinel that went through encodeURIComponent", () => {
    const encoded = `https://api.demo.test/v1/p/${encodeURIComponent("__AP_email__")}`;
    expect(splitURL(encoded, sentinels).path).toBe("/v1/p/{{email}}");
  });

  it("returns an empty query when the URL carries none", () => {
    expect(splitURL("https://api.demo.test/v1/p", sentinels).query).toEqual({});
  });
});

describe("auth sentinel", () => {
  it("is a distinct token the extractor can map onto the credential field", () => {
    expect(authSentinel).toBe("__AP_AUTH__");
    const { sentinels } = buildSentinels(schema);
    expect(templatize(`Bearer ${authSentinel}`, sentinels)).toBe("Bearer __AP_AUTH__");
  });
});
