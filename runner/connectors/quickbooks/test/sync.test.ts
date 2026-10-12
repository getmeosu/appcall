import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import invoicePage1 from "../fixtures/sync/invoice_query_page1.json";
import invoicePage2 from "../fixtures/sync/invoice_query_page2.json";
import customerEmpty from "../fixtures/sync/customer_query_empty.json";
import customerPage from "../fixtures/sync/customer_query_page.json";
import paymentPage from "../fixtures/sync/payment_query_page.json";
import auth401 from "../fixtures/sync/auth_401.json";
import { defaultConnectorRegistry } from "../../../bun/src/registry";
import { compileStrictValidator } from "../../../bun/src/declarative/strict-schema";
import {
  QBO_MINOR_VERSION,
  buildQuery,
  executeCustomersListSync,
  executeInvoicesListSync,
  executePaymentsListSync,
} from "../src/sync";

type Call = { url: URL; method: string; headers: Record<string, string> };

function fakeFetch(responses: Array<{ status: number; body: unknown }>) {
  const calls: Call[] = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((v, k) => { headers[k] = v; });
    calls.push({ url: new URL(String(url)), method: init?.method ?? "GET", headers });
    const next = responses.shift();
    if (!next) throw new Error("unexpected extra request");
    return new Response(JSON.stringify(next.body), { status: next.status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { calls, impl };
}

const ops = manifest.operations as Record<string, Record<string, unknown>>;
const SYNCS = ["invoices.list", "customers.list", "payments.list"] as const;
const base = { accessToken: "token", realmId: "9130350000000001" };

describe("QB-SYNC-1 manifest contract", () => {
  for (const key of SYNCS) {
    test(`${key} is a read sync with declared inputs, an output schema, and no effect keys`, () => {
      const op = ops[key]!;
      expect(op.kind).toBe("sync");
      expect(op.sideEffect).toBe("read");
      for (const k of ["effectPolicy", "reconcile", "observe"]) expect(op[k]).toBeUndefined();
      const props = Object.keys((op.inputSchema as { properties: Record<string, unknown> }).properties).sort();
      expect(props).toEqual(["cursor", "maxPages", "pageSize", "realmId", "since"]);
      expect(props).not.toContain("response");
      expect(op.outputSchema).toBeDefined();
    });
  }

  test("sync source never reads an undeclared response input", async () => {
    const src = await Bun.file(new URL("../src/sync.ts", import.meta.url)).text();
    expect(src).not.toMatch(/input\.response/);
  });
});

describe("QB-SYNC-1 wire", () => {
  test("invoices.list pages with STARTPOSITION/MAXRESULTS until a short page, pinned minorversion", async () => {
    const { calls, impl } = fakeFetch([{ status: 200, body: invoicePage1 }, { status: 200, body: invoicePage2 }]);
    const out = await executeInvoicesListSync({ ...base, pageSize: 2, fetch: impl });
    expect(calls).toHaveLength(2);
    for (const c of calls) {
      expect(c.method).toBe("GET");
      expect(c.url.origin + c.url.pathname).toBe("https://quickbooks.api.intuit.com/v3/company/9130350000000001/query");
      expect(c.url.searchParams.get("minorversion")).toBe(QBO_MINOR_VERSION);
      expect(c.headers.authorization).toBe("Bearer token");
      expect(c.headers.accept).toBe("application/json");
    }
    expect(calls[0]!.url.searchParams.get("query")).toBe("SELECT * FROM Invoice ORDERBY MetaData.LastUpdatedTime STARTPOSITION 1 MAXRESULTS 2");
    expect(calls[1]!.url.searchParams.get("query")).toBe("SELECT * FROM Invoice ORDERBY MetaData.LastUpdatedTime STARTPOSITION 3 MAXRESULTS 2");
    expect(out.items.map((i) => i.id)).toEqual(["qb-inv:130", "qb-inv:131", "qb-inv:132"]);
    expect(out.items[0]!.customerName).toBe("Cool Cars");
    expect(out.items[0]!.totalAmt).toBe(362.07);
    expect(out.hasMore).toBe(false);
    expect(out.nextCursor).toBeNull();
    expect(out.highWatermark).toBe("2026-09-04T08:00:00-07:00");
    expect(out.totalCount).toBe(3);
    expect(QBO_MINOR_VERSION).toBe("75");
  });

  test("maxPages stops early and the cursor resumes at the next STARTPOSITION with the since filter", async () => {
    const first = fakeFetch([{ status: 200, body: invoicePage1 }]);
    const page = await executeInvoicesListSync({ ...base, pageSize: 2, maxPages: 1, since: "2026-09-01T00:00:00Z", fetch: first.impl });
    expect(first.calls[0]!.url.searchParams.get("query")).toBe("SELECT * FROM Invoice WHERE MetaData.LastUpdatedTime >= '2026-09-01T00:00:00Z' ORDERBY MetaData.LastUpdatedTime STARTPOSITION 1 MAXRESULTS 2");
    expect(page.hasMore).toBe(true);
    expect(typeof page.nextCursor).toBe("string");
    expect(page.highWatermark).toBe("2026-09-03T14:20:05-07:00");

    const second = fakeFetch([{ status: 200, body: invoicePage2 }]);
    const rest = await executeInvoicesListSync({ ...base, pageSize: 2, cursor: page.nextCursor!, since: "1999-01-01", fetch: second.impl });
    expect(second.calls[0]!.url.searchParams.get("query")).toBe("SELECT * FROM Invoice WHERE MetaData.LastUpdatedTime >= '2026-09-01T00:00:00Z' ORDERBY MetaData.LastUpdatedTime STARTPOSITION 3 MAXRESULTS 2");
    expect(rest.items.map((i) => i.id)).toEqual(["qb-inv:132"]);
    expect(rest.startIndex).toBe(3);
    expect(rest.nextCursor).toBeNull();
    expect(rest.highWatermark).toBe("2026-09-04T08:00:00-07:00");
  });

  test("customers.list empty QueryResponse is done with no items", async () => {
    const { calls, impl } = fakeFetch([{ status: 200, body: customerEmpty }]);
    const out = await executeCustomersListSync({ ...base, fetch: impl });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url.searchParams.get("query")).toBe("SELECT * FROM Customer ORDERBY MetaData.LastUpdatedTime STARTPOSITION 1 MAXRESULTS 100");
    expect(out).toMatchObject({ items: [], hasMore: false, nextCursor: null, highWatermark: null, totalCount: 0 });
  });

  test("customers.list and payments.list normalize live-shaped rows", async () => {
    const c = await executeCustomersListSync({ ...base, pageSize: 5, fetch: fakeFetch([{ status: 200, body: customerPage }]).impl });
    expect(c.items[0]).toMatchObject({ id: "qb-cust:3", displayName: "Cool Cars", email: "Cool_Cars@intuit.com", balance: 239 });
    const p = await executePaymentsListSync({ ...base, pageSize: 5, fetch: fakeFetch([{ status: 200, body: paymentPage }]).impl });
    expect(p.items[0]).toMatchObject({ id: "qb-pay:140", totalAmt: 85, paymentMethod: "Cash", txnDate: "2026-09-05" });
  });

  test("401 AuthenticationFailed is a structured upstream error", async () => {
    const { impl } = fakeFetch([{ status: 401, body: auth401 }]);
    let caught: unknown;
    try { await executePaymentsListSync({ ...base, fetch: impl }); } catch (e) { caught = e; }
    expect(caught).toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
    expect((caught as { message: string }).message).toContain("HTTP 401");
    expect((caught as { message: string }).message).not.toContain("token\"");
  });

  test("429 maps to CONNECTOR_RATE_LIMITED", async () => {
    const { impl } = fakeFetch([{ status: 429, body: {} }]);
    await expect(executeInvoicesListSync({ ...base, fetch: impl })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED" });
  });

  test("rejects unsafe since, bad realmId, bad cursor and out-of-range pageSize", async () => {
    const { impl } = fakeFetch([]);
    await expect(executeInvoicesListSync({ ...base, since: "2026-01-01' OR 1=1", fetch: impl })).rejects.toThrow("since");
    await expect(executeInvoicesListSync({ ...base, realmId: "../x", fetch: impl })).rejects.toThrow("realmId");
    await expect(executeInvoicesListSync({ ...base, cursor: "nope", fetch: impl })).rejects.toThrow("cursor");
    await expect(executeInvoicesListSync({ ...base, pageSize: 1001, fetch: impl })).rejects.toThrow("pageSize");
  });

  test("buildQuery shape", () => {
    expect(buildQuery("Payment", null, 1, 1000)).toBe("SELECT * FROM Payment ORDERBY MetaData.LastUpdatedTime STARTPOSITION 1 MAXRESULTS 1000");
  });
});

describe("QB-SYNC-1 registry dispatch and output schema conformance", () => {
  const cases: Array<[string, unknown[]]> = [
    ["invoices.list", [invoicePage1, invoicePage2]],
    ["customers.list", [customerPage]],
    ["payments.list", [paymentPage]],
  ];
  for (const [key, bodies] of cases) {
    test(`${key} is reachable through executeSync and conforms to its outputSchema`, async () => {
      const { impl } = fakeFetch(bodies.map((body) => ({ status: 200, body })));
      const result = defaultConnectorRegistry.executeSync("quickbooks", key, { ...base, pageSize: 2, fetch: impl });
      expect(result.ok).toBe(true);
      const output = await Promise.resolve((result as { output: unknown }).output);
      const validate = compileStrictValidator(ops[key]!.outputSchema as Record<string, unknown>, { registry: true });
      expect(() => validate(output)).not.toThrow();
    });
  }

  test("empty result conforms too", async () => {
    const { impl } = fakeFetch([{ status: 200, body: customerEmpty }]);
    const result = defaultConnectorRegistry.executeSync("quickbooks", "customers.list", { ...base, fetch: impl });
    const output = await Promise.resolve((result as { output: unknown }).output);
    compileStrictValidator(ops["customers.list"]!.outputSchema as Record<string, unknown>, { registry: true })(output);
  });

  test("the old undeclared response input is rejected at dispatch", () => {
    const result = defaultConnectorRegistry.executeSync("quickbooks", "invoices.list", { ...base, response: invoicePage1 });
    expect(result.ok).toBe(false);
  });
});
