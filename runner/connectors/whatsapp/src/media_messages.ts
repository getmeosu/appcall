import { createConnectorHttpClient, type ConnectorHttpClient } from "../../../bun/src/http";
import manifest from "../manifest.json";
import { mapWhatsAppError, type ConnectorError } from "./messages";

const defaultGraphVersion = "v25.0";

// ─── Shared helpers ───────────────────────────────────────────────────────────

export function requireString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`${field} is required`);
  }
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

function readProviderMessageID(body: Record<string, unknown>): string {
  if (!Array.isArray(body.messages) || body.messages.length === 0) return "";
  const message = body.messages[0];
  return isRecord(message) && typeof message.id === "string" ? message.id : "";
}

function resolveVersion(input: Record<string, unknown>): string {
  const v = typeof input.graphVersion === "string" && input.graphVersion.length > 0
    ? input.graphVersion.trim()
    : defaultGraphVersion;
  if (!/^v\d+\.\d+$/.test(v)) throw new Error("graphVersion must be a Graph API version like v25.0");
  return v;
}

type SendResult =
  | { ok: true; providerMessageId: string; channelId: string; raw: Record<string, unknown> }
  | { ok: false; error: ConnectorError };

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

async function postMessage(
  httpClient: ConnectorHttpClient,
  accessToken: string,
  url: string,
  body: Record<string, unknown>,
  errorMsg: string,
): Promise<SendResult> {
  const response = await httpClient.fetchText(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const parsed = readJsonObject(response.body);
  if (response.status < 200 || response.status >= 300) {
    return { ok: false, error: mapWhatsAppError(response, parsed) };
  }
  const providerMessageId = readProviderMessageID(parsed);
  if (providerMessageId === "") {
    return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: errorMsg } };
  }
  return { ok: true, providerMessageId, channelId: "", raw: parsed };
}

