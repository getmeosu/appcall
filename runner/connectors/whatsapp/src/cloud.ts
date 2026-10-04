import { createConnectorHttpClient, type ConnectorHttpClient } from "../../../bun/src/http";
import manifest from "../manifest.json";
import { mapWhatsAppError, type ConnectorError } from "./messages";

const defaultGraphVersion = "v25.0";

export function requireString(value: unknown, field: string): string {
  if (typeof value !== "string") throw new Error(`${field} is required`);
  return value;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readJsonObject(bodyText: string): Record<string, unknown> {
  try {
    const body = JSON.parse(bodyText);
    return isRecord(body) ? body : {};
  } catch {
    return {};
  }
}

function resolveVersion(input: Record<string, unknown>): string {
  const v = typeof input.graphVersion === "string" && input.graphVersion.length > 0
    ? input.graphVersion.trim()
    : defaultGraphVersion;
  if (!/^v\d+\.\d+$/.test(v)) throw new Error("graphVersion must be a Graph API version like v25.0");
  return v;
}

function requirePhoneNumberId(input: Record<string, unknown>): string {
  const phoneNumberId = requireString(input.phoneNumberId, "phoneNumberId").trim();
  if (!phoneNumberId) throw new Error("phoneNumberId is required");
  return phoneNumberId;
}

type ClientOptions = {
  accessToken: string;
  fetch?: typeof fetch;
  httpClient?: ConnectorHttpClient;
};

function makeHttpClient(accessToken: string, options: ClientOptions, opKey: string): ConnectorHttpClient {
  return options.httpClient ?? createConnectorHttpClient({
    allowedHosts: manifest.network.allowedHosts,
    maxResponseBytes: (manifest.operations as Record<string, { maxResponseBytes: number }>)[opKey]?.maxResponseBytes ?? 1048576,
    fetch: options.fetch,
  });
}

function requireAccessToken(options: ClientOptions): string {
  const accessToken = requireString(options.accessToken, "accessToken").trim();
  if (!accessToken) throw new Error("accessToken is required");
  return accessToken;
}

function readProviderMessageID(body: Record<string, unknown>): string {
  if (!Array.isArray(body.messages) || body.messages.length === 0) return "";
  const message = body.messages[0];
  return isRecord(message) && typeof message.id === "string" ? message.id : "";
}

type SendResult =
  | { ok: true; providerMessageId: string; channelId: string; raw: Record<string, unknown> }
  | { ok: false; error: ConnectorError };

async function graphRequest(
  httpClient: ConnectorHttpClient,
  accessToken: string,
  url: string,
  init: RequestInit,
): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; error: ConnectorError }> {
  const headers = new Headers(init.headers);
  if (!headers.has("Authorization")) headers.set("Authorization", `Bearer ${accessToken}`);
  const response = await httpClient.fetchText(url, { ...init, headers });
  const parsed = readJsonObject(response.body);
  if (response.status < 200 || response.status >= 300) {
    return { ok: false, error: mapWhatsAppError(response, parsed) };
  }
  return { ok: true, body: parsed };
}

async function postMessage(
  httpClient: ConnectorHttpClient,
  accessToken: string,
  url: string,
  body: Record<string, unknown>,
  errorMsg: string,
): Promise<SendResult> {
  const result = await graphRequest(httpClient, accessToken, url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!result.ok) return result;
  const providerMessageId = readProviderMessageID(result.body);
  if (providerMessageId === "") {
    return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: errorMsg } };
  }
  return { ok: true, providerMessageId, channelId: "", raw: result.body };
}

// ─── messages.get ─────────────────────────────────────────────────────────────

export type WhatsAppGetMessageInput = {
  graphVersion: string;
  phoneNumberId: string;
  messageId: string;
};

