// Generic SObject query and search operations.

export type SalesforceQueryResult = {
  totalSize: number;
  done: boolean;
  nextRecordsUrl?: string;
  records: Record<string, unknown>[];
};

export type NormalizedQueryResult = {
  totalSize: number;
  done: boolean;
  nextRecordsUrl: string;
  records: Record<string, unknown>[];
  modelVersion: "2026-05-16";
};

export function normalizeQueryResult(raw: unknown): NormalizedQueryResult {
  if (!isRecord(raw)) throw new Error("unexpected query response shape");
  const records = Array.isArray(raw.records) ? raw.records as Record<string, unknown>[] : [];
  return {
    totalSize: typeof raw.totalSize === "number" ? raw.totalSize : records.length,
    done: raw.done === true,
    nextRecordsUrl: typeof raw.nextRecordsUrl === "string" ? raw.nextRecordsUrl : "",
    records,
    modelVersion: "2026-05-16",
  };
}

export type SalesforceSearchResult = {
  searchRecords: Record<string, unknown>[];
};

export type NormalizedSearchResult = {
  searchRecords: Record<string, unknown>[];
  count: number;
  modelVersion: "2026-05-16";
};

export function normalizeSearchResult(raw: unknown): NormalizedSearchResult {
  if (!isRecord(raw)) throw new Error("unexpected search response shape");
  const searchRecords = Array.isArray(raw.searchRecords) ? raw.searchRecords as Record<string, unknown>[] : [];
  return {
    searchRecords,
    count: searchRecords.length,
    modelVersion: "2026-05-16",
  };
}

export type QuerySobjectsInput = { query: string };

export function validateQuerySobjectsInput(input: unknown): QuerySobjectsInput {
  if (!isRecord(input)) throw new Error("query input must be an object");
  return { query: requireString(input.query, "query") };
}

export type SearchSobjectsInput = { query: string };

export function validateSearchSobjectsInput(input: unknown): SearchSobjectsInput {
  if (!isRecord(input)) throw new Error("search input must be an object");
  return { query: requireString(input.query, "query") };
}

export type DescribeSobjectInput = { sobject: string };

export function validateDescribeSobjectInput(input: unknown): DescribeSobjectInput {
  if (!isRecord(input)) throw new Error("describe input must be an object");
  return { sobject: requireString(input.sobject, "sobject") };
}

export type NormalizedDescribeResult = {
  name: string;
  label: string;
  keyPrefix: string;
  custom: boolean;
  createable: boolean;
  updateable: boolean;
  deletable: boolean;
  queryable: boolean;
  fields: Array<{
    name: string;
    label: string;
    type: string;
    length: number;
    nillable: boolean;
    createable: boolean;
    updateable: boolean;
  }>;
  modelVersion: "2026-05-16";
};

export function normalizeDescribeResult(raw: unknown): NormalizedDescribeResult {
  if (!isRecord(raw)) throw new Error("unexpected describe response shape");
  const fields = Array.isArray(raw.fields) ? raw.fields.filter(isRecord).map((field) => ({
    name: typeof field.name === "string" ? field.name : "",
    label: typeof field.label === "string" ? field.label : "",
    type: typeof field.type === "string" ? field.type : "",
    length: typeof field.length === "number" ? field.length : 0,
    nillable: field.nillable === true,
    createable: field.createable === true,
    updateable: field.updateable === true,
  })) : [];
  return {
    name: typeof raw.name === "string" ? raw.name : "",
    label: typeof raw.label === "string" ? raw.label : "",
    keyPrefix: typeof raw.keyPrefix === "string" ? raw.keyPrefix : "",
    custom: raw.custom === true,
    createable: raw.createable === true,
    updateable: raw.updateable === true,
    deletable: raw.deletable === true,
    queryable: raw.queryable === true,
    fields,
    modelVersion: "2026-05-16",
  };
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
