import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import {
  QUICKBOOKS_ACTION_KEYS,
  createQuickBooksActionHandlers,
  executeQuickBooksAction,
} from "../src/actions";
import customerFixture from "../fixtures/customer.json";
import invoiceFixture from "../fixtures/invoice.json";
import queryCustomersFixture from "../fixtures/query_customers.json";
import reportFixture from "../fixtures/report_balance_sheet.json";
import chargeFixture from "../fixtures/charge_capture.json";
import companyInfoFixture from "../fixtures/company_info.json";
import ops from "../src/ops.json";

function stubFetch(body: string, init: { status?: number; headers?: Record<string, string> } = {}) {
  const calls: Request[] = [];
  const impl = (async (input: string | URL | Request, requestInit?: RequestInit) => {
    calls.push(new Request(input as string, requestInit));
    return new Response(body, {
      status: init.status ?? 200,
      headers: { "content-type": "application/json", ...(init.headers ?? {}) },
    });
  }) as typeof fetch;
  return { calls, impl };
}

const auth = { accessToken: "test-token", realmId: "1234567890" };

const actionOps = Object.entries(manifest.operations)
  .filter(([, spec]) => (spec as { kind?: string }).kind === "action" && spec !== manifest.operations.healthcheck)
  .map(([key]) => key);

