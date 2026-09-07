import { prop, propArr, isRecord } from "./http";

// ---------------------------------------------------------------------------
// NormalizedVisitor
// ---------------------------------------------------------------------------

export type NormalizedVisitorPage = {
  url: string;
  timestamp: string;
};

export type NormalizedVisitor = {
  id: string;
  provider: "rb2b";
  firstName: string;
  lastName: string;
  fullName: string;
  linkedinUrl: string;
  workEmail: string;
  personalEmail: string;
  company: string;
  title: string;
  location: string;
  visitedPages: NormalizedVisitorPage[];
  visitedAt: string;
  raw: Record<string, unknown>;
  modelVersion: "2026-05-17";
};

function normalizePages(raw: Record<string, unknown>): NormalizedVisitorPage[] {
  // Try `pages` first, then fall back to `all_time_page_views`
  const pagesArr = propArr(raw, "pages");
  if (pagesArr.length > 0) {
    return pagesArr.filter(isRecord).map((p) => ({
      url: prop(p, "url"),
      timestamp: prop(p, "timestamp"),
    }));
  }
  const allTimeArr = propArr(raw, "all_time_page_views");
  if (allTimeArr.length > 0) {
    return allTimeArr.filter(isRecord).map((p) => ({
      url: prop(p, "url"),
      timestamp: prop(p, "timestamp"),
    }));
  }
  return [];
}

function extractPersonalEmail(raw: Record<string, unknown>): string {
  // `personal_emails` is an array; take first element
  const personalEmails = propArr(raw, "personal_emails");
  for (const e of personalEmails) {
    if (typeof e === "string" && e.length > 0) return e;
  }
  // Also accept a scalar `personal_email` field for tolerance
  return prop(raw, "personal_email");
}

function deriveId(raw: Record<string, unknown>): string {
  // Prefer an explicit `id` field; else composite from linkedin/business_email
  const explicitId = prop(raw, "id");
  if (explicitId) return `rb2b-visitor:${explicitId}`;
  const linkedin = prop(raw, "linkedin_url");
  if (linkedin) return `rb2b-visitor:${linkedin.replace(/[^a-z0-9]/gi, "-")}`;
  const email = prop(raw, "business_email");
  if (email) return `rb2b-visitor:${email}`;
  return `rb2b-visitor:unknown`;
}

export function parseVisitorWebhook(payload: Record<string, unknown>): NormalizedVisitor {
  const firstName = prop(payload, "first_name");
  const lastName = prop(payload, "last_name");
  const fullName = [firstName, lastName].filter(Boolean).join(" ") || prop(payload, "full_name");
  const location = [prop(payload, "city"), prop(payload, "region")].filter(Boolean).join(", ");

  return {
    id: deriveId(payload),
    provider: "rb2b",
    firstName,
    lastName,
    fullName,
    linkedinUrl: prop(payload, "linkedin_url"),
    workEmail: prop(payload, "business_email"),
    personalEmail: extractPersonalEmail(payload),
    company: prop(payload, "company_name"),
    title: prop(payload, "job_title"),
    location,
    visitedPages: normalizePages(payload),
    visitedAt: prop(payload, "timestamp"),
    raw: payload,
    modelVersion: "2026-05-17",
  };
}

export function parseVisitorResponse(response: unknown): { visitor: NormalizedVisitor | null } {
  if (!isRecord(response)) return { visitor: null };
  return { visitor: parseVisitorWebhook(response) };
}
