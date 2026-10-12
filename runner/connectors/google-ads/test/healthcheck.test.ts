import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { healthcheck } from "../src/healthcheck";

// HEALTH-1: live-shaped provider fixtures (documented response bodies).
const responses = new URL("../fixtures/responses/", import.meta.url);
const fixture = (name: string) => readFileSync(new URL(name, responses), "utf8");
const auth = { accessToken: "fixture-token" };

function stub(body: string, status = 200, headers: Record<string, string> = {}) {
  const calls: Request[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push(new Request(input as string, init));
    return new Response(body, { status, headers: { "content-type": "application/json", ...headers } });
  }) as typeof fetch;
  return { calls, impl };
}

describe("Google Ads healthcheck (HEALTH-1)", () => {
  test("no token → static connector source, no request, no connector key", async () => {
    const { calls, impl } = stub(fixture("healthcheck-accessible-customers.json"));
    expect(await healthcheck({ fetch: impl })).toEqual({ status: "ok", source: "connector" });
    expect(await healthcheck()).toEqual({ status: "ok", source: "connector" });
    expect(calls).toHaveLength(0);
  });

  test("live-shaped success → source provider after one authenticated GET", async () => {
    const { calls, impl } = stub(fixture("healthcheck-accessible-customers.json"));
    expect(await healthcheck({ ...auth, fetch: impl })).toEqual({ status: "ok", source: "provider" });
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toBe("https://googleads.googleapis.com/v25/customers:listAccessibleCustomers");
    expect(calls[0].headers.get("authorization")).toBe("Bearer fixture-token");
    expect(calls[0].headers.has("developer-token")).toBe(false);
  });

  test("401 is a credential rejection, never a pass", async () => {
    const { impl } = stub(fixture("healthcheck-401.json"), 401);
    await expect(healthcheck({ ...auth, fetch: impl })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
      message: expect.stringContaining("rejected the credentials"),
    });
  });

  test("403 is a credential rejection", async () => {
    const { impl } = stub(fixture("healthcheck-403.json"), 403);
    await expect(healthcheck({ ...auth, fetch: impl })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
      message: expect.stringContaining("rejected the credentials"),
    });
  });

  test("429 maps to CONNECTOR_RATE_LIMITED with Retry-After", async () => {
    const { impl } = stub(fixture("healthcheck-429.json"), 429, { "retry-after": "12" });
    await expect(healthcheck({ ...auth, fetch: impl })).rejects.toMatchObject({
      code: "CONNECTOR_RATE_LIMITED",
      retryAfterSeconds: 12,
    });
  });

  test("500 maps to CONNECTOR_UPSTREAM_ERROR", async () => {
    const { impl } = stub('{"error":{"code":500,"message":"Internal error encountered.","status":"INTERNAL"}}', 500);
    await expect(healthcheck({ ...auth, fetch: impl })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("non-JSON body is CONNECTOR_RESPONSE_INVALID", async () => {
    const { impl } = stub("<html>oops</html>");
    await expect(healthcheck({ ...auth, fetch: impl })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
  });

  test("a 2xx without provider evidence is not a pass", async () => {
    for (const bad of [{ resourceNames: ["accounts/1"] }, { resourceNames: "customers/1" }, [], "ok"]) {
      const { impl } = stub(JSON.stringify(bad));
      await expect(healthcheck({ ...auth, fetch: impl })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    }
  });

  test("transport failure maps to CONNECTOR_UNAVAILABLE", async () => {
    const impl = (async () => {
      throw new TypeError("network down");
    }) as unknown as typeof fetch;
    await expect(healthcheck({ ...auth, fetch: impl })).rejects.toMatchObject({ code: "CONNECTOR_UNAVAILABLE" });
  });

  test("no accessible customers ({} per proto3) is still a provider pass", async () => {
    const { impl } = stub("{}");
    expect(await healthcheck({ ...auth, fetch: impl })).toEqual({ status: "ok", source: "provider" });
  });

  test("optional developerToken is sent only when non-empty", async () => {
    const { calls, impl } = stub(fixture("healthcheck-accessible-customers.json"));
    await healthcheck({ ...auth, developerToken: "dev-tok", fetch: impl });
    await healthcheck({ ...auth, developerToken: "  ", fetch: impl });
    expect(calls[0].headers.get("developer-token")).toBe("dev-tok");
    expect(calls[1].headers.has("developer-token")).toBe(false);
  });
});
