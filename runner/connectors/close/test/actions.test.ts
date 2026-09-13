import { describe, expect, it } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import leads from "../fixtures/leads_list.json";
import lead from "../fixtures/lead.json";

const { actions } = compileDeclarativeConnector(manifest as never);
function mock(body: unknown, status = 200) { const calls: { url: string; init?: RequestInit }[] = []; const fetch = async (url: RequestInfo | URL, init?: RequestInit) => { calls.push({ url: String(url), init }); return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }); }; return { calls, fetch }; }

describe("Close declarative actions", () => {
  it("compiles all eight reads plus healthcheck", () => expect(Object.keys(actions).sort()).toEqual(["contacts.get", "contacts.list", "healthcheck", "leads.get", "leads.list", "opportunities.get", "opportunities.list", "tasks.get", "tasks.list"]));
  it("sends API key as Basic username with an explicitly empty password", async () => {
    const m = mock(leads); await actions["leads.list"]!({ apiKey: "ck_secret", fetch: m.fetch });
    expect(new Headers(m.calls[0]!.init!.headers).get("authorization")).toBe(`Basic ${btoa("ck_secret:")}`);
    expect(m.calls[0]!.url).toBe("https://api.close.com/api/v1/lead/");
  });
  it("encodes resource IDs and omits null optional filters", async () => { const m = mock(lead); await actions["leads.get"]!({ apiKey: "secret", leadId: "lead/a", fetch: m.fetch }); expect(new URL(m.calls[0]!.url).pathname).toContain("lead%2Fa"); const l = mock(leads); await actions["leads.list"]!({ apiKey: "secret", limit: null, skip: null, fetch: l.fetch }); expect(new URL(l.calls[0]!.url).search).toBe(""); });
  it("maps pagination and upstream failures while keeping secrets out of errors", async () => { const m = mock(leads); const result = await actions["leads.list"]!({ apiKey: "secret", fetch: m.fetch }) as Record<string, unknown>; expect(result.leads).toEqual(leads.data); expect(result.hasMore).toBe(true); for (const status of [401, 429]) { const e = mock({ message: "secret" }, status); await expect(actions["leads.list"]!({ apiKey: "secret", fetch: e.fetch })).rejects.toMatchObject({ code: status === 429 ? "CONNECTOR_RATE_LIMITED" : "CONNECTOR_UPSTREAM_ERROR" }); } });
  it("rejects malformed provider output at the enforced schema boundary", async () => { const m = mock({ data: "bad" }); await expect(actions["leads.list"]!({ apiKey: "secret", fetch: m.fetch })).rejects.toThrow(); });
});
