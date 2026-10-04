import { createXeroClient, throwXeroHttpError } from "./http";
import {
  firstNamedRecord,
  normalizeAccount,
  normalizeContact,
  normalizeInvoice,
  normalizeItem,
  normalizePayment,
  parseAccountsResponse,
  parseContactsResponse,
  parseInvoicesResponse,
  parseItemsResponse,
  parsePaymentsResponse,
  type XeroAccount,
  type XeroContact,
  type XeroInvoice,
  type XeroItem,
  type XeroPayment,
} from "./objects";

type XeroAuth = { accessToken: string; tenantId: string; fetch?: typeof fetch };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function hasXeroAuth(input: unknown): input is Record<string, unknown> & XeroAuth {
  return isRecord(input) && typeof input.accessToken === "string" && typeof input.tenantId === "string";
}

function clientFor(input: XeroAuth, operation: string) {
  return createXeroClient({
    accessToken: input.accessToken,
    tenantId: input.tenantId,
    fetch: typeof input.fetch === "function" ? input.fetch : undefined,
    operation,
  });
}

function pageQuery(page?: number): string {
  return page && page > 0 ? `?page=${page}` : "";
}

async function xeroOk(
  input: XeroAuth,
  operation: string,
  path: string,
  init: RequestInit,
  okStatuses: number[],
  fallback: string,
) {
  const result = await clientFor(input, operation).fetchJSON(path, init);
  if (okStatuses.includes(result.status)) return result;
  throwXeroHttpError(result.status, result.headers, result.body, fallback);
}

function envelope(action: string, validated: unknown) {
  return { connector: "xero", action, source: "connector", validated };
}

// ─── invoices.get / create / update ───────────────────────────────────────────

export type GetInvoiceInput = { invoiceId: string };
export function validateGetInvoiceInput(input: unknown): GetInvoiceInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  return { invoiceId: requireString(input.invoiceId, "invoiceId") };
}

export function getInvoice(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  const validated = validateGetInvoiceInput(input);
  if (!hasXeroAuth(input)) return envelope("invoices.get", validated);
  return xeroOk(input, "invoices.get", `/Invoices/${encodeURIComponent(validated.invoiceId)}`, {}, [200], "Xero rejected the get invoice request.").then((result) => ({
    connector: "xero",
    action: "invoices.get",
    source: "connector",
    invoice: normalizeInvoice(parseInvoicesResponse(result.body).items[0] ?? (firstNamedRecord(result.body, "Invoices") as XeroInvoice)),
  }));
}

export type CreateInvoiceInput = {
  type: string;
  contactId?: string;
  contactName?: string;
  lineItems: Array<{ description: string; quantity?: number; unitAmount?: number; accountCode?: string }>;
  date?: string;
  dueDate?: string;
  invoiceNumber?: string;
  reference?: string;
  status?: string;
  currencyCode?: string;
};
export function validateCreateInvoiceInput(input: unknown): CreateInvoiceInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  const contactId = optionalString(input.contactId);
  const contactName = optionalString(input.contactName);
  if (!contactId && !contactName) throw new Error("contactId or contactName is required");
  if (!Array.isArray(input.lineItems) || input.lineItems.length === 0) throw new Error("lineItems must be a non-empty array");
  return {
    type: requireString(input.type, "type"),
    contactId,
    contactName,
    lineItems: input.lineItems.filter(isRecord).map((item, index) => ({
      description: requireString(item.description, `lineItems[${index}].description`),
      quantity: optionalNumber(item.quantity),
      unitAmount: optionalNumber(item.unitAmount),
      accountCode: optionalString(item.accountCode),
    })),
    date: optionalString(input.date),
    dueDate: optionalString(input.dueDate),
    invoiceNumber: optionalString(input.invoiceNumber),
    reference: optionalString(input.reference),
    status: optionalString(input.status),
    currencyCode: optionalString(input.currencyCode),
  };
}

