// ---------------------------------------------------------------------------
// TikTok Ads normalized types and parse functions
// ---------------------------------------------------------------------------

// --- Campaigns ---

export type NormalizedCampaign = {
  id: string;
  provider: "tiktok-ads";
  name: string;
  status: string;
  objective: string;
  budget: number;
  budgetMode: string;
  optimizationGoal: string;
  startDate: string;
  endDate: string;
  createdTime: string;
  modifiedTime: string;
  raw: Record<string, unknown>;
};

export function normalizeCampaign(data: Record<string, unknown>): NormalizedCampaign {
  return {
    id: `tt-campaign:${prop(data, "campaign_id")}`,
    provider: "tiktok-ads",
    name: prop(data, "campaign_name"),
    status: prop(data, "status"),
    objective: prop(data, "objective_type"),
    budget: propNum(data, "budget"),
    budgetMode: prop(data, "budget_mode"),
    optimizationGoal: prop(data, "optimization_goal"),
    startDate: prop(data, "start_time"),
    endDate: prop(data, "end_time"),
    createdTime: prop(data, "create_time"),
    modifiedTime: prop(data, "modify_time"),
    raw: data,
  };
}

export function parseCampaignsResponse(response: unknown): {
  campaigns: NormalizedCampaign[];
  nextPage: number | null;
  totalCount: number;
} {
  const wrapper = extractTikTokData(response);
  if (!wrapper) return { campaigns: [], nextPage: null, totalCount: 0 };

  const list = wrapper.list;
  if (!Array.isArray(list)) return { campaigns: [], nextPage: null, totalCount: 0 };

  const campaigns = list.filter(isRecord).map(normalizeCampaign);
  const paging = extractPaging(wrapper);
  return { campaigns, ...paging };
}

// --- Ad Groups ---

export type NormalizedAdGroup = {
  id: string;
  provider: "tiktok-ads";
  campaignId: string;
  name: string;
  status: string;
  placement: string;
  budget: number;
  bidType: string;
  createdTime: string;
  raw: Record<string, unknown>;
};

export function normalizeAdGroup(data: Record<string, unknown>): NormalizedAdGroup {
  return {
    id: `tt-adgroup:${prop(data, "adgroup_id")}`,
    provider: "tiktok-ads",
    campaignId: prop(data, "campaign_id"),
    name: prop(data, "adgroup_name"),
    status: prop(data, "status"),
    placement: prop(data, "placement"),
    budget: propNum(data, "budget"),
    bidType: prop(data, "bid_type"),
    createdTime: prop(data, "create_time"),
    raw: data,
  };
}

export function parseAdGroupsResponse(response: unknown): {
  adGroups: NormalizedAdGroup[];
  nextPage: number | null;
  totalCount: number;
} {
  const wrapper = extractTikTokData(response);
  if (!wrapper) return { adGroups: [], nextPage: null, totalCount: 0 };

  const list = wrapper.list;
  if (!Array.isArray(list)) return { adGroups: [], nextPage: null, totalCount: 0 };

  const adGroups = list.filter(isRecord).map(normalizeAdGroup);
  const paging = extractPaging(wrapper);
  return { adGroups, ...paging };
}

// --- Ads ---

export type NormalizedAd = {
  id: string;
  provider: "tiktok-ads";
  adGroupId: string;
  name: string;
  status: string;
  adFormat: string;
  creativeType: string;
  createdTime: string;
  raw: Record<string, unknown>;
};

export function normalizeAd(data: Record<string, unknown>): NormalizedAd {
  return {
    id: `tt-ad:${prop(data, "ad_id")}`,
    provider: "tiktok-ads",
    adGroupId: prop(data, "adgroup_id"),
    name: prop(data, "ad_name"),
    status: prop(data, "status"),
    adFormat: prop(data, "ad_format"),
    creativeType: prop(data, "creative_type"),
    createdTime: prop(data, "create_time"),
    raw: data,
  };
}

export function parseAdsResponse(response: unknown): {
  ads: NormalizedAd[];
  nextPage: number | null;
  totalCount: number;
} {
  const wrapper = extractTikTokData(response);
  if (!wrapper) return { ads: [], nextPage: null, totalCount: 0 };

  const list = wrapper.list;
  if (!Array.isArray(list)) return { ads: [], nextPage: null, totalCount: 0 };

  const ads = list.filter(isRecord).map(normalizeAd);
  const paging = extractPaging(wrapper);
  return { ads, ...paging };
}

// ---------------------------------------------------------------------------
// TikTok API response shape: { code: 0, message: "OK", data: { list: [...], page_info: { ... } } }
// ---------------------------------------------------------------------------

type TikTokDataWrapper = {
  list: unknown[];
  page_info?: Record<string, unknown>;
};

function extractTikTokData(response: unknown): TikTokDataWrapper | null {
  if (!isRecord(response)) return null;

  // Direct response could be the wrapper
  if (typeof response.code === "number" && response.code === 0 && isRecord(response.data)) {
    return response.data as TikTokDataWrapper;
  }

  // Or the caller already unwrapped `data`
  if (Array.isArray(response.list)) {
    return response as TikTokDataWrapper;
  }

  return null;
}

function extractPaging(wrapper: TikTokDataWrapper): { nextPage: number | null; totalCount: number } {
  const pageInfo = wrapper.page_info;
  if (!isRecord(pageInfo)) return { nextPage: null, totalCount: 0 };

  const totalPages = propNum(pageInfo, "total_page");
  const currentPage = propNum(pageInfo, "page");
  const totalCount = propNum(pageInfo, "total_number");

  const nextPage = currentPage < totalPages ? currentPage + 1 : null;
  return { nextPage, totalCount };
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

export function prop(obj: Record<string, unknown>, field: string, fallback: string = ""): string {
  const val = obj[field];
  return typeof val === "string" ? val : fallback;
}

export function propNum(obj: Record<string, unknown>, field: string, fallback: number = 0): number {
  const val = obj[field];
  if (typeof val === "number") return Number.isFinite(val) ? val : fallback;
  if (typeof val === "string") {
    const n = Number(val);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
