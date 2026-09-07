import { describe, expect, test } from "bun:test";
import invoicesFixture from "../fixtures/invoices_list.json";
import contactsFixture from "../fixtures/contacts_list.json";
import bankTransactionsFixture from "../fixtures/bank_transactions_list.json";
import {
  normalizeInvoice,
  normalizeContact,
  normalizeBankTransaction,
  parseInvoicesResponse,
  parseContactsResponse,
  parseBankTransactionsResponse,
} from "../src/objects";

describe("xero objects - normalize invoice", () => {
  test("normalizes first invoice from fixture", () => {
    const raw = invoicesFixture.Invoices[0];
    const inv = normalizeInvoice(raw);

    expect(inv.id).toBe("xero-inv:00000000-0000-0000-0000-000000000001");
    expect(inv.provider).toBe("xero");
    expect(inv.invoiceNumber).toBe("INV-2025-001");
    expect(inv.type).toBe("ACCREC");
    expect(inv.status).toBe("AUTHORISED");
    expect(inv.contactName).toBe("Acme Corp");
    expect(inv.total).toBe(1250);
    expect(inv.currency).toBe("USD");
    expect(inv.date).toBe("2025-06-15T00:00:00Z");
    expect(inv.dueDate).toBe("2025-07-15T00:00:00Z");
    expect(inv.updatedDateUTC).toBe("2025-06-15T10:30:00Z");
    expect(inv.modelVersion).toBe("2026-05-17");
    expect(inv.raw).toBe(raw);
  });

  test("normalizes second invoice from fixture", () => {
    const raw = invoicesFixture.Invoices[1];
    const inv = normalizeInvoice(raw);

    expect(inv.id).toBe("xero-inv:00000000-0000-0000-0000-000000000002");
    expect(inv.invoiceNumber).toBe("INV-2025-002");
    expect(inv.type).toBe("ACCPAY");
    expect(inv.status).toBe("DRAFT");
    expect(inv.contactName).toBe("Global Supplies Ltd");
    expect(inv.total).toBe(450.75);
  });

  test("normalizes invoice with minimal fields", () => {
    const inv = normalizeInvoice({ InvoiceID: "abc-123" });

    expect(inv.id).toBe("xero-inv:abc-123");
    expect(inv.invoiceNumber).toBe("");
    expect(inv.type).toBe("");
    expect(inv.status).toBe("");
    expect(inv.contactName).toBe("");
    expect(inv.total).toBe(0);
    expect(inv.currency).toBe("");
    expect(inv.date).toBe("");
    expect(inv.dueDate).toBe("");
    expect(inv.updatedDateUTC).toBe("");
  });
});

describe("xero objects - normalize contact", () => {
  test("normalizes first contact from fixture", () => {
    const raw = contactsFixture.Contacts[0];
    const contact = normalizeContact(raw);

    expect(contact.id).toBe("xero-contact:00000000-0000-0000-0000-000000000100");
    expect(contact.provider).toBe("xero");
    expect(contact.name).toBe("Acme Corp");
    expect(contact.firstName).toBe("John");
    expect(contact.lastName).toBe("Smith");
    expect(contact.emailAddress).toBe("john.smith@acmecorp.com");
    expect(contact.phone).toBe("+1-555-0100");
    expect(contact.isSupplier).toBe(false);
    expect(contact.isCustomer).toBe(true);
    expect(contact.updatedDateUTC).toBe("2025-06-15T10:30:00Z");
    expect(contact.modelVersion).toBe("2026-05-17");
    expect(contact.raw).toBe(raw);
  });

  test("normalizes second contact from fixture", () => {
    const raw = contactsFixture.Contacts[1];
    const contact = normalizeContact(raw);

    expect(contact.id).toBe("xero-contact:00000000-0000-0000-0000-000000000101");
    expect(contact.name).toBe("Global Supplies Ltd");
    expect(contact.isSupplier).toBe(true);
    expect(contact.isCustomer).toBe(false);
    expect(contact.emailAddress).toBe("sarah@globalsupplies.com");
  });

  test("normalizes contact with minimal fields", () => {
    const contact = normalizeContact({ ContactID: "xyz-789" });

    expect(contact.id).toBe("xero-contact:xyz-789");
    expect(contact.name).toBe("");
    expect(contact.firstName).toBe("");
    expect(contact.lastName).toBe("");
    expect(contact.emailAddress).toBe("");
    expect(contact.phone).toBe("");
    expect(contact.isSupplier).toBe(false);
    expect(contact.isCustomer).toBe(false);
    expect(contact.updatedDateUTC).toBe("");
  });

  test("extracts mobile phone when no DEFAULT phone type", () => {
    const contact = normalizeContact({
      ContactID: "phone-test",
      Phones: [
        { PhoneType: "MOBILE", PhoneNumber: "+1-555-0300" },
      ],
    });

    expect(contact.phone).toBe("+1-555-0300");
  });

  test("falls back to first phone when no DEFAULT or MOBILE", () => {
    const contact = normalizeContact({
      ContactID: "phone-test-2",
      Phones: [
        { PhoneType: "FAX", PhoneNumber: "+1-555-0400" },
      ],
    });

    expect(contact.phone).toBe("+1-555-0400");
  });
});

