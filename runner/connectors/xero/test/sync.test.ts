import { describe, expect, test } from "bun:test";
import invoicesFixture from "../fixtures/invoices_list.json";
import contactsFixture from "../fixtures/contacts_list.json";
import bankTransactionsFixture from "../fixtures/bank_transactions_list.json";
import {
  executeInvoicesListSync,
  executeContactsListSync,
  executeBankTransactionsListSync,
} from "../src/sync";

describe("xero sync operations", () => {
  test("invoices.list sync parses and normalizes invoices", () => {
    const result = executeInvoicesListSync({ response: invoicesFixture });

    expect(result.provider).toBe("xero");
    expect(result.operation).toBe("invoices.list");
    expect(result.items).toHaveLength(2);
    expect(result.items[0].id).toBe("xero-inv:00000000-0000-0000-0000-000000000001");
    expect(result.items[0].invoiceNumber).toBe("INV-2025-001");
    expect(result.items[0].type).toBe("ACCREC");
    expect(result.items[0].status).toBe("AUTHORISED");
    expect(result.items[0].contactName).toBe("Acme Corp");
    expect(result.items[0].total).toBe(1250);
    expect(result.items[0].currency).toBe("USD");
    expect(result.items[1].id).toBe("xero-inv:00000000-0000-0000-0000-000000000002");
    expect(result.items[1].invoiceNumber).toBe("INV-2025-002");
    expect(result.items[1].type).toBe("ACCPAY");
    expect(result.items[1].status).toBe("DRAFT");
  });

  test("contacts.list sync parses and normalizes contacts", () => {
    const result = executeContactsListSync({ response: contactsFixture });

    expect(result.provider).toBe("xero");
    expect(result.operation).toBe("contacts.list");
    expect(result.items).toHaveLength(2);
    expect(result.items[0].id).toBe("xero-contact:00000000-0000-0000-0000-000000000100");
    expect(result.items[0].name).toBe("Acme Corp");
    expect(result.items[0].emailAddress).toBe("john.smith@acmecorp.com");
    expect(result.items[0].isCustomer).toBe(true);
    expect(result.items[0].isSupplier).toBe(false);
    expect(result.items[1].id).toBe("xero-contact:00000000-0000-0000-0000-000000000101");
    expect(result.items[1].name).toBe("Global Supplies Ltd");
    expect(result.items[1].isSupplier).toBe(true);
    expect(result.items[1].isCustomer).toBe(false);
  });

  test("bank_transactions.list sync parses and normalizes bank transactions", () => {
    const result = executeBankTransactionsListSync({ response: bankTransactionsFixture });

    expect(result.provider).toBe("xero");
    expect(result.operation).toBe("bank_transactions.list");
    expect(result.items).toHaveLength(2);
    expect(result.items[0].id).toBe("xero-banktxn:00000000-0000-0000-0000-000000000200");
    expect(result.items[0].type).toBe("RECEIVE");
    expect(result.items[0].amount).toBe(3200);
    expect(result.items[0].currency).toBe("USD");
    expect(result.items[0].contactName).toBe("Acme Corp");
    expect(result.items[0].description).toBe("Consulting services - June");
    expect(result.items[1].id).toBe("xero-banktxn:00000000-0000-0000-0000-000000000201");
    expect(result.items[1].type).toBe("SPEND");
    expect(result.items[1].amount).toBe(89.99);
    expect(result.items[1].contactName).toBe("Global Supplies Ltd");
    expect(result.items[1].description).toBe("Office supplies purchase");
  });

  test("invoices.list sync handles empty response", () => {
    const result = executeInvoicesListSync({ response: { Invoices: [] } });

    expect(result.items).toHaveLength(0);
  });

  test("contacts.list sync handles empty response", () => {
    const result = executeContactsListSync({ response: { Contacts: [] } });

    expect(result.items).toHaveLength(0);
  });

  test("bank_transactions.list sync handles empty response", () => {
    const result = executeBankTransactionsListSync({ response: { BankTransactions: [] } });

    expect(result.items).toHaveLength(0);
  });

  test("all syncs throw on non-object response", () => {
    expect(() => executeInvoicesListSync({ response: "bad" })).toThrow("response must be an object");
    expect(() => executeContactsListSync({ response: null })).toThrow("response must be an object");
    expect(() => executeBankTransactionsListSync({ response: [] })).toThrow("response must be an object");
  });
});
