import {
  createZohoBooksClient,
  parseZohoBooksRateLimit,
  isRecord,
  jsonStringBody,
  type ZohoBooksClientOptions,
} from "./http";
import {
  parseContactResource,
  parseInvoiceResource,
  parseBillsResponse,
  parseBillResource,
  parseItemsResponse,
  parseItemResource,
  parseOrganizationsResponse,
} from "./objects";

type ActionResult = Record<string, unknown> | Promise<Record<string, unknown>>;

function hasLiveAuth(input: unknown): input is Record<string, unknown> & { accessToken: string } {
  return isRecord(input) && typeof input.accessToken === "string" && input.accessToken.length > 0;
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

function optionalStringArray(value: unknown, field: string): string[] | undefined {
  if (value == null) return undefined;
  if (!Array.isArray(value) || !value.every((v) => typeof v === "string" && v.length > 0)) {
    throw new Error(`${field} must be an array of strings`);
  }
  return value as string[];
}

function requireLineItems(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value) || value.length === 0 || !value.every(isRecord)) {
    throw new Error("lineItems is required");
  }
  return value.map((item) => {
    const line: Record<string, unknown> = {};
    if (typeof item.itemId === "string") line.item_id = item.itemId;
    if (typeof item.item_id === "string") line.item_id = item.item_id;
    if (typeof item.name === "string") line.name = item.name;
    if (typeof item.description === "string") line.description = item.description;
    if (typeof item.rate === "number") line.rate = item.rate;
    if (typeof item.quantity === "number") line.quantity = item.quantity;
    return line;
  });
}

function clientOpts(
  input: Record<string, unknown>,
  operation: string,
  organizationId?: string,
): ZohoBooksClientOptions {
  return {
    accessToken: String(input.accessToken),
    organizationId,
    fetch: typeof input.fetch === "function" ? (input.fetch as typeof fetch) : undefined,
    operation,
  };
}

function handleError(result: { status: number; headers: Record<string, string>; body: unknown }) {
  const rateLimit = parseZohoBooksRateLimit(result.status, result.headers);
  if (rateLimit.limited) {
    return {
      ok: false,
      code: "CONNECTOR_RATE_LIMITED",
      message: "Zoho Books rate limit exceeded.",
      retryAfterSeconds: rateLimit.retryAfterSeconds,
    };
  }
  const message =
    isRecord(result.body) && typeof result.body.message === "string"
      ? result.body.message
      : "Zoho Books rejected the request.";
  return { ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message };
}

function isZohoOk(status: number, body: unknown): boolean {
  if (status < 200 || status >= 300) return false;
  if (!isRecord(body)) return true;
  return body.code === 0 || body.code == null;
}

function requireOrg(input: Record<string, unknown>): string {
  return requireString(input.organizationId, "organizationId");
}

async function liveJSON(
  input: Record<string, unknown>,
  operation: string,
  organizationId: string | undefined,
  path: string,
  init: RequestInit = {},
  extraQuery?: Record<string, string>,
): Promise<{ status: number; headers: Record<string, string>; body: unknown }> {
  return createZohoBooksClient(clientOpts(input, operation, organizationId)).fetchJSON(path, init, extraQuery);
}

function wrap(
  input: unknown,
  operation: string,
  organizationId: string | undefined,
  path: string,
  init: RequestInit,
  map: (body: unknown) => Record<string, unknown>,
  extraQuery?: Record<string, string>,
): ActionResult {
  return liveJSON(input as Record<string, unknown>, operation, organizationId, path, init, extraQuery).then((result) => {
    if (isZohoOk(result.status, result.body)) {
      return { connector: "zoho-books", action: operation, source: "connector", ...map(result.body) };
    }
    throw handleError(result);
  });
}

// ---------------------------------------------------------------------------
// contacts.get / create / update / delete
// ---------------------------------------------------------------------------

export type ContactsGetInput = { organizationId: string; contactId: string };

export function getContact(input: unknown): ActionResult {
  const validated = validateContactsGetInput(input);
  if (hasLiveAuth(input)) {
    return wrap(input, "contacts.get", validated.organizationId, `/contacts/${encodeURIComponent(validated.contactId)}`, { method: "GET" }, (body) => ({
      contact: parseContactResource(body),
    }));
  }
  return { connector: "zoho-books", action: "contacts.get", source: "connector", validated };
}

