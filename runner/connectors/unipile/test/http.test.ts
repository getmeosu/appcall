import { describe, expect, test } from "bun:test";
import { parseUnipileRateLimit, validateDsnHost, createUnipileClient, classifyUnipileResponse, ConnectorErrorCode } from "../src/http";

describe("classifyUnipileResponse", () => {
  test("429 -> rate limited with retry-after", () => {
    const c = classifyUnipileResponse(429, { "retry-after": "20" }, {});
    expect(c.code).toBe(ConnectorErrorCode.RateLimited);
    expect(c.retryAfterSeconds).toBe(20);
  });

  test("checkpoint error body -> account restricted (regardless of status)", () => {
    const c = classifyUnipileResponse(403, {}, { type: "errors/checkpoint_error", detail: "Solve the checkpoint" });
    expect(c.code).toBe(ConnectorErrorCode.AccountRestricted);
  });

  test("captcha / 2FA checkpoint surfacing as 408 -> account restricted", () => {
    const c = classifyUnipileResponse(408, {}, { type: "errors/checkpoint_error", checkpoint: "CAPTCHA" });
    expect(c.code).toBe(ConnectorErrorCode.AccountRestricted);
  });

  test("disconnected account -> account restricted", () => {
    const c = classifyUnipileResponse(401, {}, { type: "errors/disconnected_account" });
    expect(c.code).toBe(ConnectorErrorCode.AccountRestricted);
  });

  test("expired credentials -> account restricted", () => {
    const c = classifyUnipileResponse(401, {}, { code: "expired_credentials" });
    expect(c.code).toBe(ConnectorErrorCode.AccountRestricted);
  });

  test("cannot_resend_yet invite cooldown -> action not permitted", () => {
    const c = classifyUnipileResponse(422, {}, { type: "errors/cannot_resend_yet" });
    expect(c.code).toBe(ConnectorErrorCode.ActionNotPermitted);
  });

  test("bare 422 with no token -> action not permitted", () => {
    const c = classifyUnipileResponse(422, {}, { detail: "Unprocessable" });
    expect(c.code).toBe(ConnectorErrorCode.ActionNotPermitted);
  });

  test("restriction token takes precedence over 422", () => {
    const c = classifyUnipileResponse(422, {}, { type: "account_restricted" });
    expect(c.code).toBe(ConnectorErrorCode.AccountRestricted);
  });

  test("generic 500 -> upstream error", () => {
    const c = classifyUnipileResponse(500, {}, { detail: "Internal" });
    expect(c.code).toBe(ConnectorErrorCode.UpstreamError);
  });

  test("upstream error surfaces the Unipile reason (no longer swallowed)", () => {
    const c = classifyUnipileResponse(400, {}, { title: "Bad Request", detail: "You have reached the weekly invitation limit." });
    expect(c.code).toBe(ConnectorErrorCode.UpstreamError);
    expect(c.message).toBe("You have reached the weekly invitation limit."); // detail preferred
  });

  test("upstream error reason falls back to title, and stays empty when absent", () => {
    expect(classifyUnipileResponse(500, {}, { title: "Server Error" }).message).toBe("Server Error");
    expect(classifyUnipileResponse(500, {}, {}).message).toBe("");
  });

  test("nested error object tokens are detected", () => {
    const c = classifyUnipileResponse(403, {}, { error: { type: "checkpoint", message: "verify" } });
    expect(c.code).toBe(ConnectorErrorCode.AccountRestricted);
  });

  test("string body is matched", () => {
    const c = classifyUnipileResponse(403, {}, "account suspended for unusual activity");
    expect(c.code).toBe(ConnectorErrorCode.AccountRestricted);
  });
});

describe("parseUnipileRateLimit", () => {
  test("returns limited=false for non-429 status", () => {
    const result = parseUnipileRateLimit(200, {});
    expect(result.limited).toBe(false);
    expect(result.retryAfterSeconds).toBe(0);
  });

  test("returns limited=true for 429 with retry-after header", () => {
    const result = parseUnipileRateLimit(429, { "retry-after": "30" });
    expect(result.limited).toBe(true);
    expect(result.retryAfterSeconds).toBe(30);
  });

  test("defaults retryAfterSeconds to 10 when retry-after is missing", () => {
    const result = parseUnipileRateLimit(429, {});
    expect(result.limited).toBe(true);
    expect(result.retryAfterSeconds).toBe(10);
  });

  test("defaults retryAfterSeconds to 10 when retry-after is 0", () => {
    const result = parseUnipileRateLimit(429, { "retry-after": "0" });
    expect(result.limited).toBe(true);
    expect(result.retryAfterSeconds).toBe(10);
  });

  test("parses non-integer retry-after as number", () => {
    const result = parseUnipileRateLimit(429, { "retry-after": "45" });
    expect(result.retryAfterSeconds).toBe(45);
  });
});

describe("validateDsnHost", () => {
  test("returns URL for allowed host api8.unipile.com", () => {
    const url = validateDsnHost("https://api8.unipile.com:13851");
    expect(url.hostname).toBe("api8.unipile.com");
  });

  test("returns URL for allowed host api1.unipile.com", () => {
    const url = validateDsnHost("https://api1.unipile.com:14000");
    expect(url.hostname).toBe("api1.unipile.com");
  });

  test("throws for disallowed host", () => {
    expect(() => validateDsnHost("https://evil.example.com:13851")).toThrow();
  });

  test("throws for invalid URL", () => {
    expect(() => validateDsnHost("not-a-url")).toThrow();
  });
});

describe("createUnipileClient", () => {
  test("builds correct URL for /accounts path using dsn", async () => {
    const requests: Request[] = [];
    const client = createUnipileClient({
      apiKey: "test_key",
      baseUrl: "https://api8.unipile.com:13851",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify({ items: [] }), { status: 200 });
      },
    });
    await client.fetchJSON("/accounts");
    expect(requests).toHaveLength(1);
    const url = new URL(requests[0].url);
    expect(url.hostname).toBe("api8.unipile.com");
    expect(url.pathname).toBe("/api/v1/accounts");
  });

  test("sets X-API-KEY header", async () => {
    const requests: Request[] = [];
    const client = createUnipileClient({
      apiKey: "my_api_key",
      baseUrl: "https://api8.unipile.com:13851",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response("{}", { status: 200 });
      },
    });
    await client.fetchJSON("/accounts");
    expect(requests[0].headers.get("X-API-KEY")).toBe("my_api_key");
  });

  test("sets accept: application/json header", async () => {
    const requests: Request[] = [];
    const client = createUnipileClient({
      apiKey: "key",
      baseUrl: "https://api8.unipile.com:13851",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response("{}", { status: 200 });
      },
    });
    await client.fetchJSON("/accounts");
    expect(requests[0].headers.get("accept")).toBe("application/json");
  });

  test("rejects disallowed host at HTTP layer", async () => {
    expect(() =>
      createUnipileClient({
        apiKey: "key",
        baseUrl: "https://evil.attacker.com:9999",
      })
    ).toThrow();
  });
});
