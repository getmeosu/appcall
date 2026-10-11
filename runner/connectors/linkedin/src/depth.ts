// Handlers for LinkedIn calls the declarative template cannot express:
// Rest.li List() query syntax, image-URN post content, and the multi-step
// video upload. Declarative operations live on the manifest; these are the
// irregular ones. video_url is refused so a caller cannot turn the runner
// into an open fetch (SSRF). Bytes must be supplied inline.

import { ConnectorHttpError, createConnectorHttpClient } from "../../../bun/src/http";
import manifest from "../manifest.json";
import { parseLinkedInRateLimit } from "./http";

const LINKEDIN_VERSION = "202609";
const API = "https://api.linkedin.com";
const DEFAULT_IMAGE_RECIPE = "urn:li:digitalmediaRecipe:feedshare-image";
const VIDEO_STATUS_READS = 3;

type Json = Record<string, unknown>;
type FieldType = "string" | "integer" | "boolean" | "object" | "array";
type Field = { key: string; type: FieldType; required?: boolean; enum?: readonly string[] };

const operations = manifest.operations as Record<string, { maxResponseBytes?: number; timeoutMs?: number }>;

export function publishPost(input: unknown): Json | Promise<Json> {
  return run("posts.publish", input, PUBLISH_FIELDS, (raw, validated) => publishPostCall(raw, validated));
}

export function deleteShare(input: unknown): Json | Promise<Json> {
  const validated = validate(input, [{ key: "share_id", type: "string", required: true }]);
  const id = numericShareId(String(validated.share_id));
  if (!hasToken(input)) return { connector: "linkedin", action: "posts.share.delete", source: "connector", validated };
  return call(input, {
    operation: "posts.share.delete",
    method: "DELETE",
    url: `${API}/v2/shares/${encodeURIComponent(id)}`,
    success: [200, 204],
  }).then(() => ({ connector: "linkedin", action: "posts.share.delete", source: "provider", deleted: true }));
}

export function batchGetImages(input: unknown): Json | Promise<Json> {
  return run("images.batchGet", input, [{ key: "ids", type: "array", required: true }], async (raw, validated) => {
    const ids = stringList(validated.ids, "ids");
    const response = await call(raw, {
      operation: "images.batchGet",
      method: "GET",
      url: `${API}/rest/images?ids=${restliList(ids)}`,
      success: [200],
      versioned: true,
      extraHeaders: { "X-RestLi-Method": "BATCH_GET" },
    });
    return { data: response.body };
  });
}

export function getOrganizationPageStats(input: unknown): Json | Promise<Json> {
  return run("organizations.pageStats.get", input, PAGE_STATS_FIELDS, async (raw, validated) => {
    const params = new URLSearchParams();
    params.set("q", "organization");
    params.set("organization", String(validated.organization));
    const interval = pageStatsInterval(validated);
    if (interval) params.set("timeIntervals", interval);
    const response = await call(raw, {
      operation: "organizations.pageStats.get",
      method: "GET",
      url: `${API}/rest/organizationPageStatistics?${params.toString()}`,
      success: [200],
      versioned: true,
      extraHeaders: { "X-RestLi-Method": "FINDER" },
    });
    return { data: response.body };
  });
}

export function getVideos(input: unknown): Json | Promise<Json> {
  return run("videos.get", input, VIDEO_GET_FIELDS, async (raw, validated) => {
    const single = typeof validated.video_urn === "string" ? validated.video_urn : "";
    const many = validated.video_ids;
    if (single && many) throw new Error("video_urn and video_ids are mutually exclusive");
    if (!single && !many) throw new Error("video_urn or video_ids is required");
    if (single) {
      const response = await call(raw, {
        operation: "videos.get",
        method: "GET",
        url: `${API}/rest/videos/${encodeURIComponent(single)}`,
        success: [200],
        versioned: true,
      });
      return { data: response.body };
    }
    const ids = stringList(many, "video_ids");
    const response = await call(raw, {
      operation: "videos.get",
      method: "GET",
      url: `${API}/rest/videos?ids=${restliList(ids)}`,
      success: [200],
      versioned: true,
      extraHeaders: { "X-RestLi-Method": "BATCH_GET" },
    });
    return { data: response.body };
  });
}

