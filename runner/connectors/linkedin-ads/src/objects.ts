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
  const id = coerceId(data.id);
  const simpleId = id.replace(/^urn:li:sponsoredCampaign:/, "");

  const account = coerceId(data.account);
  const accountId = account.replace(/^urn:li:sponsoredAccount:/, "");

  const budget = data.budget ?? data.dailyBudget ?? data.totalBudget;
  let budgetAmount = 0;
  let currency = "";
  if (isRecord(budget)) {
    budgetAmount = extractNumber(budget, "amount");
    currency = extractString(budget, "currencyCode");
  }

  const costData = data.costInLocalCurrency;
  let cost = 0;
  if (typeof costData === "number") cost = costData;
  else if (typeof costData === "string") cost = Number(costData) || 0;
  else if (isRecord(costData)) {
    cost = extractNumber(costData, "amount");
  }

  let startDate: number | null = null;
  let endDate: number | null = null;
  const start = data.start;
  if (typeof start === "number") startDate = start;
  else if (isRecord(start)) {
    const time = start.time;
    if (typeof time === "number") startDate = time;
  }
  const end = data.end;
  if (typeof end === "number") endDate = end;
  else if (isRecord(end)) {
    const time = end.time;
    if (typeof time === "number") endDate = time;
  }
  const runSchedule = data.runSchedule;
  if (isRecord(runSchedule)) {
    if (startDate == null && typeof runSchedule.start === "number") startDate = runSchedule.start;
    if (endDate == null && typeof runSchedule.end === "number") endDate = runSchedule.end;
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
  const id = coerceId(data.id);
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
  const id = coerceId(data.id);
  const simpleId = id.replace(/^urn:li:creatives:/, "").replace(/^urn:li:sponsoredCreative:/, "");

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


export type NormalizedCampaignGroup = {
  id: string;
  provider: "linkedin-ads";
  name: string;
  status: string;
  accountId: string;
  totalBudget: number;
  currency: string;
  startDate: number | null;
  endDate: number | null;
  modelVersion: "2026-05-17";
  raw: Record<string, unknown>;
};

export type NormalizedCreative = {
  id: string;
  provider: "linkedin-ads";
  type: string;
  status: string;
  campaignId: string;
  accountId: string;
  intendedStatus: string;
  createdAt: number | null;
  updatedAt: number | null;
  modelVersion: "2026-05-17";
  raw: Record<string, unknown>;
};

export type NormalizedAnalyticsRow = {
  id: string;
  provider: "linkedin-ads";
  pivotValues: string[];
  impressions: number;
  clicks: number;
  costInLocalCurrency: number;
  dateRangeStart: { year: number; month: number; day: number } | null;
  dateRangeEnd: { year: number; month: number; day: number } | null;
  modelVersion: "2026-05-17";
  raw: Record<string, unknown>;
};

export function normalizeCampaignGroup(data: Record<string, unknown>): NormalizedCampaignGroup {
  const id = coerceId(data.id);
  const simpleId = id.replace(/^urn:li:sponsoredCampaignGroup:/, "");
  const account = coerceId(data.account);
  const accountId = account.replace(/^urn:li:sponsoredAccount:/, "");

  const totalBudget = data.totalBudget;
  let budgetAmount = 0;
  let currency = "";
  if (isRecord(totalBudget)) {
    budgetAmount = extractNumber(totalBudget, "amount");
    currency = extractString(totalBudget, "currencyCode");
  }

  let startDate: number | null = null;
  let endDate: number | null = null;
  const runSchedule = data.runSchedule;
  if (isRecord(runSchedule)) {
    if (typeof runSchedule.start === "number") startDate = runSchedule.start;
    if (typeof runSchedule.end === "number") endDate = runSchedule.end;
  }

  return {
    id: `li-ads-campaign-group:${simpleId}`,
    provider: "linkedin-ads",
    name: extractString(data, "name"),
    status: extractString(data, "status").toUpperCase(),
    accountId,
    totalBudget: budgetAmount,
    currency,
    startDate,
    endDate,
    modelVersion: "2026-05-17",
    raw: data,
  };
}

export function parseCampaignGroupsResponse(response: unknown): { campaignGroups: NormalizedCampaignGroup[]; nextStart: number | null; count: number } {
  if (!isRecord(response)) return { campaignGroups: [], nextStart: null, count: 0 };
  const elements = response.elements;
  if (!Array.isArray(elements)) return { campaignGroups: [], nextStart: null, count: 0 };
  const campaignGroups = elements.filter(isRecord).map(normalizeCampaignGroup);
  const paging = extractPaging(response);
  return { campaignGroups, ...paging };
}

export function normalizeCreative(data: Record<string, unknown>): NormalizedCreative {
  const id = coerceId(data.id);
  const simpleId = id.replace(/^urn:li:creatives:/, "").replace(/^urn:li:sponsoredCreative:/, "");
  const campaign = coerceId(data.campaign);
  const campaignId = campaign.replace(/^urn:li:sponsoredCampaign:/, "");
  const account = coerceId(data.account);
  const accountId = account.replace(/^urn:li:sponsoredAccount:/, "");

  let createdAt: number | null = null;
  const created = data.created ?? (isRecord(data.changeAuditStamps) ? data.changeAuditStamps.created : null);
  if (isRecord(created) && typeof created.time === "number") createdAt = created.time;

  let updatedAt: number | null = null;
  const lastModified = data.lastModified ?? (isRecord(data.changeAuditStamps) ? data.changeAuditStamps.lastModified : null);
  if (isRecord(lastModified) && typeof lastModified.time === "number") updatedAt = lastModified.time;

  const type = extractString(data, "type") || extractString(data, "contentReference") || "";
  const status = extractString(data, "status") || extractString(data, "intendedStatus");

  return {
    id: `li-ads-creative:${simpleId}`,
    provider: "linkedin-ads",
    type,
    status: status.toUpperCase(),
    campaignId,
    accountId,
    intendedStatus: extractString(data, "intendedStatus").toUpperCase() || status.toUpperCase(),
    createdAt,
    updatedAt,
    modelVersion: "2026-05-17",
    raw: data,
  };
}

export function parseCreativesResponse(response: unknown): { creatives: NormalizedCreative[]; nextStart: number | null; count: number } {
  if (!isRecord(response)) return { creatives: [], nextStart: null, count: 0 };
  const elements = response.elements;
  if (!Array.isArray(elements)) return { creatives: [], nextStart: null, count: 0 };
  const creatives = elements.filter(isRecord).map(normalizeCreative);
  const paging = extractPaging(response);
  return { creatives, ...paging };
}

export function normalizeAnalyticsRow(data: Record<string, unknown>): NormalizedAnalyticsRow {
  const pivotValues = Array.isArray(data.pivotValues)
    ? data.pivotValues.filter((v): v is string => typeof v === "string")
    : [];
  const pivotKey = pivotValues[0] ?? "aggregate";
  const simplePivot = pivotKey.replace(/^urn:li:[^:]+:/, "");

  let dateRangeStart: NormalizedAnalyticsRow["dateRangeStart"] = null;
  let dateRangeEnd: NormalizedAnalyticsRow["dateRangeEnd"] = null;
  const dateRange = data.dateRange;
  if (isRecord(dateRange)) {
    if (isRecord(dateRange.start)) {
      dateRangeStart = {
        year: extractNumber(dateRange.start, "year"),
        month: extractNumber(dateRange.start, "month"),
        day: extractNumber(dateRange.start, "day"),
      };
    }
    if (isRecord(dateRange.end)) {
      dateRangeEnd = {
        year: extractNumber(dateRange.end, "year"),
        month: extractNumber(dateRange.end, "month"),
        day: extractNumber(dateRange.end, "day"),
      };
    }
  }

  const costRaw = data.costInLocalCurrency;
  let cost = 0;
  if (typeof costRaw === "number") cost = costRaw;
  else if (typeof costRaw === "string") cost = Number(costRaw) || 0;
  else if (isRecord(costRaw)) cost = extractNumber(costRaw, "amount");

  return {
    id: `li-ads-analytics:${simplePivot}`,
    provider: "linkedin-ads",
    pivotValues,
    impressions: extractNumber(data, "impressions"),
    clicks: extractNumber(data, "clicks"),
    costInLocalCurrency: cost,
    dateRangeStart,
    dateRangeEnd,
    modelVersion: "2026-05-17",
    raw: data,
  };
}

export function parseAnalyticsResponse(response: unknown): { rows: NormalizedAnalyticsRow[] } {
  if (!isRecord(response)) return { rows: [] };
  const elements = response.elements;
  if (!Array.isArray(elements)) return { rows: [] };
  return { rows: elements.filter(isRecord).map(normalizeAnalyticsRow) };
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


function coerceId(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
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
