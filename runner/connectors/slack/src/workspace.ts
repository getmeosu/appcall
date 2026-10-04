import { createConnectorHttpClient, type ConnectorHttpClient } from "../../../bun/src/http";
import manifest from "../manifest.json";
import { parseRateLimitMetadata, type ConnectorError } from "./messages";

export type SlackWorkspaceClientOptions = {
  token: string;
  fetch?: typeof fetch;
  httpClient?: ConnectorHttpClient;
};

export type TeamInfoResult =
  | { ok: true; team: Record<string, unknown> }
  | { ok: false; error: ConnectorError };

export type EmojiListResult =
  | { ok: true; emoji: Record<string, string> }
  | { ok: false; error: ConnectorError };

export type PinsListResult =
  | { ok: true; items: Record<string, unknown>[] }
  | { ok: false; error: ConnectorError };

export type ReactionsGetResult =
  | { ok: true; type: string; channel: string; message: Record<string, unknown> }
  | { ok: false; error: ConnectorError };

export type FilesInfoResult =
  | { ok: true; file: Record<string, unknown> }
  | { ok: false; error: ConnectorError };

export type AuthTestResult =
  | { ok: true; url: string; team: string; user: string; teamId: string; userId: string; botId: string }
  | { ok: false; error: ConnectorError };

export type AckResult =
  | { ok: true }
  | { ok: false; error: ConnectorError };

export type ChannelTsInput = { channel: string; ts: string };
export type ReactionInput = { channel: string; ts: string; name: string };
export type PinsListInput = { channel: string };
export type FilesInfoInput = { file: string };

export function validateTeamInfoInput(input: unknown): Record<string, never> {
  if (!isRecord(input)) throw new Error("team.info input must be an object");
  return {};
}

export function validateEmojiListInput(input: unknown): Record<string, never> {
  if (!isRecord(input)) throw new Error("emoji.list input must be an object");
  return {};
}

export function validateAuthTestInput(input: unknown): Record<string, never> {
  if (!isRecord(input)) throw new Error("auth.test input must be an object");
  return {};
}

export function validatePinsListInput(input: unknown): PinsListInput {
  if (!isRecord(input)) throw new Error("pins.list input must be an object");
  const channel = requireString(input.channel, "channel").trim();
  if (channel.length === 0) throw new Error("channel is required");
  return { channel };
}

export function validateReactionsGetInput(input: unknown): ChannelTsInput {
  return validateChannelTs(input, "reactions.get");
}

export function validateFilesInfoInput(input: unknown): FilesInfoInput {
  if (!isRecord(input)) throw new Error("files.info input must be an object");
  const file = requireString(input.file, "file").trim();
  if (file.length === 0) throw new Error("file is required");
  return { file };
}

export function validateReactionsAddInput(input: unknown): ReactionInput {
  return validateReaction(input, "reactions.add");
}

export function validateReactionsRemoveInput(input: unknown): ReactionInput {
  return validateReaction(input, "reactions.remove");
}

export function validatePinsAddInput(input: unknown): ChannelTsInput {
  return validateChannelTs(input, "pins.add");
}

export function validatePinsRemoveInput(input: unknown): ChannelTsInput {
  return validateChannelTs(input, "pins.remove");
}