export function registerImageUpload(input: unknown): Json | Promise<Json> {
  return run("assets.registerUpload", input, REGISTER_FIELDS, async (raw, validated) => {
    const recipe = typeof validated.recipe === "string" && validated.recipe ? validated.recipe : DEFAULT_IMAGE_RECIPE;
    const body: Json = {
      registerUploadRequest: {
        recipes: [recipe],
        owner: validated.owner_urn,
        serviceRelationships: [{ relationshipType: "OWNER", identifier: "urn:li:userGeneratedContent" }],
      },
    };
    if (validated.supported_upload_mechanism) {
      (body.registerUploadRequest as Json).supportedUploadMechanism = validated.supported_upload_mechanism;
    }
    const response = await call(raw, {
      operation: "assets.registerUpload",
      method: "POST",
      url: `${API}/v2/assets?action=registerUpload`,
      success: [200, 201],
      json: body,
    });
    return { data: response.body };
  });
}

export function uploadVideo(input: unknown): Json | Promise<Json> {
  const validated = validate(input, UPLOAD_FIELDS);
  assertVideoSource(isRecord(input) ? input : {});
  if (!hasToken(input)) {
    return { connector: "linkedin", action: "videos.upload", source: "connector", validated };
  }
  return uploadVideoCall(input as Json, validated).then((data) => ({
    connector: "linkedin",
    action: "videos.upload",
    source: "provider",
    ...data,
  }));
}

const PUBLISH_FIELDS: Field[] = [
  { key: "author", type: "string", required: true },
  { key: "commentary", type: "string", required: true },
  { key: "visibility", type: "string", enum: ["PUBLIC", "CONNECTIONS", "LOGGED_IN", "CONTAINER"] },
  { key: "lifecycleState", type: "string", enum: ["PUBLISHED", "DRAFT", "PUBLISH_REQUESTED"] },
  { key: "distribution", type: "object" },
  { key: "container", type: "string" },
  { key: "reshareContext", type: "object" },
  { key: "contentLandingPage", type: "string" },
  { key: "contentCallToActionLabel", type: "string", enum: ["APPLY", "DOWNLOAD", "VIEW_QUOTE", "LEARN_MORE", "SIGN_UP", "SUBSCRIBE", "REGISTER", "JOIN", "ATTEND", "REQUEST_DEMO", "SEE_MORE", "BUY_NOW", "SHOP_NOW"] },
  { key: "isReshareDisabledByAuthor", type: "boolean" },
  { key: "content", type: "object" },
  { key: "images", type: "array" },
];

const PAGE_STATS_FIELDS: Field[] = [
  { key: "organization", type: "string", required: true },
  { key: "timeRangeStart", type: "integer" },
  { key: "timeRangeEnd", type: "integer" },
  { key: "timeGranularityType", type: "string", enum: ["DAY", "MONTH"] },
  { key: "timeIntervals", type: "string" },
];

const VIDEO_GET_FIELDS: Field[] = [
  { key: "video_urn", type: "string" },
  { key: "video_ids", type: "array" },
];

const REGISTER_FIELDS: Field[] = [
  { key: "owner_urn", type: "string", required: true },
  { key: "recipe", type: "string" },
  { key: "supported_upload_mechanism", type: "array" },
];

const UPLOAD_FIELDS: Field[] = [
  { key: "owner", type: "string" },
  { key: "video_base64", type: "string" },
  { key: "video_url", type: "string" },
  { key: "file", type: "object" },
];

