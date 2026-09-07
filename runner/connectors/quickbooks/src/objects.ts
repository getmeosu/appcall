import { prop, propNum } from "./http";

// ─── QuickBooks raw types ────────────────────────────────────────────

export type QBInvoice = {
  Id: string;
  DocNumber?: string;
  TotalAmt?: number;
  CurrencyRef?: { value?: string };
  Balance?: number;
  TxnStatus?: string;
  CustomerRef?: { name?: string; value?: string };
  DueDate?: string;
  MetaData?: { CreateTime?: string };
  [key: string]: unknown;
};

export type QBCustomer = {
  Id: string;
  DisplayName?: string;
  PrimaryEmailAddr?: { Address?: string };
  Balance?: number;
  TotalSales?: number;
  MetaData?: { CreateTime?: string };
  [key: string]: unknown;
};

export type QBPayment = {
  Id: string;
  TotalAmt?: number;
  CurrencyRef?: { value?: string };
  TxnDate?: string;
  PaymentMethodRef?: { name?: string };
  CustomerRef?: { name?: string; value?: string };
  MetaData?: { CreateTime?: string };
  [key: string]: unknown;
};

// ─── Normalized types ────────────────────────────────────────────────

export type NormalizedInvoice = {
  id: string;
  provider: "quickbooks";
  docNumber: string;
  totalAmt: number;
  currency: string;
  status: string;
  customerName: string;
  dueDate: string;
  createdAt: string;
  modelVersion: "2026-05-16";
  raw: QBInvoice;
};

export type NormalizedCustomer = {
  id: string;
  provider: "quickbooks";
  displayName: string;
  email: string;
  balance: number;
  totalSales: number;
  createdAt: string;
  modelVersion: "2026-05-16";
  raw: QBCustomer;
};

export type NormalizedPayment = {
  id: string;
  provider: "quickbooks";
  totalAmt: number;
  currency: string;
  txnDate: string;
  paymentMethod: string;
  customerName: string;
  createdAt: string;
  modelVersion: "2026-05-16";
  raw: QBPayment;
};

// ─── Normalize functions ─────────────────────────────────────────────

export function normalizeInvoice(inv: QBInvoice): NormalizedInvoice {
  return {
    id: `qb-inv:${inv.Id}`,
    provider: "quickbooks",
    docNumber: inv.DocNumber ?? "",
    totalAmt: propNum(inv, "TotalAmt"),
    currency: prop(inv.CurrencyRef, "value"),
    status: inv.TxnStatus ?? "",
    customerName: prop(inv.CustomerRef, "name"),
    dueDate: inv.DueDate ?? "",
    createdAt: prop(inv.MetaData, "CreateTime"),
    modelVersion: "2026-05-16",
    raw: inv,
  };
}

export function normalizeCustomer(cust: QBCustomer): NormalizedCustomer {
  return {
    id: `qb-cust:${cust.Id}`,
    provider: "quickbooks",
    displayName: cust.DisplayName ?? "",
    email: prop(cust.PrimaryEmailAddr, "Address"),
    balance: propNum(cust, "Balance"),
    totalSales: propNum(cust, "TotalSales"),
    createdAt: prop(cust.MetaData, "CreateTime"),
    modelVersion: "2026-05-16",
    raw: cust,
  };
}

export function normalizePayment(pay: QBPayment): NormalizedPayment {
  return {
    id: `qb-pay:${pay.Id}`,
    provider: "quickbooks",
    totalAmt: propNum(pay, "TotalAmt"),
    currency: prop(pay.CurrencyRef, "value"),
    txnDate: pay.TxnDate ?? "",
    paymentMethod: prop(pay.PaymentMethodRef, "name"),
    customerName: prop(pay.CustomerRef, "name"),
    createdAt: prop(pay.MetaData, "CreateTime"),
    modelVersion: "2026-05-16",
    raw: pay,
  };
}

// ─── Parse response functions ────────────────────────────────────────

export type QBListResult<T> = {
  items: T[];
  totalCount: number;
  maxResults: number;
  startIndex: number;
  hasMore: boolean;
};

export function parseInvoicesResponse(response: unknown): QBListResult<QBInvoice> {
  if (!isRecord(response)) return { items: [], totalCount: 0, maxResults: 0, startIndex: 1, hasMore: false };
  const invoices = response.Invoice;
  if (!Array.isArray(invoices)) return { items: [], totalCount: 0, maxResults: 0, startIndex: 1, hasMore: false };

  const totalCount = typeof response.totalCount === "number" ? response.totalCount : 0;
  const maxResults = typeof response.maxResults === "number" ? response.maxResults : 100;
  const startIndex = typeof response.startIndex === "number" ? response.startIndex : 1;

  return {
    items: invoices.filter(isRecord).map((inv) => parseQBInvoice(inv)),
    totalCount,
    maxResults,
    startIndex,
    hasMore: totalCount > startIndex + maxResults - 1,
  };
}