function invoiceBody(payload: CreateInvoiceInput | UpdateInvoiceInput): Record<string, unknown> {
  const invoice: Record<string, unknown> = {};
  if ("type" in payload && payload.type) invoice.Type = payload.type;
  if ("contactId" in payload || "contactName" in payload) {
    const contact: Record<string, unknown> = {};
    if (payload.contactId) contact.ContactID = payload.contactId;
    if (payload.contactName) contact.Name = payload.contactName;
    if (Object.keys(contact).length > 0) invoice.Contact = contact;
  }
  if (payload.lineItems) {
    invoice.LineItems = payload.lineItems.map((item) => {
      const line: Record<string, unknown> = { Description: item.description };
      if (item.quantity !== undefined) line.Quantity = item.quantity;
      if (item.unitAmount !== undefined) line.UnitAmount = item.unitAmount;
      if (item.accountCode) line.AccountCode = item.accountCode;
      return line;
    });
  }
  if (payload.date) invoice.Date = payload.date;
  if (payload.dueDate) invoice.DueDate = payload.dueDate;
  if (payload.invoiceNumber) invoice.InvoiceNumber = payload.invoiceNumber;
  if (payload.reference) invoice.Reference = payload.reference;
  if (payload.status) invoice.Status = payload.status;
  if (payload.currencyCode) invoice.CurrencyCode = payload.currencyCode;
  return { Invoices: [invoice] };
}

export function createInvoice(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  const validated = validateCreateInvoiceInput(input);
  if (!hasXeroAuth(input)) return envelope("invoices.create", validated);
  return xeroOk(input, "invoices.create", "/Invoices", { method: "PUT", body: JSON.stringify(invoiceBody(validated)) }, [200], "Xero rejected the create invoice request.").then((result) => ({
    connector: "xero",
    action: "invoices.create",
    source: "connector",
    invoice: normalizeInvoice(parseInvoicesResponse(result.body).items[0] ?? (firstNamedRecord(result.body, "Invoices") as XeroInvoice)),
  }));
}

export type UpdateInvoiceInput = {
  invoiceId: string;
  type?: string;
  contactId?: string;
  contactName?: string;
  lineItems?: Array<{ description: string; quantity?: number; unitAmount?: number; accountCode?: string }>;
  date?: string;
  dueDate?: string;
  invoiceNumber?: string;
  reference?: string;
  status?: string;
  currencyCode?: string;
};
export function validateUpdateInvoiceInput(input: unknown): UpdateInvoiceInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  const lineItems = Array.isArray(input.lineItems)
    ? input.lineItems.filter(isRecord).map((item, index) => ({
        description: requireString(item.description, `lineItems[${index}].description`),
        quantity: optionalNumber(item.quantity),
        unitAmount: optionalNumber(item.unitAmount),
        accountCode: optionalString(item.accountCode),
      }))
    : undefined;
  return {
    invoiceId: requireString(input.invoiceId, "invoiceId"),
    type: optionalString(input.type),
    contactId: optionalString(input.contactId),
    contactName: optionalString(input.contactName),
    lineItems,
    date: optionalString(input.date),
    dueDate: optionalString(input.dueDate),
    invoiceNumber: optionalString(input.invoiceNumber),
    reference: optionalString(input.reference),
    status: optionalString(input.status),
    currencyCode: optionalString(input.currencyCode),
  };
}

export function updateInvoice(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  const validated = validateUpdateInvoiceInput(input);
  if (!hasXeroAuth(input)) return envelope("invoices.update", validated);
  return xeroOk(input, "invoices.update", `/Invoices/${encodeURIComponent(validated.invoiceId)}`, { method: "POST", body: JSON.stringify(invoiceBody(validated)) }, [200], "Xero rejected the update invoice request.").then((result) => ({
    connector: "xero",
    action: "invoices.update",
    source: "connector",
    invoice: normalizeInvoice(parseInvoicesResponse(result.body).items[0] ?? (firstNamedRecord(result.body, "Invoices") as XeroInvoice)),
  }));
}

// ─── contacts.get / create / update ───────────────────────────────────────────

export type GetContactInput = { contactId: string };
export function validateGetContactInput(input: unknown): GetContactInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  return { contactId: requireString(input.contactId, "contactId") };
}

export function getContact(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  const validated = validateGetContactInput(input);
  if (!hasXeroAuth(input)) return envelope("contacts.get", validated);
  return xeroOk(input, "contacts.get", `/Contacts/${encodeURIComponent(validated.contactId)}`, {}, [200], "Xero rejected the get contact request.").then((result) => ({
    connector: "xero",
    action: "contacts.get",
    source: "connector",
    contact: normalizeContact(parseContactsResponse(result.body).items[0] ?? (firstNamedRecord(result.body, "Contacts") as XeroContact)),
  }));
}

