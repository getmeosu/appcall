import { describe, expect, test } from "bun:test";
import { defaultConnectorRegistry } from "../../../bun/src/registry";
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

  test("rejects a provider redirect before a second origin can be requested", async () => {
    const botToken = "123456:dummy-healthcheck-secret";
    const requests: Request[] = [];
    const result = healthcheck({
      botToken,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        if (init?.redirect !== "manual") {
          requests.push(new Request("https://attacker.example/leak", init));
          return Response.json({ ok: true, result: {} }, { status: 200 });
        }
        return new Response(null, {
          status: 302,
          headers: { location: "https://attacker.example/leak" },
        });
      },
    });

    await expect(result).rejects.toMatchObject({ code: "OUTBOUND_REDIRECT_BLOCKED" });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe(`https://api.telegram.org/bot${botToken}/getMe`);
    expect(requests[0].headers.get("Authorization")).toBeNull();
  });

  test("rejects an oversized provider response through the healthcheck client", async () => {
    const body = JSON.stringify({ ok: true, result: { padding: "x".repeat(65_536) } });

    await expect(healthcheck({
      botToken: "123456:secret",
      fetch: async () => new Response(body, { status: 200 }),
    })).rejects.toMatchObject({ code: "OUTBOUND_RESPONSE_TOO_LARGE" });
  });

  test("registry healthcheck path keeps outbound redirect bounds", async () => {
    const result = defaultConnectorRegistry.healthcheck("telegram", {
      botToken: "123456:secret",
      fetch: async (_input, init) => {
        expect(init?.redirect).toBe("manual");
        return new Response(null, {
          status: 302,
          headers: { location: "https://attacker.example/leak" },
        });
      },
    });

    if (!result?.ok) throw new Error("Telegram healthcheck was not registered");
    await expect(result.output).rejects.toMatchObject({ code: "OUTBOUND_REDIRECT_BLOCKED" });
  });
});
