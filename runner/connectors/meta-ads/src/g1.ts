/**
 * Meta Ads G1 — 15 agent-tool ops (campaign/ad set/ad/creative core, sync insights,
 * ad account get, targeting search). Graph API v26.0 via tip createMetaClient.
 *
 * Effect keys (/workspace/parity-briefs/meta-ads-g1-selflock.md):
 * - campaigns.update → Reconcile → campaigns.get
 * - ad_sets.update → Reconcile → ad_sets.get
 * - ads.update → Reconcile → ads.get
 * - Reconcile observes always use default GET field sets (resolveObserveFields)
 * - ads.update omits bidAmount (Ad-level write deprecated; set on ad set)
 * - all creates omit effectPolicy/reconcile/observe
 * - Never Idempotent
 */
import {
  createMetaClient,
  META_GRAPH_API_VERSION,
  prop,
  type MetaCampaignObject,
  type MetaAdSetObject,
  type MetaAdObject,
  type MetaAdAccountObject,
  type MetaCreativeObject,
} from "./http";
import {
  normalizeCampaign,
  normalizeAdSet,
  normalizeAd,
  normalizeAdAccount,
} from "./objects";

export { META_GRAPH_API_VERSION };

type ActionResult = Record<string, unknown> | Promise<Record<string, unknown>>;

export interface MetaAuthInput {
  accessToken: string;
  fetch?: typeof fetch;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function optionalBool(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function requireAccessToken(input: Record<string, unknown>): string {
  return requireString(input.accessToken, "accessToken");
}

/** Normalize ad account id to `act_{digits}` for Graph paths. */
export function actPath(adAccountId: string): string {
  const raw = adAccountId.trim();
  if (raw.startsWith("act_")) return raw;
  if (/^\d+$/.test(raw)) return `act_${raw}`;
  throw new Error("adAccountId must be numeric or act_{id}");
}

function client(input: MetaAuthInput, operation: string) {
  return createMetaClient({
    accessToken: input.accessToken,
    fetch: input.fetch,
    operation,
  });
}

function handleError(result: { status: number; body: unknown }, label: string): never {
  const body = result.body;
  let message = `${label} failed with HTTP ${result.status}`;
  if (isRecord(body) && isRecord(body.error)) {
    const err = body.error;
    if (typeof err.message === "string" && err.message.length > 0) message = err.message;
  }
  throw Object.assign(new Error(message), {
    ok: false,
    code: "CONNECTOR_UPSTREAM_ERROR",
    status: result.status,
    providerError: body,
  });
}

async function graphGet(
  input: MetaAuthInput,
  operation: string,
  path: string,
  query: Record<string, string | undefined>,
): Promise<unknown> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v != null && v !== "") params.set(k, v);
  }
  const qs = params.toString();
  const url = qs ? `${path}?${qs}` : path;
  const result = await client(input, operation).fetchJSON(url, { method: "GET" });
  if (result.status >= 200 && result.status < 300) return result.body;
  handleError(result, operation);
}

/** POST form-urlencoded body (Marketing API classic). Nested objects JSON-stringified. */
async function graphPostForm(
  input: MetaAuthInput,
  operation: string,
  path: string,
  fields: Record<string, unknown>,
): Promise<unknown> {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === null) continue;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      body.set(k, String(v));
    } else {
      body.set(k, JSON.stringify(v));
    }
  }
  const result = await client(input, operation).fetchJSON(path, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (result.status >= 200 && result.status < 300) return result.body;
  handleError(result, operation);
}

function nextCursorFrom(body: unknown): string | null {
  if (!isRecord(body)) return null;
  const paging = body.paging;
  const cursors = isRecord(paging) ? paging.cursors : undefined;
  const after = isRecord(cursors) ? cursors.after : undefined;
  return typeof after === "string" && after.length > 0 ? after : null;
}

function dataArray(body: unknown): Record<string, unknown>[] {
  if (!isRecord(body) || !Array.isArray(body.data)) return [];
  return body.data.filter(isRecord);
}