export type CreateContactInput = {
  name: string;
  firstName?: string;
  lastName?: string;
  emailAddress?: string;
  phone?: string;
  isSupplier?: boolean;
  isCustomer?: boolean;
};
export function validateCreateContactInput(input: unknown): CreateContactInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  return {
    name: requireString(input.name, "name"),
    firstName: optionalString(input.firstName),
    lastName: optionalString(input.lastName),
    emailAddress: optionalString(input.emailAddress),
    phone: optionalString(input.phone),
    isSupplier: optionalBoolean(input.isSupplier),
    isCustomer: optionalBoolean(input.isCustomer),
  };
}

function contactBody(payload: CreateContactInput | UpdateContactInput): Record<string, unknown> {
  const contact: Record<string, unknown> = {};
  if (payload.name) contact.Name = payload.name;
  if (payload.firstName) contact.FirstName = payload.firstName;
  if (payload.lastName) contact.LastName = payload.lastName;
  if (payload.emailAddress) contact.EmailAddress = payload.emailAddress;
  if (payload.phone) contact.Phones = [{ PhoneType: "DEFAULT", PhoneNumber: payload.phone }];
  if (payload.isSupplier !== undefined) contact.IsSupplier = payload.isSupplier;
  if (payload.isCustomer !== undefined) contact.IsCustomer = payload.isCustomer;
  return { Contacts: [contact] };
}

export function createContact(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  const validated = validateCreateContactInput(input);
  if (!hasXeroAuth(input)) return envelope("contacts.create", validated);
  return xeroOk(input, "contacts.create", "/Contacts", { method: "PUT", body: JSON.stringify(contactBody(validated)) }, [200], "Xero rejected the create contact request.").then((result) => ({
    connector: "xero",
    action: "contacts.create",
    source: "connector",
    contact: normalizeContact(parseContactsResponse(result.body).items[0] ?? (firstNamedRecord(result.body, "Contacts") as XeroContact)),
  }));
}

export type UpdateContactInput = {
  contactId: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  emailAddress?: string;
  phone?: string;
  isSupplier?: boolean;
  isCustomer?: boolean;
};
export function validateUpdateContactInput(input: unknown): UpdateContactInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  return {
    contactId: requireString(input.contactId, "contactId"),
    name: optionalString(input.name),
    firstName: optionalString(input.firstName),
    lastName: optionalString(input.lastName),
    emailAddress: optionalString(input.emailAddress),
    phone: optionalString(input.phone),
    isSupplier: optionalBoolean(input.isSupplier),
    isCustomer: optionalBoolean(input.isCustomer),
  };
}

export function updateContact(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  const validated = validateUpdateContactInput(input);
  if (!hasXeroAuth(input)) return envelope("contacts.update", validated);
  return xeroOk(input, "contacts.update", `/Contacts/${encodeURIComponent(validated.contactId)}`, { method: "POST", body: JSON.stringify(contactBody(validated)) }, [200], "Xero rejected the update contact request.").then((result) => ({
    connector: "xero",
    action: "contacts.update",
    source: "connector",
    contact: normalizeContact(parseContactsResponse(result.body).items[0] ?? (firstNamedRecord(result.body, "Contacts") as XeroContact)),
  }));
}

// ─── accounts.list / get / create / update ────────────────────────────────────

export type ListAccountsInput = { page?: number };
export function validateListAccountsInput(input: unknown): ListAccountsInput {
  if (input !== undefined && !isRecord(input)) throw new Error("input must be an object");
  return { page: isRecord(input) ? optionalNumber(input.page) : undefined };
}

export function listAccounts(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  const validated = validateListAccountsInput(input);
  if (!hasXeroAuth(input)) return envelope("accounts.list", validated);
  return xeroOk(input, "accounts.list", `/Accounts${pageQuery(validated.page)}`, {}, [200], "Xero rejected the list accounts request.").then((result) => ({
    connector: "xero",
    action: "accounts.list",
    source: "connector",
    items: parseAccountsResponse(result.body).items.map(normalizeAccount),
  }));
}

export type GetAccountInput = { accountId: string };
export function validateGetAccountInput(input: unknown): GetAccountInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  return { accountId: requireString(input.accountId, "accountId") };
}

