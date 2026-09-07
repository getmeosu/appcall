import { createSendGridClient, parseSendGridRateLimit } from "./http";

// ─── Types ────────────────────────────────────────────────────────────────────

export type EmailAddress = { email: string; name?: string };

export type MailSendInput = {
  to: EmailAddress[];
  from: EmailAddress;
  subject: string;
  text?: string;
  html?: string;
  replyTo?: EmailAddress;
  templateId?: string;
  dynamicTemplateData?: Record<string, unknown>;
};

// ─── Validate ─────────────────────────────────────────────────────────────────

export function validateMailSendInput(input: unknown): MailSendInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  if (!Array.isArray(input.to) || input.to.length === 0) throw new Error("to must be a non-empty array");
  const to = (input.to as unknown[]).map((addr, i) => {
    if (!isRecord(addr)) throw new Error(`to[${i}] must be an object`);
    return { email: requireString(addr.email, `to[${i}].email`), name: typeof addr.name === "string" ? addr.name : undefined };
  });
  if (!isRecord(input.from)) throw new Error("from must be an object");
  const from: EmailAddress = { email: requireString(input.from.email, "from.email"), name: typeof input.from.name === "string" ? input.from.name : undefined };
  return {
    to,
    from,
    subject: requireString(input.subject, "subject"),
    text: typeof input.text === "string" ? input.text : undefined,
    html: typeof input.html === "string" ? input.html : undefined,
    replyTo: isRecord(input.replyTo) ? { email: requireString(input.replyTo.email, "replyTo.email"), name: typeof input.replyTo.name === "string" ? input.replyTo.name : undefined } : undefined,
    templateId: typeof input.templateId === "string" ? input.templateId : undefined,
    dynamicTemplateData: isRecord(input.dynamicTemplateData) ? input.dynamicTemplateData : undefined,
  };
}

// ─── Client ───────────────────────────────────────────────────────────────────

export function createMailClient(options: { apiKey: string; fetch?: typeof fetch }) {
  const client = createSendGridClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "mail.send" });

  return {
    async send(input: unknown) {
      const payload = validateMailSendInput(input);
      const body: Record<string, unknown> = {
        personalizations: [{ to: payload.to }],
        from: payload.from,
        subject: payload.subject,
      };
      if (payload.replyTo) body.reply_to = payload.replyTo;
      if (payload.text) body.content = [{ type: "text/plain", value: payload.text }];
      if (payload.html) {
        const existing = Array.isArray(body.content) ? (body.content as unknown[]) : [];
        body.content = [...existing, { type: "text/html", value: payload.html }];
      }
      if (payload.templateId) {
        body.template_id = payload.templateId;
        delete body.subject;
        if (payload.dynamicTemplateData) {
          (body.personalizations as Record<string, unknown>[])[0].dynamic_template_data = payload.dynamicTemplateData;
        }
      }
      const response = await client.fetchJSON("/mail/send", { method: "POST", body: JSON.stringify(body) });
      if (response.status === 202) {
        return { ok: true as const, messageId: response.headers["x-message-id"] ?? "" };
      }
      const rl = parseSendGridRateLimit(response.status, response.headers);
      if (rl.limited) return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED" as const, message: "SendGrid rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: "SendGrid rejected the mail send request." } };
    },
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function requireString(v: unknown, f: string): string {
  if (typeof v !== "string" || !v.length) throw new Error(`${f} is required`);
  return v;
}
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
