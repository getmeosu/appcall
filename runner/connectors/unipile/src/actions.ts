import { createUnipileClient, classifyUnipileResponse, ConnectorErrorCode, isRecord } from "./http";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function handleError(status: number, headers: Record<string, string>, body: unknown, fallbackMessage: string): { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } } {
  const c = classifyUnipileResponse(status, headers, body);
  // A generic upstream error keeps the per-action fallback message, now APPENDED
  // with the upstream reason when Unipile gave one (so the cause is no longer
  // swallowed); the typed signals (rate-limit / account-restricted /
  // action-not-permitted) carry their own actionable message.
  const message =
    c.code === ConnectorErrorCode.UpstreamError
      ? c.message
        ? `${fallbackMessage} (${c.message})`
        : fallbackMessage
      : c.message;
  return { ok: false, error: { code: c.code, message, retryAfterSeconds: c.retryAfterSeconds } };
}

function throwIfError(result: { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } }): never {
  throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
}

function hasCredentials(input: unknown): input is Record<string, unknown> & { apiKey: string; dsn: string } {
  return isRecord(input) && typeof (input as Record<string, unknown>).apiKey === "string" && typeof (input as Record<string, unknown>).dsn === "string";
}

function getFetch(input: Record<string, unknown>): typeof fetch | undefined {
  return typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
}

function validationResult(action: string): Record<string, unknown> {
  return { connector: "unipile", action, source: "connector", validated: {} };
}

// ─── accounts.list ────────────────────────────────────────────────────────────

export type AccountsListInput = { apiKey: string; dsn: string };

export function validateAccountsListInput(input: unknown): AccountsListInput {
  if (!isRecord(input)) throw new Error("accounts.list input must be an object");
  return { apiKey: requireString(input.apiKey, "apiKey"), dsn: requireString(input.dsn, "dsn") };
}

export function createAccountsClient(options: { apiKey: string; dsn: string; fetch?: typeof fetch }) {
  const client = createUnipileClient({ apiKey: options.apiKey, baseUrl: options.dsn, fetch: options.fetch, operation: "accounts.list" });
  return {
    async list() {
      const response = await client.fetchJSON("/accounts");
      if (response.status === 200) {
        const body = response.body as Record<string, unknown>;
        const items = Array.isArray(body.items) ? body.items : (Array.isArray(body.accounts) ? body.accounts : []);
        const cursor = typeof body.cursor === "string" ? body.cursor : undefined;
        return { ok: true as const, accounts: items, cursor };
      }
      return handleError(response.status, response.headers, response.body, "Unipile rejected the accounts.list request.");
    },

    async get(accountId: string) {
      const getClient = createUnipileClient({ apiKey: options.apiKey, baseUrl: options.dsn, fetch: options.fetch, operation: "accounts.get" });
      const response = await getClient.fetchJSON(`/accounts/${accountId}`);
      if (response.status === 200) {
        return { ok: true as const, account: response.body };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Account not found." } };
      }
      return handleError(response.status, response.headers, response.body, "Unipile rejected the accounts.get request.");
    },
  };
}

export function listAccounts(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (hasCredentials(input)) {
    return createAccountsClient({ apiKey: input.apiKey, dsn: input.dsn, fetch: getFetch(input) }).list().then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "unipile", action: "accounts.list", source: "connector", accounts: result.accounts, cursor: result.cursor };
    });
  }
  return validationResult("accounts.list");
}

export type AccountsGetInput = { apiKey: string; dsn: string; accountId: string };

export function validateAccountsGetInput(input: unknown): AccountsGetInput {
  if (!isRecord(input)) throw new Error("accounts.get input must be an object");
  return { apiKey: requireString(input.apiKey, "apiKey"), dsn: requireString(input.dsn, "dsn"), accountId: requireString(input.accountId, "accountId") };
}

