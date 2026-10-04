import { createSlackMessagesClient, validateSendMessageInput } from "./messages";
import {
  createSlackChatClient,
  validateChatUpdateInput,
  validateChatDeleteInput,
  validateChatPostEphemeralInput,
  validateChatScheduleMessageInput,
  validateChatMeMessageInput,
} from "./chat";
import {
  createSlackConversationsClient,
  validateConversationsCreateInput,
  validateConversationsListInput,
  validateConversationsHistoryInput,
  validateConversationsInfoInput,
  validateConversationsInviteInput,
  validateConversationsMembersInput,
  validateConversationsRepliesInput,
  validateConversationsJoinInput,
  validateConversationsLeaveInput,
  validateConversationsArchiveInput,
  validateConversationsUnarchiveInput,
  validateConversationsRenameInput,
  validateConversationsSetTopicInput,
  validateConversationsKickInput,
} from "./conversations";
import {
  createSlackUsersClient,
  validateUsersListInput,
  validateUsersInfoInput,
  validateUsersLookupByEmailInput,
} from "./users";
import {
  createSlackWorkspaceClient,
  validateTeamInfoInput,
  validateEmojiListInput,
  validatePinsListInput,
  validateReactionsGetInput,
  validateFilesInfoInput,
  validateAuthTestInput,
  validateReactionsAddInput,
  validateReactionsRemoveInput,
  validatePinsAddInput,
  validatePinsRemoveInput,
} from "./workspace";

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

export function getUserInfo(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.token === "string") {
    return createSlackUsersClient({
      token: input.token,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).info(input).then((result) => {
      if (!result.ok) throwActionError(result.error);
      return { connector: "slack", action: "users.info", source: "connector", user: result.user };
    });
  }
  return { connector: "slack", action: "users.info", source: "connector", validated: validateUsersInfoInput(input) };
}

export function lookupUserByEmail(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.token === "string") {
    return createSlackUsersClient({
      token: input.token,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).lookupByEmail(input).then((result) => {
      if (!result.ok) throwActionError(result.error);
      return { connector: "slack", action: "users.lookupByEmail", source: "connector", user: result.user };
    });
  }
  return { connector: "slack", action: "users.lookupByEmail", source: "connector", validated: validateUsersLookupByEmailInput(input) };
}

export function getConversationReplies(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.token === "string") {
    return createSlackConversationsClient({
      token: input.token,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).replies(input).then((result) => {
      if (!result.ok) throwActionError(result.error);
      return { connector: "slack", action: "conversations.replies", source: "connector", messages: result.messages, hasMore: result.hasMore, nextCursor: result.nextCursor };
    });
  }
  return { connector: "slack", action: "conversations.replies", source: "connector", validated: validateConversationsRepliesInput(input) };
}

export function joinConversation(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.token === "string") {
    return createSlackConversationsClient({
      token: input.token,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).join(input).then((result) => {
      if (!result.ok) throwActionError(result.error);
      return { connector: "slack", action: "conversations.join", source: "connector", channel: result.channel };
    });
  }
  return { connector: "slack", action: "conversations.join", source: "connector", validated: validateConversationsJoinInput(input) };
}

export function leaveConversation(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.token === "string") {
    return createSlackConversationsClient({
      token: input.token,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).leave(input).then((result) => {
      if (!result.ok) throwActionError(result.error);
      return { connector: "slack", action: "conversations.leave", source: "connector", channel: result.channel };
    });
  }
  return { connector: "slack", action: "conversations.leave", source: "connector", validated: validateConversationsLeaveInput(input) };
}

export function archiveConversation(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.token === "string") {
    return createSlackConversationsClient({
      token: input.token,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).archive(input).then((result) => {
      if (!result.ok) throwActionError(result.error);
      return { connector: "slack", action: "conversations.archive", source: "connector", channel: result.channel };
    });
  }
  return { connector: "slack", action: "conversations.archive", source: "connector", validated: validateConversationsArchiveInput(input) };
}

export function unarchiveConversation(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.token === "string") {
    return createSlackConversationsClient({
      token: input.token,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).unarchive(input).then((result) => {
      if (!result.ok) throwActionError(result.error);
      return { connector: "slack", action: "conversations.unarchive", source: "connector", channel: result.channel };
    });
  }
  return { connector: "slack", action: "conversations.unarchive", source: "connector", validated: validateConversationsUnarchiveInput(input) };
}

export function renameConversation(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.token === "string") {
    return createSlackConversationsClient({
      token: input.token,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).rename(input).then((result) => {
      if (!result.ok) throwActionError(result.error);
      return { connector: "slack", action: "conversations.rename", source: "connector", channel: result.channel };
    });
  }
  return { connector: "slack", action: "conversations.rename", source: "connector", validated: validateConversationsRenameInput(input) };
}

export function setConversationTopic(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.token === "string") {
    return createSlackConversationsClient({
      token: input.token,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).setTopic(input).then((result) => {
      if (!result.ok) throwActionError(result.error);
      return { connector: "slack", action: "conversations.setTopic", source: "connector", topic: result.topic };
    });
  }
  return { connector: "slack", action: "conversations.setTopic", source: "connector", validated: validateConversationsSetTopicInput(input) };
}

export function kickFromConversation(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.token === "string") {
    return createSlackConversationsClient({
      token: input.token,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).kick(input).then((result) => {
      if (!result.ok) throwActionError(result.error);
      return { connector: "slack", action: "conversations.kick", source: "connector", channel: result.channel, user: result.user };
    });
  }
  return { connector: "slack", action: "conversations.kick", source: "connector", validated: validateConversationsKickInput(input) };
}

