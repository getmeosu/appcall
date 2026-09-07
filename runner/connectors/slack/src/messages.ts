import { createConnectorHttpClient, type ConnectorHttpClient } from "../../../bun/src/http";
import manifest from "../manifest.json";

export type SlackMessage = {
  type?: string;
  user?: string;
  bot_id?: string;
  text?: string;
  ts?: string;
  [key: string]: unknown;
};

export type NormalizedMessage = {
  id: string;
  provider: "slack";
  providerMessageId: string;
  channelId: string;
  senderId: string;
  text: string;
  modelVersion: "2026-05-14";
  raw: SlackMessage;
};

export type RateLimitResult =
  | { limited: true; retryAfterSeconds: number }
  | { limited: false };

export type SendMessageInput = {
  channel: string;
  text: string;
};

export type ConnectorErrorCode =
  | "CONNECTOR_RATE_LIMITED"
  | "CONNECTOR_UPSTREAM_ERROR";

export type ConnectorError = {
  code: ConnectorErrorCode;
  message: string;
  retryAfterSeconds?: number;
  providerError?: string;
};

export type SendMessageResult =
  | { ok: true; message: NormalizedMessage }
  | { ok: false; error: ConnectorError };

export type SlackMessagesClient = {
  send(input: unknown): Promise<SendMessageResult>;
};

export type SlackMessagesClientOptions = {
  token: string;
  fetch?: typeof fetch;
  httpClient?: ConnectorHttpClient;
};

export function normalizeMessage(message: SlackMessage, channelId: string): NormalizedMessage {
  const ts = requireString(message.ts, "message.ts");
  const senderId = typeof message.user === "string" ? message.user : requireString(message.bot_id, "message.user");
  const text = typeof message.text === "string" ? message.text : "";

  return {
    id: `slack:${channelId}:${ts}`,
    provider: "slack",
    providerMessageId: ts,
    channelId,
    senderId,
    text,
    modelVersion: "2026-05-14",
    raw: message,
  };
}

export function parseNextCursor(response: unknown): string | null {
  if (!isRecord(response)) {
    return null;
  }
  const metadata = response.response_metadata;
  if (!isRecord(metadata)) {
    return null;
  }
  const cursor = metadata.next_cursor;
  return typeof cursor === "string" && cursor.length > 0 ? cursor : null;
}

export function parseRateLimit(response: Response): RateLimitResult {
  if (response.status !== 429) {
    return { limited: false };
  }
  const retryAfter = Number(response.headers.get("Retry-After") ?? "0");
  return { limited: true, retryAfterSeconds: Number.isFinite(retryAfter) ? retryAfter : 0 };
}

export function parseRateLimitMetadata(status: number, headers: Record<string, string>): RateLimitResult {
  if (status !== 429) {
    return { limited: false };
  }
  const retryAfter = Number(headers["retry-after"] ?? headers["Retry-After"] ?? "0");
  return { limited: true, retryAfterSeconds: Number.isFinite(retryAfter) ? retryAfter : 0 };
}

export function createSlackMessagesClient(options: SlackMessagesClientOptions): SlackMessagesClient {
  const token = requireString(options.token, "token");
  const httpClient = options.httpClient ?? createConnectorHttpClient({
    allowedHosts: manifest.network.allowedHosts,
    maxResponseBytes: manifest.operations["messages.send"].maxResponseBytes,
    fetch: options.fetch,
  });

  return {
    async send(input: unknown): Promise<SendMessageResult> {
      const payload = validateSendMessageInput(input);
      const response = await httpClient.fetchText("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const rateLimit = parseRateLimitMetadata(response.status, response.headers);
      if (rateLimit.limited) {
        return {
          ok: false,
          error: {
            code: "CONNECTOR_RATE_LIMITED",
            message: "The upstream provider rate limited this request.",
            retryAfterSeconds: rateLimit.retryAfterSeconds,
          },
        };
      }

      const body = readJsonObject(response.body);
      if (body.ok !== true) {
        return {
          ok: false,
          error: {
            code: "CONNECTOR_UPSTREAM_ERROR",
            message: "Slack rejected the message send request.",
            providerError: typeof body.error === "string" ? body.error : undefined,
          },
        };
      }

      return {
        ok: true,
        message: normalizeMessage(requireRecord(body.message, "message") as SlackMessage, requireString(body.channel, "channel")),
      };
    },
  };
}

export function validateSendMessageInput(input: unknown): SendMessageInput {
  if (!isRecord(input)) {
    throw new Error("send message input must be an object");
  }
  const channel = requireString(input.channel, "channel").trim();
  const text = requireString(input.text, "text").trim();
  if (channel.length === 0) {
    throw new Error("channel is required");
  }
  if (text.length === 0) {
    throw new Error("text is required");
  }
  if (text.length > 40000) {
    throw new Error("text exceeds Slack message limit");
  }
  return { channel, text };
}

function readJsonObject(bodyText: string): Record<string, unknown> {
  try {
    return requireRecord(JSON.parse(bodyText), "response");
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

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${field} is required`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