export function getAccount(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (hasCredentials(input)) {
    const accountId = requireString(input.accountId, "accountId");
    return createAccountsClient({ apiKey: input.apiKey, dsn: input.dsn, fetch: getFetch(input) }).get(accountId).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "unipile", action: "accounts.get", source: "connector", account: result.account };
    });
  }
  return { connector: "unipile", action: "accounts.get", source: "connector", validated: { accountId: isRecord(input) ? (input as Record<string, unknown>).accountId : undefined } };
}

// ─── chats.list ───────────────────────────────────────────────────────────────

export type ChatsListInput = { apiKey: string; dsn: string; account_id?: string; limit?: number; cursor?: string };

export function validateChatsListInput(input: unknown): ChatsListInput {
  if (!isRecord(input)) throw new Error("chats.list input must be an object");
  const base: ChatsListInput = { apiKey: requireString(input.apiKey, "apiKey"), dsn: requireString(input.dsn, "dsn") };
  if (typeof input.account_id === "string") base.account_id = input.account_id;
  if (typeof input.limit === "number") base.limit = input.limit;
  if (typeof input.cursor === "string") base.cursor = input.cursor;
  return base;
}

export function createChatsClient(options: { apiKey: string; dsn: string; fetch?: typeof fetch }) {
  return {
    async list(payload: ChatsListInput) {
      const client = createUnipileClient({ apiKey: options.apiKey, baseUrl: options.dsn, fetch: options.fetch, operation: "chats.list" });
      const params = new URLSearchParams();
      if (payload.account_id) params.set("account_id", payload.account_id);
      if (payload.limit !== undefined) params.set("limit", String(payload.limit));
      if (payload.cursor) params.set("cursor", payload.cursor);
      const query = params.toString();
      const response = await client.fetchJSON(`/chats${query ? `?${query}` : ""}`);
      if (response.status === 200) {
        const body = response.body as Record<string, unknown>;
        const items = Array.isArray(body.items) ? body.items : (Array.isArray(body.chats) ? body.chats : []);
        const cursor = typeof body.cursor === "string" ? body.cursor : undefined;
        return { ok: true as const, chats: items, cursor };
      }
      return handleError(response.status, response.headers, response.body, "Unipile rejected the chats.list request.");
    },

    async get(chatId: string) {
      const client = createUnipileClient({ apiKey: options.apiKey, baseUrl: options.dsn, fetch: options.fetch, operation: "chats.get" });
      const response = await client.fetchJSON(`/chats/${chatId}`);
      if (response.status === 200) {
        return { ok: true as const, chat: response.body };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Chat not found." } };
      }
      return handleError(response.status, response.headers, response.body, "Unipile rejected the chats.get request.");
    },
  };
}

export function listChats(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (hasCredentials(input)) {
    const payload = validateChatsListInput(input);
    return createChatsClient({ apiKey: input.apiKey, dsn: input.dsn, fetch: getFetch(input) }).list(payload).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "unipile", action: "chats.list", source: "connector", chats: result.chats, cursor: result.cursor };
    });
  }
  return { connector: "unipile", action: "chats.list", source: "connector", validated: { account_id: isRecord(input) ? (input as Record<string, unknown>).account_id : undefined } };
}

export type ChatsGetInput = { apiKey: string; dsn: string; chatId: string };

export function validateChatsGetInput(input: unknown): ChatsGetInput {
  if (!isRecord(input)) throw new Error("chats.get input must be an object");
  return { apiKey: requireString(input.apiKey, "apiKey"), dsn: requireString(input.dsn, "dsn"), chatId: requireString(input.chatId, "chatId") };
}

export function getChat(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (hasCredentials(input)) {
    const chatId = requireString(input.chatId, "chatId");
    return createChatsClient({ apiKey: input.apiKey, dsn: input.dsn, fetch: getFetch(input) }).get(chatId).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "unipile", action: "chats.get", source: "connector", chat: result.chat };
    });
  }
  return { connector: "unipile", action: "chats.get", source: "connector", validated: { chatId: isRecord(input) ? (input as Record<string, unknown>).chatId : undefined } };
}

// ─── messages.list ────────────────────────────────────────────────────────────

