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

export interface NormalizedBill {
  id: string;
  provider: string;
  billNumber: string;
  status: string;
  vendorId: string;
  vendorName: string;
  total: number;
  currency: string;
  date: string | null;
  dueDate: string | null;
  updatedDateUTC: string | null;
  raw: Record<string, unknown>;
}

export interface NormalizedItem {
  id: string;
  provider: string;
  name: string;
  rate: number;
  sku: string;
  status: string;
  productType: string;
  updatedDateUTC: string | null;
  raw: Record<string, unknown>;
}

export interface NormalizedOrganization {
  id: string;
  provider: string;
  name: string;
  contactName: string;
  email: string;
  currency: string;
  timezone: string;
  isActive: boolean;
  raw: Record<string, unknown>;
}

interface ZohoBill {
  bill_id?: string;
  bill_number?: string | null;
  status?: string | null;
  vendor_id?: string | null;
  vendor_name?: string | null;
  total?: number | null;
  currency_code?: string | null;
  date?: string | null;
  due_date?: string | null;
  last_modified_time?: string | null;
}

interface ZohoItem {
  item_id?: string;
  name?: string | null;
  rate?: number | null;
  sku?: string | null;
  status?: string | null;
  product_type?: string | null;
  last_modified_time?: string | null;
}

interface ZohoOrganization {
  organization_id?: string;
  name?: string | null;
  contact_name?: string | null;
  email?: string | null;
  currency_code?: string | null;
  time_zone?: string | null;
  is_org_active?: boolean | null;
}

function pageInfo(raw: Record<string, unknown>): { hasMore: boolean; page: number } {
  const pageCtx = isRecord(raw.page_context) ? raw.page_context : {};
  return {
    hasMore: pageCtx.has_more_page === true,
    page: typeof pageCtx.page === "number" ? pageCtx.page : 1,
  };
}

export function normalizeBill(b: ZohoBill): NormalizedBill {
  return {
    id: str(b.bill_id),
    provider: "zoho-books",
    billNumber: b.bill_number ?? "",
    status: b.status ?? "",
    vendorId: b.vendor_id ?? "",
    vendorName: b.vendor_name ?? "",
    total: num(b.total),
    currency: b.currency_code ?? "",
    date: b.date ?? null,
    dueDate: b.due_date ?? null,
    updatedDateUTC: b.last_modified_time ?? null,
    raw: b as unknown as Record<string, unknown>,
  };
}

export function normalizeItem(i: ZohoItem): NormalizedItem {
  return {
    id: str(i.item_id),
    provider: "zoho-books",
    name: i.name ?? "",
    rate: num(i.rate),
    sku: i.sku ?? "",
    status: i.status ?? "",
    productType: i.product_type ?? "",
    updatedDateUTC: i.last_modified_time ?? null,
    raw: i as unknown as Record<string, unknown>,
  };
}

export function normalizeOrganization(o: ZohoOrganization): NormalizedOrganization {
  return {
    id: str(o.organization_id),
    provider: "zoho-books",
    name: o.name ?? "",
    contactName: o.contact_name ?? "",
    email: o.email ?? "",
    currency: o.currency_code ?? "",
    timezone: o.time_zone ?? "",
    isActive: o.is_org_active ?? false,
    raw: o as unknown as Record<string, unknown>,
  };
}

export function parseContactResource(raw: unknown): NormalizedContact | null {
  if (!isRecord(raw)) return null;
  if (isRecord(raw.contact)) return normalizeContact(raw.contact as ZohoContact);
  if (Array.isArray(raw.contacts) && isRecord(raw.contacts[0])) {
    return normalizeContact(raw.contacts[0] as ZohoContact);
  }
  return null;
}

export function parseInvoiceResource(raw: unknown): NormalizedInvoice | null {
  if (!isRecord(raw)) return null;
  if (isRecord(raw.invoice)) return normalizeInvoice(raw.invoice as ZohoInvoice);
  if (Array.isArray(raw.invoices) && isRecord(raw.invoices[0])) {
    return normalizeInvoice(raw.invoices[0] as ZohoInvoice);
  }
  return null;
}

export function parseBillsResponse(raw: unknown): {
  items: NormalizedBill[];
  hasMore: boolean;
  page: number;
} {
  if (!isRecord(raw)) return { items: [], hasMore: false, page: 1 };
  const bills = Array.isArray(raw.bills) ? raw.bills : isRecord(raw.bill) ? [raw.bill] : [];
  return {
    items: bills.filter(isRecord).map((b) => normalizeBill(b as ZohoBill)),
    ...pageInfo(raw),
  };
}

export function parseBillResource(raw: unknown): NormalizedBill | null {
  if (!isRecord(raw)) return null;
  if (isRecord(raw.bill)) return normalizeBill(raw.bill as ZohoBill);
  return parseBillsResponse(raw).items[0] ?? null;
}

export function parseItemsResponse(raw: unknown): {
  items: NormalizedItem[];
  hasMore: boolean;
  page: number;
} {
  if (!isRecord(raw)) return { items: [], hasMore: false, page: 1 };
  const items = Array.isArray(raw.items) ? raw.items : isRecord(raw.item) ? [raw.item] : [];
  return {
    items: items.filter(isRecord).map((i) => normalizeItem(i as ZohoItem)),
    ...pageInfo(raw),
  };
}

export function parseItemResource(raw: unknown): NormalizedItem | null {
  if (!isRecord(raw)) return null;
  if (isRecord(raw.item)) return normalizeItem(raw.item as ZohoItem);
  return parseItemsResponse(raw).items[0] ?? null;
}

export function parseOrganizationsResponse(raw: unknown): NormalizedOrganization[] {
  if (!isRecord(raw)) return [];
  if (isRecord(raw.organization)) return [normalizeOrganization(raw.organization as ZohoOrganization)];
  const orgs = Array.isArray(raw.organizations) ? raw.organizations : [];
  return orgs.filter(isRecord).map((o) => normalizeOrganization(o as ZohoOrganization));
}
