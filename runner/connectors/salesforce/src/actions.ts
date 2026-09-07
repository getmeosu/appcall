import { createSalesforceClient, parseSalesforceRateLimit, type SalesforceClient } from "./http";
import { validateCreateContactInput, validateCreateLeadInput, normalizeContact, type SalesforceContact, validateGetContactInput, validateUpdateContactInput, validateDeleteContactInput } from "./contacts";
import { normalizeLead, type SalesforceLead, validateUpdateLeadInput } from "./leads";
import { validateCreateOpportunityInput, normalizeOpportunity, type SalesforceOpportunity, validateGetOpportunityInput } from "./opportunities";
import { validateCreateCaseInput, normalizeCase, type SalesforceCase } from "./cases";
import { normalizeAccount, type SalesforceAccount, validateCreateAccountInput, validateGetAccountInput, validateUpdateAccountInput } from "./accounts";
import { validateQuerySobjectsInput, normalizeQueryResult, validateSearchSobjectsInput, normalizeSearchResult } from "./sobjects";

// ── existing actions ────────────────────────────────────────────────────────

export function createContact(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string" && typeof input.instanceUrl === "string") {
    return createSalesforceClient({
      accessToken: input.accessToken,
      instanceUrl: input.instanceUrl,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
      operation: "contacts.create",
    }).createRecord("Contact", {
      FirstName: input.firstName,
      LastName: input.lastName,
      Email: input.email,
      Phone: input.phone,
      Title: input.title,
      AccountId: input.accountId,
    }).then((result) => {
      if (result.status === 201) {
        return { connector: "salesforce", action: "contacts.create", source: "connector", contact: normalizeContact(result.body as SalesforceContact) };
      }
      throw handleError(result);
    });
  }
  return { connector: "salesforce", action: "contacts.create", source: "connector", validated: validateCreateContactInput(input) };
}

export function createLead(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string" && typeof input.instanceUrl === "string") {
    return createSalesforceClient({
      accessToken: input.accessToken,
      instanceUrl: input.instanceUrl,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
      operation: "leads.create",
    }).createRecord("Lead", {
      FirstName: input.firstName,
      LastName: input.lastName,
      Company: input.company,
      Email: input.email,
      Phone: input.phone,
      Title: input.title,
    }).then((result) => {
      if (result.status === 201) {
        return { connector: "salesforce", action: "leads.create", source: "connector", lead: normalizeLead(result.body as SalesforceLead) };
      }
      throw handleError(result);
    });
  }
  return { connector: "salesforce", action: "leads.create", source: "connector", validated: validateCreateLeadInput(input) };
}

export function createOpportunity(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string" && typeof input.instanceUrl === "string") {
    return createSalesforceClient({
      accessToken: input.accessToken,
      instanceUrl: input.instanceUrl,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
      operation: "opportunities.create",
    }).createRecord("Opportunity", {
      Name: input.name,
      CloseDate: input.closeDate,
      StageName: input.stage,
      Amount: input.amount,
      AccountId: input.accountId,
    }).then((result) => {
      if (result.status === 201) {
        return { connector: "salesforce", action: "opportunities.create", source: "connector", opportunity: normalizeOpportunity(result.body as SalesforceOpportunity) };
      }
      throw handleError(result);
    });
  }
  return { connector: "salesforce", action: "opportunities.create", source: "connector", validated: validateCreateOpportunityInput(input) };
}

export function createCase(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string" && typeof input.instanceUrl === "string") {
    return createSalesforceClient({
      accessToken: input.accessToken,
      instanceUrl: input.instanceUrl,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
      operation: "cases.create",
    }).createRecord("Case", {
      Subject: input.subject,
      Description: input.description,
      Status: input.status,
      Priority: input.priority,
      Origin: input.origin,
      AccountId: input.accountId,
      ContactId: input.contactId,
    }).then((result) => {
      if (result.status === 201) {
        return { connector: "salesforce", action: "cases.create", source: "connector", case: normalizeCase(result.body as SalesforceCase) };
      }
      throw handleError(result);
    });
  }
  return { connector: "salesforce", action: "cases.create", source: "connector", validated: validateCreateCaseInput(input) };
}

// ── new actions ─────────────────────────────────────────────────────────────

