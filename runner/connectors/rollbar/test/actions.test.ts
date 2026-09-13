import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
const { actions } = compileDeclarativeConnector(manifest);
const json = (body: unknown, status = 200, headers?: HeadersInit) => new Response(JSON.stringify(body), { status, headers });

describe("Rollbar curated connector", () => {
  test("sends token and calls all curated reads", async () => {
    const seen: Request[] = [];
    const fetch = async (i: RequestInfo | URL, x?: RequestInit) => { seen.push(new Request(i, x)); const p = new URL(seen.at(-1)!.url).pathname; if (p.endsWith("/environments")) return json({ result: { environments: [] } }); if (p.includes("/project/")) return json({ result: { id: 3 } }); if (p.endsWith("/items")) return json({ result: { items: [], page: 1 } }); return json({ result: { id: 8 } }); };
    await actions.healthcheck!({ apiKey: "secret", fetch }); await actions["projects.get"]!({ apiKey: "secret", projectId: 3, fetch }); await actions["items.list"]!({ apiKey: "secret", fetch }); await actions["items.get"]!({ apiKey: "secret", itemId: 8, fetch });
    expect(seen).toHaveLength(4); for (const r of seen) expect(r.headers.get("x-rollbar-access-token")).toBe("secret"); expect(new URL(seen[3]!.url).pathname).toBe("/api/1/item/8");
  });
  test("omits optional filters and safely handles invalid output, 401, and 429", async () => {
    const seen: Request[] = []; await actions["items.list"]!({ apiKey: "s", fetch: async (i, x) => { seen.push(new Request(i, x)); return json({ result: { items: [], page: 1 } }); } }); expect(new URL(seen[0]!.url).search).toBe("");
    await expect(actions["items.get"]!({ apiKey: "s", itemId: "8", fetch: async () => json({}) })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["items.list"]!({ apiKey: "s", fetch: async () => json({ result: { items: {} } }) })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions.healthcheck!({ apiKey: "secret", fetch: async () => json({ error: "secret" }, 401) })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(actions.healthcheck!({ apiKey: "secret", fetch: async () => json({ error: "secret" }, 429, { "Retry-After": "4" }) })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });
});
