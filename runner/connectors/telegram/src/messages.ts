import { createConnectorHttpClient, type ConnectorHttpClient } from "../../../bun/src/http";
import manifest from "../manifest.json";

export type TelegramUpdate = {
  update_id?: number;
  message?: TelegramMessage;
  [key: string]: unknown;
};

export type TelegramMessage = {
  message_id?: number;
  from?: { id?: number | string };
  chat?: { id?: number | string };
  text?: string;
  [key: string]: unknown;
};

export type NormalizedMessage = {
  id: string;
  provider: "telegram";
  providerMessageId: string;
  channelId: string;
  senderId: string;
  text: string;
  modelVersion: "2026-05-14";
  raw: TelegramUpdate;
};

export type RateLimitResult =
  | { limited: true; retryAfterSeconds: number }
  | { limited: false };

export type SendMessageInput = {
  chatId: string;
  text: string;
};

export type TelegramSendMessageClientInput = SendMessageInput & {
  botToken: string;
  fetch?: typeof fetch;
  httpClient?: ConnectorHttpClient;
};

export type TelegramSendMessageResult = {
  providerMessageId: string;
  channelId: string;
  text: string;
  raw: Record<string, unknown>;
};

export type TelegramProviderError = {
  ok: false;
  code: string;
  message: string;
  status: number;
  retryAfterSeconds?: number;
};

export async function sendTelegramMessage(input: TelegramSendMessageClientInput): Promise<TelegramSendMessageResult> {
  const validated = validateSendMessageInput(input);
  const token = requireString(input.botToken, "botToken").trim();
  if (token.length === 0) {
    throw new Error("botToken is required");
  }
  const httpClient = input.httpClient ?? createConnectorHttpClient({
    allowedHosts: manifest.network.allowedHosts,
    maxResponseBytes: manifest.operations["messages.send"].maxResponseBytes,
    fetch: input.fetch,
  });
  const response = await httpClient.fetchText(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: validated.chatId, text: validated.text }),
  });
  const body = readJsonObject(response.body);
  if (response.status < 200 || response.status >= 300) {
    throw mapTelegramError(response, body);
  }
  const result = requireRecord(body.result, "result");
  const messageID = String(requireNumberLike(result.message_id, "result.message_id"));
  const chat = requireRecord(result.chat, "result.chat");
  const channelId = String(requireNumberLike(chat.id, "result.chat.id"));
  const text = typeof result.text === "string" ? result.text : validated.text;

  return {
    providerMessageId: messageID,
    channelId,
    text,
    raw: result,
  };
}

export function normalizeMessage(update: TelegramUpdate): NormalizedMessage {
  const message = requireRecord(update.message, "message") as TelegramMessage;
  const messageID = String(requireNumberLike(message.message_id, "message.message_id"));
  const chat = requireRecord(message.chat, "message.chat");
  const from = requireRecord(message.from, "message.from");
  const channelId = String(requireNumberLike(chat.id, "message.chat.id"));
  const senderId = String(requireNumberLike(from.id, "message.from.id"));
  const text = typeof message.text === "string" ? message.text : "";

  return {
    id: `telegram:${channelId}:${messageID}`,
    provider: "telegram",
    providerMessageId: messageID,
    channelId,
    senderId,
    text,
    modelVersion: "2026-05-14",
    raw: update,
  };
}

export function parseNextOffset(response: unknown): string | null {
  if (!isRecord(response) || !Array.isArray(response.result) || response.result.length === 0) {
    return null;
  }
  const updateIDs = response.result
    .map((update) => isRecord(update) && typeof update.update_id === "number" ? update.update_id : null)
    .filter((id): id is number => id !== null);
  if (updateIDs.length === 0) {
    return null;
  }
  return String(Math.max(...updateIDs) + 1);
}

export async function parseRateLimit(response: Response): Promise<RateLimitResult> {
  if (response.status !== 429) {
    return { limited: false };
  }
  try {
    const body = await response.clone().json();
    const retryAfter = isRecord(body)
      && isRecord(body.parameters)
      && typeof body.parameters.retry_after === "number"
      ? body.parameters.retry_after
      : 0;
    return { limited: true, retryAfterSeconds: retryAfter };
  } catch {
    return { limited: true, retryAfterSeconds: 0 };
  }
}

export function validateSendMessageInput(input: unknown): SendMessageInput {
  if (!isRecord(input)) {
    throw new Error("send message input must be an object");
  }
  const chatId = requireString(input.chatId, "chatId").trim();
  const text = requireString(input.text, "text").trim();
  if (chatId.length === 0) {
    throw new Error("chatId is required");
  }
  if (text.length === 0) {
    throw new Error("text is required");
  }
  if (text.length > 4096) {
    throw new Error("text exceeds Telegram message limit");
  }
  return { chatId, text };
}