describe("xero objects - normalize bank transaction", () => {
  test("normalizes first bank transaction from fixture", () => {
    const raw = bankTransactionsFixture.BankTransactions[0];
    const txn = normalizeBankTransaction(raw);

    expect(txn.id).toBe("xero-banktxn:00000000-0000-0000-0000-000000000200");
    expect(txn.provider).toBe("xero");
    expect(txn.type).toBe("RECEIVE");
    expect(txn.date).toBe("2025-06-15T00:00:00Z");
    expect(txn.amount).toBe(3200);
    expect(txn.currency).toBe("USD");
    expect(txn.contactName).toBe("Acme Corp");
    expect(txn.description).toBe("Consulting services - June");
    expect(txn.status).toBe("AUTHORISED");
    expect(txn.modelVersion).toBe("2026-05-17");
    expect(txn.raw).toBe(raw);
  });

  test("normalizes second bank transaction from fixture", () => {
    const raw = bankTransactionsFixture.BankTransactions[1];
    const txn = normalizeBankTransaction(raw);

    expect(txn.id).toBe("xero-banktxn:00000000-0000-0000-0000-000000000201");
    expect(txn.type).toBe("SPEND");
    expect(txn.amount).toBe(89.99);
    expect(txn.contactName).toBe("Global Supplies Ltd");
    expect(txn.description).toBe("Office supplies purchase");
  });

  test("normalizes bank transaction with minimal fields", () => {
    const txn = normalizeBankTransaction({ BankTransactionID: "min-txn" });

    expect(txn.id).toBe("xero-banktxn:min-txn");
    expect(txn.type).toBe("");
    expect(txn.date).toBe("");
    expect(txn.amount).toBe(0);
    expect(txn.currency).toBe("");
    expect(txn.contactName).toBe("");
    expect(txn.description).toBe("");
    expect(txn.status).toBe("");
  });
});

describe("xero objects - parse responses", () => {
  test("parses invoices list response", () => {
    const parsed = parseInvoicesResponse(invoicesFixture);

    expect(parsed.items).toHaveLength(2);
    expect(parsed.items[0].InvoiceID).toBe("00000000-0000-0000-0000-000000000001");
    expect(parsed.items[1].InvoiceID).toBe("00000000-0000-0000-0000-000000000002");
  });

  test("parses contacts list response", () => {
    const parsed = parseContactsResponse(contactsFixture);

    expect(parsed.items).toHaveLength(2);
    expect(parsed.items[0].ContactID).toBe("00000000-0000-0000-0000-000000000100");
    expect(parsed.items[1].ContactID).toBe("00000000-0000-0000-0000-000000000101");
  });

  test("parses bank transactions list response", () => {
    const parsed = parseBankTransactionsResponse(bankTransactionsFixture);

    expect(parsed.items).toHaveLength(2);
    expect(parsed.items[0].BankTransactionID).toBe("00000000-0000-0000-0000-000000000200");
    expect(parsed.items[1].BankTransactionID).toBe("00000000-0000-0000-0000-000000000201");
  });

  test("handles non-object response gracefully", () => {
    expect(parseInvoicesResponse(null)).toEqual({ items: [] });
    expect(parseInvoicesResponse("string")).toEqual({ items: [] });
    expect(parseContactsResponse(null)).toEqual({ items: [] });
    expect(parseBankTransactionsResponse(null)).toEqual({ items: [] });
  });

  test("handles response with missing array", () => {
    expect(parseInvoicesResponse({})).toEqual({ items: [] });
    expect(parseContactsResponse({})).toEqual({ items: [] });
    expect(parseBankTransactionsResponse({})).toEqual({ items: [] });
  });

  test("handles empty array in response", () => {
    const parsed = parseInvoicesResponse({ Invoices: [] });
    expect(parsed.items).toHaveLength(0);
  });

  test("throws on invoice missing required InvoiceID", () => {
    expect(() => parseInvoicesResponse({ Invoices: [{ Total: 100 }] })).toThrow("InvoiceID is required");
  });

  test("throws on contact missing required ContactID", () => {
    expect(() => parseContactsResponse({ Contacts: [{ Name: "Test" }] })).toThrow("ContactID is required");
  });

  test("throws on bank transaction missing required BankTransactionID", () => {
    expect(() => parseBankTransactionsResponse({ BankTransactions: [{ Total: 50 }] })).toThrow("BankTransactionID is required");
  });
});
