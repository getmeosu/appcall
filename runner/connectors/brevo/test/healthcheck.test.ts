import { describe, expect, test } from "bun:test";
import { healthcheck } from "../src/healthcheck";

describe("brevo connector healthcheck", () => {
  test("no credential → static connector-owned status (validator path)", () => {
    expect(healthcheck()).toEqual({
      connector: "brevo",
      status: "ok",
      source: "connector",
    });
    expect(healthcheck({})).toEqual({
      connector: "brevo",
      status: "ok",
      source: "connector",
    });
  });

  test("valid apiKey → real provider call, 2xx → status ok source provider", async () => {
    const requests: Request[] = [];
    const result = await healthcheck({
      apiKey: "test-key",
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        const req = new Request(input, init);
        requests.push(req);
        return Response.json({ email: "owner@example.com" }, { status: 200 });
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.brevo.com/v3/account");
    expect(requests[0].method).toBe("GET");
    expect(requests[0].headers.get("api-key")).toBe("test-key");
    expect(result).toEqual({ connector: "brevo", status: "ok", source: "provider" });
  });

  test("apiKey rejected (401) → CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(
      healthcheck({
        apiKey: "bad-key",
        fetch: async () => Response.json({ message: "unauthorized" }, { status: 401 }),
      }) as Promise<unknown>,
    ).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("network failure → CONNECTOR_UNAVAILABLE", async () => {
    await expect(
      healthcheck({
        apiKey: "key",
        fetch: async () => {
          throw new Error("ECONNREFUSED");
        },
      }) as Promise<unknown>,
    ).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UNAVAILABLE" });
  });
});
