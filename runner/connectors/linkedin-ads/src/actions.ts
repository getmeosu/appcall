import {
  createLinkedInAdsClient,
  parseLinkedInAdsRateLimit,
  type LinkedInAdsClientOptions,
} from "./http";
import {
  normalizeCampaign,
  normalizeAdAccount,
  normalizeCampaignGroup,
  normalizeCreative,
  parseCampaignGroupsResponse,
  parseCreativesResponse,
  parseAnalyticsResponse,
} from "./objects";
import { adAccountId, scopedPermissionFailure } from "./g1-runtime";
import { enc, pageSize as pageSizeParam, pageTokenValue, qs, rejectIndexStart } from "./restli";

type ActionResult = Record<string, unknown> | Promise<Record<string, unknown>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasLiveAuth(input: unknown): input is Record<string, unknown> & { accessToken: string } {
  return isRecord(input) && typeof input.accessToken === "string" && input.accessToken.length > 0;
}

function clientOpts(input: Record<string, unknown>, operation: string): LinkedInAdsClientOptions {
  return {
    accessToken: String(input.accessToken),
    fetch: typeof input.fetch === "function" ? (input.fetch as typeof fetch) : undefined,
    operation,
  };
}

function handleError(operation: string, result: { status: number; headers: Record<string, string>; body: unknown }) {
  // LI-SCOPES: a permission failure on an op with requiredScopes maps like G1.
  const permission = scopedPermissionFailure(operation, result.status, result.body);
  if (permission) return permission;
  const rateLimit = parseLinkedInAdsRateLimit(result.status, result.headers);
  if (rateLimit.limited) {
    return {
      ok: false,
      code: "CONNECTOR_RATE_LIMITED",
      message: "LinkedIn Ads rate limit exceeded.",
      retryAfterSeconds: rateLimit.retryAfterSeconds,
    };
  }
  return { ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message: "LinkedIn Ads rejected the request." };
}

function requireString(value: unknown, field: string): string {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value);
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function firstValue(input: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (input[key] !== undefined && input[key] !== "") return input[key];
  }
  return undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Strip URN prefixes / whitespace so Rest.li path segments stay numeric. */
export function sanitizeResourceId(id: string, urnPrefixes: string[]): string {
  let out = id.trim();
  for (const prefix of urnPrefixes) {
    if (out.startsWith(prefix)) out = out.slice(prefix.length);
  }
  return out;
}

function toSponsoredAccountUrn(id: string): string {
  const simple = sanitizeResourceId(id, ["urn:li:sponsoredAccount:"]);
  return `urn:li:sponsoredAccount:${simple}`;
}

function toSponsoredCampaignUrn(id: string): string {
  const simple = sanitizeResourceId(id, ["urn:li:sponsoredCampaign:"]);
  return `urn:li:sponsoredCampaign:${simple}`;
}

function encodeRestliList(urns: string[]): string {
  return `List(${urns.map(enc).join(",")})`;
}

function formatDateRange(start: { year: number; month: number; day: number }, end?: { year: number; month: number; day: number }): string {
  const startPart = `start:(year:${start.year},month:${start.month},day:${start.day})`;
  if (!end) return `(${startPart})`;
  return `(${startPart},end:(year:${end.year},month:${end.month},day:${end.day}))`;
}

function parseDateParts(value: unknown, field: string): { year: number; month: number; day: number } {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    return { year: y!, month: m!, day: d! };
  }
  if (isRecord(value)) {
    const year = optionalNumber(value.year);
    const month = optionalNumber(value.month);
    const day = optionalNumber(value.day);
    if (year != null && month != null && day != null) return { year, month, day };
  }
  throw new Error(`${field} must be YYYY-MM-DD or {year,month,day}`);
}

// ---------------------------------------------------------------------------
// campaigns.get
// ---------------------------------------------------------------------------

export type CampaignsGetInput = { accountId: string; campaignId: string };

