// SENA-ERR-2: failed booking / send / source calls are not swallowed.
import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../config";
import { booking, runFailures, send, source } from "../stages";
import { Store, type Lead } from "../state";

const realFetch = globalThis.fetch;
const dirs: string[] = [];
afterEach(() => {
  globalThis.fetch = realFetch;
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const base: Lead = { lead_id: "1", full_name: "Jane Roe", title: "", company: "Acme", linkedin_url: "", email: "",
  apollo_id: "", stage: "enriched", channel: "dm", booking_url: "", last_request_id: "" };

function setup(leads: Lead[], responses: unknown[]): Store {
  const dir = mkdtempSync(join(tmpdir(), "sena-err2-"));
  dirs.push(dir);
  const store = new Store(dir);
  store.writeLeads(leads);
  let n = 0;
  globalThis.fetch = (async () => new Response(JSON.stringify(responses[n++]), { status: 200 })) as unknown as typeof fetch;
  return store;
}
const cfg = (env: Record<string, string> = {}) => loadConfig({ CALENDLY_TOKEN: "t", CALENDLY_EVENT_TYPE: "et", ...env }, []);
const mcpError = (code: string) => ({ jsonrpc: "2.0", id: 1, result: { isError: true, structuredContent: { requestId: "req_err", code } } });
const mcpOk = (content: unknown) => ({ jsonrpc: "2.0", id: 1, result: { structuredContent: { requestId: "req_ok", ...(content as object) } } });

test("booking: a failed scheduling_links.create marks booking_failed, not booking_ready", async () => {
  const store = setup([base, { ...base, lead_id: "2" }, { ...base, lead_id: "3" }], [
    { requestId: "r1", error: { code: "CONNECTOR_UPSTREAM_ERROR" } },
    { requestId: "r2", output: {} },
    { requestId: "r3", output: { resource: { booking_url: "https://cal/x" } } },
  ]);
  const report = await booking(cfg(), store, { calendly: "cal1" });
  const [failed, empty, ok] = store.readLeads();
  expect(failed).toMatchObject({ stage: "booking_failed", error_code: "CONNECTOR_UPSTREAM_ERROR", booking_url: "", last_request_id: "r1" });
  expect(empty).toMatchObject({ stage: "booking_failed", error_code: "BOOKING_URL_MISSING" });
  expect(ok).toMatchObject({ stage: "booking_ready", booking_url: "https://cal/x" });
  expect(report).toEqual({ ok: 1, failed: [{ lead_id: "1", error_code: "CONNECTOR_UPSTREAM_ERROR" }, { lead_id: "2", error_code: "BOOKING_URL_MISSING" }] });
  // Later stages skip the failed leads.
  globalThis.fetch = (async () => new Response(JSON.stringify(mcpOk({})))) as unknown as typeof fetch;
  const sent = await send(cfg({ SEND_MODE: "live_single", TEST_RECIPIENT_PROFILE: "https://li/test" }), store, { unipile: "u1" });
  expect(sent.ok).toBe(0);
  expect(store.readLeads().map((l) => l.stage)).toEqual(["booking_failed", "booking_failed", "booking_ready"]);
});

test("send: a failed brevo or unipile send marks send_failed, not sent", async () => {
  const ready = { ...base, stage: "booking_ready", booking_url: "https://cal/x" };
  const store = setup([
    { ...ready, email: "a@acme.com", channel: "email" },
    { ...ready, lead_id: "2", linkedin_url: "https://li/jane" },
    { ...ready, lead_id: "3", email: "c@acme.com", channel: "email" },
  ], [mcpError("CONNECTOR_RATE_LIMITED"), mcpError("ACTION_RESPONSE_INVALID"), mcpOk({})]);
  const report = await send(cfg({ SEND_MODE: "live_single", TEST_RECIPIENT_EMAIL: "t@test.dev", TEST_RECIPIENT_PROFILE: "https://li/test" }), store, { unipile: "u1" });
  const leads = store.readLeads();
  expect(leads.map((l) => [l.stage, l.error_code ?? ""])).toEqual([
    ["send_failed", "CONNECTOR_RATE_LIMITED"],
    ["send_failed", "ACTION_RESPONSE_INVALID"],
    ["sent", ""],
  ]);
  expect(report).toEqual({ ok: 1, failed: [{ lead_id: "1", error_code: "CONNECTOR_RATE_LIMITED" }, { lead_id: "2", error_code: "ACTION_RESPONSE_INVALID" }] });
});

test("source: a failed apify run leaves leads.csv untouched and reports the failure", async () => {
  const store = setup([{ ...base, stage: "sent" }], [mcpError("CONNECTOR_UNAVAILABLE")]);
  const before = readFileSync(join(dirs[0]!, "leads.csv"), "utf8");
  const report = await source(cfg(), store, "actor", {});
  expect(readFileSync(join(dirs[0]!, "leads.csv"), "utf8")).toBe(before);
  expect(report.failed).toEqual([{ lead_id: "", error_code: "CONNECTOR_UNAVAILABLE" }]);
  expect(report.leads).toHaveLength(1);
});

test("runFailures names every failed stage so the run exits 1", () => {
  expect(runFailures({ source: [], enrich: [], booking: [], send: [] })).toBe("");
  expect(runFailures({ source: [{ lead_id: "", error_code: "X" }], send: [{ lead_id: "2", error_code: "Y" }] }))
    .toBe("source failed for 1: -=X; send failed for 1: 2=Y");
});
