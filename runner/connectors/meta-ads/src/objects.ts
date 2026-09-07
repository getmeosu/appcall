import type {
  MetaCampaignObject,
  MetaAdSetObject,
  MetaAdObject,
  MetaAdAccountObject,
  MetaListResponse,
} from "./http";
import { prop } from "./http";

// ---------------------------------------------------------------------------
// Normalized types
// ---------------------------------------------------------------------------

export type NormalizedCampaign = {
  id: string;
  provider: "meta-ads";
  name: string;
  status: string;
  objective: string;
  dailyBudget: number;
  lifetimeBudget: number;
  startTime: string;
  stopTime: string;
  createdTime: string;
  updatedTime: string;
  effectiveStatus: string;
  raw: MetaCampaignObject;
};

export type NormalizedAdSet = {
  id: string;
  provider: "meta-ads";
  campaignId: string;
  name: string;
  status: string;
  dailyBudget: number;
  startTime: string;
  endTime: string;
  targeting: Record<string, unknown>;
  optimizationGoal: string;
  raw: MetaAdSetObject;
};

export type NormalizedAdCreative = {
  name: string;
  type: string;
};

export type NormalizedAd = {
  id: string;
  provider: "meta-ads";
  adSetId: string;
  name: string;
  status: string;
  creative: NormalizedAdCreative;
  effectiveStatus: string;
  createdAt: string;
  updatedAt: string;
  raw: MetaAdObject;
};