// ─── SendPhoto ────────────────────────────────────────────────────────────────

export type SendPhotoInput = {
  chatId: string;
  photo: string;
  caption?: string;
};

export type SendPhotoClientInput = SendPhotoInput & {
  botToken: string;
  fetch?: typeof fetch;
  httpClient?: ConnectorHttpClient;
};

export type SendPhotoResult = {
  providerMessageId: string;
  channelId: string;
  caption: string;
  raw: Record<string, unknown>;
};

export function validateSendPhotoInput(input: unknown): SendPhotoInput {
  if (!isRecord(input)) throw new Error("sendPhoto input must be an object");
  const chatId = requireString(input.chatId, "chatId").trim();
  if (chatId.length === 0) throw new Error("chatId is required");
  const photo = requireString(input.photo, "photo").trim();
  if (photo.length === 0) throw new Error("photo is required");
  const caption = typeof input.caption === "string" ? input.caption : undefined;
  return { chatId, photo, caption };
}

export async function sendTelegramPhoto(input: SendPhotoClientInput): Promise<SendPhotoResult> {
  const validated = validateSendPhotoInput(input);
  const token = requireString(input.botToken, "botToken").trim();
  if (token.length === 0) throw new Error("botToken is required");
  const httpClient = input.httpClient ?? createConnectorHttpClient({
    allowedHosts: manifest.network.allowedHosts,
    maxResponseBytes: manifest.operations["messages.sendPhoto"].maxResponseBytes,
    fetch: input.fetch,
  });
  const bodyObj: Record<string, unknown> = { chat_id: validated.chatId, photo: validated.photo };
  if (validated.caption !== undefined) bodyObj.caption = validated.caption;
  const response = await httpClient.fetchText(`https://api.telegram.org/bot${token}/sendPhoto`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(bodyObj),
  });
  const body = readJsonObject(response.body);
  if (response.status < 200 || response.status >= 300) {
    throw mapTelegramError(response, body);
  }
  const result = requireRecord(body.result, "result");
  const messageID = String(requireNumberLike(result.message_id, "result.message_id"));
  const chat = requireRecord(result.chat, "result.chat");
  const channelId = String(requireNumberLike(chat.id, "result.chat.id"));
  return { providerMessageId: messageID, channelId, caption: validated.caption ?? "", raw: result };
}

// ─── SendDocument ─────────────────────────────────────────────────────────────

export type SendDocumentInput = {
  chatId: string;
  document: string;
  caption?: string;
};

export type SendDocumentClientInput = SendDocumentInput & {
  botToken: string;
  fetch?: typeof fetch;
  httpClient?: ConnectorHttpClient;
};

export type SendDocumentResult = {
  providerMessageId: string;
  channelId: string;
  caption: string;
  raw: Record<string, unknown>;
};

export function validateSendDocumentInput(input: unknown): SendDocumentInput {
  if (!isRecord(input)) throw new Error("sendDocument input must be an object");
  const chatId = requireString(input.chatId, "chatId").trim();
  if (chatId.length === 0) throw new Error("chatId is required");
  const document = requireString(input.document, "document").trim();
  if (document.length === 0) throw new Error("document is required");
  const caption = typeof input.caption === "string" ? input.caption : undefined;
  return { chatId, document, caption };
}

export async function sendTelegramDocument(input: SendDocumentClientInput): Promise<SendDocumentResult> {
  const validated = validateSendDocumentInput(input);
  const token = requireString(input.botToken, "botToken").trim();
  if (token.length === 0) throw new Error("botToken is required");
  const httpClient = input.httpClient ?? createConnectorHttpClient({
    allowedHosts: manifest.network.allowedHosts,
    maxResponseBytes: manifest.operations["messages.sendDocument"].maxResponseBytes,
    fetch: input.fetch,
  });
  const bodyObj: Record<string, unknown> = { chat_id: validated.chatId, document: validated.document };
  if (validated.caption !== undefined) bodyObj.caption = validated.caption;
  const response = await httpClient.fetchText(`https://api.telegram.org/bot${token}/sendDocument`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(bodyObj),
  });
  const body = readJsonObject(response.body);
  if (response.status < 200 || response.status >= 300) {
    throw mapTelegramError(response, body);
  }
  const result = requireRecord(body.result, "result");
  const messageID = String(requireNumberLike(result.message_id, "result.message_id"));
  const chat = requireRecord(result.chat, "result.chat");
  const channelId = String(requireNumberLike(chat.id, "result.chat.id"));
  return { providerMessageId: messageID, channelId, caption: validated.caption ?? "", raw: result };
}

// ─── EditMessageText ──────────────────────────────────────────────────────────

export type EditMessageTextInput = {
  chatId: string;
  messageId: number;
  text: string;
};

