import { createResendClient, parseResendRateLimit, isRecord } from "./http";
import { isSmtpConfigured, sendSmtpEmail } from "../../_shared/smtp";
import { normalizeEmail, parseEmailsListResponse } from "./objects";

// ─── Types ────────────────────────────────────────────────────────────────────

export type EmailSendInput = {
  from: string;
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
};

export type EmailGetInput = { id: string };
export type EmailListInput = { limit?: number; after?: string; before?: string };

// ─── Validate ─────────────────────────────────────────────────────────────────

export function validateEmailSendInput(input: unknown): EmailSendInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  return {
    from: requireString(input.from, "from"),
    to: requireRecipient(input.to, "to"),
    subject: requireString(input.subject, "subject"),
    html: typeof input.html === "string" ? input.html : undefined,
    text: typeof input.text === "string" ? input.text : undefined,
    replyTo: optionalRecipient(input.replyTo),
    cc: optionalRecipient(input.cc),
    bcc: optionalRecipient(input.bcc),
  };
}

export function validateEmailGetInput(input: unknown): EmailGetInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  return { id: requireString(input.id, "id") };
}

export function validateEmailListInput(input: unknown): EmailListInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  const limit = optionalLimit(input.limit);
  const after = optionalCursor(input.after, "after");
  const before = optionalCursor(input.before, "before");
  if (after && before) throw new Error("after and before cannot both be set");
  return { limit, after, before };
}

// ─── emails.send ──────────────────────────────────────────────────────────────

export function sendEmail(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isSmtpConfigured(input)) {
    return sendSmtpEmail(input as Record<string, unknown>).then((result) => ({
      connector: "resend",
      action: "emails.send",
      source: "smtp",
      ...result,
    }));
  }
  if (isRecord(input) && typeof input.apiKey === "string") {
    const payload = validateEmailSendInput(input);
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    const body: Record<string, unknown> = {
      from: payload.from,
      to: payload.to,
      subject: payload.subject,
    };
    if (payload.html !== undefined) body.html = payload.html;
    if (payload.text !== undefined) body.text = payload.text;
    if (payload.replyTo !== undefined) body.reply_to = payload.replyTo;
    if (payload.cc !== undefined) body.cc = payload.cc;
    if (payload.bcc !== undefined) body.bcc = payload.bcc;
    return createResendClient({ apiKey: input.apiKey, fetch: fetchFn, operation: "emails.send" })
      .fetchJSON("/emails", { method: "POST", body: JSON.stringify(body) })
      .then((result) => {
        if (result.status === 200 || result.status === 201) {
          const data = result.body as any;
          const id = isRecord(data) && typeof data.id === "string" ? data.id : "";
          return { connector: "resend", action: "emails.send", source: "provider", id };
        }
        const rl = parseResendRateLimit(result.status, result.headers);
        if (rl.limited) throw { ok: false, code: "CONNECTOR_RATE_LIMITED", message: "Resend rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds };
        throw { ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message: "Resend rejected the email send request." };
      });
  }
  return { connector: "resend", action: "emails.send", source: "connector", validated: validateEmailSendInput(input) };
}

// ─── emails.get ───────────────────────────────────────────────────────────────

export function getEmail(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    const payload = validateEmailGetInput(input);
    const fetchFn = typeof input.fetch === "function" ? (input.fetch as typeof fetch) : undefined;
    return createResendClient({ apiKey: input.apiKey, fetch: fetchFn, operation: "emails.get" })
      .fetchJSON(`/emails/${encodeURIComponent(payload.id)}`, { method: "GET" })
      .then((result) => {
        if (result.status >= 200 && result.status < 300 && isRecord(result.body)) {
          return {
            connector: "resend",
            action: "emails.get",
            source: "provider",
            email: normalizeEmail(result.body),
          };
        }
        failUpstream(result.status, result.headers, "Resend rejected the emails.get request.");
      });
  }
  return {
    connector: "resend",
    action: "emails.get",
    source: "connector",
    validated: validateEmailGetInput(input),
  };
}

// ─── emails.list ──────────────────────────────────────────────────────────────

export function listEmails(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    const payload = validateEmailListInput(input);
    const fetchFn = typeof input.fetch === "function" ? (input.fetch as typeof fetch) : undefined;
    return createResendClient({ apiKey: input.apiKey, fetch: fetchFn, operation: "emails.list" })
      .fetchJSON(`/emails${listQuery(payload)}`, { method: "GET" })
      .then((result) => {
        if (result.status >= 200 && result.status < 300) {
          const parsed = parseEmailsListResponse(result.body);
          return {
            connector: "resend",
            action: "emails.list",
            source: "provider",
            emails: parsed.emails,
            hasMore: parsed.hasMore,
          };
        }
        failUpstream(result.status, result.headers, "Resend rejected the emails.list request.");
      });
  }
  return {
    connector: "resend",
    action: "emails.list",
    source: "connector",
    validated: validateEmailListInput(input ?? {}),
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function requireString(v: unknown, f: string): string {
  if (typeof v !== "string" || !v.length) throw new Error(`${f} is required`);
  return v;
}
function requireRecipient(v: unknown, f: string): string | string[] {
  if (typeof v === "string" && v.length) return v;
  if (Array.isArray(v)) {
    const list = v.filter((x): x is string => typeof x === "string" && x.length > 0);
    if (list.length) return list;
  }
  throw new Error(`${f} is required`);
}
function optionalRecipient(v: unknown): string | string[] | undefined {
  if (typeof v === "string") return v.length ? v : undefined;
  if (Array.isArray(v)) {
    const list = v.filter((x): x is string => typeof x === "string");
    return list.length ? list : undefined;
  }
  return undefined;
}
function optionalLimit(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("limit must be a number");
  const n = Math.floor(value);
  if (n < 1 || n > 100) throw new Error("limit must be between 1 and 100");
  return n;
}
function optionalCursor(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} must be a non-empty string`);
  return value;
}
function listQuery(payload: EmailListInput): string {
  const params = new URLSearchParams();
  if (payload.limit !== undefined) params.set("limit", String(payload.limit));
  if (payload.after) params.set("after", payload.after);
  if (payload.before) params.set("before", payload.before);
  const q = params.toString();
  return q ? `?${q}` : "";
}
function failUpstream(status: number, headers: Record<string, string>, fallback: string): never {
  const rl = parseResendRateLimit(status, headers);
  if (rl.limited) {
    throw { ok: false, code: "CONNECTOR_RATE_LIMITED", message: "Resend rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds };
  }
  throw { ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message: fallback };
}
