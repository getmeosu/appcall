import { describe, expect, test } from "bun:test";
import { parseCalComRateLimit, createCalComClient, isRecord, unwrapEnvelope } from "../src/http";

describe("parseCalComRateLimit", () => {
  test("returns limited=true and retryAfterSeconds from header when status 429", () => {
    const result = parseCalComRateLimit(429, { "retry-after": "30" });
    expect(result.limited).toBe(true);
    expect(result.retryAfterSeconds).toBe(30);
  });

  test("defaults retryAfterSeconds to 10 when retry-after header is missing", () => {
    const result = parseCalComRateLimit(429, {});
    expect(result.limited).toBe(true);
    expect(result.retryAfterSeconds).toBe(10);
  });

  test("defaults retryAfterSeconds to 10 when retry-after is 0", () => {
    const result = parseCalComRateLimit(429, { "retry-after": "0" });
    expect(result.limited).toBe(true);
    expect(result.retryAfterSeconds).toBe(10);
  });

  test("returns limited=false for non-429 status", () => {
    expect(parseCalComRateLimit(200, {}).limited).toBe(false);
    expect(parseCalComRateLimit(500, {}).limited).toBe(false);
    expect(parseCalComRateLimit(401, {}).limited).toBe(false);
  });
});

describe("createCalComClient", () => {
  test("sends Authorization Bearer header and cal-api-version header", async () => {
    const requests: Request[] = [];
    const client = createCalComClient({
      token: "cal_live_test_key",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify({ status: "success", data: {} }), { status: 200 });
      },
    });
    await client.fetchJSON("/me");
    expect(requests).toHaveLength(1);
    expect(requests[0].headers.get("Authorization")).toBe("Bearer cal_live_test_key");
    expect(requests[0].headers.get("cal-api-version")).toBeTruthy();
    expect(requests[0].url).toBe("https://api.cal.com/v2/me");
  });

  test("sends requests only to api.cal.com (allowedHosts enforcement)", async () => {
    const requests: Request[] = [];
    const client = createCalComClient({
      token: "key",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response("{}", { status: 200 });
      },
    });
    await client.fetchJSON("/bookings");
    expect(requests).toHaveLength(1);
    expect(new URL(requests[0].url).hostname).toBe("api.cal.com");
  });

  test("overrides cal-api-version per-call", async () => {
    const requests: Request[] = [];
    const client = createCalComClient({
      token: "key",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response("{}", { status: 200 });
      },
    });
    await client.fetchJSON("/slots", {}, "2024-09-04");
    expect(requests[0].headers.get("cal-api-version")).toBe("2024-09-04");
  });
});

describe("isRecord", () => {
  test("returns true for plain objects", () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ a: 1 })).toBe(true);
  });

  test("returns false for non-objects", () => {
    expect(isRecord(null)).toBe(false);
    expect(isRecord([])).toBe(false);
    expect(isRecord("string")).toBe(false);
    expect(isRecord(42)).toBe(false);
    expect(isRecord(undefined)).toBe(false);
  });
});

describe("unwrapEnvelope", () => {
  test("unwraps success envelope returning data", () => {
    const result = unwrapEnvelope({ status: "success", data: { id: 1 } });
    expect(result).toEqual({ id: 1 });
  });

  test("unwraps error envelope returning data", () => {
    const result = unwrapEnvelope({ status: "error", data: null });
    expect(result).toBeNull();
  });

  test("returns body as-is when no status field", () => {
    const body = { collection: [1, 2] };
    expect(unwrapEnvelope(body)).toEqual(body);
  });

  test("returns non-record input as-is", () => {
    expect(unwrapEnvelope("string")).toBe("string");
    expect(unwrapEnvelope(null)).toBeNull();
  });
});