export function validateGetMessageInput(input: unknown): WhatsAppGetMessageInput {
  if (!isRecord(input)) throw new Error("getMessage input must be an object");
  const messageId = requireString(input.messageId, "messageId").trim();
  if (!messageId) throw new Error("messageId is required");
  return { graphVersion: resolveVersion(input), phoneNumberId: requirePhoneNumberId(input), messageId };
}

export function createGetMessageClient(options: ClientOptions) {
  const accessToken = requireAccessToken(options);
  const httpClient = makeHttpClient(accessToken, options, "messages.get");
  return {
    async getMessage(input: unknown): Promise<{ ok: true; message: Record<string, unknown> } | { ok: false; error: ConnectorError }> {
      const payload = validateGetMessageInput(input);
      const result = await graphRequest(
        httpClient,
        accessToken,
        `https://graph.facebook.com/${payload.graphVersion}/${payload.messageId}`,
        { method: "GET" },
      );
      if (!result.ok) return result;
      return { ok: true, message: result.body };
    },
  };
}

// ─── templates.list ───────────────────────────────────────────────────────────

export type WhatsAppListTemplatesInput = {
  graphVersion: string;
  phoneNumberId: string;
  wabaId: string;
  limit?: number;
  after?: string;
};

export function validateListTemplatesInput(input: unknown): WhatsAppListTemplatesInput {
  if (!isRecord(input)) throw new Error("listTemplates input must be an object");
  const wabaId = requireString(input.wabaId, "wabaId").trim();
  if (!wabaId) throw new Error("wabaId is required");
  const limit = typeof input.limit === "number" ? input.limit : undefined;
  const after = typeof input.after === "string" && input.after.trim().length > 0 ? input.after.trim() : undefined;
  return { graphVersion: resolveVersion(input), phoneNumberId: requirePhoneNumberId(input), wabaId, limit, after };
}

export function createListTemplatesClient(options: ClientOptions) {
  const accessToken = requireAccessToken(options);
  const httpClient = makeHttpClient(accessToken, options, "templates.list");
  return {
    async listTemplates(input: unknown): Promise<
      { ok: true; templates: unknown[]; paging: unknown; raw: Record<string, unknown> } | { ok: false; error: ConnectorError }
    > {
      const payload = validateListTemplatesInput(input);
      const url = new URL(`https://graph.facebook.com/${payload.graphVersion}/${payload.wabaId}/message_templates`);
      if (payload.limit !== undefined) url.searchParams.set("limit", String(payload.limit));
      if (payload.after) url.searchParams.set("after", payload.after);
      const result = await graphRequest(httpClient, accessToken, url.toString(), { method: "GET" });
      if (!result.ok) return result;
      const templates = Array.isArray(result.body.data) ? result.body.data : [];
      return { ok: true, templates, paging: result.body.paging ?? null, raw: result.body };
    },
  };
}

// ─── media.get ────────────────────────────────────────────────────────────────

export type WhatsAppGetMediaInput = {
  graphVersion: string;
  phoneNumberId: string;
  mediaId: string;
};

export function validateGetMediaInput(input: unknown): WhatsAppGetMediaInput {
  if (!isRecord(input)) throw new Error("getMedia input must be an object");
  const mediaId = requireString(input.mediaId, "mediaId").trim();
  if (!mediaId) throw new Error("mediaId is required");
  return { graphVersion: resolveVersion(input), phoneNumberId: requirePhoneNumberId(input), mediaId };
}

export function createGetMediaClient(options: ClientOptions) {
  const accessToken = requireAccessToken(options);
  const httpClient = makeHttpClient(accessToken, options, "media.get");
  return {
    async getMedia(input: unknown): Promise<{ ok: true; media: Record<string, unknown> } | { ok: false; error: ConnectorError }> {
      const payload = validateGetMediaInput(input);
      const result = await graphRequest(
        httpClient,
        accessToken,
        `https://graph.facebook.com/${payload.graphVersion}/${payload.mediaId}`,
        { method: "GET" },
      );
      if (!result.ok) return result;
      return { ok: true, media: result.body };
    },
  };
}

