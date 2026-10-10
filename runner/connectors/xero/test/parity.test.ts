import { describe, expect, it } from "bun:test";
import manifest from "../manifest.json";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import connections from "../fixtures/connections.json";
import organisation from "../fixtures/organisation.json";
import account from "../fixtures/account.json";
import invoiceGet from "../fixtures/invoice_get.json";
import invoiceCreate from "../fixtures/invoice_create.json";
import contactCreate from "../fixtures/contact_create.json";
import paymentCreate from "../fixtures/payment_create.json";
import invoicesList from "../fixtures/invoices_list.json";
import contactsList from "../fixtures/contacts_list.json";
import bankTransactionsList from "../fixtures/bank_transactions_list.json";
import reportBalanceSheet from "../fixtures/report_balance_sheet.json";
import attachmentsList from "../fixtures/attachments_list.json";
import filesList from "../fixtures/files_list.json";
import asset from "../fixtures/asset.json";
import project from "../fixtures/project.json";

const COMPOSIO_SLUGS = [
  "XERO_CREATE_BANK_TRANSACTION",
  "XERO_CREATE_CONTACT",
  "XERO_CREATE_CREDIT_NOTE",
  "XERO_CREATE_INVOICE",
  "XERO_CREATE_ITEM",
  "XERO_CREATE_MANUAL_JOURNAL",
  "XERO_CREATE_PAYMENT",
  "XERO_CREATE_PURCHASE_ORDER",
  "XERO_CREATE_QUOTE",
  "XERO_GET_ACCOUNT",
  "XERO_GET_ASSET",
  "XERO_GET_BALANCE_SHEET_REPORT",
  "XERO_GET_BANK_TRANSACTION",
  "XERO_GET_BUDGET",
  "XERO_GET_CONNECTIONS",
  "XERO_GET_CONTACTS",
  "XERO_GET_CREDIT_NOTE",
  "XERO_GET_INVOICE",
  "XERO_GET_ITEM",
  "XERO_GET_MANUAL_JOURNAL",
  "XERO_GET_ORGANISATION",
  "XERO_GET_PAYMENT",
  "XERO_GET_PROFIT_LOSS_REPORT",
  "XERO_GET_PROJECT",
  "XERO_GET_PURCHASE_ORDER",
  "XERO_GET_QUOTES",
  "XERO_GET_TRIAL_BALANCE_REPORT",
  "XERO_LIST_ACCOUNTS",
  "XERO_LIST_ASSETS",
  "XERO_LIST_ATTACHMENTS",
  "XERO_LIST_BANK_TRANSACTIONS",
  "XERO_LIST_CREDIT_NOTES",
  "XERO_LIST_FILES",
  "XERO_LIST_FOLDERS",
  "XERO_LIST_INVOICES",
  "XERO_LIST_ITEMS",
  "XERO_LIST_JOURNALS",
  "XERO_LIST_MANUAL_JOURNALS",
  "XERO_LIST_PAYMENTS",
  "XERO_LIST_PROJECTS",
  "XERO_LIST_PURCHASE_ORDERS",
  "XERO_LIST_QUOTES",
  "XERO_LIST_TAX_RATES",
  "XERO_LIST_TRACKING_CATEGORIES",
  "XERO_POST_INVOICE_UPDATE",
  "XERO_UPDATE_BANK_TRANSACTION",
  "XERO_UPDATE_CONTACT",
  "XERO_UPDATE_CREDIT_NOTE",
  "XERO_UPDATE_MANUAL_JOURNAL",
  "XERO_UPDATE_PURCHASE_ORDER",
  "XERO_UPDATE_QUOTE",
  "XERO_UPLOAD_ATTACHMENT",
  "XERO_VALIDATE_CREDENTIAL",
] as const;

function toolOp(slug: string): string {
  return `xero.${slug.slice("XERO_".length).toLowerCase()}`;
}

const toolOperations = Object.entries(manifest.operations).filter(([key]) => key.startsWith("xero."));
const compiled = compileDeclarativeConnector(manifest as never);

const TENANT = "11111111-1111-1111-1111-111111111111";
const TOKEN = "fixture-access-token";

type Captured = { url: string; method: string; authorization: string | null; tenant: string | null; ifModifiedSince: string | null; idempotencyKey: string | null; body: unknown; contentType: string | null };

