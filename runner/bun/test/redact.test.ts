import { describe, expect, test } from "bun:test";
import { REDACTED, logLine, redact, redactText } from "../src/redact";

describe("redact", () => {
  test("replaces secret-named fields regardless of casing or separator", () => {
    const out = redact({
      Authorization: "Bearer cal_live_abcdef0123456789",
      api_key: "k-123456789",
      apiKey: "k-123456789",
      "X-Api-Key": "k-123456789",
      botToken: "123:abcdef",
      clientSecret: "s3cr3t",
      dsn: "https://user:pw@api.example.com",
      connector: "cal-com",
    }) as Record<string, unknown>;

    for (const key of ["Authorization", "api_key", "apiKey", "X-Api-Key", "botToken", "clientSecret", "dsn"]) {
      expect(out[key]).toBe(REDACTED);
    }
    // Non-secret context must survive, or the log stops being useful.
    expect(out.connector).toBe("cal-com");
  });

  test("scrubs credentials that appear inside free text", () => {
    expect(redactText("request failed: Authorization: Bearer cal_live_abcdef0123456789"))
      .not.toContain("cal_live_abcdef0123456789");
    expect(redactText("bad key sk_live_abcdef0123456789")).toContain(REDACTED);
    expect(redactText("token xoxb-1234567890-abcdef")).toContain(REDACTED);
    expect(redactText("jwt eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aaaa.bbbb")).toContain(REDACTED);
    expect(redactText("connector returned 422 endpoint deprecated"))
      .toBe("connector returned 422 endpoint deprecated");
  });

  test("walks nested structures, arrays, Headers and Errors", () => {
    const headers = new Headers({ authorization: "Bearer abcdefghijklmnop", "content-type": "application/json" });
    const out = redact({
      request: { headers, retries: [{ apiKey: "abc" }, { status: 429 }] },
      cause: new Error("failed with Bearer abcdefghijklmnop"),
    }) as Record<string, Record<string, unknown>>;

    expect((out.request.headers as Record<string, unknown>).authorization).toBe(REDACTED);
    expect((out.request.headers as Record<string, unknown>)["content-type"]).toBe("application/json");
    expect((out.request.retries as Record<string, unknown>[])[0].apiKey).toBe(REDACTED);
    expect((out.request.retries as Record<string, unknown>[])[1].status).toBe(429);
    expect(String((out.cause as unknown as { message: string }).message)).toContain(REDACTED);
  });

  test("bounds depth instead of recursing without limit", () => {
    let deep: Record<string, unknown> = { apiKey: "leaf-secret" };
    for (let i = 0; i < 30; i++) {
      deep = { nested: deep };
    }
    const serialized = logLine(deep);
    expect(serialized).toContain("[TRUNCATED]");
    expect(serialized).not.toContain("leaf-secret");
  });

  test("survives a cyclic object", () => {
    const cyclic: Record<string, unknown> = { connector: "slack" };
    cyclic.self = cyclic;
    expect(() => logLine(cyclic)).not.toThrow();
  });
});
