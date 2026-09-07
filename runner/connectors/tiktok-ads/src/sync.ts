import { parseCampaignsResponse } from "./objects";
import type { NormalizedCampaign } from "./objects";
import { parseAdGroupsResponse } from "./objects";
import type { NormalizedAdGroup } from "./objects";
import { parseAdsResponse } from "./objects";
import type { NormalizedAd } from "./objects";

// ---------------------------------------------------------------------------
// campaigns.list sync
// ---------------------------------------------------------------------------

export type CampaignsListSyncInput = { response: unknown };
export type CampaignsListSyncResult = {
  provider: "tiktok-ads";
  operation: "campaigns.list";
  items: NormalizedCampaign[];
  nextPage: number | null;
  totalCount: number;
};

export function executeCampaignsListSync(input: CampaignsListSyncInput): CampaignsListSyncResult {
  const parsed = parseCampaignsResponse(input.response);
  return {
    provider: "tiktok-ads",
    operation: "campaigns.list",
    items: parsed.campaigns,
    nextPage: parsed.nextPage,
    totalCount: parsed.totalCount,
  };
}

// ---------------------------------------------------------------------------
// ad_groups.list sync
// ---------------------------------------------------------------------------

export type AdGroupsListSyncInput = { response: unknown };
export type AdGroupsListSyncResult = {
  provider: "tiktok-ads";
  operation: "ad_groups.list";
  items: NormalizedAdGroup[];
  nextPage: number | null;
  totalCount: number;
};

export function executeAdGroupsListSync(input: AdGroupsListSyncInput): AdGroupsListSyncResult {
  const parsed = parseAdGroupsResponse(input.response);
  return {
    provider: "tiktok-ads",
    operation: "ad_groups.list",
    items: parsed.adGroups,
    nextPage: parsed.nextPage,
    totalCount: parsed.totalCount,
  };
}

// ---------------------------------------------------------------------------
// ads.list sync
// ---------------------------------------------------------------------------

export type AdsListSyncInput = { response: unknown };
export type AdsListSyncResult = {
  provider: "tiktok-ads";
  operation: "ads.list";
  items: NormalizedAd[];
  nextPage: number | null;
  totalCount: number;
};

export function executeAdsListSync(input: AdsListSyncInput): AdsListSyncResult {
  const parsed = parseAdsResponse(input.response);
  return {
    provider: "tiktok-ads",
    operation: "ads.list",
    items: parsed.ads,
    nextPage: parsed.nextPage,
    totalCount: parsed.totalCount,
  };
}
