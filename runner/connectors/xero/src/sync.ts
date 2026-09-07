import { normalizeInvoice, parseInvoicesResponse, type NormalizedInvoice } from "./objects";
import { normalizeContact, parseContactsResponse, type NormalizedContact } from "./objects";
import { normalizeBankTransaction, parseBankTransactionsResponse, type NormalizedBankTransaction } from "./objects";

// ─── Invoices list sync ──────────────────────────────────────────────

export type InvoicesListSyncInput = { response: unknown };
export type InvoicesListSyncResult = {
  provider: "xero";
  operation: "invoices.list";
  items: NormalizedInvoice[];
};

export function executeInvoicesListSync(input: InvoicesListSyncInput): InvoicesListSyncResult {
  const response = requireRecord(input.response, "response");
  const parsed = parseInvoicesResponse(response);
  return {
    provider: "xero",
    operation: "invoices.list",
    items: parsed.items.map((inv) => normalizeInvoice(inv)),
  };
}

// ─── Contacts list sync ──────────────────────────────────────────────

export type ContactsListSyncInput = { response: unknown };
export type ContactsListSyncResult = {
  provider: "xero";
  operation: "contacts.list";
  items: NormalizedContact[];
};

export function executeContactsListSync(input: ContactsListSyncInput): ContactsListSyncResult {
  const response = requireRecord(input.response, "response");
  const parsed = parseContactsResponse(response);
  return {
    provider: "xero",
    operation: "contacts.list",
    items: parsed.items.map((contact) => normalizeContact(contact)),
  };
}

// ─── Bank transactions list sync ─────────────────────────────────────

export type BankTransactionsListSyncInput = { response: unknown };
export type BankTransactionsListSyncResult = {
  provider: "xero";
  operation: "bank_transactions.list";
  items: NormalizedBankTransaction[];
};

export function executeBankTransactionsListSync(input: BankTransactionsListSyncInput): BankTransactionsListSyncResult {
  const response = requireRecord(input.response, "response");
  const parsed = parseBankTransactionsResponse(response);
  return {
    provider: "xero",
    operation: "bank_transactions.list",
    items: parsed.items.map((txn) => normalizeBankTransaction(txn)),
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  return value as Record<string, unknown>;
}
