import { createConnectorHttpClient, type ConnectorHttpClient } from "../../../bun/src/http";
import manifest from "../manifest.json";
import { mapTelegramError } from "./messages";

// ─── Types ────────────────────────────────────────────────────────────────────

export type TelegramChat = {
  id: number | string;
  type: string;
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
  description?: string;
  [key: string]: unknown;
};

// ─── GetChat ──────────────────────────────────────────────────────────────────

export type GetChatInput = {
  chatId: string;
};

export type GetChatClientInput = GetChatInput & {
  botToken: string;
  fetch?: typeof fetch;
  httpClient?: ConnectorHttpClient;
};

export type GetChatResult = {
  chat: TelegramChat;
  raw: Record<string, unknown>;
};

export function validateGetChatInput(input: unknown): GetChatInput {
  if (!isRecord(input)) throw new Error("getChat input must be an object");
  const chatId = requireString(input.chatId, "chatId").trim();
  if (chatId.length === 0) throw new Error("chatId is required");
  return { chatId };
}

export async function getChat(input: GetChatClientInput): Promise<GetChatResult> {
  const validated = validateGetChatInput(input);
  const token = requireString(input.botToken, "botToken").trim();
  if (token.length === 0) throw new Error("botToken is required");
  const httpClient = input.httpClient ?? createConnectorHttpClient({
    allowedHosts: manifest.network.allowedHosts,
    maxResponseBytes: manifest.operations["chats.get"].maxResponseBytes,
    fetch: input.fetch,
  });
  const response = await httpClient.fetchText(`https://api.telegram.org/bot${token}/getChat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: validated.chatId }),
  });
  const body = readJsonObject(response.body);
  if (response.status < 200 || response.status >= 300) {
    throw mapTelegramError(response, body);
  }
  const result = requireRecord(body.result, "result");
  return { chat: result as TelegramChat, raw: result };
}

// ─── GetChatMemberCount ───────────────────────────────────────────────────────

export type GetChatMemberCountInput = {
  chatId: string;
};

export type GetChatMemberCountClientInput = GetChatMemberCountInput & {
  botToken: string;
  fetch?: typeof fetch;
  httpClient?: ConnectorHttpClient;
};

export type GetChatMemberCountResult = {
  count: number;
  chatId: string;
};

export function validateGetChatMemberCountInput(input: unknown): GetChatMemberCountInput {
  if (!isRecord(input)) throw new Error("getChatMemberCount input must be an object");
  const chatId = requireString(input.chatId, "chatId").trim();
  if (chatId.length === 0) throw new Error("chatId is required");
  return { chatId };
}

export async function getChatMemberCount(input: GetChatMemberCountClientInput): Promise<GetChatMemberCountResult> {
  const validated = validateGetChatMemberCountInput(input);
  const token = requireString(input.botToken, "botToken").trim();
  if (token.length === 0) throw new Error("botToken is required");
  const httpClient = input.httpClient ?? createConnectorHttpClient({
    allowedHosts: manifest.network.allowedHosts,
    maxResponseBytes: manifest.operations["chats.getMemberCount"].maxResponseBytes,
    fetch: input.fetch,
  });
  const response = await httpClient.fetchText(`https://api.telegram.org/bot${token}/getChatMemberCount`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: validated.chatId }),
  });
  const body = readJsonObject(response.body);
  if (response.status < 200 || response.status >= 300) {
    throw mapTelegramError(response, body);
  }
  const count = typeof body.result === "number" ? body.result : 0;
  return { count, chatId: validated.chatId };
}

// ─── SendChatAction ───────────────────────────────────────────────────────────

export type SendChatActionInput = {
  chatId: string;
  action: string;
};

export type SendChatActionClientInput = SendChatActionInput & {
  botToken: string;
  fetch?: typeof fetch;
  httpClient?: ConnectorHttpClient;
};

export type SendChatActionResult = {
  ok: boolean;
};

const VALID_CHAT_ACTIONS = new Set([
  "typing", "upload_photo", "record_video", "upload_video", "record_voice",
  "upload_voice", "upload_document", "choose_sticker", "find_location",
  "record_video_note", "upload_video_note",
]);

export function validateSendChatActionInput(input: unknown): SendChatActionInput {
  if (!isRecord(input)) throw new Error("sendChatAction input must be an object");
  const chatId = requireString(input.chatId, "chatId").trim();
  if (chatId.length === 0) throw new Error("chatId is required");
  const action = requireString(input.action, "action").trim();
  if (!VALID_CHAT_ACTIONS.has(action)) {
    throw new Error(`action must be one of: ${[...VALID_CHAT_ACTIONS].join(", ")}`);
  }
  return { chatId, action };
}

