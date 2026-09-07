import { describe, expect, it } from "bun:test";
import { parseJiraRateLimit, extractAdfText } from "../src/http";

describe("parseJiraRateLimit", () => {
  it("detects 429 with retry-after header", () => {
    const result = parseJiraRateLimit(429, { "retry-after": "120" });
    expect(result.limited).toBe(true);
    if (result.limited) expect(result.retryAfterSeconds).toBe(120);
  });

  it("detects 429 with Retry-After header", () => {
    const result = parseJiraRateLimit(429, { "Retry-After": "60" });
    expect(result.limited).toBe(true);
    if (result.limited) expect(result.retryAfterSeconds).toBe(60);
  });

  it("defaults to 30 seconds when no retry-after on 429", () => {
    const result = parseJiraRateLimit(429, {});
    expect(result.limited).toBe(true);
    if (result.limited) expect(result.retryAfterSeconds).toBe(30);
  });

  it("does not flag 200", () => {
    const result = parseJiraRateLimit(200, {});
    expect(result.limited).toBe(false);
  });

  it("does not flag 401", () => {
    const result = parseJiraRateLimit(401, {});
    expect(result.limited).toBe(false);
  });
});

describe("extractAdfText", () => {
  it("returns plain string", () => {
    expect(extractAdfText("hello")).toBe("hello");
  });

  it("extracts text from ADF doc", () => {
    const adf = {
      type: "doc",
      version: 1,
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Hello " }, { type: "text", text: "world" }] },
        { type: "paragraph", content: [{ type: "text", text: "second line" }] },
      ],
    };
    expect(extractAdfText(adf)).toBe("Hello worldsecond line");
  });

  it("returns empty for null", () => {
    expect(extractAdfText(null)).toBe("");
  });

  it("returns empty for non-ADF object", () => {
    expect(extractAdfText({ foo: "bar" })).toBe("");
  });

  it("returns empty for ADF without content", () => {
    expect(extractAdfText({ type: "doc", version: 1 })).toBe("");
  });
});
