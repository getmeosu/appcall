import { parseInvoicesResponse, parseContactsResponse, parsePaymentsResponse } from "./objects";
import type { NormalizedInvoice, NormalizedContact, NormalizedPayment } from "./objects";

export type InvoicesListSyncInput = { response: unknown };
export type InvoicesListSyncResult = { provider: "zoho-books"; operation: "invoices.list"; items: NormalizedInvoice[]; hasMore: boolean; page: number };

export function executeInvoicesListSync(input: InvoicesListSyncInput): InvoicesListSyncResult {
  const parsed = parseInvoicesResponse(input.response);
  return { provider: "zoho-books", operation: "invoices.list", items: parsed.items, hasMore: parsed.hasMore, page: parsed.page };
}

export type ContactsListSyncInput = { response: unknown };
export type ContactsListSyncResult = { provider: "zoho-books"; operation: "contacts.list"; items: NormalizedContact[]; hasMore: boolean; page: number };

export function executeContactsListSync(input: ContactsListSyncInput): ContactsListSyncResult {
  const parsed = parseContactsResponse(input.response);
  return { provider: "zoho-books", operation: "contacts.list", items: parsed.items, hasMore: parsed.hasMore, page: parsed.page };
}

export type PaymentsListSyncInput = { response: unknown };
export type PaymentsListSyncResult = { provider: "zoho-books"; operation: "payments.list"; items: NormalizedPayment[]; hasMore: boolean; page: number };

export function executePaymentsListSync(input: PaymentsListSyncInput): PaymentsListSyncResult {
  const parsed = parsePaymentsResponse(input.response);
  return { provider: "zoho-books", operation: "payments.list", items: parsed.items, hasMore: parsed.hasMore, page: parsed.page };
}