export type MessagesListInput = { apiKey: string; dsn: string; chatId: string; limit?: number; cursor?: string };

export function validateMessagesListInput(input: unknown): MessagesListInput {
  if (!isRecord(input)) throw new Error("messages.list input must be an object");
  const base: MessagesListInput = { apiKey: requireString(input.apiKey, "apiKey"), dsn: requireString(input.dsn, "dsn"), chatId: requireString(input.chatId, "chatId") };
  if (typeof input.limit === "number") base.limit = input.limit;
  if (typeof input.cursor === "string") base.cursor = input.cursor;
  return base;
}

export function createMessagesClient(options: { apiKey: string; dsn: string; fetch?: typeof fetch }) {
  return {
    async list(payload: MessagesListInput) {
      const client = createUnipileClient({ apiKey: options.apiKey, baseUrl: options.dsn, fetch: options.fetch, operation: "messages.list" });
      const params = new URLSearchParams();
      if (payload.limit !== undefined) params.set("limit", String(payload.limit));
      if (payload.cursor) params.set("cursor", payload.cursor);
      const query = params.toString();
      const response = await client.fetchJSON(`/chats/${payload.chatId}/messages${query ? `?${query}` : ""}`);
      if (response.status === 200) {
        const body = response.body as Record<string, unknown>;
        const items = Array.isArray(body.items) ? body.items : (Array.isArray(body.messages) ? body.messages : []);
        const cursor = typeof body.cursor === "string" ? body.cursor : undefined;
        return { ok: true as const, messages: items, cursor };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Chat not found." } };
      }
      return handleError(response.status, response.headers, response.body, "Unipile rejected the messages.list request.");
    },

    async send(chatId: string, text: string) {
      const client = createUnipileClient({ apiKey: options.apiKey, baseUrl: options.dsn, fetch: options.fetch, operation: "messages.send" });
      const response = await client.fetchJSON(`/chats/${chatId}/messages`, {
        method: "POST",
        body: JSON.stringify({ text }),
      });
      if (response.status === 200 || response.status === 201) {
        const body = response.body as Record<string, unknown>;
        return { ok: true as const, message: body };
      }
      return handleError(response.status, response.headers, response.body, "Unipile rejected the messages.send request.");
    },
  };
}

export function listMessages(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (hasCredentials(input)) {
    const payload = validateMessagesListInput(input);
    return createMessagesClient({ apiKey: input.apiKey, dsn: input.dsn, fetch: getFetch(input) }).list(payload).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "unipile", action: "messages.list", source: "connector", messages: result.messages, cursor: result.cursor };
    });
  }
  return { connector: "unipile", action: "messages.list", source: "connector", validated: { chatId: isRecord(input) ? (input as Record<string, unknown>).chatId : undefined } };
}

export type MessagesSendInput = { apiKey: string; dsn: string; chatId: string; text: string };

export function validateMessagesSendInput(input: unknown): MessagesSendInput {
  if (!isRecord(input)) throw new Error("messages.send input must be an object");
  return { apiKey: requireString(input.apiKey, "apiKey"), dsn: requireString(input.dsn, "dsn"), chatId: requireString(input.chatId, "chatId"), text: requireString(input.text, "text") };
}

export function sendMessage(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (hasCredentials(input)) {
    const payload = validateMessagesSendInput(input);
    return createMessagesClient({ apiKey: input.apiKey, dsn: input.dsn, fetch: getFetch(input) }).send(payload.chatId, payload.text).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "unipile", action: "messages.send", source: "connector", message: result.message };
    });
  }
  return { connector: "unipile", action: "messages.send", source: "connector", validated: { chatId: isRecord(input) ? (input as Record<string, unknown>).chatId : undefined, text: isRecord(input) ? (input as Record<string, unknown>).text : undefined } };
}

// ─── chats.start ──────────────────────────────────────────────────────────────

export type ChatsStartInput = { apiKey: string; dsn: string; account_id: string; attendees_ids: string[]; text?: string };