export function normalizeAdCreativeObject(c: MetaCreativeObject): Record<string, unknown> {
  const obj = c as unknown as Record<string, unknown>;
  const id = typeof c.id === "string" ? c.id : prop(obj, "id");
  return {
    id: id ? `meta-ads:creative:${id}` : "",
    provider: "meta-ads",
    graphId: id,
    name: prop(obj, "name"),
    status: prop(obj, "status"),
    objectType: prop(obj, "object_type") || prop(obj, "type"),
    thumbnailUrl: prop(obj, "thumbnail_url"),
    body: prop(obj, "body"),
    title: prop(obj, "title"),
    raw: c,
  };
}

// Default Graph field sets for observe-capable gets. Every mutable input of the
// matching *.update Reconcile op must appear here (exact observe).
export const CAMPAIGN_GET_FIELDS =
  "id,name,status,objective,daily_budget,lifetime_budget,spend_cap,bid_strategy,special_ad_categories,start_time,stop_time,created_time,updated_time,effective_status";
export const ADSET_GET_FIELDS =
  "id,campaign_id,name,status,daily_budget,lifetime_budget,start_time,end_time,targeting,optimization_goal,billing_event,bid_amount,effective_status";
export const AD_GET_FIELDS =
  "id,adset_id,name,status,effective_status,created_time,updated_time,creative{id,name,object_type}";

/**
 * Resolve Graph `fields` for gets that also serve as Reconcile observes.
 * Runner Reconcile reuses the update action input verbatim. Update schemas set
 * additionalProperties:false and omit `fields`, so a schema-valid observe never
 * supplies fields. If a caller smuggles `fields` onto a reused update input,
 * ignore it and keep the default set so the observe stays exact.
 * Direct gets (only id + accessToken + optional fields + fetch) still honor fields.
 */
export function resolveObserveFields(
  input: Record<string, unknown>,
  defaults: string,
  idKeys: readonly string[],
): string {
  const allowed = new Set<string>([...idKeys, "accessToken", "fields", "fetch"]);
  const pureGet = Object.keys(input).every((k) => allowed.has(k));
  if (pureGet) {
    return optionalString(input.fields) ?? defaults;
  }
  return defaults;
}

const CREATIVE_GET_FIELDS =
  "id,name,status,object_type,thumbnail_url,body,title,image_hash,video_id,call_to_action_type,object_story_spec";
const ACCOUNT_GET_FIELDS = "id,name,account_status,currency,timezone_name,business_name";
const INSIGHTS_DEFAULT_FIELDS = "impressions,clicks,spend,reach,cpc,cpm,ctr,frequency,account_id,campaign_id,adset_id,ad_id,date_start,date_stop";

// ---------------------------------------------------------------------------
// 1. campaigns.get
// ---------------------------------------------------------------------------

export function getCampaign(input: unknown): ActionResult {
  if (!isRecord(input)) throw new Error("campaigns.get input must be an object");
  const accessToken = requireAccessToken(input);
  const campaignId = requireString(input.campaignId, "campaignId");
  const fields = resolveObserveFields(input, CAMPAIGN_GET_FIELDS, ["campaignId"]);
  const auth: MetaAuthInput = { accessToken, fetch: input.fetch as typeof fetch | undefined };
  return graphGet(auth, "campaigns.get", `/${campaignId}`, { fields }).then((body) => {
    if (!isRecord(body) || typeof body.id !== "string") {
      return { connector: "meta-ads", action: "campaigns.get", source: "connector", campaign: null };
    }
    return {
      connector: "meta-ads",
      action: "campaigns.get",
      source: "connector",
      campaign: normalizeCampaign(body as MetaCampaignObject),
    };
  });
}

// ---------------------------------------------------------------------------
// 2. campaigns.create — omit effects
// ---------------------------------------------------------------------------

