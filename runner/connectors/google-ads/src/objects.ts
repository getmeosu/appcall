import {
  type GoogleAdsCampaignRow,
  type GoogleAdsAdGroupRow,
  type GoogleAdsAdRow,
  type GoogleAdsKeywordRow,
  type GoogleAdsBudgetRow,
  type GoogleAdsCustomerClientRow,
  type GoogleAdsUserListRow,
  type GoogleAdsConversionActionRow,
  prop,
  propNum,
  isRecord,
} from "./http";

// ---------------------------------------------------------------------------
// Normalized types
// ---------------------------------------------------------------------------

export type NormalizedCampaignMetrics = {
  impressions: number;
  clicks: number;
  cost: number;
};

export type NormalizedCampaign = {
  id: string;
  provider: "google-ads";
  name: string;
  status: string;
  budget: number;
  biddingStrategy: string;
  startDate: string;
  endDate: string;
  metrics: NormalizedCampaignMetrics;
  raw: GoogleAdsCampaignRow;
};

export type NormalizedAdGroupMetrics = {
  impressions: number;
  clicks: number;
  cost: number;
};

export type NormalizedAdGroup = {
  id: string;
  provider: "google-ads";
  campaignId: string;
  name: string;
  status: string;
  type: string;
  cpcBid: number;
  metrics: NormalizedAdGroupMetrics;
  raw: GoogleAdsAdGroupRow;
};

export type NormalizedAd = {
  id: string;
  provider: "google-ads";
  adGroupId: string;
  name: string;
  status: string;
  type: string;
  headline: string;
  description: string;
  finalUrls: string[];
  raw: GoogleAdsAdRow;
};

export type NormalizedKeyword = {
  id: string;
  provider: "google-ads";
  adGroupId: string;
  text: string;
  matchType: string;
  status: string;
  cpcBid: number;
  negative: boolean;
  metrics: NormalizedCampaignMetrics;
  raw: GoogleAdsKeywordRow;
};

export type NormalizedBudget = {
  id: string;
  provider: "google-ads";
  name: string;
  amount: number;
  status: string;
  deliveryMethod: string;
  period: string;
  explicitlyShared: boolean;
  raw: GoogleAdsBudgetRow;
};

export type NormalizedCustomer = {
  id: string;
  provider: "google-ads";
  resourceName: string;
  descriptiveName: string;
  status: string;
  manager: boolean;
  level: string;
  currencyCode: string;
  timeZone: string;
  raw: Record<string, unknown>;
};

export type NormalizedUserList = {
  id: string;
  provider: "google-ads";
  name: string;
  description: string;
  membershipStatus: string;
  sizeForDisplay: number;
  sizeForSearch: number;
  type: string;
  raw: GoogleAdsUserListRow;
};

export type NormalizedConversionAction = {
  id: string;
  provider: "google-ads";
  name: string;
  status: string;
  type: string;
  category: string;
  primaryForGoal: boolean;
  raw: GoogleAdsConversionActionRow;
};

// ---------------------------------------------------------------------------
// Normalization helpers
// ---------------------------------------------------------------------------

function extractMetrics(metrics: Record<string, unknown> | undefined): { impressions: number; clicks: number; cost: number } {
  if (!isRecord(metrics)) return { impressions: 0, clicks: 0, cost: 0 };
  return {
    impressions: propNum(metrics, "impressions"),
    clicks: propNum(metrics, "clicks"),
    cost: microsToDollars(propNum(metrics, "cost_micros")),
  };
}

function microsToDollars(micros: number): number {
  return micros / 1_000_000;
}

/**
 * Extract trailing ID from a Google Ads resource name like
 * `customers/123/campaigns/456`.
 */
export function extractIdFromResourceName(resourceName: string): string {
  const parts = resourceName.split("/");
  return parts[parts.length - 1] ?? resourceName;
}

function firstString(...vals: unknown[]): string {
  for (const v of vals) {
    if (typeof v === "string" && v.length > 0) return v;
  }
  return "";
}