export function validateChatsStartInput(input: unknown): ChatsStartInput {
  if (!isRecord(input)) throw new Error("chats.start input must be an object");
  const apiKey = requireString(input.apiKey, "apiKey");
  const dsn = requireString(input.dsn, "dsn");
  const account_id = requireString(input.account_id, "account_id");
  if (!Array.isArray(input.attendees_ids) || input.attendees_ids.length === 0) throw new Error("attendees_ids must be a non-empty array");
  const attendees_ids = input.attendees_ids as string[];
  const text = typeof input.text === "string" ? input.text : undefined;
  return { apiKey, dsn, account_id, attendees_ids, text };
}

export function startChat(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (hasCredentials(input)) {
    const payload = validateChatsStartInput(input);
    const client = createUnipileClient({ apiKey: input.apiKey, baseUrl: input.dsn, fetch: getFetch(input), operation: "chats.start" });
    const body: Record<string, unknown> = { account_id: payload.account_id, attendees_ids: payload.attendees_ids };
    if (payload.text) body.text = payload.text;
    return client.fetchJSON("/chats", { method: "POST", body: JSON.stringify(body) }).then((response) => {
      if (response.status === 200 || response.status === 201) {
        return { connector: "unipile", action: "chats.start", source: "connector", chat: response.body };
      }
      const errResult = handleError(response.status, response.headers, response.body, "Unipile rejected the chats.start request.");
      throwIfError(errResult);
    });
  }
  return { connector: "unipile", action: "chats.start", source: "connector", validated: { account_id: isRecord(input) ? (input as Record<string, unknown>).account_id : undefined } };
}

// ─── emails.list ──────────────────────────────────────────────────────────────

export type EmailsListInput = { apiKey: string; dsn: string; account_id?: string; limit?: number; cursor?: string };

export function validateEmailsListInput(input: unknown): EmailsListInput {
  if (!isRecord(input)) throw new Error("emails.list input must be an object");
  const base: EmailsListInput = { apiKey: requireString(input.apiKey, "apiKey"), dsn: requireString(input.dsn, "dsn") };
  if (typeof input.account_id === "string") base.account_id = input.account_id;
  if (typeof input.limit === "number") base.limit = input.limit;
  if (typeof input.cursor === "string") base.cursor = input.cursor;
  return base;
}

export function createEmailsClient(options: { apiKey: string; dsn: string; fetch?: typeof fetch }) {
  return {
    async list(payload: EmailsListInput) {
      const client = createUnipileClient({ apiKey: options.apiKey, baseUrl: options.dsn, fetch: options.fetch, operation: "emails.list" });
      const params = new URLSearchParams();
      if (payload.account_id) params.set("account_id", payload.account_id);
      if (payload.limit !== undefined) params.set("limit", String(payload.limit));
      if (payload.cursor) params.set("cursor", payload.cursor);
      const query = params.toString();
      const response = await client.fetchJSON(`/emails${query ? `?${query}` : ""}`);
      if (response.status === 200) {
        const body = response.body as Record<string, unknown>;
        const items = Array.isArray(body.items) ? body.items : (Array.isArray(body.emails) ? body.emails : []);
        const cursor = typeof body.cursor === "string" ? body.cursor : undefined;
        return { ok: true as const, emails: items, cursor };
      }
      return handleError(response.status, response.headers, response.body, "Unipile rejected the emails.list request.");
    },

    async get(emailId: string) {
      const client = createUnipileClient({ apiKey: options.apiKey, baseUrl: options.dsn, fetch: options.fetch, operation: "emails.get" });
      const response = await client.fetchJSON(`/emails/${emailId}`);
      if (response.status === 200) {
        return { ok: true as const, email: response.body };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Email not found." } };
      }
      return handleError(response.status, response.headers, response.body, "Unipile rejected the emails.get request.");
    },

    async send(payload: { account_id: string; to: { identifier: string }[]; subject: string; body: string }) {
      const client = createUnipileClient({ apiKey: options.apiKey, baseUrl: options.dsn, fetch: options.fetch, operation: "emails.send" });
      const response = await client.fetchJSON("/emails", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (response.status === 200 || response.status === 201) {
        return { ok: true as const, email: response.body };
      }
      return handleError(response.status, response.headers, response.body, "Unipile rejected the emails.send request.");
    },
  };
}

export function listEmails(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (hasCredentials(input)) {
    const payload = validateEmailsListInput(input);
    return createEmailsClient({ apiKey: input.apiKey, dsn: input.dsn, fetch: getFetch(input) }).list(payload).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "unipile", action: "emails.list", source: "connector", emails: result.emails, cursor: result.cursor };
    });
  }
  return { connector: "unipile", action: "emails.list", source: "connector", validated: { account_id: isRecord(input) ? (input as Record<string, unknown>).account_id : undefined } };
}

