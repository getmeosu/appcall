import { describe, expect, test } from "bun:test";
import { healthcheck } from "../src/healthcheck";

describe("lusha connector healthcheck", () => {
  test("no credential → returns static connector-owned status", () => {
    expect(healthcheck()).toEqual({ connector: "lusha", status: "ok", source: "connector" });
    expect(healthcheck(undefined)).toEqual({ connector: "lusha", status: "ok", source: "connector" });
    expect(healthcheck({})).toEqual({ connector: "lusha", status: "ok", source: "connector" });
    expect(healthcheck({ notAnApiKey: true })).toEqual({ connector: "lusha", status: "ok", source: "connector" });
  });

  test("valid key → GET /account/usage with api_key header → returns provider source", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const mockFetch = async (url: string, init?: RequestInit): Promise<Response> => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ credits_used: 5, credits_remaining: 95 }), { status: 200 });
    };

    const result = await healthcheck({ apiKey: "good", fetch: mockFetch });

    expect(result).toEqual({ connector: "lusha", status: "ok", source: "provider" });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.lusha.com/account/usage");
    expect((calls[0].init as RequestInit & { method?: string }).method).toBe("GET");
    const headers = (calls[0].init?.headers ?? {}) as Record<string, string>;
    expect(headers["api_key"]).toBe("good");
  });

  test("401 response → rejects with CONNECTOR_UPSTREAM_ERROR", async () => {
    const mockFetch = async (): Promise<Response> => {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    };

    await expect(healthcheck({ apiKey: "bad", fetch: mockFetch })).rejects.toMatchObject({
      ok: false,
      code: "CONNECTOR_UPSTREAM_ERROR",
      message: expect.stringContaining("401"),
    });
  });

  test("429 response → rejects with CONNECTOR_RATE_LIMITED", async () => {
    const mockFetch = async (): Promise<Response> => {
      return new Response(null, { status: 429 });
    };

    await expect(healthcheck({ apiKey: "good", fetch: mockFetch })).rejects.toMatchObject({
      ok: false,
      code: "CONNECTOR_RATE_LIMITED",
    });
  });

  test("transport error → rejects with CONNECTOR_UNAVAILABLE", async () => {
    const mockFetch = async (): Promise<Response> => {
      throw new Error("network failure");
    };

    await expect(healthcheck({ apiKey: "good", fetch: mockFetch })).rejects.toMatchObject({
      ok: false,
      code: "CONNECTOR_UNAVAILABLE",
    });
  });
});
