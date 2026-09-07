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
