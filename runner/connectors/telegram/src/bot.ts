import { createConnectorHttpClient, type ConnectorHttpClient } from "../../../bun/src/http";
import manifest from "../manifest.json";
import { mapTelegramError, normalizeJsonLike } from "./messages";

// ─── Types ────────────────────────────────────────────────────────────────────

export type TelegramUser = {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
  can_join_groups?: boolean;
  can_read_all_group_messages?: boolean;
  supports_inline_queries?: boolean;
  [key: string]: unknown;
};

export type GetMeClientInput = {
  botToken: string;
  fetch?: typeof fetch;
  httpClient?: ConnectorHttpClient;
};

export type GetMeResult = {
  bot: TelegramUser;
  raw: Record<string, unknown>;
};

export async function getMe(input: GetMeClientInput): Promise<GetMeResult> {
  const token = requireString(input.botToken, "botToken").trim();
  if (token.length === 0) throw new Error("botToken is required");
  const httpClient = input.httpClient ?? createConnectorHttpClient({
    allowedHosts: manifest.network.allowedHosts,
    maxResponseBytes: manifest.operations["bot.getMe"].maxResponseBytes,
    fetch: input.fetch,
  });
  const response = await httpClient.fetchText(`https://api.telegram.org/bot${token}/getMe`, {
    method: "GET",
    headers: {},
  });
  const body = readJsonObject(response.body);
  if (response.status < 200 || response.status >= 300) {
    throw mapTelegramError(response, body);
  }
  const result = requireRecord(body.result, "result");
  return { bot: result as TelegramUser, raw: result };
}

// ─── GetUpdates ───────────────────────────────────────────────────────────────

export type GetUpdatesInput = {
  offset?: number;
  limit?: number;
  timeout?: number;
  allowedUpdates?: string[];
};

export type GetUpdatesClientInput = GetUpdatesInput & {
  botToken: string;
  fetch?: typeof fetch;
  httpClient?: ConnectorHttpClient;
};

export type GetUpdatesResult = {
  updates: Record<string, unknown>[];
};

export function validateGetUpdatesInput(input: unknown): GetUpdatesInput {
  if (!isRecord(input)) throw new Error("getUpdates input must be an object");
  const limit = optionalInteger(input.limit, "limit");
  if (limit !== undefined && (limit < 1 || limit > 100)) {
    throw new Error("limit must be between 1 and 100");
  }
  const timeout = optionalInteger(input.timeout, "timeout");
  if (timeout !== undefined && (timeout < 0 || timeout > 50)) {
    throw new Error("timeout must be between 0 and 50");
  }
  const offset = optionalInteger(input.offset, "offset");
  const allowedUpdates = optionalStringArray(input.allowedUpdates, "allowedUpdates");
  return { offset, limit, timeout, allowedUpdates };
}

export async function getUpdates(input: GetUpdatesClientInput): Promise<GetUpdatesResult> {
  const validated = validateGetUpdatesInput(input);
  const token = requireString(input.botToken, "botToken").trim();
  if (token.length === 0) throw new Error("botToken is required");
  const httpClient = input.httpClient ?? createConnectorHttpClient({
    allowedHosts: manifest.network.allowedHosts,
    maxResponseBytes: manifest.operations["bot.getUpdates"].maxResponseBytes,
    timeoutMs: manifest.operations["bot.getUpdates"].timeoutMs,
    fetch: input.fetch,
  });
  const response = await httpClient.fetchText(`https://api.telegram.org/bot${token}/getUpdates`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(compactBody({
      offset: validated.offset,
      limit: validated.limit,
      timeout: validated.timeout,
      allowed_updates: validated.allowedUpdates,
    })),
  });
  const body = readJsonObject(response.body);
  if (response.status < 200 || response.status >= 300) {
    throw mapTelegramError(response, body);
  }
  if (!Array.isArray(body.result)) throw new Error("result must be an array");
  const updates = body.result.map((update, index) => requireRecord(update, `result[${index}]`));
  return { updates };
}

// ─── SetMyCommands ────────────────────────────────────────────────────────────

export type BotCommand = {
  command: string;
  description: string;
};

export type SetMyCommandsInput = {
  commands: BotCommand[];
  scope?: unknown;
  languageCode?: string;
};

export type SetMyCommandsClientInput = SetMyCommandsInput & {
  botToken: string;
  fetch?: typeof fetch;
  httpClient?: ConnectorHttpClient;
};

export type SetMyCommandsResult = {
  ok: boolean;
};

const COMMAND_NAME = /^[a-z0-9_]{1,32}$/;

