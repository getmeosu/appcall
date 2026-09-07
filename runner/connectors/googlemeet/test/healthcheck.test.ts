import { describe, expect, test } from "bun:test";
import { healthcheck } from "../src/healthcheck";

describe("healthcheck", () => {
  test("returns static connector status without a token", () => {
    const result = healthcheck() as Record<string, unknown>;
    expect(result.connector).toBe("googlemeet");
    expect(result.status).toBe("ok");
    expect(result.source).toBe("connector");
  });

  test("verifies a token against the primary calendar", async () => {
    const result = await healthcheck({
      accessToken: "ya29.test",
      fetch: async () => new Response(JSON.stringify({ id: "primary" }), { status: 200 }),
    });
    expect(result.source).toBe("provider");
  });

  test("rejects an invalid token", async () => {
    await expect(healthcheck({
      accessToken: "bad",
      fetch: async () => new Response("Unauthorized", { status: 401 }),
    })).rejects.toMatchObject({ ok: false });
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(healthcheck({
      accessToken: "ya29.test",
      fetch: async () => new Response("", { status: 429, headers: { "retry-after": "30" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED" });
  });
});
