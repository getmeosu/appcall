export type SalesforceContact = {
  Id: string;
  attributes?: { type?: string; url?: string };
  FirstName?: string;
  LastName?: string;
  Email?: string;
  Phone?: string;
  MobilePhone?: string;
  Title?: string;
  Department?: string;
  AccountId?: string;
  MailingCity?: string;
  MailingState?: string;
  MailingPostalCode?: string;
  MailingCountry?: string;
  OwnerId?: string;
  CreatedDate?: string;
  LastModifiedDate?: string;
  [key: string]: unknown;
};

export type NormalizedContact = {
  id: string;
  provider: "salesforce";
  providerContactId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  mobilePhone: string;
  title: string;
  department: string;
  accountId: string;
  mailingCity: string;
  mailingState: string;
  mailingPostalCode: string;
  mailingCountry: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  modelVersion: "2026-05-16";
  raw: SalesforceContact;
};

export function normalizeContact(c: SalesforceContact): NormalizedContact {
  return {
    id: `sf-contact:${c.Id}`,
    provider: "salesforce",
    providerContactId: c.Id,
    firstName: c.FirstName ?? "",
    lastName: c.LastName ?? "",
    email: c.Email ?? "",
    phone: c.Phone ?? "",
    mobilePhone: c.MobilePhone ?? "",
    title: c.Title ?? "",
    department: c.Department ?? "",
    accountId: c.AccountId ?? "",
    mailingCity: c.MailingCity ?? "",
    mailingState: c.MailingState ?? "",
    mailingPostalCode: c.MailingPostalCode ?? "",
    mailingCountry: c.MailingCountry ?? "",
    ownerId: c.OwnerId ?? "",
    createdAt: c.CreatedDate ?? "",
    updatedAt: c.LastModifiedDate ?? "",
    modelVersion: "2026-05-16",
    raw: c,
  };
}

export function parseContactsResponse(response: unknown): { contacts: SalesforceContact[]; nextLink: string | null; done: boolean } {
  if (!isRecord(response)) return { contacts: [], nextLink: null, done: true };
  const records = response.records;
  if (!Array.isArray(records)) return { contacts: [], nextLink: null, done: true };
  return {
    contacts: records.filter(isRecord).map((r) => ({
      Id: requireString(r.Id, "Id"),
      attributes: isRecord(r.attributes) ? { type: typeof r.attributes.type === "string" ? r.attributes.type : undefined, url: typeof r.attributes.url === "string" ? r.attributes.url : undefined } : undefined,
      FirstName: typeof r.FirstName === "string" ? r.FirstName : undefined,
      LastName: typeof r.LastName === "string" ? r.LastName : undefined,
      Email: typeof r.Email === "string" ? r.Email : undefined,
      Phone: typeof r.Phone === "string" ? r.Phone : undefined,
      MobilePhone: typeof r.MobilePhone === "string" ? r.MobilePhone : undefined,
      Title: typeof r.Title === "string" ? r.Title : undefined,
      Department: typeof r.Department === "string" ? r.Department : undefined,
      AccountId: typeof r.AccountId === "string" ? r.AccountId : undefined,
      MailingCity: typeof r.MailingCity === "string" ? r.MailingCity : undefined,
      MailingState: typeof r.MailingState === "string" ? r.MailingState : undefined,
      MailingPostalCode: typeof r.MailingPostalCode === "string" ? r.MailingPostalCode : undefined,
      MailingCountry: typeof r.MailingCountry === "string" ? r.MailingCountry : undefined,
      OwnerId: typeof r.OwnerId === "string" ? r.OwnerId : undefined,
      CreatedDate: typeof r.CreatedDate === "string" ? r.CreatedDate : undefined,
      LastModifiedDate: typeof r.LastModifiedDate === "string" ? r.LastModifiedDate : undefined,
    })),
    nextLink: typeof response.nextRecordsUrl === "string" ? response.nextRecordsUrl : null,
    done: response.done === true,
  };
}

export type CreateContactInput = { lastName: string; firstName?: string; email?: string; phone?: string; title?: string; accountId?: string };

export function validateCreateContactInput(input: unknown): CreateContactInput {
  if (!isRecord(input)) throw new Error("create contact input must be an object");
  return {
    lastName: requireString(input.lastName, "lastName"),
    firstName: typeof input.firstName === "string" ? input.firstName : undefined,
    email: typeof input.email === "string" ? input.email : undefined,
    phone: typeof input.phone === "string" ? input.phone : undefined,
    title: typeof input.title === "string" ? input.title : undefined,
    accountId: typeof input.accountId === "string" ? input.accountId : undefined,
  };
}

export type CreateLeadInput = { lastName: string; company: string; firstName?: string; email?: string; phone?: string; title?: string };

export function validateCreateLeadInput(input: unknown): CreateLeadInput {
  if (!isRecord(input)) throw new Error("create lead input must be an object");
  return {
    lastName: requireString(input.lastName, "lastName"),
    company: requireString(input.company, "company"),
    firstName: typeof input.firstName === "string" ? input.firstName : undefined,
    email: typeof input.email === "string" ? input.email : undefined,
    phone: typeof input.phone === "string" ? input.phone : undefined,
    title: typeof input.title === "string" ? input.title : undefined,
  };
}

export type GetContactInput = { id: string };

export function validateGetContactInput(input: unknown): GetContactInput {
  if (!isRecord(input)) throw new Error("get contact input must be an object");
  return { id: requireString(input.id, "id") };
}

export type UpdateContactInput = {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  title?: string;
  accountId?: string;
};

export function validateUpdateContactInput(input: unknown): UpdateContactInput {
  if (!isRecord(input)) throw new Error("update contact input must be an object");
  return {
    id: requireString(input.id, "id"),
    firstName: typeof input.firstName === "string" ? input.firstName : undefined,
    lastName: typeof input.lastName === "string" ? input.lastName : undefined,
    email: typeof input.email === "string" ? input.email : undefined,
    phone: typeof input.phone === "string" ? input.phone : undefined,
    title: typeof input.title === "string" ? input.title : undefined,
    accountId: typeof input.accountId === "string" ? input.accountId : undefined,
  };
}

export type DeleteContactInput = { id: string };

export function validateDeleteContactInput(input: unknown): DeleteContactInput {
  if (!isRecord(input)) throw new Error("delete contact input must be an object");
  return { id: requireString(input.id, "id") };
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
