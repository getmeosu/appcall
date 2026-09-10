import { createGraphClient, parseGraphRateLimit, type GraphClient } from "./http";

export type OutlookMessage = {
  id: string;
  subject?: string;
  bodyPreview?: string;
  importance?: string;
  conversationId?: string;
  receivedDateTime?: string;
  sentDateTime?: string;
  isRead?: boolean;
  isDraft?: boolean;
  internetMessageId?: string;
  from?: { emailAddress?: { address?: string; name?: string } };
  toRecipients?: { emailAddress?: { address?: string; name?: string } }[];
  webLink?: string;
  [key: string]: unknown;
};

export type NormalizedMessage = {
  id: string;
  provider: "microsoft-365";
  providerMessageId: string;
  threadId: string;
  senderId: string;
  subject: string;
  text: string;
  modelVersion: "2026-05-16";
  raw: OutlookMessage;
};

export function normalizeOutlookMessage(message: OutlookMessage): NormalizedMessage {
  return {
    id: `outlook:${message.id}`,
    provider: "microsoft-365",
    providerMessageId: message.id,
    threadId: message.conversationId ?? "",
    senderId: message.from?.emailAddress?.address ?? "",
    subject: message.subject ?? "",
    text: message.bodyPreview ?? "",
    modelVersion: "2026-05-16",
    raw: message,
  };
}

export function parseMessagesResponse(response: unknown): { messages: OutlookMessage[]; nextLink: string | null } {
  if (!isRecord(response)) return { messages: [], nextLink: null };
  const value = response.value;
  if (!Array.isArray(value)) return { messages: [], nextLink: null };
  return {
    messages: value.filter(isRecord).map((m) => ({
      id: requireString(m.id, "id"),
      subject: typeof m.subject === "string" ? m.subject : undefined,
      bodyPreview: typeof m.bodyPreview === "string" ? m.bodyPreview : undefined,
      importance: typeof m.importance === "string" ? m.importance : undefined,
      conversationId: typeof m.conversationId === "string" ? m.conversationId : undefined,
      receivedDateTime: typeof m.receivedDateTime === "string" ? m.receivedDateTime : undefined,
      sentDateTime: typeof m.sentDateTime === "string" ? m.sentDateTime : undefined,
      isRead: typeof m.isRead === "boolean" ? m.isRead : undefined,
      isDraft: typeof m.isDraft === "boolean" ? m.isDraft : undefined,
      internetMessageId: typeof m.internetMessageId === "string" ? m.internetMessageId : undefined,
      from: isRecord(m.from) ? m.from : undefined,
      toRecipients: Array.isArray(m.toRecipients) ? m.toRecipients : undefined,
      webLink: typeof m.webLink === "string" ? m.webLink : undefined,
    })),
    nextLink: parseNextOdataLink(response),
  };
}

export type SendMessageInput = { to: string[]; subject: string; body: string; contentType?: string };

export function validateSendMessageInput(input: unknown): SendMessageInput {
  if (!isRecord(input)) throw new Error("send message input must be an object");
  const to = requireArray(input.to, "to");
  if (to.length === 0) throw new Error("to must contain at least one recipient");
  const recipients = to.map((recipient) => {
    if (typeof recipient === "string") return requireRecipientAddress(recipient);
    const record = requireRecord(recipient, "to");
    const address = isRecord(record.emailAddress) ? record.emailAddress.address : record.address;
    return requireRecipientAddress(address);
  });
  return { to: recipients, subject: requireString(input.subject, "subject"), body: requireString(input.body, "body"), contentType: typeof input.contentType === "string" ? input.contentType : "text" };
}

