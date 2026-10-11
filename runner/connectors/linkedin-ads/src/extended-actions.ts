import { createLinkedInAdsClient } from "./http";
import {
  asId,
  assertToken,
  enc,
  isRecord,
  money,
  pageSize,
  pageStart,
  qs,
  resourceId,
  restliExpression,
  restliList,
  sponsoredAccount,
  stringList,
} from "./restli";

type Input = Record<string, unknown>;
type ActionResult = Record<string, unknown> | Promise<Record<string, unknown>>;

const CONNECTOR = "linkedin-ads";
const FINDERS = new Set(["adTargetingFacet", "typeahead", "urns", "similarEntities"]);
const CAMPAIGN_TYPES = new Set(["SPONSORED_UPDATES", "SPONSORED_INMAILS", "DYNAMIC"]);
const URN = /^urn:li:[A-Za-z0-9_]+:[A-Za-z0-9_()%,:-]{1,200}$/;

function result(action: string, extra: Record<string, unknown>): Record<string, unknown> {
  return { connector: CONNECTOR, action, source: "connector", ...extra };
}

function hasLiveAuth(input: Input): boolean {
  return typeof input.accessToken === "string" && input.accessToken.length > 0;
}

function upstream(status: number): Error {
  if (status === 429) {
    return Object.assign(new Error("LinkedIn Ads rate limit exceeded."), { code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 30 });
  }
  return Object.assign(new Error("LinkedIn Ads rejected the request."), { code: "CONNECTOR_UPSTREAM_ERROR" });
}

async function get(input: Input, operation: string, path: string, headers?: Record<string, string>) {
  const response = await createLinkedInAdsClient({
    accessToken: String(input.accessToken),
    fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    operation,
  }).fetchJSON(path, { method: "GET", headers });
  if (response.status < 200 || response.status >= 300 || !isRecord(response.body)) throw upstream(response.status);
  return response.body;
}

function elements(body: Input): unknown[] {
  if (Array.isArray(body.elements)) return body.elements;
  if (isRecord(body.results)) return Object.values(body.results);
  return [];
}

function requireRecord(value: unknown, action: string): Input {
  if (!isRecord(value)) throw new Error(`${action} input must be an object`);
  return value;
}

function firstId(input: Input, keys: string[], field: string): string {
  for (const key of keys) {
    const id = asId(input[key]);
    if (id) return id;
  }
  throw new Error(`${field} is required`);
}

function urnList(value: unknown, field: string, prefix?: string): string[] | undefined {
  const items = stringList(value, field, URN, 100);
  if (!items) return undefined;
  return items.map((item) => {
    if (prefix && !item.startsWith(prefix)) throw new Error(`${field} must be ${prefix} URNs`);
    return item;
  });
}

export function getCampaignGroup(value: unknown): ActionResult {
  const input = requireRecord(value, "campaign_groups.get");
  const accountId = resourceId(firstId(input, ["accountId", "ad_account_id", "adAccountId"], "accountId"), ["urn:li:sponsoredAccount:"]);
  const campaignGroupId = resourceId(firstId(input, ["campaignGroupId", "ad_campaign_group_id", "adCampaignGroupId"], "campaignGroupId"), ["urn:li:sponsoredCampaignGroup:"]);
  const validated = { accountId, campaignGroupId };
  if (!hasLiveAuth(input)) return result("campaign_groups.get", { campaignGroup: null, validated });
  return get(input, "campaign_groups.get", `/rest/adAccounts/${accountId}/adCampaignGroups/${campaignGroupId}`).then((body) => {
    return result("campaign_groups.get", { campaignGroup: body });
  });
}

export function getAudienceCounts(value: unknown): ActionResult {
  const input = requireRecord(value, "audience_counts.get");
  const targeting = input.targetingCriteria ?? input.targeting_criteria;
  if (typeof targeting !== "string" || targeting.trim() === "") throw new Error("targetingCriteria is required");
  const targetingCriteria = restliExpression(targeting.trim(), "targetingCriteria");
  const validated = { targetingCriteria };
  if (!hasLiveAuth(input)) return result("audience_counts.get", { audienceCounts: [], validated });
  const path = `/rest/audienceCounts?${qs([["q", "targetingCriteriaV2"], ["targetingCriteria", targetingCriteria]])}`;
  return get(input, "audience_counts.get", path, { "X-RestLi-Method": "FINDER" }).then((body) => {
    return result("audience_counts.get", { audienceCounts: elements(body) });
  });
}

