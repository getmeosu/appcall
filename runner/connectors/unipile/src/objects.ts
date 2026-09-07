import { prop, isRecord } from "./http";

// ---------------------------------------------------------------------------
// NormalizedAccount
// ---------------------------------------------------------------------------

export type NormalizedAccount = {
  id: string;
  provider: "unipile";
  accountId: string;
  name: string;
  type: string;
  status: string;
  modelVersion: "2026-05-17";
  raw: Record<string, unknown>;
};

export function normalizeAccount(a: Record<string, unknown>): NormalizedAccount {
  const accountId = prop(a, "id") || prop(a, "account_id");
  return {
    id: `uni-account:${accountId}`,
    provider: "unipile",
    accountId,
    name: prop(a, "name"),
    type: prop(a, "type"),
    status: prop(a, "status"),
    modelVersion: "2026-05-17",
    raw: a,
  };
}

export type UnipilePagination = { cursor: string | null };

export function parseAccountsResponse(response: unknown): { accounts: NormalizedAccount[]; pagination: UnipilePagination } {
  if (!isRecord(response)) return { accounts: [], pagination: { cursor: null } };
  const items = Array.isArray(response.items) ? response.items : (Array.isArray(response.accounts) ? response.accounts : []);
  const cursor = typeof response.cursor === "string" ? response.cursor : null;
  return {
    accounts: items.filter(isRecord).map(normalizeAccount),
    pagination: { cursor },
  };
}

// ---------------------------------------------------------------------------
// NormalizedMessage
// ---------------------------------------------------------------------------

export type NormalizedMessage = {
  id: string;
  provider: "unipile";
  messageId: string;
  chatId: string;
  senderId: string;
  text: string;
  timestamp: string;
  modelVersion: "2026-05-17";
  raw: Record<string, unknown>;
};

export function normalizeMessage(m: Record<string, unknown>): NormalizedMessage {
  const messageId = prop(m, "id") || prop(m, "message_id");
  return {
    id: `uni-msg:${messageId}`,
    provider: "unipile",
    messageId,
    chatId: prop(m, "chat_id"),
    senderId: prop(m, "sender_id"),
    text: prop(m, "text") || prop(m, "body"),
    timestamp: prop(m, "created_at") || prop(m, "timestamp"),
    modelVersion: "2026-05-17",
    raw: m,
  };
}

export function parseMessagesResponse(response: unknown): { messages: NormalizedMessage[]; pagination: UnipilePagination } {
  if (!isRecord(response)) return { messages: [], pagination: { cursor: null } };
  const items = Array.isArray(response.items) ? response.items : (Array.isArray(response.messages) ? response.messages : []);
  const cursor = typeof response.cursor === "string" ? response.cursor : null;
  return {
    messages: items.filter(isRecord).map(normalizeMessage),
    pagination: { cursor },
  };
}
