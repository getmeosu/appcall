import { describe, expect, it } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
const { actions } = compileDeclarativeConnector(manifest as never);
const credential = { bundleAlias: "acme", apiKey: "sales-secret" };
const response = (body: unknown, status = 200, headers: Record<string,string> = {}) => new Response(JSON.stringify(body), { status, headers });
describe("freshsales declarative actions", () => {
  it("executes every read operation with Token authorization", async () => {
    const cases = [["healthcheck", {}, "/contacts"], ["contacts.filters.list", {}, "/contacts/filters"], ["contacts.list", { page: 2 }, "/contacts"], ["contacts.get", { contactId: 7 }, "/contacts/7"]] as const;
    for (const [op, input, suffix] of cases) { const result = await actions[op]!({ ...credential, ...input, fetch: async (url: string, init?: RequestInit) => { expect(url).toContain(suffix); expect(new Headers(init?.headers).get("authorization")).toBe("Token token=sales-secret"); return response({ contacts: [], filters: [], sales_accounts: [], deals: [] }); } }); expect(result).toBeDefined(); }
  });
  it("rejects missing IDs before fetch", async () => { let called = false; await expect(actions["contacts.get"]!({ ...credential, fetch: async () => { called = true; return response({}); } })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" }); expect(called).toBe(false); });
  it("reports 401 and 429 retry metadata safely", async () => { await expect(actions.healthcheck!({ ...credential, fetch: async () => response({ message: "bad sales-secret" }, 401) })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR", message: expect.not.stringContaining("sales-secret") }); await expect(actions.healthcheck!({ ...credential, fetch: async () => response({ error: "slow" }, 429, { "retry-after": "9" }) })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 9 }); });
});