export function getAccount(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  const validated = validateGetAccountInput(input);
  if (!hasXeroAuth(input)) return envelope("accounts.get", validated);
  return xeroOk(input, "accounts.get", `/Accounts/${encodeURIComponent(validated.accountId)}`, {}, [200], "Xero rejected the get account request.").then((result) => ({
    connector: "xero",
    action: "accounts.get",
    source: "connector",
    account: normalizeAccount(parseAccountsResponse(result.body).items[0] ?? (firstNamedRecord(result.body, "Accounts") as XeroAccount)),
  }));
}

export type CreateAccountInput = { code: string; name: string; type: string; description?: string; taxType?: string };
export function validateCreateAccountInput(input: unknown): CreateAccountInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  return {
    code: requireString(input.code, "code"),
    name: requireString(input.name, "name"),
    type: requireString(input.type, "type"),
    description: optionalString(input.description),
    taxType: optionalString(input.taxType),
  };
}

function accountPayload(payload: CreateAccountInput | UpdateAccountInput): Record<string, unknown> {
  const account: Record<string, unknown> = {};
  if (payload.code) account.Code = payload.code;
  if (payload.name) account.Name = payload.name;
  if (payload.type) account.Type = payload.type;
  if (payload.description) account.Description = payload.description;
  if (payload.taxType) account.TaxType = payload.taxType;
  return account;
}

export function createAccount(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  const validated = validateCreateAccountInput(input);
  if (!hasXeroAuth(input)) return envelope("accounts.create", validated);
  return xeroOk(input, "accounts.create", "/Accounts", { method: "PUT", body: JSON.stringify(accountPayload(validated)) }, [200], "Xero rejected the create account request.").then((result) => ({
    connector: "xero",
    action: "accounts.create",
    source: "connector",
    account: normalizeAccount(parseAccountsResponse(result.body).items[0] ?? (firstNamedRecord(result.body, "Accounts") as XeroAccount)),
  }));
}

export type UpdateAccountInput = { accountId: string; code?: string; name?: string; type?: string; description?: string; taxType?: string; status?: string };
export function validateUpdateAccountInput(input: unknown): UpdateAccountInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  return {
    accountId: requireString(input.accountId, "accountId"),
    code: optionalString(input.code),
    name: optionalString(input.name),
    type: optionalString(input.type),
    description: optionalString(input.description),
    taxType: optionalString(input.taxType),
    status: optionalString(input.status),
  };
}

export function updateAccount(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  const validated = validateUpdateAccountInput(input);
  if (!hasXeroAuth(input)) return envelope("accounts.update", validated);
  const body = accountPayload(validated);
  if (validated.status) body.Status = validated.status;
  return xeroOk(input, "accounts.update", `/Accounts/${encodeURIComponent(validated.accountId)}`, { method: "POST", body: JSON.stringify(body) }, [200], "Xero rejected the update account request.").then((result) => ({
    connector: "xero",
    action: "accounts.update",
    source: "connector",
    account: normalizeAccount(parseAccountsResponse(result.body).items[0] ?? (firstNamedRecord(result.body, "Accounts") as XeroAccount)),
  }));
}

// ─── payments.list / get / create / update ────────────────────────────────────

export type ListPaymentsInput = { page?: number };
export function validateListPaymentsInput(input: unknown): ListPaymentsInput {
  if (input !== undefined && !isRecord(input)) throw new Error("input must be an object");
  return { page: isRecord(input) ? optionalNumber(input.page) : undefined };
}

export function listPayments(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  const validated = validateListPaymentsInput(input);
  if (!hasXeroAuth(input)) return envelope("payments.list", validated);
  return xeroOk(input, "payments.list", `/Payments${pageQuery(validated.page)}`, {}, [200], "Xero rejected the list payments request.").then((result) => ({
    connector: "xero",
    action: "payments.list",
    source: "connector",
    items: parsePaymentsResponse(result.body).items.map(normalizePayment),
  }));
}

export type GetPaymentInput = { paymentId: string };
export function validateGetPaymentInput(input: unknown): GetPaymentInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  return { paymentId: requireString(input.paymentId, "paymentId") };
}

