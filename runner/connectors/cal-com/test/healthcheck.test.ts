import { describe, expect, test } from "bun:test";
import { healthcheck } from "../src/healthcheck";

describe("cal-com connector healthcheck", () => {
  test("returns connector-owned healthy status", () => {
    expect(healthcheck()).toEqual({
      connector: "cal-com",
      status: "ok",
      source: "connector",
    });
  });

  test("calls GET /v2/me when an access token is present", async () => {
    const requests: Request[] = [];
    const result = await healthcheck({
      accessToken: "cal_live_test",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify({ status: "success", data: { id: 1 } }), { status: 200 });
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe("GET");
    expect(requests[0].url).toBe("https://api.cal.com/v2/me");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer cal_live_test");
    expect(requests[0].headers.get("cal-api-version")).toBe("2024-08-13");
    expect(result).toEqual({ connector: "cal-com", status: "ok", source: "provider" });
  });

  test("throws when Cal.com rejects the token", async () => {
    await expect(healthcheck({
      accessToken: "bad",
      fetch: async () => new Response("unauthorized", { status: 401 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});
