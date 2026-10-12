import { describe, expect, it, beforeEach } from "bun:test";
import { healthcheck } from "../src/healthcheck";
import { clearGreenhouseTokenCache } from "../src/http";

describe("Greenhouse healthcheck", () => {
  beforeEach(() => {
    clearGreenhouseTokenCache();
  });

  it("mints an OAuth token then GETs /v3/users?per_page=1 with Bearer", async () => {
    const calls: Request[] = [];
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      calls.push(new Request(input as string, init));
      const url = String(input);
      if (url.includes("auth.greenhouse.io/token")) {
        return new Response(
          JSON.stringify({ access_token: "hc-token", token_type: "Bearer", expires_in: 3600 }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(JSON.stringify([{ id: 1, name: "Admin" }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const result = await healthcheck({
      clientId: "cid",
      clientSecret: "csec",
      fetch: fetchImpl,
    });

    expect(result.source).toBe("provider");
    expect(result.status).toBe("ok");
    expect(calls).toHaveLength(2);
    expect(calls[0]!.url).toBe("https://auth.greenhouse.io/token");
    expect(calls[1]!.url).toContain("https://harvest.greenhouse.io/v3/users");
    expect(calls[1]!.headers.get("authorization")).toBe("Bearer hc-token");
    expect(calls[1]!.headers.get("authorization")).not.toMatch(/^Basic /);
  });
});

describe("Greenhouse healthcheck errors (HEALTH-P0)", () => {
  const responses = new URL("../fixtures/responses/", import.meta.url);
  const read = (name: string) => require("node:fs").readFileSync(new URL(name, responses), "utf8") as string;

  function harvest(status: number, body: string, headers: Record<string, string> = {}) {
    return (async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes("auth.greenhouse.io/token")) {
        return new Response(read("healthcheck-token-0.json"), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(body, { status, headers: { "content-type": "application/json", ...headers } });
    }) as unknown as typeof fetch;
  }

  beforeEach(() => clearGreenhouseTokenCache());

  it("live-shaped users page → source provider with data", async () => {
    const result = await healthcheck({ clientId: "cid", clientSecret: "csec", fetch: harvest(200, read("healthcheck-success-0.json")) });
    expect(result).toEqual({ status: "ok", source: "provider", data: JSON.parse(read("healthcheck-success-0.json")) });
  });

  it("401 from Harvest never returns provider", async () => {
    await expect(
      healthcheck({ clientId: "cid", clientSecret: "csec", fetch: harvest(401, read("healthcheck-401.json")) }),
    ).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  it("429 maps to CONNECTOR_RATE_LIMITED", async () => {
    await expect(
      healthcheck({ clientId: "cid", clientSecret: "csec", fetch: harvest(429, read("healthcheck-429.json"), { "retry-after": "9" }) }),
    ).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED" });
  });

  it("token mint failure (bad client secret) never returns provider", async () => {
    const impl = (async () =>
      new Response(JSON.stringify({ error: "invalid_client" }), { status: 401, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;
    await expect(healthcheck({ clientId: "cid", clientSecret: "bad", fetch: impl })).rejects.toBeDefined();
  });
});
