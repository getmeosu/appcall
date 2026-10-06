import { createConnectorHttpClient, type ConnectorHttpClient } from "../../../bun/src/http";
import manifest from "../manifest.json";
import { mapTelegramError } from "./messages";

type TelegramCallInput = {
  botToken: string;
  operation: string;
  fetch?: typeof fetch;
  httpClient?: ConnectorHttpClient;
};

async function callTelegram(
  input: TelegramCallInput,
  method: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const token = requireString(input.botToken, "botToken").trim();
  if (token.length === 0) throw new Error("botToken is required");
  const maxResponseBytes = (
    manifest.operations as Record<string, { maxResponseBytes?: number }>
  )[input.operation]?.maxResponseBytes ?? 1048576;
  const httpClient = input.httpClient ?? createConnectorHttpClient({
    allowedHosts: manifest.network.allowedHosts,
    maxResponseBytes,
    fetch: input.fetch,
  });
  const response = await httpClient.fetchText(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = readJsonObject(response.body);
  if (response.status < 200 || response.status >= 300) {
    throw mapTelegramError(response, body);
  }
  return body;
}

function messageResult(body: Record<string, unknown>, fallbackText?: string) {
  const result = requireRecord(body.result, "result");
  const messageID = String(requireNumberLike(result.message_id, "result.message_id"));
  const chat = requireRecord(result.chat, "result.chat");
  const channelId = String(requireNumberLike(chat.id, "result.chat.id"));
  return {
    providerMessageId: messageID,
    channelId,
    text: typeof result.text === "string" ? result.text : fallbackText ?? "",
    raw: result,
  };
}

// ─── messages.sendLocation ────────────────────────────────────────────────────

export type SendLocationInput = {
  chatId: string;
  latitude: number;
  longitude: number;
  livePeriod?: number;
};

export function validateSendLocationInput(input: unknown): SendLocationInput {
  if (!isRecord(input)) throw new Error("sendLocation input must be an object");
  const chatId = requireString(input.chatId, "chatId").trim();
  if (chatId.length === 0) throw new Error("chatId is required");
  if (typeof input.latitude !== "number") throw new Error("latitude is required");
  if (typeof input.longitude !== "number") throw new Error("longitude is required");
  return {
    chatId,
    latitude: input.latitude,
    longitude: input.longitude,
    livePeriod: typeof input.livePeriod === "number" ? input.livePeriod : undefined,
  };
}

export async function sendTelegramLocation(input: SendLocationInput & TelegramCallInput) {
  const validated = validateSendLocationInput(input);
  const payload: Record<string, unknown> = {
    chat_id: validated.chatId,
    latitude: validated.latitude,
    longitude: validated.longitude,
  };
  if (validated.livePeriod !== undefined) payload.live_period = validated.livePeriod;
  const body = await callTelegram(input, "sendLocation", payload);
  return messageResult(body);
}

// ─── messages.sendPoll ────────────────────────────────────────────────────────

export type SendPollInput = {
  chatId: string;
  question: string;
  options: string[];
  isAnonymous?: boolean;
  allowsMultipleAnswers?: boolean;
  type?: string;
};

export function validateSendPollInput(input: unknown): SendPollInput {
  if (!isRecord(input)) throw new Error("sendPoll input must be an object");
  const chatId = requireString(input.chatId, "chatId").trim();
  if (chatId.length === 0) throw new Error("chatId is required");
  const question = requireString(input.question, "question").trim();
  if (question.length === 0) throw new Error("question is required");
  if (!Array.isArray(input.options) || input.options.length < 2) {
    throw new Error("options must contain at least 2 strings");
  }
  const options = input.options.filter((option): option is string => typeof option === "string" && option.trim().length > 0);
  if (options.length < 2) throw new Error("options must contain at least 2 strings");
  return {
    chatId,
    question,
    options,
    isAnonymous: typeof input.isAnonymous === "boolean" ? input.isAnonymous : undefined,
    allowsMultipleAnswers: typeof input.allowsMultipleAnswers === "boolean" ? input.allowsMultipleAnswers : undefined,
    type: typeof input.type === "string" ? input.type : undefined,
  };
}

export async function sendTelegramPoll(input: SendPollInput & TelegramCallInput) {
  const validated = validateSendPollInput(input);
  const payload: Record<string, unknown> = {
    chat_id: validated.chatId,
    question: validated.question,
    options: validated.options,
  };
  if (validated.isAnonymous !== undefined) payload.is_anonymous = validated.isAnonymous;
  if (validated.allowsMultipleAnswers !== undefined) payload.allows_multiple_answers = validated.allowsMultipleAnswers;
  if (validated.type !== undefined) payload.type = validated.type;
  const body = await callTelegram(input, "sendPoll", payload);
  return messageResult(body, validated.question);
}

// ─── messages.unpin ───────────────────────────────────────────────────────────

export type UnpinMessageInput = {
  chatId: string;
  messageId?: number;
};

export function validateUnpinMessageInput(input: unknown): UnpinMessageInput {
  if (!isRecord(input)) throw new Error("unpinChatMessage input must be an object");
  const chatId = requireString(input.chatId, "chatId").trim();
  if (chatId.length === 0) throw new Error("chatId is required");
  return {
    chatId,
    messageId: typeof input.messageId === "number" ? input.messageId : undefined,
  };
}

export async function unpinTelegramMessage(input: UnpinMessageInput & TelegramCallInput) {
  const validated = validateUnpinMessageInput(input);
  const payload: Record<string, unknown> = { chat_id: validated.chatId };
  if (validated.messageId !== undefined) payload.message_id = validated.messageId;
  const body = await callTelegram(input, "unpinChatMessage", payload);
  return { unpinned: body.result === true, chatId: validated.chatId };
}

// ─── messages.copy ────────────────────────────────────────────────────────────

export type CopyMessageInput = {
  chatId: string;
  fromChatId: string;
  messageId: number;
};

export function validateCopyMessageInput(input: unknown): CopyMessageInput {
  if (!isRecord(input)) throw new Error("copyMessage input must be an object");
  const chatId = requireString(input.chatId, "chatId").trim();
  if (chatId.length === 0) throw new Error("chatId is required");
  const fromChatId = requireString(input.fromChatId, "fromChatId").trim();
  if (fromChatId.length === 0) throw new Error("fromChatId is required");
  if (typeof input.messageId !== "number") throw new Error("messageId is required");
  return { chatId, fromChatId, messageId: input.messageId };
}

export async function copyTelegramMessage(input: CopyMessageInput & TelegramCallInput) {
  const validated = validateCopyMessageInput(input);
  const body = await callTelegram(input, "copyMessage", {
    chat_id: validated.chatId,
    from_chat_id: validated.fromChatId,
    message_id: validated.messageId,
  });
  const result = requireRecord(body.result, "result");
  return {
    providerMessageId: String(requireNumberLike(result.message_id, "result.message_id")),
    channelId: validated.chatId,
    raw: result,
  };
}

// ─── chats.getMember ──────────────────────────────────────────────────────────

export type GetChatMemberInput = {
  chatId: string;
  userId: number;
};

export function validateGetChatMemberInput(input: unknown): GetChatMemberInput {
  if (!isRecord(input)) throw new Error("getChatMember input must be an object");
  const chatId = requireString(input.chatId, "chatId").trim();
  if (chatId.length === 0) throw new Error("chatId is required");
  if (typeof input.userId !== "number") throw new Error("userId is required");
  return { chatId, userId: input.userId };
}

export async function getTelegramChatMember(input: GetChatMemberInput & TelegramCallInput) {
  const validated = validateGetChatMemberInput(input);
  const body = await callTelegram(input, "getChatMember", {
    chat_id: validated.chatId,
    user_id: validated.userId,
  });
  return { member: requireRecord(body.result, "result"), chatId: validated.chatId };
}

// ─── chats.getAdministrators ──────────────────────────────────────────────────

export type GetChatAdministratorsInput = { chatId: string };

export function validateGetChatAdministratorsInput(input: unknown): GetChatAdministratorsInput {
  if (!isRecord(input)) throw new Error("getChatAdministrators input must be an object");
  const chatId = requireString(input.chatId, "chatId").trim();
  if (chatId.length === 0) throw new Error("chatId is required");
  return { chatId };
}

export async function getTelegramChatAdministrators(input: GetChatAdministratorsInput & TelegramCallInput) {
  const validated = validateGetChatAdministratorsInput(input);
  const body = await callTelegram(input, "getChatAdministrators", { chat_id: validated.chatId });
  const administrators = Array.isArray(body.result) ? body.result : [];
  return { administrators, chatId: validated.chatId };
}

// ─── chats.exportInviteLink ───────────────────────────────────────────────────

export type ExportInviteLinkInput = { chatId: string };

export function validateExportInviteLinkInput(input: unknown): ExportInviteLinkInput {
  if (!isRecord(input)) throw new Error("exportChatInviteLink input must be an object");
  const chatId = requireString(input.chatId, "chatId").trim();
  if (chatId.length === 0) throw new Error("chatId is required");
  return { chatId };
}

export async function exportTelegramChatInviteLink(input: ExportInviteLinkInput & TelegramCallInput) {
  const validated = validateExportInviteLinkInput(input);
  const body = await callTelegram(input, "exportChatInviteLink", { chat_id: validated.chatId });
  return {
    inviteLink: typeof body.result === "string" ? body.result : "",
    chatId: validated.chatId,
  };
}

// ─── chats.leave ──────────────────────────────────────────────────────────────

export type LeaveChatInput = { chatId: string };

export function validateLeaveChatInput(input: unknown): LeaveChatInput {
  if (!isRecord(input)) throw new Error("leaveChat input must be an object");
  const chatId = requireString(input.chatId, "chatId").trim();
  if (chatId.length === 0) throw new Error("chatId is required");
  return { chatId };
}

export async function leaveTelegramChat(input: LeaveChatInput & TelegramCallInput) {
  const validated = validateLeaveChatInput(input);
  const body = await callTelegram(input, "leaveChat", { chat_id: validated.chatId });
  return { left: body.result === true, chatId: validated.chatId };
}

// ─── bot.getUpdates ───────────────────────────────────────────────────────────

export type GetUpdatesInput = {
  offset?: number;
  limit?: number;
  timeout?: number;
};

export function validateGetUpdatesInput(input: unknown): GetUpdatesInput {
  if (!isRecord(input)) throw new Error("getUpdates input must be an object");
  return {
    offset: typeof input.offset === "number" ? input.offset : undefined,
    limit: typeof input.limit === "number" ? input.limit : undefined,
    timeout: typeof input.timeout === "number" ? input.timeout : undefined,
  };
}

export async function getTelegramUpdates(input: GetUpdatesInput & TelegramCallInput) {
  const validated = validateGetUpdatesInput(input);
  const payload: Record<string, unknown> = {};
  if (validated.offset !== undefined) payload.offset = validated.offset;
  if (validated.limit !== undefined) payload.limit = validated.limit;
  if (validated.timeout !== undefined) payload.timeout = validated.timeout;
  const body = await callTelegram(input, "getUpdates", payload);
  const updates = Array.isArray(body.result) ? body.result : [];
  return { updates };
}

// ─── bot.setCommands ──────────────────────────────────────────────────────────

export type SetCommandsInput = {
  commands: Array<{ command: string; description: string }>;
  languageCode?: string;
};

export function validateSetCommandsInput(input: unknown): SetCommandsInput {
  if (!isRecord(input)) throw new Error("setMyCommands input must be an object");
  if (!Array.isArray(input.commands) || input.commands.length === 0) {
    throw new Error("commands is required");
  }
  const commands = input.commands.map((command) => {
    if (!isRecord(command)) throw new Error("commands is required");
    const name = requireString(command.command, "command").trim();
    const description = requireString(command.description, "description").trim();
    if (name.length === 0) throw new Error("command is required");
    if (description.length === 0) throw new Error("description is required");
    return { command: name, description };
  });
  return {
    commands,
    languageCode: typeof input.languageCode === "string" ? input.languageCode : undefined,
  };
}

export async function setTelegramCommands(input: SetCommandsInput & TelegramCallInput) {
  const validated = validateSetCommandsInput(input);
  const payload: Record<string, unknown> = { commands: validated.commands };
  if (validated.languageCode !== undefined) payload.language_code = validated.languageCode;
  const body = await callTelegram(input, "setMyCommands", payload);
  return { ok: body.result === true };
}

// ─── bot.answerCallbackQuery ──────────────────────────────────────────────────

export type AnswerCallbackQueryInput = {
  callbackQueryId: string;
  text?: string;
  showAlert?: boolean;
  url?: string;
};

export function validateAnswerCallbackQueryInput(input: unknown): AnswerCallbackQueryInput {
  if (!isRecord(input)) throw new Error("answerCallbackQuery input must be an object");
  const callbackQueryId = requireString(input.callbackQueryId, "callbackQueryId").trim();
  if (callbackQueryId.length === 0) throw new Error("callbackQueryId is required");
  return {
    callbackQueryId,
    text: typeof input.text === "string" ? input.text : undefined,
    showAlert: typeof input.showAlert === "boolean" ? input.showAlert : undefined,
    url: typeof input.url === "string" ? input.url : undefined,
  };
}

export async function answerTelegramCallbackQuery(input: AnswerCallbackQueryInput & TelegramCallInput) {
  const validated = validateAnswerCallbackQueryInput(input);
  const payload: Record<string, unknown> = { callback_query_id: validated.callbackQueryId };
  if (validated.text !== undefined) payload.text = validated.text;
  if (validated.showAlert !== undefined) payload.show_alert = validated.showAlert;
  if (validated.url !== undefined) payload.url = validated.url;
  const body = await callTelegram(input, "answerCallbackQuery", payload);
  return { ok: body.result === true };
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
  if (!isRecord(value)) throw new Error(`${field} is required`);
  return value;
}

function requireNumberLike(value: unknown, field: string): number | string {
  if (typeof value !== "number" && typeof value !== "string") {
    throw new Error(`${field} is required`);
  }
  return value;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string") throw new Error(`${field} is required`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
