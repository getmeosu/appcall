import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import { createConnectorHttpClient, ConnectorHttpError } from "../../../bun/src/http";
import type { CompiledHandler } from "../../../bun/src/declarative/types";
import manifest from "../manifest.json";

const compiled = compileDeclarativeConnector(manifest as never);
const operationSchemas = manifest.operations as Record<string, { inputSchema?: { properties?: Record<string, unknown> } }>;

const shotMaxBytes = 8 * 1024 * 1024;
const attachmentMaxBytes = 10 * 1024 * 1024;
const defaultRetryAfterSeconds = 60;
const maxRetryAfterSeconds = 3600;

type FetchFn = typeof fetch;

type ShotInput = {
  accessToken: string;
  title: string;
  image: Uint8Array;
  imageFileName: string;
  imageContentType: string;
  description?: string;
  tags?: string[];
  lowProfile?: boolean;
  reboundSourceId?: number;
  scheduledFor?: string;
  teamId?: number;
  fetch?: FetchFn;
};

type AttachmentInput = {
  accessToken: string;
  shotId: number;
  file: Uint8Array;
  fileName: string;
  contentType: string;
  fetch?: FetchFn;
};

export function aliasInput(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const next: Record<string, unknown> = { ...value };
  if (next.id === undefined) {
    if (next.shot_id !== undefined) next.id = next.shot_id;
    else if (next.project_id !== undefined) next.id = next.project_id;
    else if (next.attachment_id !== undefined) next.id = next.attachment_id;
  }
  if (next.shotId === undefined && (next.shot_id !== undefined || next.id !== undefined)) {
    next.shotId = next.shot_id ?? next.id;
  }
  if (next.perPage === undefined && next.per_page !== undefined) next.perPage = next.per_page;
  if (next.page === undefined && next.next_cursor !== undefined) {
    const page = parseCursor(next.next_cursor);
    if (page !== undefined) next.page = page;
  }
  if (next.lowProfile === undefined && next.low_profile !== undefined) next.lowProfile = next.low_profile;
  if (next.teamId === undefined && next.team_id !== undefined) next.teamId = next.team_id;
  if (next.scheduledFor === undefined && next.scheduled_for !== undefined) next.scheduledFor = next.scheduled_for;
  if (next.reboundSourceId === undefined && next.rebound_source_id !== undefined) {
    next.reboundSourceId = next.rebound_source_id;
  }
  if (next.remove_team === true && next.team_id === undefined && next.teamId === undefined) {
    next.team_id = "";
  }
  if (isFileRecord(next.image)) {
    const image = next.image;
    if (next.imageFileName === undefined) {
      next.imageFileName = image.name ?? image.filename ?? image.image_filename;
    }
    if (next.imageContentType === undefined) {
      next.imageContentType = image.mimetype ?? image.content_type ?? image.mime_type;
    }
  }
  if (isFileRecord(next.file)) {
    const file = next.file;
    if (next.fileName === undefined) next.fileName = file.name ?? file.filename ?? file.file_name;
    if (next.contentType === undefined) next.contentType = file.mimetype ?? file.content_type ?? file.mime_type;
  }
  return next;
}

export function createShot(inputValue: unknown): Promise<Record<string, unknown>> {
  try {
    const input = validateShotInput(aliasInput(inputValue));
    return postMultipart({
      action: "shots.create",
      path: "/shots",
      success: [202, 201, 200],
      form: buildShotForm(input),
      input,
      maxBytes: (manifest.operations as Record<string, { maxResponseBytes?: number; timeoutMs?: number }>)["shots.create"],
    });
  } catch (error) {
    return Promise.reject(error);
  }
}

export function createAttachment(inputValue: unknown): Promise<Record<string, unknown>> {
  try {
    const input = validateAttachmentInput(aliasInput(inputValue));
    const form = new FormData();
    form.append("file", new Blob([input.file], { type: input.contentType }), input.fileName);
    return postMultipart({
      action: "attachments.create",
      path: `/shots/${input.shotId}/attachments`,
      success: [202, 201, 200],
      form,
      input,
      maxBytes: (manifest.operations as Record<string, { maxResponseBytes?: number; timeoutMs?: number }>)["attachments.create"],
    });
  } catch (error) {
    return Promise.reject(error);
  }
}