export function getCampaign(input: unknown): ActionResult {
  const validated = validateCampaignsGetInput(input);
  if (hasLiveAuth(input)) {
    const accountId = adAccountId(validated.accountId);
    const campaignId = sanitizeResourceId(validated.campaignId, ["urn:li:sponsoredCampaign:"]);
    return createLinkedInAdsClient(clientOpts(input, "campaigns.get"))
      .fetchJSON(`/rest/adAccounts/${accountId}/adCampaigns/${campaignId}`, { method: "GET" })
      .then((result) => {
        if (result.status === 200 && isRecord(result.body)) {
          return {
            connector: "linkedin-ads",
            action: "campaigns.get",
            source: "connector",
            campaign: normalizeCampaign(result.body),
          };
        }
        throw handleError("campaigns.get", result);
      });
  }
  // Dry run carries campaign: null like campaign_groups.get / creatives.get, so the
  // campaigns.update Reconcile output keeps one shape (LI-G1b).
  return { connector: "linkedin-ads", action: "campaigns.get", source: "connector", campaign: null, validated };
}

function validateCampaignsGetInput(input: unknown): CampaignsGetInput {
  if (!isRecord(input)) throw new Error("campaigns.get input must be an object");
  return {
    accountId: requireString(firstValue(input, ["accountId", "ad_account_id", "adAccountId"]), "accountId"),
    campaignId: requireString(firstValue(input, ["campaignId", "ad_campaign_id", "id"]), "campaignId"),
  };
}

// ---------------------------------------------------------------------------
// ad_accounts.get
// ---------------------------------------------------------------------------

export type AdAccountsGetInput = { accountId: string };

export function getAdAccount(input: unknown): ActionResult {
  const validated = validateAdAccountsGetInput(input);
  if (hasLiveAuth(input)) {
    const accountId = adAccountId(validated.accountId);
    return createLinkedInAdsClient(clientOpts(input, "ad_accounts.get"))
      .fetchJSON(`/rest/adAccounts/${accountId}`, { method: "GET" })
      .then((result) => {
        if (result.status === 200 && isRecord(result.body)) {
          return {
            connector: "linkedin-ads",
            action: "ad_accounts.get",
            source: "connector",
            adAccount: normalizeAdAccount(result.body),
          };
        }
        throw handleError("ad_accounts.get", result);
      });
  }
  return { connector: "linkedin-ads", action: "ad_accounts.get", source: "connector", validated };
}

function validateAdAccountsGetInput(input: unknown): AdAccountsGetInput {
  if (!isRecord(input)) throw new Error("ad_accounts.get input must be an object");
  return {
    accountId: requireString(firstValue(input, ["accountId", "ad_account_id", "adAccountId", "id"]), "accountId"),
  };
}

// ---------------------------------------------------------------------------
// campaign_groups.list
// ---------------------------------------------------------------------------

export type CampaignGroupsListInput = {
  accountId: string;
  start?: number;
  count?: number;
  pageSize?: number;
  pageToken?: string;
  status?: string;
};

export const CAMPAIGN_GROUP_STATUS_VALUES = ["ACTIVE", "ARCHIVED", "CANCELED", "DRAFT", "PAUSED", "PENDING_DELETION", "REMOVED"] as const;
const CAMPAIGN_GROUP_STATUSES = new Set<string>(CAMPAIGN_GROUP_STATUS_VALUES);
/**
 * GRP Search for Campaign Groups: "Search criteria is mandatory". With no caller
 * status filter, every documented search.status.values value is sent, so the
 * finder still returns all campaign groups instead of a bare q=search.
 * https://learn.microsoft.com/en-us/linkedin/marketing/integrations/ads/account-structure/create-and-manage-campaign-groups?view=li-lms-2026-09
 */
export const CAMPAIGN_GROUP_DEFAULT_SEARCH = `(status:(values:List(${CAMPAIGN_GROUP_STATUS_VALUES.join(",")})))`;

