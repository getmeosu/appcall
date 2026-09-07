import { describe, expect, it } from "bun:test";
import { executeInvoicesListSync, executeContactsListSync, executePaymentsListSync } from "../src/sync";
import invsFixture from "../fixtures/invoices_list.json";
import contactsFixture from "../fixtures/contacts_list.json";
import paymentsFixture from "../fixtures/payments_list.json";

describe("Zoho Books invoices sync", () => {
  it("returns normalized invoices", () => {
    const result = executeInvoicesListSync({ response: invsFixture });
    expect(result.provider).toBe("zoho-books");
    expect(result.operation).toBe("invoices.list");
    expect(result.items).toHaveLength(2);
    expect(result.items[0].total).toBe(1500);
  });

  it("returns pagination info", () => {
    const result = executeInvoicesListSync({ response: invsFixture });
    expect(result.hasMore).toBe(false);
    expect(result.page).toBe(1);
  });
});

describe("Zoho Books contacts sync", () => {
  it("returns normalized contacts", () => {
    const result = executeContactsListSync({ response: contactsFixture });
    expect(result.items).toHaveLength(2);
    expect(result.items[0].isCustomer).toBe(true);
  });
});

describe("Zoho Books payments sync", () => {
  it("returns normalized payments", () => {
    const result = executePaymentsListSync({ response: paymentsFixture });
    expect(result.items).toHaveLength(2);
    expect(result.items[0].paymentMode).toBe("bank_transfer");
  });
});

describe("Zoho Books sync null handling", () => {
  it("handles null response", () => {
    expect(executeInvoicesListSync({ response: null }).items).toHaveLength(0);
    expect(executeContactsListSync({ response: null }).items).toHaveLength(0);
    expect(executePaymentsListSync({ response: null }).items).toHaveLength(0);
  });
});
