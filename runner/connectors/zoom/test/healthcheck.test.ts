import { describe, expect, test } from "bun:test";
import { healthcheck } from "../src/healthcheck";

describe("zoom connector healthcheck", () => {
  test("returns connector-owned healthy status", () => {
    expect(healthcheck()).toEqual({
      connector: "zoom",
      status: "ok",
      source: "connector",
    });
  });

  test("calls GET /v2/users/me when an access token is present", async () => {
    const requests: Request[] = [];
    const result = await healthcheck({
      accessToken: "zoom_test",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify({ id: "u1" }), { status: 200 });
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe("GET");
    expect(requests[0].url).toBe("https://api.zoom.us/v2/users/me");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer zoom_test");
    expect(result).toEqual({ connector: "zoom", status: "ok", source: "provider" });
  });

  test("throws when Zoom rejects the token", async () => {
    await expect(healthcheck({
      accessToken: "bad",
      fetch: async () => new Response("unauthorized", { status: 401 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});