export const actions: Record<string, CompiledHandler> = {};
for (const [key, handler] of Object.entries(compiled.actions)) {
  actions[key] = (input) => handler(declaredInput(key, input) as never);
}

function declaredInput(key: string, value: unknown): unknown {
  const input = aliasInput(value);
  if (!isRecord(input)) return input;
  const properties = operationSchemas[key]?.inputSchema?.properties ?? {};
  return Object.fromEntries(
    Object.entries(input).filter(([name]) => name in properties || name === "accessToken" || name === "fetch"),
  );
}
actions["shots.create"] = createShot as CompiledHandler;
actions["attachments.create"] = createAttachment as CompiledHandler;

function buildShotForm(input: ShotInput): FormData {
  const form = new FormData();
  form.append("image", new Blob([input.image], { type: input.imageContentType }), input.imageFileName);
  form.append("title", input.title);
  if (input.description !== undefined) form.append("description", input.description);
  if (input.lowProfile !== undefined) form.append("low_profile", input.lowProfile ? "true" : "false");
  if (input.reboundSourceId !== undefined) form.append("rebound_source_id", String(input.reboundSourceId));
  if (input.scheduledFor !== undefined) form.append("scheduled_for", input.scheduledFor);
  if (input.teamId !== undefined) form.append("team_id", String(input.teamId));
  if (input.tags) {
    for (const tag of input.tags) form.append("tags[]", tag);
  }
  return form;
}