function validateContactsGetInput(input: unknown): ContactsGetInput {
  if (!isRecord(input)) throw new Error("contacts.get input must be an object");
  return { organizationId: requireOrg(input), contactId: requireString(input.contactId ?? input.id, "contactId") };
}

export type ContactsCreateInput = {
  organizationId: string;
  contactName: string;
  email?: string;
  phone?: string;
  contactType?: string;
  companyName?: string;
  firstName?: string;
  lastName?: string;
};

export function createContact(input: unknown): ActionResult {
  const validated = validateContactsCreateInput(input);
  if (hasLiveAuth(input)) {
    const payload: Record<string, unknown> = { contact_name: validated.contactName };
    if (validated.email) payload.email = validated.email;
    if (validated.phone) payload.phone = validated.phone;
    if (validated.contactType) payload.contact_type = validated.contactType;
    if (validated.companyName) payload.company_name = validated.companyName;
    if (validated.firstName) payload.first_name = validated.firstName;
    if (validated.lastName) payload.last_name = validated.lastName;
    return wrap(input, "contacts.create", validated.organizationId, "/contacts", { method: "POST", ...jsonStringBody(payload) }, (body) => ({
      contact: parseContactResource(body),
    }));
  }
  return { connector: "zoho-books", action: "contacts.create", source: "connector", validated };
}

function validateContactsCreateInput(input: unknown): ContactsCreateInput {
  if (!isRecord(input)) throw new Error("contacts.create input must be an object");
  return {
    organizationId: requireOrg(input),
    contactName: requireString(input.contactName ?? input.name, "contactName"),
    email: optionalString(input.email),
    phone: optionalString(input.phone),
    contactType: optionalString(input.contactType),
    companyName: optionalString(input.companyName),
    firstName: optionalString(input.firstName),
    lastName: optionalString(input.lastName),
  };
}

export type ContactsUpdateInput = ContactsCreateInput & { contactId: string };

export function updateContact(input: unknown): ActionResult {
  const validated = validateContactsUpdateInput(input);
  if (hasLiveAuth(input)) {
    const payload: Record<string, unknown> = {};
    if (validated.contactName) payload.contact_name = validated.contactName;
    if (validated.email) payload.email = validated.email;
    if (validated.phone) payload.phone = validated.phone;
    if (validated.contactType) payload.contact_type = validated.contactType;
    if (validated.companyName) payload.company_name = validated.companyName;
    if (validated.firstName) payload.first_name = validated.firstName;
    if (validated.lastName) payload.last_name = validated.lastName;
    return wrap(
      input,
      "contacts.update",
      validated.organizationId,
      `/contacts/${encodeURIComponent(validated.contactId)}`,
      { method: "PUT", ...jsonStringBody(payload) },
      (body) => ({ contact: parseContactResource(body) }),
    );
  }
  return { connector: "zoho-books", action: "contacts.update", source: "connector", validated };
}

function validateContactsUpdateInput(input: unknown): ContactsUpdateInput {
  if (!isRecord(input)) throw new Error("contacts.update input must be an object");
  return {
    organizationId: requireOrg(input),
    contactId: requireString(input.contactId ?? input.id, "contactId"),
    contactName: optionalString(input.contactName ?? input.name) ?? "",
    email: optionalString(input.email),
    phone: optionalString(input.phone),
    contactType: optionalString(input.contactType),
    companyName: optionalString(input.companyName),
    firstName: optionalString(input.firstName),
    lastName: optionalString(input.lastName),
  };
}

export type ContactsDeleteInput = { organizationId: string; contactId: string };

export function deleteContact(input: unknown): ActionResult {
  const validated = validateContactsGetInput(input);
  if (hasLiveAuth(input)) {
    return wrap(input, "contacts.delete", validated.organizationId, `/contacts/${encodeURIComponent(validated.contactId)}`, { method: "DELETE" }, () => ({
      deleted: true,
    }));
  }
  return { connector: "zoho-books", action: "contacts.delete", source: "connector", validated };
}

// ---------------------------------------------------------------------------
// invoices.get / create / update / email / void
// ---------------------------------------------------------------------------

export type InvoicesGetInput = { organizationId: string; invoiceId: string };