export type NormalizedAdAccount = {
  id: string;
  provider: "meta-ads";
  name: string;
  accountStatus: string;
  currency: string;
  timezone: string;
  businessName: string;
  raw: MetaAdAccountObject;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseMetaBudget(value: string | null | undefined): number {
  if (value == null) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// ---------------------------------------------------------------------------
// Campaign
// ---------------------------------------------------------------------------

export function normalizeCampaign(c: MetaCampaignObject): NormalizedCampaign {
  const obj = c as unknown as Record<string, unknown>;
  return {
    id: `meta-ads:campaign:${c.id}`,
    provider: "meta-ads",
    name: prop(obj, "name"),
    status: prop(obj, "status"),
    objective: prop(obj, "objective"),
    dailyBudget: parseMetaBudget(c.daily_budget),
    lifetimeBudget: parseMetaBudget(c.lifetime_budget),
    startTime: prop(obj, "start_time"),
    stopTime: prop(obj, "stop_time"),
    createdTime: prop(obj, "created_time"),
    updatedTime: prop(obj, "updated_time"),
    effectiveStatus: prop(obj, "effective_status"),
    raw: c,
  };
}

export function parseCampaignsResponse(
  response: unknown,
): { campaigns: MetaCampaignObject[]; nextCursor: string | null } {
  if (!isRecord(response)) return { campaigns: [], nextCursor: null };
  const data = response.data;
  if (!Array.isArray(data)) return { campaigns: [], nextCursor: null };

  const paging = response.paging;
  const cursors = isRecord(paging) ? paging.cursors : undefined;
  const after = isRecord(cursors) ? cursors.after : undefined;
  const nextCursor = typeof after === "string" && after.length > 0 ? after : null;

  return {
    campaigns: data.filter(isRecord) as MetaCampaignObject[],
    nextCursor,
  };
}

// ---------------------------------------------------------------------------
// Ad Set
// ---------------------------------------------------------------------------

export function normalizeAdSet(a: MetaAdSetObject): NormalizedAdSet {
  const obj = a as unknown as Record<string, unknown>;
  const targeting = isRecord(obj.targeting) ? obj.targeting : {};
  return {
    id: `meta-ads:adset:${a.id}`,
    provider: "meta-ads",
    campaignId: prop(obj, "campaign_id"),
    name: prop(obj, "name"),
    status: prop(obj, "status"),
    dailyBudget: parseMetaBudget(a.daily_budget),
    startTime: prop(obj, "start_time"),
    endTime: prop(obj, "end_time"),
    targeting,
    optimizationGoal: prop(obj, "optimization_goal"),
    raw: a,
  };
}

export function parseAdSetsResponse(
  response: unknown,
): { adSets: MetaAdSetObject[]; nextCursor: string | null } {
  if (!isRecord(response)) return { adSets: [], nextCursor: null };
  const data = response.data;
  if (!Array.isArray(data)) return { adSets: [], nextCursor: null };

  const paging = response.paging;
  const cursors = isRecord(paging) ? paging.cursors : undefined;
  const after = isRecord(cursors) ? cursors.after : undefined;
  const nextCursor = typeof after === "string" && after.length > 0 ? after : null;

  return {
    adSets: data.filter(isRecord) as MetaAdSetObject[],
    nextCursor,
  };
}

// ---------------------------------------------------------------------------
// Ad
// ---------------------------------------------------------------------------

export function normalizeAd(a: MetaAdObject): NormalizedAd {
  const obj = a as unknown as Record<string, unknown>;
  const creative = isRecord(obj.creative) ? obj.creative : {};
  return {
    id: `meta-ads:ad:${a.id}`,
    provider: "meta-ads",
    adSetId: prop(obj, "adset_id"),
    name: prop(obj, "name"),
    status: prop(obj, "status"),
    creative: {
      name: prop(creative, "name"),
      type: prop(creative, "type"),
    },
    effectiveStatus: prop(obj, "effective_status"),
    createdAt: prop(obj, "created_time"),
    updatedAt: prop(obj, "updated_time"),
    raw: a,
  };
}

export function parseAdsResponse(
  response: unknown,
): { ads: MetaAdObject[]; nextCursor: string | null } {
  if (!isRecord(response)) return { ads: [], nextCursor: null };
  const data = response.data;
  if (!Array.isArray(data)) return { ads: [], nextCursor: null };

  const paging = response.paging;
  const cursors = isRecord(paging) ? paging.cursors : undefined;
  const after = isRecord(cursors) ? cursors.after : undefined;
  const nextCursor = typeof after === "string" && after.length > 0 ? after : null;

  return {
    ads: data.filter(isRecord) as MetaAdObject[],
    nextCursor,
  };
}

// ---------------------------------------------------------------------------
// Ad Account
// ---------------------------------------------------------------------------

const AD_ACCOUNT_STATUS_MAP: Record<number, string> = {
  1: "ACTIVE",
  2: "DISABLED",
  3: "UNSET",
  7: "PENDING_RISK_REVIEW",
  8: "PENDING_CONFIRMATION",
  9: "IN_GRACE_PERIOD",
  100: "PENDING_CLOSURE",
  101: "CLOSED",
  202: "SUSPENDED",
  403: "ADS_LIMITATION",
  402: "ADS_LIMITED_MCC",
};

export function normalizeAdAccount(a: MetaAdAccountObject): NormalizedAdAccount {
  const obj = a as unknown as Record<string, unknown>;
  const accountStatusNum = typeof a.account_status === "number" ? a.account_status : 0;
  return {
    id: `meta-ads:adaccount:${a.id}`,
    provider: "meta-ads",
    name: prop(obj, "name"),
    accountStatus: AD_ACCOUNT_STATUS_MAP[accountStatusNum] ?? "UNKNOWN",
    currency: prop(obj, "currency"),
    timezone: prop(obj, "timezone_name"),
    businessName: prop(obj, "business_name"),
    raw: a,
  };
}

export function parseAdAccountsResponse(
  response: unknown,
): { adAccounts: MetaAdAccountObject[]; nextCursor: string | null } {
  if (!isRecord(response)) return { adAccounts: [], nextCursor: null };
  const data = response.data;
  if (!Array.isArray(data)) return { adAccounts: [], nextCursor: null };

  const paging = response.paging;
  const cursors = isRecord(paging) ? paging.cursors : undefined;
  const after = isRecord(cursors) ? cursors.after : undefined;
  const nextCursor = typeof after === "string" && after.length > 0 ? after : null;

  return {
    adAccounts: data.filter(isRecord) as MetaAdAccountObject[],
    nextCursor,
  };
}
