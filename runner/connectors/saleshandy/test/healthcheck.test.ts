import { describe, expect, test } from "bun:test";
import { healthcheck } from "../src/healthcheck";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFetch(status: number, body: unknown = {}): typeof fetch {
  return async (_url: RequestInfo | URL, _init?: RequestInit) =>
    new Response(JSON.stringify(body), { status });
}

function makeThrowingFetch(): typeof fetch {
  return async () => { throw new Error("network error"); };
}

// ---------------------------------------------------------------------------
// Static connector path (no credential)
// ---------------------------------------------------------------------------

describe("saleshandy healthcheck — no credential", () => {
  test("returns connector-owned status without calling the network", () => {
    const result = healthcheck();
    expect(result).toEqual({ connector: "saleshandy", status: "ok", source: "connector" });
  });

  test("returns connector-owned status when input is not a record", () => {
    expect(healthcheck(null)).toEqual({ connector: "saleshandy", status: "ok", source: "connector" });
    expect(healthcheck(42)).toEqual({ connector: "saleshandy", status: "ok", source: "connector" });
  });

  test("returns connector-owned status when input has no apiKey", () => {
    expect(healthcheck({})).toEqual({ connector: "saleshandy", status: "ok", source: "connector" });
  });
});

// ---------------------------------------------------------------------------
// Provider-verified path (credential present)
// ---------------------------------------------------------------------------

describe("saleshandy healthcheck — with credential", () => {
  test("calls GET /v1/sequences with x-api-key header and returns provider on 200", async () => {
    const calls: { method: string; url: string; headers: Record<string, string> }[] = [];

    const fetch: typeof globalThis.fetch = async (url, init) => {
      calls.push({
        method: (init?.method ?? "GET").toUpperCase(),
        url: String(url),
        headers: (init?.headers ?? {}) as Record<string, string>,
      });
      return new Response(JSON.stringify({ message: "success", payload: { sequences: [], total: 0 } }), { status: 200 });
    };

    const result = await healthcheck({ apiKey: "good", fetch });

    expect(result).toEqual({ connector: "saleshandy", status: "ok", source: "provider" });
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(new URL(calls[0].url).pathname).toBe("/v1/sequences");
    expect(calls[0].headers["x-api-key"]).toBe("good");
  });

  test("rejects with CONNECTOR_UPSTREAM_ERROR on 401 (bad key)", async () => {
    const fetch = makeFetch(401, { message: "Unauthorized" });
    await expect(healthcheck({ apiKey: "bad", fetch })).rejects.toMatchObject({
      ok: false,
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
  });

  test("rejects with CONNECTOR_UPSTREAM_ERROR and includes HTTP status in message on non-2xx", async () => {
    const fetch = makeFetch(403, { message: "Forbidden" });
    await expect(healthcheck({ apiKey: "bad", fetch })).rejects.toMatchObject({
      ok: false,
      code: "CONNECTOR_UPSTREAM_ERROR",
      message: expect.stringContaining("403"),
    });
  });

  test("rejects with CONNECTOR_RATE_LIMITED on 429", async () => {
    const fetch = makeFetch(429, { message: "Too Many Requests" });
    await expect(healthcheck({ apiKey: "good", fetch })).rejects.toMatchObject({
      ok: false,
      code: "CONNECTOR_RATE_LIMITED",
    });
  });

  test("rejects with CONNECTOR_UNAVAILABLE on transport error", async () => {
    const fetch = makeThrowingFetch();
    await expect(healthcheck({ apiKey: "good", fetch })).rejects.toMatchObject({
      ok: false,
      code: "CONNECTOR_UNAVAILABLE",
    });
  });
});
