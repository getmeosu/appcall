export type SalesforceLead = {
  Id: string;
  attributes?: { type?: string; url?: string };
  FirstName?: string;
  LastName?: string;
  Company?: string;
  Email?: string;
  Phone?: string;
  Title?: string;
  Website?: string;
  Industry?: string;
  LeadSource?: string;
  Status?: string;
  OwnerId?: string;
  CreatedDate?: string;
  LastModifiedDate?: string;
  [key: string]: unknown;
};

export type NormalizedLead = {
  id: string;
  provider: "salesforce";
  providerLeadId: string;
  firstName: string;
  lastName: string;
  company: string;
  email: string;
  phone: string;
  title: string;
  website: string;
  industry: string;
  leadSource: string;
  status: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  modelVersion: "2026-05-16";
  raw: SalesforceLead;
};

export function normalizeLead(l: SalesforceLead): NormalizedLead {
  return {
    id: `sf-lead:${l.Id}`,
    provider: "salesforce",
    providerLeadId: l.Id,
    firstName: l.FirstName ?? "",
    lastName: l.LastName ?? "",
    company: l.Company ?? "",
    email: l.Email ?? "",
    phone: l.Phone ?? "",
    title: l.Title ?? "",
    website: l.Website ?? "",
    industry: l.Industry ?? "",
    leadSource: l.LeadSource ?? "",
    status: l.Status ?? "",
    ownerId: l.OwnerId ?? "",
    createdAt: l.CreatedDate ?? "",
    updatedAt: l.LastModifiedDate ?? "",
    modelVersion: "2026-05-16",
    raw: l,
  };
}

export function parseLeadsResponse(response: unknown): { leads: SalesforceLead[]; nextLink: string | null; done: boolean } {
  if (!isRecord(response)) return { leads: [], nextLink: null, done: true };
  const records = response.records;
  if (!Array.isArray(records)) return { leads: [], nextLink: null, done: true };
  return {
    leads: records.filter(isRecord).map((r) => ({
      Id: requireString(r.Id, "Id"),
      attributes: isRecord(r.attributes) ? { type: typeof r.attributes.type === "string" ? r.attributes.type : undefined } : undefined,
      FirstName: typeof r.FirstName === "string" ? r.FirstName : undefined,
      LastName: typeof r.LastName === "string" ? r.LastName : undefined,
      Company: typeof r.Company === "string" ? r.Company : undefined,
      Email: typeof r.Email === "string" ? r.Email : undefined,
      Phone: typeof r.Phone === "string" ? r.Phone : undefined,
      Title: typeof r.Title === "string" ? r.Title : undefined,
      Website: typeof r.Website === "string" ? r.Website : undefined,
      Industry: typeof r.Industry === "string" ? r.Industry : undefined,
      LeadSource: typeof r.LeadSource === "string" ? r.LeadSource : undefined,
      Status: typeof r.Status === "string" ? r.Status : undefined,
      OwnerId: typeof r.OwnerId === "string" ? r.OwnerId : undefined,
      CreatedDate: typeof r.CreatedDate === "string" ? r.CreatedDate : undefined,
      LastModifiedDate: typeof r.LastModifiedDate === "string" ? r.LastModifiedDate : undefined,
    })),
    nextLink: typeof response.nextRecordsUrl === "string" ? response.nextRecordsUrl : null,
    done: response.done === true,
  };
}

export type UpdateLeadInput = {
  id: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  email?: string;
  phone?: string;
  title?: string;
  status?: string;
  leadSource?: string;
};

export function validateUpdateLeadInput(input: unknown): UpdateLeadInput {
  if (!isRecord(input)) throw new Error("update lead input must be an object");
  return {
    id: requireString(input.id, "id"),
    firstName: typeof input.firstName === "string" ? input.firstName : undefined,
    lastName: typeof input.lastName === "string" ? input.lastName : undefined,
    company: typeof input.company === "string" ? input.company : undefined,
    email: typeof input.email === "string" ? input.email : undefined,
    phone: typeof input.phone === "string" ? input.phone : undefined,
    title: typeof input.title === "string" ? input.title : undefined,
    status: typeof input.status === "string" ? input.status : undefined,
    leadSource: typeof input.leadSource === "string" ? input.leadSource : undefined,
  };
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
