// SENA-ERR: an errored apollo people.match must not mark the lead enriched.
import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../config";
import { enrich } from "../stages";
import { Store, type Lead } from "../state";

const realFetch = globalThis.fetch;
const dirs: string[] = [];
afterEach(() => {
  globalThis.fetch = realFetch;
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function setup(responses: unknown[]): Store {
  const dir = mkdtempSync(join(tmpdir(), "sena-err-"));
  dirs.push(dir);
  const store = new Store(dir);
  const base: Lead = { lead_id: "1", full_name: "Jane Roe", title: "", company: "Acme", linkedin_url: "", email: "",
    apollo_id: "", stage: "sourced", channel: "dm", booking_url: "", last_request_id: "" };
  store.writeLeads(responses.map((_, i) => ({ ...base, lead_id: String(i + 1) })));
  let n = 0;
  globalThis.fetch = (async () => new Response(JSON.stringify(responses[n++]), { status: 200 })) as unknown as typeof fetch;
  return store;
}
const errorResult = { jsonrpc: "2.0", id: 1, result: { isError: true, structuredContent: { requestId: "req_err", code: "ACTION_RESPONSE_INVALID" } } };
const okResult = { jsonrpc: "2.0", id: 2, result: { structuredContent: { requestId: "req_ok", person: { id: "p1", email: "j@acme.com" } } } };

test("an errored people.match marks the lead enrich_failed with the code and reports it", async () => {
  const store = setup([errorResult, okResult]);
  const report = await enrich(loadConfig({}, []), store);
  const [failed, ok] = store.readLeads();
  expect(failed!.stage).not.toBe("enriched");
  expect(failed!.stage).toBe("enrich_failed");
  expect(failed!.error_code).toBe("ACTION_RESPONSE_INVALID");
  expect(failed!.last_request_id).toBe("req_err");
  expect(ok!.stage).toBe("enriched");
  expect(ok!.apollo_id).toBe("p1");
  expect(report).toEqual({ enriched: 1, failed: [{ lead_id: "1", error_code: "ACTION_RESPONSE_INVALID" }] });
  expect(store.readEvidence().map((e) => e.status)).toEqual(["error", "ok"]);
});

test("a failed lead is not retried as enriched on a re-run", async () => {
  const store = setup([errorResult]);
  await enrich(loadConfig({}, []), store);
  globalThis.fetch = (async () => new Response(JSON.stringify(okResult))) as unknown as typeof fetch;
  const again = await enrich(loadConfig({}, []), store);
  expect(again).toEqual({ enriched: 0, failed: [] });
  expect(store.readLeads()[0]!.stage).toBe("enrich_failed");
});