export function createCampaign(input: unknown): ActionResult {
  if (!isRecord(input)) throw new Error("campaigns.create input must be an object");
  const accessToken = requireAccessToken(input);
  const adAccountId = actPath(requireString(input.adAccountId, "adAccountId"));
  const name = requireString(input.name, "name");
  const objective = requireString(input.objective, "objective");
  const specialAdCategories = Array.isArray(input.specialAdCategories)
    ? input.specialAdCategories
    : [];
  const auth: MetaAuthInput = { accessToken, fetch: input.fetch as typeof fetch | undefined };
  const fields: Record<string, unknown> = {
    name,
    objective,
    special_ad_categories: specialAdCategories,
  };
  const status = optionalString(input.status);
  if (status) fields.status = status;
  const dailyBudget = optionalNumber(input.dailyBudget);
  if (dailyBudget != null) fields.daily_budget = dailyBudget;
  const lifetimeBudget = optionalNumber(input.lifetimeBudget);
  if (lifetimeBudget != null) fields.lifetime_budget = lifetimeBudget;
  const bidStrategy = optionalString(input.bidStrategy);
  if (bidStrategy) fields.bid_strategy = bidStrategy;
  const sharing = optionalBool(input.isAdsetBudgetSharingEnabled);
  if (sharing != null) fields.is_adset_budget_sharing_enabled = sharing;

  return graphPostForm(auth, "campaigns.create", `/${adAccountId}/campaigns`, fields).then((body) => {
    const id = isRecord(body) && typeof body.id === "string" ? body.id : "";
    return { connector: "meta-ads", action: "campaigns.create", source: "connector", id, raw: body };
  });
}

// ---------------------------------------------------------------------------
// 3. campaigns.update — Reconcile → campaigns.get
// ---------------------------------------------------------------------------

export function updateCampaign(input: unknown): ActionResult {
  if (!isRecord(input)) throw new Error("campaigns.update input must be an object");
  const accessToken = requireAccessToken(input);
  const campaignId = requireString(input.campaignId, "campaignId");
  const auth: MetaAuthInput = { accessToken, fetch: input.fetch as typeof fetch | undefined };
  const fields: Record<string, unknown> = {};
  const name = optionalString(input.name);
  if (name) fields.name = name;
  const status = optionalString(input.status);
  if (status) fields.status = status;
  const dailyBudget = optionalNumber(input.dailyBudget);
  if (dailyBudget != null) fields.daily_budget = dailyBudget;
  const lifetimeBudget = optionalNumber(input.lifetimeBudget);
  if (lifetimeBudget != null) fields.lifetime_budget = lifetimeBudget;
  const spendCap = optionalNumber(input.spendCap);
  if (spendCap != null) fields.spend_cap = spendCap;
  const bidStrategy = optionalString(input.bidStrategy);
  if (bidStrategy) fields.bid_strategy = bidStrategy;
  if (Array.isArray(input.specialAdCategories)) fields.special_ad_categories = input.specialAdCategories;
  if (Object.keys(fields).length === 0) throw new Error("campaigns.update requires at least one mutable field");

  return graphPostForm(auth, "campaigns.update", `/${campaignId}`, fields).then((body) => {
    const success = isRecord(body) && body.success === true;
    return {
      connector: "meta-ads",
      action: "campaigns.update",
      source: "connector",
      id: campaignId,
      success: success || (isRecord(body) && typeof body.id === "string"),
      raw: body,
    };
  });
}

// ---------------------------------------------------------------------------
// 4. ad_sets.get
// ---------------------------------------------------------------------------

export function getAdSet(input: unknown): ActionResult {
  if (!isRecord(input)) throw new Error("ad_sets.get input must be an object");
  const accessToken = requireAccessToken(input);
  const adSetId = requireString(input.adSetId, "adSetId");
  const fields = resolveObserveFields(input, ADSET_GET_FIELDS, ["adSetId", "adsetId"]);
  const auth: MetaAuthInput = { accessToken, fetch: input.fetch as typeof fetch | undefined };
  return graphGet(auth, "ad_sets.get", `/${adSetId}`, { fields }).then((body) => {
    if (!isRecord(body) || typeof body.id !== "string") {
      return { connector: "meta-ads", action: "ad_sets.get", source: "connector", adSet: null };
    }
    return {
      connector: "meta-ads",
      action: "ad_sets.get",
      source: "connector",
      adSet: normalizeAdSet(body as MetaAdSetObject),
    };
  });
}

