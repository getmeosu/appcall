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
  sendTelegramLocation,
  validateSendLocationInput,
  sendTelegramPoll,
  validateSendPollInput,
} from "./messages";
import {
  getChat,
  validateGetChatInput,
  getChatMemberCount,
  validateGetChatMemberCountInput,
  sendChatAction,
  validateSendChatActionInput,
  exportChatInviteLink as exportTelegramInviteLink,
  validateExportChatInviteLinkInput,
  getChatAdministrators as getTelegramChatAdministrators,
  validateGetChatAdministratorsInput,
  getChatMember as getTelegramChatMember,
  validateGetChatMemberInput,
  getChatHistory as getTelegramChatHistory,
  validateGetChatHistoryInput,
} from "./chats";
import {
  getMe,
  getUpdates as getTelegramUpdates,
  validateGetUpdatesInput,
  setMyCommands as setTelegramMyCommands,
  validateSetMyCommandsInput,
  answerCallbackQuery as answerTelegramCallbackQuery,
  validateAnswerCallbackQueryInput,
} from "./bot";

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

export function sendLocation(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.botToken === "string") {
    return sendTelegramLocation(input as Parameters<typeof sendTelegramLocation>[0]).then((result) => ({
      connector: "telegram",
      action: "messages.sendLocation",
      source: "connector",
      ...result,
    }));
  }
  return {
    connector: "telegram",
    action: "messages.sendLocation",
    source: "connector",
    validated: validateSendLocationInput(input),
  };
}

export function sendPoll(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.botToken === "string") {
    return sendTelegramPoll(input as Parameters<typeof sendTelegramPoll>[0]).then((result) => ({
      connector: "telegram",
      action: "messages.sendPoll",
      source: "connector",
      ...result,
    }));
  }
  return {
    connector: "telegram",
    action: "messages.sendPoll",
    source: "connector",
    validated: validateSendPollInput(input),
  };
}

export function exportChatInviteLink(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.botToken === "string") {
    return exportTelegramInviteLink(input as Parameters<typeof exportTelegramInviteLink>[0]).then((result) => ({
      connector: "telegram",
      action: "chats.exportInviteLink",
      source: "connector",
      ...result,
    }));
  }
  return {
    connector: "telegram",
    action: "chats.exportInviteLink",
    source: "connector",
    validated: validateExportChatInviteLinkInput(input),
  };
}

export function getChatAdministrators(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.botToken === "string") {
    return getTelegramChatAdministrators(input as Parameters<typeof getTelegramChatAdministrators>[0]).then((result) => ({
      connector: "telegram",
      action: "chats.getAdministrators",
      source: "connector",
      ...result,
    }));
  }
  return {
    connector: "telegram",
    action: "chats.getAdministrators",
    source: "connector",
    validated: validateGetChatAdministratorsInput(input),
  };
}

export function getChatMember(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.botToken === "string") {
    return getTelegramChatMember(input as Parameters<typeof getTelegramChatMember>[0]).then((result) => ({
      connector: "telegram",
      action: "chats.getMember",
      source: "connector",
      ...result,
    }));
  }
  return {
    connector: "telegram",
    action: "chats.getMember",
    source: "connector",
    validated: validateGetChatMemberInput(input),
  };
}

export function getChatHistory(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.botToken === "string") {
    return getTelegramChatHistory(input as Parameters<typeof getTelegramChatHistory>[0]).then((result) => ({
      connector: "telegram",
      action: "chats.getHistory",
      source: "connector",
      ...result,
    }));
  }
  return {
    connector: "telegram",
    action: "chats.getHistory",
    source: "connector",
    validated: validateGetChatHistoryInput(input),
  };
}

export function getUpdates(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.botToken === "string") {
    return getTelegramUpdates(input as Parameters<typeof getTelegramUpdates>[0]).then((result) => ({
      connector: "telegram",
      action: "bot.getUpdates",
      source: "connector",
      ...result,
    }));
  }
  return {
    connector: "telegram",
    action: "bot.getUpdates",
    source: "connector",
    validated: validateGetUpdatesInput(input),
  };
}

export function setMyCommands(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.botToken === "string") {
    return setTelegramMyCommands(input as Parameters<typeof setTelegramMyCommands>[0]).then((result) => ({
      connector: "telegram",
      action: "bot.setMyCommands",
      source: "connector",
      ...result,
    }));
  }
  return {
    connector: "telegram",
    action: "bot.setMyCommands",
    source: "connector",
    validated: validateSetMyCommandsInput(input),
  };
}

export function answerCallbackQuery(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.botToken === "string") {
    return answerTelegramCallbackQuery(input as Parameters<typeof answerTelegramCallbackQuery>[0]).then((result) => ({
      connector: "telegram",
      action: "callbacks.answer",
      source: "connector",
      ...result,
    }));
  }
  return {
    connector: "telegram",
    action: "callbacks.answer",
    source: "connector",
    validated: validateAnswerCallbackQueryInput(input),
  };
}