export function createSlackWorkspaceClient(options: SlackWorkspaceClientOptions) {
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

  async function slackGet(endpoint: string, params: Record<string, string | number | undefined> = {}): Promise<{ status: number; data: Record<string, unknown> }> {
    const url = new URL(`https://slack.com/api/${endpoint}`);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
    const response = await httpClient.fetchText(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return { status: response.status, data: safeJsonObject(response.body) };
  }

  function rateLimitError(status: number): ConnectorError | null {
    const rateLimit = parseRateLimitMetadata(status, {});
    if (rateLimit.limited) {
      return { code: "CONNECTOR_RATE_LIMITED", message: "The upstream provider rate limited this request.", retryAfterSeconds: rateLimit.retryAfterSeconds };
    }
    return null;
  }

  function upstreamError(data: Record<string, unknown>, defaultMessage: string): ConnectorError {
    return { code: "CONNECTOR_UPSTREAM_ERROR", message: defaultMessage, providerError: typeof data.error === "string" ? data.error : undefined };
  }

  return {
    async teamInfo(input: unknown): Promise<TeamInfoResult> {
      validateTeamInfoInput(input);
      const { status, data } = await slackGet("team.info");
      const rl = rateLimitError(status);
      if (rl) return { ok: false, error: rl };
      if (data.ok !== true) return { ok: false, error: upstreamError(data, "Slack rejected the team.info request.") };
      return { ok: true, team: requireRecord(data.team, "team") };
    },

    async emojiList(input: unknown): Promise<EmojiListResult> {
      validateEmojiListInput(input);
      const { status, data } = await slackGet("emoji.list");
      const rl = rateLimitError(status);
      if (rl) return { ok: false, error: rl };
      if (data.ok !== true) return { ok: false, error: upstreamError(data, "Slack rejected the emoji.list request.") };
      const emoji = isRecord(data.emoji)
        ? Object.fromEntries(Object.entries(data.emoji).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
        : {};
      return { ok: true, emoji };
    },

    async pinsList(input: unknown): Promise<PinsListResult> {
      const payload = validatePinsListInput(input);
      const { status, data } = await slackGet("pins.list", { channel: payload.channel });
      const rl = rateLimitError(status);
      if (rl) return { ok: false, error: rl };
      if (data.ok !== true) return { ok: false, error: upstreamError(data, "Slack rejected the pins.list request.") };
      const items = Array.isArray(data.items) ? data.items.filter(isRecord) : [];
      return { ok: true, items };
    },

    async reactionsGet(input: unknown): Promise<ReactionsGetResult> {
      const payload = validateReactionsGetInput(input);
      const { status, data } = await slackGet("reactions.get", { channel: payload.channel, timestamp: payload.ts });
      const rl = rateLimitError(status);
      if (rl) return { ok: false, error: rl };
      if (data.ok !== true) return { ok: false, error: upstreamError(data, "Slack rejected the reactions.get request.") };
      return {
        ok: true,
        type: typeof data.type === "string" ? data.type : "message",
        channel: typeof data.channel === "string" ? data.channel : payload.channel,
        message: isRecord(data.message) ? data.message : {},
      };
    },

    async filesInfo(input: unknown): Promise<FilesInfoResult> {
      const payload = validateFilesInfoInput(input);
      const { status, data } = await slackGet("files.info", { file: payload.file });
      const rl = rateLimitError(status);
      if (rl) return { ok: false, error: rl };
      if (data.ok !== true) return { ok: false, error: upstreamError(data, "Slack rejected the files.info request.") };
      return { ok: true, file: requireRecord(data.file, "file") };
    },

    async authTest(input: unknown): Promise<AuthTestResult> {
      validateAuthTestInput(input);
      const { status, data } = await slackGet("auth.test");
      const rl = rateLimitError(status);
      if (rl) return { ok: false, error: rl };
      if (data.ok !== true) return { ok: false, error: upstreamError(data, "Slack rejected the auth.test request.") };
      return {
        ok: true,
        url: typeof data.url === "string" ? data.url : "",
        team: typeof data.team === "string" ? data.team : "",
        user: typeof data.user === "string" ? data.user : "",
        teamId: typeof data.team_id === "string" ? data.team_id : "",
        userId: typeof data.user_id === "string" ? data.user_id : "",
        botId: typeof data.bot_id === "string" ? data.bot_id : "",
      };
    },

    async reactionsAdd(input: unknown): Promise<AckResult> {
      const payload = validateReactionsAddInput(input);
      const { status, data } = await slackPost("reactions.add", {
        channel: payload.channel,
        timestamp: payload.ts,
        name: payload.name,
      });
      const rl = rateLimitError(status);
      if (rl) return { ok: false, error: rl };
      if (data.ok !== true) return { ok: false, error: upstreamError(data, "Slack rejected the reactions.add request.") };
      return { ok: true };
    },

    async reactionsRemove(input: unknown): Promise<AckResult> {
      const payload = validateReactionsRemoveInput(input);
      const { status, data } = await slackPost("reactions.remove", {
        channel: payload.channel,
        timestamp: payload.ts,
        name: payload.name,
      });
      const rl = rateLimitError(status);
      if (rl) return { ok: false, error: rl };
      if (data.ok !== true) return { ok: false, error: upstreamError(data, "Slack rejected the reactions.remove request.") };
      return { ok: true };
    },

    async pinsAdd(input: unknown): Promise<AckResult> {
      const payload = validatePinsAddInput(input);
      const { status, data } = await slackPost("pins.add", {
        channel: payload.channel,
        timestamp: payload.ts,
      });
      const rl = rateLimitError(status);
      if (rl) return { ok: false, error: rl };
      if (data.ok !== true) return { ok: false, error: upstreamError(data, "Slack rejected the pins.add request.") };
      return { ok: true };
    },

    async pinsRemove(input: unknown): Promise<AckResult> {
      const payload = validatePinsRemoveInput(input);
      const { status, data } = await slackPost("pins.remove", {
        channel: payload.channel,
        timestamp: payload.ts,
      });
      const rl = rateLimitError(status);
      if (rl) return { ok: false, error: rl };
      if (data.ok !== true) return { ok: false, error: upstreamError(data, "Slack rejected the pins.remove request.") };
      return { ok: true };
    },
  };
}

function validateChannelTs(input: unknown, operation: string): ChannelTsInput {
  if (!isRecord(input)) throw new Error(`${operation} input must be an object`);
  const channel = requireString(input.channel, "channel").trim();
  const ts = requireString(input.ts, "ts").trim();
  if (channel.length === 0) throw new Error("channel is required");
  if (ts.length === 0) throw new Error("ts is required");
  return { channel, ts };
}

function validateReaction(input: unknown, operation: string): ReactionInput {
  const base = validateChannelTs(input, operation);
  if (!isRecord(input)) throw new Error(`${operation} input must be an object`);
  const name = requireString(input.name, "name").trim();
  if (name.length === 0) throw new Error("name is required");
  return { ...base, name };
}

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

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${field} is required`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