export type EmailsGetInput = { apiKey: string; dsn: string; emailId: string };

export function validateEmailsGetInput(input: unknown): EmailsGetInput {
  if (!isRecord(input)) throw new Error("emails.get input must be an object");
  return { apiKey: requireString(input.apiKey, "apiKey"), dsn: requireString(input.dsn, "dsn"), emailId: requireString(input.emailId, "emailId") };
}

export function getEmail(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (hasCredentials(input)) {
    const emailId = requireString(input.emailId, "emailId");
    return createEmailsClient({ apiKey: input.apiKey, dsn: input.dsn, fetch: getFetch(input) }).get(emailId).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "unipile", action: "emails.get", source: "connector", email: result.email };
    });
  }
  return { connector: "unipile", action: "emails.get", source: "connector", validated: { emailId: isRecord(input) ? (input as Record<string, unknown>).emailId : undefined } };
}

export type EmailsSendInput = { apiKey: string; dsn: string; account_id: string; to: { identifier: string }[]; subject: string; body: string };

export function validateEmailsSendInput(input: unknown): EmailsSendInput {
  if (!isRecord(input)) throw new Error("emails.send input must be an object");
  const apiKey = requireString(input.apiKey, "apiKey");
  const dsn = requireString(input.dsn, "dsn");
  const account_id = requireString(input.account_id, "account_id");
  if (!Array.isArray(input.to) || input.to.length === 0) throw new Error("to must be a non-empty array");
  const to = input.to as { identifier: string }[];
  const subject = requireString(input.subject, "subject");
  const body = requireString(input.body, "body");
  return { apiKey, dsn, account_id, to, subject, body };
}

export function sendEmail(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (hasCredentials(input)) {
    const payload = validateEmailsSendInput(input);
    return createEmailsClient({ apiKey: input.apiKey, dsn: input.dsn, fetch: getFetch(input) }).send({ account_id: payload.account_id, to: payload.to, subject: payload.subject, body: payload.body }).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "unipile", action: "emails.send", source: "connector", email: result.email };
    });
  }
  return { connector: "unipile", action: "emails.send", source: "connector", validated: { account_id: isRecord(input) ? (input as Record<string, unknown>).account_id : undefined } };
}

// ─── linkedin.profile.get ─────────────────────────────────────────────────────

export type LinkedInProfileGetInput = { apiKey: string; dsn: string; identifier: string; account_id: string };

export function validateLinkedInProfileGetInput(input: unknown): LinkedInProfileGetInput {
  if (!isRecord(input)) throw new Error("linkedin.profile.get input must be an object");
  return {
    apiKey: requireString(input.apiKey, "apiKey"),
    dsn: requireString(input.dsn, "dsn"),
    identifier: requireString(input.identifier, "identifier"),
    account_id: requireString(input.account_id, "account_id"),
  };
}

