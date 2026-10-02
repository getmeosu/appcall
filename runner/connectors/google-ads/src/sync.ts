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
  parseKeywordsResponse,
  normalizeKeyword,
  type NormalizedKeyword,
  parseBudgetsResponse,
  normalizeBudget,
  type NormalizedBudget,
  parseUserListsResponse,
  normalizeUserList,
  type NormalizedUserList,
  parseConversionActionsResponse,
  normalizeConversionAction,
  type NormalizedConversionAction,
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
// keywords.list sync
// ---------------------------------------------------------------------------

export type KeywordsListSyncInput = { response: unknown };
export type KeywordsListSyncResult = {
  provider: "google-ads";
  operation: "keywords.list";
  items: NormalizedKeyword[];
  nextPageToken: string | null;
};

export function executeKeywordsListSync(input: KeywordsListSyncInput): KeywordsListSyncResult {
  const response = requireRecord(input.response, "response");
  const parsed = parseKeywordsResponse(response);
  return {
    provider: "google-ads",
    operation: "keywords.list",
    items: parsed.keywords.map((k) => normalizeKeyword(k)),
    nextPageToken: parsed.nextPageToken,
  };
}

// ---------------------------------------------------------------------------
// budgets.list sync
// ---------------------------------------------------------------------------

export type BudgetsListSyncInput = { response: unknown };
export type BudgetsListSyncResult = {
  provider: "google-ads";
  operation: "budgets.list";
  items: NormalizedBudget[];
  nextPageToken: string | null;
};

export function executeBudgetsListSync(input: BudgetsListSyncInput): BudgetsListSyncResult {
  const response = requireRecord(input.response, "response");
  const parsed = parseBudgetsResponse(response);
  return {
    provider: "google-ads",
    operation: "budgets.list",
    items: parsed.budgets.map((b) => normalizeBudget(b)),
    nextPageToken: parsed.nextPageToken,
  };
}

// ---------------------------------------------------------------------------
// customer_lists.list sync
// ---------------------------------------------------------------------------

export type CustomerListsListSyncInput = { response: unknown };
export type CustomerListsListSyncResult = {
  provider: "google-ads";
  operation: "customer_lists.list";
  items: NormalizedUserList[];
  nextPageToken: string | null;
};

export function executeCustomerListsListSync(input: CustomerListsListSyncInput): CustomerListsListSyncResult {
  const response = requireRecord(input.response, "response");
  const parsed = parseUserListsResponse(response);
  return {
    provider: "google-ads",
    operation: "customer_lists.list",
    items: parsed.userLists.map((u) => normalizeUserList(u)),
    nextPageToken: parsed.nextPageToken,
  };
}

// ---------------------------------------------------------------------------
// conversion_actions.list sync
// ---------------------------------------------------------------------------

export type ConversionActionsListSyncInput = { response: unknown };
export type ConversionActionsListSyncResult = {
  provider: "google-ads";
  operation: "conversion_actions.list";
  items: NormalizedConversionAction[];
  nextPageToken: string | null;
};

export function executeConversionActionsListSync(input: ConversionActionsListSyncInput): ConversionActionsListSyncResult {
  const response = requireRecord(input.response, "response");
  const parsed = parseConversionActionsResponse(response);
  return {
    provider: "google-ads",
    operation: "conversion_actions.list",
    items: parsed.conversionActions.map((c) => normalizeConversionAction(c)),
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
