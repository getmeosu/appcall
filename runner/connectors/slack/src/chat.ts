import { createConnectorHttpClient, type ConnectorHttpClient } from "../../../bun/src/http";
import manifest from "../manifest.json";
import { parseRateLimitMetadata, type ConnectorError, type ConnectorErrorCode } from "./messages";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ChatUpdateInput = {
  channel: string;
  ts: string;
  text: string;
};

export type ChatDeleteInput = {
  channel: string;
  ts: string;
};

export type ChatPostEphemeralInput = {
  channel: string;
  user: string;
  text: string;
};

export type ChatUpdateResult =
  | { ok: true; channel: string; ts: string; text: string; raw: Record<string, unknown> }
  | { ok: false; error: ConnectorError };

export type ChatDeleteResult =
  | { ok: true; channel: string; ts: string }
  | { ok: false; error: ConnectorError };

export type ChatPostEphemeralResult =
  | { ok: true; messageTs: string }
  | { ok: false; error: ConnectorError };

export type SlackChatClientOptions = {
  token: string;
  fetch?: typeof fetch;
  httpClient?: ConnectorHttpClient;
};

// ─── Validators ───────────────────────────────────────────────────────────────

export function validateChatUpdateInput(input: unknown): ChatUpdateInput {
  if (!isRecord(input)) throw new Error("chat.update input must be an object");
  const channel = requireString(input.channel, "channel").trim();
  const ts = requireString(input.ts, "ts").trim();
  const text = requireString(input.text, "text").trim();
  if (channel.length === 0) throw new Error("channel is required");
  if (ts.length === 0) throw new Error("ts is required");
  if (text.length === 0) throw new Error("text is required");
  if (text.length > 40000) throw new Error("text exceeds Slack message limit");
  return { channel, ts, text };
}

export function validateChatDeleteInput(input: unknown): ChatDeleteInput {
  if (!isRecord(input)) throw new Error("chat.delete input must be an object");
  const channel = requireString(input.channel, "channel").trim();
  const ts = requireString(input.ts, "ts").trim();
  if (channel.length === 0) throw new Error("channel is required");
  if (ts.length === 0) throw new Error("ts is required");
  return { channel, ts };
}

export function validateChatPostEphemeralInput(input: unknown): ChatPostEphemeralInput {
  if (!isRecord(input)) throw new Error("chat.postEphemeral input must be an object");
  const channel = requireString(input.channel, "channel").trim();
  const user = requireString(input.user, "user").trim();
  const text = requireString(input.text, "text").trim();
  if (channel.length === 0) throw new Error("channel is required");
  if (user.length === 0) throw new Error("user is required");
  if (text.length === 0) throw new Error("text is required");
  if (text.length > 40000) throw new Error("text exceeds Slack message limit");
  return { channel, user, text };
}

// ─── Client factory ───────────────────────────────────────────────────────────

export function createSlackChatClient(options: SlackChatClientOptions) {
  const token = requireString(options.token, "token");
  const httpClient = options.httpClient ?? createConnectorHttpClient({
    allowedHosts: manifest.network.allowedHosts,
    maxResponseBytes: manifest.operations["messages.send"].maxResponseBytes,
    fetch: options.fetch,
  });

  async function slackPost(endpoint: string, body: Record<string, unknown>): Promise<{ status: number; data: Record<string, unknown> }> {
    const response = await httpClient.fetchText(`https://slack.com/api/${endpoint}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    return { status: response.status, data: safeJsonObject(response.body) };
  }

  return {
    async update(input: unknown): Promise<ChatUpdateResult> {
      const payload = validateChatUpdateInput(input);
      const { status, data } = await slackPost("chat.update", {
        channel: payload.channel,
        ts: payload.ts,
        text: payload.text,
      });
      const rateLimit = parseRateLimitMetadata(status, {});
      if (rateLimit.limited) {
        return { ok: false, error: { code: "CONNECTOR_RATE_LIMITED", message: "The upstream provider rate limited this request.", retryAfterSeconds: rateLimit.retryAfterSeconds } };
      }
      if (data.ok !== true) {
        return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Slack rejected the chat.update request.", providerError: typeof data.error === "string" ? data.error : undefined } };
      }
      return {
        ok: true,
        channel: typeof data.channel === "string" ? data.channel : payload.channel,
        ts: typeof data.ts === "string" ? data.ts : payload.ts,
        text: typeof data.text === "string" ? data.text : payload.text,
        raw: data,
      };
    },

    async delete(input: unknown): Promise<ChatDeleteResult> {
      const payload = validateChatDeleteInput(input);
      const { status, data } = await slackPost("chat.delete", {
        channel: payload.channel,
        ts: payload.ts,
      });
      const rateLimit = parseRateLimitMetadata(status, {});
      if (rateLimit.limited) {
        return { ok: false, error: { code: "CONNECTOR_RATE_LIMITED", message: "The upstream provider rate limited this request.", retryAfterSeconds: rateLimit.retryAfterSeconds } };
      }
      if (data.ok !== true) {
        return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Slack rejected the chat.delete request.", providerError: typeof data.error === "string" ? data.error : undefined } };
      }
      return {
        ok: true,
        channel: typeof data.channel === "string" ? data.channel : payload.channel,
        ts: typeof data.ts === "string" ? data.ts : payload.ts,
      };
    },

    async postEphemeral(input: unknown): Promise<ChatPostEphemeralResult> {
      const payload = validateChatPostEphemeralInput(input);
      const { status, data } = await slackPost("chat.postEphemeral", {
        channel: payload.channel,
        user: payload.user,
        text: payload.text,
      });
      const rateLimit = parseRateLimitMetadata(status, {});
      if (rateLimit.limited) {
        return { ok: false, error: { code: "CONNECTOR_RATE_LIMITED", message: "The upstream provider rate limited this request.", retryAfterSeconds: rateLimit.retryAfterSeconds } };
      }
      if (data.ok !== true) {
        return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Slack rejected the chat.postEphemeral request.", providerError: typeof data.error === "string" ? data.error : undefined } };
      }
      return {
        ok: true,
        messageTs: typeof data.message_ts === "string" ? data.message_ts : "",
      };
    },
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safeJsonObject(bodyText: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(bodyText);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
