export type SalesforceAccount = {
  Id: string;
  attributes?: { type?: string; url?: string };
  Name?: string;
  Type?: string;
  Industry?: string;
  BillingCity?: string;
  BillingState?: string;
  BillingCountry?: string;
  BillingPostalCode?: string;
  Phone?: string;
  Website?: string;
  NumberOfEmployees?: number;
  AnnualRevenue?: number;
  OwnerId?: string;
  CreatedDate?: string;
  LastModifiedDate?: string;
  [key: string]: unknown;
};

export type NormalizedAccount = {
  id: string;
  provider: "salesforce";
  providerAccountId: string;
  name: string;
  type: string;
  industry: string;
  billingCity: string;
  billingState: string;
  billingCountry: string;
  billingPostalCode: string;
  phone: string;
  website: string;
  numberOfEmployees: number;
  annualRevenue: number;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  modelVersion: "2026-05-16";
  raw: SalesforceAccount;
};

export function normalizeAccount(a: SalesforceAccount): NormalizedAccount {
  return {
    id: `sf-account:${a.Id}`,
    provider: "salesforce",
    providerAccountId: a.Id,
    name: a.Name ?? "",
    type: a.Type ?? "",
    industry: a.Industry ?? "",
    billingCity: a.BillingCity ?? "",
    billingState: a.BillingState ?? "",
    billingCountry: a.BillingCountry ?? "",
    billingPostalCode: a.BillingPostalCode ?? "",
    phone: a.Phone ?? "",
    website: a.Website ?? "",
    numberOfEmployees: a.NumberOfEmployees ?? 0,
    annualRevenue: a.AnnualRevenue ?? 0,
    ownerId: a.OwnerId ?? "",
    createdAt: a.CreatedDate ?? "",
    updatedAt: a.LastModifiedDate ?? "",
    modelVersion: "2026-05-16",
    raw: a,
  };
}

export function parseAccountsResponse(response: unknown): { accounts: SalesforceAccount[]; nextLink: string | null; done: boolean } {
  if (!isRecord(response)) return { accounts: [], nextLink: null, done: true };
  const records = response.records;
  if (!Array.isArray(records)) return { accounts: [], nextLink: null, done: true };
  return {
    accounts: records.filter(isRecord).map((r) => ({
      Id: requireString(r.Id, "Id"),
      attributes: isRecord(r.attributes) ? { type: typeof r.attributes.type === "string" ? r.attributes.type : undefined, url: typeof r.attributes.url === "string" ? r.attributes.url : undefined } : undefined,
      Name: typeof r.Name === "string" ? r.Name : undefined,
      Type: typeof r.Type === "string" ? r.Type : undefined,
      Industry: typeof r.Industry === "string" ? r.Industry : undefined,
      BillingCity: typeof r.BillingCity === "string" ? r.BillingCity : undefined,
      BillingState: typeof r.BillingState === "string" ? r.BillingState : undefined,
      BillingCountry: typeof r.BillingCountry === "string" ? r.BillingCountry : undefined,
      BillingPostalCode: typeof r.BillingPostalCode === "string" ? r.BillingPostalCode : undefined,
      Phone: typeof r.Phone === "string" ? r.Phone : undefined,
      Website: typeof r.Website === "string" ? r.Website : undefined,
      NumberOfEmployees: typeof r.NumberOfEmployees === "number" ? r.NumberOfEmployees : undefined,
      AnnualRevenue: typeof r.AnnualRevenue === "number" ? r.AnnualRevenue : undefined,
      OwnerId: typeof r.OwnerId === "string" ? r.OwnerId : undefined,
      CreatedDate: typeof r.CreatedDate === "string" ? r.CreatedDate : undefined,
      LastModifiedDate: typeof r.LastModifiedDate === "string" ? r.LastModifiedDate : undefined,
    })),
    nextLink: typeof response.nextRecordsUrl === "string" ? response.nextRecordsUrl : null,
    done: response.done === true,
  };
}

export type CreateAccountInput = {
  name: string;
  type?: string;
  industry?: string;
  phone?: string;
  website?: string;
  billingCity?: string;
  billingState?: string;
  billingCountry?: string;
  billingPostalCode?: string;
  numberOfEmployees?: number;
  annualRevenue?: number;
};

export function validateCreateAccountInput(input: unknown): CreateAccountInput {
  if (!isRecord(input)) throw new Error("create account input must be an object");
  return {
    name: requireString(input.name, "name"),
    type: typeof input.type === "string" ? input.type : undefined,
    industry: typeof input.industry === "string" ? input.industry : undefined,
    phone: typeof input.phone === "string" ? input.phone : undefined,
    website: typeof input.website === "string" ? input.website : undefined,
    billingCity: typeof input.billingCity === "string" ? input.billingCity : undefined,
    billingState: typeof input.billingState === "string" ? input.billingState : undefined,
    billingCountry: typeof input.billingCountry === "string" ? input.billingCountry : undefined,
    billingPostalCode: typeof input.billingPostalCode === "string" ? input.billingPostalCode : undefined,
    numberOfEmployees: typeof input.numberOfEmployees === "number" ? input.numberOfEmployees : undefined,
    annualRevenue: typeof input.annualRevenue === "number" ? input.annualRevenue : undefined,
  };
}

export type GetAccountInput = { id: string };

export function validateGetAccountInput(input: unknown): GetAccountInput {
  if (!isRecord(input)) throw new Error("get account input must be an object");
  return { id: requireString(input.id, "id") };
}

export type UpdateAccountInput = {
  id: string;
  name?: string;
  type?: string;
  industry?: string;
  phone?: string;
  website?: string;
  billingCity?: string;
  billingState?: string;
  billingCountry?: string;
  billingPostalCode?: string;
  numberOfEmployees?: number;
  annualRevenue?: number;
};

export function validateUpdateAccountInput(input: unknown): UpdateAccountInput {
  if (!isRecord(input)) throw new Error("update account input must be an object");
  return {
    id: requireString(input.id, "id"),
    name: typeof input.name === "string" ? input.name : undefined,
    type: typeof input.type === "string" ? input.type : undefined,
    industry: typeof input.industry === "string" ? input.industry : undefined,
    phone: typeof input.phone === "string" ? input.phone : undefined,
    website: typeof input.website === "string" ? input.website : undefined,
    billingCity: typeof input.billingCity === "string" ? input.billingCity : undefined,
    billingState: typeof input.billingState === "string" ? input.billingState : undefined,
    billingCountry: typeof input.billingCountry === "string" ? input.billingCountry : undefined,
    billingPostalCode: typeof input.billingPostalCode === "string" ? input.billingPostalCode : undefined,
    numberOfEmployees: typeof input.numberOfEmployees === "number" ? input.numberOfEmployees : undefined,
    annualRevenue: typeof input.annualRevenue === "number" ? input.annualRevenue : undefined,
  };
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
