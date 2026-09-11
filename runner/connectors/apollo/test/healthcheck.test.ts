import { describe, expect, test } from "bun:test";
import { runExecution } from "../../../bun/src/execution";
import { ConnectorHttpError } from "../../../bun/src/http";
import { defaultConnectorRegistry } from "../../../bun/src/registry";
import { healthcheck } from "../src/healthcheck";

describe("apollo connector healthcheck", () => {
  test("returns connector-owned healthy status without a credential", () => {
    expect(healthcheck()).toEqual({
      connector: "apollo",
      status: "ok",
      source: "connector",
    });
  });

  test("calls GET /api/v1/auth/health with the X-Api-Key header", async () => {
    const requests: Request[] = [];
    await healthcheck({
      apiKey: "good_key",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify({ healthy: true, is_logged_in: true }), { status: 200 });
      },
    });
    expect(requests[0].method).toBe("GET");
    const url = new URL(requests[0].url);
    expect(url.pathname).toBe("/api/v1/auth/health");
    expect(requests[0].headers.get("X-Api-Key")).toBe("good_key");
  });

  test("returns provider-confirmed status when Apollo reports is_logged_in", async () => {
    const result = await healthcheck({
      apiKey: "good_key",
      fetch: async () => new Response(JSON.stringify({ healthy: true, is_logged_in: true }), { status: 200 }),
    });
    expect(result).toEqual({ connector: "apollo", status: "ok", source: "provider" });
  });

  test("throws when Apollo returns HTTP 200 but is_logged_in is false (invalid key)", async () => {
    await expect(healthcheck({
      apiKey: "bad_key",
      fetch: async () => new Response(JSON.stringify({ healthy: true, is_logged_in: false }), { status: 200 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("throws when Apollo returns a non-2xx status", async () => {
    await expect(healthcheck({
      apiKey: "bad_key",
      fetch: async () => new Response("Invalid access credentials.", { status: 401 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("preserves the shared outbound timeout code", async () => {
    await expect(healthcheck({
      apiKey: "good_key",
      fetch: async () => {
        throw new ConnectorHttpError(
          "OUTBOUND_TIMEOUT",
          "Outbound request exceeded the connector HTTP timeout.",
        );
      },
    })).rejects.toMatchObject({
      name: "ConnectorHttpError",
      code: "OUTBOUND_TIMEOUT",
      message: "Outbound request exceeded the connector HTTP timeout.",
    });
  });

  test("rejects a provider redirect before the API key can cross origins", async () => {
    const apiKey = "dummy-healthcheck-secret";
    const requests: Request[] = [];
    const result = healthcheck({
      apiKey,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        if (init?.redirect !== "manual") {
          requests.push(new Request("https://attacker.example/leak", init));
          return Response.json({ is_logged_in: true }, { status: 200 });
        }
        return new Response(null, {
          status: 302,
          headers: { location: "https://attacker.example/leak" },
        });
      },
    });

    await expect(result).rejects.toMatchObject({ code: "OUTBOUND_REDIRECT_BLOCKED" });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.apollo.io/api/v1/auth/health");
    expect(requests[0].headers.get("X-Api-Key")).toBe(apiKey);
  });

  test("rejects an oversized provider response through the healthcheck client", async () => {
    const body = JSON.stringify({ is_logged_in: true, padding: "x".repeat(65_536) });

    await expect(healthcheck({
      apiKey: "good_key",
      fetch: async () => new Response(body, { status: 200 }),
    })).rejects.toMatchObject({ code: "OUTBOUND_RESPONSE_TOO_LARGE" });
  });

  test("registry healthcheck path keeps outbound response bounds", async () => {
    const body = JSON.stringify({ is_logged_in: true, padding: "x".repeat(65_536) });
    const result = defaultConnectorRegistry.healthcheck("apollo", {
      apiKey: "good_key",
      fetch: async () => new Response(body, { status: 200 }),
    });

    if (!result?.ok) throw new Error("Apollo healthcheck was not registered");
    await expect(result.output).rejects.toMatchObject({ code: "OUTBOUND_RESPONSE_TOO_LARGE" });
  });

  test("registry healthcheck path cancels the provider request", async () => {
    const caller = new AbortController();
    let observedSignal: AbortSignal | undefined;
    let aborted = false;
    const pending = runExecution(() => {
      const result = defaultConnectorRegistry.healthcheck("apollo", {
        apiKey: "good_key",
        fetch: async (_input, init) => {
          observedSignal = (init as RequestInit).signal ?? undefined;
          return await new Promise<Response>((_resolve, reject) => {
            observedSignal?.addEventListener("abort", () => {
              aborted = true;
              reject(observedSignal?.reason);
            }, { once: true });
          });
        },
      });
      if (!result?.ok) throw new Error("Apollo healthcheck was not registered");
      return result.output;
    }, 5_000, caller.signal);

    caller.abort();
    await expect(pending).rejects.toMatchObject({ code: "OPERATION_TIMEOUT" });
    expect(aborted).toBe(true);
    expect(observedSignal?.aborted).toBe(true);
  });
});
