import {
  sendTelegramMessage,
  validateSendMessageInput,
  sendTelegramPhoto,
  validateSendPhotoInput,
  sendTelegramDocument,
  validateSendDocumentInput,
  editTelegramMessage,
  validateEditMessageTextInput,
  deleteTelegramMessage,
  validateDeleteMessageInput,
  forwardTelegramMessage,
  validateForwardMessageInput,
  pinTelegramMessage,
  validatePinChatMessageInput,
} from "./messages";
import {
  getChat,
  validateGetChatInput,
  getChatMemberCount,
  validateGetChatMemberCountInput,
  sendChatAction,
  validateSendChatActionInput,
} from "./chats";
import { getMe } from "./bot";
import {
  sendTelegramLocation,
  validateSendLocationInput,
  sendTelegramPoll,
  validateSendPollInput,
  unpinTelegramMessage,
  validateUnpinMessageInput,
  copyTelegramMessage,
  validateCopyMessageInput,
  getTelegramChatMember,
  validateGetChatMemberInput,
  getTelegramChatAdministrators,
  validateGetChatAdministratorsInput,
  exportTelegramChatInviteLink,
  validateExportInviteLinkInput,
  leaveTelegramChat,
  validateLeaveChatInput,
  getTelegramUpdates,
  validateGetUpdatesInput,
  setTelegramCommands,
  validateSetCommandsInput,
  answerTelegramCallbackQuery,
  validateAnswerCallbackQueryInput,
} from "./depth";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string") throw new Error(`${field} is required`);
  return value;
}

// ─── Existing actions ─────────────────────────────────────────────────────────

export function sendMessage(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.botToken === "string") {
    return sendTelegramMessage(input as Parameters<typeof sendTelegramMessage>[0]).then((result) => ({
      connector: "telegram",
      action: "messages.send",
      source: "connector",
      ...result,
    }));
  }
  return {
    connector: "telegram",
    action: "messages.send",
    source: "connector",
    validated: validateSendMessageInput(input),
  };
}

export function validateCredentials(input: unknown): Record<string, unknown> {
  const botToken = validateCredentialInput(input).botToken;
  void botToken;
  return {
    connector: "telegram",
    action: "credentials.validate",
    source: "connector",
    valid: true,
  };
}

function validateCredentialInput(input: unknown): { botToken: string } {
  if (!isRecord(input)) throw new Error("credentials input must be an object");
  const botToken = requireString(input.botToken, "botToken").trim();
  if (botToken.length === 0) throw new Error("botToken is required");
  return { botToken };
}

// ─── New actions ──────────────────────────────────────────────────────────────

export function sendPhoto(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.botToken === "string") {
    return sendTelegramPhoto(input as Parameters<typeof sendTelegramPhoto>[0]).then((result) => ({
      connector: "telegram",
      action: "messages.sendPhoto",
      source: "connector",
      ...result,
    }));
  }
  return {
    connector: "telegram",
    action: "messages.sendPhoto",
    source: "connector",
    validated: validateSendPhotoInput(input),
  };
}

export function sendDocument(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.botToken === "string") {
    return sendTelegramDocument(input as Parameters<typeof sendTelegramDocument>[0]).then((result) => ({
      connector: "telegram",
      action: "messages.sendDocument",
      source: "connector",
      ...result,
    }));
  }
  return {
    connector: "telegram",
    action: "messages.sendDocument",
    source: "connector",
    validated: validateSendDocumentInput(input),
  };
}

export function editMessage(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.botToken === "string") {
    return editTelegramMessage(input as Parameters<typeof editTelegramMessage>[0]).then((result) => ({
      connector: "telegram",
      action: "messages.edit",
      source: "connector",
      ...result,
    }));
  }
  return {
    connector: "telegram",
    action: "messages.edit",
    source: "connector",
    validated: validateEditMessageTextInput(input),
  };
}

export function deleteMessage(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.botToken === "string") {
    return deleteTelegramMessage(input as Parameters<typeof deleteTelegramMessage>[0]).then((result) => ({
      connector: "telegram",
      action: "messages.delete",
      source: "connector",
      ...result,
    }));
  }
  return {
    connector: "telegram",
    action: "messages.delete",
    source: "connector",
    validated: validateDeleteMessageInput(input),
  };
}

export function forwardMessage(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.botToken === "string") {
    return forwardTelegramMessage(input as Parameters<typeof forwardTelegramMessage>[0]).then((result) => ({
      connector: "telegram",
      action: "messages.forward",
      source: "connector",
      ...result,
    }));
  }
  return {
    connector: "telegram",
    action: "messages.forward",
    source: "connector",
    validated: validateForwardMessageInput(input),
  };
}

