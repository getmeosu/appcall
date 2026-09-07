function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string { return typeof v === "string" ? v : ""; }
function num(v: unknown): number { return typeof v === "number" ? v : 0; }

export interface NormalizedInvoice {
  id: string;
  provider: string;
  invoiceNumber: string;
  type: string;
  status: string;
  contactName: string;
  total: number;
  currency: string;
  date: string | null;
  dueDate: string | null;
  updatedDateUTC: string | null;
  raw: Record<string, unknown>;
}

export interface NormalizedContact {
  id: string;
  provider: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  isSupplier: boolean;
  isCustomer: boolean;
  updatedDateUTC: string | null;
  raw: Record<string, unknown>;
}

export interface NormalizedPayment {
  id: string;
  provider: string;
  invoiceId: string;
  customerId: string;
  amount: number;
  currency: string;
  date: string | null;
  paymentMode: string;
  status: string;
  createdAt: string | null;
  raw: Record<string, unknown>;
}

interface ZohoInvoice {
  invoice_id?: string;
  invoice_number?: string | null;
  type?: string | null;
  status?: string | null;
  contact_name?: string | null;
  total?: number | null;
  currency_code?: string | null;
  date?: string | null;
  due_date?: string | null;
  last_modified_time?: string | null;
  contact_id?: string | null;
}

interface ZohoContact {
  contact_id?: string;
  contact_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  is_supplier?: boolean | null;
  is_customer?: boolean | null;
  last_modified_time?: string | null;
}

interface ZohoPayment {
  payment_id?: string;
  invoice_id?: string | null;
  customer_id?: string | null;
  amount?: number | null;
  currency_code?: string | null;
  date?: string | null;
  payment_mode?: string | null;
  status?: string | null;
  created_time?: string | null;
}

export function normalizeInvoice(i: ZohoInvoice): NormalizedInvoice {
  return {
    id: str(i.invoice_id),
    provider: "zoho-books",
    invoiceNumber: i.invoice_number ?? "",
    type: i.type ?? "",
    status: i.status ?? "",
    contactName: i.contact_name ?? "",
    total: num(i.total),
    currency: i.currency_code ?? "",
    date: i.date ?? null,
    dueDate: i.due_date ?? null,
    updatedDateUTC: i.last_modified_time ?? null,
    raw: i as unknown as Record<string, unknown>,
  };
}

export function normalizeContact(c: ZohoContact): NormalizedContact {
  return {
    id: str(c.contact_id),
    provider: "zoho-books",
    name: c.contact_name ?? "",
    firstName: c.first_name ?? "",
    lastName: c.last_name ?? "",
    email: c.email ?? "",
    phone: c.phone ?? "",
    isSupplier: c.is_supplier ?? false,
    isCustomer: c.is_customer ?? false,
    updatedDateUTC: c.last_modified_time ?? null,
    raw: c as unknown as Record<string, unknown>,
  };
}

export function normalizePayment(p: ZohoPayment): NormalizedPayment {
  return {
    id: str(p.payment_id),
    provider: "zoho-books",
    invoiceId: p.invoice_id ?? "",
    customerId: p.customer_id ?? "",
    amount: num(p.amount),
    currency: p.currency_code ?? "",
    date: p.date ?? null,
    paymentMode: p.payment_mode ?? "",
    status: p.status ?? "",
    createdAt: p.created_time ?? null,
    raw: p as unknown as Record<string, unknown>,
  };
}

export function parseInvoicesResponse(raw: unknown): {
  items: NormalizedInvoice[];
  hasMore: boolean;
  page: number;
} {
  if (!isRecord(raw)) return { items: [], hasMore: false, page: 1 };
  const invoices = Array.isArray(raw.invoices) ? raw.invoices : [];
  const pageCtx = isRecord(raw.page_context) ? raw.page_context : {};
  return {
    items: invoices.filter(isRecord).map((i: Record<string, unknown>) => normalizeInvoice(i as ZohoInvoice)),
    hasMore: pageCtx.has_more_page === true,
    page: typeof pageCtx.page === "number" ? pageCtx.page : 1,
  };
}

export function parseContactsResponse(raw: unknown): {
  items: NormalizedContact[];
  hasMore: boolean;
  page: number;
} {
  if (!isRecord(raw)) return { items: [], hasMore: false, page: 1 };
  const contacts = Array.isArray(raw.contacts) ? raw.contacts : [];
  const pageCtx = isRecord(raw.page_context) ? raw.page_context : {};
  return {
    items: contacts.filter(isRecord).map((c: Record<string, unknown>) => normalizeContact(c as ZohoContact)),
    hasMore: pageCtx.has_more_page === true,
    page: typeof pageCtx.page === "number" ? pageCtx.page : 1,
  };
}

export function parsePaymentsResponse(raw: unknown): {
  items: NormalizedPayment[];
  hasMore: boolean;
  page: number;
} {
  if (!isRecord(raw)) return { items: [], hasMore: false, page: 1 };
  const payments = Array.isArray(raw.payments) ? raw.payments : [];
  const pageCtx = isRecord(raw.page_context) ? raw.page_context : {};
  return {
    items: payments.filter(isRecord).map((p: Record<string, unknown>) => normalizePayment(p as ZohoPayment)),
    hasMore: pageCtx.has_more_page === true,
    page: typeof pageCtx.page === "number" ? pageCtx.page : 1,
  };
}