export function scheduleMessage(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.token === "string") {
    return createSlackChatClient({
      token: input.token,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).scheduleMessage(input).then((result) => {
      if (!result.ok) throwActionError(result.error);
      return { connector: "slack", action: "chat.scheduleMessage", source: "connector", channel: result.channel, scheduledMessageId: result.scheduledMessageId, postAt: result.postAt };
    });
  }
  return { connector: "slack", action: "chat.scheduleMessage", source: "connector", validated: validateChatScheduleMessageInput(input) };
}

export function meMessage(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.token === "string") {
    return createSlackChatClient({
      token: input.token,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).meMessage(input).then((result) => {
      if (!result.ok) throwActionError(result.error);
      return { connector: "slack", action: "chat.meMessage", source: "connector", channel: result.channel, ts: result.ts };
    });
  }
  return { connector: "slack", action: "chat.meMessage", source: "connector", validated: validateChatMeMessageInput(input) };
}

export function getTeamInfo(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.token === "string") {
    return createSlackWorkspaceClient({
      token: input.token,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).teamInfo(input).then((result) => {
      if (!result.ok) throwActionError(result.error);
      return { connector: "slack", action: "team.info", source: "connector", team: result.team };
    });
  }
  return { connector: "slack", action: "team.info", source: "connector", validated: validateTeamInfoInput(input) };
}

export function listEmoji(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.token === "string") {
    return createSlackWorkspaceClient({
      token: input.token,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).emojiList(input).then((result) => {
      if (!result.ok) throwActionError(result.error);
      return { connector: "slack", action: "emoji.list", source: "connector", emoji: result.emoji };
    });
  }
  return { connector: "slack", action: "emoji.list", source: "connector", validated: validateEmojiListInput(input) };
}

export function listPins(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.token === "string") {
    return createSlackWorkspaceClient({
      token: input.token,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).pinsList(input).then((result) => {
      if (!result.ok) throwActionError(result.error);
      return { connector: "slack", action: "pins.list", source: "connector", items: result.items };
    });
  }
  return { connector: "slack", action: "pins.list", source: "connector", validated: validatePinsListInput(input) };
}

export function getReactions(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.token === "string") {
    return createSlackWorkspaceClient({
      token: input.token,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).reactionsGet(input).then((result) => {
      if (!result.ok) throwActionError(result.error);
      return { connector: "slack", action: "reactions.get", source: "connector", type: result.type, channel: result.channel, message: result.message };
    });
  }
  return { connector: "slack", action: "reactions.get", source: "connector", validated: validateReactionsGetInput(input) };
}

export function getFileInfo(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.token === "string") {
    return createSlackWorkspaceClient({
      token: input.token,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).filesInfo(input).then((result) => {
      if (!result.ok) throwActionError(result.error);
      return { connector: "slack", action: "files.info", source: "connector", file: result.file };
    });
  }
  return { connector: "slack", action: "files.info", source: "connector", validated: validateFilesInfoInput(input) };
}

export function authTest(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.token === "string") {
    return createSlackWorkspaceClient({
      token: input.token,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).authTest(input).then((result) => {
      if (!result.ok) throwActionError(result.error);
      return { connector: "slack", action: "auth.test", source: "connector", url: result.url, team: result.team, user: result.user, teamId: result.teamId, userId: result.userId, botId: result.botId };
    });
  }
  return { connector: "slack", action: "auth.test", source: "connector", validated: validateAuthTestInput(input) };
}

export function addReaction(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.token === "string") {
    return createSlackWorkspaceClient({
      token: input.token,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).reactionsAdd(input).then((result) => {
      if (!result.ok) throwActionError(result.error);
      return { connector: "slack", action: "reactions.add", source: "connector", ok: true };
    });
  }
  return { connector: "slack", action: "reactions.add", source: "connector", validated: validateReactionsAddInput(input) };
}

export function removeReaction(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.token === "string") {
    return createSlackWorkspaceClient({
      token: input.token,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).reactionsRemove(input).then((result) => {
      if (!result.ok) throwActionError(result.error);
      return { connector: "slack", action: "reactions.remove", source: "connector", ok: true };
    });
  }
  return { connector: "slack", action: "reactions.remove", source: "connector", validated: validateReactionsRemoveInput(input) };
}

export function addPin(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.token === "string") {
    return createSlackWorkspaceClient({
      token: input.token,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).pinsAdd(input).then((result) => {
      if (!result.ok) throwActionError(result.error);
      return { connector: "slack", action: "pins.add", source: "connector", ok: true };
    });
  }
  return { connector: "slack", action: "pins.add", source: "connector", validated: validatePinsAddInput(input) };
}

export function removePin(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.token === "string") {
    return createSlackWorkspaceClient({
      token: input.token,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).pinsRemove(input).then((result) => {
      if (!result.ok) throwActionError(result.error);
      return { connector: "slack", action: "pins.remove", source: "connector", ok: true };
    });
  }
  return { connector: "slack", action: "pins.remove", source: "connector", validated: validatePinsRemoveInput(input) };
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function throwActionError(error: { code: string; message: string; retryAfterSeconds?: number; providerError?: string }): never {
  throw { ok: false, code: error.code, message: error.message, retryAfterSeconds: error.retryAfterSeconds, providerError: error.providerError };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
