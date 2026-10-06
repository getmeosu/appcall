import { describe, expect, test } from "bun:test";
import invoiceGetFixture from "../fixtures/invoice_get.json";
import contactGetFixture from "../fixtures/contact_get.json";
import accountsListFixture from "../fixtures/accounts_list.json";
import paymentsListFixture from "../fixtures/payments_list.json";
import itemsListFixture from "../fixtures/items_list.json";
import {
  getInvoice,
  createInvoice,
  updateInvoice,
  getContact,
  createContact,
  updateContact,
  listAccounts,
  getAccount,
  createAccount,
  updateAccount,
  listPayments,
  getPayment,
  createPayment,
  updatePayment,
  listItems,
  getItem,
  createItem,
  updateItem,
} from "../src/actions";

const AUTH = {
  accessToken: "fixture-access-token",
  tenantId: "fixture-tenant-id",
};

function mockFetch(status: number, body: unknown, capture?: Request[]) {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    capture?.push(request);
    return Response.json(body, { status });
  };
}

describe("xero invoice actions", () => {
  test("getInvoice validates without auth", () => {
    const result = getInvoice({ invoiceId: "inv-1" });
    expect(result).toEqual({
      connector: "xero",
      action: "invoices.get",
      source: "connector",
      validated: { invoiceId: "inv-1" },
    });
  });

  test("getInvoice rejects missing invoiceId", () => {
    expect(() => getInvoice({})).toThrow("invoiceId is required");
  });

  test("getInvoice fetches a single invoice", async () => {
    const requests: Request[] = [];
    const result = await getInvoice({
      ...AUTH,
      invoiceId: "00000000-0000-0000-0000-000000000001",
      fetch: mockFetch(200, invoiceGetFixture, requests),
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.xero.com/api.xro/2.0/Invoices/00000000-0000-0000-0000-000000000001");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer fixture-access-token");
    expect(requests[0].headers.get("Xero-Tenant-Id")).toBe("fixture-tenant-id");
    expect(result).toMatchObject({
      action: "invoices.get",
      invoice: { id: "xero-inv:00000000-0000-0000-0000-000000000001", invoiceNumber: "INV-2025-001" },
    });
    expect(JSON.stringify(result)).not.toContain("fixture-access-token");
  });

  test("createInvoice requires type, contact, and lineItems", () => {
    expect(() => createInvoice({ type: "ACCREC", lineItems: [{ description: "Work" }] })).toThrow("contactId or contactName is required");
    expect(() => createInvoice({ type: "ACCREC", contactName: "Acme" })).toThrow("lineItems must be a non-empty array");
  });

  test("createInvoice PUTs an invoice envelope", async () => {
    const requests: Request[] = [];
    const result = await createInvoice({
      ...AUTH,
      type: "ACCREC",
      contactId: "00000000-0000-0000-0000-000000000100",
      lineItems: [{ description: "Consulting", quantity: 1, unitAmount: 1250, accountCode: "200" }],
      fetch: mockFetch(200, invoiceGetFixture, requests),
    });
    expect(requests[0].method).toBe("PUT");
    expect(requests[0].url).toBe("https://api.xero.com/api.xro/2.0/Invoices");
    expect(await requests[0].json()).toEqual({
      Invoices: [{
        Type: "ACCREC",
        Contact: { ContactID: "00000000-0000-0000-0000-000000000100" },
        LineItems: [{ Description: "Consulting", Quantity: 1, UnitAmount: 1250, AccountCode: "200" }],
      }],
    });
    expect(result).toMatchObject({ action: "invoices.create", invoice: { invoiceNumber: "INV-2025-001" } });
  });

  test("updateInvoice POSTs to the invoice id", async () => {
    const requests: Request[] = [];
    const result = await updateInvoice({
      ...AUTH,
      invoiceId: "00000000-0000-0000-0000-000000000001",
      status: "AUTHORISED",
      fetch: mockFetch(200, invoiceGetFixture, requests),
    });
    expect(requests[0].method).toBe("POST");
    expect(requests[0].url).toContain("/Invoices/00000000-0000-0000-0000-000000000001");
    expect(result).toMatchObject({ action: "invoices.update" });
  });

  test("invoice actions map 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(getInvoice({
      ...AUTH,
      invoiceId: "inv-1",
      fetch: async () => new Response("{}", { status: 429, headers: { "Retry-After": "12" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 12 });
  });
});

describe("xero contact actions", () => {
  test("getContact validates without auth", () => {
    expect(getContact({ contactId: "c-1" })).toMatchObject({ action: "contacts.get", validated: { contactId: "c-1" } });
  });

  test("createContact requires name", () => {
    expect(() => createContact({})).toThrow("name is required");
  });

  test("createContact PUTs a contact", async () => {
    const requests: Request[] = [];
    const result = await createContact({
      ...AUTH,
      name: "Acme Corp",
      emailAddress: "john.smith@acmecorp.com",
      fetch: mockFetch(200, contactGetFixture, requests),
    });
    expect(requests[0].method).toBe("PUT");
    expect(requests[0].url).toBe("https://api.xero.com/api.xro/2.0/Contacts");
    expect(result).toMatchObject({ action: "contacts.create", contact: { name: "Acme Corp" } });
  });

  test("updateContact POSTs to the contact id", async () => {
    const requests: Request[] = [];
    await updateContact({
      ...AUTH,
      contactId: "00000000-0000-0000-0000-000000000100",
      emailAddress: "new@acmecorp.com",
      fetch: mockFetch(200, contactGetFixture, requests),
    });
    expect(requests[0].method).toBe("POST");
    expect(requests[0].url).toContain("/Contacts/00000000-0000-0000-0000-000000000100");
  });
});

describe("xero account actions", () => {
  test("listAccounts fetches the chart of accounts", async () => {
    const requests: Request[] = [];
    const result = await listAccounts({
      ...AUTH,
      fetch: mockFetch(200, accountsListFixture, requests),
    });
    expect(requests[0].url).toBe("https://api.xero.com/api.xro/2.0/Accounts");
    expect(result).toMatchObject({
      action: "accounts.list",
      items: [
        { id: "xero-account:00000000-0000-0000-0000-000000000300", code: "200", name: "Sales" },
        { id: "xero-account:00000000-0000-0000-0000-000000000301", type: "BANK" },
      ],
    });
  });

  test("getAccount and createAccount round-trip", async () => {
    const get = await getAccount({
      ...AUTH,
      accountId: "00000000-0000-0000-0000-000000000300",
      fetch: mockFetch(200, { Accounts: [accountsListFixture.Accounts[0]] }),
    });
    expect(get).toMatchObject({ action: "accounts.get", account: { code: "200" } });

    const requests: Request[] = [];
    const created = await createAccount({
      ...AUTH,
      code: "201",
      name: "Clearance sales",
      type: "SALES",
      fetch: mockFetch(200, { Accounts: [accountsListFixture.Accounts[0]] }, requests),
    });
    expect(requests[0].method).toBe("PUT");
    expect(await requests[0].json()).toEqual({ Code: "201", Name: "Clearance sales", Type: "SALES" });
    expect(created).toMatchObject({ action: "accounts.create" });
  });

  test("updateAccount posts status changes", async () => {
    const requests: Request[] = [];
    await updateAccount({
      ...AUTH,
      accountId: "00000000-0000-0000-0000-000000000300",
      status: "ARCHIVED",
      fetch: mockFetch(200, { Accounts: [accountsListFixture.Accounts[0]] }, requests),
    });
    expect(requests[0].method).toBe("POST");
    expect(await requests[0].json()).toEqual({ Status: "ARCHIVED" });
  });
});

describe("xero payment actions", () => {
  test("listPayments and getPayment", async () => {
    const listed = await listPayments({ ...AUTH, fetch: mockFetch(200, paymentsListFixture) });
    expect(listed).toMatchObject({
      action: "payments.list",
      items: [{ id: "xero-payment:00000000-0000-0000-0000-000000000400", amount: 1250 }],
    });
    const got = await getPayment({
      ...AUTH,
      paymentId: "00000000-0000-0000-0000-000000000400",
      fetch: mockFetch(200, paymentsListFixture),
    });
    expect(got).toMatchObject({ action: "payments.get", payment: { reference: "ACH-001" } });
  });

  test("createPayment requires amount as a number", () => {
    expect(() => createPayment({ invoiceId: "i", accountId: "a" })).toThrow("amount must be a number");
  });

  test("createPayment PUTs invoice, account, and amount", async () => {
    const requests: Request[] = [];
    await createPayment({
      ...AUTH,
      invoiceId: "00000000-0000-0000-0000-000000000001",
      accountId: "00000000-0000-0000-0000-000000000301",
      amount: 1250,
      fetch: mockFetch(200, paymentsListFixture, requests),
    });
    expect(requests[0].method).toBe("PUT");
    expect(await requests[0].json()).toEqual({
      Payments: [{
        Invoice: { InvoiceID: "00000000-0000-0000-0000-000000000001" },
        Account: { AccountID: "00000000-0000-0000-0000-000000000301" },
        Amount: 1250,
      }],
    });
  });

  test("updatePayment can mark a payment deleted", async () => {
    const requests: Request[] = [];
    await updatePayment({
      ...AUTH,
      paymentId: "00000000-0000-0000-0000-000000000400",
      status: "DELETED",
      fetch: mockFetch(200, paymentsListFixture, requests),
    });
    expect(requests[0].method).toBe("POST");
    expect(await requests[0].json()).toEqual({ Payments: [{ Status: "DELETED" }] });
  });
});

describe("xero item actions", () => {
  test("listItems, getItem, createItem, updateItem", async () => {
    const listed = await listItems({ ...AUTH, fetch: mockFetch(200, itemsListFixture) });
    expect(listed).toMatchObject({
      action: "items.list",
      items: [{ id: "xero-item:00000000-0000-0000-0000-000000000500", code: "WIDGET" }],
    });

    const got = await getItem({
      ...AUTH,
      itemId: "00000000-0000-0000-0000-000000000500",
      fetch: mockFetch(200, itemsListFixture),
    });
    expect(got).toMatchObject({ action: "items.get", item: { name: "Standard widget" } });

    const requests: Request[] = [];
    await createItem({
      ...AUTH,
      code: "WIDGET",
      name: "Standard widget",
      salesUnitPrice: 20,
      salesAccountCode: "200",
      fetch: mockFetch(200, itemsListFixture, requests),
    });
    expect(requests[0].method).toBe("PUT");
    expect(await requests[0].json()).toEqual({
      Items: [{
        Code: "WIDGET",
        Name: "Standard widget",
        SalesDetails: { UnitPrice: 20, AccountCode: "200" },
      }],
    });

    const updateRequests: Request[] = [];
    await updateItem({
      ...AUTH,
      itemId: "00000000-0000-0000-0000-000000000500",
      name: "Updated widget",
      fetch: mockFetch(200, itemsListFixture, updateRequests),
    });
    expect(updateRequests[0].method).toBe("POST");
    expect(updateRequests[0].url).toContain("/Items/00000000-0000-0000-0000-000000000500");
  });

  test("maps 400 Message to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(createItem({
      ...AUTH,
      code: "DUP",
      fetch: async () => Response.json({ Message: "Item code must be unique" }, { status: 400 }),
    })).rejects.toMatchObject({
      ok: false,
      code: "CONNECTOR_UPSTREAM_ERROR",
      message: "Item code must be unique",
    });
  });
});
