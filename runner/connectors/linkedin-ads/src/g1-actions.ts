// linkedin-ads G1: management core (v0.6.0, +15 ops).
//
// Every call goes through the connector client (LinkedIn-Version 202609,
// X-Restli-Protocol-Version 2.0.0 via withRestliHeaders), Rest.li 2.0 query
// strings are built by hand (structure raw, leaves encoded once by enc()), and
// failures map through liAdsFailure (per-op requiredScopes).
// Docs: Microsoft Learn LinkedIn Marketing, view=li-lms-2026-09.

import { createLinkedInAdsClient } from "./http";
import { normalizeCreative, parseAdAccountsResponse, parseCampaignsResponse } from "./objects";
import { adAccountId, liAdsFailure, numericId } from "./g1-runtime";
import { enc, isRecord, money, pageSize, pageTokenValue, qs, restliExpression } from "./restli";

type Input = Record<string, unknown>;
type ActionResult = Record<string, unknown> | Promise<Record<string, unknown>>;
type Pairs = Array<[string, string]>;
type Response = { status: number; headers: Record<string, string>; body: unknown };

const CONNECTOR = "linkedin-ads";
const ACCOUNT_URN = "urn:li:sponsoredAccount:";
const GROUP_URN = "urn:li:sponsoredCampaignGroup:";
const CAMPAIGN_URN = "urn:li:sponsoredCampaign:";
const CREATIVE_URN = "urn:li:sponsoredCreative:";

export const CAMPAIGN_GROUP_SEARCH_STATUSES = ["ACTIVE", "ARCHIVED", "CANCELED", "DRAFT", "PAUSED", "PENDING_DELETION", "REMOVED"] as const;
export const CAMPAIGN_SEARCH_STATUSES = ["ACTIVE", "PAUSED", "ARCHIVED", "COMPLETED", "CANCELED", "DRAFT", "PENDING_DELETION", "REMOVED"] as const;
export const ACCOUNT_SEARCH_STATUSES = ["ACTIVE", "CANCELED", "DRAFT", "PENDING_DELETION", "REMOVED"] as const;
const ACCOUNT_TYPES = ["BUSINESS", "ENTERPRISE"] as const;
const CAMPAIGN_TYPES = ["TEXT_AD", "SPONSORED_UPDATES", "SPONSORED_INMAILS", "DYNAMIC"] as const;
const COST_TYPES = ["CPM", "CPC", "CPV"] as const;
const OBJECTIVES = ["BRAND_AWARENESS", "ENGAGEMENT", "JOB_APPLICANTS", "LEAD_GENERATION", "WEBSITE_CONVERSIONS", "WEBSITE_VISITS", "VIDEO_VIEWS"] as const;
const GROUP_OBJECTIVES = ["BRAND_AWARENESS", "ENGAGEMENT", "JOB_APPLICANTS", "LEAD_GENERATION", "WEBSITE_CONVERSIONS", "WEBSITE_VISIT", "VIDEO_VIEWS"] as const;
export const GROUP_CREATE_STATUSES = ["ACTIVE", "DRAFT"] as const;
export const GROUP_UPDATE_STATUSES = ["ACTIVE", "ARCHIVED", "DRAFT", "PAUSED"] as const;
export const CAMPAIGN_CREATE_STATUSES = ["ACTIVE", "PAUSED", "DRAFT"] as const;
export const CAMPAIGN_UPDATE_STATUSES = ["ACTIVE", "PAUSED", "ARCHIVED", "DRAFT"] as const;
export const CREATIVE_CREATE_STATUSES = ["ACTIVE", "PAUSED", "DRAFT"] as const;
export const CREATIVE_UPDATE_STATUSES = ["ACTIVE", "PAUSED", "ARCHIVED", "DRAFT"] as const;
const CREATIVE_SELECTIONS = ["ROUND_ROBIN", "OPTIMIZED"] as const;
const POLITICAL_INTENTS = ["POLITICAL", "NOT_POLITICAL", "NOT_DECLARED"] as const;
const CTA_LABELS = ["APPLY", "DOWNLOAD", "VIEW_QUOTE", "LEARN_MORE", "SIGN_UP", "SUBSCRIBE", "REGISTER", "REQUEST_DEMO", "JOIN", "ATTEND", "UNLOCK_FULL_DOCUMENT"] as const;
const PRICING_CAMPAIGN_TYPES = ["TEXT_AD", "SPONSORED_UPDATES", "SPONSORED_INMAILS"] as const;
const MATCH_TYPES = ["EXACT", "AUDIENCE_EXPANDED"] as const;
const PRICING_OBJECTIVES = ["VIDEO_VIEW", "LEAD_GENERATION", "WEBSITE_CONVERSION", "BRAND_AWARENESS", "WEBSITE_VISIT", "ENGAGEMENT", "WEBSITE_TRAFFIC", "CREATIVE_ENGAGEMENT", "JOB_APPLICATION", "TALENT_LEAD"] as const;
const SORT_ORDERS = ["ASCENDING", "DESCENDING"] as const;

