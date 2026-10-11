import { describe, expect, test } from "bun:test";
import { healthcheck } from "../src/healthcheck";

describe("calendly connector healthcheck", () => {
  test("returns connector-owned healthy status", () => {
    expect(healthcheck()).toEqual({
      connector: "calendly",
      status: "ok",
      source: "connector",
    });
  });

  test("calls GET /users/me when an access token is present", async () => {
    const requests: Request[] = [];
    const result = await healthcheck({
      accessToken: "cal_pat",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify({ resource: { uri: "https://api.calendly.com/users/u1" } }), { status: 200 });
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe("GET");
    expect(requests[0].url).toBe("https://api.calendly.com/users/me");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer cal_pat");
    expect(result).toEqual({ connector: "calendly", status: "ok", source: "provider" });
  });

  test("throws when Calendly rejects the token", async () => {
    await expect(healthcheck({
      accessToken: "bad",
      fetch: async () => new Response("unauthorized", { status: 401 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});