export function getInvoice(input: unknown): ActionResult {
  const validated = validateInvoicesGetInput(input);
  if (hasLiveAuth(input)) {
    return wrap(input, "invoices.get", validated.organizationId, `/invoices/${encodeURIComponent(validated.invoiceId)}`, { method: "GET" }, (body) => ({
      invoice: parseInvoiceResource(body),
    }));
  }
  return { connector: "zoho-books", action: "invoices.get", source: "connector", validated };
}

function validateInvoicesGetInput(input: unknown): InvoicesGetInput {
  if (!isRecord(input)) throw new Error("invoices.get input must be an object");
  return { organizationId: requireOrg(input), invoiceId: requireString(input.invoiceId ?? input.id, "invoiceId") };
}

export type InvoicesCreateInput = {
  organizationId: string;
  customerId: string;
  lineItems: Record<string, unknown>[];
  invoiceNumber?: string;
  date?: string;
  dueDate?: string;
};

export function createInvoice(input: unknown): ActionResult {
  const validated = validateInvoicesCreateInput(input);
  if (hasLiveAuth(input)) {
    const payload: Record<string, unknown> = {
      customer_id: validated.customerId,
      line_items: validated.lineItems,
    };
    if (validated.invoiceNumber) payload.invoice_number = validated.invoiceNumber;
    if (validated.date) payload.date = validated.date;
    if (validated.dueDate) payload.due_date = validated.dueDate;
    return wrap(input, "invoices.create", validated.organizationId, "/invoices", { method: "POST", ...jsonStringBody(payload) }, (body) => ({
      invoice: parseInvoiceResource(body),
    }));
  }
  return { connector: "zoho-books", action: "invoices.create", source: "connector", validated };
}

function validateInvoicesCreateInput(input: unknown): InvoicesCreateInput {
  if (!isRecord(input)) throw new Error("invoices.create input must be an object");
  return {
    organizationId: requireOrg(input),
    customerId: requireString(input.customerId ?? input.contactId, "customerId"),
    lineItems: requireLineItems(input.lineItems),
    invoiceNumber: optionalString(input.invoiceNumber),
    date: optionalString(input.date),
    dueDate: optionalString(input.dueDate),
  };
}

export type InvoicesUpdateInput = {
  organizationId: string;
  invoiceId: string;
  customerId?: string;
  lineItems?: Record<string, unknown>[];
  invoiceNumber?: string;
  date?: string;
  dueDate?: string;
};

export function updateInvoice(input: unknown): ActionResult {
  const validated = validateInvoicesUpdateInput(input);
  if (hasLiveAuth(input)) {
    const payload: Record<string, unknown> = {};
    if (validated.customerId) payload.customer_id = validated.customerId;
    if (validated.lineItems) payload.line_items = validated.lineItems;
    if (validated.invoiceNumber) payload.invoice_number = validated.invoiceNumber;
    if (validated.date) payload.date = validated.date;
    if (validated.dueDate) payload.due_date = validated.dueDate;
    return wrap(
      input,
      "invoices.update",
      validated.organizationId,
      `/invoices/${encodeURIComponent(validated.invoiceId)}`,
      { method: "PUT", ...jsonStringBody(payload) },
      (body) => ({ invoice: parseInvoiceResource(body) }),
    );
  }
  return { connector: "zoho-books", action: "invoices.update", source: "connector", validated };
}

function validateInvoicesUpdateInput(input: unknown): InvoicesUpdateInput {
  if (!isRecord(input)) throw new Error("invoices.update input must be an object");
  return {
    organizationId: requireOrg(input),
    invoiceId: requireString(input.invoiceId ?? input.id, "invoiceId"),
    customerId: optionalString(input.customerId ?? input.contactId),
    lineItems: input.lineItems == null ? undefined : requireLineItems(input.lineItems),
    invoiceNumber: optionalString(input.invoiceNumber),
    date: optionalString(input.date),
    dueDate: optionalString(input.dueDate),
  };
}

export type InvoicesEmailInput = {
  organizationId: string;
  invoiceId: string;
  toMailIds?: string[];
  subject?: string;
  body?: string;
};