// ---------------------------------------------------------------------------
// Normalize functions
// ---------------------------------------------------------------------------

export function normalizeCampaign(row: GoogleAdsCampaignRow): NormalizedCampaign {
  const campaign = row.campaign;
  const campaignObj = campaign as unknown as Record<string, unknown>;
  const budgetObj = isRecord(campaignObj.budget) ? campaignObj.budget as Record<string, unknown> : undefined;
  const metrics = extractMetrics(row.metrics as Record<string, unknown> | undefined);

  return {
    id: `gads-campaign:${campaign.id}`,
    provider: "google-ads",
    name: prop(campaignObj, "name"),
    status: prop(campaignObj, "status"),
    budget: budgetObj ? microsToDollars(propNum(budgetObj, "amount_micros")) : 0,
    biddingStrategy: prop(campaignObj, "bidding_strategy"),
    startDate: prop(campaignObj, "start_date"),
    endDate: prop(campaignObj, "end_date"),
    metrics,
    raw: row,
  };
}

export function normalizeAdGroup(row: GoogleAdsAdGroupRow): NormalizedAdGroup {
  const adGroup = row.ad_group;
  const adGroupObj = adGroup as unknown as Record<string, unknown>;
  const metrics = extractMetrics(row.metrics as Record<string, unknown> | undefined);

  return {
    id: `gads-adgroup:${adGroup.id}`,
    provider: "google-ads",
    campaignId: extractIdFromResourceName(prop(adGroupObj, "campaign")),
    name: prop(adGroupObj, "name"),
    status: prop(adGroupObj, "status"),
    type: prop(adGroupObj, "type"),
    cpcBid: microsToDollars(propNum(adGroupObj, "cpc_bid_micros")),
    metrics,
    raw: row,
  };
}

export function normalizeAd(row: GoogleAdsAdRow): NormalizedAd {
  const ad = row.ad;
  const adObj = ad as unknown as Record<string, unknown>;
  const finalUrls = Array.isArray(adObj.final_urls)
    ? (adObj.final_urls as unknown[]).filter((u): u is string => typeof u === "string")
    : [];

  return {
    id: `gads-ad:${ad.id}`,
    provider: "google-ads",
    adGroupId: extractIdFromResourceName(prop(adObj, "ad_group")),
    name: prop(adObj, "name"),
    status: prop(adObj, "status"),
    type: prop(adObj, "type"),
    headline: prop(adObj, "headline"),
    description: prop(adObj, "description"),
    finalUrls,
    raw: row,
  };
}

export function normalizeKeyword(row: GoogleAdsKeywordRow): NormalizedKeyword {
  const criterion = row.ad_group_criterion;
  const obj = criterion as unknown as Record<string, unknown>;
  const keyword = isRecord(obj.keyword) ? obj.keyword as Record<string, unknown> : {};
  const metrics = extractMetrics(row.metrics as Record<string, unknown> | undefined);
  const criterionId = firstString(obj.criterion_id, obj.id);

  return {
    id: `gads-keyword:${criterionId}`,
    provider: "google-ads",
    adGroupId: extractIdFromResourceName(prop(obj, "ad_group")),
    text: prop(keyword, "text"),
    matchType: prop(keyword, "match_type"),
    status: prop(obj, "status"),
    cpcBid: microsToDollars(propNum(obj, "cpc_bid_micros")),
    negative: obj.negative === true,
    metrics,
    raw: row,
  };
}

export function normalizeBudget(row: GoogleAdsBudgetRow): NormalizedBudget {
  const budget = row.campaign_budget;
  const obj = budget as unknown as Record<string, unknown>;
  return {
    id: `gads-budget:${budget.id}`,
    provider: "google-ads",
    name: prop(obj, "name"),
    amount: microsToDollars(propNum(obj, "amount_micros")),
    status: prop(obj, "status"),
    deliveryMethod: prop(obj, "delivery_method"),
    period: prop(obj, "period"),
    explicitlyShared: obj.explicitly_shared === true,
    raw: row,
  };
}

