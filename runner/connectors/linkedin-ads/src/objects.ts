export type NormalizedCampaign = {
  id: string;
  provider: "linkedin-ads";
  name: string;
  status: string;
  type: string;
  accountId: string;
  budget: number;
  currency: string;
  startDate: number | null;
  endDate: number | null;
  runStatus: string;
  costInLocalCurrency: number;
  modelVersion: "2026-05-17";
  raw: Record<string, unknown>;
};

export type NormalizedAdAccount = {
  id: string;
  provider: "linkedin-ads";
  name: string;
  status: string;
  type: string;
  currency: string;
  reference: string;
  modelVersion: "2026-05-17";
  raw: Record<string, unknown>;
};

export type NormalizedCreativeAsset = {
  id: string;
  provider: "linkedin-ads";
  type: string;
  status: string;
  createdAt: number | null;
  updatedAt: number | null;
  modelVersion: "2026-05-17";
  raw: Record<string, unknown>;
};

export function normalizeCampaign(data: Record<string, unknown>): NormalizedCampaign {
  const id = extractString(data, "id") || "";
  const simpleId = id.replace(/^urn:li:sponsoredCampaign:/, "");

  const account = extractString(data, "account") || "";
  const accountId = account.replace(/^urn:li:sponsoredAccount:/, "");

  const budget = data.budget;
  let budgetAmount = 0;
  let currency = "";
  if (isRecord(budget)) {
    budgetAmount = extractNumber(budget, "amount");
    currency = extractString(budget, "currencyCode");
  }

  const costData = data.costInLocalCurrency;
  let cost = 0;
  if (isRecord(costData)) {
    cost = extractNumber(costData, "amount");
  }

  let startDate: number | null = null;
  const start = data.start;
  if (typeof start === "number") startDate = start;
  else if (isRecord(start)) {
    const time = start.time;
    if (typeof time === "number") startDate = time;
  }

  let endDate: number | null = null;
  const end = data.end;
  if (typeof end === "number") endDate = end;
  else if (isRecord(end)) {
    const time = end.time;
    if (typeof time === "number") endDate = time;
  }

  return {
    id: `li-ads-campaign:${simpleId}`,
    provider: "linkedin-ads",
    name: extractString(data, "name"),
    status: extractString(data, "status").toUpperCase(),
    type: extractString(data, "type"),
    accountId,
    budget: budgetAmount,
    currency,
    startDate,
    endDate,
    runStatus: extractString(data, "runStatus").toUpperCase(),
    costInLocalCurrency: cost,
    modelVersion: "2026-05-17",
    raw: data,
  };
}

export function parseCampaignsResponse(response: unknown): { campaigns: NormalizedCampaign[]; nextStart: number | null; count: number } {
  if (!isRecord(response)) return { campaigns: [], nextStart: null, count: 0 };
  const elements = response.elements;
  if (!Array.isArray(elements)) return { campaigns: [], nextStart: null, count: 0 };
  const campaigns = elements.filter(isRecord).map(normalizeCampaign);
  const paging = extractPaging(response);
  return { campaigns, ...paging };
}

export function normalizeAdAccount(data: Record<string, unknown>): NormalizedAdAccount {
  const id = extractString(data, "id") || "";
  const simpleId = id.replace(/^urn:li:sponsoredAccount:/, "");

  return {
    id: `li-ads-account:${simpleId}`,
    provider: "linkedin-ads",
    name: extractString(data, "name"),
    status: extractString(data, "status").toUpperCase(),
    type: extractString(data, "type"),
    currency: extractString(data, "currency"),
    reference: extractString(data, "reference"),
    modelVersion: "2026-05-17",
    raw: data,
  };
}

export function parseAdAccountsResponse(response: unknown): { adAccounts: NormalizedAdAccount[]; nextStart: number | null; count: number } {
  if (!isRecord(response)) return { adAccounts: [], nextStart: null, count: 0 };
  const elements = response.elements;
  if (!Array.isArray(elements)) return { adAccounts: [], nextStart: null, count: 0 };
  const accounts = elements.filter(isRecord).map(normalizeAdAccount);
  const paging = extractPaging(response);
  return { adAccounts: accounts, ...paging };
}

export function normalizeCreativeAsset(data: Record<string, unknown>): NormalizedCreativeAsset {
  const id = extractString(data, "id") || "";
  const simpleId = id.replace(/^urn:li:creatives:/, "");

  let createdAt: number | null = null;
  const created = data.created;
  if (isRecord(created)) {
    const time = created.time;
    if (typeof time === "number") createdAt = time;
  }

  let updatedAt: number | null = null;
  const lastModified = data.lastModified;
  if (isRecord(lastModified)) {
    const time = lastModified.time;
    if (typeof time === "number") updatedAt = time;
  }

  return {
    id: `li-ads-creative:${simpleId}`,
    provider: "linkedin-ads",
    type: extractString(data, "type"),
    status: extractString(data, "status").toUpperCase(),
    createdAt,
    updatedAt,
    modelVersion: "2026-05-17",
    raw: data,
  };
}

export function parseCreativeAssetsResponse(response: unknown): { creativeAssets: NormalizedCreativeAsset[]; nextStart: number | null; count: number } {
  if (!isRecord(response)) return { creativeAssets: [], nextStart: null, count: 0 };
  const elements = response.elements;
  if (!Array.isArray(elements)) return { creativeAssets: [], nextStart: null, count: 0 };
  const assets = elements.filter(isRecord).map(normalizeCreativeAsset);
  const paging = extractPaging(response);
  return { creativeAssets: assets, ...paging };
}

function extractPaging(response: Record<string, unknown>): { nextStart: number | null; count: number } {
  const paging = response.paging;
  if (!isRecord(paging)) return { nextStart: null, count: 0 };
  const count = typeof paging.count === "number" ? paging.count : 0;
  const links = paging.links;
  if (!Array.isArray(links) || links.length === 0) return { nextStart: null, count };
  const nextLink = links.find((l: any) => isRecord(l) && l.rel === "next");
  if (!nextLink || !isRecord(nextLink)) return { nextStart: null, count };
  const uri = nextLink.uri;
  if (typeof uri !== "string") return { nextStart: null, count };
  const match = uri.match(/start=(\d+)/);
  if (!match) return { nextStart: null, count };
  return { nextStart: Number(match[1]), count };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractString(obj: Record<string, unknown>, field: string): string {
  const val = obj[field];
  return typeof val === "string" ? val : "";
}

function extractNumber(obj: Record<string, unknown>, field: string): number {
  const val = obj[field];
  if (typeof val === "number") return Number.isFinite(val) ? val : 0;
  if (typeof val === "string") { const n = Number(val); return Number.isFinite(n) ? n : 0; }
  return 0;
}