export function getPayment(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  const validated = validateGetPaymentInput(input);
  if (!hasXeroAuth(input)) return envelope("payments.get", validated);
  return xeroOk(input, "payments.get", `/Payments/${encodeURIComponent(validated.paymentId)}`, {}, [200], "Xero rejected the get payment request.").then((result) => ({
    connector: "xero",
    action: "payments.get",
    source: "connector",
    payment: normalizePayment(parsePaymentsResponse(result.body).items[0] ?? (firstNamedRecord(result.body, "Payments") as XeroPayment)),
  }));
}

export type CreatePaymentInput = { invoiceId: string; accountId: string; amount: number; date?: string; reference?: string };
export function validateCreatePaymentInput(input: unknown): CreatePaymentInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  const amount = optionalNumber(input.amount);
  if (amount === undefined) throw new Error("amount must be a number");
  return {
    invoiceId: requireString(input.invoiceId, "invoiceId"),
    accountId: requireString(input.accountId, "accountId"),
    amount,
    date: optionalString(input.date),
    reference: optionalString(input.reference),
  };
}

export function createPayment(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  const validated = validateCreatePaymentInput(input);
  if (!hasXeroAuth(input)) return envelope("payments.create", validated);
  const payment: Record<string, unknown> = {
    Invoice: { InvoiceID: validated.invoiceId },
    Account: { AccountID: validated.accountId },
    Amount: validated.amount,
  };
  if (validated.date) payment.Date = validated.date;
  if (validated.reference) payment.Reference = validated.reference;
  return xeroOk(input, "payments.create", "/Payments", { method: "PUT", body: JSON.stringify({ Payments: [payment] }) }, [200], "Xero rejected the create payment request.").then((result) => ({
    connector: "xero",
    action: "payments.create",
    source: "connector",
    payment: normalizePayment(parsePaymentsResponse(result.body).items[0] ?? (firstNamedRecord(result.body, "Payments") as XeroPayment)),
  }));
}

export type UpdatePaymentInput = { paymentId: string; reference?: string; status?: string };
export function validateUpdatePaymentInput(input: unknown): UpdatePaymentInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  return {
    paymentId: requireString(input.paymentId, "paymentId"),
    reference: optionalString(input.reference),
    status: optionalString(input.status),
  };
}

export function updatePayment(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  const validated = validateUpdatePaymentInput(input);
  if (!hasXeroAuth(input)) return envelope("payments.update", validated);
  const payment: Record<string, unknown> = {};
  if (validated.reference) payment.Reference = validated.reference;
  if (validated.status) payment.Status = validated.status;
  return xeroOk(input, "payments.update", `/Payments/${encodeURIComponent(validated.paymentId)}`, { method: "POST", body: JSON.stringify({ Payments: [payment] }) }, [200], "Xero rejected the update payment request.").then((result) => ({
    connector: "xero",
    action: "payments.update",
    source: "connector",
    payment: normalizePayment(parsePaymentsResponse(result.body).items[0] ?? (firstNamedRecord(result.body, "Payments") as XeroPayment)),
  }));
}

// ─── items.list / get / create / update ───────────────────────────────────────

export type ListItemsInput = { page?: number };
export function validateListItemsInput(input: unknown): ListItemsInput {
  if (input !== undefined && !isRecord(input)) throw new Error("input must be an object");
  return { page: isRecord(input) ? optionalNumber(input.page) : undefined };
}

export function listItems(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  const validated = validateListItemsInput(input);
  if (!hasXeroAuth(input)) return envelope("items.list", validated);
  return xeroOk(input, "items.list", `/Items${pageQuery(validated.page)}`, {}, [200], "Xero rejected the list items request.").then((result) => ({
    connector: "xero",
    action: "items.list",
    source: "connector",
    items: parseItemsResponse(result.body).items.map(normalizeItem),
  }));
}

export type GetItemInput = { itemId: string };
export function validateGetItemInput(input: unknown): GetItemInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  return { itemId: requireString(input.itemId, "itemId") };
}

export function getItem(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  const validated = validateGetItemInput(input);
  if (!hasXeroAuth(input)) return envelope("items.get", validated);
  return xeroOk(input, "items.get", `/Items/${encodeURIComponent(validated.itemId)}`, {}, [200], "Xero rejected the get item request.").then((result) => ({
    connector: "xero",
    action: "items.get",
    source: "connector",
    item: normalizeItem(parseItemsResponse(result.body).items[0] ?? (firstNamedRecord(result.body, "Items") as XeroItem)),
  }));
}

