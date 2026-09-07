import { createBrevoClient, brevoErrorDetail, parseBrevoRateLimit, prop, isRecord, type BrevoClient } from "./http";

// ─── smtp.email.send ──────────────────────────────────────────────────────────

export type SendEmailInput = {
  to: { email: string; name?: string }[];
  // Optional: when omitted, the account's first verified sender is used so a
  // test send delivers without the caller owning/authenticating a domain.
  sender?: { email: string; name?: string };
  subject: string;
  htmlContent?: string;
  textContent?: string;
  replyTo?: { email: string; name?: string };
  cc?: { email: string; name?: string }[];
  bcc?: { email: string; name?: string }[];
};

export function validateSendEmailInput(input: unknown): SendEmailInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  const to = parseEmailArray(input.to, "to");
  if (to.length === 0) throw new Error("to must be a non-empty array");
  const sender = isRecord(input.sender) ? parseEmailAddress(input.sender, "sender") : undefined;
  return {
    to,
    sender,
    subject: requireString(input.subject, "subject"),
    htmlContent: typeof input.htmlContent === "string" ? input.htmlContent : undefined,
    textContent: typeof input.textContent === "string" ? input.textContent : undefined,
    replyTo: isRecord(input.replyTo) ? parseEmailAddress(input.replyTo, "replyTo") : undefined,
    cc: Array.isArray(input.cc) ? parseEmailArray(input.cc, "cc") : undefined,
    bcc: Array.isArray(input.bcc) ? parseEmailArray(input.bcc, "bcc") : undefined,
  };
}

// resolveDefaultSender returns the account's first verified sender. Brevo accepts
// a send from an unverified sender (returns a messageId) but then SILENTLY
// rejects delivery, so a test must use a real verified sender. Works for any
// account — no hardcoded/custom domain.
async function resolveDefaultSender(
  client: BrevoClient,
): Promise<{ ok: true; sender: { email: string; name?: string } } | { ok: false; error: { code: "CONNECTOR_UPSTREAM_ERROR"; message: string } }> {
  const result = await client.fetchJSON("/senders", { method: "GET" });
  if (result.status < 200 || result.status >= 300) {
    return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: brevoErrorDetail(result.body, "Could not load your verified Brevo senders.") } };
  }
  const senders = isRecord(result.body) && Array.isArray(result.body.senders) ? (result.body.senders as unknown[]) : [];
  const pick = senders.find((s) => isRecord(s) && s.active === true && typeof s.email === "string")
    ?? senders.find((s) => isRecord(s) && typeof s.email === "string");
  if (!isRecord(pick) || typeof pick.email !== "string") {
    return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "No verified sender found in your Brevo account. Add and verify a sender in Brevo (Senders, Domains & Dedicated IPs), then retry — or pass an explicit sender." } };
  }
  return { ok: true, sender: { email: pick.email, name: typeof pick.name === "string" ? pick.name : undefined } };
}

function parseEmailAddress(v: unknown, field: string): { email: string; name?: string } {
  if (!isRecord(v)) throw new Error(`${field} must be an object with email`);
  return {
    email: requireString(v.email, `${field}.email`),
    name: typeof v.name === "string" ? v.name : undefined,
  };
}

function parseEmailArray(v: unknown, field: string): { email: string; name?: string }[] {
  if (!Array.isArray(v)) throw new Error(`${field} must be an array`);
  return (v as unknown[]).filter(isRecord).map((item) => parseEmailAddress(item, field));
}

export type NormalizedSentEmail = {
  messageId: string;
  provider: "brevo";
  modelVersion: "2026-05-16";
  raw: Record<string, unknown>;
};

export function normalizeSentEmail(body: Record<string, unknown>): NormalizedSentEmail {
  return {
    messageId: prop(body, "messageId"),
    provider: "brevo",
    modelVersion: "2026-05-16",
    raw: body,
  };
}

export function createSmtpClient(options: { apiKey: string; fetch?: typeof fetch }) {
  const client = createBrevoClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "smtp.email.send" });

  return {
    async sendEmail(input: unknown) {
      const payload = validateSendEmailInput(input);
      let sender = payload.sender;
      if (!sender) {
        const resolved = await resolveDefaultSender(client);
        if (!resolved.ok) return resolved;
        sender = resolved.sender;
      }
      const body: Record<string, unknown> = {
        to: payload.to,
        sender,
        subject: payload.subject,
      };
      if (payload.htmlContent !== undefined) body.htmlContent = payload.htmlContent;
      if (payload.textContent !== undefined) body.textContent = payload.textContent;
      if (payload.replyTo !== undefined) body.replyTo = payload.replyTo;
      if (payload.cc !== undefined) body.cc = payload.cc;
      if (payload.bcc !== undefined) body.bcc = payload.bcc;

      const result = await client.fetchJSON("/smtp/email", { method: "POST", body: JSON.stringify(body) });
      if (result.status === 201 || result.status === 200) {
        return { ok: true as const, email: normalizeSentEmail(result.body as Record<string, unknown>) };
      }
      const rl = parseBrevoRateLimit(result.status, result.headers);
      if (rl.limited) return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED" as const, message: "Brevo rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: brevoErrorDetail(result.body, "Brevo rejected the send email request.") } };
    },
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function requireString(v: unknown, f: string): string {
  if (typeof v !== "string" || !v.length) throw new Error(`${f} is required`);
  return v;
}