/**
 * GET /rest/adAccounts/{id}/adCampaignGroups?q=search (GRP Search for Campaign Groups).
 * Rest.li 2.0 search=(status:(values:List(...))) and cursor paging pageSize/pageToken
 * (index start/count was replaced in 202401). count is kept as a pageSize alias.
 */
export function listCampaignGroups(input: unknown): ActionResult {
  const validated = validateCampaignGroupsListInput(input);
  if (hasLiveAuth(input)) {
    const accountId = adAccountId(validated.accountId);
    const pairs: Array<[string, string]> = [["q", "search"]];
    pairs.push(["search", validated.status ? `(status:(values:List(${enc(validated.status)})))` : CAMPAIGN_GROUP_DEFAULT_SEARCH]);
    const size = pageSizeParam(validated.pageSize ?? validated.count, validated.pageSize !== undefined ? "pageSize" : "count");
    if (size) pairs.push(["pageSize", size]);
    const token = pageTokenValue(validated.pageToken);
    if (token) pairs.push(["pageToken", token]);
    return createLinkedInAdsClient(clientOpts(input, "campaign_groups.list"))
      .fetchJSON(`/rest/adAccounts/${accountId}/adCampaignGroups?${qs(pairs)}`, { method: "GET", headers: { "X-RestLi-Method": "FINDER" } })
      .then((result) => {
        if (result.status === 200) {
          const parsed = parseCampaignGroupsResponse(result.body);
          return {
            connector: "linkedin-ads",
            action: "campaign_groups.list",
            source: "connector",
            campaignGroups: parsed.campaignGroups,
            nextStart: parsed.nextStart,
            nextPageToken: parsed.nextPageToken,
            count: parsed.count,
          };
        }
        throw handleError("campaign_groups.list", result);
      });
  }
  return { connector: "linkedin-ads", action: "campaign_groups.list", source: "connector", validated };
}

function validateCampaignGroupsListInput(input: unknown): CampaignGroupsListInput {
  if (!isRecord(input)) throw new Error("campaign_groups.list input must be an object");
  rejectIndexStart(input.start);
  const status = optionalString(input.status)?.toUpperCase();
  if (status !== undefined && !CAMPAIGN_GROUP_STATUSES.has(status)) throw new Error("status is not a supported campaign group status");
  return {
    accountId: requireString(firstValue(input, ["accountId", "ad_account_id", "adAccountId"]), "accountId"),
    start: optionalNumber(input.start),
    count: optionalNumber(input.count),
    pageSize: optionalNumber(input.pageSize),
    pageToken: optionalString(input.pageToken),
    status,
  };
}

// ---------------------------------------------------------------------------
// creatives.list — distinct from creative_assets.list sync
// ---------------------------------------------------------------------------

export type CreativesListInput = {
  accountId: string;
  start?: number;
  count?: number;
  pageSize?: number;
  pageToken?: string;
  sortOrder?: string;
  campaignId?: string;
  intendedStatus?: string;
  campaigns?: string[];
  creatives?: string[];
  intendedStatuses?: string[];
  contentReferences?: string[];
  leadgenDestinations?: string[];
  isTestAccount?: boolean;
};

function criteriaList(values: string[] | undefined, prefix?: string): string | undefined {
  if (!values?.length) return undefined;
  const urns = values.map((value) => prefix ? `${prefix}${sanitizeResourceId(value, [prefix])}` : value);
  return `List(${urns.map(enc).join(",")})`;
}

