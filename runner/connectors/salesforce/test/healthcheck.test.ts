import { describe, expect, test } from "bun:test";
import { healthcheck } from "../src/healthcheck";

describe("salesforce connector healthcheck", () => {
  test("returns connector-owned healthy status", () => {
    expect(healthcheck()).toEqual({
      connector: "salesforce",
      status: "ok",
      source: "connector",
    });
  });

  test("calls chatter users/me when instance credentials are present", async () => {
    const requests: Request[] = [];
    const result = await healthcheck({
      accessToken: "sf_token",
      instanceUrl: "https://acme.my.salesforce.com",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify({ id: "005" }), { status: 200 });
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe("GET");
    expect(requests[0].url).toBe("https://acme.my.salesforce.com/services/data/v60.0/chatter/users/me");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer sf_token");
    expect(result).toEqual({ connector: "salesforce", status: "ok", source: "provider" });
  });

  test("throws when Salesforce rejects the token", async () => {
    await expect(healthcheck({
      accessToken: "bad",
      instanceUrl: "https://acme.my.salesforce.com",
      fetch: async () => new Response("unauthorized", { status: 401 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});
