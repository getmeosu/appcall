/**
 * Meta Ads G2 — 15 agent-tool ops (deletes, creative update/preview, images/videos,
 * audiences, async insights, reach estimate). Graph API v26.0 via tip createMetaClient.
 *
 * Effect keys (/workspace/parity-briefs/meta-ads-g2-selflock.md):
 * - ad_creatives.update → Reconcile → ad_creatives.get (resolveObserveFields)
 * - creates / deletes / async / one-shots omit effectPolicy/reconcile/observe
 * - Never Idempotent
 * - No poll_spec / applink_treatment=web_only / delivery-estimate deprecated fields
 */
import { createMetaClient, prop } from "./http";
import {
  actPath,
  resolveObserveFields,
  CREATIVE_GET_FIELDS,
  normalizeAdCreativeObject,
  type MetaAuthInput,
} from "./g1";

type ActionResult = Record<string, unknown> | Promise<Record<string, unknown>>;

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

function requireAccessToken(input: Record<string, unknown>): string {
  return requireString(input.accessToken, "accessToken");
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

async function graphDelete(
  input: MetaAuthInput,
  operation: string,
  path: string,
): Promise<unknown> {
  const result = await client(input, operation).fetchJSON(path, { method: "DELETE" });
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

const IMAGE_LIST_FIELDS = "hash,url,name,width,height,status,created_time,updated_time";
const VIDEO_GET_FIELDS = "id,title,description,length,status,source,picture,created_time,updated_time";
const AUDIENCE_GET_FIELDS =
  "id,name,subtype,description,approximate_count_lower_bound,approximate_count_upper_bound,delivery_status,operation_status,time_created,time_updated";
const REPORT_RUN_FIELDS =
  "id,account_id,async_status,async_percent_completion,date_start,date_stop,time_ref,time_completed,is_running";

export function normalizeAdImage(row: Record<string, unknown>): Record<string, unknown> {
  const hash = prop(row, "hash") || (typeof row.hash === "string" ? row.hash : "");
  return {
    id: hash ? `meta-ads:image:${hash}` : "",
    provider: "meta-ads",
    hash,
    url: prop(row, "url"),
    name: prop(row, "name"),
    width: row.width ?? null,
    height: row.height ?? null,
    status: prop(row, "status"),
    raw: row,
  };
}

export function normalizeAdVideo(row: Record<string, unknown>): Record<string, unknown> {
  const id = typeof row.id === "string" ? row.id : prop(row, "id");
  return {
    id: id ? `meta-ads:video:${id}` : "",
    provider: "meta-ads",
    graphId: id,
    title: prop(row, "title") || prop(row, "name"),
    description: prop(row, "description"),
    length: row.length ?? null,
    status: isRecord(row.status) ? row.status : prop(row, "status"),
    picture: prop(row, "picture"),
    source: prop(row, "source"),
    raw: row,
  };
}

export function normalizeCustomAudience(row: Record<string, unknown>): Record<string, unknown> {
  const id = typeof row.id === "string" ? row.id : prop(row, "id");
  return {
    id: id ? `meta-ads:audience:${id}` : "",
    provider: "meta-ads",
    graphId: id,
    name: prop(row, "name"),
    subtype: prop(row, "subtype"),
    description: prop(row, "description"),
    approximateCountLowerBound: row.approximate_count_lower_bound ?? null,
    approximateCountUpperBound: row.approximate_count_upper_bound ?? null,
    deliveryStatus: row.delivery_status ?? null,
    operationStatus: row.operation_status ?? null,
    raw: row,
  };
}

// ---------------------------------------------------------------------------
// 1–3. deletes
// ---------------------------------------------------------------------------

export function deleteCampaign(input: unknown): ActionResult {
  if (!isRecord(input)) throw new Error("campaigns.delete input must be an object");
  const accessToken = requireAccessToken(input);
  const campaignId = requireString(input.campaignId, "campaignId");
  const auth: MetaAuthInput = { accessToken, fetch: input.fetch as typeof fetch | undefined };
  return graphDelete(auth, "campaigns.delete", `/${campaignId}`).then((body) => {
    const success = isRecord(body) && body.success === true;
    return {
      connector: "meta-ads",
      action: "campaigns.delete",
      source: "connector",
      id: campaignId,
      success,
      raw: body,
    };
  });
}

export function deleteAdSet(input: unknown): ActionResult {
  if (!isRecord(input)) throw new Error("ad_sets.delete input must be an object");
  const accessToken = requireAccessToken(input);
  const adSetId = requireString(input.adSetId, "adSetId");
  const auth: MetaAuthInput = { accessToken, fetch: input.fetch as typeof fetch | undefined };
  return graphDelete(auth, "ad_sets.delete", `/${adSetId}`).then((body) => {
    const success = isRecord(body) && body.success === true;
    return {
      connector: "meta-ads",
      action: "ad_sets.delete",
      source: "connector",
      id: adSetId,
      success,
      raw: body,
    };
  });
}

export function deleteAd(input: unknown): ActionResult {
  if (!isRecord(input)) throw new Error("ads.delete input must be an object");
  const accessToken = requireAccessToken(input);
  const adId = requireString(input.adId, "adId");
  const auth: MetaAuthInput = { accessToken, fetch: input.fetch as typeof fetch | undefined };
  return graphDelete(auth, "ads.delete", `/${adId}`).then((body) => {
    const success = isRecord(body) && body.success === true;
    return {
      connector: "meta-ads",
      action: "ads.delete",
      source: "connector",
      id: adId,
      success,
      raw: body,
    };
  });
}

// ---------------------------------------------------------------------------
// 4. ad_creatives.update — Reconcile → ad_creatives.get
// ---------------------------------------------------------------------------

export function updateAdCreative(input: unknown): ActionResult {
  if (!isRecord(input)) throw new Error("ad_creatives.update input must be an object");
  const accessToken = requireAccessToken(input);
  const creativeId = requireString(input.creativeId, "creativeId");
  const auth: MetaAuthInput = { accessToken, fetch: input.fetch as typeof fetch | undefined };
  const fields: Record<string, unknown> = {};
  const name = optionalString(input.name);
  if (name) fields.name = name;
  const status = optionalString(input.status);
  if (status) fields.status = status;
  // Mutables limited to name/status so observe CREATIVE_GET_FIELDS stays exact.
  // No poll_spec / interactive_components_spec (v26.0 poll ads deprecation).
  if (Object.keys(fields).length === 0) {
    throw new Error("ad_creatives.update requires at least one mutable field");
  }

  return graphPostForm(auth, "ad_creatives.update", `/${creativeId}`, fields).then((body) => {
    const success = isRecord(body) && body.success === true;
    return {
      connector: "meta-ads",
      action: "ad_creatives.update",
      source: "connector",
      id: creativeId,
      success: success || (isRecord(body) && typeof body.id === "string"),
      raw: body,
    };
  });
}

// ---------------------------------------------------------------------------
// 5. ad_creatives.preview — one-shot omit
// ---------------------------------------------------------------------------

export function previewAdCreative(input: unknown): ActionResult {
  if (!isRecord(input)) throw new Error("ad_creatives.preview input must be an object");
  const accessToken = requireAccessToken(input);
  const creativeId = requireString(input.creativeId, "creativeId");
  const adFormat = requireString(input.adFormat, "adFormat");
  const auth: MetaAuthInput = { accessToken, fetch: input.fetch as typeof fetch | undefined };
  return graphGet(auth, "ad_creatives.preview", `/${creativeId}/previews`, {
    ad_format: adFormat,
  }).then((body) => {
    return {
      connector: "meta-ads",
      action: "ad_creatives.preview",
      source: "connector",
      previews: dataArray(body),
    };
  });
}

// ---------------------------------------------------------------------------
// 6–7. ad images
// ---------------------------------------------------------------------------

export function listAdImages(input: unknown): ActionResult {
  if (!isRecord(input)) throw new Error("ad_images.list input must be an object");
  const accessToken = requireAccessToken(input);
  const adAccountId = actPath(requireString(input.adAccountId, "adAccountId"));
  const fields = optionalString(input.fields) ?? IMAGE_LIST_FIELDS;
  const auth: MetaAuthInput = { accessToken, fetch: input.fetch as typeof fetch | undefined };
  const query: Record<string, string | undefined> = { fields };
  const limit = optionalNumber(input.limit);
  if (limit != null) query.limit = String(limit);
  const after = optionalString(input.after);
  if (after) query.after = after;
  if (Array.isArray(input.hashes)) query.hashes = JSON.stringify(input.hashes);

  return graphGet(auth, "ad_images.list", `/${adAccountId}/adimages`, query).then((body) => {
    // Live list returns data[] of image objects; some hashes lookups return { data: { hash: {...} } }.
    let images: Record<string, unknown>[] = [];
    if (isRecord(body) && isRecord(body.data) && !Array.isArray(body.data)) {
      images = Object.values(body.data).filter(isRecord);
    } else {
      images = dataArray(body);
    }
    return {
      connector: "meta-ads",
      action: "ad_images.list",
      source: "connector",
      images: images.map(normalizeAdImage),
      nextCursor: nextCursorFrom(body),
    };
  });
}

export function uploadAdImage(input: unknown): ActionResult {
  if (!isRecord(input)) throw new Error("ad_images.upload input must be an object");
  const accessToken = requireAccessToken(input);
  const adAccountId = actPath(requireString(input.adAccountId, "adAccountId"));
  const bytes = optionalString(input.bytes);
  const url = optionalString(input.url);
  const copyFrom = isRecord(input.copyFrom) ? input.copyFrom : undefined;
  if (!bytes && !url && !copyFrom) {
    throw new Error("ad_images.upload requires bytes, url, or copyFrom");
  }
  const auth: MetaAuthInput = { accessToken, fetch: input.fetch as typeof fetch | undefined };
  const fields: Record<string, unknown> = {};
  if (bytes) fields.bytes = bytes;
  if (url) fields.url = url;
  if (copyFrom) fields.copy_from = copyFrom;
  const name = optionalString(input.name);
  if (name) fields.name = name;

  return graphPostForm(auth, "ad_images.upload", `/${adAccountId}/adimages`, fields).then((body) => {
    // Live create returns { images: { <filename>: { hash, url, ... } } }
    let hash = "";
    let image: Record<string, unknown> | null = null;
    if (isRecord(body) && isRecord(body.images)) {
      const first = Object.values(body.images).find(isRecord);
      if (first) {
        image = normalizeAdImage(first);
        hash = typeof first.hash === "string" ? first.hash : "";
      }
    }
    return {
      connector: "meta-ads",
      action: "ad_images.upload",
      source: "connector",
      hash,
      image,
      raw: body,
    };
  });
}

// ---------------------------------------------------------------------------
// 8–9. ad videos
// ---------------------------------------------------------------------------

export function createAdVideo(input: unknown): ActionResult {
  if (!isRecord(input)) throw new Error("ad_videos.create input must be an object");
  const accessToken = requireAccessToken(input);
  const adAccountId = actPath(requireString(input.adAccountId, "adAccountId"));
  const auth: MetaAuthInput = { accessToken, fetch: input.fetch as typeof fetch | undefined };
  const fields: Record<string, unknown> = {};
  const fileUrl = optionalString(input.fileUrl);
  if (fileUrl) fields.file_url = fileUrl;
  const title = optionalString(input.title) ?? optionalString(input.name);
  if (title) fields.title = title;
  const description = optionalString(input.description);
  if (description) fields.description = description;
  if (!fileUrl) throw new Error("ad_videos.create requires fileUrl (multipart file upload not supported in this op)");

  return graphPostForm(auth, "ad_videos.create", `/${adAccountId}/advideos`, fields).then((body) => {
    const id = isRecord(body) && typeof body.id === "string" ? body.id : "";
    return { connector: "meta-ads", action: "ad_videos.create", source: "connector", id, raw: body };
  });
}

export function getAdVideo(input: unknown): ActionResult {
  if (!isRecord(input)) throw new Error("ad_videos.get input must be an object");
  const accessToken = requireAccessToken(input);
  const videoId = requireString(input.videoId, "videoId");
  const fields = optionalString(input.fields) ?? VIDEO_GET_FIELDS;
  const auth: MetaAuthInput = { accessToken, fetch: input.fetch as typeof fetch | undefined };
  return graphGet(auth, "ad_videos.get", `/${videoId}`, { fields }).then((body) => {
    if (!isRecord(body) || typeof body.id !== "string") {
      return { connector: "meta-ads", action: "ad_videos.get", source: "connector", video: null };
    }
    return {
      connector: "meta-ads",
      action: "ad_videos.get",
      source: "connector",
      video: normalizeAdVideo(body),
    };
  });
}

// ---------------------------------------------------------------------------
// 10–12. custom audiences
// ---------------------------------------------------------------------------

export function listCustomAudiences(input: unknown): ActionResult {
  if (!isRecord(input)) throw new Error("custom_audiences.list input must be an object");
  const accessToken = requireAccessToken(input);
  const adAccountId = actPath(requireString(input.adAccountId, "adAccountId"));
  const fields = optionalString(input.fields) ?? AUDIENCE_GET_FIELDS;
  const auth: MetaAuthInput = { accessToken, fetch: input.fetch as typeof fetch | undefined };
  const query: Record<string, string | undefined> = { fields };
  const limit = optionalNumber(input.limit);
  if (limit != null) query.limit = String(limit);
  const after = optionalString(input.after);
  if (after) query.after = after;

  return graphGet(auth, "custom_audiences.list", `/${adAccountId}/customaudiences`, query).then((body) => {
    return {
      connector: "meta-ads",
      action: "custom_audiences.list",
      source: "connector",
      audiences: dataArray(body).map(normalizeCustomAudience),
      nextCursor: nextCursorFrom(body),
    };
  });
}

export function getCustomAudience(input: unknown): ActionResult {
  if (!isRecord(input)) throw new Error("custom_audiences.get input must be an object");
  const accessToken = requireAccessToken(input);
  const audienceId = requireString(input.audienceId, "audienceId");
  const fields = optionalString(input.fields) ?? AUDIENCE_GET_FIELDS;
  const auth: MetaAuthInput = { accessToken, fetch: input.fetch as typeof fetch | undefined };
  return graphGet(auth, "custom_audiences.get", `/${audienceId}`, { fields }).then((body) => {
    if (!isRecord(body) || typeof body.id !== "string") {
      return { connector: "meta-ads", action: "custom_audiences.get", source: "connector", audience: null };
    }
    return {
      connector: "meta-ads",
      action: "custom_audiences.get",
      source: "connector",
      audience: normalizeCustomAudience(body),
    };
  });
}

export function createCustomAudience(input: unknown): ActionResult {
  if (!isRecord(input)) throw new Error("custom_audiences.create input must be an object");
  const accessToken = requireAccessToken(input);
  const adAccountId = actPath(requireString(input.adAccountId, "adAccountId"));
  const name = requireString(input.name, "name");
  const subtype = requireString(input.subtype, "subtype");
  const auth: MetaAuthInput = { accessToken, fetch: input.fetch as typeof fetch | undefined };
  const fields: Record<string, unknown> = { name, subtype };
  const description = optionalString(input.description);
  if (description) fields.description = description;
  const customerFileSource = optionalString(input.customerFileSource);
  if (customerFileSource) fields.customer_file_source = customerFileSource;

  return graphPostForm(auth, "custom_audiences.create", `/${adAccountId}/customaudiences`, fields).then(
    (body) => {
      const id = isRecord(body) && typeof body.id === "string" ? body.id : "";
      return {
        connector: "meta-ads",
        action: "custom_audiences.create",
        source: "connector",
        id,
        raw: body,
      };
    },
  );
}

// ---------------------------------------------------------------------------
// 13–14. async insights
// ---------------------------------------------------------------------------

export function createAsyncInsights(input: unknown): ActionResult {
  if (!isRecord(input)) throw new Error("insights.async.create input must be an object");
  const accessToken = requireAccessToken(input);
  const objectId = requireString(input.objectId, "objectId");
  const level = optionalString(input.level);
  const pathObject =
    level === "account" || objectId.startsWith("act_")
      ? actPath(objectId.replace(/^act_/, ""))
      : objectId;
  const auth: MetaAuthInput = { accessToken, fetch: input.fetch as typeof fetch | undefined };
  const fields: Record<string, unknown> = { async: true };
  const metrics = optionalString(input.fields);
  if (metrics) fields.fields = metrics;
  if (level) fields.level = level;
  const datePreset = optionalString(input.datePreset);
  if (datePreset) fields.date_preset = datePreset;
  if (isRecord(input.timeRange)) fields.time_range = input.timeRange;
  if (input.timeIncrement != null) fields.time_increment = input.timeIncrement;
  if (Array.isArray(input.breakdowns)) fields.breakdowns = input.breakdowns;
  if (Array.isArray(input.filtering)) fields.filtering = input.filtering;

  return graphPostForm(auth, "insights.async.create", `/${pathObject}/insights`, fields).then((body) => {
    const reportRunId =
      (isRecord(body) && typeof body.report_run_id === "string" && body.report_run_id) ||
      (isRecord(body) && typeof body.id === "string" && body.id) ||
      "";
    return {
      connector: "meta-ads",
      action: "insights.async.create",
      source: "connector",
      reportRunId,
      raw: body,
    };
  });
}

export function getAsyncInsights(input: unknown): ActionResult {
  if (!isRecord(input)) throw new Error("insights.async.get input must be an object");
  const accessToken = requireAccessToken(input);
  const reportRunId = requireString(input.reportRunId, "reportRunId");
  const fields = optionalString(input.fields) ?? REPORT_RUN_FIELDS;
  const auth: MetaAuthInput = { accessToken, fetch: input.fetch as typeof fetch | undefined };
  return graphGet(auth, "insights.async.get", `/${reportRunId}`, { fields }).then((body) => {
    if (!isRecord(body)) {
      return {
        connector: "meta-ads",
        action: "insights.async.get",
        source: "connector",
        reportRun: null,
      };
    }
    return {
      connector: "meta-ads",
      action: "insights.async.get",
      source: "connector",
      reportRun: {
        id: typeof body.id === "string" ? body.id : reportRunId,
        asyncStatus: prop(body, "async_status"),
        asyncPercentCompletion: body.async_percent_completion ?? null,
        isRunning: body.is_running ?? null,
        dateStart: prop(body, "date_start"),
        dateStop: prop(body, "date_stop"),
        raw: body,
      },
    };
  });
}

// ---------------------------------------------------------------------------
// 15. reach_estimate.get — one-shot; not delivery estimate
// ---------------------------------------------------------------------------

export function getReachEstimate(input: unknown): ActionResult {
  if (!isRecord(input)) throw new Error("reach_estimate.get input must be an object");
  const accessToken = requireAccessToken(input);
  const adAccountId = actPath(requireString(input.adAccountId, "adAccountId"));
  if (!isRecord(input.targetingSpec)) throw new Error("targetingSpec is required");
  const auth: MetaAuthInput = { accessToken, fetch: input.fetch as typeof fetch | undefined };
  const query: Record<string, string | undefined> = {
    targeting_spec: JSON.stringify(input.targetingSpec),
  };
  const objectStoreUrl = optionalString(input.objectStoreUrl);
  if (objectStoreUrl) query.object_store_url = objectStoreUrl;

  return graphGet(auth, "reach_estimate.get", `/${adAccountId}/reachestimate`, query).then((body) => {
    // Live shape: { data: { users_lower_bound, users_upper_bound, estimate_ready } }
    // or sometimes flat bounds on the root.
    const data = isRecord(body) && isRecord(body.data) ? body.data : isRecord(body) ? body : {};
    return {
      connector: "meta-ads",
      action: "reach_estimate.get",
      source: "connector",
      usersLowerBound: data.users_lower_bound ?? null,
      usersUpperBound: data.users_upper_bound ?? null,
      estimateReady: data.estimate_ready ?? null,
      raw: body,
    };
  });
}

/** Re-export for tests asserting creative update mutables ⊆ observe defaults. */
export { CREATIVE_GET_FIELDS, resolveObserveFields };
