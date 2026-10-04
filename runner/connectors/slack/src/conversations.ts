import { createConnectorHttpClient, type ConnectorHttpClient } from "../../../bun/src/http";
import manifest from "../manifest.json";
import { parseRateLimitMetadata, type ConnectorError } from "./messages";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SlackChannel = {
  id: string;
  name?: string;
  is_channel?: boolean;
  is_private?: boolean;
  created?: number;
  creator?: string;
  is_member?: boolean;
  num_members?: number;
  topic?: { value?: string; creator?: string; last_set?: number };
  purpose?: { value?: string; creator?: string; last_set?: number };
  [key: string]: unknown;
};

export type NormalizedChannel = {
  id: string;
  provider: "slack";
  name: string;
  isPrivate: boolean;
  isMember: boolean;
  memberCount: number;
  created: number;
  creator: string;
  modelVersion: "2026-05-14";
  raw: SlackChannel;
};

export type ConversationsCreateInput = {
  name: string;
  isPrivate?: boolean;
};

export type ConversationsListInput = {
  cursor?: string;
  limit?: number;
  excludeArchived?: boolean;
};

export type ConversationsHistoryInput = {
  channel: string;
  cursor?: string;
  limit?: number;
  oldest?: string;
  latest?: string;
};

export type ConversationsInfoInput = {
  channel: string;
};

export type ConversationsInviteInput = {
  channel: string;
  users: string[];
};

export type ConversationsMembersInput = {
  channel: string;
  cursor?: string;
  limit?: number;
};

export type ConversationsRepliesInput = {
  channel: string;
  ts: string;
  cursor?: string;
  limit?: number;
};

export type ConversationsChannelInput = {
  channel: string;
};

export type ConversationsRenameInput = {
  channel: string;
  name: string;
};

export type ConversationsSetTopicInput = {
  channel: string;
  topic: string;
};

export type ConversationsKickInput = {
  channel: string;
  user: string;
};

export type ConversationsCreateResult =
  | { ok: true; channel: NormalizedChannel }
  | { ok: false; error: ConnectorError };

export type ConversationsListResult =
  | { ok: true; channels: NormalizedChannel[]; nextCursor: string | null }
  | { ok: false; error: ConnectorError };

export type ConversationsHistoryResult =
  | { ok: true; messages: Record<string, unknown>[]; hasMore: boolean; nextCursor: string | null }
  | { ok: false; error: ConnectorError };

export type ConversationsInfoResult =
  | { ok: true; channel: NormalizedChannel }
  | { ok: false; error: ConnectorError };

export type ConversationsInviteResult =
  | { ok: true; channel: NormalizedChannel }
  | { ok: false; error: ConnectorError };

export type ConversationsMembersResult =
  | { ok: true; members: string[]; nextCursor: string | null }
  | { ok: false; error: ConnectorError };

export type ConversationsRepliesResult =
  | { ok: true; messages: Record<string, unknown>[]; hasMore: boolean; nextCursor: string | null }
  | { ok: false; error: ConnectorError };

export type ConversationsChannelResult =
  | { ok: true; channel: NormalizedChannel }
  | { ok: false; error: ConnectorError };

export type ConversationsAckResult =
  | { ok: true; channel: string }
  | { ok: false; error: ConnectorError };

export type ConversationsSetTopicResult =
  | { ok: true; topic: string }
  | { ok: false; error: ConnectorError };

export type ConversationsKickResult =
  | { ok: true; channel: string; user: string }
  | { ok: false; error: ConnectorError };

export type SlackConversationsClientOptions = {
  token: string;
  fetch?: typeof fetch;
  httpClient?: ConnectorHttpClient;
};

// ─── Normalizer ───────────────────────────────────────────────────────────────

export function normalizeChannel(channel: SlackChannel): NormalizedChannel {
  return {
    id: requireString(channel.id, "channel.id"),
    provider: "slack",
    name: typeof channel.name === "string" ? channel.name : "",
    isPrivate: typeof channel.is_private === "boolean" ? channel.is_private : false,
    isMember: typeof channel.is_member === "boolean" ? channel.is_member : false,
    memberCount: typeof channel.num_members === "number" ? channel.num_members : 0,
    created: typeof channel.created === "number" ? channel.created : 0,
    creator: typeof channel.creator === "string" ? channel.creator : "",
    modelVersion: "2026-05-14",
    raw: channel,
  };
}

// ─── Validators ───────────────────────────────────────────────────────────────

export function validateConversationsCreateInput(input: unknown): ConversationsCreateInput {
  if (!isRecord(input)) throw new Error("conversations.create input must be an object");
  const name = requireString(input.name, "name").trim();
  if (name.length === 0) throw new Error("name is required");
  return {
    name,
    isPrivate: typeof input.isPrivate === "boolean" ? input.isPrivate : undefined,
  };
}

