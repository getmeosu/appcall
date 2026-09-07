import { normalizeInvoice, parseInvoicesResponse, type NormalizedInvoice } from "./objects";
import { normalizeCustomer, parseCustomersResponse, type NormalizedCustomer } from "./objects";
import { normalizePayment, parsePaymentsResponse, type NormalizedPayment } from "./objects";

// ─── Invoices list sync ──────────────────────────────────────────────

export type InvoicesListSyncInput = { response: unknown };
export type InvoicesListSyncResult = {
  provider: "quickbooks";
  operation: "invoices.list";
  items: NormalizedInvoice[];
  hasMore: boolean;
  totalCount: number;
  maxResults: number;
  startIndex: number;
};

export function executeInvoicesListSync(input: InvoicesListSyncInput): InvoicesListSyncResult {
  const response = requireRecord(input.response, "response");
  const parsed = parseInvoicesResponse(response);
  return {
    provider: "quickbooks",
    operation: "invoices.list",
    items: parsed.items.map((inv) => normalizeInvoice(inv)),
    hasMore: parsed.hasMore,
    totalCount: parsed.totalCount,
    maxResults: parsed.maxResults,
    startIndex: parsed.startIndex,
  };
}

// ─── Customers list sync ─────────────────────────────────────────────

export type CustomersListSyncInput = { response: unknown };
export type CustomersListSyncResult = {
  provider: "quickbooks";
  operation: "customers.list";
  items: NormalizedCustomer[];
  hasMore: boolean;
  totalCount: number;
  maxResults: number;
  startIndex: number;
};

export function executeCustomersListSync(input: CustomersListSyncInput): CustomersListSyncResult {
  const response = requireRecord(input.response, "response");
  const parsed = parseCustomersResponse(response);
  return {
    provider: "quickbooks",
    operation: "customers.list",
    items: parsed.items.map((cust) => normalizeCustomer(cust)),
    hasMore: parsed.hasMore,
    totalCount: parsed.totalCount,
    maxResults: parsed.maxResults,
    startIndex: parsed.startIndex,
  };
}

// ─── Payments list sync ──────────────────────────────────────────────

export type PaymentsListSyncInput = { response: unknown };
export type PaymentsListSyncResult = {
  provider: "quickbooks";
  operation: "payments.list";
  items: NormalizedPayment[];
  hasMore: boolean;
  totalCount: number;
  maxResults: number;
  startIndex: number;
};

export function executePaymentsListSync(input: PaymentsListSyncInput): PaymentsListSyncResult {
  const response = requireRecord(input.response, "response");
  const parsed = parsePaymentsResponse(response);
  return {
    provider: "quickbooks",
    operation: "payments.list",
    items: parsed.items.map((pay) => normalizePayment(pay)),
    hasMore: parsed.hasMore,
    totalCount: parsed.totalCount,
    maxResults: parsed.maxResults,
    startIndex: parsed.startIndex,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  return value as Record<string, unknown>;
}