// 1. accounts.create
export function createAccount(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string" && typeof input.instanceUrl === "string") {
    const validated = validateCreateAccountInput(input);
    return createSalesforceClient({
      accessToken: input.accessToken,
      instanceUrl: input.instanceUrl,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
      operation: "accounts.create",
    }).createRecord("Account", {
      Name: validated.name,
      Type: validated.type,
      Industry: validated.industry,
      Phone: validated.phone,
      Website: validated.website,
      BillingCity: validated.billingCity,
      BillingState: validated.billingState,
      BillingCountry: validated.billingCountry,
      BillingPostalCode: validated.billingPostalCode,
      NumberOfEmployees: validated.numberOfEmployees,
      AnnualRevenue: validated.annualRevenue,
    }).then((result) => {
      if (result.status === 201) {
        const body = result.body as Record<string, unknown>;
        return {
          connector: "salesforce",
          action: "accounts.create",
          source: "connector",
          account: { id: `sf-account:${body.id}`, providerAccountId: body.id as string, name: validated.name },
        };
      }
      throw handleError(result);
    });
  }
  return { connector: "salesforce", action: "accounts.create", source: "connector", validated: validateCreateAccountInput(input) };
}

// 2. accounts.get
export function getAccount(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string" && typeof input.instanceUrl === "string") {
    const validated = validateGetAccountInput(input);
    return createSalesforceClient({
      accessToken: input.accessToken,
      instanceUrl: input.instanceUrl,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
      operation: "accounts.get",
    }).getRecord("Account", validated.id).then((result) => {
      if (result.status === 200) {
        return { connector: "salesforce", action: "accounts.get", source: "connector", account: normalizeAccount(result.body as SalesforceAccount) };
      }
      throw handleError(result);
    });
  }
  return { connector: "salesforce", action: "accounts.get", source: "connector", validated: validateGetAccountInput(input) };
}

// 3. accounts.update
export function updateAccount(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string" && typeof input.instanceUrl === "string") {
    const validated = validateUpdateAccountInput(input);
    const { id, ...fields } = validated;
    const body: Record<string, unknown> = {};
    if (fields.name !== undefined) body.Name = fields.name;
    if (fields.type !== undefined) body.Type = fields.type;
    if (fields.industry !== undefined) body.Industry = fields.industry;
    if (fields.phone !== undefined) body.Phone = fields.phone;
    if (fields.website !== undefined) body.Website = fields.website;
    if (fields.billingCity !== undefined) body.BillingCity = fields.billingCity;
    if (fields.billingState !== undefined) body.BillingState = fields.billingState;
    if (fields.billingCountry !== undefined) body.BillingCountry = fields.billingCountry;
    if (fields.billingPostalCode !== undefined) body.BillingPostalCode = fields.billingPostalCode;
    if (fields.numberOfEmployees !== undefined) body.NumberOfEmployees = fields.numberOfEmployees;
    if (fields.annualRevenue !== undefined) body.AnnualRevenue = fields.annualRevenue;
    return createSalesforceClient({
      accessToken: input.accessToken,
      instanceUrl: input.instanceUrl,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
      operation: "accounts.update",
    }).updateRecord("Account", id, body).then((result) => {
      if (result.status === 204) {
        return { connector: "salesforce", action: "accounts.update", source: "connector", updated: true, id };
      }
      throw handleError(result);
    });
  }
  return { connector: "salesforce", action: "accounts.update", source: "connector", validated: validateUpdateAccountInput(input) };
}

// 4. contacts.get
export function getContact(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string" && typeof input.instanceUrl === "string") {
    const validated = validateGetContactInput(input);
    return createSalesforceClient({
      accessToken: input.accessToken,
      instanceUrl: input.instanceUrl,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
      operation: "contacts.get",
    }).getRecord("Contact", validated.id).then((result) => {
      if (result.status === 200) {
        return { connector: "salesforce", action: "contacts.get", source: "connector", contact: normalizeContact(result.body as SalesforceContact) };
      }
      throw handleError(result);
    });
  }
  return { connector: "salesforce", action: "contacts.get", source: "connector", validated: validateGetContactInput(input) };
}

// 5. contacts.update
export function updateContact(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string" && typeof input.instanceUrl === "string") {
    const validated = validateUpdateContactInput(input);
    const { id, ...fields } = validated;
    const body: Record<string, unknown> = {};
    if (fields.firstName !== undefined) body.FirstName = fields.firstName;
    if (fields.lastName !== undefined) body.LastName = fields.lastName;
    if (fields.email !== undefined) body.Email = fields.email;
    if (fields.phone !== undefined) body.Phone = fields.phone;
    if (fields.title !== undefined) body.Title = fields.title;
    if (fields.accountId !== undefined) body.AccountId = fields.accountId;
    return createSalesforceClient({
      accessToken: input.accessToken,
      instanceUrl: input.instanceUrl,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
      operation: "contacts.update",
    }).updateRecord("Contact", id, body).then((result) => {
      if (result.status === 204) {
        return { connector: "salesforce", action: "contacts.update", source: "connector", updated: true, id };
      }
      throw handleError(result);
    });
  }
  return { connector: "salesforce", action: "contacts.update", source: "connector", validated: validateUpdateContactInput(input) };
}