export function validateConversationsListInput(input: unknown): ConversationsListInput {
  if (!isRecord(input)) throw new Error("conversations.list input must be an object");
  return {
    cursor: typeof input.cursor === "string" ? input.cursor : undefined,
    limit: typeof input.limit === "number" ? Math.min(Math.max(1, input.limit), 1000) : undefined,
    excludeArchived: typeof input.excludeArchived === "boolean" ? input.excludeArchived : undefined,
  };
}

export function validateConversationsHistoryInput(input: unknown): ConversationsHistoryInput {
  if (!isRecord(input)) throw new Error("conversations.history input must be an object");
  const channel = requireString(input.channel, "channel").trim();
  if (channel.length === 0) throw new Error("channel is required");
  return {
    channel,
    cursor: typeof input.cursor === "string" ? input.cursor : undefined,
    limit: typeof input.limit === "number" ? Math.min(Math.max(1, input.limit), 1000) : undefined,
    oldest: typeof input.oldest === "string" ? input.oldest : undefined,
    latest: typeof input.latest === "string" ? input.latest : undefined,
  };
}

export function validateConversationsInfoInput(input: unknown): ConversationsInfoInput {
  if (!isRecord(input)) throw new Error("conversations.info input must be an object");
  const channel = requireString(input.channel, "channel").trim();
  if (channel.length === 0) throw new Error("channel is required");
  return { channel };
}

export function validateConversationsInviteInput(input: unknown): ConversationsInviteInput {
  if (!isRecord(input)) throw new Error("conversations.invite input must be an object");
  const channel = requireString(input.channel, "channel").trim();
  if (channel.length === 0) throw new Error("channel is required");
  if (!Array.isArray(input.users) || input.users.length === 0) throw new Error("users must be a non-empty array");
  const users = input.users.filter((u): u is string => typeof u === "string" && u.length > 0);
  if (users.length === 0) throw new Error("users must contain at least one valid user ID");
  return { channel, users };
}

export function validateConversationsMembersInput(input: unknown): ConversationsMembersInput {
  if (!isRecord(input)) throw new Error("conversations.members input must be an object");
  const channel = requireString(input.channel, "channel").trim();
  if (channel.length === 0) throw new Error("channel is required");
  return {
    channel,
    cursor: typeof input.cursor === "string" ? input.cursor : undefined,
    limit: typeof input.limit === "number" ? Math.min(Math.max(1, input.limit), 1000) : undefined,
  };
}

function validateChannelOnly(input: unknown, operation: string): ConversationsChannelInput {
  if (!isRecord(input)) throw new Error(`${operation} input must be an object`);
  const channel = requireString(input.channel, "channel").trim();
  if (channel.length === 0) throw new Error("channel is required");
  return { channel };
}

export function validateConversationsRepliesInput(input: unknown): ConversationsRepliesInput {
  if (!isRecord(input)) throw new Error("conversations.replies input must be an object");
  const channel = requireString(input.channel, "channel").trim();
  const ts = requireString(input.ts, "ts").trim();
  if (channel.length === 0) throw new Error("channel is required");
  if (ts.length === 0) throw new Error("ts is required");
  return {
    channel,
    ts,
    cursor: typeof input.cursor === "string" ? input.cursor : undefined,
    limit: typeof input.limit === "number" ? Math.min(Math.max(1, input.limit), 1000) : undefined,
  };
}

export function validateConversationsJoinInput(input: unknown): ConversationsChannelInput {
  return validateChannelOnly(input, "conversations.join");
}

export function validateConversationsLeaveInput(input: unknown): ConversationsChannelInput {
  return validateChannelOnly(input, "conversations.leave");
}

export function validateConversationsArchiveInput(input: unknown): ConversationsChannelInput {
  return validateChannelOnly(input, "conversations.archive");
}

export function validateConversationsUnarchiveInput(input: unknown): ConversationsChannelInput {
  return validateChannelOnly(input, "conversations.unarchive");
}

export function validateConversationsRenameInput(input: unknown): ConversationsRenameInput {
  if (!isRecord(input)) throw new Error("conversations.rename input must be an object");
  const channel = requireString(input.channel, "channel").trim();
  const name = requireString(input.name, "name").trim();
  if (channel.length === 0) throw new Error("channel is required");
  if (name.length === 0) throw new Error("name is required");
  return { channel, name };
}

export function validateConversationsSetTopicInput(input: unknown): ConversationsSetTopicInput {
  if (!isRecord(input)) throw new Error("conversations.setTopic input must be an object");
  const channel = requireString(input.channel, "channel").trim();
  if (channel.length === 0) throw new Error("channel is required");
  if (typeof input.topic !== "string") throw new Error("topic is required");
  return { channel, topic: input.topic };
}

