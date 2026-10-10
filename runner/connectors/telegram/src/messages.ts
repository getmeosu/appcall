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

// ─── SendLocation ─────────────────────────────────────────────────────────────

export type SendLocationInput = {
  chatId: string;
  latitude: number;
  longitude: number;
  heading?: number;
  livePeriod?: number;
  horizontalAccuracy?: number;
  proximityAlertRadius?: number;
  replyMarkup?: unknown;
  replyToMessageId?: number;
  disableNotification?: boolean;
};

export type SendLocationClientInput = SendLocationInput & {
  botToken: string;
  fetch?: typeof fetch;
  httpClient?: ConnectorHttpClient;
};

export type SendLocationResult = {
  providerMessageId: string;
  channelId: string;
  raw: Record<string, unknown>;
};

export function validateSendLocationInput(input: unknown): SendLocationInput {
  if (!isRecord(input)) throw new Error("sendLocation input must be an object");
  const chatId = requireString(input.chatId, "chatId").trim();
  if (chatId.length === 0) throw new Error("chatId is required");
  const latitude = requireFiniteNumber(input.latitude, "latitude");
  if (latitude < -90 || latitude > 90) throw new Error("latitude must be between -90 and 90");
  const longitude = requireFiniteNumber(input.longitude, "longitude");
  if (longitude < -180 || longitude > 180) throw new Error("longitude must be between -180 and 180");
  const heading = optionalIntegerInRange(input.heading, "heading", 1, 360);
  const livePeriod = optionalIntegerInRange(input.livePeriod, "livePeriod", 60, 86400);
  const horizontalAccuracy = optionalFiniteNumber(input.horizontalAccuracy, "horizontalAccuracy");
  if (horizontalAccuracy !== undefined && (horizontalAccuracy < 0 || horizontalAccuracy > 1500)) {
    throw new Error("horizontalAccuracy must be between 0 and 1500");
  }
  const proximityAlertRadius = optionalIntegerInRange(input.proximityAlertRadius, "proximityAlertRadius", 1, 100000);
  const replyToMessageId = optionalInteger(input.replyToMessageId, "replyToMessageId");
  const disableNotification = optionalBoolean(input.disableNotification, "disableNotification");
  const replyMarkup = input.replyMarkup === undefined ? undefined : normalizeJsonLike(input.replyMarkup, "replyMarkup");
  return {
    chatId,
    latitude,
    longitude,
    heading,
    livePeriod,
    horizontalAccuracy,
    proximityAlertRadius,
    replyMarkup,
    replyToMessageId,
    disableNotification,
  };
}

