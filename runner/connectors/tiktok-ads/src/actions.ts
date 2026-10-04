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
  parseIdentitiesResponse,
  parseVideosResponse,
  parseImagesResponse,
  parseCustomAudiencesResponse,
  parseMutateId,
  parseMutateIds,
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

const OPERATION_STATUSES = new Set(["ENABLE", "DISABLE", "DELETE"]);

function requireStatus(value: unknown): string {
  const status = requireString(value, "operationStatus").toUpperCase();
  if (!OPERATION_STATUSES.has(status)) {
    throw new Error(`operationStatus must be one of ${[...OPERATION_STATUSES].join(", ")}`);
  }
  return status;
}

function optionalStringArray(value: unknown, field: string): string[] | undefined {
  if (value == null) return undefined;
  if (!Array.isArray(value) || !value.every((v) => typeof v === "string" && v.length > 0)) {
    throw new Error(`${field} must be an array of strings`);
  }
  return value as string[];
}

function postJSON(
  input: Record<string, unknown>,
  operation: string,
  path: string,
  advertiserId: string,
  payload: Record<string, unknown>,
) {
  return createTikTokClient(clientOpts(input, operation, advertiserId)).fetchJSON(path, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

function liveResult(
  input: unknown,
  operation: string,
  advertiserId: string,
  path: string,
  payload: Record<string, unknown>,
  map: (body: unknown) => Record<string, unknown>,
): ActionResult {
  return postJSON(input as Record<string, unknown>, operation, path, advertiserId, payload).then((result) => {
    if (isTikTokOk(result.status, result.body)) {
      return { connector: "tiktok-ads", action: operation, source: "connector", ...map(result.body) };
    }
    throw handleError(result);
  });
}

function getJSON(
  input: Record<string, unknown>,
  operation: string,
  path: string,
  advertiserId?: string,
) {
  return createTikTokClient(clientOpts(input, operation, advertiserId)).fetchJSON(path, { method: "GET" });
}

function pageParams(input: { page?: number; pageSize?: number }): URLSearchParams {
  const params = new URLSearchParams();
  if (input.page != null) params.set("page", String(input.page));
  if (input.pageSize != null) params.set("page_size", String(input.pageSize));
  return params;
}

// ---------------------------------------------------------------------------
// campaigns.create — POST /campaign/create/
// ---------------------------------------------------------------------------

export type CampaignsCreateInput = {
  advertiserId: string;
  campaignName: string;
  objectiveType: string;
  budgetMode?: string;
  budget?: number;
  operationStatus?: string;
};

export function createCampaign(input: unknown): ActionResult {
  const validated = validateCampaignsCreateInput(input);
  if (hasLiveAuth(input)) {
    const payload: Record<string, unknown> = {
      advertiser_id: validated.advertiserId,
      campaign_name: validated.campaignName,
      objective_type: validated.objectiveType,
    };
    if (validated.budgetMode) payload.budget_mode = validated.budgetMode;
    if (validated.budget != null) payload.budget = validated.budget;
    if (validated.operationStatus) payload.operation_status = validated.operationStatus;
    return liveResult(input, "campaigns.create", validated.advertiserId, "/campaign/create/", payload, (body) => ({
      campaignId: parseMutateId(body, "campaign_id"),
    }));
  }
  return { connector: "tiktok-ads", action: "campaigns.create", source: "connector", validated };
}

function validateCampaignsCreateInput(input: unknown): CampaignsCreateInput {
  if (!isRecord(input)) throw new Error("campaigns.create input must be an object");
  return {
    advertiserId: requireString(input.advertiserId, "advertiserId"),
    campaignName: requireString(input.campaignName ?? input.name, "campaignName"),
    objectiveType: requireString(input.objectiveType, "objectiveType").toUpperCase(),
    budgetMode: optionalString(input.budgetMode)?.toUpperCase(),
    budget: optionalNumber(input.budget),
    operationStatus: optionalString(input.operationStatus)?.toUpperCase(),
  };
}

// ---------------------------------------------------------------------------
// campaigns.update — POST /campaign/update/
// ---------------------------------------------------------------------------

export type CampaignsUpdateInput = {
  advertiserId: string;
  campaignId: string;
  campaignName?: string;
  budget?: number;
  budgetMode?: string;
};

export function updateCampaign(input: unknown): ActionResult {
  const validated = validateCampaignsUpdateInput(input);
  if (hasLiveAuth(input)) {
    const payload: Record<string, unknown> = {
      advertiser_id: validated.advertiserId,
      campaign_id: validated.campaignId,
    };
    if (validated.campaignName) payload.campaign_name = validated.campaignName;
    if (validated.budget != null) payload.budget = validated.budget;
    if (validated.budgetMode) payload.budget_mode = validated.budgetMode;
    return liveResult(input, "campaigns.update", validated.advertiserId, "/campaign/update/", payload, (body) => ({
      campaignId: parseMutateId(body, "campaign_id") || validated.campaignId,
    }));
  }
  return { connector: "tiktok-ads", action: "campaigns.update", source: "connector", validated };
}

function validateCampaignsUpdateInput(input: unknown): CampaignsUpdateInput {
  if (!isRecord(input)) throw new Error("campaigns.update input must be an object");
  return {
    advertiserId: requireString(input.advertiserId, "advertiserId"),
    campaignId: requireString(input.campaignId ?? input.id, "campaignId"),
    campaignName: optionalString(input.campaignName ?? input.name),
    budget: optionalNumber(input.budget),
    budgetMode: optionalString(input.budgetMode)?.toUpperCase(),
  };
}

// ---------------------------------------------------------------------------
// campaigns.status.update — POST /campaign/status/update/
// ---------------------------------------------------------------------------

export type CampaignsStatusUpdateInput = {
  advertiserId: string;
  campaignId: string;
  operationStatus: string;
};

export function updateCampaignStatus(input: unknown): ActionResult {
  const validated = validateCampaignsStatusUpdateInput(input);
  if (hasLiveAuth(input)) {
    const payload = {
      advertiser_id: validated.advertiserId,
      campaign_ids: [validated.campaignId],
      operation_status: validated.operationStatus,
    };
    return liveResult(
      input,
      "campaigns.status.update",
      validated.advertiserId,
      "/campaign/status/update/",
      payload,
      (body) => ({
        campaignIds: parseMutateIds(body, "campaign_ids"),
        status: isRecord(extractData(body)) && typeof extractData(body)?.status === "string"
          ? String(extractData(body)?.status)
          : validated.operationStatus,
      }),
    );
  }
  return { connector: "tiktok-ads", action: "campaigns.status.update", source: "connector", validated };
}

function validateCampaignsStatusUpdateInput(input: unknown): CampaignsStatusUpdateInput {
  if (!isRecord(input)) throw new Error("campaigns.status.update input must be an object");
  return {
    advertiserId: requireString(input.advertiserId, "advertiserId"),
    campaignId: requireString(input.campaignId ?? input.id, "campaignId"),
    operationStatus: requireStatus(input.operationStatus ?? input.status),
  };
}

function extractData(body: unknown): Record<string, unknown> | null {
  if (!isRecord(body)) return null;
  return isRecord(body.data) ? body.data : body;
}

// ---------------------------------------------------------------------------
// ad_groups.create — POST /adgroup/create/
// ---------------------------------------------------------------------------

export type AdGroupsCreateInput = {
  advertiserId: string;
  campaignId: string;
  adGroupName: string;
  promotionType?: string;
  placementType?: string;
  budgetMode?: string;
  budget?: number;
  optimizationGoal?: string;
  billingEvent?: string;
  locationIds?: string[];
  scheduleType?: string;
  scheduleStartTime?: string;
  bidType?: string;
  pacing?: string;
};

export function createAdGroup(input: unknown): ActionResult {
  const validated = validateAdGroupsCreateInput(input);
  if (hasLiveAuth(input)) {
    const payload: Record<string, unknown> = {
      advertiser_id: validated.advertiserId,
      campaign_id: validated.campaignId,
      adgroup_name: validated.adGroupName,
    };
    if (validated.promotionType) payload.promotion_type = validated.promotionType;
    if (validated.placementType) payload.placement_type = validated.placementType;
    if (validated.budgetMode) payload.budget_mode = validated.budgetMode;
    if (validated.budget != null) payload.budget = validated.budget;
    if (validated.optimizationGoal) payload.optimization_goal = validated.optimizationGoal;
    if (validated.billingEvent) payload.billing_event = validated.billingEvent;
    if (validated.locationIds) payload.location_ids = validated.locationIds;
    if (validated.scheduleType) payload.schedule_type = validated.scheduleType;
    if (validated.scheduleStartTime) payload.schedule_start_time = validated.scheduleStartTime;
    if (validated.bidType) payload.bid_type = validated.bidType;
    if (validated.pacing) payload.pacing = validated.pacing;
    return liveResult(input, "ad_groups.create", validated.advertiserId, "/adgroup/create/", payload, (body) => ({
      adGroupId: parseMutateId(body, "adgroup_id"),
    }));
  }
  return { connector: "tiktok-ads", action: "ad_groups.create", source: "connector", validated };
}

function validateAdGroupsCreateInput(input: unknown): AdGroupsCreateInput {
  if (!isRecord(input)) throw new Error("ad_groups.create input must be an object");
  return {
    advertiserId: requireString(input.advertiserId, "advertiserId"),
    campaignId: requireString(input.campaignId, "campaignId"),
    adGroupName: requireString(input.adGroupName ?? input.name, "adGroupName"),
    promotionType: optionalString(input.promotionType)?.toUpperCase(),
    placementType: optionalString(input.placementType)?.toUpperCase(),
    budgetMode: optionalString(input.budgetMode)?.toUpperCase(),
    budget: optionalNumber(input.budget),
    optimizationGoal: optionalString(input.optimizationGoal)?.toUpperCase(),
    billingEvent: optionalString(input.billingEvent)?.toUpperCase(),
    locationIds: optionalStringArray(input.locationIds, "locationIds"),
    scheduleType: optionalString(input.scheduleType)?.toUpperCase(),
    scheduleStartTime: optionalString(input.scheduleStartTime),
    bidType: optionalString(input.bidType)?.toUpperCase(),
    pacing: optionalString(input.pacing)?.toUpperCase(),
  };
}

// ---------------------------------------------------------------------------
// ad_groups.update — POST /adgroup/update/
// ---------------------------------------------------------------------------

export type AdGroupsUpdateInput = {
  advertiserId: string;
  adGroupId: string;
  adGroupName?: string;
  budget?: number;
  budgetMode?: string;
};

export function updateAdGroup(input: unknown): ActionResult {
  const validated = validateAdGroupsUpdateInput(input);
  if (hasLiveAuth(input)) {
    const payload: Record<string, unknown> = {
      advertiser_id: validated.advertiserId,
      adgroup_id: validated.adGroupId,
    };
    if (validated.adGroupName) payload.adgroup_name = validated.adGroupName;
    if (validated.budget != null) payload.budget = validated.budget;
    if (validated.budgetMode) payload.budget_mode = validated.budgetMode;
    return liveResult(input, "ad_groups.update", validated.advertiserId, "/adgroup/update/", payload, (body) => ({
      adGroupId: parseMutateId(body, "adgroup_id") || validated.adGroupId,
    }));
  }
  return { connector: "tiktok-ads", action: "ad_groups.update", source: "connector", validated };
}

function validateAdGroupsUpdateInput(input: unknown): AdGroupsUpdateInput {
  if (!isRecord(input)) throw new Error("ad_groups.update input must be an object");
  return {
    advertiserId: requireString(input.advertiserId, "advertiserId"),
    adGroupId: requireString(input.adGroupId ?? input.id, "adGroupId"),
    adGroupName: optionalString(input.adGroupName ?? input.name),
    budget: optionalNumber(input.budget),
    budgetMode: optionalString(input.budgetMode)?.toUpperCase(),
  };
}

// ---------------------------------------------------------------------------
// ad_groups.status.update — POST /adgroup/status/update/
// ---------------------------------------------------------------------------

export type AdGroupsStatusUpdateInput = {
  advertiserId: string;
  adGroupId: string;
  operationStatus: string;
};

export function updateAdGroupStatus(input: unknown): ActionResult {
  const validated = validateAdGroupsStatusUpdateInput(input);
  if (hasLiveAuth(input)) {
    const payload = {
      advertiser_id: validated.advertiserId,
      adgroup_ids: [validated.adGroupId],
      operation_status: validated.operationStatus,
    };
    return liveResult(
      input,
      "ad_groups.status.update",
      validated.advertiserId,
      "/adgroup/status/update/",
      payload,
      (body) => ({
        adGroupIds: parseMutateIds(body, "adgroup_ids"),
        status: isRecord(extractData(body)) && typeof extractData(body)?.status === "string"
          ? String(extractData(body)?.status)
          : validated.operationStatus,
      }),
    );
  }
  return { connector: "tiktok-ads", action: "ad_groups.status.update", source: "connector", validated };
}

function validateAdGroupsStatusUpdateInput(input: unknown): AdGroupsStatusUpdateInput {
  if (!isRecord(input)) throw new Error("ad_groups.status.update input must be an object");
  return {
    advertiserId: requireString(input.advertiserId, "advertiserId"),
    adGroupId: requireString(input.adGroupId ?? input.id, "adGroupId"),
    operationStatus: requireStatus(input.operationStatus ?? input.status),
  };
}

// ---------------------------------------------------------------------------
// ads.create — POST /ad/create/
// ---------------------------------------------------------------------------

export type AdsCreateInput = {
  advertiserId: string;
  adGroupId: string;
  adName: string;
  identityId?: string;
  identityType?: string;
  adFormat?: string;
  videoId?: string;
  imageIds?: string[];
  adText?: string;
  callToAction?: string;
  landingPageUrl?: string;
};

export function createAd(input: unknown): ActionResult {
  const validated = validateAdsCreateInput(input);
  if (hasLiveAuth(input)) {
    const creative: Record<string, unknown> = { ad_name: validated.adName };
    if (validated.identityId) creative.identity_id = validated.identityId;
    if (validated.identityType) creative.identity_type = validated.identityType;
    if (validated.adFormat) creative.ad_format = validated.adFormat;
    if (validated.videoId) creative.video_id = validated.videoId;
    if (validated.imageIds) creative.image_ids = validated.imageIds;
    if (validated.adText) creative.ad_text = validated.adText;
    if (validated.callToAction) creative.call_to_action = validated.callToAction;
    if (validated.landingPageUrl) creative.landing_page_url = validated.landingPageUrl;
    const payload = {
      advertiser_id: validated.advertiserId,
      adgroup_id: validated.adGroupId,
      creatives: [creative],
    };
    return liveResult(input, "ads.create", validated.advertiserId, "/ad/create/", payload, (body) => ({
      adIds: parseMutateIds(body, "ad_ids"),
    }));
  }
  return { connector: "tiktok-ads", action: "ads.create", source: "connector", validated };
}

function validateAdsCreateInput(input: unknown): AdsCreateInput {
  if (!isRecord(input)) throw new Error("ads.create input must be an object");
  return {
    advertiserId: requireString(input.advertiserId, "advertiserId"),
    adGroupId: requireString(input.adGroupId, "adGroupId"),
    adName: requireString(input.adName ?? input.name, "adName"),
    identityId: optionalString(input.identityId),
    identityType: optionalString(input.identityType)?.toUpperCase(),
    adFormat: optionalString(input.adFormat)?.toUpperCase(),
    videoId: optionalString(input.videoId),
    imageIds: optionalStringArray(input.imageIds, "imageIds"),
    adText: optionalString(input.adText),
    callToAction: optionalString(input.callToAction)?.toUpperCase(),
    landingPageUrl: optionalString(input.landingPageUrl),
  };
}

// ---------------------------------------------------------------------------
// ads.update — POST /ad/update/
// ---------------------------------------------------------------------------

export type AdsUpdateInput = {
  advertiserId: string;
  adId: string;
  adName?: string;
  adText?: string;
};

export function updateAd(input: unknown): ActionResult {
  const validated = validateAdsUpdateInput(input);
  if (hasLiveAuth(input)) {
    const payload: Record<string, unknown> = {
      advertiser_id: validated.advertiserId,
      ad_id: validated.adId,
    };
    if (validated.adName) payload.ad_name = validated.adName;
    if (validated.adText) payload.ad_text = validated.adText;
    return liveResult(input, "ads.update", validated.advertiserId, "/ad/update/", payload, (body) => ({
      adIds: parseMutateIds(body, "ad_ids").length ? parseMutateIds(body, "ad_ids") : [validated.adId],
    }));
  }
  return { connector: "tiktok-ads", action: "ads.update", source: "connector", validated };
}

function validateAdsUpdateInput(input: unknown): AdsUpdateInput {
  if (!isRecord(input)) throw new Error("ads.update input must be an object");
  return {
    advertiserId: requireString(input.advertiserId, "advertiserId"),
    adId: requireString(input.adId ?? input.id, "adId"),
    adName: optionalString(input.adName ?? input.name),
    adText: optionalString(input.adText),
  };
}

// ---------------------------------------------------------------------------
// ads.status.update — POST /ad/status/update/
// ---------------------------------------------------------------------------

export type AdsStatusUpdateInput = {
  advertiserId: string;
  adId: string;
  operationStatus: string;
};

export function updateAdStatus(input: unknown): ActionResult {
  const validated = validateAdsStatusUpdateInput(input);
  if (hasLiveAuth(input)) {
    const payload = {
      advertiser_id: validated.advertiserId,
      ad_ids: [validated.adId],
      operation_status: validated.operationStatus,
    };
    return liveResult(input, "ads.status.update", validated.advertiserId, "/ad/status/update/", payload, (body) => ({
      adIds: parseMutateIds(body, "ad_ids"),
      status: isRecord(extractData(body)) && typeof extractData(body)?.status === "string"
        ? String(extractData(body)?.status)
        : validated.operationStatus,
    }));
  }
  return { connector: "tiktok-ads", action: "ads.status.update", source: "connector", validated };
}

function validateAdsStatusUpdateInput(input: unknown): AdsStatusUpdateInput {
  if (!isRecord(input)) throw new Error("ads.status.update input must be an object");
  return {
    advertiserId: requireString(input.advertiserId, "advertiserId"),
    adId: requireString(input.adId ?? input.id, "adId"),
    operationStatus: requireStatus(input.operationStatus ?? input.status),
  };
}

// ---------------------------------------------------------------------------
// advertisers.get — GET /advertiser/info/
// ---------------------------------------------------------------------------

export type AdvertisersGetInput = { advertiserId: string };

export function getAdvertiser(input: unknown): ActionResult {
  const validated = validateAdvertisersGetInput(input);
  if (hasLiveAuth(input)) {
    const params = new URLSearchParams();
    params.set("advertiser_ids", JSON.stringify([validated.advertiserId]));
    return getJSON(input as Record<string, unknown>, "advertisers.get", `/advertiser/info/?${params.toString()}`).then(
      (result) => {
        if (isTikTokOk(result.status, result.body)) {
          const parsed = parseAdvertisersResponse(result.body);
          const advertiser =
            parsed.advertisers.find((a) => a.raw.advertiser_id === validated.advertiserId || a.id.endsWith(`:${validated.advertiserId}`)) ??
            parsed.advertisers[0] ??
            null;
          return { connector: "tiktok-ads", action: "advertisers.get", source: "connector", advertiser };
        }
        throw handleError(result);
      },
    );
  }
  return { connector: "tiktok-ads", action: "advertisers.get", source: "connector", validated };
}

function validateAdvertisersGetInput(input: unknown): AdvertisersGetInput {
  if (!isRecord(input)) throw new Error("advertisers.get input must be an object");
  return { advertiserId: requireString(input.advertiserId ?? input.id, "advertiserId") };
}

// ---------------------------------------------------------------------------
// reports.get — BASIC /report/integrated/get/
// ---------------------------------------------------------------------------

export type ReportsGetInput = {
  advertiserId: string;
  startDate: string;
  endDate: string;
  reportType: string;
  dataLevel: string;
  dimensions?: string[];
  metrics?: string[];
  page?: number;
  pageSize?: number;
};

export function getReport(input: unknown): ActionResult {
  const validated = validateReportsGetInput(input);
  if (hasLiveAuth(input)) {
    const params = new URLSearchParams();
    params.set("advertiser_id", validated.advertiserId);
    params.set("report_type", validated.reportType);
    params.set("data_level", validated.dataLevel);
    params.set("start_date", validated.startDate);
    params.set("end_date", validated.endDate);
    if (validated.dimensions?.length) params.set("dimensions", JSON.stringify(validated.dimensions));
    if (validated.metrics?.length) params.set("metrics", JSON.stringify(validated.metrics));
    if (validated.page != null) params.set("page", String(validated.page));
    if (validated.pageSize != null) params.set("page_size", String(validated.pageSize));
    return getJSON(
      input as Record<string, unknown>,
      "reports.get",
      `/report/integrated/get/?${params.toString()}`,
      validated.advertiserId,
    ).then((result) => {
      if (isTikTokOk(result.status, result.body)) {
        const parsed = parseAnalyticsResponse(result.body);
        return {
          connector: "tiktok-ads",
          action: "reports.get",
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
  return { connector: "tiktok-ads", action: "reports.get", source: "connector", validated };
}

function validateReportsGetInput(input: unknown): ReportsGetInput {
  if (!isRecord(input)) throw new Error("reports.get input must be an object");
  const reportType = requireString(input.reportType ?? "BASIC", "reportType").toUpperCase();
  if (!REPORT_TYPES.has(reportType)) {
    throw new Error(`reportType must be one of ${[...REPORT_TYPES].join(", ")}`);
  }
  const dataLevel = requireString(input.dataLevel ?? "AUCTION_CAMPAIGN", "dataLevel").toUpperCase();
  if (!DATA_LEVELS.has(dataLevel)) {
    throw new Error(`dataLevel must be one of ${[...DATA_LEVELS].join(", ")}`);
  }
  return {
    advertiserId: requireString(input.advertiserId, "advertiserId"),
    startDate: ymd(input.startDate ?? input.dateRangeStart, "startDate"),
    endDate: ymd(input.endDate ?? input.dateRangeEnd ?? input.startDate ?? input.dateRangeStart, "endDate"),
    reportType,
    dataLevel,
    dimensions: optionalStringArray(input.dimensions, "dimensions"),
    metrics: optionalStringArray(input.metrics, "metrics"),
    page: optionalNumber(input.page),
    pageSize: optionalNumber(input.pageSize),
  };
}

// ---------------------------------------------------------------------------
// identities.list — GET /identity/get/
// ---------------------------------------------------------------------------

export type IdentitiesListInput = { advertiserId: string; page?: number; pageSize?: number };

export function listIdentities(input: unknown): ActionResult {
  const validated = validateAdvertiserPagedInput(input, "identities.list");
  if (hasLiveAuth(input)) {
    const params = pageParams(validated);
    params.set("advertiser_id", validated.advertiserId);
    return getJSON(
      input as Record<string, unknown>,
      "identities.list",
      `/identity/get/?${params.toString()}`,
      validated.advertiserId,
    ).then((result) => {
      if (isTikTokOk(result.status, result.body)) {
        const parsed = parseIdentitiesResponse(result.body);
        return {
          connector: "tiktok-ads",
          action: "identities.list",
          source: "connector",
          identities: parsed.identities,
          nextPage: parsed.nextPage,
          totalCount: parsed.totalCount,
        };
      }
      throw handleError(result);
    });
  }
  return { connector: "tiktok-ads", action: "identities.list", source: "connector", validated };
}

function validateAdvertiserPagedInput(input: unknown, operation: string): IdentitiesListInput {
  if (!isRecord(input)) throw new Error(`${operation} input must be an object`);
  return {
    advertiserId: requireString(input.advertiserId, "advertiserId"),
    page: optionalNumber(input.page),
    pageSize: optionalNumber(input.pageSize),
  };
}

// ---------------------------------------------------------------------------
// videos.list — GET /file/video/ad/search/
// ---------------------------------------------------------------------------

export function listVideos(input: unknown): ActionResult {
  const validated = validateAdvertiserPagedInput(input, "videos.list");
  if (hasLiveAuth(input)) {
    const params = pageParams(validated);
    params.set("advertiser_id", validated.advertiserId);
    return getJSON(
      input as Record<string, unknown>,
      "videos.list",
      `/file/video/ad/search/?${params.toString()}`,
      validated.advertiserId,
    ).then((result) => {
      if (isTikTokOk(result.status, result.body)) {
        const parsed = parseVideosResponse(result.body);
        return {
          connector: "tiktok-ads",
          action: "videos.list",
          source: "connector",
          videos: parsed.videos,
          nextPage: parsed.nextPage,
          totalCount: parsed.totalCount,
        };
      }
      throw handleError(result);
    });
  }
  return { connector: "tiktok-ads", action: "videos.list", source: "connector", validated };
}

// ---------------------------------------------------------------------------
// images.list — GET /file/image/ad/search/
// ---------------------------------------------------------------------------

export function listImages(input: unknown): ActionResult {
  const validated = validateAdvertiserPagedInput(input, "images.list");
  if (hasLiveAuth(input)) {
    const params = pageParams(validated);
    params.set("advertiser_id", validated.advertiserId);
    return getJSON(
      input as Record<string, unknown>,
      "images.list",
      `/file/image/ad/search/?${params.toString()}`,
      validated.advertiserId,
    ).then((result) => {
      if (isTikTokOk(result.status, result.body)) {
        const parsed = parseImagesResponse(result.body);
        return {
          connector: "tiktok-ads",
          action: "images.list",
          source: "connector",
          images: parsed.images,
          nextPage: parsed.nextPage,
          totalCount: parsed.totalCount,
        };
      }
      throw handleError(result);
    });
  }
  return { connector: "tiktok-ads", action: "images.list", source: "connector", validated };
}

// ---------------------------------------------------------------------------
// custom_audiences.list — GET /dmp/custom_audience/list/
// ---------------------------------------------------------------------------

export function listCustomAudiences(input: unknown): ActionResult {
  const validated = validateAdvertiserPagedInput(input, "custom_audiences.list");
  if (hasLiveAuth(input)) {
    const params = pageParams(validated);
    params.set("advertiser_id", validated.advertiserId);
    return getJSON(
      input as Record<string, unknown>,
      "custom_audiences.list",
      `/dmp/custom_audience/list/?${params.toString()}`,
      validated.advertiserId,
    ).then((result) => {
      if (isTikTokOk(result.status, result.body)) {
        const parsed = parseCustomAudiencesResponse(result.body);
        return {
          connector: "tiktok-ads",
          action: "custom_audiences.list",
          source: "connector",
          audiences: parsed.audiences,
          nextPage: parsed.nextPage,
          totalCount: parsed.totalCount,
        };
      }
      throw handleError(result);
    });
  }
  return { connector: "tiktok-ads", action: "custom_audiences.list", source: "connector", validated };
}

// ---------------------------------------------------------------------------
// pixels.get — GET /pixel/list/ filtered by pixel_id
// ---------------------------------------------------------------------------

export type PixelsGetInput = { advertiserId: string; pixelId: string };

export function getPixel(input: unknown): ActionResult {
  const validated = validatePixelsGetInput(input);
  if (hasLiveAuth(input)) {
    const params = new URLSearchParams();
    params.set("advertiser_id", validated.advertiserId);
    params.set("pixel_id", validated.pixelId);
    return getJSON(
      input as Record<string, unknown>,
      "pixels.get",
      `/pixel/list/?${params.toString()}`,
      validated.advertiserId,
    ).then((result) => {
      if (isTikTokOk(result.status, result.body)) {
        const parsed = parsePixelsResponse(result.body);
        const pixel =
          parsed.pixels.find((p) => p.raw.pixel_id === validated.pixelId || p.id.endsWith(`:${validated.pixelId}`)) ??
          parsed.pixels[0] ??
          null;
        return { connector: "tiktok-ads", action: "pixels.get", source: "connector", pixel };
      }
      throw handleError(result);
    });
  }
  return { connector: "tiktok-ads", action: "pixels.get", source: "connector", validated };
}

function validatePixelsGetInput(input: unknown): PixelsGetInput {
  if (!isRecord(input)) throw new Error("pixels.get input must be an object");
  return {
    advertiserId: requireString(input.advertiserId, "advertiserId"),
    pixelId: requireString(input.pixelId ?? input.id, "pixelId"),
  };
}

// Re-export normalizers used by fixture tests
export { normalizeCampaign, normalizeAdGroup, normalizeAd } from "./objects";