function postMultipart(options: {
  action: string;
  path: string;
  success: number[];
  form: FormData;
  input: { accessToken: string; fetch?: FetchFn };
  maxBytes?: { maxResponseBytes?: number; timeoutMs?: number };
}): Promise<Record<string, unknown>> {
  const client = createConnectorHttpClient({
    allowedHosts: manifest.network.allowedHosts as string[],
    maxResponseBytes: options.maxBytes?.maxResponseBytes ?? 5242880,
    timeoutMs: options.maxBytes?.timeoutMs ?? 30000,
    fetch: options.input.fetch,
  });
  const url = new URL(`https://api.dribbble.com/v2${options.path}`);
  return client.fetchText(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.input.accessToken}`,
      Accept: "application/json",
    },
    body: options.form,
  }).then((response) => finish(options.action, response, options.success)).catch((error) => {
    if (error instanceof ConnectorHttpError) {
      throw { ok: false, code: error.code, message: error.message };
    }
    throw error;
  });
}

function finish(
  action: string,
  response: { status: number; headers: Record<string, string>; body: string },
  success: number[],
): Record<string, unknown> {
  if (response.status === 429) {
    throw {
      ok: false,
      code: "CONNECTOR_RATE_LIMITED",
      message: "Dribbble rate limit exceeded.",
      retryAfterSeconds: retryAfterSeconds(response.headers),
    };
  }
  if (!success.includes(response.status)) {
    throw {
      ok: false,
      code: "CONNECTOR_UPSTREAM_ERROR",
      message: upstreamMessage(response),
    };
  }
  const location = header(response.headers, "location");
  const parsed = parseBody(response.body);
  const shotId = shotIdFromLocation(location);
  return {
    connector: "dribbble",
    action,
    source: "provider",
    accepted: true,
    ...(location ? { location } : {}),
    ...(shotId !== undefined ? { shotId } : {}),
    ...(isRecord(parsed) ? { data: parsed } : parsed !== undefined ? { data: parsed } : {}),
  };
}

function validateShotInput(value: unknown): ShotInput {
  if (!isRecord(value)) return invalidInput("Provide title and image bytes to create a shot.");
  if (typeof value.accessToken !== "string" || value.accessToken.length === 0) {
    return invalidInput("Provide title and image bytes to create a shot.");
  }
  if (typeof value.title !== "string" || value.title.trim().length === 0) {
    return invalidInput("Provide title and image bytes to create a shot.");
  }
  const imageSource = isFileRecord(value.image)
    ? value.image.content ?? value.image.content_base64 ?? value.image.data ?? value.image.file_content
    : value.image ?? value.imageBase64 ?? value.image_content;
  const image = decodeFile(imageSource);
  if (!image || image.byteLength === 0 || image.byteLength > shotMaxBytes) {
    return invalidInput("Provide a GIF, JPG, or PNG image of at most 8 MB.");
  }
  const tags = asStringArray(value.tags);
  if (tags !== undefined && (tags.length > 12 || tags.some((tag) => tag.length === 0))) {
    return invalidInput("Provide at most 12 non-empty tags.");
  }
  const reboundSourceId = optionalPositiveInteger(value.reboundSourceId ?? value.rebound_source_id);
  const teamId = optionalPositiveInteger(value.teamId ?? value.team_id);
  if ((value.reboundSourceId ?? value.rebound_source_id) !== undefined && reboundSourceId === undefined) {
    return invalidInput("reboundSourceId must be a positive integer.");
  }
  if ((value.teamId ?? value.team_id) !== undefined && teamId === undefined) {
    return invalidInput("teamId must be a positive integer.");
  }
  const lowProfile = value.lowProfile ?? value.low_profile;
  if (lowProfile !== undefined && typeof lowProfile !== "boolean") {
    return invalidInput("lowProfile must be a boolean.");
  }
  const scheduledFor = value.scheduledFor ?? value.scheduled_for;
  if (scheduledFor !== undefined && (typeof scheduledFor !== "string" || scheduledFor.length === 0)) {
    return invalidInput("scheduledFor must be an ISO 8601 timestamp.");
  }
  if (value.description !== undefined && typeof value.description !== "string") {
    return invalidInput("description must be a string.");
  }
  const imageRecord = isFileRecord(value.image) ? value.image : {};
  const imageFileName = optionalFileName(
    value.imageFileName ?? value.filename ?? value.image_filename ?? imageRecord.name ?? imageRecord.filename,
  ) ?? "shot.png";
  const imageContentType = optionalContentType(
    value.imageContentType ?? value.contentType ?? imageRecord.mimetype ?? imageRecord.content_type,
  ) ?? sniffImageType(image) ?? "image/png";
  return {
    accessToken: value.accessToken,
    title: value.title,
    image,
    imageFileName,
    imageContentType,
    description: typeof value.description === "string" ? value.description : undefined,
    tags,
    lowProfile: typeof lowProfile === "boolean" ? lowProfile : undefined,
    reboundSourceId,
    scheduledFor: typeof scheduledFor === "string" ? scheduledFor : undefined,
    teamId,
    fetch: typeof value.fetch === "function" ? value.fetch as FetchFn : undefined,
  };
}

function validateAttachmentInput(value: unknown): AttachmentInput {
  if (!isRecord(value)) return invalidInput("Provide shotId and file bytes to upload an attachment.");
  if (typeof value.accessToken !== "string" || value.accessToken.length === 0) {
    return invalidInput("Provide shotId and file bytes to upload an attachment.");
  }
  const shotId = optionalPositiveInteger(value.shotId ?? value.shot_id);
  if (shotId === undefined) return invalidInput("Provide shotId and file bytes to upload an attachment.");
  const fileSource = isFileRecord(value.file)
    ? value.file.content ?? value.file.content_base64 ?? value.file.data ?? value.file.file_content
    : value.file ?? value.fileBase64 ?? value.file_content;
  const file = decodeFile(fileSource);
  if (!file || file.byteLength === 0 || file.byteLength > attachmentMaxBytes) {
    return invalidInput("Provide an attachment file of at most 10 MB.");
  }
  const fileRecord = isFileRecord(value.file) ? value.file : {};
  const fileName = optionalFileName(
    value.fileName ?? value.filename ?? value.file_name ?? fileRecord.name ?? fileRecord.filename,
  ) ?? "attachment.bin";
  const contentType = optionalContentType(
    value.contentType ?? value.content_type ?? fileRecord.mimetype ?? fileRecord.content_type,
  ) ?? "application/octet-stream";
  return {
    accessToken: value.accessToken,
    shotId,
    file,
    fileName,
    contentType,
    fetch: typeof value.fetch === "function" ? value.fetch as FetchFn : undefined,
  };
}

function decodeFile(value: unknown): Uint8Array | undefined {
  if (value instanceof Uint8Array) return value.byteLength > 0 ? value : undefined;
  if (ArrayBuffer.isView(value)) {
    const view = value as ArrayBufferView;
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  }
  if (isRecord(value)) {
    return decodeFile(value.content ?? value.content_base64 ?? value.data ?? value.file_content);
  }
  if (typeof value !== "string" || value.length === 0) return undefined;
  const dataUrl = value.match(/^data:[^;]+;base64,(.+)$/i);
  const compact = (dataUrl?.[1] ?? value).replace(/\s+/g, "");
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(compact) && compact.length % 4 === 0 && compact.length >= 4) {
    try {
      const binary = atob(compact);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      if (bytes.byteLength > 0) return bytes;
    } catch {
      // Fall through to UTF-8 encoding of the original string.
    }
  }
  return new TextEncoder().encode(value);
}

function sniffImageType(bytes: Uint8Array): string | undefined {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "image/gif";
  return undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    return invalidInput("tags must be an array of strings.");
  }
  return value as string[];
}

function optionalPositiveInteger(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 1) return value;
  if (typeof value === "string" && /^[1-9][0-9]*$/.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed)) return parsed;
  }
  return undefined;
}

function optionalFileName(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length === 0 || value.length > 255 || /[\u0000\r\n\\/]/.test(value)) {
    return invalidInput("file name must be a path-free basename.");
  }
  return value;
}

function optionalContentType(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length > 255
    || !/^[\w.+-]+\/[\w.+-]+(?:\s*;[^\r\n]*)?$/.test(value)
  ) {
    return invalidInput("content type must be a MIME type.");
  }
  return value;
}

function parseCursor(value: unknown): number | undefined {
  if (typeof value === "number") return optionalPositiveInteger(value);
  if (typeof value !== "string" || value.length === 0) return undefined;
  if (/^[1-9][0-9]*$/.test(value)) return Number(value);
  try {
    const url = value.includes("://") ? new URL(value) : new URL(value, "https://api.dribbble.com/v2/user/shots");
    const page = url.searchParams.get("page");
    if (page) return optionalPositiveInteger(page);
  } catch {
    const match = value.match(/[?&]page=([1-9][0-9]*)/);
    if (match) return Number(match[1]);
  }
  return undefined;
}

function parseBody(body: string): unknown {
  const trimmed = body.trim();
  if (trimmed === "") return undefined;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    throw { ok: false, code: "CONNECTOR_RESPONSE_INVALID", message: "Connector returned invalid JSON." };
  }
}

function shotIdFromLocation(location: string | undefined): number | undefined {
  if (!location) return undefined;
  const match = location.match(/\/shots\/(\d+)(?:\D|$)/);
  if (!match) return undefined;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) && id >= 1 ? id : undefined;
}

function retryAfterSeconds(headers: Record<string, string>): number {
  const raw = header(headers, "x-ratelimit-reset");
  const parsed = raw === undefined ? Number.NaN : Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return defaultRetryAfterSeconds;
  const seconds = Math.ceil(parsed - Date.now() / 1000);
  return seconds > 0 && seconds <= maxRetryAfterSeconds ? seconds : defaultRetryAfterSeconds;
}

function header(headers: Record<string, string>, name: string): string | undefined {
  const needle = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === needle && value.length > 0) return value;
  }
  return undefined;
}

function upstreamMessage(response: { status: number; body: string }): string {
  const parsed = (() => {
    try {
      return JSON.parse(response.body) as unknown;
    } catch {
      return undefined;
    }
  })();
  if (isRecord(parsed) && typeof parsed.message === "string" && parsed.message.length > 0) {
    return parsed.message;
  }
  return `Dribbble rejected the upload (HTTP ${response.status}).`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFileRecord(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && !ArrayBuffer.isView(value);
}

function invalidInput(message: string): never {
  throw { ok: false, code: "INVALID_ACTION_INPUT", message };
}