export async function sendChatAction(input: SendChatActionClientInput): Promise<SendChatActionResult> {
  const validated = validateSendChatActionInput(input);
  const token = requireString(input.botToken, "botToken").trim();
  if (token.length === 0) throw new Error("botToken is required");
  const httpClient = input.httpClient ?? createConnectorHttpClient({
    allowedHosts: manifest.network.allowedHosts,
    maxResponseBytes: manifest.operations["chats.sendAction"].maxResponseBytes,
    fetch: input.fetch,
  });
  const response = await httpClient.fetchText(`https://api.telegram.org/bot${token}/sendChatAction`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: validated.chatId, action: validated.action }),
  });
  const body = readJsonObject(response.body);
  if (response.status < 200 || response.status >= 300) {
    throw mapTelegramError(response, body);
  }
  return { ok: body.result === true };
}

// ─── ExportChatInviteLink ─────────────────────────────────────────────────────

export type ExportChatInviteLinkInput = {
  chatId: string;
};

export type ExportChatInviteLinkClientInput = ExportChatInviteLinkInput & {
  botToken: string;
  fetch?: typeof fetch;
  httpClient?: ConnectorHttpClient;
};

export type ExportChatInviteLinkResult = {
  inviteLink: string;
  chatId: string;
};

export function validateExportChatInviteLinkInput(input: unknown): ExportChatInviteLinkInput {
  if (!isRecord(input)) throw new Error("exportChatInviteLink input must be an object");
  const chatId = requireString(input.chatId, "chatId").trim();
  if (chatId.length === 0) throw new Error("chatId is required");
  return { chatId };
}

export async function exportChatInviteLink(input: ExportChatInviteLinkClientInput): Promise<ExportChatInviteLinkResult> {
  const validated = validateExportChatInviteLinkInput(input);
  const token = requireString(input.botToken, "botToken").trim();
  if (token.length === 0) throw new Error("botToken is required");
  const httpClient = input.httpClient ?? createConnectorHttpClient({
    allowedHosts: manifest.network.allowedHosts,
    maxResponseBytes: manifest.operations["chats.exportInviteLink"].maxResponseBytes,
    fetch: input.fetch,
  });
  const response = await httpClient.fetchText(`https://api.telegram.org/bot${token}/exportChatInviteLink`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: validated.chatId }),
  });
  const body = readJsonObject(response.body);
  if (response.status < 200 || response.status >= 300) {
    throw mapTelegramError(response, body);
  }
  if (typeof body.result !== "string" || body.result.length === 0) {
    throw new Error("result is required");
  }
  return { inviteLink: body.result, chatId: validated.chatId };
}

// ─── GetChatAdministrators ────────────────────────────────────────────────────

export type GetChatAdministratorsInput = {
  chatId: string;
};

export type GetChatAdministratorsClientInput = GetChatAdministratorsInput & {
  botToken: string;
  fetch?: typeof fetch;
  httpClient?: ConnectorHttpClient;
};

export type GetChatAdministratorsResult = {
  administrators: Record<string, unknown>[];
  chatId: string;
};

export function validateGetChatAdministratorsInput(input: unknown): GetChatAdministratorsInput {
  if (!isRecord(input)) throw new Error("getChatAdministrators input must be an object");
  const chatId = requireString(input.chatId, "chatId").trim();
  if (chatId.length === 0) throw new Error("chatId is required");
  return { chatId };
}

export async function getChatAdministrators(input: GetChatAdministratorsClientInput): Promise<GetChatAdministratorsResult> {
  const validated = validateGetChatAdministratorsInput(input);
  const token = requireString(input.botToken, "botToken").trim();
  if (token.length === 0) throw new Error("botToken is required");
  const httpClient = input.httpClient ?? createConnectorHttpClient({
    allowedHosts: manifest.network.allowedHosts,
    maxResponseBytes: manifest.operations["chats.getAdministrators"].maxResponseBytes,
    fetch: input.fetch,
  });
  const response = await httpClient.fetchText(`https://api.telegram.org/bot${token}/getChatAdministrators`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: validated.chatId }),
  });
  const body = readJsonObject(response.body);
  if (response.status < 200 || response.status >= 300) {
    throw mapTelegramError(response, body);
  }
  if (!Array.isArray(body.result)) throw new Error("result must be an array");
  const administrators = body.result.map((member, index) => requireRecord(member, `result[${index}]`));
  return { administrators, chatId: validated.chatId };
}

// ─── GetChatMember ────────────────────────────────────────────────────────────

export type GetChatMemberInput = {
  chatId: string;
  userId: number;
};

export type GetChatMemberClientInput = GetChatMemberInput & {
  botToken: string;
  fetch?: typeof fetch;
  httpClient?: ConnectorHttpClient;
};

export type GetChatMemberResult = {
  member: Record<string, unknown>;
  chatId: string;
};

