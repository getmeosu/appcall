// ─── Xero raw types ────────────────────────────────────────────────

export type XeroInvoice = {
  InvoiceID: string;
  InvoiceNumber?: string;
  Type?: string;
  Status?: string;
  Total?: number;
  CurrencyCode?: string;
  Date?: string;
  DueDate?: string;
  UpdatedDateUTC?: string;
  Contact?: { ContactID?: string; Name?: string };
  [key: string]: unknown;
};

export type XeroContact = {
  ContactID: string;
  Name?: string;
  FirstName?: string;
  LastName?: string;
  EmailAddress?: string;
  Phones?: Array<{ PhoneType?: string; PhoneNumber?: string }>;
  IsSupplier?: boolean;
  IsCustomer?: boolean;
  UpdatedDateUTC?: string;
  [key: string]: unknown;
};

export type XeroBankTransaction = {
  BankTransactionID: string;
  Type?: string;
  Date?: string;
  Total?: number;
  CurrencyCode?: string;
  Contact?: { ContactID?: string; Name?: string };
  LineItems?: Array<{ Description?: string }>;
  Status?: string;
  [key: string]: unknown;
};

// ─── Normalized types ──────────────────────────────────────────────

export type NormalizedInvoice = {
  id: string;
  provider: "xero";
  invoiceNumber: string;
  type: string;
  status: string;
  contactName: string;
  total: number;
  currency: string;
  date: string;
  dueDate: string;
  updatedDateUTC: string;
  modelVersion: "2026-05-17";
  raw: XeroInvoice;
};

export type NormalizedContact = {
  id: string;
  provider: "xero";
  name: string;
  firstName: string;
  lastName: string;
  emailAddress: string;
  phone: string;
  isSupplier: boolean;
  isCustomer: boolean;
  updatedDateUTC: string;
  modelVersion: "2026-05-17";
  raw: XeroContact;
};

export type NormalizedBankTransaction = {
  id: string;
  provider: "xero";
  type: string;
  date: string;
  amount: number;
  currency: string;
  contactName: string;
  description: string;
  status: string;
  modelVersion: "2026-05-17";
  raw: XeroBankTransaction;
};

// ─── Normalize functions ───────────────────────────────────────────

export function normalizeInvoice(inv: XeroInvoice): NormalizedInvoice {
  return {
    id: `xero-inv:${inv.InvoiceID}`,
    provider: "xero",
    invoiceNumber: inv.InvoiceNumber ?? "",
    type: inv.Type ?? "",
    status: inv.Status ?? "",
    contactName: extractContactName(inv.Contact),
    total: typeof inv.Total === "number" ? inv.Total : 0,
    currency: inv.CurrencyCode ?? "",
    date: inv.Date ?? "",
    dueDate: inv.DueDate ?? "",
    updatedDateUTC: inv.UpdatedDateUTC ?? "",
    modelVersion: "2026-05-17",
    raw: inv,
  };
}

export function normalizeContact(contact: XeroContact): NormalizedContact {
  return {
    id: `xero-contact:${contact.ContactID}`,
    provider: "xero",
    name: contact.Name ?? "",
    firstName: contact.FirstName ?? "",
    lastName: contact.LastName ?? "",
    emailAddress: contact.EmailAddress ?? "",
    phone: extractDefaultPhone(contact.Phones),
    isSupplier: contact.IsSupplier === true,
    isCustomer: contact.IsCustomer === true,
    updatedDateUTC: contact.UpdatedDateUTC ?? "",
    modelVersion: "2026-05-17",
    raw: contact,
  };
}

export function normalizeBankTransaction(txn: XeroBankTransaction): NormalizedBankTransaction {
  return {
    id: `xero-banktxn:${txn.BankTransactionID}`,
    provider: "xero",
    type: txn.Type ?? "",
    date: txn.Date ?? "",
    amount: typeof txn.Total === "number" ? txn.Total : 0,
    currency: txn.CurrencyCode ?? "",
    contactName: extractContactName(txn.Contact),
    description: extractFirstLineItemDescription(txn.LineItems),
    status: txn.Status ?? "",
    modelVersion: "2026-05-17",
    raw: txn,
  };
}

// ─── Parse response functions ──────────────────────────────────────

export type XeroListResult<T> = {
  items: T[];
};

export function parseInvoicesResponse(response: unknown): XeroListResult<XeroInvoice> {
  if (!isRecord(response)) return { items: [] };
  const invoices = response.Invoices;
  if (!Array.isArray(invoices)) return { items: [] };
  return { items: invoices.filter(isRecord).map((inv) => parseXeroInvoice(inv)) };
}

export function parseContactsResponse(response: unknown): XeroListResult<XeroContact> {
  if (!isRecord(response)) return { items: [] };
  const contacts = response.Contacts;
  if (!Array.isArray(contacts)) return { items: [] };
  return { items: contacts.filter(isRecord).map((c) => parseXeroContact(c)) };
}