// ─── media.upload ─────────────────────────────────────────────────────────────

export type WhatsAppUploadMediaInput = {
  graphVersion: string;
  phoneNumberId: string;
  filename: string;
  mimeType: string;
  fileBase64: string;
};

export function validateUploadMediaInput(input: unknown): WhatsAppUploadMediaInput {
  if (!isRecord(input)) throw new Error("uploadMedia input must be an object");
  const filename = requireString(input.filename, "filename").trim();
  if (!filename) throw new Error("filename is required");
  const mimeType = requireString(input.mimeType, "mimeType").trim();
  if (!mimeType) throw new Error("mimeType is required");
  const fileBase64 = requireString(input.fileBase64, "fileBase64").trim();
  if (!fileBase64) throw new Error("fileBase64 is required");
  return {
    graphVersion: resolveVersion(input),
    phoneNumberId: requirePhoneNumberId(input),
    filename,
    mimeType,
    fileBase64,
  };
}

export function createUploadMediaClient(options: ClientOptions) {
  const accessToken = requireAccessToken(options);
  const httpClient = makeHttpClient(accessToken, options, "media.upload");
  return {
    async uploadMedia(input: unknown): Promise<{ ok: true; mediaId: string; raw: Record<string, unknown> } | { ok: false; error: ConnectorError }> {
      const payload = validateUploadMediaInput(input);
      let bytes: Uint8Array;
      try {
        bytes = Buffer.from(payload.fileBase64, "base64");
      } catch {
        return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "fileBase64 is not valid base64." } };
      }
      const form = new FormData();
      form.append("messaging_product", "whatsapp");
      form.append("type", payload.mimeType);
      form.append("file", new Blob([bytes], { type: payload.mimeType }), payload.filename);
      const result = await graphRequest(
        httpClient,
        accessToken,
        `https://graph.facebook.com/${payload.graphVersion}/${payload.phoneNumberId}/media`,
        { method: "POST", body: form },
      );
      if (!result.ok) return result;
      const mediaId = typeof result.body.id === "string" ? result.body.id : "";
      if (!mediaId) {
        return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "WhatsApp returned an invalid media upload response." } };
      }
      return { ok: true, mediaId, raw: result.body };
    },
  };
}

// ─── media.delete ─────────────────────────────────────────────────────────────

export type WhatsAppDeleteMediaInput = {
  graphVersion: string;
  phoneNumberId: string;
  mediaId: string;
};

export function validateDeleteMediaInput(input: unknown): WhatsAppDeleteMediaInput {
  if (!isRecord(input)) throw new Error("deleteMedia input must be an object");
  const mediaId = requireString(input.mediaId, "mediaId").trim();
  if (!mediaId) throw new Error("mediaId is required");
  return { graphVersion: resolveVersion(input), phoneNumberId: requirePhoneNumberId(input), mediaId };
}

export function createDeleteMediaClient(options: ClientOptions) {
  const accessToken = requireAccessToken(options);
  const httpClient = makeHttpClient(accessToken, options, "media.delete");
  return {
    async deleteMedia(input: unknown): Promise<{ ok: true; success: boolean; raw: Record<string, unknown> } | { ok: false; error: ConnectorError }> {
      const payload = validateDeleteMediaInput(input);
      const result = await graphRequest(
        httpClient,
        accessToken,
        `https://graph.facebook.com/${payload.graphVersion}/${payload.mediaId}`,
        { method: "DELETE" },
      );
      if (!result.ok) return result;
      return { ok: true, success: result.body.success === true, raw: result.body };
    },
  };
}

// ─── messages.sendAudio ───────────────────────────────────────────────────────

export type WhatsAppSendAudioInput = {
  graphVersion: string;
  phoneNumberId: string;
  to: string;
  audioUrl: string;
};

