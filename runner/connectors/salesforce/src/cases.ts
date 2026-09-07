export type SalesforceCase = {
  Id: string;
  attributes?: { type?: string; url?: string };
  CaseNumber?: string;
  Subject?: string;
  Description?: string;
  Status?: string;
  Priority?: string;
  Origin?: string;
  Reason?: string;
  Type?: string;
  IsClosed?: boolean;
  IsEscalated?: boolean;
  AccountId?: string;
  ContactId?: string;
  OwnerId?: string;
  ClosedDate?: string;
  CreatedDate?: string;
  LastModifiedDate?: string;
  [key: string]: unknown;
};

export type NormalizedCase = {
  id: string;
  provider: "salesforce";
  providerCaseId: string;
  caseNumber: string;
  subject: string;
  description: string;
  status: string;
  priority: string;
  origin: string;
  reason: string;
  isClosed: boolean;
  isEscalated: boolean;
  accountId: string;
  contactId: string;
  ownerId: string;
  closedAt: string;
  createdAt: string;
  updatedAt: string;
  modelVersion: "2026-05-16";
  raw: SalesforceCase;
};

export function normalizeCase(c: SalesforceCase): NormalizedCase {
  return {
    id: `sf-case:${c.Id}`,
    provider: "salesforce",
    providerCaseId: c.Id,
    caseNumber: c.CaseNumber ?? "",
    subject: c.Subject ?? "",
    description: c.Description ?? "",
    status: c.Status ?? "",
    priority: c.Priority ?? "",
    origin: c.Origin ?? "",
    reason: c.Reason ?? "",
    isClosed: c.IsClosed ?? false,
    isEscalated: c.IsEscalated ?? false,
    accountId: c.AccountId ?? "",
    contactId: c.ContactId ?? "",
    ownerId: c.OwnerId ?? "",
    closedAt: c.ClosedDate ?? "",
    createdAt: c.CreatedDate ?? "",
    updatedAt: c.LastModifiedDate ?? "",
    modelVersion: "2026-05-16",
    raw: c,
  };
}

export function parseCasesResponse(response: unknown): { cases: SalesforceCase[]; nextLink: string | null; done: boolean } {
  if (!isRecord(response)) return { cases: [], nextLink: null, done: true };
  const records = response.records;
  if (!Array.isArray(records)) return { cases: [], nextLink: null, done: true };
  return {
    cases: records.filter(isRecord).map((r) => ({
      Id: requireString(r.Id, "Id"),
      attributes: isRecord(r.attributes) ? { type: typeof r.attributes.type === "string" ? r.attributes.type : undefined } : undefined,
      CaseNumber: typeof r.CaseNumber === "string" ? r.CaseNumber : undefined,
      Subject: typeof r.Subject === "string" ? r.Subject : undefined,
      Description: typeof r.Description === "string" ? r.Description : undefined,
      Status: typeof r.Status === "string" ? r.Status : undefined,
      Priority: typeof r.Priority === "string" ? r.Priority : undefined,
      Origin: typeof r.Origin === "string" ? r.Origin : undefined,
      Reason: typeof r.Reason === "string" ? r.Reason : undefined,
      Type: typeof r.Type === "string" ? r.Type : undefined,
      IsClosed: typeof r.IsClosed === "boolean" ? r.IsClosed : undefined,
      IsEscalated: typeof r.IsEscalated === "boolean" ? r.IsEscalated : undefined,
      AccountId: typeof r.AccountId === "string" ? r.AccountId : undefined,
      ContactId: typeof r.ContactId === "string" ? r.ContactId : undefined,
      OwnerId: typeof r.OwnerId === "string" ? r.OwnerId : undefined,
      ClosedDate: typeof r.ClosedDate === "string" ? r.ClosedDate : undefined,
      CreatedDate: typeof r.CreatedDate === "string" ? r.CreatedDate : undefined,
      LastModifiedDate: typeof r.LastModifiedDate === "string" ? r.LastModifiedDate : undefined,
    })),
    nextLink: typeof response.nextRecordsUrl === "string" ? response.nextRecordsUrl : null,
    done: response.done === true,
  };
}

export type CreateCaseInput = { subject: string; description?: string; status?: string; priority?: string; origin?: string; accountId?: string; contactId?: string };

export function validateCreateCaseInput(input: unknown): CreateCaseInput {
  if (!isRecord(input)) throw new Error("create case input must be an object");
  return {
    subject: requireString(input.subject, "subject"),
    description: typeof input.description === "string" ? input.description : undefined,
    status: typeof input.status === "string" ? input.status : undefined,
    priority: typeof input.priority === "string" ? input.priority : undefined,
    origin: typeof input.origin === "string" ? input.origin : undefined,
    accountId: typeof input.accountId === "string" ? input.accountId : undefined,
    contactId: typeof input.contactId === "string" ? input.contactId : undefined,
  };
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