// ---------------------------------------------------------------------------
// shared helpers
// ---------------------------------------------------------------------------

function result(action: string, extra: Record<string, unknown>): Record<string, unknown> {
  return { connector: CONNECTOR, action, source: "connector", ...extra };
}

function requireRecord(value: unknown, action: string): Input {
  if (!isRecord(value)) throw new Error(`${action} input must be an object`);
  return value;
}

function hasLiveAuth(input: Input): boolean {
  return typeof input.accessToken === "string" && input.accessToken.length > 0;
}

async function call(input: Input, operation: string, path: string, init: RequestInit = {}): Promise<Response> {
  return createLinkedInAdsClient({
    accessToken: String(input.accessToken),
    fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    operation,
  }).fetchJSON(path, init);
}

async function expectOk(input: Input, operation: string, path: string, init: RequestInit = {}): Promise<Response> {
  const response = await call(input, operation, path, init);
  if (response.status < 200 || response.status >= 300) throw liAdsFailure(operation, response.status, response.body, response.headers);
  return response;
}

function header(headers: Record<string, string>, name: string): string | undefined {
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) if (key.toLowerCase() === wanted && value) return value;
  return undefined;
}

function oneOf<T extends string>(value: unknown, field: string, allowed: readonly T[], required = false): T | undefined {
  if (value === undefined) {
    if (required) throw new Error(`${field} is required`);
    return undefined;
  }
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    throw new Error(`${field} must be one of ${allowed.join(", ")}`);
  }
  return value as T;
}

