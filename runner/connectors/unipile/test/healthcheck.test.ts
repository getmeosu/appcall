import { describe, expect, test } from "bun:test";
import { healthcheck } from "../src/healthcheck";

const DSN = "https://api8.unipile.com:13851";

describe("unipile connector healthcheck", () => {
  test("returns connector-owned status without credentials", () => {
    expect(healthcheck()).toEqual({ connector: "unipile", status: "ok", source: "connector" });
  });

  test("returns connector-owned status when the dsn is missing", () => {
    expect(healthcheck({ apiKey: "k" })).toEqual({ connector: "unipile", status: "ok", source: "connector" });
  });

  test("calls GET /api/v1/accounts with the X-API-KEY header against the DSN", async () => {
    const requests: Request[] = [];
    await healthcheck({
      apiKey: "good",
      dsn: DSN,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify({ items: [] }), { status: 200 });
      },
    });
    expect(requests[0].method).toBe("GET");
    const url = new URL(requests[0].url);
    expect(url.host).toBe("api8.unipile.com:13851");
    expect(url.pathname).toBe("/api/v1/accounts");
    expect(requests[0].headers.get("X-API-KEY")).toBe("good");
  });

  test("returns provider-confirmed status when Unipile accepts the credentials", async () => {
    const result = await healthcheck({
      apiKey: "good",
      dsn: DSN,
      fetch: async () => new Response(JSON.stringify({ items: [] }), { status: 200 }),
    });
    expect(result).toEqual({ connector: "unipile", status: "ok", source: "provider" });
  });

  test("throws a structured error when Unipile rejects the credentials (401)", async () => {
    await expect(
      healthcheck({ apiKey: "bad", dsn: DSN, fetch: async () => new Response("unauthorized", { status: 401 }) }),
    ).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("throws CONNECTOR_UNAVAILABLE when the DSN is unreachable", async () => {
    await expect(
      healthcheck({ apiKey: "good", dsn: DSN, fetch: async () => { throw new Error("network down"); } }),
    ).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UNAVAILABLE" });
  });
});