function run(action: string, input: unknown, fields: Field[], execute: (raw: Json, validated: Json) => Promise<Json>): Json | Promise<Json> {
  const validated = validate(input, fields);
  if (!hasToken(input)) return { connector: "linkedin", action, source: "connector", validated };
  return execute(input as Json, validated).then((data) => ({ connector: "linkedin", action, source: "provider", ...data }));
}

async function publishPostCall(raw: Json, validated: Json): Promise<Json> {
  const body: Json = {
    author: validated.author,
    commentary: validated.commentary,
    visibility: validated.visibility ?? "PUBLIC",
    distribution: validated.distribution ?? {
      feedDistribution: "MAIN_FEED",
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: validated.lifecycleState ?? "PUBLISHED",
  };
  const content = postContent(validated.content, validated.images);
  if (content !== undefined) body.content = content;
  for (const key of ["container", "reshareContext", "contentLandingPage", "contentCallToActionLabel"] as const) {
    if (validated[key] !== undefined) body[key] = validated[key];
  }
  if (typeof validated.isReshareDisabledByAuthor === "boolean") body.isReshareDisabledByAuthor = validated.isReshareDisabledByAuthor;
  const response = await call(raw, {
    operation: "posts.publish",
    method: "POST",
    url: `${API}/rest/posts`,
    success: [200, 201],
    versioned: true,
    json: body,
  });
  const id = response.headers["x-restli-id"];
  return id ? { data: response.body, id } : { data: response.body };
}

async function uploadVideoCall(raw: Json, validated: Json): Promise<Json> {
  const bytes = decodeVideo(videoSource(raw));
  let owner = typeof validated.owner === "string" ? validated.owner : "";
  if (!owner) {
    const me = await call(raw, { operation: "videos.upload", method: "GET", url: `${API}/v2/userinfo`, success: [200] });
    const sub = isRecord(me.body) && typeof me.body.sub === "string" ? me.body.sub : "";
    if (!sub) throw upstream("videos.upload", "LinkedIn userinfo did not include a member id.");
    owner = `urn:li:person:${sub}`;
  }
  const initialized = await call(raw, {
    operation: "videos.upload",
    method: "POST",
    url: `${API}/rest/videos?action=initializeUpload`,
    success: [200, 201],
    versioned: true,
    json: {
      initializeUploadRequest: {
        owner,
        fileSizeBytes: bytes.byteLength,
        uploadCaptions: false,
        uploadThumbnail: false,
      },
    },
  });
  const value = isRecord(initialized.body) && isRecord(initialized.body.value) ? initialized.body.value : {};
  const video = typeof value.video === "string" ? value.video : "";
  const uploadToken = typeof value.uploadToken === "string" ? value.uploadToken : "";
  const instructions = Array.isArray(value.uploadInstructions) ? value.uploadInstructions : [];
  if (!video || instructions.length === 0) throw upstream("videos.upload", "LinkedIn did not return video upload instructions.");
  const uploadedPartIds: string[] = [];
  for (const instruction of instructions) {
    if (!isRecord(instruction) || typeof instruction.uploadUrl !== "string") throw upstream("videos.upload", "LinkedIn returned an invalid upload instruction.");
    const first = typeof instruction.firstByte === "number" ? instruction.firstByte : 0;
    const last = typeof instruction.lastByte === "number" ? instruction.lastByte : bytes.byteLength - 1;
    if (!Number.isInteger(first) || !Number.isInteger(last) || first < 0 || last < first || last >= bytes.byteLength) {
      throw upstream("videos.upload", "LinkedIn upload instruction is outside the video.");
    }
    const put = await call(raw, {
      operation: "videos.upload",
      method: "PUT",
      url: instruction.uploadUrl,
      success: [200, 201],
      raw: bytes.subarray(first, last + 1),
      signedUpload: true,
    });
    const etag = put.headers.etag ?? "";
    uploadedPartIds.push(etag.replace(/^"|"$/g, ""));
  }
  const finalized = await call(raw, {
    operation: "videos.upload",
    method: "POST",
    url: `${API}/rest/videos?action=finalizeUpload`,
    success: [200, 201],
    versioned: true,
    json: { finalizeUploadRequest: { video, uploadToken, uploadedPartIds } },
  });
  let status: unknown = null;
  for (let attempt = 0; attempt < VIDEO_STATUS_READS; attempt++) {
    const read = await call(raw, {
      operation: "videos.upload",
      method: "GET",
      url: `${API}/rest/videos/${encodeURIComponent(video)}`,
      success: [200],
      versioned: true,
    });
    status = read.body;
    const state = isRecord(status) && typeof status.status === "string" ? status.status : "";
    if (state === "AVAILABLE" || state === "READY") break;
  }
  return { data: { video, upload: initialized.body, finalized: finalized.body, status } };
}

type Call = {
  operation: string;
  method: string;
  url: string;
  success: number[];
  versioned?: boolean;
  extraHeaders?: Record<string, string>;
  json?: unknown;
  raw?: Uint8Array;
  signedUpload?: boolean;
};

async function call(raw: Json, spec: Call): Promise<{ status: number; headers: Record<string, string>; body: unknown }> {
  const token = String(raw.accessToken);
  const budget = operations[spec.operation] ?? {};
  const headers: Record<string, string> = { Accept: "application/json", ...(spec.extraHeaders ?? {}) };
  if (!spec.signedUpload) {
    headers.Authorization = `Bearer ${token}`;
    headers["X-Restli-Protocol-Version"] = "2.0.0";
    if (spec.versioned) headers["Linkedin-Version"] = LINKEDIN_VERSION;
  }
  let body: string | Uint8Array | undefined;
  if (spec.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(spec.json);
  } else if (spec.raw) {
    headers["Content-Type"] = "application/octet-stream";
    body = spec.raw;
  }
  const client = createConnectorHttpClient({
    allowedHosts: manifest.network.allowedHosts as string[],
    maxResponseBytes: budget.maxResponseBytes ?? 1048576,
    timeoutMs: budget.timeoutMs ?? 15000,
    fetch: typeof raw.fetch === "function" ? (raw.fetch as typeof fetch) : undefined,
  });
  try {
    const response = await client.fetchText(spec.url, { method: spec.method, headers, body });
    if (!spec.success.includes(response.status)) throw httpFailure(spec.operation, response.status, response.headers, response.body, token);
    return { status: response.status, headers: response.headers, body: parseBody(response.body) };
  } catch (error) {
    if (error instanceof ConnectorHttpError) throw { ok: false, code: error.code, message: error.message };
    throw error;
  }
}

function httpFailure(operation: string, status: number, headers: Record<string, string>, body: string, token: string): Json {
  const limited = parseLinkedInRateLimit(status, headers);
  if (limited.limited) {
    return { ok: false, code: "CONNECTOR_RATE_LIMITED", message: "LinkedIn rate limit exceeded.", retryAfterSeconds: limited.retryAfterSeconds };
  }
  const parsed = parseBody(body);
  let message = `LinkedIn rejected the ${operation} request.`;
  if (isRecord(parsed) && typeof parsed.message === "string" && parsed.message) message = parsed.message;
  if (token) message = message.split(token).join("[redacted]");
  return { ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message };
}

function upstream(operation: string, message: string): Json {
  return { ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message: message || `LinkedIn rejected the ${operation} request.` };
}

function pageStatsInterval(validated: Json): string | undefined {
  const explicit = typeof validated.timeIntervals === "string" ? validated.timeIntervals : "";
  const parts = [validated.timeRangeStart, validated.timeRangeEnd, validated.timeGranularityType].filter((value) => value !== undefined);
  if (explicit && parts.length > 0) throw new Error("timeIntervals cannot be combined with timeRangeStart, timeRangeEnd, or timeGranularityType");
  if (explicit) return explicit;
  if (parts.length === 0) return undefined;
  if (parts.length !== 3) throw new Error("timeRangeStart, timeRangeEnd, and timeGranularityType are required together");
  return `(timeRange:(start:${validated.timeRangeStart},end:${validated.timeRangeEnd}),timeGranularityType:${validated.timeGranularityType})`;
}

function postContent(content: unknown, images: unknown): unknown {
  if (content !== undefined) return content;
  if (!Array.isArray(images) || images.length === 0) return undefined;
  const items = images.map(imageItem);
  if (items.length === 1) return { media: items[0] };
  return { multiImage: { images: items } };
}

function imageItem(value: unknown): Json {
  if (typeof value === "string" && value) return { id: value };
  if (isRecord(value) && typeof value.id === "string" && value.id) {
    const item: Json = { id: value.id };
    if (typeof value.altText === "string" && value.altText) item.altText = value.altText;
    if (typeof value.title === "string" && value.title) item.title = value.title;
    return item;
  }
  throw new Error("images entries must be URN strings or objects with id");
}

function numericShareId(value: string): string {
  const trimmed = value.trim();
  const id = trimmed.startsWith("urn:li:share:") ? trimmed.slice("urn:li:share:".length) : trimmed;
  if (!/^[0-9]+$/.test(id)) throw new Error("share_id must be a numeric id or urn:li:share:{id}");
  return id;
}

function stringList(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== "string" || item.length === 0)) {
    throw new Error(`${field} must be a non-empty array of strings`);
  }
  return value as string[];
}