describe("quickbooks composio actions", () => {
  test("registers a handwritten handler for every new action", () => {
    expect(Object.keys(createQuickBooksActionHandlers()).sort()).toEqual([...QUICKBOOKS_ACTION_KEYS].sort());
    expect(QUICKBOOKS_ACTION_KEYS.sort()).toEqual(actionOps.sort());
    expect(QUICKBOOKS_ACTION_KEYS).toHaveLength(114);
  });

  test("every action has title, description, object inputSchema, and sideEffect", () => {
    for (const key of QUICKBOOKS_ACTION_KEYS) {
      const spec = (manifest.operations as Record<string, Record<string, unknown>>)[key];
      expect(typeof spec.title, key).toBe("string");
      expect(String(spec.description).length, key).toBeGreaterThan(20);
      expect((spec.inputSchema as { type?: string }).type, key).toBe("object");
      expect(["read", "write", "destructive"], key).toContain(spec.sideEffect);
    }
  });

  test("creates a customer on the accounting company path", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(customerFixture));
    const result = await executeQuickBooksAction("customers.create", {
      ...auth,
      display_name: "Jane Doe",
      given_name: "Jane",
      family_name: "Doe",
      PrimaryEmailAddr: { Address: "jane@example.com" },
      fetch: impl,
    }) as Record<string, unknown>;

    expect(calls).toHaveLength(1);
    const url = new URL(calls[0].url);
    expect(url.hostname).toBe("quickbooks.api.intuit.com");
    expect(url.pathname).toBe("/v3/company/1234567890/customer");
    expect(calls[0].method).toBe("POST");
    expect(calls[0].headers.get("Authorization")).toBe("Bearer test-token");
    const body = await calls[0].json();
    expect(body.DisplayName).toBe("Jane Doe");
    expect(body.GivenName).toBe("Jane");
    expect(body.PrimaryEmailAddr).toEqual({ Address: "jane@example.com" });
    expect(result.source).toBe("provider");
    expect((result.data as { Customer: { Id: string } }).Customer.Id).toBe("1");
  });

  test("reads an invoice by id", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(invoiceFixture));
    await executeQuickBooksAction("invoices.read", { ...auth, invoice_id: "INV-1", fetch: impl });
    expect(new URL(calls[0].url).pathname).toBe("/v3/company/1234567890/invoice/INV-1");
    expect(calls[0].method).toBe("GET");
  });

  test("queries customers with the QBO SQL query parameter", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(queryCustomersFixture));
    await executeQuickBooksAction("customers.query", {
      ...auth,
      query: "SELECT * FROM Customer MAXRESULTS 10",
      fetch: impl,
    });
    const url = new URL(calls[0].url);
    expect(url.pathname).toBe("/v3/company/1234567890/query");
    expect(url.searchParams.get("query")).toBe("SELECT * FROM Customer MAXRESULTS 10");
  });

  test("lists invoices by building SELECT SQL from pagination fields", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(queryCustomersFixture));
    await executeQuickBooksAction("invoices.list_invoices", {
      ...auth,
      max_results: 25,
      start_position: 1,
      fetch: impl,
    });
    const sql = new URL(calls[0].url).searchParams.get("query") ?? "";
    expect(sql).toContain("SELECT * FROM Invoice");
    expect(sql).toContain("MAXRESULTS 25");
    expect(sql).toContain("STARTPOSITION 1");
  });

  test("filters invoice queries with CustomerRef and dates", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(queryCustomersFixture));
    await executeQuickBooksAction("invoices.query", {
      ...auth,
      customer_id: "9",
      start_date: "2026-01-01",
      fetch: impl,
    });
    const sql = new URL(calls[0].url).searchParams.get("query") ?? "";
    expect(sql).toContain("CustomerRef = '9'");
    expect(sql).toContain("TxnDate >= '2026-01-01'");
  });

  test("creates an invoice with CustomerRef.value and Line", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(invoiceFixture));
    const lines = [{ Amount: 10, DetailType: "SalesItemLineDetail", SalesItemLineDetail: { ItemRef: { value: "1" } } }];
    await executeQuickBooksAction("invoices.create", {
      ...auth,
      customer_id: "1",
      lines,
      due_date: "2026-02-01",
      fetch: impl,
    });
    const body = await calls[0].json();
    expect(body.CustomerRef).toEqual({ value: "1" });
    expect(body.Line).toEqual(lines);
    expect(body.DueDate).toBe("2026-02-01");
    expect(new URL(calls[0].url).pathname).toBe("/v3/company/1234567890/invoice");
  });

  test("fetches a named report", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(reportFixture));
    await executeQuickBooksAction("balance_sheet_report.get", {
      ...auth,
      report_date: "2026-03-31",
      accounting_method: "Accrual",
      fetch: impl,
    });
    const url = new URL(calls[0].url);
    expect(url.pathname).toBe("/v3/company/1234567890/reports/BalanceSheet");
    expect(url.searchParams.get("report_date")).toBe("2026-03-31");
    expect(url.searchParams.get("accounting_method")).toBe("Accrual");
  });

  test("passes start_date through the general ledger report query", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(reportFixture));
    await executeQuickBooksAction("general_ledger_report.get", {
      ...auth,
      start_date: "2026-01-01",
      end_date: "2026-03-31",
      accounting_method: "Accrual",
      fetch: impl,
    });
    const url = new URL(calls[0].url);
    expect(url.pathname).toBe("/v3/company/1234567890/reports/GeneralLedger");
    expect(url.searchParams.get("start_date")).toBe("2026-01-01");
    expect(url.searchParams.get("end_date")).toBe("2026-03-31");
  });

  test("captures a payments-api charge on api.intuit.com", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(chargeFixture));
    await executeQuickBooksAction("charges.capture", {
      accessToken: "pay-token",
      charge_id: "EMU123",
      amount: "10.55",
      fetch: impl,
    });
    const url = new URL(calls[0].url);
    expect(url.hostname).toBe("api.intuit.com");
    expect(url.pathname).toBe("/quickbooks/v4/payments/charges/EMU123/capture");
    expect(calls[0].method).toBe("POST");
    expect(await calls[0].json()).toEqual({ amount: "10.55" });
  });

  test("requests invoice PDFs with application/pdf", async () => {
    const { calls, impl } = stubFetch("%PDF-1.4", { headers: { "content-type": "application/pdf" } });
    const result = await executeQuickBooksAction("invoices.get_pdf", {
      ...auth,
      invoice_id: "1",
      fetch: impl,
    }) as Record<string, unknown>;
    expect(calls[0].headers.get("Accept")).toBe("application/pdf");
    expect(new URL(calls[0].url).pathname).toBe("/v3/company/1234567890/invoice/1/pdf");
    expect(result.pdf).toBe("%PDF-1.4");
  });

  test("deletes an item with operation=delete and Id/SyncToken", async () => {
    const { calls, impl } = stubFetch(JSON.stringify({ Item: { status: "Deleted", Id: "5" } }));
    await executeQuickBooksAction("items.delete", {
      ...auth,
      item_id: "5",
      sync_token: "3",
      fetch: impl,
    });
    const url = new URL(calls[0].url);
    expect(url.pathname).toBe("/v3/company/1234567890/item");
    expect(url.searchParams.get("operation")).toBe("delete");
    expect(await calls[0].json()).toEqual({ Id: "5", SyncToken: "3" });
  });

  test("sends a credit memo with sendTo", async () => {
    const { calls, impl } = stubFetch(JSON.stringify({ CreditMemo: { Id: "8" } }));
    await executeQuickBooksAction("credit_memos.send", {
      ...auth,
      credit_memo_id: "8",
      send_to: "ada@example.com",
      fetch: impl,
    });
    const url = new URL(calls[0].url);
    expect(url.pathname).toBe("/v3/company/1234567890/creditmemo/8/send");
    expect(url.searchParams.get("sendTo")).toBe("ada@example.com");
    expect(calls[0].method).toBe("POST");
  });

  test("posts batch item requests", async () => {
    const { calls, impl } = stubFetch(JSON.stringify({ BatchItemResponse: [] }));
    const batch = [{ bId: "1", operation: "create", Customer: { DisplayName: "Ada" } }];
    await executeQuickBooksAction("batch.execute", { ...auth, BatchItemRequest: batch, fetch: impl });
    expect(new URL(calls[0].url).pathname).toBe("/v3/company/1234567890/batch");
    expect(await calls[0].json()).toEqual({ BatchItemRequest: batch });
  });

  test("reads CDC changed entities", async () => {
    const { calls, impl } = stubFetch(JSON.stringify({ CDCResponse: [] }));
    await executeQuickBooksAction("changed_entities.get", {
      ...auth,
      entities: "Invoice,Customer",
      changedSince: "2026-01-01T00:00:00-00:00",
      fetch: impl,
    });
    const url = new URL(calls[0].url);
    expect(url.pathname).toBe("/v3/company/1234567890/cdc");
    expect(url.searchParams.get("entities")).toBe("Invoice,Customer");
  });

  test("gets company info using realmId twice in the path", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(companyInfoFixture));
    await executeQuickBooksAction("company_info.get", { ...auth, fetch: impl });
    expect(new URL(calls[0].url).pathname).toBe("/v3/company/1234567890/companyinfo/1234567890");
  });

  test("sparse invoice update sets sparse true on the invoice body", async () => {
    const { calls, impl } = stubFetch(JSON.stringify(invoiceFixture));
    await executeQuickBooksAction("invoices.update_sparse", {
      ...auth,
      invoice: { Id: "1", SyncToken: "4", PrivateNote: "hold" },
      fetch: impl,
    });
    expect(await calls[0].json()).toEqual({ Id: "1", SyncToken: "4", PrivateNote: "hold", sparse: true });
  });

  test("rejects dot-segment realmId before calling the provider", async () => {
    const { calls, impl } = stubFetch("{}");
    await expect(
      executeQuickBooksAction("customers.read", { accessToken: "t", realmId: "..", customer_id: "1", fetch: impl }),
    ).rejects.toThrow("realmId is not a safe path segment");
    expect(calls).toHaveLength(0);
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    const { impl } = stubFetch("{}", { status: 429, headers: { "retry-after": "12" } });
    await expect(
      executeQuickBooksAction("customers.read", { ...auth, customer_id: "1", fetch: impl }),
    ).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 12 });
  });

  test("maps 401 to CONNECTOR_UPSTREAM_ERROR", async () => {
    const { impl } = stubFetch("{}", { status: 401 });
    await expect(
      executeQuickBooksAction("customers.read", { ...auth, customer_id: "1", fetch: impl }),
    ).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("requires accessToken", async () => {
    await expect(executeQuickBooksAction("customers.read", { realmId: "1", customer_id: "1" })).rejects.toThrow(
      "accessToken is required",
    );
  });

  test("requires realmId and customer_id from inputSchema", async () => {
    await expect(
      executeQuickBooksAction("customers.read", { accessToken: "t", customer_id: "1" }),
    ).rejects.toThrow("realmId is required");
    await expect(
      executeQuickBooksAction("customers.read", { accessToken: "t", realmId: "1" }),
    ).rejects.toThrow("customer_id is required");
  });

  test("issues a real HTTP call for every Composio-mapped action", async () => {
    const { calls, impl } = stubFetch("{}");
    for (const key of QUICKBOOKS_ACTION_KEYS) {
      const spec = (ops as Record<string, { path: string; sql?: unknown }>)[key];
      const schema = (manifest.operations as Record<string, {
        inputSchema?: {
          required?: string[];
          properties?: Record<string, { type?: string; enum?: unknown[] }>;
        };
      }>)[key].inputSchema;
      const input: Record<string, unknown> = { accessToken: "t", fetch: impl };
      const placeholders = [...spec.path.matchAll(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g)].map((match) => match[1]);
      for (const field of new Set([...placeholders, ...(schema?.required ?? [])])) {
        const property = schema?.properties?.[field] ?? {};
        if (property.enum && property.enum.length > 0) input[field] = property.enum[0];
        else if (property.type === "array" || field === "Line" || field === "line" || field === "lines") {
          input[field] = [{ Amount: 1, DetailType: "SalesItemLineDetail" }];
        } else if (property.type === "object" || field === "invoice" || field === "bankAccount") {
          input[field] = { value: "1" };
        } else if (property.type === "number" || property.type === "integer") input[field] = 1;
        else if (property.type === "boolean") input[field] = true;
        else input[field] = field === "query" ? "SELECT * FROM Customer" : "1";
      }
      if (spec.sql && !input.query) input.query = "SELECT * FROM Customer";
      await executeQuickBooksAction(key, input);
    }
    expect(calls).toHaveLength(114);
    expect(calls.some((request) => new URL(request.url).hostname === "api.intuit.com")).toBe(true);
    expect(calls.some((request) => new URL(request.url).hostname === "quickbooks.api.intuit.com")).toBe(true);
  });
});