export function pinMessage(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.botToken === "string") {
    return pinTelegramMessage(input as Parameters<typeof pinTelegramMessage>[0]).then((result) => ({
      connector: "telegram",
      action: "messages.pin",
      source: "connector",
      ...result,
    }));
  }
  return {
    connector: "telegram",
    action: "messages.pin",
    source: "connector",
    validated: validatePinChatMessageInput(input),
  };
}

export function getChatInfo(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.botToken === "string") {
    return getChat(input as Parameters<typeof getChat>[0]).then((result) => ({
      connector: "telegram",
      action: "chats.get",
      source: "connector",
      ...result,
    }));
  }
  return {
    connector: "telegram",
    action: "chats.get",
    source: "connector",
    validated: validateGetChatInput(input),
  };
}

export function getChatMemberCountAction(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.botToken === "string") {
    return getChatMemberCount(input as Parameters<typeof getChatMemberCount>[0]).then((result) => ({
      connector: "telegram",
      action: "chats.getMemberCount",
      source: "connector",
      ...result,
    }));
  }
  return {
    connector: "telegram",
    action: "chats.getMemberCount",
    source: "connector",
    validated: validateGetChatMemberCountInput(input),
  };
}

export function sendChatActionHandler(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.botToken === "string") {
    return sendChatAction(input as Parameters<typeof sendChatAction>[0]).then((result) => ({
      connector: "telegram",
      action: "chats.sendAction",
      source: "connector",
      ...result,
    }));
  }
  return {
    connector: "telegram",
    action: "chats.sendAction",
    source: "connector",
    validated: validateSendChatActionInput(input),
  };
}

export function getMeAction(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.botToken === "string") {
    return getMe(input as Parameters<typeof getMe>[0]).then((result) => ({
      connector: "telegram",
      action: "bot.getMe",
      source: "connector",
      ...result,
    }));
  }
  return {
    connector: "telegram",
    action: "bot.getMe",
    source: "connector",
    validated: {},
  };
}

function wrapTelegramAction<T>(
  action: string,
  validate: (input: unknown) => T,
  execute: (input: Record<string, unknown> & { botToken: string }) => Promise<Record<string, unknown>>,
) {
  return (input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> => {
    if (isRecord(input) && typeof input.botToken === "string") {
      return execute(input as Record<string, unknown> & { botToken: string }).then((result) => ({
        connector: "telegram",
        action,
        source: "connector",
        ...result,
      }));
    }
    return {
      connector: "telegram",
      action,
      source: "connector",
      validated: validate(input),
    };
  };
}

export const sendLocation = wrapTelegramAction(
  "messages.sendLocation",
  validateSendLocationInput,
  (input) => sendTelegramLocation({ ...input, operation: "messages.sendLocation" }),
);
export const sendPoll = wrapTelegramAction(
  "messages.sendPoll",
  validateSendPollInput,
  (input) => sendTelegramPoll({ ...input, operation: "messages.sendPoll" }),
);
export const unpinMessage = wrapTelegramAction(
  "messages.unpin",
  validateUnpinMessageInput,
  (input) => unpinTelegramMessage({ ...input, operation: "messages.unpin" }),
);
export const copyMessage = wrapTelegramAction(
  "messages.copy",
  validateCopyMessageInput,
  (input) => copyTelegramMessage({ ...input, operation: "messages.copy" }),
);
export const getChatMember = wrapTelegramAction(
  "chats.getMember",
  validateGetChatMemberInput,
  (input) => getTelegramChatMember({ ...input, operation: "chats.getMember" }),
);
export const getChatAdministrators = wrapTelegramAction(
  "chats.getAdministrators",
  validateGetChatAdministratorsInput,
  (input) => getTelegramChatAdministrators({ ...input, operation: "chats.getAdministrators" }),
);
export const exportChatInviteLink = wrapTelegramAction(
  "chats.exportInviteLink",
  validateExportInviteLinkInput,
  (input) => exportTelegramChatInviteLink({ ...input, operation: "chats.exportInviteLink" }),
);
export const leaveChat = wrapTelegramAction(
  "chats.leave",
  validateLeaveChatInput,
  (input) => leaveTelegramChat({ ...input, operation: "chats.leave" }),
);
export const getUpdates = wrapTelegramAction(
  "bot.getUpdates",
  validateGetUpdatesInput,
  (input) => getTelegramUpdates({ ...input, operation: "bot.getUpdates" }),
);
export const setCommands = wrapTelegramAction(
  "bot.setCommands",
  validateSetCommandsInput,
  (input) => setTelegramCommands({ ...input, operation: "bot.setCommands" }),
);
export const answerCallbackQuery = wrapTelegramAction(
  "bot.answerCallbackQuery",
  validateAnswerCallbackQueryInput,
  (input) => answerTelegramCallbackQuery({ ...input, operation: "bot.answerCallbackQuery" }),
);