export type EditMessageTextClientInput = EditMessageTextInput & {
  botToken: string;
  fetch?: typeof fetch;
  httpClient?: ConnectorHttpClient;
};

export type EditMessageTextResult = {
  providerMessageId: string;
  channelId: string;
  text: string;
  raw: Record<string, unknown>;
};

export function validateEditMessageTextInput(input: unknown): EditMessageTextInput {
  if (!isRecord(input)) throw new Error("editMessageText input must be an object");
  const chatId = requireString(input.chatId, "chatId").trim();
  if (chatId.length === 0) throw new Error("chatId is required");
  if (typeof input.messageId !== "number") throw new Error("messageId is required");
  const text = requireString(input.text, "text").trim();
  if (text.length === 0) throw new Error("text is required");
  if (text.length > 4096) throw new Error("text exceeds Telegram message limit");
  return { chatId, messageId: input.messageId, text };
}

export async function editTelegramMessage(input: EditMessageTextClientInput): Promise<EditMessageTextResult> {
  const validated = validateEditMessageTextInput(input);
  const token = requireString(input.botToken, "botToken").trim();
  if (token.length === 0) throw new Error("botToken is required");
  const httpClient = input.httpClient ?? createConnectorHttpClient({
    allowedHosts: manifest.network.allowedHosts,
    maxResponseBytes: manifest.operations["messages.edit"].maxResponseBytes,
    fetch: input.fetch,
  });
  const response = await httpClient.fetchText(`https://api.telegram.org/bot${token}/editMessageText`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: validated.chatId, message_id: validated.messageId, text: validated.text }),
  });
  const body = readJsonObject(response.body);
  if (response.status < 200 || response.status >= 300) {
    throw mapTelegramError(response, body);
  }
  const result = requireRecord(body.result, "result");
  const messageID = String(requireNumberLike(result.message_id, "result.message_id"));
  const chat = requireRecord(result.chat, "result.chat");
  const channelId = String(requireNumberLike(chat.id, "result.chat.id"));
  const text = typeof result.text === "string" ? result.text : validated.text;
  return { providerMessageId: messageID, channelId, text, raw: result };
}

// ─── DeleteMessage ────────────────────────────────────────────────────────────

export type DeleteMessageInput = {
  chatId: string;
  messageId: number;
};

export type DeleteMessageClientInput = DeleteMessageInput & {
  botToken: string;
  fetch?: typeof fetch;
  httpClient?: ConnectorHttpClient;
};

export type DeleteMessageResult = {
  deleted: boolean;
};

export function validateDeleteMessageInput(input: unknown): DeleteMessageInput {
  if (!isRecord(input)) throw new Error("deleteMessage input must be an object");
  const chatId = requireString(input.chatId, "chatId").trim();
  if (chatId.length === 0) throw new Error("chatId is required");
  if (typeof input.messageId !== "number") throw new Error("messageId is required");
  return { chatId, messageId: input.messageId };
}

export async function deleteTelegramMessage(input: DeleteMessageClientInput): Promise<DeleteMessageResult> {
  const validated = validateDeleteMessageInput(input);
  const token = requireString(input.botToken, "botToken").trim();
  if (token.length === 0) throw new Error("botToken is required");
  const httpClient = input.httpClient ?? createConnectorHttpClient({
    allowedHosts: manifest.network.allowedHosts,
    maxResponseBytes: manifest.operations["messages.delete"].maxResponseBytes,
    fetch: input.fetch,
  });
  const response = await httpClient.fetchText(`https://api.telegram.org/bot${token}/deleteMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: validated.chatId, message_id: validated.messageId }),
  });
  const body = readJsonObject(response.body);
  if (response.status < 200 || response.status >= 300) {
    throw mapTelegramError(response, body);
  }
  return { deleted: body.result === true };
}

// ─── ForwardMessage ───────────────────────────────────────────────────────────

export type ForwardMessageInput = {
  chatId: string;
  fromChatId: string;
  messageId: number;
};

export type ForwardMessageClientInput = ForwardMessageInput & {
  botToken: string;
  fetch?: typeof fetch;
  httpClient?: ConnectorHttpClient;
};

export type ForwardMessageResult = {
  providerMessageId: string;
  channelId: string;
  raw: Record<string, unknown>;
};

export function validateForwardMessageInput(input: unknown): ForwardMessageInput {
  if (!isRecord(input)) throw new Error("forwardMessage input must be an object");
  const chatId = requireString(input.chatId, "chatId").trim();
  if (chatId.length === 0) throw new Error("chatId is required");
  const fromChatId = requireString(input.fromChatId, "fromChatId").trim();
  if (fromChatId.length === 0) throw new Error("fromChatId is required");
  if (typeof input.messageId !== "number") throw new Error("messageId is required");
  return { chatId, fromChatId, messageId: input.messageId };
}

export async function forwardTelegramMessage(input: ForwardMessageClientInput): Promise<ForwardMessageResult> {
  const validated = validateForwardMessageInput(input);
  const token = requireString(input.botToken, "botToken").trim();
  if (token.length === 0) throw new Error("botToken is required");
  const httpClient = input.httpClient ?? createConnectorHttpClient({
    allowedHosts: manifest.network.allowedHosts,
    maxResponseBytes: manifest.operations["messages.forward"].maxResponseBytes,
    fetch: input.fetch,
  });
  const response = await httpClient.fetchText(`https://api.telegram.org/bot${token}/forwardMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: validated.chatId, from_chat_id: validated.fromChatId, message_id: validated.messageId }),
  });
  const body = readJsonObject(response.body);
  if (response.status < 200 || response.status >= 300) {
    throw mapTelegramError(response, body);
  }
  const result = requireRecord(body.result, "result");
  const messageID = String(requireNumberLike(result.message_id, "result.message_id"));
  const chat = requireRecord(result.chat, "result.chat");
  const channelId = String(requireNumberLike(chat.id, "result.chat.id"));
  return { providerMessageId: messageID, channelId, raw: result };
}