export function normalizeCustomerClient(row: GoogleAdsCustomerClientRow): NormalizedCustomer {
  const client = row.customer_client;
  const obj = client as unknown as Record<string, unknown>;
  const resourceName = firstString(obj.resource_name, obj.client_customer);
  const id = firstString(obj.id, extractIdFromResourceName(resourceName));
  return {
    id: `gads-customer:${id}`,
    provider: "google-ads",
    resourceName,
    descriptiveName: prop(obj, "descriptive_name"),
    status: prop(obj, "status"),
    manager: obj.manager === true,
    level: firstString(obj.level, ""),
    currencyCode: prop(obj, "currency_code"),
    timeZone: prop(obj, "time_zone"),
    raw: row as unknown as Record<string, unknown>,
  };
}

export function normalizeAccessibleCustomer(resourceName: string): NormalizedCustomer {
  const id = extractIdFromResourceName(resourceName);
  return {
    id: `gads-customer:${id}`,
    provider: "google-ads",
    resourceName,
    descriptiveName: "",
    status: "",
    manager: false,
    level: "",
    currencyCode: "",
    timeZone: "",
    raw: { resource_name: resourceName },
  };
}

export function normalizeUserList(row: GoogleAdsUserListRow): NormalizedUserList {
  const list = row.user_list;
  const obj = list as unknown as Record<string, unknown>;
  return {
    id: `gads-userlist:${list.id}`,
    provider: "google-ads",
    name: prop(obj, "name"),
    description: prop(obj, "description"),
    membershipStatus: prop(obj, "membership_status"),
    sizeForDisplay: propNum(obj, "size_for_display"),
    sizeForSearch: propNum(obj, "size_for_search"),
    type: prop(obj, "type"),
    raw: row,
  };
}

export function normalizeConversionAction(row: GoogleAdsConversionActionRow): NormalizedConversionAction {
  const action = row.conversion_action;
  const obj = action as unknown as Record<string, unknown>;
  return {
    id: `gads-conversion:${action.id}`,
    provider: "google-ads",
    name: prop(obj, "name"),
    status: prop(obj, "status"),
    type: prop(obj, "type"),
    category: prop(obj, "category"),
    primaryForGoal: obj.primary_for_goal === true,
    raw: row,
  };
}

// ---------------------------------------------------------------------------
// Parse functions — extract typed rows from a GAQL search response
// ---------------------------------------------------------------------------

export function parseCampaignsResponse(response: unknown): { campaigns: GoogleAdsCampaignRow[]; nextPageToken: string | null } {
  const searchResponse = parseSearchResponse(response);
  return {
    campaigns: searchResponse.results.filter(isRecord).filter((r) => isRecord(r.campaign)) as GoogleAdsCampaignRow[],
    nextPageToken: searchResponse.nextPageToken,
  };
}

export function parseAdGroupsResponse(response: unknown): { adGroups: GoogleAdsAdGroupRow[]; nextPageToken: string | null } {
  const searchResponse = parseSearchResponse(response);
  return {
    adGroups: searchResponse.results.filter(isRecord).filter((r) => isRecord((r as Record<string, unknown>).ad_group)) as GoogleAdsAdGroupRow[],
    nextPageToken: searchResponse.nextPageToken,
  };
}

export function parseAdsResponse(response: unknown): { ads: GoogleAdsAdRow[]; nextPageToken: string | null } {
  const searchResponse = parseSearchResponse(response);
  return {
    ads: searchResponse.results.filter(isRecord).filter((r) => isRecord((r as Record<string, unknown>).ad)) as GoogleAdsAdRow[],
    nextPageToken: searchResponse.nextPageToken,
  };
}

export function parseKeywordsResponse(response: unknown): { keywords: GoogleAdsKeywordRow[]; nextPageToken: string | null } {
  const searchResponse = parseSearchResponse(response);
  return {
    keywords: searchResponse.results.filter(isRecord).filter((r) => isRecord((r as Record<string, unknown>).ad_group_criterion)) as GoogleAdsKeywordRow[],
    nextPageToken: searchResponse.nextPageToken,
  };
}