export function validateSetMyCommandsInput(input: unknown): SetMyCommandsInput {
  if (!isRecord(input)) throw new Error("setMyCommands input must be an object");
  if (!Array.isArray(input.commands) || input.commands.length === 0) {
    throw new Error("commands is required");
  }
  if (input.commands.length > 100) throw new Error("commands cannot exceed 100 entries");
  const commands = input.commands.map((entry, index) => {
    if (!isRecord(entry)) throw new Error(`commands[${index}] must be an object`);
    const command = requireString(entry.command, `commands[${index}].command`).trim();
    if (!COMMAND_NAME.test(command)) {
      throw new Error(`commands[${index}].command must be 1-32 lowercase letters, digits, or underscores`);
    }
    const description = requireString(entry.description, `commands[${index}].description`).trim();
    if (description.length === 0 || description.length > 256) {
      throw new Error(`commands[${index}].description must be 1-256 characters`);
    }
    return { command, description };
  });
  const languageCode = optionalString(input.languageCode, "languageCode");
  if (languageCode !== undefined && languageCode.trim().length === 0) {
    throw new Error("languageCode is required");
  }
  return {
    commands,
    scope: input.scope === undefined ? undefined : normalizeJsonLike(input.scope, "scope"),
    languageCode: languageCode?.trim(),
  };
}

export async function setMyCommands(input: SetMyCommandsClientInput): Promise<SetMyCommandsResult> {
  const validated = validateSetMyCommandsInput(input);
  const token = requireString(input.botToken, "botToken").trim();
  if (token.length === 0) throw new Error("botToken is required");
  const httpClient = input.httpClient ?? createConnectorHttpClient({
    allowedHosts: manifest.network.allowedHosts,
    maxResponseBytes: manifest.operations["bot.setMyCommands"].maxResponseBytes,
    fetch: input.fetch,
  });
  const response = await httpClient.fetchText(`https://api.telegram.org/bot${token}/setMyCommands`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(compactBody({
      commands: validated.commands,
      scope: validated.scope,
      language_code: validated.languageCode,
    })),
  });
  const body = readJsonObject(response.body);
  if (response.status < 200 || response.status >= 300) {
    throw mapTelegramError(response, body);
  }
  return { ok: body.result === true };
}

// ─── AnswerCallbackQuery ──────────────────────────────────────────────────────

export type AnswerCallbackQueryInput = {
  callbackQueryId: string;
  text?: string;
  showAlert?: boolean;
  url?: string;
  cacheTime?: number;
};

export type AnswerCallbackQueryClientInput = AnswerCallbackQueryInput & {
  botToken: string;
  fetch?: typeof fetch;
  httpClient?: ConnectorHttpClient;
};

export type AnswerCallbackQueryResult = {
  ok: boolean;
};

export function validateAnswerCallbackQueryInput(input: unknown): AnswerCallbackQueryInput {
  if (!isRecord(input)) throw new Error("answerCallbackQuery input must be an object");
  const callbackQueryId = requireString(input.callbackQueryId, "callbackQueryId").trim();
  if (callbackQueryId.length === 0) throw new Error("callbackQueryId is required");
  const text = optionalString(input.text, "text");
  if (text !== undefined && text.length > 200) {
    throw new Error("text exceeds Telegram callback notification limit");
  }
  const url = optionalString(input.url, "url");
  if (url !== undefined && url.trim().length === 0) throw new Error("url is required");
  const cacheTime = optionalInteger(input.cacheTime, "cacheTime");
  if (cacheTime !== undefined && cacheTime < 0) throw new Error("cacheTime must be >= 0");
  const showAlert = optionalBoolean(input.showAlert, "showAlert");
  return {
    callbackQueryId,
    text,
    showAlert,
    url: url?.trim(),
    cacheTime,
  };
}

export async function answerCallbackQuery(input: AnswerCallbackQueryClientInput): Promise<AnswerCallbackQueryResult> {
  const validated = validateAnswerCallbackQueryInput(input);
  const token = requireString(input.botToken, "botToken").trim();
  if (token.length === 0) throw new Error("botToken is required");
  const httpClient = input.httpClient ?? createConnectorHttpClient({
    allowedHosts: manifest.network.allowedHosts,
    maxResponseBytes: manifest.operations["callbacks.answer"].maxResponseBytes,
    fetch: input.fetch,
  });
  const response = await httpClient.fetchText(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(compactBody({
      callback_query_id: validated.callbackQueryId,
      text: validated.text,
      show_alert: validated.showAlert,
      url: validated.url,
      cache_time: validated.cacheTime,
    })),
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

function compactBody(body: Record<string, unknown>): Record<string, unknown> {
  const compacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (value !== undefined) compacted[key] = value;
  }
  return compacted;
}

function optionalInteger(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value)) throw new Error(`${field} is required`);
  return value;
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  return value;
}

function optionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new Error(`${field} must be a boolean`);
  return value;
}

function optionalStringArray(value: unknown, field: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string") {
    const parsed = normalizeJsonLike(value, field);
    if (!Array.isArray(parsed)) throw new Error(`${field} must be an array`);
    return parsed.map((entry, index) => {
      if (typeof entry !== "string") throw new Error(`${field}[${index}] must be a string`);
      return entry;
    });
  }
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  return value.map((entry, index) => {
    if (typeof entry !== "string") throw new Error(`${field}[${index}] must be a string`);
    return entry;
  });
}
