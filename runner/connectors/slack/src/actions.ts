import { createSlackMessagesClient, validateSendMessageInput } from "./messages";
import {
  createSlackChatClient,
  validateChatUpdateInput,
  validateChatDeleteInput,
  validateChatPostEphemeralInput,
} from "./chat";
import {
  createSlackConversationsClient,
  validateConversationsCreateInput,
  validateConversationsListInput,
  validateConversationsHistoryInput,
  validateConversationsInfoInput,
  validateConversationsInviteInput,
  validateConversationsMembersInput,
} from "./conversations";
import { createSlackUsersClient, validateUsersListInput } from "./users";

// ─── Existing action ──────────────────────────────────────────────────────────

export function sendMessage(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.token === "string") {
    return createSlackMessagesClient({
      token: input.token,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).send(input).then((result) => {
      if (!result.ok) {
        throw {
          ok: false,
          code: result.error.code,
          message: result.error.message,
          retryAfterSeconds: result.error.retryAfterSeconds,
          providerError: result.error.providerError,
        };
      }
      return {
        connector: "slack",
        action: "messages.send",
        source: "connector",
        providerMessageId: result.message.providerMessageId,
        channelId: result.message.channelId,
        text: result.message.text,
        raw: result.message.raw,
      };
    });
  }

  return {
    connector: "slack",
    action: "messages.send",
    source: "connector",
    validated: validateSendMessageInput(input),
  };
}

// ─── chat.update ─────────────────────────────────────────────────────────────

export function updateMessage(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.token === "string") {
    return createSlackChatClient({
      token: input.token,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).update(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds, providerError: result.error.providerError };
      }
      return { connector: "slack", action: "chat.update", source: "connector", channel: result.channel, ts: result.ts, text: result.text, raw: result.raw };
    });
  }
  return { connector: "slack", action: "chat.update", source: "connector", validated: validateChatUpdateInput(input) };
}

// ─── chat.delete ─────────────────────────────────────────────────────────────

export function deleteMessage(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.token === "string") {
    return createSlackChatClient({
      token: input.token,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).delete(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds, providerError: result.error.providerError };
      }
      return { connector: "slack", action: "chat.delete", source: "connector", channel: result.channel, ts: result.ts };
    });
  }
  return { connector: "slack", action: "chat.delete", source: "connector", validated: validateChatDeleteInput(input) };
}

// ─── chat.postEphemeral ───────────────────────────────────────────────────────

export function postEphemeral(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.token === "string") {
    return createSlackChatClient({
      token: input.token,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).postEphemeral(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds, providerError: result.error.providerError };
      }
      return { connector: "slack", action: "chat.postEphemeral", source: "connector", messageTs: result.messageTs };
    });
  }
  return { connector: "slack", action: "chat.postEphemeral", source: "connector", validated: validateChatPostEphemeralInput(input) };
}

// ─── conversations.create ─────────────────────────────────────────────────────

export function createConversation(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.token === "string") {
    return createSlackConversationsClient({
      token: input.token,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).create(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds, providerError: result.error.providerError };
      }
      return { connector: "slack", action: "conversations.create", source: "connector", channel: result.channel };
    });
  }
  return { connector: "slack", action: "conversations.create", source: "connector", validated: validateConversationsCreateInput(input) };
}

// ─── conversations.list ───────────────────────────────────────────────────────

export function listConversations(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.token === "string") {
    return createSlackConversationsClient({
      token: input.token,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).list(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds, providerError: result.error.providerError };
      }
      return { connector: "slack", action: "conversations.list", source: "connector", channels: result.channels, nextCursor: result.nextCursor };
    });
  }
  return { connector: "slack", action: "conversations.list", source: "connector", validated: validateConversationsListInput(input) };
}

// ─── conversations.history ────────────────────────────────────────────────────

export function getConversationHistory(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.token === "string") {
    return createSlackConversationsClient({
      token: input.token,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).history(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds, providerError: result.error.providerError };
      }
      return { connector: "slack", action: "conversations.history", source: "connector", messages: result.messages, hasMore: result.hasMore, nextCursor: result.nextCursor };
    });
  }
  return { connector: "slack", action: "conversations.history", source: "connector", validated: validateConversationsHistoryInput(input) };
}

// ─── conversations.info ───────────────────────────────────────────────────────

export function getConversationInfo(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.token === "string") {
    return createSlackConversationsClient({
      token: input.token,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).info(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds, providerError: result.error.providerError };
      }
      return { connector: "slack", action: "conversations.info", source: "connector", channel: result.channel };
    });
  }
  return { connector: "slack", action: "conversations.info", source: "connector", validated: validateConversationsInfoInput(input) };
}

// ─── conversations.invite ─────────────────────────────────────────────────────

export function inviteToConversation(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.token === "string") {
    return createSlackConversationsClient({
      token: input.token,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).invite(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds, providerError: result.error.providerError };
      }
      return { connector: "slack", action: "conversations.invite", source: "connector", channel: result.channel };
    });
  }
  return { connector: "slack", action: "conversations.invite", source: "connector", validated: validateConversationsInviteInput(input) };
}

// ─── conversations.members ────────────────────────────────────────────────────

export function getConversationMembers(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.token === "string") {
    return createSlackConversationsClient({
      token: input.token,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).members(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds, providerError: result.error.providerError };
      }
      return { connector: "slack", action: "conversations.members", source: "connector", members: result.members, nextCursor: result.nextCursor };
    });
  }
  return { connector: "slack", action: "conversations.members", source: "connector", validated: validateConversationsMembersInput(input) };
}

// ─── users.list ───────────────────────────────────────────────────────────────

export function listUsers(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.token === "string") {
    return createSlackUsersClient({
      token: input.token,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).list(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds, providerError: result.error.providerError };
      }
      return { connector: "slack", action: "users.list", source: "connector", members: result.members, nextCursor: result.nextCursor };
    });
  }
  return { connector: "slack", action: "users.list", source: "connector", validated: validateUsersListInput(input) };
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