async function putMessage(
  httpClient: ConnectorHttpClient,
  accessToken: string,
  url: string,
  body: Record<string, unknown>,
  errorMsg: string,
): Promise<{ ok: true; raw: Record<string, unknown> } | { ok: false; error: ConnectorError }> {
  const response = await httpClient.fetchText(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const parsed = readJsonObject(response.body);
  if (response.status < 200 || response.status >= 300) {
    return { ok: false, error: mapWhatsAppError(response, parsed) };
  }
  return { ok: true, raw: parsed };
}

// ─── messages.sendTemplate ────────────────────────────────────────────────────

export type WhatsAppSendTemplateInput = {
  graphVersion: string;
  phoneNumberId: string;
  to: string;
  templateName: string;
  languageCode: string;
  components: unknown[];
};

export function validateSendTemplateInput(input: unknown): WhatsAppSendTemplateInput {
  if (!isRecord(input)) throw new Error("sendTemplate input must be an object");
  const graphVersion = resolveVersion(input);
  const phoneNumberId = requireString(input.phoneNumberId, "phoneNumberId").trim();
  if (!phoneNumberId) throw new Error("phoneNumberId is required");
  const to = requireString(input.to, "to").trim();
  if (!to) throw new Error("to is required");
  const templateName = requireString(input.templateName, "templateName").trim();
  if (!templateName) throw new Error("templateName is required");
  const languageCode = typeof input.languageCode === "string" && input.languageCode.trim().length > 0
    ? input.languageCode.trim()
    : "en_US";
  const components = Array.isArray(input.components) ? input.components : [];
  return { graphVersion, phoneNumberId, to, templateName, languageCode, components };
}

export function createSendTemplateClient(options: ClientOptions) {
  const accessToken = requireString(options.accessToken, "accessToken").trim();
  if (!accessToken) throw new Error("accessToken is required");
  const httpClient = makeHttpClient(accessToken, options, "messages.sendTemplate");
  return {
    async sendTemplate(input: unknown): Promise<SendResult> {
      const payload = validateSendTemplateInput(input);
      const url = `https://graph.facebook.com/${payload.graphVersion}/${payload.phoneNumberId}/messages`;
      const result = await postMessage(httpClient, accessToken, url, {
        messaging_product: "whatsapp",
        to: payload.to,
        type: "template",
        template: {
          name: payload.templateName,
          language: { code: payload.languageCode },
          components: payload.components,
        },
      }, "WhatsApp returned an invalid template send response.");
      if (result.ok) result.channelId = payload.phoneNumberId;
      return result;
    },
  };
}

// ─── messages.sendImage ───────────────────────────────────────────────────────

export type WhatsAppSendImageInput = {
  graphVersion: string;
  phoneNumberId: string;
  to: string;
  imageUrl: string;
  caption: string;
};

export function validateSendImageInput(input: unknown): WhatsAppSendImageInput {
  if (!isRecord(input)) throw new Error("sendImage input must be an object");
  const graphVersion = resolveVersion(input);
  const phoneNumberId = requireString(input.phoneNumberId, "phoneNumberId").trim();
  if (!phoneNumberId) throw new Error("phoneNumberId is required");
  const to = requireString(input.to, "to").trim();
  if (!to) throw new Error("to is required");
  const imageUrl = requireString(input.imageUrl, "imageUrl").trim();
  if (!imageUrl) throw new Error("imageUrl is required");
  const caption = typeof input.caption === "string" ? input.caption : "";
  return { graphVersion, phoneNumberId, to, imageUrl, caption };
}

export function createSendImageClient(options: ClientOptions) {
  const accessToken = requireString(options.accessToken, "accessToken").trim();
  if (!accessToken) throw new Error("accessToken is required");
  const httpClient = makeHttpClient(accessToken, options, "messages.sendImage");
  return {
    async sendImage(input: unknown): Promise<SendResult> {
      const payload = validateSendImageInput(input);
      const url = `https://graph.facebook.com/${payload.graphVersion}/${payload.phoneNumberId}/messages`;
      const imageObj: Record<string, string> = { link: payload.imageUrl };
      if (payload.caption) imageObj.caption = payload.caption;
      const result = await postMessage(httpClient, accessToken, url, {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: payload.to,
        type: "image",
        image: imageObj,
      }, "WhatsApp returned an invalid image send response.");
      if (result.ok) result.channelId = payload.phoneNumberId;
      return result;
    },
  };
}

// ─── messages.sendDocument ────────────────────────────────────────────────────

export type WhatsAppSendDocumentInput = {
  graphVersion: string;
  phoneNumberId: string;
  to: string;
  documentUrl: string;
  filename: string;
  caption: string;
};

export function validateSendDocumentInput(input: unknown): WhatsAppSendDocumentInput {
  if (!isRecord(input)) throw new Error("sendDocument input must be an object");
  const graphVersion = resolveVersion(input);
  const phoneNumberId = requireString(input.phoneNumberId, "phoneNumberId").trim();
  if (!phoneNumberId) throw new Error("phoneNumberId is required");
  const to = requireString(input.to, "to").trim();
  if (!to) throw new Error("to is required");
  const documentUrl = requireString(input.documentUrl, "documentUrl").trim();
  if (!documentUrl) throw new Error("documentUrl is required");
  const filename = typeof input.filename === "string" ? input.filename.trim() : "";
  const caption = typeof input.caption === "string" ? input.caption : "";
  return { graphVersion, phoneNumberId, to, documentUrl, filename, caption };
}

export function createSendDocumentClient(options: ClientOptions) {
  const accessToken = requireString(options.accessToken, "accessToken").trim();
  if (!accessToken) throw new Error("accessToken is required");
  const httpClient = makeHttpClient(accessToken, options, "messages.sendDocument");
  return {
    async sendDocument(input: unknown): Promise<SendResult> {
      const payload = validateSendDocumentInput(input);
      const url = `https://graph.facebook.com/${payload.graphVersion}/${payload.phoneNumberId}/messages`;
      const docObj: Record<string, string> = { link: payload.documentUrl };
      if (payload.filename) docObj.filename = payload.filename;
      if (payload.caption) docObj.caption = payload.caption;
      const result = await postMessage(httpClient, accessToken, url, {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: payload.to,
        type: "document",
        document: docObj,
      }, "WhatsApp returned an invalid document send response.");
      if (result.ok) result.channelId = payload.phoneNumberId;
      return result;
    },
  };
}

// ─── messages.sendLocation ────────────────────────────────────────────────────

export type WhatsAppSendLocationInput = {
  graphVersion: string;
  phoneNumberId: string;
  to: string;
  latitude: number;
  longitude: number;
  name: string;
  address: string;
};

export function validateSendLocationInput(input: unknown): WhatsAppSendLocationInput {
  if (!isRecord(input)) throw new Error("sendLocation input must be an object");
  const graphVersion = resolveVersion(input);
  const phoneNumberId = requireString(input.phoneNumberId, "phoneNumberId").trim();
  if (!phoneNumberId) throw new Error("phoneNumberId is required");
  const to = requireString(input.to, "to").trim();
  if (!to) throw new Error("to is required");
  if (typeof input.latitude !== "number") throw new Error("latitude must be a number");
  if (typeof input.longitude !== "number") throw new Error("longitude must be a number");
  if (input.latitude < -90 || input.latitude > 90) throw new Error("latitude must be between -90 and 90");
  if (input.longitude < -180 || input.longitude > 180) throw new Error("longitude must be between -180 and 180");
  const name = typeof input.name === "string" ? input.name : "";
  const address = typeof input.address === "string" ? input.address : "";
  return { graphVersion, phoneNumberId, to, latitude: input.latitude, longitude: input.longitude, name, address };
}

export function createSendLocationClient(options: ClientOptions) {
  const accessToken = requireString(options.accessToken, "accessToken").trim();
  if (!accessToken) throw new Error("accessToken is required");
  const httpClient = makeHttpClient(accessToken, options, "messages.sendLocation");
  return {
    async sendLocation(input: unknown): Promise<SendResult> {
      const payload = validateSendLocationInput(input);
      const url = `https://graph.facebook.com/${payload.graphVersion}/${payload.phoneNumberId}/messages`;
      const locObj: Record<string, unknown> = {
        latitude: payload.latitude,
        longitude: payload.longitude,
      };
      if (payload.name) locObj.name = payload.name;
      if (payload.address) locObj.address = payload.address;
      const result = await postMessage(httpClient, accessToken, url, {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: payload.to,
        type: "location",
        location: locObj,
      }, "WhatsApp returned an invalid location send response.");
      if (result.ok) result.channelId = payload.phoneNumberId;
      return result;
    },
  };
}

// ─── messages.sendContacts ────────────────────────────────────────────────────

export type WhatsAppSendContactsInput = {
  graphVersion: string;
  phoneNumberId: string;
  to: string;
  contacts: unknown[];
};

export function validateSendContactsInput(input: unknown): WhatsAppSendContactsInput {
  if (!isRecord(input)) throw new Error("sendContacts input must be an object");
  const graphVersion = resolveVersion(input);
  const phoneNumberId = requireString(input.phoneNumberId, "phoneNumberId").trim();
  if (!phoneNumberId) throw new Error("phoneNumberId is required");
  const to = requireString(input.to, "to").trim();
  if (!to) throw new Error("to is required");
  if (!Array.isArray(input.contacts) || input.contacts.length === 0) throw new Error("contacts must be a non-empty array");
  return { graphVersion, phoneNumberId, to, contacts: input.contacts };
}

export function createSendContactsClient(options: ClientOptions) {
  const accessToken = requireString(options.accessToken, "accessToken").trim();
  if (!accessToken) throw new Error("accessToken is required");
  const httpClient = makeHttpClient(accessToken, options, "messages.sendContacts");
  return {
    async sendContacts(input: unknown): Promise<SendResult> {
      const payload = validateSendContactsInput(input);
      const url = `https://graph.facebook.com/${payload.graphVersion}/${payload.phoneNumberId}/messages`;
      const result = await postMessage(httpClient, accessToken, url, {
        messaging_product: "whatsapp",
        to: payload.to,
        type: "contacts",
        contacts: payload.contacts,
      }, "WhatsApp returned an invalid contacts send response.");
      if (result.ok) result.channelId = payload.phoneNumberId;
      return result;
    },
  };
}

// ─── messages.sendReaction ────────────────────────────────────────────────────

export type WhatsAppSendReactionInput = {
  graphVersion: string;
  phoneNumberId: string;
  to: string;
  messageId: string;
  emoji: string;
};

export function validateSendReactionInput(input: unknown): WhatsAppSendReactionInput {
  if (!isRecord(input)) throw new Error("sendReaction input must be an object");
  const graphVersion = resolveVersion(input);
  const phoneNumberId = requireString(input.phoneNumberId, "phoneNumberId").trim();
  if (!phoneNumberId) throw new Error("phoneNumberId is required");
  const to = requireString(input.to, "to").trim();
  if (!to) throw new Error("to is required");
  const messageId = requireString(input.messageId, "messageId").trim();
  if (!messageId) throw new Error("messageId is required");
  const emoji = requireString(input.emoji, "emoji").trim();
  if (!emoji) throw new Error("emoji is required");
  return { graphVersion, phoneNumberId, to, messageId, emoji };
}

export function createSendReactionClient(options: ClientOptions) {
  const accessToken = requireString(options.accessToken, "accessToken").trim();
  if (!accessToken) throw new Error("accessToken is required");
  const httpClient = makeHttpClient(accessToken, options, "messages.sendReaction");
  return {
    async sendReaction(input: unknown): Promise<SendResult> {
      const payload = validateSendReactionInput(input);
      const url = `https://graph.facebook.com/${payload.graphVersion}/${payload.phoneNumberId}/messages`;
      const result = await postMessage(httpClient, accessToken, url, {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: payload.to,
        type: "reaction",
        reaction: {
          message_id: payload.messageId,
          emoji: payload.emoji,
        },
      }, "WhatsApp returned an invalid reaction send response.");
      if (result.ok) result.channelId = payload.phoneNumberId;
      return result;
    },
  };
}

// ─── messages.markRead ────────────────────────────────────────────────────────

export type WhatsAppMarkReadInput = {
  graphVersion: string;
  phoneNumberId: string;
  messageId: string;
};

export type MarkReadResult =
  | { ok: true; success: boolean; raw: Record<string, unknown> }
  | { ok: false; error: ConnectorError };

export function validateMarkReadInput(input: unknown): WhatsAppMarkReadInput {
  if (!isRecord(input)) throw new Error("markRead input must be an object");
  const graphVersion = resolveVersion(input);
  const phoneNumberId = requireString(input.phoneNumberId, "phoneNumberId").trim();
  if (!phoneNumberId) throw new Error("phoneNumberId is required");
  const messageId = requireString(input.messageId, "messageId").trim();
  if (!messageId) throw new Error("messageId is required");
  return { graphVersion, phoneNumberId, messageId };
}

export function createMarkReadClient(options: ClientOptions) {
  const accessToken = requireString(options.accessToken, "accessToken").trim();
  if (!accessToken) throw new Error("accessToken is required");
  const httpClient = makeHttpClient(accessToken, options, "messages.markRead");
  return {
    async markRead(input: unknown): Promise<MarkReadResult> {
      const payload = validateMarkReadInput(input);
      const url = `https://graph.facebook.com/${payload.graphVersion}/${payload.phoneNumberId}/messages`;
      const result = await putMessage(httpClient, accessToken, url, {
        messaging_product: "whatsapp",
        status: "read",
        message_id: payload.messageId,
      }, "WhatsApp returned an invalid mark-read response.");
      if (!result.ok) return result;
      const success = result.raw.success === true;
      return { ok: true, success, raw: result.raw };
    },
  };
}

// ─── messages.sendInteractive ─────────────────────────────────────────────────

export type WhatsAppSendInteractiveInput = {
  graphVersion: string;
  phoneNumberId: string;
  to: string;
  interactiveType: string;
  interactive: unknown;
};

export function validateSendInteractiveInput(input: unknown): WhatsAppSendInteractiveInput {
  if (!isRecord(input)) throw new Error("sendInteractive input must be an object");
  const graphVersion = resolveVersion(input);
  const phoneNumberId = requireString(input.phoneNumberId, "phoneNumberId").trim();
  if (!phoneNumberId) throw new Error("phoneNumberId is required");
  const to = requireString(input.to, "to").trim();
  if (!to) throw new Error("to is required");
  if (!isRecord(input.interactive)) throw new Error("interactive must be an object");
  const interactiveType = requireString(input.interactiveType, "interactiveType").trim();
  if (!["button", "list", "product", "product_list"].includes(interactiveType)) {
    throw new Error("interactiveType must be one of: button, list, product, product_list");
  }
  return { graphVersion, phoneNumberId, to, interactiveType, interactive: input.interactive };
}

export function createSendInteractiveClient(options: ClientOptions) {
  const accessToken = requireString(options.accessToken, "accessToken").trim();
  if (!accessToken) throw new Error("accessToken is required");
  const httpClient = makeHttpClient(accessToken, options, "messages.sendInteractive");
  return {
    async sendInteractive(input: unknown): Promise<SendResult> {
      const payload = validateSendInteractiveInput(input);
      const url = `https://graph.facebook.com/${payload.graphVersion}/${payload.phoneNumberId}/messages`;
      const interactiveObj = isRecord(payload.interactive)
        ? { ...payload.interactive, type: payload.interactiveType }
        : { type: payload.interactiveType };
      const result = await postMessage(httpClient, accessToken, url, {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: payload.to,
        type: "interactive",
        interactive: interactiveObj,
      }, "WhatsApp returned an invalid interactive send response.");
      if (result.ok) result.channelId = payload.phoneNumberId;
      return result;
    },
  };
}
