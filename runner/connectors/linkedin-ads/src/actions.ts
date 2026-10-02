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

function handleError(result: { status: number; headers: Record<string, string>; body: unknown }) {
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
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
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
  return `List(${urns.map((u) => encodeURIComponent(u)).join(",")})`;
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
    const accountId = sanitizeResourceId(validated.accountId, ["urn:li:sponsoredAccount:"]);
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
        throw handleError(result);
      });
  }
  return { connector: "linkedin-ads", action: "campaigns.get", source: "connector", validated };
}

function validateCampaignsGetInput(input: unknown): CampaignsGetInput {
  if (!isRecord(input)) throw new Error("campaigns.get input must be an object");
  return {
    accountId: requireString(input.accountId, "accountId"),
    campaignId: requireString(input.campaignId ?? input.id, "campaignId"),
  };
}

// ---------------------------------------------------------------------------
// ad_accounts.get
// ---------------------------------------------------------------------------

export type AdAccountsGetInput = { accountId: string };

export function getAdAccount(input: unknown): ActionResult {
  const validated = validateAdAccountsGetInput(input);
  if (hasLiveAuth(input)) {
    const accountId = sanitizeResourceId(validated.accountId, ["urn:li:sponsoredAccount:"]);
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
        throw handleError(result);
      });
  }
  return { connector: "linkedin-ads", action: "ad_accounts.get", source: "connector", validated };
}

function validateAdAccountsGetInput(input: unknown): AdAccountsGetInput {
  if (!isRecord(input)) throw new Error("ad_accounts.get input must be an object");
  return {
    accountId: requireString(input.accountId ?? input.id, "accountId"),
  };
}

// ---------------------------------------------------------------------------
// campaign_groups.list
// ---------------------------------------------------------------------------

export type CampaignGroupsListInput = {
  accountId: string;
  start?: number;
  count?: number;
  status?: string;
};

export function listCampaignGroups(input: unknown): ActionResult {
  const validated = validateCampaignGroupsListInput(input);
  if (hasLiveAuth(input)) {
    const accountId = sanitizeResourceId(validated.accountId, ["urn:li:sponsoredAccount:"]);
    const start = validated.start ?? 0;
    const count = validated.count ?? 10;
    const params = new URLSearchParams();
    params.set("q", "search");
    params.set("start", String(start));
    params.set("count", String(count));
    if (validated.status) {
      params.set("search.status.values[0]", validated.status);
    }
    return createLinkedInAdsClient(clientOpts(input, "campaign_groups.list"))
      .fetchJSON(`/rest/adAccounts/${accountId}/adCampaignGroups?${params.toString()}`, { method: "GET" })
      .then((result) => {
        if (result.status === 200) {
          const parsed = parseCampaignGroupsResponse(result.body);
          return {
            connector: "linkedin-ads",
            action: "campaign_groups.list",
            source: "connector",
            campaignGroups: parsed.campaignGroups,
            nextStart: parsed.nextStart,
            count: parsed.count,
          };
        }
        throw handleError(result);
      });
  }
  return { connector: "linkedin-ads", action: "campaign_groups.list", source: "connector", validated };
}

function validateCampaignGroupsListInput(input: unknown): CampaignGroupsListInput {
  if (!isRecord(input)) throw new Error("campaign_groups.list input must be an object");
  return {
    accountId: requireString(input.accountId, "accountId"),
    start: optionalNumber(input.start),
    count: optionalNumber(input.count),
    status: optionalString(input.status),
  };
}

// ---------------------------------------------------------------------------
// creatives.list — distinct from creative_assets.list sync
// ---------------------------------------------------------------------------

export type CreativesListInput = {
  accountId: string;
  start?: number;
  count?: number;
  campaignId?: string;
  intendedStatus?: string;
};

export function listCreatives(input: unknown): ActionResult {
  const validated = validateCreativesListInput(input);
  if (hasLiveAuth(input)) {
    const accountId = sanitizeResourceId(validated.accountId, ["urn:li:sponsoredAccount:"]);
    const start = validated.start ?? 0;
    const count = validated.count ?? 10;
    const params = new URLSearchParams();
    params.set("q", "search");
    params.set("start", String(start));
    params.set("count", String(count));
    if (validated.campaignId) {
      params.set("search.campaigns.values[0]", toSponsoredCampaignUrn(validated.campaignId));
    }
    if (validated.intendedStatus) {
      params.set("search.intendedStatuses.values[0]", validated.intendedStatus);
    }
    return createLinkedInAdsClient(clientOpts(input, "creatives.list"))
      .fetchJSON(`/rest/adAccounts/${accountId}/creatives?${params.toString()}`, { method: "GET" })
      .then((result) => {
        if (result.status === 200) {
          const parsed = parseCreativesResponse(result.body);
          return {
            connector: "linkedin-ads",
            action: "creatives.list",
            source: "connector",
            creatives: parsed.creatives,
            nextStart: parsed.nextStart,
            count: parsed.count,
          };
        }
        throw handleError(result);
      });
  }
  return { connector: "linkedin-ads", action: "creatives.list", source: "connector", validated };
}