export function validateGetChatMemberInput(input: unknown): GetChatMemberInput {
  if (!isRecord(input)) throw new Error("getChatMember input must be an object");
  const chatId = requireString(input.chatId, "chatId").trim();
  if (chatId.length === 0) throw new Error("chatId is required");
  if (typeof input.userId !== "number" || !Number.isInteger(input.userId)) {
    throw new Error("userId is required");
  }
  return { chatId, userId: input.userId };
}

export async function getChatMember(input: GetChatMemberClientInput): Promise<GetChatMemberResult> {
  const validated = validateGetChatMemberInput(input);
  const token = requireString(input.botToken, "botToken").trim();
  if (token.length === 0) throw new Error("botToken is required");
  const httpClient = input.httpClient ?? createConnectorHttpClient({
    allowedHosts: manifest.network.allowedHosts,
    maxResponseBytes: manifest.operations["chats.getMember"].maxResponseBytes,
    fetch: input.fetch,
  });
  const response = await httpClient.fetchText(`https://api.telegram.org/bot${token}/getChatMember`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: validated.chatId, user_id: validated.userId }),
  });
  const body = readJsonObject(response.body);
  if (response.status < 200 || response.status >= 300) {
    throw mapTelegramError(response, body);
  }
  return { member: requireRecord(body.result, "result"), chatId: validated.chatId };
}

// ─── GetChatHistory ───────────────────────────────────────────────────────────

export type GetChatHistoryInput = {
  chatId: string;
  limit?: number;
  offset?: number;
  messageId?: number;
};

export type GetChatHistoryClientInput = GetChatHistoryInput & {
  botToken: string;
  fetch?: typeof fetch;
  httpClient?: ConnectorHttpClient;
};

export type GetChatHistoryResult = {
  messages: Record<string, unknown>[];
  chatId: string;
};

export function validateGetChatHistoryInput(input: unknown): GetChatHistoryInput {
  if (!isRecord(input)) throw new Error("getChatHistory input must be an object");
  const chatId = requireString(input.chatId, "chatId").trim();
  if (chatId.length === 0) throw new Error("chatId is required");
  const limit = optionalInteger(input.limit, "limit");
  if (limit !== undefined && (limit < 1 || limit > 100)) {
    throw new Error("limit must be between 1 and 100");
  }
  const offset = optionalInteger(input.offset, "offset");
  const messageId = optionalInteger(input.messageId, "messageId");
  return { chatId, limit, offset, messageId };
}

export async function getChatHistory(input: GetChatHistoryClientInput): Promise<GetChatHistoryResult> {
  const validated = validateGetChatHistoryInput(input);
  const token = requireString(input.botToken, "botToken").trim();
  if (token.length === 0) throw new Error("botToken is required");
  const httpClient = input.httpClient ?? createConnectorHttpClient({
    allowedHosts: manifest.network.allowedHosts,
    maxResponseBytes: manifest.operations["chats.getHistory"].maxResponseBytes,
    fetch: input.fetch,
  });
  const requestBody: Record<string, unknown> = { limit: validated.limit ?? 100 };
  if (validated.offset !== undefined) requestBody.offset = validated.offset;
  const response = await httpClient.fetchText(`https://api.telegram.org/bot${token}/getUpdates`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(requestBody),
  });
  const body = readJsonObject(response.body);
  if (response.status < 200 || response.status >= 300) {
    throw mapTelegramError(response, body);
  }
  if (!Array.isArray(body.result)) throw new Error("result must be an array");
  const messages: Record<string, unknown>[] = [];
  for (const update of body.result) {
    if (!isRecord(update)) continue;
    const message = extractHistoryMessage(update);
    if (!message) continue;
    const chat = requireRecord(message.chat, "chat");
    if (!chatMatches(chat, validated.chatId)) continue;
    if (validated.messageId !== undefined) {
      if (typeof message.message_id !== "number" || message.message_id < validated.messageId) continue;
    }
    messages.push(message);
  }
  return { messages, chatId: validated.chatId };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function readJsonObject(bodyText: string): Record<string, unknown> {
  try {
    const body = JSON.parse(bodyText);
    return isRecord(body) ? body : {};
  } catch {
    return {};
  }
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${field} is required`);
  return value;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string") throw new Error(`${field} is required`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalInteger(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value)) throw new Error(`${field} is required`);
  return value;
}

function extractHistoryMessage(update: Record<string, unknown>): Record<string, unknown> | null {
  for (const key of ["message", "channel_post", "edited_message"]) {
    const value = update[key];
    if (isRecord(value) && isRecord(value.chat)) return value;
  }
  return null;
}

function chatMatches(chat: Record<string, unknown>, chatId: string): boolean {
  if (chat.id !== undefined && String(chat.id) === chatId) return true;
  const username = typeof chat.username === "string" ? chat.username : "";
  if (username.length === 0) return false;
  const normalized = chatId.startsWith("@") ? chatId.slice(1) : chatId;
  return username === normalized;
}
