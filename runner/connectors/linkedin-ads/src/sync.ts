import { parseCampaignsResponse } from "./objects";
import type { NormalizedCampaign } from "./objects";
import { parseAdAccountsResponse } from "./objects";
import type { NormalizedAdAccount } from "./objects";
import { parseCreativeAssetsResponse } from "./objects";
import type { NormalizedCreativeAsset } from "./objects";
import { parseCampaignGroupsResponse } from "./objects";
import type { NormalizedCampaignGroup } from "./objects";
import { parseCreativesResponse } from "./objects";
import type { NormalizedCreative } from "./objects";

export type CampaignsListSyncInput = { response: unknown };
export type CampaignsListSyncResult = { provider: "linkedin-ads"; operation: "campaigns.list"; items: NormalizedCampaign[]; nextStart: number | null };

export function executeCampaignsListSync(input: CampaignsListSyncInput): CampaignsListSyncResult {
  const parsed = parseCampaignsResponse(input.response);
  return { provider: "linkedin-ads", operation: "campaigns.list", items: parsed.campaigns, nextStart: parsed.nextStart };
}

export type AdAccountsListSyncInput = { response: unknown };
export type AdAccountsListSyncResult = { provider: "linkedin-ads"; operation: "ad_accounts.list"; items: NormalizedAdAccount[]; nextStart: number | null };

export function executeAdAccountsListSync(input: AdAccountsListSyncInput): AdAccountsListSyncResult {
  const parsed = parseAdAccountsResponse(input.response);
  return { provider: "linkedin-ads", operation: "ad_accounts.list", items: parsed.adAccounts, nextStart: parsed.nextStart };
}

export type CreativeAssetsListSyncInput = { response: unknown };
export type CreativeAssetsListSyncResult = { provider: "linkedin-ads"; operation: "creative_assets.list"; items: NormalizedCreativeAsset[]; nextStart: number | null };

export function executeCreativeAssetsListSync(input: CreativeAssetsListSyncInput): CreativeAssetsListSyncResult {
  const parsed = parseCreativeAssetsResponse(input.response);
  return { provider: "linkedin-ads", operation: "creative_assets.list", items: parsed.creativeAssets, nextStart: parsed.nextStart };
}

export type CampaignGroupsListSyncInput = { response: unknown };
export type CampaignGroupsListSyncResult = { provider: "linkedin-ads"; operation: "campaign_groups.list"; items: NormalizedCampaignGroup[]; nextStart: number | null };

export function executeCampaignGroupsListSync(input: CampaignGroupsListSyncInput): CampaignGroupsListSyncResult {
  const parsed = parseCampaignGroupsResponse(input.response);
  return { provider: "linkedin-ads", operation: "campaign_groups.list", items: parsed.campaignGroups, nextStart: parsed.nextStart };
}

export type CreativesListSyncInput = { response: unknown };
export type CreativesListSyncResult = { provider: "linkedin-ads"; operation: "creatives.list"; items: NormalizedCreative[]; nextStart: number | null };

export function executeCreativesListSync(input: CreativesListSyncInput): CreativesListSyncResult {
  const parsed = parseCreativesResponse(input.response);
  return { provider: "linkedin-ads", operation: "creatives.list", items: parsed.creatives, nextStart: parsed.nextStart };
}
