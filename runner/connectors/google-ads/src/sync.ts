import {
  parseCampaignsResponse,
  normalizeCampaign,
  type NormalizedCampaign,
  parseAdGroupsResponse,
  normalizeAdGroup,
  type NormalizedAdGroup,
  parseAdsResponse,
  normalizeAd,
  type NormalizedAd,
} from "./objects";

// ---------------------------------------------------------------------------
// campaigns.list sync
// ---------------------------------------------------------------------------

export type CampaignsListSyncInput = { response: unknown };
export type CampaignsListSyncResult = {
  provider: "google-ads";
  operation: "campaigns.list";
  items: NormalizedCampaign[];
  nextPageToken: string | null;
};

export function executeCampaignsListSync(input: CampaignsListSyncInput): CampaignsListSyncResult {
  const response = requireRecord(input.response, "response");
  const parsed = parseCampaignsResponse(response);
  return {
    provider: "google-ads",
    operation: "campaigns.list",
    items: parsed.campaigns.map((c) => normalizeCampaign(c)),
    nextPageToken: parsed.nextPageToken,
  };
}

// ---------------------------------------------------------------------------
// ad_groups.list sync
// ---------------------------------------------------------------------------

export type AdGroupsListSyncInput = { response: unknown };
export type AdGroupsListSyncResult = {
  provider: "google-ads";
  operation: "ad_groups.list";
  items: NormalizedAdGroup[];
  nextPageToken: string | null;
};

export function executeAdGroupsListSync(input: AdGroupsListSyncInput): AdGroupsListSyncResult {
  const response = requireRecord(input.response, "response");
  const parsed = parseAdGroupsResponse(response);
  return {
    provider: "google-ads",
    operation: "ad_groups.list",
    items: parsed.adGroups.map((ag) => normalizeAdGroup(ag)),
    nextPageToken: parsed.nextPageToken,
  };
}

// ---------------------------------------------------------------------------
// ads.list sync
// ---------------------------------------------------------------------------

export type AdsListSyncInput = { response: unknown };
export type AdsListSyncResult = {
  provider: "google-ads";
  operation: "ads.list";
  items: NormalizedAd[];
  nextPageToken: string | null;
};

export function executeAdsListSync(input: AdsListSyncInput): AdsListSyncResult {
  const response = requireRecord(input.response, "response");
  const parsed = parseAdsResponse(response);
  return {
    provider: "google-ads",
    operation: "ads.list",
    items: parsed.ads.map((a) => normalizeAd(a)),
    nextPageToken: parsed.nextPageToken,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  return value as Record<string, unknown>;
}