export function listCreatives(input: unknown): ActionResult {
  const validated = validateCreativesListInput(input);
  if (hasLiveAuth(input)) {
    const accountId = adAccountId(validated.accountId);
    const pairs = ["q=criteria"];
    const add = (key: string, value: string | undefined) => { if (value) pairs.push(`${encodeURIComponent(key)}=${value}`); };
    add("campaigns", criteriaList(validated.campaigns ?? (validated.campaignId ? [validated.campaignId] : undefined), "urn:li:sponsoredCampaign:"));
    add("creatives", criteriaList(validated.creatives, "urn:li:sponsoredCreative:"));
    const statuses = validated.intendedStatuses ?? (validated.intendedStatus ? [validated.intendedStatus] : undefined);
    if (statuses?.some((status) => !/^[A-Z_]{1,40}$/.test(status))) throw new Error("intendedStatuses contains an unsupported value");
    add("intendedStatuses", statuses?.length ? `List(${statuses.join(",")})` : undefined);
    add("contentReferences", criteriaList(validated.contentReferences));
    add("leadgenCreativeCallToActionDestinations", criteriaList(validated.leadgenDestinations, "urn:li:adForm:"));
    if (validated.isTestAccount !== undefined) add("isTestAccount", String(validated.isTestAccount));
    if (validated.sortOrder) {
      if (validated.sortOrder !== "ASCENDING" && validated.sortOrder !== "DESCENDING") throw new Error("sortOrder is not supported");
      add("sortOrder", validated.sortOrder);
    }
    add("pageToken", pageTokenValue(validated.pageToken));
    // creatives q=criteria is cursor paged with pageSize capped at 100 (CRE Search for Creatives).
    add("pageSize", pageSizeParam(validated.pageSize ?? validated.count, validated.pageSize !== undefined ? "pageSize" : "count", 100));
    return createLinkedInAdsClient(clientOpts(input, "creatives.list"))
      .fetchJSON(`/rest/adAccounts/${accountId}/creatives?${pairs.join("&")}`, { method: "GET", headers: { "X-RestLi-Method": "FINDER" } })
      .then((result) => {
        if (result.status === 200) {
          const parsed = parseCreativesResponse(result.body);
          return {
            connector: "linkedin-ads",
            action: "creatives.list",
            source: "connector",
            creatives: parsed.creatives,
            nextStart: parsed.nextStart,
            nextPageToken: parsed.nextPageToken,
            count: parsed.count,
          };
        }
        throw handleError("creatives.list", result);
      });
  }
  return { connector: "linkedin-ads", action: "creatives.list", source: "connector", validated };
}

function validateCreativesListInput(input: unknown): CreativesListInput {
  if (!isRecord(input)) throw new Error("creatives.list input must be an object");
  rejectIndexStart(input.start);
  const stringArray = (value: unknown): string[] | undefined => {
    if (value == null) return undefined;
    if (!Array.isArray(value) || !value.every((item) => typeof item === "string" && item.length > 0)) {
      throw new Error("creative filters must be string arrays");
    }
    return value;
  };
  return {
    accountId: requireString(firstValue(input, ["accountId", "ad_account_id", "adAccountId"]), "accountId"),
    start: optionalNumber(input.start),
    count: optionalNumber(input.count),
    pageSize: optionalNumber(input.pageSize ?? input.page_size),
    pageToken: optionalString(input.pageToken ?? input.page_token),
    sortOrder: optionalString(input.sortOrder ?? input.sort_order),
    campaignId: optionalString(input.campaignId),
    intendedStatus: optionalString(input.intendedStatus),
    campaigns: stringArray(input.campaigns),
    creatives: stringArray(input.creatives),
    intendedStatuses: stringArray(input.intendedStatuses ?? input.intended_statuses),
    contentReferences: stringArray(input.contentReferences ?? input.content_references),
    leadgenDestinations: stringArray(input.leadgenCreativeCallToActionDestinations ?? input.leadgen_creative_call_to_action_destinations),
    isTestAccount: typeof input.isTestAccount === "boolean" ? input.isTestAccount : typeof input.is_test_account === "boolean" ? input.is_test_account : undefined,
  };
}

// ---------------------------------------------------------------------------
// analytics.report.get
// ---------------------------------------------------------------------------

