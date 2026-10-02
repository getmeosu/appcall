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

// --- Advertisers ---

export type NormalizedAdvertiser = {
  id: string;
  provider: "tiktok-ads";
  name: string;
  status: string;
  currency: string;
  timezone: string;
  company: string;
  raw: Record<string, unknown>;
};

export function normalizeAdvertiser(data: Record<string, unknown>): NormalizedAdvertiser {
  const id = coerceId(data.advertiser_id ?? data.id);
  const name = prop(data, "advertiser_name") || prop(data, "name");
  return {
    id: `tt-advertiser:${id}`,
    provider: "tiktok-ads",
    name,
    status: prop(data, "status"),
    currency: prop(data, "currency"),
    timezone: prop(data, "timezone") || prop(data, "display_timezone"),
    company: prop(data, "company"),
    raw: data,
  };
}

export function parseAdvertisersResponse(response: unknown): {
  advertisers: NormalizedAdvertiser[];
  nextPage: number | null;
  totalCount: number;
} {
  const wrapper = extractTikTokData(response);
  if (!wrapper) return { advertisers: [], nextPage: null, totalCount: 0 };

  const list = wrapper.list;
  if (!Array.isArray(list)) return { advertisers: [], nextPage: null, totalCount: 0 };

  const advertisers = list.filter(isRecord).map(normalizeAdvertiser);
  const paging = extractPaging(wrapper);
  return {
    advertisers,
    nextPage: paging.nextPage,
    totalCount: paging.totalCount || advertisers.length,
  };
}

// --- Pixels ---

export type NormalizedPixel = {
  id: string;
  provider: "tiktok-ads";
  name: string;
  code: string;
  status: string;
  createdTime: string;
  raw: Record<string, unknown>;
};

export function normalizePixel(data: Record<string, unknown>): NormalizedPixel {
  const id = coerceId(data.pixel_id ?? data.id);
  return {
    id: `tt-pixel:${id}`,
    provider: "tiktok-ads",
    name: prop(data, "pixel_name") || prop(data, "name"),
    code: prop(data, "pixel_code") || prop(data, "code"),
    status: prop(data, "status") || prop(data, "operation_status"),
    createdTime: prop(data, "create_time"),
    raw: data,
  };
}

export function parsePixelsResponse(response: unknown): {
  pixels: NormalizedPixel[];
  nextPage: number | null;
  totalCount: number;
} {
  const wrapper = extractTikTokData(response);
  if (!wrapper) return { pixels: [], nextPage: null, totalCount: 0 };

  // pixel/list may return `list` or `pixels`
  const list = Array.isArray(wrapper.list)
    ? wrapper.list
    : Array.isArray((wrapper as Record<string, unknown>).pixels)
      ? ((wrapper as Record<string, unknown>).pixels as unknown[])
      : null;
  if (!list) return { pixels: [], nextPage: null, totalCount: 0 };

  const pixels = list.filter(isRecord).map(normalizePixel);
  const paging = extractPaging(wrapper);
  return {
    pixels,
    nextPage: paging.nextPage,
    totalCount: paging.totalCount || pixels.length,
  };
}

// --- Analytics / integrated report ---

export type NormalizedAnalyticsRow = {
  id: string;
  provider: "tiktok-ads";
  dimensions: Record<string, unknown>;
  metrics: Record<string, unknown>;
  impressions: number;
  clicks: number;
  spend: number;
  raw: Record<string, unknown>;
};

export function normalizeAnalyticsRow(data: Record<string, unknown>, index: number = 0): NormalizedAnalyticsRow {
  const dimensions = isRecord(data.dimensions) ? data.dimensions : {};
  const metrics = isRecord(data.metrics) ? data.metrics : {};

  const dimKey =
    coerceId(dimensions.campaign_id) ||
    coerceId(dimensions.adgroup_id) ||
    coerceId(dimensions.ad_id) ||
    coerceId(dimensions.advertiser_id) ||
    coerceId(dimensions.stat_time_day) ||
    String(index);

  return {
    id: `tt-analytics:${dimKey}`,
    provider: "tiktok-ads",
    dimensions,
    metrics,
    impressions: propNum(metrics, "impressions") || propNum(data, "impressions"),
    clicks: propNum(metrics, "clicks") || propNum(data, "clicks"),
    spend: propNum(metrics, "spend") || propNum(data, "spend"),
    raw: data,
  };
}

export function parseAnalyticsResponse(response: unknown): { rows: NormalizedAnalyticsRow[] } {
  const wrapper = extractTikTokData(response);
  if (!wrapper) return { rows: [] };

  const list = wrapper.list;
  if (!Array.isArray(list)) return { rows: [] };

  return {
    rows: list.filter(isRecord).map((row, i) => normalizeAnalyticsRow(row, i)),
  };
}

// ---------------------------------------------------------------------------
// TikTok API response shape: { code: 0, message: "OK", data: { list: [...], page_info: { ... } } }
// ---------------------------------------------------------------------------

type TikTokDataWrapper = {
  list?: unknown[];
  pixels?: unknown[];
  page_info?: Record<string, unknown>;
  [key: string]: unknown;
};

export function extractTikTokData(response: unknown): TikTokDataWrapper | null {
  if (!isRecord(response)) return null;

  // Direct response could be the wrapper
  if (typeof response.code === "number" && response.code === 0 && isRecord(response.data)) {
    return response.data as TikTokDataWrapper;
  }

  // Or the caller already unwrapped `data`
  if (Array.isArray(response.list) || Array.isArray(response.pixels)) {
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
  if (typeof val === "string") return val;
  if (typeof val === "number" && Number.isFinite(val)) return String(val);
  return fallback;
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

function coerceId(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}
