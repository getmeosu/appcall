import { parseCampaignsResponse, normalizeCampaign, type NormalizedCampaign } from "./objects";
import { parseAdSetsResponse, normalizeAdSet, type NormalizedAdSet } from "./objects";
import { parseAdsResponse, normalizeAd, type NormalizedAd } from "./objects";
import { parseAdAccountsResponse, normalizeAdAccount, type NormalizedAdAccount } from "./objects";

// ---------------------------------------------------------------------------
// Campaigns sync
// ---------------------------------------------------------------------------

export type CampaignsListSyncInput = { response: unknown };
export type CampaignsListSyncResult = {
  provider: "meta-ads";
  operation: "campaigns.list";
  items: NormalizedCampaign[];
  nextCursor: string | null;
};

export function executeCampaignsListSync(input: CampaignsListSyncInput): CampaignsListSyncResult {
  const response = requireRecord(input.response, "response");
  const parsed = parseCampaignsResponse(response);
  return {
    provider: "meta-ads",
    operation: "campaigns.list",
    items: parsed.campaigns.map((c) => normalizeCampaign(c)),
    nextCursor: parsed.nextCursor,
  };
}

// ---------------------------------------------------------------------------
// Ad Sets sync
// ---------------------------------------------------------------------------

export type AdSetsListSyncInput = { response: unknown };
export type AdSetsListSyncResult = {
  provider: "meta-ads";
  operation: "ad_sets.list";
  items: NormalizedAdSet[];
  nextCursor: string | null;
};

export function executeAdSetsListSync(input: AdSetsListSyncInput): AdSetsListSyncResult {
  const response = requireRecord(input.response, "response");
  const parsed = parseAdSetsResponse(response);
  return {
    provider: "meta-ads",
    operation: "ad_sets.list",
    items: parsed.adSets.map((a) => normalizeAdSet(a)),
    nextCursor: parsed.nextCursor,
  };
}

// ---------------------------------------------------------------------------
// Ads sync
// ---------------------------------------------------------------------------

export type AdsListSyncInput = { response: unknown };
export type AdsListSyncResult = {
  provider: "meta-ads";
  operation: "ads.list";
  items: NormalizedAd[];
  nextCursor: string | null;
};

export function executeAdsListSync(input: AdsListSyncInput): AdsListSyncResult {
  const response = requireRecord(input.response, "response");
  const parsed = parseAdsResponse(response);
  return {
    provider: "meta-ads",
    operation: "ads.list",
    items: parsed.ads.map((a) => normalizeAd(a)),
    nextCursor: parsed.nextCursor,
  };
}

// ---------------------------------------------------------------------------
// Ad Accounts sync
// ---------------------------------------------------------------------------

export type AdAccountsListSyncInput = { response: unknown };
export type AdAccountsListSyncResult = {
  provider: "meta-ads";
  operation: "ad_accounts.list";
  items: NormalizedAdAccount[];
  nextCursor: string | null;
};

export function executeAdAccountsListSync(input: AdAccountsListSyncInput): AdAccountsListSyncResult {
  const response = requireRecord(input.response, "response");
  const parsed = parseAdAccountsResponse(response);
  return {
    provider: "meta-ads",
    operation: "ad_accounts.list",
    items: parsed.adAccounts.map((a) => normalizeAdAccount(a)),
    nextCursor: parsed.nextCursor,
  };
}

// ---------------------------------------------------------------------------
// Shared helper
// ---------------------------------------------------------------------------

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  return value as Record<string, unknown>;
}
