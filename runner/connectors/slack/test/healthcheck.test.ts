import { describe, expect, test } from "bun:test";
import { healthcheck } from "../src/healthcheck";

describe("slack connector healthcheck", () => {
  test("returns connector-owned healthy status", () => {
    expect(healthcheck()).toEqual({
      connector: "slack",
      status: "ok",
      source: "connector",
    });
  });

  test("uses Slack auth.test for a credentialed healthcheck", async () => {
    const requests: Request[] = [];
    const result = await healthcheck({
      token: "xoxb-secret",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify({ ok: true, team_id: "T123" }), { status: 200 });
      },
    });

    expect(result).toEqual({ connector: "slack", status: "ok", source: "provider" });
    expect(requests[0].url).toBe("https://slack.com/api/auth.test");
    expect(requests[0].headers.get("authorization")).toBe("Bearer xoxb-secret");
  });

  test("does not claim health when Slack rejects the credential", async () => {
    await expect(healthcheck({
      token: "xoxb-invalid",
      fetch: async () => new Response(JSON.stringify({ ok: false, error: "invalid_auth" }), { status: 200 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});
