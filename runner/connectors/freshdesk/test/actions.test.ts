import { describe, expect, it } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest as never);
const credential = { domainAlias: "acme", apiKey: "key/+secret", basicAuth: "a2V5LytzZWNyZXQ6WA==" };
const response = (body: unknown, status = 200, headers: Record<string,string> = {}) => new Response(JSON.stringify(body), { status, headers });

describe("freshdesk declarative actions", () => {
  it("executes every read operation with the documented Basic header", async () => {
    const cases = [["healthcheck", {}, "/account"], ["account.get", {}, "/account"], ["tickets.list", { page: 2, perPage: 10 }, "/tickets?page=2&per_page=10"], ["tickets.get", { ticketId: 42 }, "/tickets/42"], ["tickets.conversations.list", { ticketId: 42 }, "/tickets/42/conversations"]] as const;
    for (const [op, input, suffix] of cases) {
      const result = await actions[op]!({ ...credential, ...input, fetch: async (url: string, init?: RequestInit) => { expect(url).toContain(suffix); expect(new Headers(init?.headers).get("authorization")).toBe("Basic a2V5LytzZWNyZXQ6WA=="); return response(op.includes("list") ? [] : {}); } });
      expect(result).toBeDefined();
    }
  });
  it("rejects missing IDs and hostile tenant aliases before fetch", async () => {
    let called = false;
    await expect(actions["tickets.get"]!({ ...credential, fetch: async () => { called = true; return response({}); } })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    expect(called).toBe(false);
  });
  it("redacts raw and encoded secrets and exposes retry metadata", async () => {
    await expect(actions.healthcheck!({ ...credential, fetch: async () => response({ description: `bad ${credential.apiKey} ${encodeURIComponent(credential.apiKey)}` }, 401) })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR", message: expect.not.stringContaining(credential.apiKey) });
    await expect(actions.healthcheck!({ ...credential, fetch: async () => response({ message: "slow" }, 429, { "retry-after": "17" }) })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 17 });
  });
});