// ─── PinChatMessage ───────────────────────────────────────────────────────────

export type PinChatMessageInput = {
  chatId: string;
  messageId: number;
  disableNotification?: boolean;
};

export type PinChatMessageClientInput = PinChatMessageInput & {
  botToken: string;
  fetch?: typeof fetch;
  httpClient?: ConnectorHttpClient;
};

export type PinChatMessageResult = {
  pinned: boolean;
};

export function validatePinChatMessageInput(input: unknown): PinChatMessageInput {
  if (!isRecord(input)) throw new Error("pinChatMessage input must be an object");
  const chatId = requireString(input.chatId, "chatId").trim();
  if (chatId.length === 0) throw new Error("chatId is required");
  if (typeof input.messageId !== "number") throw new Error("messageId is required");
  const disableNotification = typeof input.disableNotification === "boolean" ? input.disableNotification : undefined;
  return { chatId, messageId: input.messageId, disableNotification };
}

export async function pinTelegramMessage(input: PinChatMessageClientInput): Promise<PinChatMessageResult> {
  const validated = validatePinChatMessageInput(input);
  const token = requireString(input.botToken, "botToken").trim();
  if (token.length === 0) throw new Error("botToken is required");
  const httpClient = input.httpClient ?? createConnectorHttpClient({
    allowedHosts: manifest.network.allowedHosts,
    maxResponseBytes: manifest.operations["messages.pin"].maxResponseBytes,
    fetch: input.fetch,
  });
  const bodyObj: Record<string, unknown> = { chat_id: validated.chatId, message_id: validated.messageId };
  if (validated.disableNotification !== undefined) bodyObj.disable_notification = validated.disableNotification;
  const response = await httpClient.fetchText(`https://api.telegram.org/bot${token}/pinChatMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(bodyObj),
  });
  const body = readJsonObject(response.body);
  if (response.status < 200 || response.status >= 300) {
    throw mapTelegramError(response, body);
  }
  return { pinned: body.result === true };
}

export function mapTelegramError(response: Response | { status: number }, body: Record<string, unknown>): TelegramProviderError {
  const description = typeof body.description === "string" && body.description.length > 0
    ? body.description
    : "Telegram request failed";
  const errorCode = typeof body.error_code === "number" ? body.error_code : response.status;
  const retryAfter = isRecord(body.parameters) && typeof body.parameters.retry_after === "number"
    ? body.parameters.retry_after
    : undefined;

  if (response.status === 429 || errorCode === 429) {
    return {
      ok: false,
      code: "RATE_LIMITED",
      message: description,
      status: response.status,
      retryAfterSeconds: retryAfter ?? 0,
    };
  }
  if (response.status === 401 || errorCode === 401) {
    return { ok: false, code: "AUTHENTICATION_FAILED", message: description, status: response.status };
  }
  if (response.status === 400 || errorCode === 400) {
    return { ok: false, code: "INVALID_REQUEST", message: description, status: response.status };
  }
  return { ok: false, code: "PROVIDER_ERROR", message: description, status: response.status };
}

function readJsonObject(bodyText: string): Record<string, unknown> {
  try {
    const body = JSON.parse(bodyText);
    return isRecord(body) ? body : {};
  } catch {
    return {};
  }
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`${field} is required`);
  }
  return value;
}

function requireNumberLike(value: unknown, field: string): number | string {
  if (typeof value !== "number" && typeof value !== "string") {
    throw new Error(`${field} is required`);
  }
  return value;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`${field} is required`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
