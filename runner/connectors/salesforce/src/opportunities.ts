export type SalesforceOpportunity = {
  Id: string;
  attributes?: { type?: string; url?: string };
  Name?: string;
  StageName?: string;
  CloseDate?: string;
  Amount?: number;
  Probability?: number;
  Type?: string;
  AccountId?: string;
  OwnerId?: string;
  Description?: string;
  IsWon?: boolean;
  IsClosed?: boolean;
  CreatedDate?: string;
  LastModifiedDate?: string;
  [key: string]: unknown;
};

export type NormalizedOpportunity = {
  id: string;
  provider: "salesforce";
  providerOpportunityId: string;
  name: string;
  stage: string;
  closeDate: string;
  amount: number;
  probability: number;
  type: string;
  accountId: string;
  ownerId: string;
  isWon: boolean;
  isClosed: boolean;
  createdAt: string;
  updatedAt: string;
  modelVersion: "2026-05-16";
  raw: SalesforceOpportunity;
};

export function normalizeOpportunity(o: SalesforceOpportunity): NormalizedOpportunity {
  return {
    id: `sf-opportunity:${o.Id}`,
    provider: "salesforce",
    providerOpportunityId: o.Id,
    name: o.Name ?? "",
    stage: o.StageName ?? "",
    closeDate: o.CloseDate ?? "",
    amount: o.Amount ?? 0,
    probability: o.Probability ?? 0,
    type: o.Type ?? "",
    accountId: o.AccountId ?? "",
    ownerId: o.OwnerId ?? "",
    isWon: o.IsWon ?? false,
    isClosed: o.IsClosed ?? false,
    createdAt: o.CreatedDate ?? "",
    updatedAt: o.LastModifiedDate ?? "",
    modelVersion: "2026-05-16",
    raw: o,
  };
}

export function parseOpportunitiesResponse(response: unknown): { opportunities: SalesforceOpportunity[]; nextLink: string | null; done: boolean } {
  if (!isRecord(response)) return { opportunities: [], nextLink: null, done: true };
  const records = response.records;
  if (!Array.isArray(records)) return { opportunities: [], nextLink: null, done: true };
  return {
    opportunities: records.filter(isRecord).map((r) => ({
      Id: requireString(r.Id, "Id"),
      attributes: isRecord(r.attributes) ? { type: typeof r.attributes.type === "string" ? r.attributes.type : undefined } : undefined,
      Name: typeof r.Name === "string" ? r.Name : undefined,
      StageName: typeof r.StageName === "string" ? r.StageName : undefined,
      CloseDate: typeof r.CloseDate === "string" ? r.CloseDate : undefined,
      Amount: typeof r.Amount === "number" ? r.Amount : undefined,
      Probability: typeof r.Probability === "number" ? r.Probability : undefined,
      Type: typeof r.Type === "string" ? r.Type : undefined,
      AccountId: typeof r.AccountId === "string" ? r.AccountId : undefined,
      OwnerId: typeof r.OwnerId === "string" ? r.OwnerId : undefined,
      Description: typeof r.Description === "string" ? r.Description : undefined,
      IsWon: typeof r.IsWon === "boolean" ? r.IsWon : undefined,
      IsClosed: typeof r.IsClosed === "boolean" ? r.IsClosed : undefined,
      CreatedDate: typeof r.CreatedDate === "string" ? r.CreatedDate : undefined,
      LastModifiedDate: typeof r.LastModifiedDate === "string" ? r.LastModifiedDate : undefined,
    })),
    nextLink: typeof response.nextRecordsUrl === "string" ? response.nextRecordsUrl : null,
    done: response.done === true,
  };
}

export type CreateOpportunityInput = { name: string; closeDate: string; stage: string; amount?: number; accountId?: string };

export function validateCreateOpportunityInput(input: unknown): CreateOpportunityInput {
  if (!isRecord(input)) throw new Error("create opportunity input must be an object");
  return {
    name: requireString(input.name, "name"),
    closeDate: requireString(input.closeDate, "closeDate"),
    stage: requireString(input.stage, "stage"),
    amount: typeof input.amount === "number" ? input.amount : undefined,
    accountId: typeof input.accountId === "string" ? input.accountId : undefined,
  };
}

export type GetOpportunityInput = { id: string };

export function validateGetOpportunityInput(input: unknown): GetOpportunityInput {
  if (!isRecord(input)) throw new Error("get opportunity input must be an object");
  return { id: requireString(input.id, "id") };
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
