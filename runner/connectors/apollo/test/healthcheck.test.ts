import { describe, expect, test } from "bun:test";
import { healthcheck } from "../src/healthcheck";

describe("apollo connector healthcheck", () => {
  test("returns connector-owned healthy status without a credential", () => {
    expect(healthcheck()).toEqual({
      connector: "apollo",
      status: "ok",
      source: "connector",
    });
  });

  test("calls GET /api/v1/auth/health with the X-Api-Key header", async () => {
    const requests: Request[] = [];
    await healthcheck({
      apiKey: "good_key",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify({ healthy: true, is_logged_in: true }), { status: 200 });
      },
    });
    expect(requests[0].method).toBe("GET");
    const url = new URL(requests[0].url);
    expect(url.pathname).toBe("/api/v1/auth/health");
    expect(requests[0].headers.get("X-Api-Key")).toBe("good_key");
  });

  test("returns provider-confirmed status when Apollo reports is_logged_in", async () => {
    const result = await healthcheck({
      apiKey: "good_key",
      fetch: async () => new Response(JSON.stringify({ healthy: true, is_logged_in: true }), { status: 200 }),
    });
    expect(result).toEqual({ connector: "apollo", status: "ok", source: "provider" });
  });

  test("throws when Apollo returns HTTP 200 but is_logged_in is false (invalid key)", async () => {
    await expect(healthcheck({
      apiKey: "bad_key",
      fetch: async () => new Response(JSON.stringify({ healthy: true, is_logged_in: false }), { status: 200 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("throws when Apollo returns a non-2xx status", async () => {
    await expect(healthcheck({
      apiKey: "bad_key",
      fetch: async () => new Response("Invalid access credentials.", { status: 401 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});