function restliList(urns: string[]): string {
  return `List(${urns.map((urn) => encodeURIComponent(urn)).join(",")})`;
}

function assertVideoSource(input: Json): void {
  videoSource(input);
}

function videoSource(input: Json): string {
  if (typeof input.video_url === "string" && input.video_url) {
    throw new Error("video_url is not fetched; pass video_base64 or file.data");
  }
  if (typeof input.video_base64 === "string" && input.video_base64) return input.video_base64;
  const file = isRecord(input.file) ? input.file : undefined;
  if (file && typeof file.data === "string" && file.data) return file.data;
  if (file && typeof file.url === "string" && file.url.startsWith("data:")) return file.url;
  if (file && typeof file.s3key === "string" && file.s3key) throw new Error("file.s3key is not readable; pass file.data");
  throw new Error("video_base64 or file.data is required");
}

function decodeVideo(source: string): Uint8Array {
  const payload = source.startsWith("data:") ? source.slice(source.indexOf(",") + 1) : source;
  const bytes = Buffer.from(payload.replace(/\s/g, ""), "base64");
  if (bytes.byteLength === 0) throw new Error("video bytes are empty");
  return new Uint8Array(bytes);
}

function validate(input: unknown, fields: Field[]): Json {
  if (!isRecord(input)) throw new Error("input must be an object");
  const validated: Json = {};
  for (const field of fields) {
    const value = input[field.key];
    if (value === undefined || value === null || value === "") {
      if (field.required) throw new Error(`${field.key} is required`);
      continue;
    }
    assertField(field, value);
    validated[field.key] = value;
  }
  return validated;
}

function assertField(field: Field, value: unknown): void {
  const ok =
    (field.type === "string" && typeof value === "string") ||
    (field.type === "integer" && typeof value === "number" && Number.isInteger(value)) ||
    (field.type === "boolean" && typeof value === "boolean") ||
    (field.type === "array" && Array.isArray(value)) ||
    (field.type === "object" && isRecord(value));
  if (!ok) throw new Error(`${field.key} must be ${field.type === "integer" || field.type === "array" || field.type === "object" ? "an" : "a"} ${field.type}`);
  if (field.enum && !field.enum.includes(String(value))) throw new Error(`${field.key} must be one of: ${field.enum.join(", ")}`);
}

function hasToken(input: unknown): input is Json {
  return isRecord(input) && typeof input.accessToken === "string" && input.accessToken.length > 0;
}

function parseBody(raw: string): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function isRecord(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