export function validateConversationsKickInput(input: unknown): ConversationsKickInput {
  if (!isRecord(input)) throw new Error("conversations.kick input must be an object");
  const channel = requireString(input.channel, "channel").trim();
  const user = requireString(input.user, "user").trim();
  if (channel.length === 0) throw new Error("channel is required");
  if (user.length === 0) throw new Error("user is required");
  return { channel, user };
}

// ─── Client factory ───────────────────────────────────────────────────────────

export function createSlackConversationsClient(options: SlackConversationsClientOptions) {
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

  async function slackGet(endpoint: string, params: Record<string, string | number | boolean | undefined>): Promise<{ status: number; data: Record<string, unknown> }> {
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

  function extractNextCursor(data: Record<string, unknown>): string | null {
    const metadata = data.response_metadata;
    if (!isRecord(metadata)) return null;
    const cursor = metadata.next_cursor;
    return typeof cursor === "string" && cursor.length > 0 ? cursor : null;
  }

  return {
    async create(input: unknown): Promise<ConversationsCreateResult> {
      const payload = validateConversationsCreateInput(input);
      const body: Record<string, unknown> = { name: payload.name };
      if (payload.isPrivate !== undefined) body.is_private = payload.isPrivate;
      const { status, data } = await slackPost("conversations.create", body);
      const rl = rateLimitError(status);
      if (rl) return { ok: false, error: rl };
      if (data.ok !== true) return { ok: false, error: upstreamError(data, "Slack rejected the conversations.create request.") };
      return { ok: true, channel: normalizeChannel(requireRecord(data.channel, "channel") as SlackChannel) };
    },

    async list(input: unknown): Promise<ConversationsListResult> {
      const payload = validateConversationsListInput(input);
      const { status, data } = await slackGet("conversations.list", {
        cursor: payload.cursor,
        limit: payload.limit,
        exclude_archived: payload.excludeArchived,
      });
      const rl = rateLimitError(status);
      if (rl) return { ok: false, error: rl };
      if (data.ok !== true) return { ok: false, error: upstreamError(data, "Slack rejected the conversations.list request.") };
      const channels = Array.isArray(data.channels) ? data.channels.filter(isRecord).map((c) => normalizeChannel(c as SlackChannel)) : [];
      return { ok: true, channels, nextCursor: extractNextCursor(data) };
    },

    async history(input: unknown): Promise<ConversationsHistoryResult> {
      const payload = validateConversationsHistoryInput(input);
      const { status, data } = await slackGet("conversations.history", {
        channel: payload.channel,
        cursor: payload.cursor,
        limit: payload.limit,
        oldest: payload.oldest,
        latest: payload.latest,
      });
      const rl = rateLimitError(status);
      if (rl) return { ok: false, error: rl };
      if (data.ok !== true) return { ok: false, error: upstreamError(data, "Slack rejected the conversations.history request.") };
      const messages = Array.isArray(data.messages) ? data.messages.filter(isRecord) : [];
      const hasMore = typeof data.has_more === "boolean" ? data.has_more : false;
      return { ok: true, messages, hasMore, nextCursor: extractNextCursor(data) };
    },

    async info(input: unknown): Promise<ConversationsInfoResult> {
      const payload = validateConversationsInfoInput(input);
      const { status, data } = await slackGet("conversations.info", { channel: payload.channel });
      const rl = rateLimitError(status);
      if (rl) return { ok: false, error: rl };
      if (data.ok !== true) return { ok: false, error: upstreamError(data, "Slack rejected the conversations.info request.") };
      return { ok: true, channel: normalizeChannel(requireRecord(data.channel, "channel") as SlackChannel) };
    },

    async invite(input: unknown): Promise<ConversationsInviteResult> {
      const payload = validateConversationsInviteInput(input);
      const { status, data } = await slackPost("conversations.invite", {
        channel: payload.channel,
        users: payload.users.join(","),
      });
      const rl = rateLimitError(status);
      if (rl) return { ok: false, error: rl };
      if (data.ok !== true) return { ok: false, error: upstreamError(data, "Slack rejected the conversations.invite request.") };
      return { ok: true, channel: normalizeChannel(requireRecord(data.channel, "channel") as SlackChannel) };
    },

    async members(input: unknown): Promise<ConversationsMembersResult> {
      const payload = validateConversationsMembersInput(input);
      const { status, data } = await slackGet("conversations.members", {
        channel: payload.channel,
        cursor: payload.cursor,
        limit: payload.limit,
      });
      const rl = rateLimitError(status);
      if (rl) return { ok: false, error: rl };
      if (data.ok !== true) return { ok: false, error: upstreamError(data, "Slack rejected the conversations.members request.") };
      const members = Array.isArray(data.members) ? data.members.filter((m): m is string => typeof m === "string") : [];
      return { ok: true, members, nextCursor: extractNextCursor(data) };
    },

    async replies(input: unknown): Promise<ConversationsRepliesResult> {
      const payload = validateConversationsRepliesInput(input);
      const { status, data } = await slackGet("conversations.replies", {
        channel: payload.channel,
        ts: payload.ts,
        cursor: payload.cursor,
        limit: payload.limit,
      });
      const rl = rateLimitError(status);
      if (rl) return { ok: false, error: rl };
      if (data.ok !== true) return { ok: false, error: upstreamError(data, "Slack rejected the conversations.replies request.") };
      const messages = Array.isArray(data.messages) ? data.messages.filter(isRecord) : [];
      const hasMore = typeof data.has_more === "boolean" ? data.has_more : false;
      return { ok: true, messages, hasMore, nextCursor: extractNextCursor(data) };
    },

    async join(input: unknown): Promise<ConversationsChannelResult> {
      const payload = validateConversationsJoinInput(input);
      const { status, data } = await slackPost("conversations.join", { channel: payload.channel });
      const rl = rateLimitError(status);
      if (rl) return { ok: false, error: rl };
      if (data.ok !== true) return { ok: false, error: upstreamError(data, "Slack rejected the conversations.join request.") };
      return { ok: true, channel: normalizeChannel(requireRecord(data.channel, "channel") as SlackChannel) };
    },

    async leave(input: unknown): Promise<ConversationsAckResult> {
      const payload = validateConversationsLeaveInput(input);
      const { status, data } = await slackPost("conversations.leave", { channel: payload.channel });
      const rl = rateLimitError(status);
      if (rl) return { ok: false, error: rl };
      if (data.ok !== true) return { ok: false, error: upstreamError(data, "Slack rejected the conversations.leave request.") };
      return { ok: true, channel: payload.channel };
    },

    async archive(input: unknown): Promise<ConversationsAckResult> {
      const payload = validateConversationsArchiveInput(input);
      const { status, data } = await slackPost("conversations.archive", { channel: payload.channel });
      const rl = rateLimitError(status);
      if (rl) return { ok: false, error: rl };
      if (data.ok !== true) return { ok: false, error: upstreamError(data, "Slack rejected the conversations.archive request.") };
      return { ok: true, channel: payload.channel };
    },

    async unarchive(input: unknown): Promise<ConversationsAckResult> {
      const payload = validateConversationsUnarchiveInput(input);
      const { status, data } = await slackPost("conversations.unarchive", { channel: payload.channel });
      const rl = rateLimitError(status);
      if (rl) return { ok: false, error: rl };
      if (data.ok !== true) return { ok: false, error: upstreamError(data, "Slack rejected the conversations.unarchive request.") };
      return { ok: true, channel: payload.channel };
    },

    async rename(input: unknown): Promise<ConversationsChannelResult> {
      const payload = validateConversationsRenameInput(input);
      const { status, data } = await slackPost("conversations.rename", { channel: payload.channel, name: payload.name });
      const rl = rateLimitError(status);
      if (rl) return { ok: false, error: rl };
      if (data.ok !== true) return { ok: false, error: upstreamError(data, "Slack rejected the conversations.rename request.") };
      return { ok: true, channel: normalizeChannel(requireRecord(data.channel, "channel") as SlackChannel) };
    },

    async setTopic(input: unknown): Promise<ConversationsSetTopicResult> {
      const payload = validateConversationsSetTopicInput(input);
      const { status, data } = await slackPost("conversations.setTopic", { channel: payload.channel, topic: payload.topic });
      const rl = rateLimitError(status);
      if (rl) return { ok: false, error: rl };
      if (data.ok !== true) return { ok: false, error: upstreamError(data, "Slack rejected the conversations.setTopic request.") };
      const topic = isRecord(data.topic) && typeof data.topic.value === "string" ? data.topic.value : payload.topic;
      return { ok: true, topic };
    },

    async kick(input: unknown): Promise<ConversationsKickResult> {
      const payload = validateConversationsKickInput(input);
      const { status, data } = await slackPost("conversations.kick", { channel: payload.channel, user: payload.user });
      const rl = rateLimitError(status);
      if (rl) return { ok: false, error: rl };
      if (data.ok !== true) return { ok: false, error: upstreamError(data, "Slack rejected the conversations.kick request.") };
      return { ok: true, channel: payload.channel, user: payload.user };
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

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${field} is required`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
