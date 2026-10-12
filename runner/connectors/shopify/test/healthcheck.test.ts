import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { healthcheck } from "../src/healthcheck";

// HEALTH-1: live-shaped provider fixtures (documented response bodies).
const responses = new URL("../fixtures/responses/", import.meta.url);
const fixture = (name: string) => readFileSync(new URL(name, responses), "utf8");
const auth = { accessToken: "fixture-token", shopDomain: "jsmith" };

function stub(body: string, status = 200, headers: Record<string, string> = {}) {
  const calls: Request[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push(new Request(input as string, init));
    return new Response(body, { status, headers: { "content-type": "application/json", ...headers } });
  }) as typeof fetch;
  return { calls, impl };
}

describe("Shopify healthcheck (HEALTH-1)", () => {
  test("no token → static connector source, no request, no connector key", async () => {
    const { calls, impl } = stub(fixture("healthcheck-shop.json"));
    expect(await healthcheck({ fetch: impl })).toEqual({ status: "ok", source: "connector" });
    expect(await healthcheck()).toEqual({ status: "ok", source: "connector" });
    expect(calls).toHaveLength(0);
  });

  test("live-shaped success → source provider after one authenticated GET", async () => {
    const { calls, impl } = stub(fixture("healthcheck-shop.json"));
    expect(await healthcheck({ ...auth, fetch: impl })).toEqual({ status: "ok", source: "provider" });
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toBe("https://jsmith.myshopify.com/admin/api/2026-10/shop.json");
    expect(calls[0].headers.get("x-shopify-access-token")).toBe("fixture-token");
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
    const { impl } = stub('{"errors":"Internal Server Error"}', 500);
    await expect(healthcheck({ ...auth, fetch: impl })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("non-JSON body is CONNECTOR_RESPONSE_INVALID", async () => {
    const { impl } = stub("<html>oops</html>");
    await expect(healthcheck({ ...auth, fetch: impl })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
  });

  test("a 2xx without provider evidence is not a pass", async () => {
    for (const bad of [{ shop: { id: 1, myshopify_domain: "other.myshopify.com" } }, { shop: { myshopify_domain: "jsmith.myshopify.com" } }, { errors: "x" }, []]) {
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

  test("full https myshopify URL in shopDomain is normalized", async () => {
    const { calls, impl } = stub(fixture("healthcheck-shop.json"));
    expect(await healthcheck({ accessToken: "t", shopDomain: "https://JSmith.myshopify.com/", fetch: impl })).toEqual({ status: "ok", source: "provider" });
    expect(new URL(calls[0].url).host).toBe("jsmith.myshopify.com");
  });

  test("token without a valid shopDomain fails before any request", async () => {
    const { calls, impl } = stub(fixture("healthcheck-shop.json"));
    await expect(healthcheck({ accessToken: "t", fetch: impl })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(healthcheck({ accessToken: "t", shopDomain: "evil.com/x", fetch: impl })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(healthcheck({ accessToken: "t", shopDomain: "a.b", fetch: impl })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    expect(calls).toHaveLength(0);
  });
});
