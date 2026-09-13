import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest);
const json = (body: unknown, status = 200, headers?: HeadersInit) => new Response(JSON.stringify(body), { status, headers });

describe("Datadog curated connector", () => {
  test("sends both credentials and maps all curated reads", async () => {
    const seen: Request[] = [];
    const fetch = async (input: RequestInfo | URL, init?: RequestInit) => { seen.push(new Request(input, init)); const u = new URL(seen.at(-1)!.url); if (u.pathname.endsWith("/validate")) return json({ valid: true }); if (u.pathname.endsWith("/monitor")) return json([{ id: 7 }]); if (u.pathname.includes("/monitor/")) return json({ id: 7 }); return json({ metrics: ["cpu"] }); };
    await actions.healthcheck!({ apiKey: "api-secret", applicationKey: "app-secret", fetch });
    await actions["monitors.list"]!({ apiKey: "api-secret", applicationKey: "app-secret", fetch });
    await actions["monitors.get"]!({ apiKey: "api-secret", applicationKey: "app-secret", monitorId: 7, fetch });
    await actions["metrics.list"]!({ apiKey: "api-secret", applicationKey: "app-secret", from: 1, fetch });
    expect(seen).toHaveLength(4);
    for (const request of seen) { expect(request.headers.get("dd-api-key")).toBe("api-secret"); expect(request.headers.get("dd-application-key")).toBe("app-secret"); }
    expect(new URL(seen[2]!.url).pathname).toBe("/api/v1/monitor/7");
  });
  test("omits absent filters, rejects bad IDs/output, maps 401 and 429 safely", async () => {
    const seen: Request[] = [];
    await actions["metrics.list"]!({ apiKey: "a", applicationKey: "b", from: 1, fetch: async (i, x) => { seen.push(new Request(i, x)); return json({ metrics: ["x"] }); } });
    expect(new URL(seen[0]!.url).search).toBe("?from=1");
    await expect(actions["monitors.get"]!({ apiKey: "a", applicationKey: "b", monitorId: "7", fetch: async () => json({}) })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["metrics.list"]!({ apiKey: "a", applicationKey: "b", from: 1, fetch: async () => json({ metrics: {} }) })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions.healthcheck!({ apiKey: "secret", applicationKey: "app", fetch: async () => json({ error: "secret" }, 401) })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(actions.healthcheck!({ apiKey: "secret", applicationKey: "app", fetch: async () => json({ error: "secret" }, 429, { "Retry-After": "9" }) })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 9 });
  });
});