export function validateSendAudioInput(input: unknown): WhatsAppSendAudioInput {
  if (!isRecord(input)) throw new Error("sendAudio input must be an object");
  const to = requireString(input.to, "to").trim();
  if (!to) throw new Error("to is required");
  const audioUrl = requireString(input.audioUrl, "audioUrl").trim();
  if (!audioUrl) throw new Error("audioUrl is required");
  return { graphVersion: resolveVersion(input), phoneNumberId: requirePhoneNumberId(input), to, audioUrl };
}

export function createSendAudioClient(options: ClientOptions) {
  const accessToken = requireAccessToken(options);
  const httpClient = makeHttpClient(accessToken, options, "messages.sendAudio");
  return {
    async sendAudio(input: unknown): Promise<SendResult> {
      const payload = validateSendAudioInput(input);
      const result = await postMessage(
        httpClient,
        accessToken,
        `https://graph.facebook.com/${payload.graphVersion}/${payload.phoneNumberId}/messages`,
        {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: payload.to,
          type: "audio",
          audio: { link: payload.audioUrl },
        },
        "WhatsApp returned an invalid audio send response.",
      );
      if (result.ok) result.channelId = payload.phoneNumberId;
      return result;
    },
  };
}

// ─── messages.sendVideo ───────────────────────────────────────────────────────

export type WhatsAppSendVideoInput = {
  graphVersion: string;
  phoneNumberId: string;
  to: string;
  videoUrl: string;
  caption: string;
};

export function validateSendVideoInput(input: unknown): WhatsAppSendVideoInput {
  if (!isRecord(input)) throw new Error("sendVideo input must be an object");
  const to = requireString(input.to, "to").trim();
  if (!to) throw new Error("to is required");
  const videoUrl = requireString(input.videoUrl, "videoUrl").trim();
  if (!videoUrl) throw new Error("videoUrl is required");
  const caption = typeof input.caption === "string" ? input.caption : "";
  return { graphVersion: resolveVersion(input), phoneNumberId: requirePhoneNumberId(input), to, videoUrl, caption };
}

export function createSendVideoClient(options: ClientOptions) {
  const accessToken = requireAccessToken(options);
  const httpClient = makeHttpClient(accessToken, options, "messages.sendVideo");
  return {
    async sendVideo(input: unknown): Promise<SendResult> {
      const payload = validateSendVideoInput(input);
      const video: Record<string, string> = { link: payload.videoUrl };
      if (payload.caption) video.caption = payload.caption;
      const result = await postMessage(
        httpClient,
        accessToken,
        `https://graph.facebook.com/${payload.graphVersion}/${payload.phoneNumberId}/messages`,
        {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: payload.to,
          type: "video",
          video,
        },
        "WhatsApp returned an invalid video send response.",
      );
      if (result.ok) result.channelId = payload.phoneNumberId;
      return result;
    },
  };
}

// ─── businessProfile.get ──────────────────────────────────────────────────────

export type WhatsAppGetBusinessProfileInput = {
  graphVersion: string;
  phoneNumberId: string;
};

export function validateGetBusinessProfileInput(input: unknown): WhatsAppGetBusinessProfileInput {
  if (!isRecord(input)) throw new Error("getBusinessProfile input must be an object");
  return { graphVersion: resolveVersion(input), phoneNumberId: requirePhoneNumberId(input) };
}

export function createGetBusinessProfileClient(options: ClientOptions) {
  const accessToken = requireAccessToken(options);
  const httpClient = makeHttpClient(accessToken, options, "businessProfile.get");
  return {
    async getBusinessProfile(input: unknown): Promise<
      { ok: true; profile: Record<string, unknown>; raw: Record<string, unknown> } | { ok: false; error: ConnectorError }
    > {
      const payload = validateGetBusinessProfileInput(input);
      const url = new URL(`https://graph.facebook.com/${payload.graphVersion}/${payload.phoneNumberId}/whatsapp_business_profile`);
      url.searchParams.set("fields", "about,address,description,email,profile_picture_url,websites,vertical");
      const result = await graphRequest(httpClient, accessToken, url.toString(), { method: "GET" });
      if (!result.ok) return result;
      const first = Array.isArray(result.body.data) && isRecord(result.body.data[0]) ? result.body.data[0] : {};
      return { ok: true, profile: first, raw: result.body };
    },
  };
}