function mockFetch(body: unknown, status = 200) {
  const calls: Captured[] = [];
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const headers = new Headers(init?.headers);
    let parsed: unknown = null;
    if (typeof init?.body === "string" && init.body.length > 0) {
      try { parsed = JSON.parse(init.body); } catch { parsed = init.body; }
    }
    calls.push({
      url,
      method: init?.method ?? "GET",
      authorization: headers.get("authorization"),
      tenant: headers.get("xero-tenant-id"),
      ifModifiedSince: headers.get("if-modified-since"),
      idempotencyKey: headers.get("idempotency-key"),
      body: parsed,
      contentType: headers.get("content-type"),
    });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { calls, fetchFn };
}

describe("xero Composio tool parity", () => {
  it("declares all 53 Composio Xero tools as request-backed actions", () => {
    expect(COMPOSIO_SLUGS).toHaveLength(53);
    expect(toolOperations).toHaveLength(53);
    expect(Object.keys(compiled.actions).sort()).toEqual(COMPOSIO_SLUGS.map(toolOp).sort());
    for (const slug of COMPOSIO_SLUGS) {
      const key = toolOp(slug);
      const operation = (manifest.operations as Record<string, any>)[key];
      expect(operation, key).toBeDefined();
      expect(operation.kind, key).toBe("action");
      expect(operation.title, key).toBeString();
      expect(operation.description.length, key).toBeGreaterThan(0);
      expect(operation.inputSchema?.type, key).toBe("object");
      expect(operation.inputSchema?.additionalProperties, key).toBe(false);
      expect(operation.request?.method, key).toMatch(/^(GET|POST|PUT)$/);
      expect(operation.request?.path, key).toMatch(/^\//);
      expect(["read", "write"], key).toContain(operation.sideEffect);
    }
  });

  it("classifies GET as read and every mutating method as write", () => {
    for (const [key, operation] of toolOperations) {
      const method = (operation as { request: { method: string }; sideEffect: string }).request.method;
      if (method === "GET") expect((operation as { sideEffect: string }).sideEffect, key).toBe("read");
      else expect((operation as { sideEffect: string }).sideEffect, key).toBe("write");
    }
  });

  it("keeps the original sync operations and healthcheck", () => {
    for (const key of ["invoices.list", "contacts.list", "bank_transactions.list", "healthcheck"]) {
      expect((manifest.operations as Record<string, unknown>)[key]).toBeDefined();
    }
    expect(manifest.operations["invoices.list"].kind).toBe("sync");
    expect(manifest.operations["contacts.list"].kind).toBe("sync");
    expect(manifest.operations["bank_transactions.list"].kind).toBe("sync");
    expect(manifest.operations.healthcheck.kind).toBe("action");
    expect(manifest.version).toBe("0.2.0");
  });

  it("does not compile the original syncs into HTTP handlers", () => {
    expect(compiled.actions["invoices.list"]).toBeUndefined();
    expect(compiled.actions["contacts.list"]).toBeUndefined();
    expect(compiled.actions["bank_transactions.list"]).toBeUndefined();
  });
});

describe("xero HTTP tools", () => {
  it("lists connections without a tenant header", async () => {
    const { calls, fetchFn } = mockFetch(connections);
    const result = await compiled.actions["xero.get_connections"]!({ accessToken: TOKEN, fetch: fetchFn }) as Record<string, unknown>;
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toBe("https://api.xero.com/connections");
    expect(calls[0].authorization).toBe("Bearer fixture-access-token");
    expect(calls[0].tenant).toBeNull();
    expect(result.data).toEqual(connections);
  });

  it("requires tenant_id before calling organisation", async () => {
    const { calls, fetchFn } = mockFetch(organisation);
    await expect(compiled.actions["xero.get_organisation"]!({ accessToken: TOKEN, fetch: fetchFn })).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
      message: "tenant_id is required",
    });
    expect(calls).toHaveLength(0);
  });

  it("gets organisation with the tenant header", async () => {
    const { calls, fetchFn } = mockFetch(organisation);
    const result = await compiled.actions["xero.get_organisation"]!({ accessToken: TOKEN, tenant_id: TENANT, fetch: fetchFn }) as Record<string, unknown>;
    expect(calls[0].url).toBe("https://api.xero.com/api.xro/2.0/Organisation");
    expect(calls[0].tenant).toBe(TENANT);
    expect(result.data).toEqual(organisation);
  });

  it("gets an account by id", async () => {
    const { calls, fetchFn } = mockFetch(account);
    await compiled.actions["xero.get_account"]!({ accessToken: TOKEN, tenant_id: TENANT, account_id: "562555f2-8cde-4ce9-8203-0363922537a4", fetch: fetchFn });
    expect(calls[0].url).toBe("https://api.xero.com/api.xro/2.0/Accounts/562555f2-8cde-4ce9-8203-0363922537a4");
  });

  it("rejects a dot path account id before the provider call", async () => {
    const { calls, fetchFn } = mockFetch(account);
    await expect(compiled.actions["xero.get_account"]!({ accessToken: TOKEN, tenant_id: TENANT, account_id: "..", fetch: fetchFn })).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
    expect(calls).toHaveLength(0);
  });

  it("creates an invoice with nested contact and line items", async () => {
    const { calls, fetchFn } = mockFetch(invoiceCreate);
    const lineItems = [{ Description: "Consulting", Quantity: 1, UnitAmount: 100, AccountCode: "200" }];
    await compiled.actions["xero.create_invoice"]!({
      accessToken: TOKEN,
      tenant_id: TENANT,
      Type: "ACCREC",
      ContactID: "00000000-0000-0000-0000-000000000100",
      LineItems: lineItems,
      Status: "DRAFT",
      fetch: fetchFn,
    });
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://api.xero.com/api.xro/2.0/Invoices");
    expect(calls[0].body).toEqual({
      Type: "ACCREC",
      Contact: { ContactID: "00000000-0000-0000-0000-000000000100" },
      LineItems: lineItems,
      Status: "DRAFT",
    });
  });

  it("rejects an unsupported invoice type before the provider call", async () => {
    const { calls, fetchFn } = mockFetch(invoiceCreate);
    await expect(compiled.actions["xero.create_invoice"]!({
      accessToken: TOKEN,
      tenant_id: TENANT,
      Type: "UNKNOWN",
      LineItems: [{ Description: "x", Quantity: 1, UnitAmount: 1, AccountCode: "200" }],
      fetch: fetchFn,
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    expect(calls).toHaveLength(0);
  });

  it("gets an invoice by uuid", async () => {
    const { calls, fetchFn } = mockFetch(invoiceGet);
    await compiled.actions["xero.get_invoice"]!({ accessToken: TOKEN, tenant_id: TENANT, invoice_id: "00000000-0000-0000-0000-000000000001", unitdp: 4, fetch: fetchFn });
    const url = new URL(calls[0].url);
    expect(url.pathname).toBe("/api.xro/2.0/Invoices/00000000-0000-0000-0000-000000000001");
    expect(url.searchParams.get("unitdp")).toBe("4");
  });

  it("lists invoices with filters and If-Modified-Since", async () => {
    const { calls, fetchFn } = mockFetch(invoicesList);
    await compiled.actions["xero.list_invoices"]!({
      accessToken: TOKEN,
      tenant_id: TENANT,
      page: 2,
      Statuses: "AUTHORISED",
      "If-Modified-Since": "2025-01-01T00:00:00",
      fetch: fetchFn,
    });
    const url = new URL(calls[0].url);
    expect(url.pathname).toBe("/api.xro/2.0/Invoices");
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("Statuses")).toBe("AUTHORISED");
    expect(calls[0].ifModifiedSince).toBe("2025-01-01T00:00:00");
  });

  it("creates a contact", async () => {
    const { calls, fetchFn } = mockFetch(contactCreate);
    await compiled.actions["xero.create_contact"]!({
      accessToken: TOKEN,
      tenant_id: TENANT,
      Name: "New Client",
      EmailAddress: "new@client.test",
      IsCustomer: true,
      fetch: fetchFn,
    });
    expect(calls[0].body).toEqual({ Name: "New Client", EmailAddress: "new@client.test", IsCustomer: true });
  });

  it("lists contacts", async () => {
    const { calls, fetchFn } = mockFetch(contactsList);
    await compiled.actions["xero.get_contacts"]!({ accessToken: TOKEN, tenant_id: TENANT, searchTerm: "Acme", page: 1, pageSize: 50, fetch: fetchFn });
    const url = new URL(calls[0].url);
    expect(url.pathname).toBe("/api.xro/2.0/Contacts");
    expect(url.searchParams.get("searchTerm")).toBe("Acme");
    expect(url.searchParams.get("page")).toBe("1");
  });

  it("fetches one contact by ContactID via the IDs query", async () => {
    const { calls, fetchFn } = mockFetch(contactsList);
    await compiled.actions["xero.get_contacts"]!({
      accessToken: TOKEN,
      tenant_id: TENANT,
      ContactID: "00000000-0000-0000-0000-000000000100",
      fetch: fetchFn,
    });
    expect(new URL(calls[0].url).searchParams.get("IDs")).toBe("00000000-0000-0000-0000-000000000100");
  });

  it("creates a payment against an invoice and bank account", async () => {
    const { calls, fetchFn } = mockFetch(paymentCreate);
    await compiled.actions["xero.create_payment"]!({
      accessToken: TOKEN,
      tenant_id: TENANT,
      InvoiceID: "00000000-0000-0000-0000-000000000001",
      AccountID: "00000000-0000-0000-0000-000000000010",
      Amount: 1250,
      fetch: fetchFn,
    });
    expect(calls[0].body).toEqual({
      Invoice: { InvoiceID: "00000000-0000-0000-0000-000000000001" },
      Account: { AccountID: "00000000-0000-0000-0000-000000000010" },
      Amount: 1250,
    });
  });

  it("lists bank transactions with an authorised filter", async () => {
    const { calls, fetchFn } = mockFetch(bankTransactionsList);
    await compiled.actions["xero.list_bank_transactions"]!({
      accessToken: TOKEN,
      tenant_id: TENANT,
      where: 'Status=="AUTHORISED"',
      order: "Date DESC",
      fetch: fetchFn,
    });
    const url = new URL(calls[0].url);
    expect(url.pathname).toBe("/api.xro/2.0/BankTransactions");
    expect(url.searchParams.get("where")).toBe('Status=="AUTHORISED"');
  });

  it("fetches the balance sheet report", async () => {
    const { calls, fetchFn } = mockFetch(reportBalanceSheet);
    await compiled.actions["xero.get_balance_sheet_report"]!({
      accessToken: TOKEN,
      tenant_id: TENANT,
      date: "2025-06-30",
      timeframe: "MONTH",
      fetch: fetchFn,
    });
    const url = new URL(calls[0].url);
    expect(url.pathname).toBe("/api.xro/2.0/Reports/BalanceSheet");
    expect(url.searchParams.get("date")).toBe("2025-06-30");
    expect(url.searchParams.get("timeframe")).toBe("MONTH");
  });

  it("lists attachments on an invoice", async () => {
    const { calls, fetchFn } = mockFetch(attachmentsList);
    await compiled.actions["xero.list_attachments"]!({
      accessToken: TOKEN,
      tenant_id: TENANT,
      entity_type: "Invoices",
      entity_id: "00000000-0000-0000-0000-000000000001",
      fetch: fetchFn,
    });
    expect(new URL(calls[0].url).pathname).toBe("/api.xro/2.0/Invoices/00000000-0000-0000-0000-000000000001/Attachments");
  });

  it("lists files on the Files API host path", async () => {
    const { calls, fetchFn } = mockFetch(filesList);
    await compiled.actions["xero.list_files"]!({ accessToken: TOKEN, tenant_id: TENANT, page: 1, fetch: fetchFn });
    expect(calls[0].url.startsWith("https://api.xero.com/files.xro/1.0/Files")).toBe(true);
  });

  it("gets an asset from the Assets API", async () => {
    const { calls, fetchFn } = mockFetch(asset);
    await compiled.actions["xero.get_asset"]!({ accessToken: TOKEN, tenant_id: TENANT, asset_id: "asset-1", fetch: fetchFn });
    expect(calls[0].url).toBe("https://api.xero.com/assets.xro/1.0/Assets/asset-1");
  });

  it("gets a project from the Projects API", async () => {
    const { calls, fetchFn } = mockFetch(project);
    await compiled.actions["xero.get_project"]!({ accessToken: TOKEN, tenant_id: TENANT, project_id: "550e8400-e29b-41d4-a716-446655440000", fetch: fetchFn });
    expect(calls[0].url).toBe("https://api.xero.com/projects.xro/2.0/Projects/550e8400-e29b-41d4-a716-446655440000");
  });

  it("uploads an attachment onto an invoice", async () => {
    const { calls, fetchFn } = mockFetch(attachmentsList);
    await compiled.actions["xero.upload_attachment"]!({
      accessToken: TOKEN,
      tenant_id: TENANT,
      entity_type: "Invoices",
      entity_id: "00000000-0000-0000-0000-000000000001",
      filename: "receipt.pdf",
      content: "JVBERi0x",
      content_type: "application/pdf",
      include_online: true,
      fetch: fetchFn,
    });
    expect(calls[0].method).toBe("PUT");
    expect(new URL(calls[0].url).pathname).toBe("/api.xro/2.0/Invoices/00000000-0000-0000-0000-000000000001/Attachments/receipt.pdf");
    expect(new URL(calls[0].url).searchParams.get("IncludeOnline")).toBe("true");
    expect(calls[0].body).toEqual({ content: "JVBERi0x" });
  });

  it("validates credentials against /connections", async () => {
    const { calls, fetchFn } = mockFetch(connections);
    const result = await compiled.actions["xero.validate_credential"]!({ accessToken: TOKEN, fetch: fetchFn }) as Record<string, unknown>;
    expect(calls[0].url).toBe("https://api.xero.com/connections");
    expect(result.status).toBe("ok");
  });

  it("echoes validation without a credential", () => {
    const result = compiled.actions["xero.create_invoice"]!({
      Type: "ACCREC",
      tenant_id: TENANT,
      LineItems: [{ Description: "Consulting", Quantity: 1, UnitAmount: 100, AccountCode: "200" }],
    }) as Record<string, unknown>;
    expect(result.source).toBe("connector");
    expect(result.connector).toBe("xero");
  });

  it("issues an authenticated request for every Composio tool", async () => {
    for (const slug of COMPOSIO_SLUGS) {
      const key = toolOp(slug);
      const operation = (manifest.operations as Record<string, any>)[key];
      const { calls, fetchFn } = mockFetch({ Status: "OK" });
      const input = sampleInput(operation.inputSchema);
      await compiled.actions[key]!({ ...input, accessToken: TOKEN, fetch: fetchFn });
      expect(calls, key).toHaveLength(1);
      expect(calls[0].method, key).toBe(operation.request.method);
      expect(calls[0].authorization, key).toBe("Bearer fixture-access-token");
      expect(new URL(calls[0].url).hostname, key).toBe("api.xero.com");
      if ((operation.inputSchema.required as string[]).includes("tenant_id")) {
        expect(calls[0].tenant, key).toBe(TENANT);
      } else {
        expect(calls[0].tenant, key).toBeNull();
      }
    }
  });

  it("sends Idempotency-Key on manual journal create", async () => {
    const { calls, fetchFn } = mockFetch({ ManualJournals: [] });
    await compiled.actions["xero.create_manual_journal"]!({
      accessToken: TOKEN,
      tenant_id: TENANT,
      Narration: "Accrual",
      Date: "2025-06-30",
      JournalLines: [
        { Description: "Debit", LineAmount: 100, AccountCode: "400" },
        { Description: "Credit", LineAmount: -100, AccountCode: "200" },
      ],
      idempotency_key: "journal-1",
      fetch: fetchFn,
    });
    expect(calls[0].method).toBe("POST");
    expect(new URL(calls[0].url).pathname).toBe("/api.xro/2.0/ManualJournals");
    expect(calls[0].idempotencyKey).toBe("journal-1");
    expect(calls[0].body).toMatchObject({
      Narration: "Accrual",
      Date: "2025-06-30",
    });
  });
});

function sampleInput(schema: { properties?: Record<string, any>; required?: string[] }): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  const properties = schema.properties ?? {};
  for (const key of schema.required ?? []) {
    const property = properties[key] ?? {};
    if (Array.isArray(property.enum) && property.enum.length > 0) {
      input[key] = property.enum[0];
      continue;
    }
    switch (property.type) {
      case "integer":
        input[key] = 1;
        break;
      case "number":
        input[key] = 1;
        break;
      case "boolean":
        input[key] = true;
        break;
      case "array":
        input[key] = key === "JournalLines"
          ? [{ Description: "Line", LineAmount: 100, AccountCode: "200" }]
          : [{ Description: "Line", Quantity: 1, UnitAmount: 1, AccountCode: "200" }];
        break;
      case "object":
        input[key] = {};
        break;
      default:
        input[key] = key === "filename" ? "receipt.pdf" : key === "content" ? "hello" : key === "Name" || key === "Narration" || key === "Code" ? "Acme" : TENANT;
    }
  }
  return input;
}