export function getLinkedInProfile(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (hasCredentials(input)) {
    const identifier = requireString(input.identifier, "identifier");
    const account_id = requireString(input.account_id, "account_id");
    const client = createUnipileClient({ apiKey: input.apiKey, baseUrl: input.dsn, fetch: getFetch(input), operation: "linkedin.profile.get" });
    const params = new URLSearchParams({ account_id });
    return client.fetchJSON(`/users/${identifier}?${params.toString()}`).then((response) => {
      if (response.status === 200) {
        return { connector: "unipile", action: "linkedin.profile.get", source: "connector", profile: response.body };
      }
      if (response.status === 404) {
        throwIfError({ ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "LinkedIn profile not found." } });
      }
      const errResult = handleError(response.status, response.headers, response.body, "Unipile rejected the linkedin.profile.get request.");
      throwIfError(errResult);
    });
  }
  return { connector: "unipile", action: "linkedin.profile.get", source: "connector", validated: { identifier: isRecord(input) ? (input as Record<string, unknown>).identifier : undefined } };
}

// ─── linkedin.invitation.send ─────────────────────────────────────────────────

export type LinkedInInvitationSendInput = { apiKey: string; dsn: string; account_id: string; provider_id: string; message?: string };

// LinkedIn caps the personalized note on a connection request, and the cap is
// tier-dependent: 200 chars on FREE accounts, 300 on Premium. We must neither
// OVERDRAFT a free account (LinkedIn rejects the invite outright) nor
// UNDERDRAFT a premium one (rejecting its perfectly valid 201–300 note). A note
// at or under the free ceiling dispatches with no extra work; a 201–300 note
// triggers ONE live accounts.get to verify Premium; an unverifiable or free
// account fails closed with the stable NOTE_TOO_LONG code before dispatch.
export const LINKEDIN_NOTE_MAX_CHARS = 200;
export const LINKEDIN_NOTE_MAX_CHARS_PREMIUM = 300;

function noteTooLong(len: number, limit: number, detail: string): never {
  throw {
    ok: false as const,
    code: "NOTE_TOO_LONG",
    message: `Connection note is ${len} characters; ${detail} limit is ${limit}. Shorten the note and retry.`,
  };
}

// assertNoteWithinAbsoluteLimit enforces the PREMIUM (hard LinkedIn) ceiling —
// the most permissive bound that any account could ever satisfy. Used where the
// account tier is unknowable (validation mode) and as the cheap synchronous
// backstop before the tier probe. A missing note is a plain blank invitation.
function assertNoteWithinAbsoluteLimit(message: unknown): void {
  if (typeof message !== "string") return;
  if (message.length > LINKEDIN_NOTE_MAX_CHARS_PREMIUM) {
    noteTooLong(message.length, LINKEDIN_NOTE_MAX_CHARS_PREMIUM, "LinkedIn's maximum (Premium)");
  }
}

// isPremiumLinkedInAccount reads the Unipile account object's LinkedIn
// connection params; any premium marker (premiumId / premiumContractId /
// non-empty premiumFeatures) counts. Absent params → NOT premium (fail closed).
function isPremiumLinkedInAccount(account: unknown): boolean {
  if (!isRecord(account)) return false;
  const params = isRecord(account.connection_params) ? account.connection_params : undefined;
  const im = params && isRecord(params.im) ? params.im : undefined;
  if (!im) return false;
  if (im.premiumId != null || im.premiumContractId != null) return true;
  return Array.isArray(im.premiumFeatures) && im.premiumFeatures.length > 0;
}

export function validateLinkedInInvitationSendInput(input: unknown): LinkedInInvitationSendInput {
  if (!isRecord(input)) throw new Error("linkedin.invitation.send input must be an object");
  const result: LinkedInInvitationSendInput = {
    apiKey: requireString(input.apiKey, "apiKey"),
    dsn: requireString(input.dsn, "dsn"),
    account_id: requireString(input.account_id, "account_id"),
    provider_id: requireString(input.provider_id, "provider_id"),
  };
  if (typeof input.message === "string") {
    assertNoteWithinAbsoluteLimit(input.message);
    result.message = input.message;
  }
  return result;
}