const ANALYTICS_PIVOTS = new Set([
  "ACCOUNT",
  "CAMPAIGN",
  "CAMPAIGN_GROUP",
  "CREATIVE",
  "COMPANY",
  "SHARE",
  "CONVERSION",
  "SERVING_LOCATION",
  "CARD_INDEX",
  "MEMBER_COMPANY",
  "MEMBER_COUNTRY_V2",
  "MEMBER_REGION_V2",
  "MEMBER_JOB_TITLE",
  "MEMBER_INDUSTRY",
  "MEMBER_SENIORITY",
  "MEMBER_JOB_FUNCTION",
  "MEMBER_COMPANY_SIZE",
  "MEMBER_COUNTY",
  "PLACEMENT_NAME",
  "IMPRESSION_DEVICE_TYPE",
]);

const TIME_GRANULARITIES = new Set(["ALL", "DAILY", "MONTHLY", "YEARLY"]);

export type AnalyticsReportGetInput = {
  accounts?: string[];
  campaigns?: string[];
  campaignGroups?: string[];
  creatives?: string[];
  pivot: string;
  finder: string;
  timeGranularity: string;
  dateRangeStart: { year: number; month: number; day: number };
  dateRangeEnd?: { year: number; month: number; day: number };
  fields?: string[];
};

export function getAnalyticsReport(input: unknown): ActionResult {
  const validated = validateAnalyticsReportGetInput(input);
  if (hasLiveAuth(input)) {
    const pairs = [
      `q=${validated.finder}`,
      validated.finder === "statistics" ? `pivots=List(${validated.pivot})` : `pivot=${validated.pivot}`,
      `timeGranularity=${validated.timeGranularity}`,
      `dateRange=${formatDateRange(validated.dateRangeStart, validated.dateRangeEnd)}`,
    ];
    const addList = (key: string, values: string[] | undefined) => {
      if (values?.length) pairs.push(`${key}=${encodeRestliList(values)}`);
    };
    addList("accounts", validated.accounts?.map(toSponsoredAccountUrn));
    addList("campaigns", validated.campaigns?.map(toSponsoredCampaignUrn));
    addList("campaignGroups", validated.campaignGroups?.map((id) => {
      const simple = sanitizeResourceId(id, ["urn:li:sponsoredCampaignGroup:"]);
      return `urn:li:sponsoredCampaignGroup:${simple}`;
    }));
    addList("creatives", validated.creatives?.map((id) => {
      const simple = sanitizeResourceId(id, ["urn:li:sponsoredCreative:", "urn:li:creatives:"]);
      return `urn:li:sponsoredCreative:${simple}`;
    }));
    pairs.push(`fields=${analyticsFields(validated.fields).join(",")}`);

    return createLinkedInAdsClient(clientOpts(input, "analytics.report.get"))
      .fetchJSON(`/rest/adAnalytics?${pairs.join("&")}`, { method: "GET", headers: { "X-RestLi-Method": "FINDER" } })
      .then((result) => {
        if (result.status === 200) {
          const parsed = parseAnalyticsResponse(result.body);
          return {
            connector: "linkedin-ads",
            action: "analytics.report.get",
            source: "connector",
            pivot: validated.pivot,
            timeGranularity: validated.timeGranularity,
            rows: parsed.rows,
            rowCount: parsed.rows.length,
          };
        }
        throw handleError("analytics.report.get", result);
      });
  }
  return { connector: "linkedin-ads", action: "analytics.report.get", source: "connector", validated };
}

/**
 * Without fields LinkedIn returns only impressions and clicks, so cost would
 * normalize to 0 (REP: "Otherwise, only impressions and clicks are returned by
 * default. Request up to 20 metrics."). Default projection covers every metric the
 * normalizer reads; caller fields always gain dateRange and pivotValues.
 * Every default is valid for professional-demographic (MEMBER_*) pivots too.
 */