export function emailInvoice(input: unknown): ActionResult {
  const validated = validateInvoicesEmailInput(input);
  if (hasLiveAuth(input)) {
    const payload: Record<string, unknown> = {};
    if (validated.toMailIds) payload.to_mail_ids = validated.toMailIds;
    if (validated.subject) payload.subject = validated.subject;
    if (validated.body) payload.body = validated.body;
    return wrap(
      input,
      "invoices.email",
      validated.organizationId,
      `/invoices/${encodeURIComponent(validated.invoiceId)}/email`,
      { method: "POST", ...jsonStringBody(payload) },
      () => ({ sent: true }),
    );
  }
  return { connector: "zoho-books", action: "invoices.email", source: "connector", validated };
}

function validateInvoicesEmailInput(input: unknown): InvoicesEmailInput {
  if (!isRecord(input)) throw new Error("invoices.email input must be an object");
  return {
    organizationId: requireOrg(input),
    invoiceId: requireString(input.invoiceId ?? input.id, "invoiceId"),
    toMailIds: optionalStringArray(input.toMailIds, "toMailIds"),
    subject: optionalString(input.subject),
    body: optionalString(input.body),
  };
}

export function voidInvoice(input: unknown): ActionResult {
  const validated = validateInvoicesGetInput(input);
  if (hasLiveAuth(input)) {
    return wrap(
      input,
      "invoices.void",
      validated.organizationId,
      `/invoices/${encodeURIComponent(validated.invoiceId)}/status/void`,
      { method: "POST" },
      () => ({ voided: true }),
    );
  }
  return { connector: "zoho-books", action: "invoices.void", source: "connector", validated };
}

// ---------------------------------------------------------------------------
// bills.list / get / create
// ---------------------------------------------------------------------------

export type BillsListInput = { organizationId: string; page?: number; perPage?: number };

export function listBills(input: unknown): ActionResult {
  const validated = validatePagedOrgInput(input, "bills.list");
  if (hasLiveAuth(input)) {
    const extra: Record<string, string> = {};
    if (validated.page != null) extra.page = String(validated.page);
    if (validated.perPage != null) extra.per_page = String(validated.perPage);
    return wrap(input, "bills.list", validated.organizationId, "/bills", { method: "GET" }, (body) => {
      const parsed = parseBillsResponse(body);
      return { bills: parsed.items, hasMore: parsed.hasMore, page: parsed.page };
    }, extra);
  }
  return { connector: "zoho-books", action: "bills.list", source: "connector", validated };
}

function validatePagedOrgInput(input: unknown, operation: string): BillsListInput {
  if (!isRecord(input)) throw new Error(`${operation} input must be an object`);
  return {
    organizationId: requireOrg(input),
    page: optionalNumber(input.page),
    perPage: optionalNumber(input.perPage),
  };
}

export type BillsGetInput = { organizationId: string; billId: string };

export function getBill(input: unknown): ActionResult {
  const validated = validateBillsGetInput(input);
  if (hasLiveAuth(input)) {
    return wrap(input, "bills.get", validated.organizationId, `/bills/${encodeURIComponent(validated.billId)}`, { method: "GET" }, (body) => ({
      bill: parseBillResource(body),
    }));
  }
  return { connector: "zoho-books", action: "bills.get", source: "connector", validated };
}

function validateBillsGetInput(input: unknown): BillsGetInput {
  if (!isRecord(input)) throw new Error("bills.get input must be an object");
  return { organizationId: requireOrg(input), billId: requireString(input.billId ?? input.id, "billId") };
}

export type BillsCreateInput = {
  organizationId: string;
  vendorId: string;
  lineItems: Record<string, unknown>[];
  billNumber?: string;
  date?: string;
  dueDate?: string;
};

export function createBill(input: unknown): ActionResult {
  const validated = validateBillsCreateInput(input);
  if (hasLiveAuth(input)) {
    const payload: Record<string, unknown> = {
      vendor_id: validated.vendorId,
      line_items: validated.lineItems,
    };
    if (validated.billNumber) payload.bill_number = validated.billNumber;
    if (validated.date) payload.date = validated.date;
    if (validated.dueDate) payload.due_date = validated.dueDate;
    return wrap(input, "bills.create", validated.organizationId, "/bills", { method: "POST", ...jsonStringBody(payload) }, (body) => ({
      bill: parseBillResource(body),
    }));
  }
  return { connector: "zoho-books", action: "bills.create", source: "connector", validated };
}

