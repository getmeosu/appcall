import { createGoogleClient, parseGoogleError, parseGoogleRateLimitMetadata, parseNextPageToken, type ConnectorError } from "./http";
import type { ConnectorHttpClient } from "../../../bun/src/http";

export type GmailMessage = {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  historyId?: string;
  internalDate?: string;
  sizeEstimate?: number;
  payload?: unknown;
  [key: string]: unknown;
};

export type NormalizedMessage = {
  id: string;
  provider: "google-workspace";
  providerMessageId: string;
  threadId: string;
  senderId: string;
  subject: string;
  text: string;
  modelVersion: "2026-05-16";
  raw: GmailMessage;
};

export type SendMessageInput = {
  to: string;
  subject: string;
  body: string;
};

export type SendMessageResult =
  | { ok: true; message: { id: string; threadId: string } }
  | { ok: false; error: ConnectorError };

export function normalizeGmailMessage(message: GmailMessage): NormalizedMessage {
  const headers = extractHeaders(message);
  const senderHeader = headers["from"] ?? headers["sender"] ?? "";
  const senderId = extractEmailAddress(senderHeader);
  const subject = headers["subject"] ?? message.snippet ?? "";
  const text = message.snippet ?? "";

  return {
    id: `gmail:${message.id}`,
    provider: "google-workspace",
    providerMessageId: message.id,
    threadId: message.threadId,
    senderId,
    subject,
    text,
    modelVersion: "2026-05-16",
    raw: message,
  };
}