// ---------------------------------------------------------------------------
// 5. ad_sets.create — omit
// ---------------------------------------------------------------------------

export function createAdSet(input: unknown): ActionResult {
  if (!isRecord(input)) throw new Error("ad_sets.create input must be an object");
  const accessToken = requireAccessToken(input);
  const adAccountId = actPath(requireString(input.adAccountId, "adAccountId"));
  const name = requireString(input.name, "name");
  const campaignId = requireString(input.campaignId, "campaignId");
  const billingEvent = requireString(input.billingEvent, "billingEvent");
  const optimizationGoal = requireString(input.optimizationGoal, "optimizationGoal");
  if (!isRecord(input.targeting)) throw new Error("targeting is required");
  const auth: MetaAuthInput = { accessToken, fetch: input.fetch as typeof fetch | undefined };
  const fields: Record<string, unknown> = {
    name,
    campaign_id: campaignId,
    billing_event: billingEvent,
    optimization_goal: optimizationGoal,
    targeting: input.targeting,
  };
  const status = optionalString(input.status);
  if (status) fields.status = status;
  const dailyBudget = optionalNumber(input.dailyBudget);
  if (dailyBudget != null) fields.daily_budget = dailyBudget;
  const lifetimeBudget = optionalNumber(input.lifetimeBudget);
  if (lifetimeBudget != null) fields.lifetime_budget = lifetimeBudget;
  const bidAmount = optionalNumber(input.bidAmount);
  if (bidAmount != null) fields.bid_amount = bidAmount;
  const bidStrategy = optionalString(input.bidStrategy);
  if (bidStrategy) fields.bid_strategy = bidStrategy;
  const startTime = optionalString(input.startTime);
  if (startTime) fields.start_time = startTime;
  const endTime = optionalString(input.endTime);
  if (endTime) fields.end_time = endTime;
  if (isRecord(input.promotedObject)) fields.promoted_object = input.promotedObject;

  return graphPostForm(auth, "ad_sets.create", `/${adAccountId}/adsets`, fields).then((body) => {
    const id = isRecord(body) && typeof body.id === "string" ? body.id : "";
    return { connector: "meta-ads", action: "ad_sets.create", source: "connector", id, raw: body };
  });
}

// ---------------------------------------------------------------------------
// 6. ad_sets.update — Reconcile → ad_sets.get
// ---------------------------------------------------------------------------

export function updateAdSet(input: unknown): ActionResult {
  if (!isRecord(input)) throw new Error("ad_sets.update input must be an object");
  const accessToken = requireAccessToken(input);
  const adSetId = requireString(input.adSetId, "adSetId");
  const auth: MetaAuthInput = { accessToken, fetch: input.fetch as typeof fetch | undefined };
  const fields: Record<string, unknown> = {};
  const name = optionalString(input.name);
  if (name) fields.name = name;
  const status = optionalString(input.status);
  if (status) fields.status = status;
  const dailyBudget = optionalNumber(input.dailyBudget);
  if (dailyBudget != null) fields.daily_budget = dailyBudget;
  const lifetimeBudget = optionalNumber(input.lifetimeBudget);
  if (lifetimeBudget != null) fields.lifetime_budget = lifetimeBudget;
  const bidAmount = optionalNumber(input.bidAmount);
  if (bidAmount != null) fields.bid_amount = bidAmount;
  if (isRecord(input.targeting)) fields.targeting = input.targeting;
  const endTime = optionalString(input.endTime);
  if (endTime) fields.end_time = endTime;
  if (Object.keys(fields).length === 0) throw new Error("ad_sets.update requires at least one mutable field");

  return graphPostForm(auth, "ad_sets.update", `/${adSetId}`, fields).then((body) => {
    const success = isRecord(body) && body.success === true;
    return {
      connector: "meta-ads",
      action: "ad_sets.update",
      source: "connector",
      id: adSetId,
      success: success || (isRecord(body) && typeof body.id === "string"),
      raw: body,
    };
  });
}

