import {
  type GoogleAdsCampaignRow,
  type GoogleAdsAdGroupRow,
  type GoogleAdsAdRow,
  type GoogleAdsSearchResponse,
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

/**
 * Convert Google Ads micro-amounts (1/1,000,000 of a dollar) to dollars.
 */
function microsToDollars(micros: number): number {
  return micros / 1_000_000;
}

/**
 * Convert Google Ads micro-amounts to dollars as a string with 2 decimal places.
 */
function microsToDollarString(micros: number): string {
  return (micros / 1_000_000).toFixed(2);
}

/**
 * Extract campaign ID from a Google Ads resource name like
 * `customers/123/campaigns/456`.
 */
function extractIdFromResourceName(resourceName: string): string {
  const parts = resourceName.split("/");
  return parts[parts.length - 1] ?? resourceName;
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

function parseSearchResponse(response: unknown): { results: Record<string, unknown>[]; nextPageToken: string | null } {
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