function text(value: unknown, field: string, max: number, required = false): string | undefined {
  if (value === undefined) {
    if (required) throw new Error(`${field} is required`);
    return undefined;
  }
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${field} must be a non-empty string`);
  if (new TextEncoder().encode(value).byteLength > max) throw new Error(`${field} must be at most ${max} bytes`);
  return value;
}

function bool(value: unknown, field: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new Error(`${field} must be a boolean`);
  return value;
}

/** Money body value {amount:"decimal string", currencyCode:"ISO"} (LinkedIn returns money as strings). */
function moneyBody(value: unknown, field: string): { amount: string; currencyCode: string } | undefined {
  if (value === undefined) return undefined;
  money(value, field);
  const record = value as Input;
  return { amount: String(record.amount), currencyCode: String(record.currencyCode) };
}

function runSchedule(value: unknown, field = "runSchedule", required = false): { start: number; end?: number } | undefined {
  if (value === undefined) {
    if (required) throw new Error(`${field} is required`);
    return undefined;
  }
  if (!isRecord(value)) throw new Error(`${field} must be an object`);
  const { start, end } = value;
  if (typeof start !== "number" || !Number.isSafeInteger(start) || start < 0) throw new Error(`${field}.start must be epoch milliseconds`);
  if (end !== undefined && (typeof end !== "number" || !Number.isSafeInteger(end) || end <= start)) {
    throw new Error(`${field}.end must be epoch milliseconds after start`);
  }
  return end === undefined ? { start } : { start, end };
}

function urn(value: unknown, field: string, prefix: string): string {
  return `${prefix}${numericId(value, field, prefix)}`;
}

function idFromRestliHeader(headers: Record<string, string>, prefix: string): string | null {
  const raw = header(headers, "x-restli-id") ?? header(headers, "x-linkedin-id");
  if (!raw) return null;
  const decoded = raw.includes("%3A") ? decodeURIComponent(raw) : raw;
  const id = decoded.startsWith(prefix) ? decoded.slice(prefix.length) : decoded;
  return /^[0-9]{1,20}$/.test(id) ? id : null;
}

function interfaceLocalesPresent(criteria: Input): boolean {
  return JSON.stringify(criteria).includes("urn:li:adTargetingFacet:interfaceLocales");
}

/**
 * One "or" facet map: keys are adTargetingFacet URNs, values are non-empty arrays of
 * entity URN strings. Facet keys are not restricted (LinkedIn validates them).
 */
function facetMap(value: unknown, field: string, allowEmpty: boolean): void {
  if (!isRecord(value)) throw new Error(`${field} must be an object of facet URN -> value URNs`);
  const entries = Object.entries(value);
  if (!allowEmpty && entries.length === 0) throw new Error(`${field} must name at least one facet`);
  for (const [facet, values] of entries) {
    if (!Array.isArray(values) || values.length === 0 || values.some((item) => typeof item !== "string" || item === "")) {
      throw new Error(`${field}.${facet} must be a non-empty array of URN strings`);
    }
  }
}

/**
 * targetingCriteria body object (campaigns.create / update). Bing geo only; interfaceLocales required.
 * Structure per the targetingCriteria reference (li-lms-2026-09): include holds a single "and"
 * array of {or:{facet:[values]}} clauses and cannot be empty; exclude holds a single "or" object
 * and may be empty. Mirrors the manifest inputSchema so direct calls get the same checks.
 * https://learn.microsoft.com/en-us/linkedin/shared/references/v2/ads/targeting-criteria?view=li-lms-2026-09
 */
function targetingCriteriaBody(value: unknown, field = "targetingCriteria", required = false): Input | undefined {
  if (value === undefined) {
    if (required) throw new Error(`${field} is required`);
    return undefined;
  }
  if (!isRecord(value) || !isRecord(value.include)) throw new Error(`${field}.include is required`);
  const encoded = JSON.stringify(value);
  if (encoded.length > 32_000) throw new Error(`${field} is too large`);
  if (!interfaceLocalesPresent(value)) throw new Error(`${field} must include the urn:li:adTargetingFacet:interfaceLocales facet`);
  for (const key of Object.keys(value)) if (key !== "include" && key !== "exclude") throw new Error(`${field}.${key} is not a targetingCriteria field (include, exclude)`);
  const include = value.include as Input;
  for (const key of Object.keys(include)) if (key !== "and") throw new Error(`${field}.include only holds an "and" array`);
  if (!Array.isArray(include.and) || include.and.length === 0) throw new Error(`${field}.include.and must contain at least one clause`);
  include.and.forEach((clause, index) => {
    const path = `${field}.include.and[${index}]`;
    if (!isRecord(clause) || Object.keys(clause).some((key) => key !== "or") || clause.or === undefined) throw new Error(`${path} must be {"or": {facetUrn: [values]}}`);
    facetMap(clause.or, `${path}.or`, false);
  });
  if (value.exclude !== undefined) {
    const exclude = value.exclude;
    if (!isRecord(exclude) || Object.keys(exclude).some((key) => key !== "or")) throw new Error(`${field}.exclude only holds an "or" object`);
    if (exclude.or !== undefined) facetMap(exclude.or, `${field}.exclude.or`, true);
  }
  return value;
}

function searchClause(field: string, values: readonly string[]): string {
  return `${field}:(values:List(${values.map(enc).join(",")}))`;
}

function stringArray(value: unknown, field: string, max = 50): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length < 1 || value.length > max) throw new Error(`${field} must contain 1 to ${max} values`);
  return value.map((item) => {
    if (typeof item !== "string" || item.trim() === "" || item.length > 200) throw new Error(`${field} must contain non-empty strings`);
    return item.trim();
  });
}

function enumArray<T extends string>(value: unknown, field: string, allowed: readonly T[]): T[] | undefined {
  const items = stringArray(value, field, allowed.length);
  if (!items) return undefined;
  for (const item of items) if (!(allowed as readonly string[]).includes(item)) throw new Error(`${field} must contain only ${allowed.join(", ")}`);
  return items as T[];
}

function cursorPairs(input: Input, pairs: Pairs, max: number): void {
  const size = pageSize(input.pageSize, "pageSize", max);
  if (size) pairs.push(["pageSize", size]);
  const token = pageTokenValue(input.pageToken);
  if (token) pairs.push(["pageToken", token]);
  const sort = oneOf(input.sortOrder, "sortOrder", SORT_ORDERS);
  if (sort) pairs.push(["sortOrder", sort]);
}

function nextPageToken(body: unknown): string | null {
  if (isRecord(body) && isRecord(body.metadata) && typeof body.metadata.nextPageToken === "string" && body.metadata.nextPageToken !== "") {
    return body.metadata.nextPageToken;
  }
  return null;
}

function elements(body: unknown): Input[] {
  return isRecord(body) && Array.isArray(body.elements) ? body.elements.filter(isRecord) : [];
}

// ---------------------------------------------------------------------------
// 1. ad_accounts.search — ACC Search for Accounts (cursor, pageSize <= 1000)
// ---------------------------------------------------------------------------

export function searchAdAccounts(value: unknown): ActionResult {
  const input = requireRecord(value, "ad_accounts.search");
  const clauses: string[] = [];
  const status = enumArray(input.status, "status", ACCOUNT_SEARCH_STATUSES);
  if (status) clauses.push(searchClause("status", status));
  const type = enumArray(input.type, "type", ACCOUNT_TYPES);
  if (type) clauses.push(searchClause("type", type));
  const name = stringArray(input.name, "name");
  if (name) clauses.push(searchClause("name", name));
  const ids = input.id === undefined ? undefined : stringArray(input.id, "id")!.map((id) => `${ACCOUNT_URN}${adAccountId(id, "id")}`);
  if (ids) clauses.push(searchClause("id", ids));
  const reference = stringArray(input.reference, "reference");
  if (reference?.some((ref) => !/^urn:li:(organization|person):[A-Za-z0-9_-]{1,64}$/.test(ref))) throw new Error("reference must contain organization or person URNs");
  if (reference) clauses.push(searchClause("reference", reference));
  const test = bool(input.test, "test");
  // test is a scalar (test:true), not a values list (ACC Search Parameters).
  if (test !== undefined) clauses.push(`test:${test}`);
  // ACC: "If a search query is omitted, all accounts the caller has access to are returned."
  const pairs: Pairs = [["q", "search"]];
  if (clauses.length) pairs.push(["search", `(${clauses.join(",")})`]);
  cursorPairs(input, pairs, 1000);
  if (!hasLiveAuth(input)) return result("ad_accounts.search", { adAccounts: [], nextPageToken: null, validated: { query: qs(pairs) } });
  return expectOk(input, "ad_accounts.search", `/rest/adAccounts?${qs(pairs)}`, { method: "GET", headers: { "X-RestLi-Method": "FINDER" } }).then((response) => {
    const parsed = parseAdAccountsResponse(response.body);
    return result("ad_accounts.search", { adAccounts: parsed.adAccounts, nextPageToken: parsed.nextPageToken });
  });
}

// ---------------------------------------------------------------------------
// 2. campaigns.search — CMP Search for Campaigns (criteria mandatory, cursor)
// ---------------------------------------------------------------------------

export function searchCampaigns(value: unknown): ActionResult {
  const input = requireRecord(value, "campaigns.search");
  const accountId = adAccountId(input.accountId);
  const clauses: string[] = [];
  const groups = input.campaignGroups === undefined ? undefined : stringArray(input.campaignGroups, "campaignGroups")!.map((id) => urn(id, "campaignGroups", GROUP_URN));
  if (groups) clauses.push(searchClause("campaignGroup", groups));
  const ids = input.ids === undefined ? undefined : stringArray(input.ids, "ids")!.map((id) => urn(id, "ids", CAMPAIGN_URN));
  if (ids) clauses.push(searchClause("id", ids));
  const name = stringArray(input.name, "name");
  if (name) clauses.push(searchClause("name", name));
  const type = enumArray(input.type, "type", CAMPAIGN_TYPES);
  if (type) clauses.push(searchClause("type", type));
  // CMP: "Search criteria is mandatory". Without a caller status filter, send every
  // documented search.status.values value so the search still returns all campaigns.
  const status = enumArray(input.status, "status", CAMPAIGN_SEARCH_STATUSES) ?? [...CAMPAIGN_SEARCH_STATUSES];
  clauses.push(searchClause("status", status));
  const test = bool(input.test, "test");
  if (test !== undefined) clauses.push(`test:${test}`);
  const pairs: Pairs = [["q", "search"], ["search", `(${clauses.join(",")})`]];
  cursorPairs(input, pairs, 1000);
  if (!hasLiveAuth(input)) return result("campaigns.search", { campaigns: [], nextPageToken: null, validated: { accountId } });
  return expectOk(input, "campaigns.search", `/rest/adAccounts/${accountId}/adCampaigns?${qs(pairs)}`, { method: "GET", headers: { "X-RestLi-Method": "FINDER" } }).then((response) => {
    const parsed = parseCampaignsResponse(response.body);
    return result("campaigns.search", { campaigns: parsed.campaigns, nextPageToken: parsed.nextPageToken });
  });
}

// ---------------------------------------------------------------------------
// 3-4. ad_account_users.list_mine / ad_account_users.list — USERS finders
// ---------------------------------------------------------------------------

function accountUser(element: Input): Record<string, unknown> {
  return {
    account: typeof element.account === "string" ? element.account : null,
    user: typeof element.user === "string" ? element.user : null,
    role: typeof element.role === "string" ? element.role : null,
    raw: element,
  };
}

export function listMyAdAccountUsers(value: unknown): ActionResult {
  const input = requireRecord(value, "ad_account_users.list_mine");
  if (!hasLiveAuth(input)) return result("ad_account_users.list_mine", { accountUsers: [], validated: {} });
  return expectOk(input, "ad_account_users.list_mine", "/rest/adAccountUsers?q=authenticatedUser", { method: "GET", headers: { "X-RestLi-Method": "FINDER" } }).then((response) => {
    return result("ad_account_users.list_mine", { accountUsers: elements(response.body).map(accountUser) });
  });
}

export function listAdAccountUsers(value: unknown): ActionResult {
  const input = requireRecord(value, "ad_account_users.list");
  const accountId = adAccountId(input.accountId);
  // USERS: "supports searching users by only a single ad account".
  const pairs: Pairs = [["q", "accounts"], ["accounts", enc(`${ACCOUNT_URN}${accountId}`)]];
  if (!hasLiveAuth(input)) return result("ad_account_users.list", { accountUsers: [], validated: { accountId } });
  return expectOk(input, "ad_account_users.list", `/rest/adAccountUsers?${qs(pairs)}`, { method: "GET", headers: { "X-RestLi-Method": "FINDER" } }).then((response) => {
    return result("ad_account_users.list", { accountUsers: elements(response.body).map(accountUser) });
  });
}

// ---------------------------------------------------------------------------
// 5. creatives.get — CRE Get a Creative (whole URN path key, encoded once)
// ---------------------------------------------------------------------------

function creativePath(accountId: string, creativeId: string): string {
  return `/rest/adAccounts/${accountId}/creatives/${enc(`${CREATIVE_URN}${creativeId}`)}`;
}

export function getCreative(value: unknown): ActionResult {
  const input = requireRecord(value, "creatives.get");
  const accountId = adAccountId(input.accountId);
  const creativeId = numericId(input.creativeId, "creativeId", CREATIVE_URN);
  if (!hasLiveAuth(input)) return result("creatives.get", { creative: null, validated: { accountId, creativeId } });
  // Default GET, no fields projection: it already returns every field creatives.update can change.
  return expectOk(input, "creatives.get", creativePath(accountId, creativeId), { method: "GET" }).then((response) => {
    if (!isRecord(response.body)) throw liAdsFailure("creatives.get", 502, response.body);
    return result("creatives.get", { creative: normalizeCreative(response.body) });
  });
}

// ---------------------------------------------------------------------------
// 6. budget_pricing.get — BUD Find Pricing Insights by CriteriaV2 (one-shot)
// ---------------------------------------------------------------------------

export function getBudgetPricing(value: unknown): ActionResult {
  const input = requireRecord(value, "budget_pricing.get");
  const accountId = adAccountId(input.accountId);
  const campaignType = oneOf(input.campaignType, "campaignType", PRICING_CAMPAIGN_TYPES, true)!;
  const bidType = oneOf(input.bidType, "bidType", COST_TYPES, true)!;
  const matchType = oneOf(input.matchType, "matchType", MATCH_TYPES, true)!;
  if (typeof input.targetingCriteria !== "string" || input.targetingCriteria.trim() === "") throw new Error("targetingCriteria is required");
  const targetingCriteria = restliExpression(input.targetingCriteria.trim(), "targetingCriteria");
  const pairs: Pairs = [
    ["q", "criteriaV2"],
    ["account", enc(`${ACCOUNT_URN}${accountId}`)],
    ["campaignType", campaignType],
    ["bidType", bidType],
    ["matchType", matchType],
    ["targetingCriteria", targetingCriteria],
  ];
  const objectiveType = oneOf(input.objectiveType, "objectiveType", PRICING_OBJECTIVES);
  if (objectiveType) pairs.push(["objectiveType", objectiveType]);
  if (input.optimizationTargetType !== undefined) {
    if (typeof input.optimizationTargetType !== "string" || !/^[A-Z_]{1,64}$/.test(input.optimizationTargetType)) throw new Error("optimizationTargetType must be an uppercase enum value");
    pairs.push(["optimizationTargetType", input.optimizationTargetType]);
  }
  const daily = money(input.dailyBudget, "dailyBudget");
  if (daily) pairs.push(["dailyBudget", daily]);
  if (input.currency !== undefined) {
    if (typeof input.currency !== "string" || !/^[A-Z]{3}$/.test(input.currency)) throw new Error("currency must be an ISO-4217 code");
    pairs.push(["currency", input.currency]);
  }
  if (input.countryCode !== undefined) {
    if (typeof input.countryCode !== "string" || !/^[a-z]{2}$/.test(input.countryCode)) throw new Error("countryCode must be a two-letter lower-case country code");
    pairs.push(["countryCode", input.countryCode]);
  }
  if (!hasLiveAuth(input)) return result("budget_pricing.get", { pricing: null, validated: { accountId, campaignType, bidType, matchType } });
  return expectOk(input, "budget_pricing.get", `/rest/adBudgetPricing?${qs(pairs)}`, { method: "GET", headers: { "X-RestLi-Method": "FINDER" } }).then((response) => {
    // BUD: "the returned collection contains only one element of pricing information".
    return result("budget_pricing.get", { pricing: elements(response.body)[0] ?? null });
  });
}

// ---------------------------------------------------------------------------
// 7-9. creates — 201 Created, new id in the x-restli-id response header
// ---------------------------------------------------------------------------

export function createCampaignGroup(value: unknown): ActionResult {
  const input = requireRecord(value, "campaign_groups.create");
  const accountId = adAccountId(input.accountId);
  const body: Input = {
    account: `${ACCOUNT_URN}${accountId}`,
    name: text(input.name, "name", 200, true),
    runSchedule: runSchedule(input.runSchedule, "runSchedule", true),
    status: oneOf(input.status, "status", GROUP_CREATE_STATUSES, true),
  };
  const totalBudget = moneyBody(input.totalBudget, "totalBudget");
  if (totalBudget) {
    if (body.runSchedule && (body.runSchedule as { end?: number }).end === undefined) throw new Error("runSchedule.end is required when totalBudget is set");
    body.totalBudget = totalBudget;
  }
  const objectiveType = oneOf(input.objectiveType, "objectiveType", GROUP_OBJECTIVES);
  if (objectiveType) body.objectiveType = objectiveType;
  if (!hasLiveAuth(input)) return result("campaign_groups.create", { campaignGroupId: null, campaignGroupUrn: null, validated: body });
  return expectOk(input, "campaign_groups.create", `/rest/adAccounts/${accountId}/adCampaignGroups`, { method: "POST", body: JSON.stringify(body) }).then((response) => {
    const id = idFromRestliHeader(response.headers, GROUP_URN);
    return result("campaign_groups.create", { campaignGroupId: id, campaignGroupUrn: id ? `${GROUP_URN}${id}` : null });
  });
}

export function createCampaign(value: unknown): ActionResult {
  const input = requireRecord(value, "campaigns.create");
  const accountId = adAccountId(input.accountId);
  const dailyBudget = moneyBody(input.dailyBudget, "dailyBudget");
  const totalBudget = moneyBody(input.totalBudget, "totalBudget");
  if (!dailyBudget && !totalBudget) throw new Error("dailyBudget or totalBudget is required");
  if (!isRecord(input.locale)) throw new Error("locale is required");
  const country = input.locale.country;
  const language = input.locale.language;
  if (typeof country !== "string" || !/^[A-Z]{2}$/.test(country) || typeof language !== "string" || !/^[a-z]{2}$/.test(language)) {
    throw new Error("locale must be {country: ISO-3166 upper-case, language: ISO-639 lower-case}");
  }
  const body: Input = {
    account: `${ACCOUNT_URN}${accountId}`,
    campaignGroup: urn(input.campaignGroup, "campaignGroup", GROUP_URN),
    name: text(input.name, "name", 255, true),
    type: oneOf(input.type, "type", CAMPAIGN_TYPES, true),
    costType: oneOf(input.costType, "costType", COST_TYPES, true),
    unitCost: moneyBody(input.unitCost, "unitCost"),
    locale: { country, language },
    targetingCriteria: targetingCriteriaBody(input.targetingCriteria, "targetingCriteria", true),
    status: oneOf(input.status, "status", CAMPAIGN_CREATE_STATUSES, true),
    offsiteDeliveryEnabled: bool(input.offsiteDeliveryEnabled, "offsiteDeliveryEnabled"),
    politicalIntent: oneOf(input.politicalIntent, "politicalIntent", POLITICAL_INTENTS, true),
  };
  if (body.unitCost === undefined) throw new Error("unitCost is required");
  if (body.offsiteDeliveryEnabled === undefined) throw new Error("offsiteDeliveryEnabled is required");
  if (dailyBudget) body.dailyBudget = dailyBudget;
  if (totalBudget) body.totalBudget = totalBudget;
  const schedule = runSchedule(input.runSchedule);
  if (schedule) body.runSchedule = schedule;
  const audienceExpansionEnabled = bool(input.audienceExpansionEnabled, "audienceExpansionEnabled");
  if (audienceExpansionEnabled !== undefined) body.audienceExpansionEnabled = audienceExpansionEnabled;
  const objectiveType = oneOf(input.objectiveType, "objectiveType", OBJECTIVES);
  if (objectiveType) body.objectiveType = objectiveType;
  if (input.optimizationTargetType !== undefined) {
    if (typeof input.optimizationTargetType !== "string" || !/^[A-Z_]{1,64}$/.test(input.optimizationTargetType)) throw new Error("optimizationTargetType must be an uppercase enum value");
    body.optimizationTargetType = input.optimizationTargetType;
  }
  const creativeSelection = oneOf(input.creativeSelection, "creativeSelection", CREATIVE_SELECTIONS);
  if (creativeSelection) body.creativeSelection = creativeSelection;
  if (input.associatedEntity !== undefined) {
    if (typeof input.associatedEntity !== "string" || !/^urn:li:(organization|person):[A-Za-z0-9_-]{1,64}$/.test(input.associatedEntity)) {
      throw new Error("associatedEntity must be an organization or person URN");
    }
    body.associatedEntity = input.associatedEntity;
  }
  if (!hasLiveAuth(input)) return result("campaigns.create", { campaignId: null, campaignUrn: null, validated: body });
  return expectOk(input, "campaigns.create", `/rest/adAccounts/${accountId}/adCampaigns`, { method: "POST", body: JSON.stringify(body) }).then((response) => {
    const id = idFromRestliHeader(response.headers, CAMPAIGN_URN);
    return result("campaigns.create", { campaignId: id, campaignUrn: id ? `${CAMPAIGN_URN}${id}` : null });
  });
}

export function createCreative(value: unknown): ActionResult {
  const input = requireRecord(value, "creatives.create");
  const accountId = adAccountId(input.accountId);
  const reference = input.contentReference;
  if (typeof reference !== "string" || !/^urn:li:(share|ugcPost|adInMailContent):[0-9]{1,25}$/.test(reference)) {
    throw new Error("contentReference must be a urn:li:share, urn:li:ugcPost or urn:li:adInMailContent URN");
  }
  const body: Input = {
    content: { reference },
    campaign: urn(input.campaign, "campaign", CAMPAIGN_URN),
    intendedStatus: oneOf(input.intendedStatus, "intendedStatus", CREATIVE_CREATE_STATUSES, true),
  };
  const name = text(input.name, "name", 255);
  if (name) body.name = name;
  if (input.leadgenCallToAction !== undefined) {
    const cta = input.leadgenCallToAction;
    if (!isRecord(cta)) throw new Error("leadgenCallToAction must be an object");
    if (typeof cta.destination !== "string" || !/^urn:li:adForm:[0-9]{1,25}$/.test(cta.destination)) throw new Error("leadgenCallToAction.destination must be a urn:li:adForm URN");
    body.leadgenCallToAction = { destination: cta.destination, label: oneOf(cta.label, "leadgenCallToAction.label", CTA_LABELS, true) };
  }
  if (!hasLiveAuth(input)) return result("creatives.create", { creativeId: null, creativeUrn: null, validated: body });
  return expectOk(input, "creatives.create", `/rest/adAccounts/${accountId}/creatives`, { method: "POST", body: JSON.stringify(body) }).then((response) => {
    const id = idFromRestliHeader(response.headers, CREATIVE_URN);
    return result("creatives.create", { creativeId: id, creativeUrn: id ? `${CREATIVE_URN}${id}` : null });
  });
}

// ---------------------------------------------------------------------------
// 10-12. updates — POST + X-RestLi-Method: PARTIAL_UPDATE, {patch:{$set:{...}}}, 204.
// Effect Reconcile: the registry observes the matching get (default GET, no projection)
// and returns its output.
// ---------------------------------------------------------------------------

function partialUpdate(input: Input, operation: string, path: string, set: Input): Promise<Response> {
  return expectOk(input, operation, path, {
    method: "POST",
    headers: { "X-RestLi-Method": "PARTIAL_UPDATE" },
    body: JSON.stringify({ patch: { $set: set } }),
  });
}

function requireSet(set: Input, operation: string): Input {
  for (const key of Object.keys(set)) if (set[key] === undefined) delete set[key];
  if (Object.keys(set).length === 0) throw new Error(`${operation} needs at least one field to change`);
  return set;
}

export const CAMPAIGN_GROUP_MUTABLE_INPUTS = ["name", "status", "totalBudget", "runSchedule"] as const;
export const CAMPAIGN_MUTABLE_INPUTS = [
  "name", "status", "dailyBudget", "totalBudget", "unitCost", "runSchedule", "targetingCriteria",
  "audienceExpansionEnabled", "offsiteDeliveryEnabled",
] as const;
export const CREATIVE_MUTABLE_INPUTS = ["name", "intendedStatus"] as const;

export function updateCampaignGroup(value: unknown): ActionResult {
  const input = requireRecord(value, "campaign_groups.update");
  const accountId = adAccountId(input.accountId);
  const campaignGroupId = numericId(input.campaignGroupId, "campaignGroupId", GROUP_URN);
  const set = requireSet({
    name: text(input.name, "name", 200),
    status: oneOf(input.status, "status", GROUP_UPDATE_STATUSES),
    totalBudget: moneyBody(input.totalBudget, "totalBudget"),
    runSchedule: runSchedule(input.runSchedule),
  }, "campaign_groups.update");
  if (!hasLiveAuth(input)) return result("campaign_groups.update", { campaignGroup: null, validated: { accountId, campaignGroupId, patch: { $set: set } } });
  return partialUpdate(input, "campaign_groups.update", `/rest/adAccounts/${accountId}/adCampaignGroups/${campaignGroupId}`, set).then(() => {
    return result("campaign_groups.update", { campaignGroup: null, updated: Object.keys(set) });
  });
}

export function updateCampaign(value: unknown): ActionResult {
  const input = requireRecord(value, "campaigns.update");
  const accountId = adAccountId(input.accountId);
  const campaignId = numericId(input.campaignId, "campaignId", CAMPAIGN_URN);
  const set = requireSet({
    name: text(input.name, "name", 255),
    status: oneOf(input.status, "status", CAMPAIGN_UPDATE_STATUSES),
    dailyBudget: moneyBody(input.dailyBudget, "dailyBudget"),
    totalBudget: moneyBody(input.totalBudget, "totalBudget"),
    unitCost: moneyBody(input.unitCost, "unitCost"),
    runSchedule: runSchedule(input.runSchedule),
    targetingCriteria: targetingCriteriaBody(input.targetingCriteria),
    audienceExpansionEnabled: bool(input.audienceExpansionEnabled, "audienceExpansionEnabled"),
    offsiteDeliveryEnabled: bool(input.offsiteDeliveryEnabled, "offsiteDeliveryEnabled"),
  }, "campaigns.update");
  if (!hasLiveAuth(input)) return result("campaigns.update", { campaign: null, validated: { accountId, campaignId, patch: { $set: set } } });
  return partialUpdate(input, "campaigns.update", `/rest/adAccounts/${accountId}/adCampaigns/${campaignId}`, set).then(() => {
    return result("campaigns.update", { campaign: null, updated: Object.keys(set) });
  });
}

export function updateCreative(value: unknown): ActionResult {
  const input = requireRecord(value, "creatives.update");
  const accountId = adAccountId(input.accountId);
  const creativeId = numericId(input.creativeId, "creativeId", CREATIVE_URN);
  const set = requireSet({
    name: text(input.name, "name", 255),
    intendedStatus: oneOf(input.intendedStatus, "intendedStatus", CREATIVE_UPDATE_STATUSES),
  }, "creatives.update");
  if (!hasLiveAuth(input)) return result("creatives.update", { creative: null, validated: { accountId, creativeId, patch: { $set: set } } });
  return partialUpdate(input, "creatives.update", creativePath(accountId, creativeId), set).then(() => {
    return result("creatives.update", { creative: null, updated: Object.keys(set) });
  });
}

// ---------------------------------------------------------------------------
// 13-15. deletes — DELETE for DRAFT, else PARTIAL_UPDATE to PENDING_DELETION (effect omitted)
// ---------------------------------------------------------------------------

const ALREADY_DELETED = new Set(["PENDING_DELETION", "REMOVED"]);

async function deleteFlow(
  input: Input,
  operation: string,
  path: string,
  statusField: "status" | "intendedStatus",
  extra: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const current = await expectOk(input, operation, path, { method: "GET" });
  const previousStatus = isRecord(current.body) && typeof current.body[statusField] === "string" ? current.body[statusField] as string : null;
  if (previousStatus && ALREADY_DELETED.has(previousStatus)) {
    return result(operation, { ...extra, previousStatus, method: "NONE", status: previousStatus });
  }
  if (previousStatus === "DRAFT") {
    await expectOk(input, operation, path, { method: "DELETE", headers: { "X-RestLi-Method": "DELETE" } });
    return result(operation, { ...extra, previousStatus, method: "DELETE", status: "DELETED" });
  }
  await partialUpdate(input, operation, path, { [statusField]: "PENDING_DELETION" });
  return result(operation, { ...extra, previousStatus, method: "PENDING_DELETION", status: "PENDING_DELETION" });
}

export function deleteCampaignGroup(value: unknown): ActionResult {
  const input = requireRecord(value, "campaign_groups.delete");
  const accountId = adAccountId(input.accountId);
  const campaignGroupId = numericId(input.campaignGroupId, "campaignGroupId", GROUP_URN);
  if (!hasLiveAuth(input)) return result("campaign_groups.delete", { campaignGroupId, validated: { accountId, campaignGroupId } });
  return deleteFlow(input, "campaign_groups.delete", `/rest/adAccounts/${accountId}/adCampaignGroups/${campaignGroupId}`, "status", { campaignGroupId });
}

export function deleteCampaign(value: unknown): ActionResult {
  const input = requireRecord(value, "campaigns.delete");
  const accountId = adAccountId(input.accountId);
  const campaignId = numericId(input.campaignId, "campaignId", CAMPAIGN_URN);
  if (!hasLiveAuth(input)) return result("campaigns.delete", { campaignId, validated: { accountId, campaignId } });
  return deleteFlow(input, "campaigns.delete", `/rest/adAccounts/${accountId}/adCampaigns/${campaignId}`, "status", { campaignId });
}

export function deleteCreative(value: unknown): ActionResult {
  const input = requireRecord(value, "creatives.delete");
  const accountId = adAccountId(input.accountId);
  const creativeId = numericId(input.creativeId, "creativeId", CREATIVE_URN);
  if (!hasLiveAuth(input)) return result("creatives.delete", { creativeId, validated: { accountId, creativeId } });
  return deleteFlow(input, "creatives.delete", creativePath(accountId, creativeId), "intendedStatus", { creativeId });
}