// ---------------------------------------------------------------------------
// 7. ads.get
// ---------------------------------------------------------------------------

export function getAd(input: unknown): ActionResult {
  if (!isRecord(input)) throw new Error("ads.get input must be an object");
  const accessToken = requireAccessToken(input);
  const adId = requireString(input.adId, "adId");
  const fields = resolveObserveFields(input, AD_GET_FIELDS, ["adId"]);
  const auth: MetaAuthInput = { accessToken, fetch: input.fetch as typeof fetch | undefined };
  return graphGet(auth, "ads.get", `/${adId}`, { fields }).then((body) => {
    if (!isRecord(body) || typeof body.id !== "string") {
      return { connector: "meta-ads", action: "ads.get", source: "connector", ad: null };
    }
    return {
      connector: "meta-ads",
      action: "ads.get",
      source: "connector",
      ad: normalizeAd(body as MetaAdObject),
    };
  });
}

// ---------------------------------------------------------------------------
// 8. ads.create — omit
// ---------------------------------------------------------------------------

export function createAd(input: unknown): ActionResult {
  if (!isRecord(input)) throw new Error("ads.create input must be an object");
  const accessToken = requireAccessToken(input);
  const adAccountId = actPath(requireString(input.adAccountId, "adAccountId"));
  const name = requireString(input.name, "name");
  const adsetId = requireString(input.adsetId ?? input.adSetId, "adsetId");
  if (!isRecord(input.creative)) throw new Error("creative is required");
  const auth: MetaAuthInput = { accessToken, fetch: input.fetch as typeof fetch | undefined };
  const fields: Record<string, unknown> = {
    name,
    adset_id: adsetId,
    creative: input.creative,
  };
  const status = optionalString(input.status);
  if (status) fields.status = status;
  const bidAmount = optionalNumber(input.bidAmount);
  if (bidAmount != null) fields.bid_amount = bidAmount;
  if (Array.isArray(input.trackingSpecs)) fields.tracking_specs = input.trackingSpecs;

  return graphPostForm(auth, "ads.create", `/${adAccountId}/ads`, fields).then((body) => {
    const id = isRecord(body) && typeof body.id === "string" ? body.id : "";
    return { connector: "meta-ads", action: "ads.create", source: "connector", id, raw: body };
  });
}

// ---------------------------------------------------------------------------
// 9. ads.update — Reconcile → ads.get
// ---------------------------------------------------------------------------

export function updateAd(input: unknown): ActionResult {
  if (!isRecord(input)) throw new Error("ads.update input must be an object");
  const accessToken = requireAccessToken(input);
  const adId = requireString(input.adId, "adId");
  const auth: MetaAuthInput = { accessToken, fetch: input.fetch as typeof fetch | undefined };
  const fields: Record<string, unknown> = {};
  const name = optionalString(input.name);
  if (name) fields.name = name;
  const status = optionalString(input.status);
  if (status) fields.status = status;
  if (isRecord(input.creative)) fields.creative = input.creative;
  // Ad-level bid_amount write is deprecated on Marketing API v26.0 Ad (adgroup):
  // https://developers.facebook.com/docs/marketing-api/reference/adgroup/
  // ("Deprecated. We no longer allow setting the bid_amount value on an ad.
  // Please set bid_amount for the ad set.") Dropped from ads.update; keep on ad_sets.
  if (Object.keys(fields).length === 0) throw new Error("ads.update requires at least one mutable field");

  return graphPostForm(auth, "ads.update", `/${adId}`, fields).then((body) => {
    const success = isRecord(body) && body.success === true;
    return {
      connector: "meta-ads",
      action: "ads.update",
      source: "connector",
      id: adId,
      success: success || (isRecord(body) && typeof body.id === "string"),
      raw: body,
    };
  });
}

// ---------------------------------------------------------------------------
// 10. ad_creatives.list
// ---------------------------------------------------------------------------