export function parseBudgetsResponse(response: unknown): { budgets: GoogleAdsBudgetRow[]; nextPageToken: string | null } {
  const searchResponse = parseSearchResponse(response);
  return {
    budgets: searchResponse.results.filter(isRecord).filter((r) => isRecord((r as Record<string, unknown>).campaign_budget)) as GoogleAdsBudgetRow[],
    nextPageToken: searchResponse.nextPageToken,
  };
}

export function parseCustomerClientsResponse(response: unknown): { customers: GoogleAdsCustomerClientRow[]; nextPageToken: string | null } {
  const searchResponse = parseSearchResponse(response);
  return {
    customers: searchResponse.results.filter(isRecord).filter((r) => isRecord((r as Record<string, unknown>).customer_client)) as GoogleAdsCustomerClientRow[],
    nextPageToken: searchResponse.nextPageToken,
  };
}

export function parseUserListsResponse(response: unknown): { userLists: GoogleAdsUserListRow[]; nextPageToken: string | null } {
  const searchResponse = parseSearchResponse(response);
  return {
    userLists: searchResponse.results.filter(isRecord).filter((r) => isRecord((r as Record<string, unknown>).user_list)) as GoogleAdsUserListRow[],
    nextPageToken: searchResponse.nextPageToken,
  };
}

export function parseConversionActionsResponse(response: unknown): { conversionActions: GoogleAdsConversionActionRow[]; nextPageToken: string | null } {
  const searchResponse = parseSearchResponse(response);
  return {
    conversionActions: searchResponse.results.filter(isRecord).filter((r) => isRecord((r as Record<string, unknown>).conversion_action)) as GoogleAdsConversionActionRow[],
    nextPageToken: searchResponse.nextPageToken,
  };
}

export function parseAccessibleCustomersResponse(response: unknown): string[] {
  if (!isRecord(response)) return [];
  const names = response.resourceNames ?? response.resource_names;
  if (!Array.isArray(names)) return [];
  return names.filter((n): n is string => typeof n === "string" && n.length > 0);
}

export function parseMutateResponse(response: unknown): { resourceNames: string[]; partialFailureError: unknown | null } {
  if (!isRecord(response)) return { resourceNames: [], partialFailureError: null };
  const results = Array.isArray(response.results) ? response.results : [];
  const resourceNames: string[] = [];
  for (const item of results) {
    if (!isRecord(item)) continue;
    const name = firstString(item.resourceName, item.resource_name);
    if (name) resourceNames.push(name);
  }
  return {
    resourceNames,
    partialFailureError: response.partialFailureError ?? response.partial_failure_error ?? null,
  };
}

export function parseSearchResponse(response: unknown): { results: Record<string, unknown>[]; nextPageToken: string | null } {
  if (!isRecord(response)) return { results: [], nextPageToken: null };
  const results = response.results;
  if (!Array.isArray(results)) return { results: [], nextPageToken: null };
  const nextPageToken = typeof response.nextPageToken === "string" && response.nextPageToken.length > 0
    ? response.nextPageToken
    : null;
  return {
    results: results.filter(isRecord) as Record<string, unknown>[],
    nextPageToken,
  };
}

/** Aggregate searchStream batches (array of SearchGoogleAdsStreamResponse) into one result set. */
export function aggregateSearchStreamBatches(body: unknown): { results: Record<string, unknown>[]; fieldMask: string | null } {
  const batches = Array.isArray(body) ? body : [body];
  const results: Record<string, unknown>[] = [];
  let fieldMask: string | null = null;
  for (const batch of batches) {
    if (!isRecord(batch)) continue;
    if (typeof batch.fieldMask === "string" && batch.fieldMask.length > 0) fieldMask = batch.fieldMask;
    const rows = batch.results;
    if (Array.isArray(rows)) {
      for (const row of rows) {
        if (isRecord(row)) results.push(row);
      }
    }
  }
  return { results, fieldMask };
}