export async function sendTelegramLocation(input: SendLocationClientInput): Promise<SendLocationResult> {
  const validated = validateSendLocationInput(input);
  const token = requireString(input.botToken, "botToken").trim();
  if (token.length === 0) throw new Error("botToken is required");
  const httpClient = input.httpClient ?? createConnectorHttpClient({
    allowedHosts: manifest.network.allowedHosts,
    maxResponseBytes: manifest.operations["messages.sendLocation"].maxResponseBytes,
    fetch: input.fetch,
  });
  const response = await httpClient.fetchText(`https://api.telegram.org/bot${token}/sendLocation`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(compactBody({
      chat_id: validated.chatId,
      latitude: validated.latitude,
      longitude: validated.longitude,
      heading: validated.heading,
      live_period: validated.livePeriod,
      horizontal_accuracy: validated.horizontalAccuracy,
      proximity_alert_radius: validated.proximityAlertRadius,
      reply_markup: validated.replyMarkup,
      reply_to_message_id: validated.replyToMessageId,
      disable_notification: validated.disableNotification,
    })),
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

// ─── SendPoll ─────────────────────────────────────────────────────────────────

export type SendPollInput = {
  chatId: string;
  question: string;
  options: string[];
  type?: "regular" | "quiz";
  isClosed?: boolean;
  closeDate?: number;
  explanation?: string;
  openPeriod?: number;
  isAnonymous?: boolean;
  replyMarkup?: unknown;
  correctOptionId?: number;
  replyToMessageId?: number;
  disableNotification?: boolean;
  explanationParseMode?: string;
  allowsMultipleAnswers?: boolean;
};

export type SendPollClientInput = SendPollInput & {
  botToken: string;
  fetch?: typeof fetch;
  httpClient?: ConnectorHttpClient;
};

export type SendPollResult = {
  providerMessageId: string;
  channelId: string;
  raw: Record<string, unknown>;
};

const PARSE_MODES = new Set(["Markdown", "MarkdownV2", "HTML"]);

export function validateSendPollInput(input: unknown): SendPollInput {
  if (!isRecord(input)) throw new Error("sendPoll input must be an object");
  const chatId = requireString(input.chatId, "chatId").trim();
  if (chatId.length === 0) throw new Error("chatId is required");
  const question = requireString(input.question, "question").trim();
  if (question.length === 0) throw new Error("question is required");
  if (question.length > 300) throw new Error("question exceeds Telegram poll limit");
  if (!Array.isArray(input.options)) throw new Error("options is required");
  if (input.options.length < 2 || input.options.length > 10) {
    throw new Error("options must contain between 2 and 10 entries");
  }
  const options = input.options.map((option, index) => {
    if (typeof option !== "string") throw new Error(`options[${index}] must be a string`);
    const text = option.trim();
    if (text.length < 1 || text.length > 100) {
      throw new Error(`options[${index}] must be 1-100 characters`);
    }
    return text;
  });
  const type = optionalString(input.type, "type");
  if (type !== undefined && type !== "regular" && type !== "quiz") {
    throw new Error("type must be regular or quiz");
  }
  const correctOptionId = optionalInteger(input.correctOptionId, "correctOptionId");
  if (type === "quiz" && correctOptionId === undefined) {
    throw new Error("correctOptionId is required for quiz polls");
  }
  if (correctOptionId !== undefined && (correctOptionId < 0 || correctOptionId >= options.length)) {
    throw new Error("correctOptionId must be a valid option index");
  }
  const openPeriod = optionalIntegerInRange(input.openPeriod, "openPeriod", 5, 600);
  const closeDate = optionalInteger(input.closeDate, "closeDate");
  if (openPeriod !== undefined && closeDate !== undefined) {
    throw new Error("openPeriod and closeDate cannot be used together");
  }
  const explanation = optionalString(input.explanation, "explanation");
  if (explanation !== undefined && explanation.length > 200) {
    throw new Error("explanation exceeds Telegram poll limit");
  }
  const explanationParseMode = optionalString(input.explanationParseMode, "explanationParseMode");
  if (explanationParseMode !== undefined && !PARSE_MODES.has(explanationParseMode)) {
    throw new Error("explanationParseMode must be Markdown, MarkdownV2, or HTML");
  }
  return {
    chatId,
    question,
    options,
    type,
    isClosed: optionalBoolean(input.isClosed, "isClosed"),
    closeDate,
    explanation,
    openPeriod,
    isAnonymous: optionalBoolean(input.isAnonymous, "isAnonymous"),
    replyMarkup: input.replyMarkup === undefined ? undefined : normalizeJsonLike(input.replyMarkup, "replyMarkup"),
    correctOptionId,
    replyToMessageId: optionalInteger(input.replyToMessageId, "replyToMessageId"),
    disableNotification: optionalBoolean(input.disableNotification, "disableNotification"),
    explanationParseMode,
    allowsMultipleAnswers: optionalBoolean(input.allowsMultipleAnswers, "allowsMultipleAnswers"),
  };
}

export async function sendTelegramPoll(input: SendPollClientInput): Promise<SendPollResult> {
  const validated = validateSendPollInput(input);
  const token = requireString(input.botToken, "botToken").trim();
  if (token.length === 0) throw new Error("botToken is required");
  const httpClient = input.httpClient ?? createConnectorHttpClient({
    allowedHosts: manifest.network.allowedHosts,
    maxResponseBytes: manifest.operations["messages.sendPoll"].maxResponseBytes,
    fetch: input.fetch,
  });
  const response = await httpClient.fetchText(`https://api.telegram.org/bot${token}/sendPoll`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(compactBody({
      chat_id: validated.chatId,
      question: validated.question,
      options: validated.options.map((text) => ({ text })),
      type: validated.type,
      is_closed: validated.isClosed,
      close_date: validated.closeDate,
      explanation: validated.explanation,
      open_period: validated.openPeriod,
      is_anonymous: validated.isAnonymous,
      reply_markup: validated.replyMarkup,
      correct_option_id: validated.correctOptionId,
      reply_to_message_id: validated.replyToMessageId,
      disable_notification: validated.disableNotification,
      explanation_parse_mode: validated.explanationParseMode,
      allows_multiple_answers: validated.allowsMultipleAnswers,
    })),
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
      code: "CONNECTOR_RATE_LIMITED",
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

function compactBody(body: Record<string, unknown>): Record<string, unknown> {
  const compacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (value !== undefined) compacted[key] = value;
  }
  return compacted;
}

export function normalizeJsonLike(value: unknown, field: string): unknown {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) throw new Error(`${field} is required`);
    try {
      return JSON.parse(trimmed);
    } catch {
      throw new Error(`${field} must be valid JSON`);
    }
  }
  if (typeof value === "object" && value !== null) return value;
  throw new Error(`${field} must be an object or JSON string`);
}

function requireFiniteNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${field} is required`);
  return value;
}

function optionalFiniteNumber(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined;
  return requireFiniteNumber(value, field);
}

function requireInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) throw new Error(`${field} is required`);
  return value;
}

function optionalInteger(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined;
  return requireInteger(value, field);
}

function optionalIntegerInRange(value: unknown, field: string, min: number, max: number): number | undefined {
  const parsed = optionalInteger(value, field);
  if (parsed !== undefined && (parsed < min || parsed > max)) {
    throw new Error(`${field} must be between ${min} and ${max}`);
  }
  return parsed;
}

function optionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new Error(`${field} must be a boolean`);
  return value;
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  return value;
}