export type CreateItemInput = {
  code: string;
  name?: string;
  description?: string;
  purchaseDescription?: string;
  isSold?: boolean;
  isPurchased?: boolean;
  salesUnitPrice?: number;
  purchaseUnitPrice?: number;
  salesAccountCode?: string;
  purchaseAccountCode?: string;
};
export function validateCreateItemInput(input: unknown): CreateItemInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  return {
    code: requireString(input.code, "code"),
    name: optionalString(input.name),
    description: optionalString(input.description),
    purchaseDescription: optionalString(input.purchaseDescription),
    isSold: optionalBoolean(input.isSold),
    isPurchased: optionalBoolean(input.isPurchased),
    salesUnitPrice: optionalNumber(input.salesUnitPrice),
    purchaseUnitPrice: optionalNumber(input.purchaseUnitPrice),
    salesAccountCode: optionalString(input.salesAccountCode),
    purchaseAccountCode: optionalString(input.purchaseAccountCode),
  };
}

function itemBody(payload: CreateItemInput | UpdateItemInput): Record<string, unknown> {
  const item: Record<string, unknown> = {};
  if (payload.code) item.Code = payload.code;
  if (payload.name) item.Name = payload.name;
  if (payload.description) item.Description = payload.description;
  if (payload.purchaseDescription) item.PurchaseDescription = payload.purchaseDescription;
  if (payload.isSold !== undefined) item.IsSold = payload.isSold;
  if (payload.isPurchased !== undefined) item.IsPurchased = payload.isPurchased;
  if (payload.salesUnitPrice !== undefined || payload.salesAccountCode) {
    const sales: Record<string, unknown> = {};
    if (payload.salesUnitPrice !== undefined) sales.UnitPrice = payload.salesUnitPrice;
    if (payload.salesAccountCode) sales.AccountCode = payload.salesAccountCode;
    item.SalesDetails = sales;
  }
  if (payload.purchaseUnitPrice !== undefined || payload.purchaseAccountCode) {
    const purchase: Record<string, unknown> = {};
    if (payload.purchaseUnitPrice !== undefined) purchase.UnitPrice = payload.purchaseUnitPrice;
    if (payload.purchaseAccountCode) purchase.AccountCode = payload.purchaseAccountCode;
    item.PurchaseDetails = purchase;
  }
  return { Items: [item] };
}

export function createItem(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  const validated = validateCreateItemInput(input);
  if (!hasXeroAuth(input)) return envelope("items.create", validated);
  return xeroOk(input, "items.create", "/Items", { method: "PUT", body: JSON.stringify(itemBody(validated)) }, [200], "Xero rejected the create item request.").then((result) => ({
    connector: "xero",
    action: "items.create",
    source: "connector",
    item: normalizeItem(parseItemsResponse(result.body).items[0] ?? (firstNamedRecord(result.body, "Items") as XeroItem)),
  }));
}

export type UpdateItemInput = CreateItemInput & { itemId: string };
export function validateUpdateItemInput(input: unknown): UpdateItemInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  return {
    itemId: requireString(input.itemId, "itemId"),
    code: optionalString(input.code) ?? "",
    name: optionalString(input.name),
    description: optionalString(input.description),
    purchaseDescription: optionalString(input.purchaseDescription),
    isSold: optionalBoolean(input.isSold),
    isPurchased: optionalBoolean(input.isPurchased),
    salesUnitPrice: optionalNumber(input.salesUnitPrice),
    purchaseUnitPrice: optionalNumber(input.purchaseUnitPrice),
    salesAccountCode: optionalString(input.salesAccountCode),
    purchaseAccountCode: optionalString(input.purchaseAccountCode),
  };
}

export function updateItem(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  const validated = validateUpdateItemInput(input);
  if (!hasXeroAuth(input)) return envelope("items.update", validated);
  return xeroOk(input, "items.update", `/Items/${encodeURIComponent(validated.itemId)}`, { method: "POST", body: JSON.stringify(itemBody(validated)) }, [200], "Xero rejected the update item request.").then((result) => ({
    connector: "xero",
    action: "items.update",
    source: "connector",
    item: normalizeItem(parseItemsResponse(result.body).items[0] ?? (firstNamedRecord(result.body, "Items") as XeroItem)),
  }));
}
