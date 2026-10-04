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

export type XeroAccount = {
  AccountID: string;
  Code?: string;
  Name?: string;
  Type?: string;
  Status?: string;
  TaxType?: string;
  Description?: string;
  BankAccountNumber?: string;
  CurrencyCode?: string;
  [key: string]: unknown;
};

export type XeroPayment = {
  PaymentID: string;
  Date?: string;
  Amount?: number;
  CurrencyRate?: number;
  Status?: string;
  PaymentType?: string;
  Reference?: string;
  Invoice?: { InvoiceID?: string; InvoiceNumber?: string };
  Account?: { AccountID?: string; Code?: string };
  [key: string]: unknown;
};

export type XeroItem = {
  ItemID: string;
  Code?: string;
  Name?: string;
  Description?: string;
  PurchaseDescription?: string;
  IsSold?: boolean;
  IsPurchased?: boolean;
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

export type NormalizedAccount = {
  id: string;
  provider: "xero";
  accountId: string;
  code: string;
  name: string;
  type: string;
  status: string;
  taxType: string;
  description: string;
  modelVersion: "2026-05-17";
  raw: XeroAccount;
};

export type NormalizedPayment = {
  id: string;
  provider: "xero";
  paymentId: string;
  date: string;
  amount: number;
  status: string;
  paymentType: string;
  reference: string;
  invoiceId: string;
  accountId: string;
  modelVersion: "2026-05-17";
  raw: XeroPayment;
};

export type NormalizedItem = {
  id: string;
  provider: "xero";
  itemId: string;
  code: string;
  name: string;
  description: string;
  isSold: boolean;
  isPurchased: boolean;
  modelVersion: "2026-05-17";
  raw: XeroItem;
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

export function normalizeAccount(account: XeroAccount): NormalizedAccount {
  return {
    id: `xero-account:${account.AccountID}`,
    provider: "xero",
    accountId: account.AccountID,
    code: account.Code ?? "",
    name: account.Name ?? "",
    type: account.Type ?? "",
    status: account.Status ?? "",
    taxType: account.TaxType ?? "",
    description: account.Description ?? "",
    modelVersion: "2026-05-17",
    raw: account,
  };
}

export function normalizePayment(payment: XeroPayment): NormalizedPayment {
  return {
    id: `xero-payment:${payment.PaymentID}`,
    provider: "xero",
    paymentId: payment.PaymentID,
    date: payment.Date ?? "",
    amount: typeof payment.Amount === "number" ? payment.Amount : 0,
    status: payment.Status ?? "",
    paymentType: payment.PaymentType ?? "",
    reference: payment.Reference ?? "",
    invoiceId: payment.Invoice?.InvoiceID ?? "",
    accountId: payment.Account?.AccountID ?? "",
    modelVersion: "2026-05-17",
    raw: payment,
  };
}

export function normalizeItem(item: XeroItem): NormalizedItem {
  return {
    id: `xero-item:${item.ItemID}`,
    provider: "xero",
    itemId: item.ItemID,
    code: item.Code ?? "",
    name: item.Name ?? "",
    description: item.Description ?? "",
    isSold: item.IsSold === true,
    isPurchased: item.IsPurchased === true,
    modelVersion: "2026-05-17",
    raw: item,
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

export function parseAccountsResponse(response: unknown): XeroListResult<XeroAccount> {
  if (!isRecord(response)) return { items: [] };
  const accounts = response.Accounts;
  if (!Array.isArray(accounts)) return { items: [] };
  return { items: accounts.filter(isRecord).map((account) => parseXeroAccount(account)) };
}

export function parsePaymentsResponse(response: unknown): XeroListResult<XeroPayment> {
  if (!isRecord(response)) return { items: [] };
  const payments = response.Payments;
  if (!Array.isArray(payments)) return { items: [] };
  return { items: payments.filter(isRecord).map((payment) => parseXeroPayment(payment)) };
}

export function parseItemsResponse(response: unknown): XeroListResult<XeroItem> {
  if (!isRecord(response)) return { items: [] };
  const items = response.Items;
  if (!Array.isArray(items)) return { items: [] };
  return { items: items.filter(isRecord).map((item) => parseXeroItem(item)) };
}

export function firstNamedRecord(response: unknown, key: string): Record<string, unknown> {
  if (!isRecord(response)) return {};
  const value = response[key];
  if (Array.isArray(value) && value.length > 0 && isRecord(value[0])) return value[0];
  return response;
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

function parseXeroAccount(r: Record<string, unknown>): XeroAccount {
  return {
    AccountID: requireString(r.AccountID, "AccountID"),
    Code: typeof r.Code === "string" ? r.Code : undefined,
    Name: typeof r.Name === "string" ? r.Name : undefined,
    Type: typeof r.Type === "string" ? r.Type : undefined,
    Status: typeof r.Status === "string" ? r.Status : undefined,
    TaxType: typeof r.TaxType === "string" ? r.TaxType : undefined,
    Description: typeof r.Description === "string" ? r.Description : undefined,
    BankAccountNumber: typeof r.BankAccountNumber === "string" ? r.BankAccountNumber : undefined,
    CurrencyCode: typeof r.CurrencyCode === "string" ? r.CurrencyCode : undefined,
  };
}

function parseXeroPayment(r: Record<string, unknown>): XeroPayment {
  return {
    PaymentID: requireString(r.PaymentID, "PaymentID"),
    Date: typeof r.Date === "string" ? r.Date : undefined,
    Amount: typeof r.Amount === "number" ? r.Amount : undefined,
    CurrencyRate: typeof r.CurrencyRate === "number" ? r.CurrencyRate : undefined,
    Status: typeof r.Status === "string" ? r.Status : undefined,
    PaymentType: typeof r.PaymentType === "string" ? r.PaymentType : undefined,
    Reference: typeof r.Reference === "string" ? r.Reference : undefined,
    Invoice: isRecord(r.Invoice)
      ? {
          InvoiceID: typeof r.Invoice.InvoiceID === "string" ? r.Invoice.InvoiceID : undefined,
          InvoiceNumber: typeof r.Invoice.InvoiceNumber === "string" ? r.Invoice.InvoiceNumber : undefined,
        }
      : undefined,
    Account: isRecord(r.Account)
      ? {
          AccountID: typeof r.Account.AccountID === "string" ? r.Account.AccountID : undefined,
          Code: typeof r.Account.Code === "string" ? r.Account.Code : undefined,
        }
      : undefined,
  };
}

function parseXeroItem(r: Record<string, unknown>): XeroItem {
  return {
    ItemID: requireString(r.ItemID, "ItemID"),
    Code: typeof r.Code === "string" ? r.Code : undefined,
    Name: typeof r.Name === "string" ? r.Name : undefined,
    Description: typeof r.Description === "string" ? r.Description : undefined,
    PurchaseDescription: typeof r.PurchaseDescription === "string" ? r.PurchaseDescription : undefined,
    IsSold: r.IsSold === true,
    IsPurchased: r.IsPurchased === true,
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