// ─── businessProfile.update ───────────────────────────────────────────────────

export type WhatsAppUpdateBusinessProfileInput = {
  graphVersion: string;
  phoneNumberId: string;
  about?: string;
  address?: string;
  description?: string;
  email?: string;
  vertical?: string;
  websites?: unknown[];
};

export function validateUpdateBusinessProfileInput(input: unknown): WhatsAppUpdateBusinessProfileInput {
  if (!isRecord(input)) throw new Error("updateBusinessProfile input must be an object");
  const payload: WhatsAppUpdateBusinessProfileInput = {
    graphVersion: resolveVersion(input),
    phoneNumberId: requirePhoneNumberId(input),
  };
  for (const field of ["about", "address", "description", "email", "vertical"] as const) {
    if (typeof input[field] === "string") payload[field] = input[field] as string;
  }
  if (Array.isArray(input.websites)) payload.websites = input.websites;
  return payload;
}

export function createUpdateBusinessProfileClient(options: ClientOptions) {
  const accessToken = requireAccessToken(options);
  const httpClient = makeHttpClient(accessToken, options, "businessProfile.update");
  return {
    async updateBusinessProfile(input: unknown): Promise<{ ok: true; success: boolean; raw: Record<string, unknown> } | { ok: false; error: ConnectorError }> {
      const payload = validateUpdateBusinessProfileInput(input);
      const body: Record<string, unknown> = { messaging_product: "whatsapp" };
      if (payload.about !== undefined) body.about = payload.about;
      if (payload.address !== undefined) body.address = payload.address;
      if (payload.description !== undefined) body.description = payload.description;
      if (payload.email !== undefined) body.email = payload.email;
      if (payload.vertical !== undefined) body.vertical = payload.vertical;
      if (payload.websites !== undefined) body.websites = payload.websites;
      const result = await graphRequest(
        httpClient,
        accessToken,
        `https://graph.facebook.com/${payload.graphVersion}/${payload.phoneNumberId}/whatsapp_business_profile`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
      );
      if (!result.ok) return result;
      return { ok: true, success: result.body.success === true, raw: result.body };
    },
  };
}

// ─── phoneNumbers.get ─────────────────────────────────────────────────────────

export type WhatsAppGetPhoneNumberInput = {
  graphVersion: string;
  phoneNumberId: string;
};

export function validateGetPhoneNumberInput(input: unknown): WhatsAppGetPhoneNumberInput {
  if (!isRecord(input)) throw new Error("getPhoneNumber input must be an object");
  return { graphVersion: resolveVersion(input), phoneNumberId: requirePhoneNumberId(input) };
}

export function createGetPhoneNumberClient(options: ClientOptions) {
  const accessToken = requireAccessToken(options);
  const httpClient = makeHttpClient(accessToken, options, "phoneNumbers.get");
  return {
    async getPhoneNumber(input: unknown): Promise<{ ok: true; phoneNumber: Record<string, unknown> } | { ok: false; error: ConnectorError }> {
      const payload = validateGetPhoneNumberInput(input);
      const url = new URL(`https://graph.facebook.com/${payload.graphVersion}/${payload.phoneNumberId}`);
      url.searchParams.set("fields", "verified_name,display_phone_number,quality_rating,code_verification_status");
      const result = await graphRequest(httpClient, accessToken, url.toString(), { method: "GET" });
      if (!result.ok) return result;
      return { ok: true, phoneNumber: result.body };
    },
  };
}
