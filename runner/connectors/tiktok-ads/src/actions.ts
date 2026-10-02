import {
  createTikTokClient,
  parseTikTokRateLimit,
  isRecord,
  type TikTokClientOptions,
} from "./http";
import {
  parseCampaignsResponse,
  parseAdGroupsResponse,
  parseAdsResponse,
  parseAdvertisersResponse,
  parsePixelsResponse,
  parseAnalyticsResponse,
} from "./objects";

type ActionResult = Record<string, unknown> | Promise<Record<string, unknown>>;

function hasLiveAuth(input: unknown): input is Record<string, unknown> & { accessToken: string } {
  return isRecord(input) && typeof input.accessToken === "string" && input.accessToken.length > 0;
}

function clientOpts(
  input: Record<string, unknown>,
  operation: string,
  advertiserId?: string,
): TikTokClientOptions {
  return {
    accessToken: String(input.accessToken),
    advertiserId,
    fetch: typeof input.fetch === "function" ? (input.fetch as typeof fetch) : undefined,
    operation,
  };
}

function handleError(result: { status: number; headers: Record<string, string>; body: unknown }) {
  const rateLimit = parseTikTokRateLimit(result.status, result.headers);
  if (rateLimit.limited) {
    return {
      ok: false,
      code: "CONNECTOR_RATE_LIMITED",
      message: "TikTok Ads rate limit exceeded.",
      retryAfterSeconds: rateLimit.retryAfterSeconds,
    };
  }
  const message =
    isRecord(result.body) && typeof result.body.message === "string"
      ? result.body.message
      : "TikTok Ads rejected the request.";
  return { ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message };
}

