export type NormalizedEmail = {
  id: string;
  provider: "smtp-email";
  providerEmailId: string;
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  textBody: string;
  htmlBody: string;
  replyTo: string;
  headers: Record<string, string>;
  sentAt: string;
  modelVersion: "2026-05-17";
  raw: Record<string, unknown>;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function prop(obj: Record<string, unknown>, key: string): string {
  const v = obj[key];
  return typeof v === "string" ? v : "";
}

function stringArray(obj: Record<string, unknown>, key: string): string[] {
  const v = obj[key];
  if (!Array.isArray(v)) return [];
  return v.filter((item): item is string => typeof item === "string");
}

function stringRecord(obj: Record<string, unknown>, key: string): Record<string, string> {
  const v = obj[key];
  if (!isRecord(v)) return {};
  const result: Record<string, string> = {};
  for (const [k, val] of Object.entries(v)) {
    if (typeof val === "string") result[k] = val;
  }
  return result;
}

export function normalizeEmail(e: Record<string, unknown>): NormalizedEmail {
  return {
    id: `smtp-email:${prop(e, "id")}`,
    provider: "smtp-email",
    providerEmailId: prop(e, "id"),
    from: prop(e, "from"),
    to: stringArray(e, "to"),
    cc: stringArray(e, "cc"),
    bcc: stringArray(e, "bcc"),
    subject: prop(e, "subject"),
    textBody: prop(e, "text_body"),
    htmlBody: prop(e, "html_body"),
    replyTo: prop(e, "reply_to"),
    headers: stringRecord(e, "headers"),
    sentAt: prop(e, "sent_at"),
    modelVersion: "2026-05-17",
    raw: e,
  };
}

export function parseEmailsResponse(response: unknown): { emails: NormalizedEmail[] } {
  if (!isRecord(response)) return { emails: [] };
  const emails = response.emails;
  if (!Array.isArray(emails)) return { emails: [] };
  return { emails: emails.filter(isRecord).map(normalizeEmail) };
}