export function createGmailClient(options: { accessToken: string; fetch?: typeof fetch; httpClient?: ConnectorHttpClient }): GmailClient {
  const sendClient = createGoogleClient({ accessToken: options.accessToken, fetch: options.fetch, httpClient: options.httpClient, operation: "messages.send" });
  const gmailClient = createGoogleClient({ accessToken: options.accessToken, fetch: options.fetch, httpClient: options.httpClient, operation: "messages.get" });

  const authHeaders = { Authorization: `Bearer ${options.accessToken}` };
  const jsonHeaders = { ...authHeaders, "Content-Type": "application/json" };

  async function handleGmailResponse(response: { status: number; headers: Record<string, string>; body: string }): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; error: ConnectorError }> {
    const rateLimit = parseGoogleRateLimitMetadata(response.status, response.headers);
    if (rateLimit.limited) {
      return { ok: false, error: { code: "CONNECTOR_RATE_LIMITED", message: "Gmail rate limit exceeded.", retryAfterSeconds: rateLimit.retryAfterSeconds } };
    }
    const body = readJsonObject(response.body);
    if (response.status >= 400) {
      const parsed = parseGoogleError(body);
      return { ok: false, error: parsed ?? { code: "CONNECTOR_UPSTREAM_ERROR", message: "Gmail API error." } };
    }
    return { ok: true, body };
  }

  return {
    async send(input: unknown): Promise<SendMessageResult> {
      const payload = validateSendMessageInput(input);
      const raw = base64UrlEncode(buildMimeMessage(payload));
      const response = await sendClient.fetchText("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ raw }),
      });
      const res = await handleGmailResponse(response);
      if (!res.ok) return { ok: false, error: res.error };
      return {
        ok: true,
        message: {
          id: requireString(res.body.id, "id"),
          threadId: requireString(res.body.threadId, "threadId"),
        },
      };
    },

    async getMessage(input: unknown): Promise<GetMessageResult> {
      const payload = validateGetMessageInput(input);
      const params = new URLSearchParams();
      if (payload.format) params.set("format", payload.format);
      const qs = params.toString() ? `?${params}` : "";
      const response = await gmailClient.fetchText(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(payload.messageId)}${qs}`,
        { headers: authHeaders },
      );
      const res = await handleGmailResponse(response);
      if (!res.ok) return { ok: false, error: res.error };
      const b = res.body;
      return {
        ok: true,
        message: {
          id: requireString(b.id, "id"),
          threadId: requireString(b.threadId, "threadId"),
          labelIds: Array.isArray(b.labelIds) ? b.labelIds.filter((l): l is string => typeof l === "string") : undefined,
          snippet: typeof b.snippet === "string" ? b.snippet : undefined,
          historyId: typeof b.historyId === "string" ? b.historyId : undefined,
          internalDate: typeof b.internalDate === "string" ? b.internalDate : undefined,
          sizeEstimate: typeof b.sizeEstimate === "number" ? b.sizeEstimate : undefined,
          payload: b.payload,
        },
      };
    },

    async modifyMessage(input: unknown): Promise<ModifyMessageResult> {
      const payload = validateModifyMessageInput(input);
      const response = await gmailClient.fetchText(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(payload.messageId)}/modify`,
        {
          method: "POST",
          headers: jsonHeaders,
          body: JSON.stringify({
            addLabelIds: payload.addLabelIds ?? [],
            removeLabelIds: payload.removeLabelIds ?? [],
          }),
        },
      );
      const res = await handleGmailResponse(response);
      if (!res.ok) return { ok: false, error: res.error };
      const b = res.body;
      return {
        ok: true,
        message: {
          id: requireString(b.id, "id"),
          threadId: requireString(b.threadId, "threadId"),
          labelIds: Array.isArray(b.labelIds) ? b.labelIds.filter((l): l is string => typeof l === "string") : [],
        },
      };
    },

    async trashMessage(input: unknown): Promise<TrashMessageResult> {
      const payload = validateTrashMessageInput(input);
      const response = await gmailClient.fetchText(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(payload.messageId)}/trash`,
        {
          method: "POST",
          headers: jsonHeaders,
          body: "{}",
        },
      );
      const res = await handleGmailResponse(response);
      if (!res.ok) return { ok: false, error: res.error };
      const b = res.body;
      return {
        ok: true,
        message: {
          id: requireString(b.id, "id"),
          threadId: requireString(b.threadId, "threadId"),
          labelIds: Array.isArray(b.labelIds) ? b.labelIds.filter((l): l is string => typeof l === "string") : [],
        },
      };
    },

    async createDraft(input: unknown): Promise<CreateDraftResult> {
      const payload = validateCreateDraftInput(input);
      const raw = base64UrlEncode(buildMimeMessage(payload));
      const response = await gmailClient.fetchText(
        "https://gmail.googleapis.com/gmail/v1/users/me/drafts",
        {
          method: "POST",
          headers: jsonHeaders,
          body: JSON.stringify({ message: { raw } }),
        },
      );
      const res = await handleGmailResponse(response);
      if (!res.ok) return { ok: false, error: res.error };
      const b = res.body;
      const msg = isRecord(b.message) ? b.message : {};
      return {
        ok: true,
        draft: {
          draftId: requireString(b.id, "id"),
          messageId: typeof msg.id === "string" ? msg.id : "",
          threadId: typeof msg.threadId === "string" ? msg.threadId : "",
        },
      };
    },

    async listLabels(): Promise<ListLabelsResult> {
      const response = await gmailClient.fetchText(
        "https://gmail.googleapis.com/gmail/v1/users/me/labels",
        { headers: authHeaders },
      );
      const res = await handleGmailResponse(response);
      if (!res.ok) return { ok: false, error: res.error };
      const labels = Array.isArray(res.body.labels)
        ? res.body.labels.filter(isRecord).map((l) => ({
            id: typeof l.id === "string" ? l.id : "",
            name: typeof l.name === "string" ? l.name : "",
            type: typeof l.type === "string" ? l.type : undefined,
          }))
        : [];
      return { ok: true, labels };
    },
  };
}

export type GmailClient = {
  send(input: unknown): Promise<SendMessageResult>;
  getMessage(input: unknown): Promise<GetMessageResult>;
  modifyMessage(input: unknown): Promise<ModifyMessageResult>;
  trashMessage(input: unknown): Promise<TrashMessageResult>;
  createDraft(input: unknown): Promise<CreateDraftResult>;
  listLabels(): Promise<ListLabelsResult>;
};

// --- messages.get ---

export type GetMessageInput = {
  messageId: string;
  format?: string;
};

export type GetMessageResult =
  | { ok: true; message: GmailMessage }
  | { ok: false; error: ConnectorError };

export function validateGetMessageInput(input: unknown): GetMessageInput {
  if (!isRecord(input)) throw new Error("get message input must be an object");
  return {
    messageId: requireString(input.messageId, "messageId"),
    format: typeof input.format === "string" ? input.format : undefined,
  };
}

// --- messages.modify ---

export type ModifyMessageInput = {
  messageId: string;
  addLabelIds?: string[];
  removeLabelIds?: string[];
};

export type ModifyMessageResult =
  | { ok: true; message: { id: string; threadId: string; labelIds: string[] } }
  | { ok: false; error: ConnectorError };

export function validateModifyMessageInput(input: unknown): ModifyMessageInput {
  if (!isRecord(input)) throw new Error("modify message input must be an object");
  return {
    messageId: requireString(input.messageId, "messageId"),
    addLabelIds: Array.isArray(input.addLabelIds)
      ? input.addLabelIds.filter((l): l is string => typeof l === "string")
      : undefined,
    removeLabelIds: Array.isArray(input.removeLabelIds)
      ? input.removeLabelIds.filter((l): l is string => typeof l === "string")
      : undefined,
  };
}

// --- messages.trash ---

export type TrashMessageInput = {
  messageId: string;
};

export type TrashMessageResult =
  | { ok: true; message: { id: string; threadId: string; labelIds: string[] } }
  | { ok: false; error: ConnectorError };

export function validateTrashMessageInput(input: unknown): TrashMessageInput {
  if (!isRecord(input)) throw new Error("trash message input must be an object");
  return {
    messageId: requireString(input.messageId, "messageId"),
  };
}

// --- drafts.create ---

export type CreateDraftInput = {
  to: string;
  subject: string;
  body: string;
};

export type CreateDraftResult =
  | { ok: true; draft: { draftId: string; messageId: string; threadId: string } }
  | { ok: false; error: ConnectorError };

export function validateCreateDraftInput(input: unknown): CreateDraftInput {
  if (!isRecord(input)) throw new Error("create draft input must be an object");
  const to = requireHeaderString(input.to, "to").trim();
  if (to.length === 0) throw new Error("to is required");
  return {
    to,
    subject: requireHeaderString(input.subject, "subject"),
    body: requireString(input.body, "body"),
  };
}

// --- labels.list ---

export type GmailLabel = {
  id: string;
  name: string;
  type?: string;
};

export type ListLabelsResult =
  | { ok: true; labels: GmailLabel[] }
  | { ok: false; error: ConnectorError };

export function validateSendMessageInput(input: unknown): SendMessageInput {
  if (!isRecord(input)) {
    throw new Error("send message input must be an object");
  }
  const to = requireHeaderString(input.to, "to").trim();
  const subject = requireHeaderString(input.subject, "subject").trim();
  const body = requireString(input.body, "body");
  if (to.length === 0) {
    throw new Error("to is required");
  }
  if (subject.length === 0) {
    throw new Error("subject is required");
  }
  return { to, subject, body };
}

export function parseMessagesListResponse(response: unknown): { messages: GmailMessage[]; nextPageToken: string | null } {
  if (!isRecord(response)) {
    return { messages: [], nextPageToken: null };
  }
  const rawMessages = response.messages;
  if (!Array.isArray(rawMessages)) {
    return { messages: [], nextPageToken: parseNextPageToken(response) };
  }
  return {
    messages: rawMessages.filter(isRecord).map((msg) => ({
      id: requireString(msg.id, "id"),
      threadId: requireString(msg.threadId, "threadId"),
      labelIds: Array.isArray(msg.labelIds) ? msg.labelIds.filter((l): l is string => typeof l === "string") : undefined,
      snippet: typeof msg.snippet === "string" ? msg.snippet : undefined,
      ...(typeof msg.historyId === "string" ? { historyId: msg.historyId } : {}),
      ...(typeof msg.internalDate === "string" ? { internalDate: msg.internalDate } : {}),
      ...(typeof msg.sizeEstimate === "number" ? { sizeEstimate: msg.sizeEstimate } : {}),
    })),
    nextPageToken: parseNextPageToken(response),
  };
}

function extractHeaders(message: GmailMessage): Record<string, string> {
  const payload = message.payload;
  if (!isRecord(payload)) {
    return {};
  }
  const headers = payload.headers;
  if (!Array.isArray(headers)) {
    return {};
  }
  const result: Record<string, string> = {};
  for (const header of headers) {
    if (!isRecord(header)) continue;
    const name = typeof header.name === "string" ? header.name.toLowerCase() : "";
    const value = typeof header.value === "string" ? header.value : "";
    if (name) {
      result[name] = value;
    }
  }
  return result;
}

function extractEmailAddress(header: string): string {
  const match = header.match(/<([^>]+)>/);
  return match ? match[1] : header.trim();
}

function buildMimeMessage(input: SendMessageInput): string {
  return `To: ${input.to}\r\nSubject: ${input.subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${input.body}`;
}

function base64UrlEncode(str: string): string {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function readJsonObject(bodyText: string): Record<string, unknown> {
  try {
    return requireRecord(JSON.parse(bodyText), "response");
  } catch {
    return {};
  }
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${field} is required`);
  }
  return value;
}

function requireHeaderString(value: unknown, field: string): string {
  const header = requireString(value, field);
  if (/[\r\n]/.test(header)) {
    throw new Error(`${field} must not contain CR or LF`);
  }
  return header;
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`${field} is required`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