export function parseCustomersResponse(response: unknown): QBListResult<QBCustomer> {
  if (!isRecord(response)) return { items: [], totalCount: 0, maxResults: 0, startIndex: 1, hasMore: false };
  const customers = response.Customer;
  if (!Array.isArray(customers)) return { items: [], totalCount: 0, maxResults: 0, startIndex: 1, hasMore: false };

  const totalCount = typeof response.totalCount === "number" ? response.totalCount : 0;
  const maxResults = typeof response.maxResults === "number" ? response.maxResults : 100;
  const startIndex = typeof response.startIndex === "number" ? response.startIndex : 1;

  return {
    items: customers.filter(isRecord).map((cust) => parseQBCustomer(cust)),
    totalCount,
    maxResults,
    startIndex,
    hasMore: totalCount > startIndex + maxResults - 1,
  };
}

export function parsePaymentsResponse(response: unknown): QBListResult<QBPayment> {
  if (!isRecord(response)) return { items: [], totalCount: 0, maxResults: 0, startIndex: 1, hasMore: false };
  const payments = response.Payment;
  if (!Array.isArray(payments)) return { items: [], totalCount: 0, maxResults: 0, startIndex: 1, hasMore: false };

  const totalCount = typeof response.totalCount === "number" ? response.totalCount : 0;
  const maxResults = typeof response.maxResults === "number" ? response.maxResults : 100;
  const startIndex = typeof response.startIndex === "number" ? response.startIndex : 1;

  return {
    items: payments.filter(isRecord).map((pay) => parseQBPayment(pay)),
    totalCount,
    maxResults,
    startIndex,
    hasMore: totalCount > startIndex + maxResults - 1,
  };
}

// ─── Internal parse helpers ──────────────────────────────────────────

function parseQBInvoice(r: Record<string, unknown>): QBInvoice {
  return {
    Id: requireString(r.Id, "Id"),
    DocNumber: typeof r.DocNumber === "string" ? r.DocNumber : undefined,
    TotalAmt: typeof r.TotalAmt === "number" ? r.TotalAmt : undefined,
    CurrencyRef: isRecord(r.CurrencyRef) ? { value: typeof r.CurrencyRef.value === "string" ? r.CurrencyRef.value : undefined } : undefined,
    Balance: typeof r.Balance === "number" ? r.Balance : undefined,
    TxnStatus: typeof r.TxnStatus === "string" ? r.TxnStatus : undefined,
    CustomerRef: isRecord(r.CustomerRef) ? { name: typeof r.CustomerRef.name === "string" ? r.CustomerRef.name : undefined, value: typeof r.CustomerRef.value === "string" ? r.CustomerRef.value : undefined } : undefined,
    DueDate: typeof r.DueDate === "string" ? r.DueDate : undefined,
    MetaData: isRecord(r.MetaData) ? { CreateTime: typeof r.MetaData.CreateTime === "string" ? r.MetaData.CreateTime : undefined } : undefined,
  };
}

function parseQBCustomer(r: Record<string, unknown>): QBCustomer {
  return {
    Id: requireString(r.Id, "Id"),
    DisplayName: typeof r.DisplayName === "string" ? r.DisplayName : undefined,
    PrimaryEmailAddr: isRecord(r.PrimaryEmailAddr) ? { Address: typeof r.PrimaryEmailAddr.Address === "string" ? r.PrimaryEmailAddr.Address : undefined } : undefined,
    Balance: typeof r.Balance === "number" ? r.Balance : undefined,
    TotalSales: typeof r.TotalSales === "number" ? r.TotalSales : undefined,
    MetaData: isRecord(r.MetaData) ? { CreateTime: typeof r.MetaData.CreateTime === "string" ? r.MetaData.CreateTime : undefined } : undefined,
  };
}

function parseQBPayment(r: Record<string, unknown>): QBPayment {
  return {
    Id: requireString(r.Id, "Id"),
    TotalAmt: typeof r.TotalAmt === "number" ? r.TotalAmt : undefined,
    CurrencyRef: isRecord(r.CurrencyRef) ? { value: typeof r.CurrencyRef.value === "string" ? r.CurrencyRef.value : undefined } : undefined,
    TxnDate: typeof r.TxnDate === "string" ? r.TxnDate : undefined,
    PaymentMethodRef: isRecord(r.PaymentMethodRef) ? { name: typeof r.PaymentMethodRef.name === "string" ? r.PaymentMethodRef.name : undefined } : undefined,
    CustomerRef: isRecord(r.CustomerRef) ? { name: typeof r.CustomerRef.name === "string" ? r.CustomerRef.name : undefined, value: typeof r.CustomerRef.value === "string" ? r.CustomerRef.value : undefined } : undefined,
    MetaData: isRecord(r.MetaData) ? { CreateTime: typeof r.MetaData.CreateTime === "string" ? r.MetaData.CreateTime : undefined } : undefined,
  };
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