// 6. contacts.delete
export function deleteContact(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string" && typeof input.instanceUrl === "string") {
    const validated = validateDeleteContactInput(input);
    return createSalesforceClient({
      accessToken: input.accessToken,
      instanceUrl: input.instanceUrl,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
      operation: "contacts.delete",
    }).deleteRecord("Contact", validated.id).then((result) => {
      if (result.status === 204) {
        return { connector: "salesforce", action: "contacts.delete", source: "connector", deleted: true, id: validated.id };
      }
      throw handleError(result);
    });
  }
  return { connector: "salesforce", action: "contacts.delete", source: "connector", validated: validateDeleteContactInput(input) };
}

// 7. leads.update
export function updateLead(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string" && typeof input.instanceUrl === "string") {
    const validated = validateUpdateLeadInput(input);
    const { id, ...fields } = validated;
    const body: Record<string, unknown> = {};
    if (fields.firstName !== undefined) body.FirstName = fields.firstName;
    if (fields.lastName !== undefined) body.LastName = fields.lastName;
    if (fields.company !== undefined) body.Company = fields.company;
    if (fields.email !== undefined) body.Email = fields.email;
    if (fields.phone !== undefined) body.Phone = fields.phone;
    if (fields.title !== undefined) body.Title = fields.title;
    if (fields.status !== undefined) body.Status = fields.status;
    if (fields.leadSource !== undefined) body.LeadSource = fields.leadSource;
    return createSalesforceClient({
      accessToken: input.accessToken,
      instanceUrl: input.instanceUrl,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
      operation: "leads.update",
    }).updateRecord("Lead", id, body).then((result) => {
      if (result.status === 204) {
        return { connector: "salesforce", action: "leads.update", source: "connector", updated: true, id };
      }
      throw handleError(result);
    });
  }
  return { connector: "salesforce", action: "leads.update", source: "connector", validated: validateUpdateLeadInput(input) };
}

// 8. opportunities.get
export function getOpportunity(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string" && typeof input.instanceUrl === "string") {
    const validated = validateGetOpportunityInput(input);
    return createSalesforceClient({
      accessToken: input.accessToken,
      instanceUrl: input.instanceUrl,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
      operation: "opportunities.get",
    }).getRecord("Opportunity", validated.id).then((result) => {
      if (result.status === 200) {
        return { connector: "salesforce", action: "opportunities.get", source: "connector", opportunity: normalizeOpportunity(result.body as SalesforceOpportunity) };
      }
      throw handleError(result);
    });
  }
  return { connector: "salesforce", action: "opportunities.get", source: "connector", validated: validateGetOpportunityInput(input) };
}

// 9. sobjects.query
export function querySobjects(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string" && typeof input.instanceUrl === "string") {
    const validated = validateQuerySobjectsInput(input);
    return createSalesforceClient({
      accessToken: input.accessToken,
      instanceUrl: input.instanceUrl,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
      operation: "sobjects.query",
    }).soqlQuery(validated.query).then((result) => {
      if (result.status === 200) {
        return { connector: "salesforce", action: "sobjects.query", source: "connector", result: normalizeQueryResult(result.body) };
      }
      throw handleError(result);
    });
  }
  return { connector: "salesforce", action: "sobjects.query", source: "connector", validated: validateQuerySobjectsInput(input) };
}

// 10. sobjects.search
export function searchSobjects(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string" && typeof input.instanceUrl === "string") {
    const validated = validateSearchSobjectsInput(input);
    return createSalesforceClient({
      accessToken: input.accessToken,
      instanceUrl: input.instanceUrl,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
      operation: "sobjects.search",
    }).searchJSON(validated.query).then((result) => {
      if (result.status === 200) {
        return { connector: "salesforce", action: "sobjects.search", source: "connector", result: normalizeSearchResult(result.body) };
      }
      throw handleError(result);
    });
  }
  return { connector: "salesforce", action: "sobjects.search", source: "connector", validated: validateSearchSobjectsInput(input) };
}

// ── helpers ─────────────────────────────────────────────────────────────────

function handleError(result: { status: number; headers: Record<string, string>; body: unknown }) {
  const rateLimit = parseSalesforceRateLimit(result.status, result.headers);
  if (rateLimit.limited) {
    return { ok: false, code: "CONNECTOR_RATE_LIMITED", message: "Salesforce rate limit exceeded.", retryAfterSeconds: rateLimit.retryAfterSeconds };
  }
  return { ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message: "Salesforce rejected the request." };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
