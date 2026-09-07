import { describe, expect, test } from "bun:test";
import { healthcheck } from "../src/healthcheck";

describe("telegram connector healthcheck", () => {
  test("no credential → static connector-owned status (validator path)", () => {
    expect(healthcheck()).toEqual({
      connector: "telegram",
      status: "ok",
      source: "connector",
    });
  });

  test("valid botToken → real getMe call, ok:true → status ok source provider", async () => {
    const requests: Request[] = [];
    const result = await healthcheck({
      botToken: "123456:secret",
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        const req = new Request(input, init);
        requests.push(req);
        return Response.json({ ok: true, result: { id: 42, is_bot: true, first_name: "Bot" } }, { status: 200 });
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.telegram.org/bot123456:secret/getMe");
    expect(requests[0].method).toBe("GET");
    expect(result).toEqual({ connector: "telegram", status: "ok", source: "provider" });
  });

  test("invalid token (401 / ok:false) → CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(
      healthcheck({
        botToken: "bad-token",
        fetch: async () => Response.json({ ok: false, error_code: 401, description: "Unauthorized" }, { status: 401 }),
      }) as Promise<unknown>,
    ).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("network failure → CONNECTOR_UNAVAILABLE", async () => {
    await expect(
      healthcheck({
        botToken: "token",
        fetch: async () => {
          throw new Error("ECONNREFUSED");
        },
      }) as Promise<unknown>,
    ).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UNAVAILABLE" });
  });
});