export function listTargetingFacets(value: unknown): ActionResult {
  const input = requireRecord(value, "targeting.facets.list");
  if (!hasLiveAuth(input)) return result("targeting.facets.list", { facets: [], validated: {} });
  return get(input, "targeting.facets.list", "/rest/adTargetingFacets").then((body) => {
    return result("targeting.facets.list", { facets: elements(body) });
  });
}

export function listTargetingEntities(value: unknown): ActionResult {
  const input = requireRecord(value, "targeting.entities.list");
  const legacyEntities = input.entityUrns ?? input.entities;
  const qRaw = typeof input.q === "string" ? input.q : legacyEntities !== undefined && input.urns === undefined && input.query === undefined ? "similarEntities" : "";
  if (!FINDERS.has(qRaw)) throw new Error("q must be adTargetingFacet, typeahead, urns, or similarEntities");
  const facetRaw = input.facet ?? input.facetUrn;
  const facet = typeof facetRaw === "string" && facetRaw !== "" ? facetRaw : undefined;
  if ((qRaw === "adTargetingFacet" || qRaw === "typeahead" || qRaw === "similarEntities") && !facet) throw new Error("facet is required");
  if (facet && !URN.test(facet)) throw new Error("facet must be an adTargetingFacet URN");
  const query = typeof input.query === "string" ? input.query.trim() : undefined;
  if (qRaw === "typeahead" && (!query || query.length > 200 || /[&?#]/.test(query))) throw new Error("query is required");
  const entities = urnList(legacyEntities, "entities");
  const urns = urnList(input.urns, "urns");
  if (qRaw === "similarEntities" && !entities) throw new Error("entities is required");
  if (qRaw === "urns" && !urns) throw new Error("urns is required");
  const entityType = typeof input.entityType === "string" ? assertToken(input.entityType, "entityType") : undefined;
  const queryVersion = typeof input.queryVersion === "string" ? assertToken(input.queryVersion, "queryVersion") : "QUERY_USES_URNS";
  const language = typeof input.locale_language === "string" ? input.locale_language : undefined;
  const country = typeof input.locale_country === "string" ? input.locale_country : undefined;
  if ((language && !/^[a-z]{2}$/.test(language)) || (country && !/^[A-Z]{2}$/.test(country))) {
    throw new Error("locale_language and locale_country must be ISO codes");
  }
  const pairs: Array<[string, string]> = [["q", qRaw]];
  if (facet) pairs.push(["facet", enc(facet)]);
  if (qRaw !== "urns") pairs.push(["queryVersion", queryVersion]);
  if (entityType) pairs.push(["entityType", entityType]);
  if (query) pairs.push(["query", enc(query)]);
  if (entities) pairs.push(["entities", restliList(entities)]);
  if (urns) pairs.push(["urns", restliList(urns)]);
  if (language && country) pairs.push(["locale", `(language:${language},country:${country})`]);
  const validated = { q: qRaw, facet };
  if (!hasLiveAuth(input)) return result("targeting.entities.list", { entities: [], validated });
  return get(input, "targeting.entities.list", `/rest/adTargetingEntities?${qs(pairs)}`, { "X-RestLi-Method": "FINDER" }).then((body) => {
    return result("targeting.entities.list", { entities: elements(body) });
  });
}

function timeRange(input: Input): string {
  const raw = input.timeRange;
  let start = input.startTime;
  let end = input.endTime;
  if (isRecord(raw)) {
    start = raw.start ?? start;
    end = raw.end ?? end;
  }
  if (typeof start !== "number" || typeof end !== "number" || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start) {
    throw new Error("timeRange start and end must be millisecond timestamps");
  }
  return `(start:${start},end:${end})`;
}

export function getSupplyForecasts(value: unknown): ActionResult {
  const input = requireRecord(value, "supply_forecasts.get");
  const accountRaw = firstId(input, ["account", "accountId"], "account");
  const account = enc(sponsoredAccount(accountRaw));
  const campaignType = assertToken(String(input.campaignType ?? ""), "campaignType");
  if (!CAMPAIGN_TYPES.has(campaignType)) throw new Error("campaignType must be SPONSORED_UPDATES, SPONSORED_INMAILS, or DYNAMIC");
  const targetingRaw = input.targetingCriteria ?? input.targeting_criteria;
  if (typeof targetingRaw !== "string" || targetingRaw.trim() === "") throw new Error("targetingCriteria is required");
  const targetingCriteria = restliExpression(targetingRaw.trim(), "targetingCriteria");
  const pairs: Array<[string, string]> = [
    ["q", "criteriaV2"],
    ["account", account],
    ["campaignType", campaignType],
    ["timeRange", timeRange(input)],
    ["targetingCriteria", targetingCriteria],
  ];
  const campaign = asId(input.campaign);
  if (campaign) {
    const campaignUrn = `urn:li:sponsoredCampaign:${resourceId(campaign, ["urn:li:sponsoredCampaign:"])}`;
    pairs.push(["campaign", enc(campaignUrn)]);
  }
  for (const field of ["creativeType", "objectiveType", "optimizationTarget"] as const) {
    if (typeof input[field] === "string" && input[field] !== "") pairs.push([field, assertToken(String(input[field]), field)]);
  }
  for (const field of ["dailyBudget", "totalBudget"] as const) {
    const encoded = money(input[field], field);
    if (encoded) pairs.push([field, encoded]);
  }
  for (const field of ["costCap", "targetCost"] as const) {
    if (input[field] === undefined) continue;
    const text = String(input[field]);
    if (!/^\d+(\.\d{1,4})?$/.test(text)) throw new Error(`${field} must be a decimal string`);
    pairs.push([field, text]);
  }
  if (input.competingBid !== undefined) {
    if (!isRecord(input.competingBid)) throw new Error("competingBid must be an object");
    const bidType = assertToken(String(input.competingBid.bidType ?? ""), "competingBid.bidType");
    const price = money(input.competingBid.bidPrice, "competingBid.bidPrice");
    if (!price) throw new Error("competingBid.bidPrice is required");
    pairs.push(["competingBid", `(bidType:${bidType},bidPrice:${price})`]);
  }
  for (const field of ["enableAudienceNetwork", "enableAudienceExpansion", "connectedTelevisionOnly"] as const) {
    if (input[field] === undefined) continue;
    if (typeof input[field] !== "boolean") throw new Error(`${field} must be a boolean`);
    pairs.push([field, String(input[field])]);
  }
  if (!hasLiveAuth(input)) return result("supply_forecasts.get", { forecasts: [], validated: { account: accountRaw, campaignType } });
  return get(input, "supply_forecasts.get", `/rest/adSupplyForecasts?${qs(pairs)}`, { "X-RestLi-Method": "FINDER" }).then((body) => {
    return result("supply_forecasts.get", { forecasts: elements(body) });
  });
}

function leadOwner(input: Input): string | undefined {
  const sponsored = asId(input.owner_sponsored_account) ?? (input.ownerType === "sponsoredAccount" ? asId(input.ownerId) : undefined);
  const organization = asId(input.owner_organization) ?? (input.ownerType === "organization" ? asId(input.ownerId) : undefined);
  if (sponsored && organization) throw new Error("owner must be a sponsored account or an organization");
  if (sponsored) return `(sponsoredAccount:${enc(sponsoredAccount(sponsored))})`;
  if (organization) {
    const id = resourceId(organization, ["urn:li:organization:"]);
    return `(organization:${enc(`urn:li:organization:${id}`)})`;
  }
  return undefined;
}

export function listLeadForms(value: unknown): ActionResult {
  const input = requireRecord(value, "lead_forms.list");
  const ids = stringList(input.ids, "ids", /^[A-Za-z0-9_-]{1,64}$/, 100);
  const owner = leadOwner(input);
  if (!ids && !owner) throw new Error("owner or ids is required");
  const pairs: Array<[string, string]> = [];
  const headers: Record<string, string> = { "X-RestLi-Method": ids ? "BATCH_GET" : "FINDER" };
  if (ids) pairs.push(["ids", restliList(ids)]);
  else {
    pairs.push(["q", "owner"], ["owner", owner!]);
    const start = pageStart(input.start);
    const count = pageSize(input.count, "count");
    if (start) pairs.push(["start", start]);
    if (count) pairs.push(["count", count]);
  }
  if (!hasLiveAuth(input)) return result("lead_forms.list", { leadForms: [], nextStart: null, count: 0, validated: {} });
  return get(input, "lead_forms.list", `/rest/leadForms?${qs(pairs)}`, headers).then((body) => {
    const paging = isRecord(body.paging) && typeof body.paging.count === "number" ? body.paging.count : 0;
    return result("lead_forms.list", { leadForms: elements(body), nextStart: null, count: paging });
  });
}

export function getLeadForm(value: unknown): ActionResult {
  const input = requireRecord(value, "lead_forms.get");
  const leadFormId = resourceId(firstId(input, ["leadFormId", "form_id", "formId"], "leadFormId"), []);
  if (!hasLiveAuth(input)) return result("lead_forms.get", { leadForm: null, validated: { leadFormId } });
  return get(input, "lead_forms.get", `/rest/leadForms/${enc(leadFormId)}`).then((body) => {
    return result("lead_forms.get", { leadForm: body });
  });
}
