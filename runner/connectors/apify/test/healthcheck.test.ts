import { describe, expect, test } from "bun:test";
import { healthcheck } from "../src/healthcheck";

describe("apify connector healthcheck", () => {
  test("returns connector-owned healthy status without a credential", () => {
    expect(healthcheck()).toEqual({
      connector: "apify",
      status: "ok",
      source: "connector",
    });
  });

  test("calls GET /v2/users/me with the Bearer token", async () => {
    const requests: Request[] = [];
    await healthcheck({
      apiKey: "good_token",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify({ data: { id: "u1", username: "alice" } }), { status: 200 });
      },
    });
    expect(requests[0].method).toBe("GET");
    const url = new URL(requests[0].url);
    expect(url.hostname).toBe("api.apify.com");
    expect(url.pathname).toBe("/v2/users/me");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer good_token");
  });

  test("returns provider-confirmed status when Apify accepts the token", async () => {
    const result = await healthcheck({
      apiKey: "good_token",
      fetch: async () => new Response(JSON.stringify({ data: { id: "u1" } }), { status: 200 }),
    });
    expect(result).toEqual({ connector: "apify", status: "ok", source: "provider" });
  });

  test("throws when Apify rejects the token (HTTP 401)", async () => {
    await expect(healthcheck({
      apiKey: "bad_token",
      fetch: async () => new Response("User was not found or authentication token is not valid.", { status: 401 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("throws when Apify is unreachable", async () => {
    await expect(healthcheck({
      apiKey: "good_token",
      fetch: async () => { throw new Error("network down"); },
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UNAVAILABLE" });
  });
});
