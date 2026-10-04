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
  const getClient = createGoogleClient({ accessToken: options.accessToken, fetch: options.fetch, httpClient: options.httpClient, operation: "messages.get" });
  const modifyClient = createGoogleClient({ accessToken: options.accessToken, fetch: options.fetch, httpClient: options.httpClient, operation: "messages.modify" });
  const trashClient = createGoogleClient({ accessToken: options.accessToken, fetch: options.fetch, httpClient: options.httpClient, operation: "messages.trash" });
  const untrashClient = createGoogleClient({ accessToken: options.accessToken, fetch: options.fetch, httpClient: options.httpClient, operation: "messages.untrash" });
  const deleteClient = createGoogleClient({ accessToken: options.accessToken, fetch: options.fetch, httpClient: options.httpClient, operation: "messages.delete" });
  const attachmentClient = createGoogleClient({ accessToken: options.accessToken, fetch: options.fetch, httpClient: options.httpClient, operation: "messages.attachments.get" });
  const threadsListClient = createGoogleClient({ accessToken: options.accessToken, fetch: options.fetch, httpClient: options.httpClient, operation: "threads.list" });
  const threadsGetClient = createGoogleClient({ accessToken: options.accessToken, fetch: options.fetch, httpClient: options.httpClient, operation: "threads.get" });
  const draftClient = createGoogleClient({ accessToken: options.accessToken, fetch: options.fetch, httpClient: options.httpClient, operation: "drafts.create" });
  const draftSendClient = createGoogleClient({ accessToken: options.accessToken, fetch: options.fetch, httpClient: options.httpClient, operation: "drafts.send" });
  const draftDeleteClient = createGoogleClient({ accessToken: options.accessToken, fetch: options.fetch, httpClient: options.httpClient, operation: "drafts.delete" });
  const labelsClient = createGoogleClient({ accessToken: options.accessToken, fetch: options.fetch, httpClient: options.httpClient, operation: "labels.list" });
  const labelsCreateClient = createGoogleClient({ accessToken: options.accessToken, fetch: options.fetch, httpClient: options.httpClient, operation: "labels.create" });
  const labelsGetClient = createGoogleClient({ accessToken: options.accessToken, fetch: options.fetch, httpClient: options.httpClient, operation: "labels.get" });

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
      const response = await getClient.fetchText(
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
      const response = await modifyClient.fetchText(
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
      const response = await trashClient.fetchText(
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
      const response = await draftClient.fetchText(
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
      const response = await labelsClient.fetchText(
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

    async untrashMessage(input: unknown): Promise<TrashMessageResult> {
      const payload = validateUntrashMessageInput(input);
      const response = await untrashClient.fetchText(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(payload.messageId)}/untrash`,
        { method: "POST", headers: jsonHeaders, body: "{}" },
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

    async deleteMessage(input: unknown): Promise<DeleteMessageResult> {
      const payload = validateDeleteMessageInput(input);
      const response = await deleteClient.fetchText(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(payload.messageId)}`,
        { method: "DELETE", headers: authHeaders },
      );
      const rateLimit = parseGoogleRateLimitMetadata(response.status, response.headers);
      if (rateLimit.limited) {
        return { ok: false, error: { code: "CONNECTOR_RATE_LIMITED", message: "Gmail rate limit exceeded.", retryAfterSeconds: rateLimit.retryAfterSeconds } };
      }
      if (response.status === 204 || response.status === 200) {
        return { ok: true, deleted: true, messageId: payload.messageId };
      }
      const res = await handleGmailResponse(response);
      if (!res.ok) return { ok: false, error: res.error };
      return { ok: true, deleted: true, messageId: payload.messageId };
    },

    async getAttachment(input: unknown): Promise<GetAttachmentResult> {
      const payload = validateGetAttachmentInput(input);
      const response = await attachmentClient.fetchText(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(payload.messageId)}/attachments/${encodeURIComponent(payload.attachmentId)}`,
        { headers: authHeaders },
      );
      const res = await handleGmailResponse(response);
      if (!res.ok) return { ok: false, error: res.error };
      return {
        ok: true,
        size: typeof res.body.size === "number" ? res.body.size : 0,
        data: typeof res.body.data === "string" ? res.body.data : "",
      };
    },

    async listThreads(input: unknown): Promise<ListThreadsResult> {
      const payload = validateListThreadsInput(input);
      const params = new URLSearchParams();
      if (payload.q) params.set("q", payload.q);
      if (payload.maxResults !== undefined) params.set("maxResults", String(payload.maxResults));
      if (payload.pageToken) params.set("pageToken", payload.pageToken);
      for (const labelId of payload.labelIds ?? []) params.append("labelIds", labelId);
      const qs = params.toString() ? `?${params}` : "";
      const response = await threadsListClient.fetchText(
        `https://gmail.googleapis.com/gmail/v1/users/me/threads${qs}`,
        { headers: authHeaders },
      );
      const res = await handleGmailResponse(response);
      if (!res.ok) return { ok: false, error: res.error };
      const threads = Array.isArray(res.body.threads)
        ? res.body.threads.filter(isRecord).map((t) => ({
            id: typeof t.id === "string" ? t.id : "",
            snippet: typeof t.snippet === "string" ? t.snippet : undefined,
            historyId: typeof t.historyId === "string" ? t.historyId : undefined,
          }))
        : [];
      return {
        ok: true,
        threads,
        nextPageToken: typeof res.body.nextPageToken === "string" ? res.body.nextPageToken : undefined,
        resultSizeEstimate: typeof res.body.resultSizeEstimate === "number" ? res.body.resultSizeEstimate : undefined,
      };
    },

    async getThread(input: unknown): Promise<GetThreadResult> {
      const payload = validateGetThreadInput(input);
      const params = new URLSearchParams();
      if (payload.format) params.set("format", payload.format);
      const qs = params.toString() ? `?${params}` : "";
      const response = await threadsGetClient.fetchText(
        `https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(payload.threadId)}${qs}`,
        { headers: authHeaders },
      );
      const res = await handleGmailResponse(response);
      if (!res.ok) return { ok: false, error: res.error };
      const messages = Array.isArray(res.body.messages) ? res.body.messages.filter(isRecord) : [];
      return {
        ok: true,
        thread: {
          id: typeof res.body.id === "string" ? res.body.id : payload.threadId,
          historyId: typeof res.body.historyId === "string" ? res.body.historyId : undefined,
          messages,
        },
      };
    },

    async sendDraft(input: unknown): Promise<SendDraftResult> {
      const payload = validateSendDraftInput(input);
      const response = await draftSendClient.fetchText(
        "https://gmail.googleapis.com/gmail/v1/users/me/drafts/send",
        { method: "POST", headers: jsonHeaders, body: JSON.stringify({ id: payload.draftId }) },
      );
      const res = await handleGmailResponse(response);
      if (!res.ok) return { ok: false, error: res.error };
      return {
        ok: true,
        messageId: typeof res.body.id === "string" ? res.body.id : "",
        threadId: typeof res.body.threadId === "string" ? res.body.threadId : "",
      };
    },

    async deleteDraft(input: unknown): Promise<DeleteDraftResult> {
      const payload = validateDeleteDraftInput(input);
      const response = await draftDeleteClient.fetchText(
        `https://gmail.googleapis.com/gmail/v1/users/me/drafts/${encodeURIComponent(payload.draftId)}`,
        { method: "DELETE", headers: authHeaders },
      );
      const rateLimit = parseGoogleRateLimitMetadata(response.status, response.headers);
      if (rateLimit.limited) {
        return { ok: false, error: { code: "CONNECTOR_RATE_LIMITED", message: "Gmail rate limit exceeded.", retryAfterSeconds: rateLimit.retryAfterSeconds } };
      }
      if (response.status === 204 || response.status === 200) {
        return { ok: true, deleted: true, draftId: payload.draftId };
      }
      const res = await handleGmailResponse(response);
      if (!res.ok) return { ok: false, error: res.error };
      return { ok: true, deleted: true, draftId: payload.draftId };
    },

    async createLabel(input: unknown): Promise<CreateLabelResult> {
      const payload = validateCreateLabelInput(input);
      const body: Record<string, unknown> = { name: payload.name };
      if (payload.labelListVisibility) body.labelListVisibility = payload.labelListVisibility;
      if (payload.messageListVisibility) body.messageListVisibility = payload.messageListVisibility;
      const response = await labelsCreateClient.fetchText(
        "https://gmail.googleapis.com/gmail/v1/users/me/labels",
        { method: "POST", headers: jsonHeaders, body: JSON.stringify(body) },
      );
      const res = await handleGmailResponse(response);
      if (!res.ok) return { ok: false, error: res.error };
      return {
        ok: true,
        label: {
          id: typeof res.body.id === "string" ? res.body.id : "",
          name: typeof res.body.name === "string" ? res.body.name : payload.name,
          type: typeof res.body.type === "string" ? res.body.type : undefined,
        },
      };
    },

    async getLabel(input: unknown): Promise<GetLabelResult> {
      const payload = validateGetLabelInput(input);
      const response = await labelsGetClient.fetchText(
        `https://gmail.googleapis.com/gmail/v1/users/me/labels/${encodeURIComponent(payload.labelId)}`,
        { headers: authHeaders },
      );
      const res = await handleGmailResponse(response);
      if (!res.ok) return { ok: false, error: res.error };
      return {
        ok: true,
        label: {
          id: typeof res.body.id === "string" ? res.body.id : payload.labelId,
          name: typeof res.body.name === "string" ? res.body.name : "",
          type: typeof res.body.type === "string" ? res.body.type : undefined,
          messagesTotal: typeof res.body.messagesTotal === "number" ? res.body.messagesTotal : undefined,
          messagesUnread: typeof res.body.messagesUnread === "number" ? res.body.messagesUnread : undefined,
          threadsTotal: typeof res.body.threadsTotal === "number" ? res.body.threadsTotal : undefined,
          threadsUnread: typeof res.body.threadsUnread === "number" ? res.body.threadsUnread : undefined,
        },
      };
    },
  };
}

export type GmailClient = {
  send(input: unknown): Promise<SendMessageResult>;
  getMessage(input: unknown): Promise<GetMessageResult>;
  modifyMessage(input: unknown): Promise<ModifyMessageResult>;
  trashMessage(input: unknown): Promise<TrashMessageResult>;
  untrashMessage(input: unknown): Promise<TrashMessageResult>;
  deleteMessage(input: unknown): Promise<DeleteMessageResult>;
  getAttachment(input: unknown): Promise<GetAttachmentResult>;
  listThreads(input: unknown): Promise<ListThreadsResult>;
  getThread(input: unknown): Promise<GetThreadResult>;
  createDraft(input: unknown): Promise<CreateDraftResult>;
  sendDraft(input: unknown): Promise<SendDraftResult>;
  deleteDraft(input: unknown): Promise<DeleteDraftResult>;
  listLabels(): Promise<ListLabelsResult>;
  createLabel(input: unknown): Promise<CreateLabelResult>;
  getLabel(input: unknown): Promise<GetLabelResult>;
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

export type DeleteMessageResult =
  | { ok: true; deleted: boolean; messageId: string }
  | { ok: false; error: ConnectorError };

export function validateUntrashMessageInput(input: unknown): TrashMessageInput {
  if (!isRecord(input)) throw new Error("untrash message input must be an object");
  return { messageId: requireString(input.messageId, "messageId") };
}

export function validateDeleteMessageInput(input: unknown): TrashMessageInput {
  if (!isRecord(input)) throw new Error("delete message input must be an object");
  return { messageId: requireString(input.messageId, "messageId") };
}

export type GetAttachmentInput = { messageId: string; attachmentId: string };
export type GetAttachmentResult =
  | { ok: true; size: number; data: string }
  | { ok: false; error: ConnectorError };

export function validateGetAttachmentInput(input: unknown): GetAttachmentInput {
  if (!isRecord(input)) throw new Error("get attachment input must be an object");
  return {
    messageId: requireString(input.messageId, "messageId"),
    attachmentId: requireString(input.attachmentId, "attachmentId"),
  };
}

export type ListThreadsInput = { q?: string; maxResults?: number; pageToken?: string; labelIds?: string[] };
export type GmailThreadSummary = { id: string; snippet?: string; historyId?: string };
export type ListThreadsResult =
  | { ok: true; threads: GmailThreadSummary[]; nextPageToken?: string; resultSizeEstimate?: number }
  | { ok: false; error: ConnectorError };

export function validateListThreadsInput(input: unknown): ListThreadsInput {
  if (input === undefined || input === null) return {};
  if (!isRecord(input)) throw new Error("list threads input must be an object");
  return {
    q: typeof input.q === "string" ? input.q : undefined,
    maxResults: typeof input.maxResults === "number" ? input.maxResults : undefined,
    pageToken: typeof input.pageToken === "string" ? input.pageToken : undefined,
    labelIds: Array.isArray(input.labelIds) ? input.labelIds.filter((id): id is string => typeof id === "string") : undefined,
  };
}

export type GetThreadInput = { threadId: string; format?: string };
export type GetThreadResult =
  | { ok: true; thread: { id: string; historyId?: string; messages: Record<string, unknown>[] } }
  | { ok: false; error: ConnectorError };

export function validateGetThreadInput(input: unknown): GetThreadInput {
  if (!isRecord(input)) throw new Error("get thread input must be an object");
  return {
    threadId: requireString(input.threadId, "threadId"),
    format: typeof input.format === "string" ? input.format : undefined,
  };
}

export type SendDraftInput = { draftId: string };
export type SendDraftResult =
  | { ok: true; messageId: string; threadId: string }
  | { ok: false; error: ConnectorError };

export function validateSendDraftInput(input: unknown): SendDraftInput {
  if (!isRecord(input)) throw new Error("send draft input must be an object");
  return { draftId: requireString(input.draftId, "draftId") };
}

export type DeleteDraftInput = { draftId: string };
export type DeleteDraftResult =
  | { ok: true; deleted: boolean; draftId: string }
  | { ok: false; error: ConnectorError };

export function validateDeleteDraftInput(input: unknown): DeleteDraftInput {
  if (!isRecord(input)) throw new Error("delete draft input must be an object");
  return { draftId: requireString(input.draftId, "draftId") };
}

export type CreateLabelInput = { name: string; labelListVisibility?: string; messageListVisibility?: string };
export type CreateLabelResult =
  | { ok: true; label: GmailLabel }
  | { ok: false; error: ConnectorError };

export function validateCreateLabelInput(input: unknown): CreateLabelInput {
  if (!isRecord(input)) throw new Error("create label input must be an object");
  return {
    name: requireString(input.name, "name"),
    labelListVisibility: typeof input.labelListVisibility === "string" ? input.labelListVisibility : undefined,
    messageListVisibility: typeof input.messageListVisibility === "string" ? input.messageListVisibility : undefined,
  };
}

export type GetLabelInput = { labelId: string };
export type GetLabelResult =
  | { ok: true; label: GmailLabel & { messagesTotal?: number; messagesUnread?: number; threadsTotal?: number; threadsUnread?: number } }
  | { ok: false; error: ConnectorError };

export function validateGetLabelInput(input: unknown): GetLabelInput {
  if (!isRecord(input)) throw new Error("get label input must be an object");
  return { labelId: requireString(input.labelId, "labelId") };
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
    body: requireWellFormedUnicodeString(requireString(input.body, "body"), "body"),
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
  const body = requireWellFormedUnicodeString(requireString(input.body, "body"), "body");
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
  const transferEncoding = hasNonAsciiBytes(input.body)
    ? "Content-Transfer-Encoding: 8bit\r\n"
    : "";
  return `To: ${input.to}\r\n${formatMimeSubjectHeader(input.subject)}\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\n${transferEncoding}\r\n${input.body}`;
}

function base64UrlEncode(str: string): string {
  return base64EncodeBytes(new TextEncoder().encode(str)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function encodeMimeSubject(subject: string): string {
  if (/^[\x00-\x7F]*$/.test(subject)) return subject;

  const encoder = new TextEncoder();
  const encodedWords: string[] = [];
  let word = "";
  let byteLength = 0;

  for (const codePoint of subject) {
    const codePointBytes = encoder.encode(codePoint);
    if (word && encodedWordLength(byteLength + codePointBytes.length) > 75) {
      encodedWords.push(encodeMimeSubjectWord(word, encoder));
      word = "";
      byteLength = 0;
    }
    word += codePoint;
    byteLength += codePointBytes.length;
  }

  if (word) encodedWords.push(encodeMimeSubjectWord(word, encoder));
  return encodedWords.join("\r\n ");
}

function formatMimeSubjectHeader(subject: string): string {
  if (/^[\x00-\x7F]*$/.test(subject)) return `Subject: ${subject}`;

  const encodedSubject = encodeMimeSubject(subject);
  const firstWord = encodedSubject.split("\r\n ", 1)[0];
  if (firstWord.length + "Subject: ".length <= 76) {
    return `Subject: ${encodedSubject}`;
  }
  return `Subject:\r\n ${encodedSubject}`;
}

function encodedWordLength(byteLength: number): number {
  return 12 + 4 * Math.ceil(byteLength / 3);
}

function encodeMimeSubjectWord(word: string, encoder: TextEncoder): string {
  return `=?UTF-8?B?${base64EncodeBytes(encoder.encode(word))}?=`;
}

function hasNonAsciiBytes(value: string): boolean {
  return new TextEncoder().encode(value).some((byte) => byte > 0x7F);
}

function base64EncodeBytes(bytes: Uint8Array): string {
  const binaryChunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binaryChunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)));
  }
  return btoa(binaryChunks.join(""));
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
  return requireWellFormedUnicodeString(header, field);
}

function requireWellFormedUnicodeString(value: string, field: string): string {
  if (!isWellFormedUnicode(value)) {
    throw new Error(`${field} must contain well-formed Unicode`);
  }
  return value;
}

function isWellFormedUnicode(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xD800 && codeUnit <= 0xDBFF) {
      const nextCodeUnit = value.charCodeAt(index + 1);
      if (!(nextCodeUnit >= 0xDC00 && nextCodeUnit <= 0xDFFF)) {
        return false;
      }
      index += 1;
    } else if (codeUnit >= 0xDC00 && codeUnit <= 0xDFFF) {
      return false;
    }
  }
  return true;
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
