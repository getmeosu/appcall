import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { healthcheck } from "../src/healthcheck";

const responses = new URL("../fixtures/responses/", import.meta.url);
const fixture = (name: string) => readFileSync(new URL(name, responses), "utf8");
const auth = { account: "acme", accessToken: "fixture-token" };

function stub(body: string, status = 200, headers: Record<string, string> = {}) {
  const calls: Request[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push(new Request(input as string, init));
    return new Response(body, { status, headers: { "content-type": "application/json", ...headers } });
  }) as typeof fetch;
  return { calls, impl };
}

describe("Workable healthcheck (HEALTH-P0)", () => {
  test("live-shaped stages list → source provider after one authenticated GET", async () => {
    const { calls, impl } = stub(fixture("healthcheck-stages.json"));
    const result = await healthcheck({ ...auth, fetch: impl });
    expect(result).toEqual({ status: "ok", source: "provider" });
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toBe("https://acme.workable.com/spi/v3/stages");
    expect(calls[0].headers.get("authorization")).toBe("Bearer fixture-token");
  });

  test("401 is a credential rejection, never a pass", async () => {
    const { impl } = stub(fixture("healthcheck-401.json"), 401);
    await expect(healthcheck({ ...auth, fetch: impl })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
      message: expect.stringContaining("rejected the credentials (HTTP 401)"),
    });
  });

  test("403 is a credential rejection", async () => {
    const { impl } = stub(fixture("healthcheck-401.json"), 403);
    await expect(healthcheck({ ...auth, fetch: impl })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
      message: expect.stringContaining("HTTP 403"),
    });
  });

  test("429 maps to CONNECTOR_RATE_LIMITED with Retry-After", async () => {
    const { impl } = stub(fixture("healthcheck-429.json"), 429, { "retry-after": "12" });
    await expect(healthcheck({ ...auth, fetch: impl })).rejects.toMatchObject({
      code: "CONNECTOR_RATE_LIMITED",
      retryAfterSeconds: 12,
    });
  });

  test("other upstream errors map to CONNECTOR_UPSTREAM_ERROR", async () => {
    const { impl } = stub("{}", 500);
    await expect(healthcheck({ ...auth, fetch: impl })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("a 2xx without a stages list is not provider evidence", async () => {
    const { impl } = stub(JSON.stringify({ ok: true }));
    await expect(healthcheck({ ...auth, fetch: impl })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
  });

  test("transport failure maps to CONNECTOR_UNAVAILABLE", async () => {
    const impl = (async () => {
      throw new TypeError("network down");
    }) as unknown as typeof fetch;
    await expect(healthcheck({ ...auth, fetch: impl })).rejects.toMatchObject({ code: "CONNECTOR_UNAVAILABLE" });
  });

  test("token without a valid account fails before any request", async () => {
    const { calls, impl } = stub(fixture("healthcheck-stages.json"));
    await expect(healthcheck({ accessToken: "t", account: "../x", fetch: impl })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
    expect(calls).toHaveLength(0);
  });
});
