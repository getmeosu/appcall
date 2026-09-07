import { createResendClient, parseResendRateLimit, isRecord } from "./http";
import { isSmtpConfigured, sendSmtpEmail } from "../../_shared/smtp";

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

// ─── emails.send ────────────────────────────────────────────────────────────────

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