export function parseBankTransactionsResponse(response: unknown): XeroListResult<XeroBankTransaction> {
  if (!isRecord(response)) return { items: [] };
  const transactions = response.BankTransactions;
  if (!Array.isArray(transactions)) return { items: [] };
  return { items: transactions.filter(isRecord).map((txn) => parseXeroBankTransaction(txn)) };
}

// ─── Internal parse helpers ────────────────────────────────────────

function parseXeroInvoice(r: Record<string, unknown>): XeroInvoice {
  return {
    InvoiceID: requireString(r.InvoiceID, "InvoiceID"),
    InvoiceNumber: typeof r.InvoiceNumber === "string" ? r.InvoiceNumber : undefined,
    Type: typeof r.Type === "string" ? r.Type : undefined,
    Status: typeof r.Status === "string" ? r.Status : undefined,
    Total: typeof r.Total === "number" ? r.Total : undefined,
    CurrencyCode: typeof r.CurrencyCode === "string" ? r.CurrencyCode : undefined,
    Date: typeof r.Date === "string" ? r.Date : undefined,
    DueDate: typeof r.DueDate === "string" ? r.DueDate : undefined,
    UpdatedDateUTC: typeof r.UpdatedDateUTC === "string" ? r.UpdatedDateUTC : undefined,
    Contact: isRecord(r.Contact)
      ? {
          ContactID: typeof r.Contact.ContactID === "string" ? r.Contact.ContactID : undefined,
          Name: typeof r.Contact.Name === "string" ? r.Contact.Name : undefined,
        }
      : undefined,
  };
}

function parseXeroContact(r: Record<string, unknown>): XeroContact {
  return {
    ContactID: requireString(r.ContactID, "ContactID"),
    Name: typeof r.Name === "string" ? r.Name : undefined,
    FirstName: typeof r.FirstName === "string" ? r.FirstName : undefined,
    LastName: typeof r.LastName === "string" ? r.LastName : undefined,
    EmailAddress: typeof r.EmailAddress === "string" ? r.EmailAddress : undefined,
    Phones: Array.isArray(r.Phones)
      ? (r.Phones as unknown[]).filter(isRecord).map((p) => ({
          PhoneType: typeof p.PhoneType === "string" ? p.PhoneType : undefined,
          PhoneNumber: typeof p.PhoneNumber === "string" ? p.PhoneNumber : undefined,
        }))
      : undefined,
    IsSupplier: r.IsSupplier === true,
    IsCustomer: r.IsCustomer === true,
    UpdatedDateUTC: typeof r.UpdatedDateUTC === "string" ? r.UpdatedDateUTC : undefined,
  };
}

function parseXeroBankTransaction(r: Record<string, unknown>): XeroBankTransaction {
  return {
    BankTransactionID: requireString(r.BankTransactionID, "BankTransactionID"),
    Type: typeof r.Type === "string" ? r.Type : undefined,
    Date: typeof r.Date === "string" ? r.Date : undefined,
    Total: typeof r.Total === "number" ? r.Total : undefined,
    CurrencyCode: typeof r.CurrencyCode === "string" ? r.CurrencyCode : undefined,
    Contact: isRecord(r.Contact)
      ? {
          ContactID: typeof r.Contact.ContactID === "string" ? r.Contact.ContactID : undefined,
          Name: typeof r.Contact.Name === "string" ? r.Contact.Name : undefined,
        }
      : undefined,
    LineItems: Array.isArray(r.LineItems)
      ? (r.LineItems as unknown[]).filter(isRecord).map((li) => ({
          Description: typeof li.Description === "string" ? li.Description : undefined,
        }))
      : undefined,
    Status: typeof r.Status === "string" ? r.Status : undefined,
  };
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// ─── Extraction helpers ────────────────────────────────────────────

function extractContactName(contact: { Name?: string } | undefined): string {
  if (!contact || typeof contact.Name !== "string") return "";
  return contact.Name;
}

function extractDefaultPhone(phones: Array<{ PhoneType?: string; PhoneNumber?: string }> | undefined): string {
  if (!Array.isArray(phones)) return "";
  const defaultPhone = phones.find((p) => p.PhoneType === "DEFAULT" || p.PhoneType === "MOBILE");
  if (defaultPhone && typeof defaultPhone.PhoneNumber === "string") return defaultPhone.PhoneNumber;
  if (phones.length > 0 && typeof phones[0].PhoneNumber === "string") return phones[0].PhoneNumber;
  return "";
}

function extractFirstLineItemDescription(lineItems: Array<{ Description?: string }> | undefined): string {
  if (!Array.isArray(lineItems) || lineItems.length === 0) return "";
  const first = lineItems[0];
  return typeof first.Description === "string" ? first.Description : "";
}
