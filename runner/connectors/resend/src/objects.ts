import { isRecord, prop } from "./http";

export type NormalizedEmail = {
  id: string;
  object: string;
  from: string;
  to: string[];
  subject: string;
  createdAt: string;
  lastEvent: string;
  messageId: string;
  html: string | null;
  text: string | null;
  cc: string[];
  bcc: string[];
  replyTo: string[];
  scheduledAt: string | null;
  tags: Array<{ name: string; value: string }>;
  raw: Record<string, unknown>;
};

export type NormalizedDomain = {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  region: string;
  openTracking: boolean;
  clickTracking: boolean;
  capabilities: Record<string, unknown>;
  raw: Record<string, unknown>;
};

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((x): x is string => typeof x === "string");
  if (typeof value === "string" && value.length > 0) return [value];
  return [];
}

function asTags(value: unknown): Array<{ name: string; value: string }> {
  if (!Array.isArray(value)) return [];
  const out: Array<{ name: string; value: string }> = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const name = typeof item.name === "string" ? item.name : "";
    const tagValue = typeof item.value === "string" ? item.value : "";
    if (name) out.push({ name, value: tagValue });
  }
  return out;
}

export function normalizeEmail(raw: Record<string, unknown>): NormalizedEmail {
  return {
    id: prop(raw, "id"),
    object: prop(raw, "object", "email"),
    from: prop(raw, "from"),
    to: asStringArray(raw.to),
    subject: prop(raw, "subject"),
    createdAt: prop(raw, "created_at"),
    lastEvent: prop(raw, "last_event"),
    messageId: prop(raw, "message_id"),
    html: typeof raw.html === "string" ? raw.html : null,
    text: typeof raw.text === "string" ? raw.text : null,
    cc: asStringArray(raw.cc),
    bcc: asStringArray(raw.bcc),
    replyTo: asStringArray(raw.reply_to),
    scheduledAt: typeof raw.scheduled_at === "string" ? raw.scheduled_at : null,
    tags: asTags(raw.tags),
    raw,
  };
}

export function normalizeDomain(raw: Record<string, unknown>): NormalizedDomain {
  return {
    id: prop(raw, "id"),
    name: prop(raw, "name"),
    status: prop(raw, "status"),
    createdAt: prop(raw, "created_at"),
    region: prop(raw, "region"),
    openTracking: raw.open_tracking === true,
    clickTracking: raw.click_tracking === true,
    capabilities: isRecord(raw.capabilities) ? raw.capabilities : {},
    raw,
  };
}

export function parseEmailsListResponse(body: unknown): { emails: NormalizedEmail[]; hasMore: boolean } {
  if (!isRecord(body)) return { emails: [], hasMore: false };
  const data = Array.isArray(body.data) ? body.data.filter(isRecord).map(normalizeEmail) : [];
  return { emails: data, hasMore: body.has_more === true };
}

export function parseDomainsListResponse(body: unknown): { domains: NormalizedDomain[]; hasMore: boolean } {
  if (!isRecord(body)) return { domains: [], hasMore: false };
  const data = Array.isArray(body.data) ? body.data.filter(isRecord).map(normalizeDomain) : [];
  return { domains: data, hasMore: body.has_more === true };
}
