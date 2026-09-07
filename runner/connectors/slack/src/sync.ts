import { normalizeMessage, parseNextCursor, type NormalizedMessage, type SlackMessage } from "./messages";

export type MessagesListSyncInput = {
  channelId: string;
  response: unknown;
};

export type MessagesListSyncResult = {
  provider: "slack";
  operation: "messages.list";
  items: NormalizedMessage[];
  cursor: string | null;
};

export function executeMessagesListSync(input: MessagesListSyncInput): MessagesListSyncResult {
  const channelId = requireNonEmptyString(input.channelId, "channelId");
  const response = requireRecord(input.response, "response");
  const messages = requireArray(response.messages, "messages") as SlackMessage[];

  return {
    provider: "slack",
    operation: "messages.list",
    items: messages.map((message) => normalizeMessage(message, channelId)),
    cursor: parseNextCursor(response),
  };
}

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} is required`);
  }
  return value.trim();
}

function requireArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${field} must be an array`);
  }
  return value;
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  return value;
}
