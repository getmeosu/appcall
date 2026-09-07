import { normalizeMessage, parseNextOffset, type NormalizedMessage, type TelegramUpdate } from "./messages";

export type MessagesListSyncInput = {
  response: unknown;
};

export type MessagesListSyncResult = {
  provider: "telegram";
  operation: "messages.list";
  items: NormalizedMessage[];
  cursor: string | null;
};

export function executeMessagesListSync(input: MessagesListSyncInput): MessagesListSyncResult {
  const response = requireRecord(input.response, "response");
  const updates = requireArray(response.result, "result") as TelegramUpdate[];

  return {
    provider: "telegram",
    operation: "messages.list",
    items: updates.map((update) => normalizeMessage(update)),
    cursor: parseNextOffset(response),
  };
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