export function sendLinkedInInvitation(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (hasCredentials(input)) {
    const account_id = requireString(input.account_id, "account_id");
    const provider_id = requireString(input.provider_id, "provider_id");
    const message = typeof input.message === "string" ? input.message : undefined;
    // Synchronous absolute ceiling first: nothing may ever exceed Premium's 300.
    assertNoteWithinAbsoluteLimit(message);
    const fetchImpl = getFetch(input);
    const client = createUnipileClient({ apiKey: input.apiKey, baseUrl: input.dsn, fetch: fetchImpl, operation: "linkedin.invitation.send" });
    const body: Record<string, unknown> = { account_id, provider_id };
    if (message !== undefined) body.message = message;
    return (async () => {
      if (message !== undefined && message.length > LINKEDIN_NOTE_MAX_CHARS) {
        // 201–300 chars: only a Premium account may send this. Verify live and
        // fail closed — an over-limit dispatch would be rejected by LinkedIn
        // anyway, and an unverifiable tier must never default to the risky path.
        const accounts = createAccountsClient({ apiKey: input.apiKey, dsn: input.dsn, fetch: fetchImpl });
        let premium = false;
        try {
          const got = await accounts.get(account_id);
          premium = got.ok === true && isPremiumLinkedInAccount(got.account);
        } catch {
          premium = false;
        }
        if (!premium) {
          noteTooLong(message.length, LINKEDIN_NOTE_MAX_CHARS, "LinkedIn's free-tier (Premium status not verified)");
        }
      }
      const response = await client.fetchJSON("/users/invite", { method: "POST", body: JSON.stringify(body) });
      if (response.status === 200 || response.status === 201) {
        return { connector: "unipile", action: "linkedin.invitation.send", source: "connector", invitation: response.body };
      }
      const errResult = handleError(response.status, response.headers, response.body, "Unipile rejected the linkedin.invitation.send request.");
      throwIfError(errResult);
    })();
  }
  return { connector: "unipile", action: "linkedin.invitation.send", source: "connector", validated: { provider_id: isRecord(input) ? (input as Record<string, unknown>).provider_id : undefined } };
}

// ─── linkedin.relations.list ──────────────────────────────────────────────────

export type LinkedInRelationsListInput = { apiKey: string; dsn: string; account_id: string; limit?: number; cursor?: string };

export function validateLinkedInRelationsListInput(input: unknown): LinkedInRelationsListInput {
  if (!isRecord(input)) throw new Error("linkedin.relations.list input must be an object");
  const base: LinkedInRelationsListInput = {
    apiKey: requireString(input.apiKey, "apiKey"),
    dsn: requireString(input.dsn, "dsn"),
    account_id: requireString(input.account_id, "account_id"),
  };
  if (typeof input.limit === "number") base.limit = input.limit;
  if (typeof input.cursor === "string") base.cursor = input.cursor;
  return base;
}

export function listLinkedInRelations(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (hasCredentials(input)) {
    const account_id = requireString(input.account_id, "account_id");
    const client = createUnipileClient({ apiKey: input.apiKey, baseUrl: input.dsn, fetch: getFetch(input), operation: "linkedin.relations.list" });
    const params = new URLSearchParams({ account_id });
    if (typeof input.limit === "number") params.set("limit", String(input.limit));
    if (typeof input.cursor === "string") params.set("cursor", input.cursor);
    return client.fetchJSON(`/users/relations?${params.toString()}`).then((response) => {
      if (response.status === 200) {
        const body = response.body as Record<string, unknown>;
        const items = Array.isArray(body.items) ? body.items : (Array.isArray(body.relations) ? body.relations : []);
        const cursor = typeof body.cursor === "string" ? body.cursor : undefined;
        return { connector: "unipile", action: "linkedin.relations.list", source: "connector", relations: items, cursor };
      }
      const errResult = handleError(response.status, response.headers, response.body, "Unipile rejected the linkedin.relations.list request.");
      throwIfError(errResult);
    });
  }
  return { connector: "unipile", action: "linkedin.relations.list", source: "connector", validated: { account_id: isRecord(input) ? (input as Record<string, unknown>).account_id : undefined } };
}