export function listAdCreatives(input: unknown): ActionResult {
  if (!isRecord(input)) throw new Error("ad_creatives.list input must be an object");
  const accessToken = requireAccessToken(input);
  const adAccountId = actPath(requireString(input.adAccountId, "adAccountId"));
  const fields = optionalString(input.fields) ?? CREATIVE_GET_FIELDS;
  const auth: MetaAuthInput = { accessToken, fetch: input.fetch as typeof fetch | undefined };
  const query: Record<string, string | undefined> = { fields };
  const limit = optionalNumber(input.limit);
  if (limit != null) query.limit = String(limit);
  const after = optionalString(input.after);
  if (after) query.after = after;

  return graphGet(auth, "ad_creatives.list", `/${adAccountId}/adcreatives`, query).then((body) => {
    const creatives = dataArray(body).map((row) => normalizeAdCreativeObject(row as MetaCreativeObject));
    return {
      connector: "meta-ads",
      action: "ad_creatives.list",
      source: "connector",
      creatives,
      nextCursor: nextCursorFrom(body),
    };
  });
}

// ---------------------------------------------------------------------------
// 11. ad_creatives.get
// ---------------------------------------------------------------------------

export function getAdCreative(input: unknown): ActionResult {
  if (!isRecord(input)) throw new Error("ad_creatives.get input must be an object");
  const accessToken = requireAccessToken(input);
  const creativeId = requireString(input.creativeId, "creativeId");
  const fields = optionalString(input.fields) ?? CREATIVE_GET_FIELDS;
  const auth: MetaAuthInput = { accessToken, fetch: input.fetch as typeof fetch | undefined };
  return graphGet(auth, "ad_creatives.get", `/${creativeId}`, { fields }).then((body) => {
    if (!isRecord(body) || typeof body.id !== "string") {
      return { connector: "meta-ads", action: "ad_creatives.get", source: "connector", creative: null };
    }
    return {
      connector: "meta-ads",
      action: "ad_creatives.get",
      source: "connector",
      creative: normalizeAdCreativeObject(body as MetaCreativeObject),
    };
  });
}

// ---------------------------------------------------------------------------
// 12. ad_creatives.create — omit
// ---------------------------------------------------------------------------

export function createAdCreative(input: unknown): ActionResult {
  if (!isRecord(input)) throw new Error("ad_creatives.create input must be an object");
  const accessToken = requireAccessToken(input);
  const adAccountId = actPath(requireString(input.adAccountId, "adAccountId"));
  const name = requireString(input.name, "name");
  const auth: MetaAuthInput = { accessToken, fetch: input.fetch as typeof fetch | undefined };
  const fields: Record<string, unknown> = { name };
  // Accept either top-level creative fields or a nested `creative` object (Composio style).
  const creative = isRecord(input.creative) ? input.creative : input;
  if (isRecord(creative.objectStorySpec) || isRecord(input.objectStorySpec)) {
    fields.object_story_spec = creative.objectStorySpec ?? input.objectStorySpec;
  }
  if (isRecord(creative.assetFeedSpec) || isRecord(input.assetFeedSpec)) {
    fields.asset_feed_spec = creative.assetFeedSpec ?? input.assetFeedSpec;
  }
  const objectStoryId = optionalString(creative.objectStoryId ?? input.objectStoryId);
  if (objectStoryId) fields.object_story_id = objectStoryId;
  const imageHash = optionalString(creative.imageHash ?? input.imageHash);
  if (imageHash) fields.image_hash = imageHash;
  const videoId = optionalString(creative.videoId ?? input.videoId);
  if (videoId) fields.video_id = videoId;
  const body = optionalString(creative.body ?? input.body);
  if (body) fields.body = body;
  const title = optionalString(creative.title ?? input.title);
  if (title) fields.title = title;
  const linkUrl = optionalString(creative.linkUrl ?? input.linkUrl);
  if (linkUrl) fields.link_url = linkUrl;

  return graphPostForm(auth, "ad_creatives.create", `/${adAccountId}/adcreatives`, fields).then((resp) => {
    const id = isRecord(resp) && typeof resp.id === "string" ? resp.id : "";
    return { connector: "meta-ads", action: "ad_creatives.create", source: "connector", id, raw: resp };
  });
}