function isTikTokOk(status: number, body: unknown): boolean {
  if (status !== 200) return false;
  if (!isRecord(body)) return false;
  return body.code === 0;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function requireStringArray(value: unknown, field: string): string[] | undefined {
  if (value == null) return undefined;
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${field} must be a non-empty string array when provided`);
  }
  if (!value.every((v) => typeof v === "string" && v.length > 0)) {
    throw new Error(`${field} must be a non-empty string array when provided`);
  }
  return value as string[];
}

function ymd(value: unknown, field: string): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  throw new Error(`${field} must be YYYY-MM-DD`);
}

// ---------------------------------------------------------------------------
// analytics.report.get — /report/integrated/get/
// ---------------------------------------------------------------------------

const REPORT_TYPES = new Set(["BASIC", "AUDIENCE", "PLAYABLE_MATERIAL", "CATALOG"]);
const DATA_LEVELS = new Set([
  "AUCTION_ADVERTISER",
  "AUCTION_CAMPAIGN",
  "AUCTION_ADGROUP",
  "AUCTION_AD",
  "RESERVATION_ADVERTISER",
  "RESERVATION_CAMPAIGN",
  "RESERVATION_ADGROUP",
  "RESERVATION_AD",
]);

export type AnalyticsReportGetInput = {
  advertiserId: string;
  reportType: string;
  dataLevel: string;
  startDate: string;
  endDate: string;
  dimensions?: string[];
  metrics?: string[];
  page?: number;
  pageSize?: number;
  queryLifetime?: boolean;
};

export function getAnalyticsReport(input: unknown): ActionResult {
  const validated = validateAnalyticsReportGetInput(input);
  if (hasLiveAuth(input)) {
    const params = new URLSearchParams();
    params.set("advertiser_id", validated.advertiserId);
    params.set("report_type", validated.reportType);
    params.set("data_level", validated.dataLevel);
    params.set("start_date", validated.startDate);
    params.set("end_date", validated.endDate);
    if (validated.dimensions?.length) {
      params.set("dimensions", JSON.stringify(validated.dimensions));
    }
    if (validated.metrics?.length) {
      params.set("metrics", JSON.stringify(validated.metrics));
    }
    if (validated.page != null) params.set("page", String(validated.page));
    if (validated.pageSize != null) params.set("page_size", String(validated.pageSize));
    if (validated.queryLifetime != null) params.set("query_lifetime", String(validated.queryLifetime));

    return createTikTokClient(clientOpts(input, "analytics.report.get", validated.advertiserId))
      .fetchJSON(`/report/integrated/get/?${params.toString()}`, { method: "GET" })
      .then((result) => {
        if (isTikTokOk(result.status, result.body)) {
          const parsed = parseAnalyticsResponse(result.body);
          return {
            connector: "tiktok-ads",
            action: "analytics.report.get",
            source: "connector",
            reportType: validated.reportType,
            dataLevel: validated.dataLevel,
            rows: parsed.rows,
            rowCount: parsed.rows.length,
          };
        }
        throw handleError(result);
      });
  }
  return { connector: "tiktok-ads", action: "analytics.report.get", source: "connector", validated };
}

function validateAnalyticsReportGetInput(input: unknown): AnalyticsReportGetInput {
  if (!isRecord(input)) throw new Error("analytics.report.get input must be an object");

  const advertiserId = requireString(input.advertiserId, "advertiserId");

  const reportType = requireString(input.reportType ?? "BASIC", "reportType").toUpperCase();
  if (!REPORT_TYPES.has(reportType)) {
    throw new Error(`reportType must be one of ${[...REPORT_TYPES].join(", ")}`);
  }

  const dataLevel = requireString(input.dataLevel, "dataLevel").toUpperCase();
  if (!DATA_LEVELS.has(dataLevel)) {
    throw new Error(`dataLevel must be one of ${[...DATA_LEVELS].join(", ")}`);
  }

  const startDate = ymd(input.startDate ?? input.dateRangeStart, "startDate");
  const endDate = ymd(input.endDate ?? input.dateRangeEnd ?? input.startDate ?? input.dateRangeStart, "endDate");

  let dimensions: string[] | undefined;
  if (Array.isArray(input.dimensions)) {
    if (!input.dimensions.every((d) => typeof d === "string" && d.length > 0)) {
      throw new Error("dimensions must be an array of strings");
    }
    dimensions = input.dimensions as string[];
  }

  let metrics: string[] | undefined;
  if (Array.isArray(input.metrics)) {
    if (!input.metrics.every((m) => typeof m === "string" && m.length > 0)) {
      throw new Error("metrics must be an array of strings");
    }
    metrics = input.metrics as string[];
  }

  return {
    advertiserId,
    reportType,
    dataLevel,
    startDate,
    endDate,
    dimensions,
    metrics,
    page: optionalNumber(input.page),
    pageSize: optionalNumber(input.pageSize),
    queryLifetime: typeof input.queryLifetime === "boolean" ? input.queryLifetime : undefined,
  };
}

// ---------------------------------------------------------------------------
// advertisers.list — /oauth2/advertiser/get/ (or /advertiser/info/ with ids)
// ---------------------------------------------------------------------------

export type AdvertisersListInput = {
  advertiserIds?: string[];
  appId?: string;
  appSecret?: string;
};

export function listAdvertisers(input: unknown): ActionResult {
  const validated = validateAdvertisersListInput(input);
  if (hasLiveAuth(input)) {
    const params = new URLSearchParams();
    let path: string;

    if (validated.advertiserIds?.length) {
      path = "/advertiser/info/";
      params.set("advertiser_ids", JSON.stringify(validated.advertiserIds));
    } else {
      // Authorized advertisers for this Access-Token. Official docs also list
      // app_id + secret as required query params; pass when provided.
      path = "/oauth2/advertiser/get/";
      if (validated.appId) params.set("app_id", validated.appId);
      if (validated.appSecret) params.set("secret", validated.appSecret);
    }

    const qs = params.toString();
    return createTikTokClient(clientOpts(input, "advertisers.list"))
      .fetchJSON(`${path}${qs ? `?${qs}` : ""}`, { method: "GET" })
      .then((result) => {
        if (isTikTokOk(result.status, result.body)) {
          const parsed = parseAdvertisersResponse(result.body);
          return {
            connector: "tiktok-ads",
            action: "advertisers.list",
            source: "connector",
            advertisers: parsed.advertisers,
            nextPage: parsed.nextPage,
            totalCount: parsed.totalCount,
          };
        }
        throw handleError(result);
      });
  }
  return { connector: "tiktok-ads", action: "advertisers.list", source: "connector", validated };
}

function validateAdvertisersListInput(input: unknown): AdvertisersListInput {
  if (input == null) return {};
  if (!isRecord(input)) throw new Error("advertisers.list input must be an object");
  return {
    advertiserIds: requireStringArray(input.advertiserIds, "advertiserIds"),
    appId: optionalString(input.appId),
    appSecret: optionalString(input.appSecret),
  };
}

// ---------------------------------------------------------------------------
// campaigns.get — /campaign/get/ filtered by campaign_ids
// ---------------------------------------------------------------------------

export type CampaignsGetInput = { advertiserId: string; campaignId: string };

export function getCampaign(input: unknown): ActionResult {
  const validated = validateCampaignsGetInput(input);
  if (hasLiveAuth(input)) {
    const params = new URLSearchParams();
    params.set("advertiser_id", validated.advertiserId);
    params.set("filtering", JSON.stringify({ campaign_ids: [validated.campaignId] }));

    return createTikTokClient(clientOpts(input, "campaigns.get", validated.advertiserId))
      .fetchJSON(`/campaign/get/?${params.toString()}`, { method: "GET" })
      .then((result) => {
        if (isTikTokOk(result.status, result.body)) {
          const parsed = parseCampaignsResponse(result.body);
          const campaign =
            parsed.campaigns.find((c) => c.raw.campaign_id === validated.campaignId || c.id.endsWith(`:${validated.campaignId}`)) ??
            parsed.campaigns[0] ??
            null;
          return {
            connector: "tiktok-ads",
            action: "campaigns.get",
            source: "connector",
            campaign,
          };
        }
        throw handleError(result);
      });
  }
  return { connector: "tiktok-ads", action: "campaigns.get", source: "connector", validated };
}

function validateCampaignsGetInput(input: unknown): CampaignsGetInput {
  if (!isRecord(input)) throw new Error("campaigns.get input must be an object");
  return {
    advertiserId: requireString(input.advertiserId, "advertiserId"),
    campaignId: requireString(input.campaignId ?? input.id, "campaignId"),
  };
}

// ---------------------------------------------------------------------------
// ad_groups.get — /adgroup/get/ filtered by adgroup_ids
// ---------------------------------------------------------------------------

export type AdGroupsGetInput = { advertiserId: string; adGroupId: string };

export function getAdGroup(input: unknown): ActionResult {
  const validated = validateAdGroupsGetInput(input);
  if (hasLiveAuth(input)) {
    const params = new URLSearchParams();
    params.set("advertiser_id", validated.advertiserId);
    params.set("filtering", JSON.stringify({ adgroup_ids: [validated.adGroupId] }));

    return createTikTokClient(clientOpts(input, "ad_groups.get", validated.advertiserId))
      .fetchJSON(`/adgroup/get/?${params.toString()}`, { method: "GET" })
      .then((result) => {
        if (isTikTokOk(result.status, result.body)) {
          const parsed = parseAdGroupsResponse(result.body);
          const adGroup =
            parsed.adGroups.find((g) => g.raw.adgroup_id === validated.adGroupId || g.id.endsWith(`:${validated.adGroupId}`)) ??
            parsed.adGroups[0] ??
            null;
          return {
            connector: "tiktok-ads",
            action: "ad_groups.get",
            source: "connector",
            adGroup,
          };
        }
        throw handleError(result);
      });
  }
  return { connector: "tiktok-ads", action: "ad_groups.get", source: "connector", validated };
}

function validateAdGroupsGetInput(input: unknown): AdGroupsGetInput {
  if (!isRecord(input)) throw new Error("ad_groups.get input must be an object");
  return {
    advertiserId: requireString(input.advertiserId, "advertiserId"),
    adGroupId: requireString(input.adGroupId ?? input.id, "adGroupId"),
  };
}

// ---------------------------------------------------------------------------
// ads.get — /ad/get/ filtered by ad_ids
// ---------------------------------------------------------------------------

export type AdsGetInput = { advertiserId: string; adId: string };

export function getAd(input: unknown): ActionResult {
  const validated = validateAdsGetInput(input);
  if (hasLiveAuth(input)) {
    const params = new URLSearchParams();
    params.set("advertiser_id", validated.advertiserId);
    params.set("filtering", JSON.stringify({ ad_ids: [validated.adId] }));

    return createTikTokClient(clientOpts(input, "ads.get", validated.advertiserId))
      .fetchJSON(`/ad/get/?${params.toString()}`, { method: "GET" })
      .then((result) => {
        if (isTikTokOk(result.status, result.body)) {
          const parsed = parseAdsResponse(result.body);
          const ad =
            parsed.ads.find((a) => a.raw.ad_id === validated.adId || a.id.endsWith(`:${validated.adId}`)) ??
            parsed.ads[0] ??
            null;
          return {
            connector: "tiktok-ads",
            action: "ads.get",
            source: "connector",
            ad,
          };
        }
        throw handleError(result);
      });
  }
  return { connector: "tiktok-ads", action: "ads.get", source: "connector", validated };
}

function validateAdsGetInput(input: unknown): AdsGetInput {
  if (!isRecord(input)) throw new Error("ads.get input must be an object");
  return {
    advertiserId: requireString(input.advertiserId, "advertiserId"),
    adId: requireString(input.adId ?? input.id, "adId"),
  };
}

// ---------------------------------------------------------------------------
// pixels.list — /pixel/list/
// ---------------------------------------------------------------------------

export type PixelsListInput = {
  advertiserId: string;
  page?: number;
  pageSize?: number;
  pixelId?: string;
};

export function listPixels(input: unknown): ActionResult {
  const validated = validatePixelsListInput(input);
  if (hasLiveAuth(input)) {
    const params = new URLSearchParams();
    params.set("advertiser_id", validated.advertiserId);
    if (validated.page != null) params.set("page", String(validated.page));
    if (validated.pageSize != null) params.set("page_size", String(validated.pageSize));
    if (validated.pixelId) params.set("pixel_id", validated.pixelId);

    return createTikTokClient(clientOpts(input, "pixels.list", validated.advertiserId))
      .fetchJSON(`/pixel/list/?${params.toString()}`, { method: "GET" })
      .then((result) => {
        if (isTikTokOk(result.status, result.body)) {
          const parsed = parsePixelsResponse(result.body);
          return {
            connector: "tiktok-ads",
            action: "pixels.list",
            source: "connector",
            pixels: parsed.pixels,
            nextPage: parsed.nextPage,
            totalCount: parsed.totalCount,
          };
        }
        throw handleError(result);
      });
  }
  return { connector: "tiktok-ads", action: "pixels.list", source: "connector", validated };
}

function validatePixelsListInput(input: unknown): PixelsListInput {
  if (!isRecord(input)) throw new Error("pixels.list input must be an object");
  return {
    advertiserId: requireString(input.advertiserId, "advertiserId"),
    page: optionalNumber(input.page),
    pageSize: optionalNumber(input.pageSize),
    pixelId: optionalString(input.pixelId),
  };
}

// Re-export normalizers used by fixture tests
export { normalizeCampaign, normalizeAdGroup, normalizeAd } from "./objects";