export function createOutlookClient(options: { accessToken: string; fetch?: typeof fetch; graphClient?: GraphClient }) {
  const client = options.graphClient ?? createGraphClient({ accessToken: options.accessToken, fetch: options.fetch, operation: "messages.send" });

  return {
    async send(input: unknown) {
      const payload = validateSendMessageInput(input);
      const response = await client.fetchText("/v1.0/me/sendMail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: { subject: payload.subject, body: { contentType: payload.contentType, content: payload.body }, toRecipients: payload.to.map((addr) => ({ emailAddress: { address: addr } })) },
        }),
      });
      if (response.status === 202) return { ok: true as const };
      if (response.status === 429) {
        const rateLimit = parseGraphRateLimit(response.status, response.headers);
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "Outlook rate limit exceeded.", retryAfterSeconds: rateLimit.limited ? rateLimit.retryAfterSeconds : undefined } };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Outlook rejected the send request." } };
    },
  };
}

export type OutlookClient = { send(input: unknown): Promise<{ ok: true } | { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } }> };

// ─── Get Message ──────────────────────────────────────────────────────────────

export type GetMessageInput = { messageId: string };

export function validateGetMessageInput(input: unknown): GetMessageInput {
  if (!isRecord(input)) throw new Error("get message input must be an object");
  return { messageId: requireString(input.messageId, "messageId") };
}

export function createGetMessageClient(options: { accessToken: string; fetch?: typeof fetch; graphClient?: GraphClient }) {
  const client = options.graphClient ?? createGraphClient({ accessToken: options.accessToken, fetch: options.fetch, operation: "messages.get" });

  return {
    async get(input: unknown) {
      const payload = validateGetMessageInput(input);
      const response = await client.fetchJSON(`/v1.0/me/messages/${encodeURIComponent(payload.messageId)}`);
      if (response.status === 200) {
        const msg = response.body as OutlookMessage;
        return { ok: true as const, message: normalizeOutlookMessage({ id: requireString((msg as Record<string, unknown>).id, "id"), ...msg as Record<string, unknown> }) };
      }
      if (response.status === 429) {
        const rateLimit = parseGraphRateLimit(response.status, response.headers);
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "Graph rate limit exceeded.", retryAfterSeconds: rateLimit.limited ? rateLimit.retryAfterSeconds : undefined } };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Graph rejected the get message request." } };
    },
  };
}

// ─── Reply to Message ─────────────────────────────────────────────────────────

export type ReplyMessageInput = { messageId: string; comment: string };

export function validateReplyMessageInput(input: unknown): ReplyMessageInput {
  if (!isRecord(input)) throw new Error("reply message input must be an object");
  return {
    messageId: requireString(input.messageId, "messageId"),
    comment: requireString(input.comment, "comment"),
  };
}

export function createReplyMessageClient(options: { accessToken: string; fetch?: typeof fetch; graphClient?: GraphClient }) {
  const client = options.graphClient ?? createGraphClient({ accessToken: options.accessToken, fetch: options.fetch, operation: "messages.reply" });

  return {
    async reply(input: unknown) {
      const payload = validateReplyMessageInput(input);
      const response = await client.fetchJSON(`/v1.0/me/messages/${encodeURIComponent(payload.messageId)}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: payload.comment }),
      });
      if (response.status === 202) return { ok: true as const };
      if (response.status === 429) {
        const rateLimit = parseGraphRateLimit(response.status, response.headers);
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "Graph rate limit exceeded.", retryAfterSeconds: rateLimit.limited ? rateLimit.retryAfterSeconds : undefined } };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Graph rejected the reply request." } };
    },
  };
}

// ─── Move Message ─────────────────────────────────────────────────────────────

export type MoveMessageInput = { messageId: string; destinationId: string };

export function validateMoveMessageInput(input: unknown): MoveMessageInput {
  if (!isRecord(input)) throw new Error("move message input must be an object");
  return {
    messageId: requireString(input.messageId, "messageId"),
    destinationId: requireString(input.destinationId, "destinationId"),
  };
}

export function createMoveMessageClient(options: { accessToken: string; fetch?: typeof fetch; graphClient?: GraphClient }) {
  const client = options.graphClient ?? createGraphClient({ accessToken: options.accessToken, fetch: options.fetch, operation: "messages.move" });

  return {
    async move(input: unknown) {
      const payload = validateMoveMessageInput(input);
      const response = await client.fetchJSON(`/v1.0/me/messages/${encodeURIComponent(payload.messageId)}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destinationId: payload.destinationId }),
      });
      if (response.status === 201) {
        const msg = response.body as Record<string, unknown>;
        return { ok: true as const, messageId: typeof msg.id === "string" ? msg.id : "" };
      }
      if (response.status === 429) {
        const rateLimit = parseGraphRateLimit(response.status, response.headers);
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "Graph rate limit exceeded.", retryAfterSeconds: rateLimit.limited ? rateLimit.retryAfterSeconds : undefined } };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Graph rejected the move request." } };
    },
  };
}

