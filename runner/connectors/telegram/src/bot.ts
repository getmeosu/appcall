import { createConnectorHttpClient, type ConnectorHttpClient } from "../../../bun/src/http";
import manifest from "../manifest.json";
import { mapTelegramError } from "./messages";

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