export const DEFAULT_ANALYTICS_FIELDS = [
  "dateRange",
  "pivotValues",
  "impressions",
  "clicks",
  "costInLocalCurrency",
  "costInUsd",
  "landingPageClicks",
  "externalWebsiteConversions",
  "totalEngagements",
  "oneClickLeads",
  "videoViews",
] as const;
const ANALYTICS_STRUCTURAL_FIELDS = new Set(["dateRange", "pivotValues"]);

export function analyticsFields(fields: string[] | undefined): string[] {
  if (!fields?.length) return [...DEFAULT_ANALYTICS_FIELDS];
  if (fields.some((field) => !/^[A-Za-z0-9_]{1,64}$/.test(field))) throw new Error("fields contains an unsupported value");
  const out = [...new Set(["dateRange", "pivotValues", ...fields])];
  if (out.filter((field) => !ANALYTICS_STRUCTURAL_FIELDS.has(field)).length > 20) throw new Error("fields may request at most 20 metrics");
  return out;
}

function requireStringArray(value: unknown, field: string): string[] | undefined {
  if (value == null) return undefined;
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${field} must be a non-empty string array when provided`);
  if (!value.every((v) => typeof v === "string" && v.length > 0)) throw new Error(`${field} must be a non-empty string array when provided`);
  return value as string[];
}

function validateAnalyticsReportGetInput(input: unknown): AnalyticsReportGetInput {
  if (!isRecord(input)) throw new Error("analytics.report.get input must be an object");

  const finder = requireString(input.q ?? "analytics", "q").toLowerCase();
  if (finder !== "analytics" && finder !== "statistics") throw new Error("q must be analytics or statistics");
  const pivot = requireString(input.pivot, "pivot").toUpperCase();
  if (!ANALYTICS_PIVOTS.has(pivot)) {
    throw new Error(`pivot must be one of ${[...ANALYTICS_PIVOTS].join(", ")}`);
  }

  const timeGranularity = requireString(input.timeGranularity ?? "ALL", "timeGranularity").toUpperCase();
  if (!TIME_GRANULARITIES.has(timeGranularity)) {
    throw new Error(`timeGranularity must be one of ${[...TIME_GRANULARITIES].join(", ")}`);
  }

  const accounts = requireStringArray(input.accounts, "accounts");
  const campaigns = requireStringArray(input.campaigns, "campaigns");
  const campaignGroups = requireStringArray(input.campaignGroups, "campaignGroups");
  const creatives = requireStringArray(input.creatives, "creatives");

  if (!accounts?.length && !campaigns?.length && !campaignGroups?.length && !creatives?.length) {
    throw new Error("at least one of accounts, campaigns, campaignGroups, or creatives is required");
  }

  const dateRangeRecord = isRecord(input.dateRange) ? input.dateRange : undefined;
  if (input.dateRangeStart == null && input.startDate == null && dateRangeRecord?.start == null) {
    throw new Error("dateRangeStart is required");
  }

  const dateRangeStart = parseDateParts(input.dateRangeStart ?? input.startDate ?? dateRangeRecord?.start, "dateRangeStart");
  const dateRangeEnd =
    input.dateRangeEnd != null || input.endDate != null || dateRangeRecord?.end != null
      ? parseDateParts(input.dateRangeEnd ?? input.endDate ?? dateRangeRecord?.end, "dateRangeEnd")
      : undefined;

  let fields: string[] | undefined;
  if (typeof input.fields === "string") {
    fields = input.fields.split(",").map((field) => field.trim()).filter((field) => field.length > 0);
  } else if (Array.isArray(input.fields)) {
    if (!input.fields.every((f) => typeof f === "string" && f.length > 0)) {
      throw new Error("fields must be an array of strings");
    }
    fields = input.fields as string[];
  }

  return {
    accounts,
    campaigns,
    campaignGroups,
    creatives,
    pivot,
    finder,
    timeGranularity,
    dateRangeStart,
    dateRangeEnd,
    fields,
  };
}

// Re-export normalizers used by fixture tests
export { normalizeCampaignGroup, normalizeCreative, normalizeAnalyticsRow };
