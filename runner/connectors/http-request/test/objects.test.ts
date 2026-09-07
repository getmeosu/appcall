import { describe, expect, it } from "bun:test";
import { normalizeHttpRequest } from "../src/objects";

describe("normalizeHttpRequest", () => {
  it("maps all fields with defaults", () => {
    const req = normalizeHttpRequest({
      method: "get",
      url: "https://example.com/api",
      statusCode: 200,
    });

    expect(req.id).toMatch(/^http-req:/);
    expect(req.provider).toBe("http-request");
    expect(req.method).toBe("GET");
    expect(req.url).toBe("https://example.com/api");
    expect(req.statusCode).toBe(200);
    expect(req.headers).toEqual({});
    expect(req.body).toBeNull();
    expect(req.timestamp).toBeDefined();
  });

  it("uses provided id when given", () => {
    const req = normalizeHttpRequest({
      id: "custom-123",
      method: "POST",
      url: "https://example.com/api",
      statusCode: 201,
      headers: { "content-type": "application/json" },
      body: { ok: true },
    });

    expect(req.id).toBe("custom-123");
    expect(req.method).toBe("POST");
    expect(req.headers).toEqual({ "content-type": "application/json" });
    expect(req.body).toEqual({ ok: true });
  });

  it("uppercases method", () => {
    const req = normalizeHttpRequest({
      method: "patch",
      url: "https://example.com",
      statusCode: 200,
    });
    expect(req.method).toBe("PATCH");
  });
});
