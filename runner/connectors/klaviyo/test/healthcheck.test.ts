import { describe, expect, it } from "bun:test";
import { healthcheck } from "../src/healthcheck";

// Helper: build a minimal fetch mock that returns the given status.
function mockFetch(status: number, body: unknown = {}): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
    // Stash for assertion in the test
    (mockFetch as any)._lastUrl = url;
    (mockFetch as any)._lastInit = init;
    return new Response(JSON.stringify(body), { status });
  };
}

describe("klaviyo healthcheck", () => {
  it("returns static connector result when no credential is supplied", () => {
    const result = healthcheck();
    expect(result).toEqual({ connector: "klaviyo", status: "ok", source: "connector" });
  });

  it("returns static connector result when input has no apiKey", () => {
    const result = healthcheck({});
    expect(result).toEqual({ connector: "klaviyo", status: "ok", source: "connector" });
  });

  it("calls the correct endpoint with correct auth headers and returns provider result on 200", async () => {
    let capturedUrl: string | undefined;
    let capturedInit: RequestInit | undefined;

    const fakeFetch: typeof fetch = async (input, init) => {
      capturedUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
      capturedInit = init;
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    };

    const result = await healthcheck({ apiKey: "good", fetch: fakeFetch });

    // Verify the result signals provider-verified
    expect(result).toEqual({ connector: "klaviyo", status: "ok", source: "provider" });

    // Verify the URL points at the lists endpoint (lightweight, auth-required)
    expect(capturedUrl).toContain("https://a.klaviyo.com/api/lists");

    // Verify method
    expect(capturedInit?.method).toBe("GET");

    // Verify auth header uses Klaviyo-API-Key scheme
    const headers = capturedInit?.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Klaviyo-API-Key good");

    // Verify required revision header is present
    expect(headers["revision"]).toBe("2024-10-15");
  });

  it("rejects with CONNECTOR_UPSTREAM_ERROR on 401", async () => {
    const fakeFetch: typeof fetch = async () =>
      new Response(JSON.stringify({ errors: [{ code: "not_authenticated" }] }), { status: 401 });

    await expect(healthcheck({ apiKey: "bad", fetch: fakeFetch })).rejects.toMatchObject({
      ok: false,
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
  });

  it("rejects with CONNECTOR_UPSTREAM_ERROR on 403", async () => {
    const fakeFetch: typeof fetch = async () =>
      new Response(JSON.stringify({ errors: [{ code: "forbidden" }] }), { status: 403 });

    await expect(healthcheck({ apiKey: "bad", fetch: fakeFetch })).rejects.toMatchObject({
      ok: false,
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
  });

  it("rejects with CONNECTOR_RATE_LIMITED on 429", async () => {
    const fakeFetch: typeof fetch = async () =>
      new Response(JSON.stringify({}), { status: 429 });

    await expect(healthcheck({ apiKey: "good", fetch: fakeFetch })).rejects.toMatchObject({
      ok: false,
      code: "CONNECTOR_RATE_LIMITED",
    });
  });

  it("rejects with CONNECTOR_UNAVAILABLE on transport error", async () => {
    const fakeFetch: typeof fetch = async () => {
      throw new Error("network unreachable");
    };

    await expect(healthcheck({ apiKey: "good", fetch: fakeFetch })).rejects.toMatchObject({
      ok: false,
      code: "CONNECTOR_UNAVAILABLE",
    });
  });
});