function validateCreativesListInput(input: unknown): CreativesListInput {
  if (!isRecord(input)) throw new Error("creatives.list input must be an object");
  return {
    accountId: requireString(input.accountId, "accountId"),
    start: optionalNumber(input.start),
    count: optionalNumber(input.count),
    campaignId: optionalString(input.campaignId),
    intendedStatus: optionalString(input.intendedStatus),
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
  "MEMBER_COMPANY",
  "MEMBER_COUNTRY_V2",
  "MEMBER_REGION_V2",
  "MEMBER_JOB_TITLE",
  "MEMBER_INDUSTRY",
  "MEMBER_SENIORITY",
  "MEMBER_JOB_FUNCTION",
  "MEMBER_COMPANY_SIZE",
]);

const TIME_GRANULARITIES = new Set(["ALL", "DAILY", "MONTHLY", "YEARLY"]);

export type AnalyticsReportGetInput = {
  accounts?: string[];
  campaigns?: string[];
  campaignGroups?: string[];
  creatives?: string[];
  pivot: string;
  timeGranularity: string;
  dateRangeStart: { year: number; month: number; day: number };
  dateRangeEnd?: { year: number; month: number; day: number };
  fields?: string[];
};

export function getAnalyticsReport(input: unknown): ActionResult {
  const validated = validateAnalyticsReportGetInput(input);
  if (hasLiveAuth(input)) {
    const params = new URLSearchParams();
    params.set("q", "analytics");
    params.set("pivot", validated.pivot);
    params.set("timeGranularity", validated.timeGranularity);
    params.set("dateRange", formatDateRange(validated.dateRangeStart, validated.dateRangeEnd));

    if (validated.accounts?.length) {
      params.set("accounts", encodeRestliList(validated.accounts.map(toSponsoredAccountUrn)));
    }
    if (validated.campaigns?.length) {
      params.set("campaigns", encodeRestliList(validated.campaigns.map(toSponsoredCampaignUrn)));
    }
    if (validated.campaignGroups?.length) {
      params.set(
        "campaignGroups",
        encodeRestliList(
          validated.campaignGroups.map((id) => {
            const simple = sanitizeResourceId(id, ["urn:li:sponsoredCampaignGroup:"]);
            return `urn:li:sponsoredCampaignGroup:${simple}`;
          }),
        ),
      );
    }
    if (validated.creatives?.length) {
      params.set(
        "creatives",
        encodeRestliList(
          validated.creatives.map((id) => {
            const simple = sanitizeResourceId(id, ["urn:li:sponsoredCreative:", "urn:li:creatives:"]);
            return `urn:li:sponsoredCreative:${simple}`;
          }),
        ),
      );
    }
    if (validated.fields?.length) {
      params.set("fields", validated.fields.join(","));
    }

    return createLinkedInAdsClient(clientOpts(input, "analytics.report.get"))
      .fetchJSON(`/rest/adAnalytics?${params.toString()}`, { method: "GET" })
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
        throw handleError(result);
      });
  }
  return { connector: "linkedin-ads", action: "analytics.report.get", source: "connector", validated };
}

function requireStringArray(value: unknown, field: string): string[] | undefined {
  if (value == null) return undefined;
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${field} must be a non-empty string array when provided`);
  if (!value.every((v) => typeof v === "string" && v.length > 0)) throw new Error(`${field} must be a non-empty string array when provided`);
  return value as string[];
}

function validateAnalyticsReportGetInput(input: unknown): AnalyticsReportGetInput {
  if (!isRecord(input)) throw new Error("analytics.report.get input must be an object");

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

  if (input.dateRangeStart == null && input.startDate == null) {
    throw new Error("dateRangeStart is required");
  }

  const dateRangeStart = parseDateParts(input.dateRangeStart ?? input.startDate, "dateRangeStart");
  const dateRangeEnd =
    input.dateRangeEnd != null || input.endDate != null
      ? parseDateParts(input.dateRangeEnd ?? input.endDate, "dateRangeEnd")
      : undefined;

  let fields: string[] | undefined;
  if (Array.isArray(input.fields)) {
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
    timeGranularity,
    dateRangeStart,
    dateRangeEnd,
    fields,
  };
}

// Re-export normalizers used by fixture tests
export { normalizeCampaignGroup, normalizeCreative, normalizeAnalyticsRow };