// ─── Delete Message ───────────────────────────────────────────────────────────

export type DeleteMessageInput = { messageId: string };

export function validateDeleteMessageInput(input: unknown): DeleteMessageInput {
  if (!isRecord(input)) throw new Error("delete message input must be an object");
  return { messageId: requireString(input.messageId, "messageId") };
}

export function createDeleteMessageClient(options: { accessToken: string; fetch?: typeof fetch; graphClient?: GraphClient }) {
  const client = options.graphClient ?? createGraphClient({ accessToken: options.accessToken, fetch: options.fetch, operation: "messages.delete" });

  return {
    async delete(input: unknown) {
      const payload = validateDeleteMessageInput(input);
      const response = await client.fetchJSON(`/v1.0/me/messages/${encodeURIComponent(payload.messageId)}`, {
        method: "DELETE",
      });
      if (response.status === 204) return { ok: true as const };
      if (response.status === 429) {
        const rateLimit = parseGraphRateLimit(response.status, response.headers);
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "Graph rate limit exceeded.", retryAfterSeconds: rateLimit.limited ? rateLimit.retryAfterSeconds : undefined } };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Graph rejected the delete request." } };
    },
  };
}

// ─── List Mail Folders ────────────────────────────────────────────────────────

export type MailFolder = {
  id: string;
  displayName: string;
  totalItemCount: number;
  unreadItemCount: number;
  isHidden?: boolean;
  [key: string]: unknown;
};

export function parseMailFoldersResponse(response: unknown): { folders: MailFolder[] } {
  if (!isRecord(response)) return { folders: [] };
  const value = response.value;
  if (!Array.isArray(value)) return { folders: [] };
  return {
    folders: value.filter(isRecord).map((f) => ({
      id: requireString(f.id, "id"),
      displayName: typeof f.displayName === "string" ? f.displayName : "",
      totalItemCount: typeof f.totalItemCount === "number" ? f.totalItemCount : 0,
      unreadItemCount: typeof f.unreadItemCount === "number" ? f.unreadItemCount : 0,
      isHidden: typeof f.isHidden === "boolean" ? f.isHidden : undefined,
    })),
  };
}

export function createMailFoldersClient(options: { accessToken: string; fetch?: typeof fetch; graphClient?: GraphClient }) {
  const client = options.graphClient ?? createGraphClient({ accessToken: options.accessToken, fetch: options.fetch, operation: "mailFolders.list" });

  return {
    async list(_input: unknown) {
      const response = await client.fetchJSON("/v1.0/me/mailFolders");
      if (response.status === 200) {
        const parsed = parseMailFoldersResponse(response.body);
        return { ok: true as const, folders: parsed.folders };
      }
      if (response.status === 429) {
        const rateLimit = parseGraphRateLimit(response.status, response.headers);
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "Graph rate limit exceeded.", retryAfterSeconds: rateLimit.limited ? rateLimit.retryAfterSeconds : undefined } };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Graph rejected the list mail folders request." } };
    },
  };
}


function parseNextOdataLink(response: Record<string, unknown>): string | null {
  const link = response["@odata.nextLink"];
  return typeof link === "string" && link.length > 0 ? link : null;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function requireRecipientAddress(value: unknown): string {
  const address = requireString(value, "to[].address");
  if (address.trim().length === 0) throw new Error("to[].address is required");
  return address;
}

function requireArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  return value;
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${field} must be an object`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