function validateBillsCreateInput(input: unknown): BillsCreateInput {
  if (!isRecord(input)) throw new Error("bills.create input must be an object");
  return {
    organizationId: requireOrg(input),
    vendorId: requireString(input.vendorId, "vendorId"),
    lineItems: requireLineItems(input.lineItems),
    billNumber: optionalString(input.billNumber),
    date: optionalString(input.date),
    dueDate: optionalString(input.dueDate),
  };
}

// ---------------------------------------------------------------------------
// items.list / get / create
// ---------------------------------------------------------------------------

export function listItems(input: unknown): ActionResult {
  const validated = validatePagedOrgInput(input, "items.list");
  if (hasLiveAuth(input)) {
    const extra: Record<string, string> = {};
    if (validated.page != null) extra.page = String(validated.page);
    if (validated.perPage != null) extra.per_page = String(validated.perPage);
    return wrap(input, "items.list", validated.organizationId, "/items", { method: "GET" }, (body) => {
      const parsed = parseItemsResponse(body);
      return { items: parsed.items, hasMore: parsed.hasMore, page: parsed.page };
    }, extra);
  }
  return { connector: "zoho-books", action: "items.list", source: "connector", validated };
}

export type ItemsGetInput = { organizationId: string; itemId: string };

export function getItem(input: unknown): ActionResult {
  const validated = validateItemsGetInput(input);
  if (hasLiveAuth(input)) {
    return wrap(input, "items.get", validated.organizationId, `/items/${encodeURIComponent(validated.itemId)}`, { method: "GET" }, (body) => ({
      item: parseItemResource(body),
    }));
  }
  return { connector: "zoho-books", action: "items.get", source: "connector", validated };
}

function validateItemsGetInput(input: unknown): ItemsGetInput {
  if (!isRecord(input)) throw new Error("items.get input must be an object");
  return { organizationId: requireOrg(input), itemId: requireString(input.itemId ?? input.id, "itemId") };
}

export type ItemsCreateInput = {
  organizationId: string;
  name: string;
  rate?: number;
  sku?: string;
  description?: string;
  productType?: string;
};

export function createItem(input: unknown): ActionResult {
  const validated = validateItemsCreateInput(input);
  if (hasLiveAuth(input)) {
    const payload: Record<string, unknown> = { name: validated.name };
    if (validated.rate != null) payload.rate = validated.rate;
    if (validated.sku) payload.sku = validated.sku;
    if (validated.description) payload.description = validated.description;
    if (validated.productType) payload.product_type = validated.productType;
    return wrap(input, "items.create", validated.organizationId, "/items", { method: "POST", ...jsonStringBody(payload) }, (body) => ({
      item: parseItemResource(body),
    }));
  }
  return { connector: "zoho-books", action: "items.create", source: "connector", validated };
}

function validateItemsCreateInput(input: unknown): ItemsCreateInput {
  if (!isRecord(input)) throw new Error("items.create input must be an object");
  return {
    organizationId: requireOrg(input),
    name: requireString(input.name, "name"),
    rate: optionalNumber(input.rate),
    sku: optionalString(input.sku),
    description: optionalString(input.description),
    productType: optionalString(input.productType),
  };
}

// ---------------------------------------------------------------------------
// organizations.get
// ---------------------------------------------------------------------------

export type OrganizationsGetInput = { organizationId?: string };

export function getOrganizations(input: unknown): ActionResult {
  const validated = validateOrganizationsGetInput(input);
  if (hasLiveAuth(input)) {
    const path = validated.organizationId
      ? `/organizations/${encodeURIComponent(validated.organizationId)}`
      : "/organizations";
    return wrap(input, "organizations.get", undefined, path, { method: "GET" }, (body) => {
      const organizations = parseOrganizationsResponse(body);
      return {
        organizations,
        organization: validated.organizationId ? organizations[0] ?? null : undefined,
      };
    });
  }
  return { connector: "zoho-books", action: "organizations.get", source: "connector", validated };
}

function validateOrganizationsGetInput(input: unknown): OrganizationsGetInput {
  if (input == null) return {};
  if (!isRecord(input)) throw new Error("organizations.get input must be an object");
  return { organizationId: optionalString(input.organizationId) };
}