// ---------------------------------------------------------------------------
// 13. insights.get — sync insights edge
// ---------------------------------------------------------------------------

export function getInsights(input: unknown): ActionResult {
  if (!isRecord(input)) throw new Error("insights.get input must be an object");
  const accessToken = requireAccessToken(input);
  const objectId = requireString(input.objectId, "objectId");
  // Ad-account insights use /act_{id}/insights. Campaign/adset/ad ids are bare numerics.
  const level = optionalString(input.level);
  const pathObject =
    level === "account" || objectId.startsWith("act_")
      ? actPath(objectId.replace(/^act_/, ""))
      : objectId;

  const fields = optionalString(input.fields) ?? INSIGHTS_DEFAULT_FIELDS;
  const auth: MetaAuthInput = { accessToken, fetch: input.fetch as typeof fetch | undefined };
  const query: Record<string, string | undefined> = { fields };
  if (level) query.level = level;
  const datePreset = optionalString(input.datePreset);
  if (datePreset) query.date_preset = datePreset;
  if (isRecord(input.timeRange)) query.time_range = JSON.stringify(input.timeRange);
  const timeIncrement = input.timeIncrement;
  if (timeIncrement != null) query.time_increment = String(timeIncrement);
  if (Array.isArray(input.breakdowns)) query.breakdowns = input.breakdowns.join(",");
  if (Array.isArray(input.filtering)) query.filtering = JSON.stringify(input.filtering);
  const limit = optionalNumber(input.limit);
  if (limit != null) query.limit = String(limit);
  const after = optionalString(input.after);
  if (after) query.after = after;

  return graphGet(auth, "insights.get", `/${pathObject}/insights`, query).then((body) => {
    return {
      connector: "meta-ads",
      action: "insights.get",
      source: "connector",
      rows: dataArray(body),
      nextCursor: nextCursorFrom(body),
    };
  });
}

// ---------------------------------------------------------------------------
// 14. ad_accounts.get
// ---------------------------------------------------------------------------

export function getAdAccount(input: unknown): ActionResult {
  if (!isRecord(input)) throw new Error("ad_accounts.get input must be an object");
  const accessToken = requireAccessToken(input);
  const adAccountId = actPath(requireString(input.adAccountId, "adAccountId"));
  const fields = optionalString(input.fields) ?? ACCOUNT_GET_FIELDS;
  const auth: MetaAuthInput = { accessToken, fetch: input.fetch as typeof fetch | undefined };
  return graphGet(auth, "ad_accounts.get", `/${adAccountId}`, { fields }).then((body) => {
    if (!isRecord(body) || typeof body.id !== "string") {
      return { connector: "meta-ads", action: "ad_accounts.get", source: "connector", adAccount: null };
    }
    return {
      connector: "meta-ads",
      action: "ad_accounts.get",
      source: "connector",
      adAccount: normalizeAdAccount(body as MetaAdAccountObject),
    };
  });
}

// ---------------------------------------------------------------------------
// 15. targeting.search — GET /search
// ---------------------------------------------------------------------------

export function searchTargeting(input: unknown): ActionResult {
  if (!isRecord(input)) throw new Error("targeting.search input must be an object");
  const accessToken = requireAccessToken(input);
  const q = requireString(input.q, "q");
  const type = requireString(input.type, "type");
  const auth: MetaAuthInput = { accessToken, fetch: input.fetch as typeof fetch | undefined };
  const query: Record<string, string | undefined> = { q, type };
  const limit = optionalNumber(input.limit);
  if (limit != null) query.limit = String(limit);
  const className = optionalString(input.class);
  if (className) query.class = className;
  if (Array.isArray(input.locationTypes)) {
    query.location_types = JSON.stringify(input.locationTypes);
  }

  return graphGet(auth, "targeting.search", `/search`, query).then((body) => {
    return {
      connector: "meta-ads",
      action: "targeting.search",
      source: "connector",
      results: dataArray(body),
    };
  });
}
