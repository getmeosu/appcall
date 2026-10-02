/**
 * Intercom object normalization.
 *
 * List envelopes follow Intercom REST v2.13:
 * - admins.list   → { type: "admin.list", admins: [...] }
 * - contacts.list → { type: "list", data: [...], total_count, pages }
 * - companies.list → { type: "list", data: [...], total_count, pages } (POST /companies/list)
 * - conversations.list → { type: "conversation.list", conversations: [...], total_count, pages }
 * - conversations.get / reply / search → Conversation or conversation.list
 * - contacts.get → bare Contact object at the top level
 */

export interface NormalizedAdministrator {
  id: string;
  provider: string;
  name: string;
  email: string | null;
  jobTitle: string | null;
  awayModeEnabled: boolean;
  hasInboxSeat: boolean;
  teamIds: string[];
}

export interface NormalizedContact {
  id: string;
  provider: string;
  role: string | null;
  email: string | null;
  name: string;
  phone: string | null;
  externalId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface NormalizedCompany {
  id: string;
  provider: string;
  name: string;
  companyId: string | null;
  plan: string | null;
  monthlySpend: number | null;
  size: number | null;
  website: string | null;
  industry: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface NormalizedConversation {
  id: string;
  provider: string;
  title: string | null;
  state: string | null;
  open: boolean;
  read: boolean;
  priority: string | null;
  adminAssigneeId: string | null;
  teamAssigneeId: string | null;
  contactIds: string[];
  sourceType: string | null;
  sourceSubject: string | null;
  sourceBody: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  waitingSince: string | null;
  snoozedUntil: string | null;
  partCount: number | null;
  tagIds: string[];
}

function asStringId(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && value.length > 0) return value;
  return null;
}

function asIso(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  return null;
}

/** Intercom timestamps are unix seconds; accept ISO strings too. */
function asIsoTimestamp(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return new Date(value * 1000).toISOString();
  }
  if (typeof value === "string" && value.length > 0) {
    const asNum = Number(value);
    if (Number.isFinite(asNum) && asNum > 1_000_000_000 && !value.includes("-")) {
      return new Date(asNum * 1000).toISOString();
    }
    return value;
  }
  return null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => asStringId(v))
    .filter((v): v is string => typeof v === "string" && v.length > 0);
}

interface IntercomPages {
  type?: string;
  page?: number;
  per_page?: number;
  total_pages?: number;
  next?: { starting_after?: string; per_page?: number } | null;
}

function parsePages(pages: unknown): {
  nextStartingAfter: string | null;
  page: number | null;
  perPage: number | null;
  totalPages: number | null;
} {
  if (pages == null || typeof pages !== "object") {
    return { nextStartingAfter: null, page: null, perPage: null, totalPages: null };
  }
  const p = pages as IntercomPages;
  const next = p.next && typeof p.next === "object" ? p.next : null;
  return {
    nextStartingAfter:
      typeof next?.starting_after === "string" && next.starting_after.length > 0
        ? next.starting_after
        : null,
    page: typeof p.page === "number" ? p.page : null,
    perPage: typeof p.per_page === "number" ? p.per_page : null,
    totalPages: typeof p.total_pages === "number" ? p.total_pages : null,
  };
}

// ---------------------------------------------------------------------------
// Administrators
// ---------------------------------------------------------------------------

interface IntercomAdmin {
  type?: string;
  id?: string | number | null;
  name?: string | null;
  email?: string | null;
  job_title?: string | null;
  away_mode_enabled?: boolean | null;
  has_inbox_seat?: boolean | null;
  team_ids?: unknown;
}

export function normalizeAdministrator(admin: IntercomAdmin): NormalizedAdministrator {
  const id = asStringId(admin.id) ?? "";
  return {
    id: `intercom-admin:${id}`,
    provider: "intercom",
    name: admin.name ?? "",
    email: admin.email ?? null,
    jobTitle: admin.job_title ?? null,
    awayModeEnabled: admin.away_mode_enabled === true,
    hasInboxSeat: admin.has_inbox_seat !== false,
    teamIds: asStringArray(admin.team_ids),
  };
}

interface IntercomAdminsResponse {
  type?: string;
  admins?: IntercomAdmin[];
}

export function parseAdminsResponse(raw: unknown): {
  admins: NormalizedAdministrator[];
} {
  const data = (raw ?? {}) as IntercomAdminsResponse;
  const items = Array.isArray(data.admins) ? data.admins : [];
  return { admins: items.map(normalizeAdministrator) };
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

interface IntercomContact {
  type?: string;
  id?: string | number | null;
  role?: string | null;
  email?: string | null;
  name?: string | null;
  phone?: string | null;
  external_id?: string | null;
  created_at?: number | string | null;
  updated_at?: number | string | null;
}

export function normalizeContact(contact: IntercomContact): NormalizedContact {
  const id = asStringId(contact.id) ?? "";
  return {
    id: `intercom-contact:${id}`,
    provider: "intercom",
    role: contact.role ?? null,
    email: contact.email ?? null,
    name: contact.name ?? "",
    phone: contact.phone ?? null,
    externalId: contact.external_id ?? null,
    createdAt: asIsoTimestamp(contact.created_at),
    updatedAt: asIsoTimestamp(contact.updated_at),
  };
}

interface IntercomListEnvelope {
  type?: string;
  data?: unknown[];
  total_count?: number;
  pages?: IntercomPages;
}

export function parseContactsResponse(raw: unknown): {
  contacts: NormalizedContact[];
  total: number | null;
  nextStartingAfter: string | null;
} {
  const data = (raw ?? {}) as IntercomListEnvelope;
  const items = Array.isArray(data.data) ? (data.data as IntercomContact[]) : [];
  const pages = parsePages(data.pages);
  return {
    contacts: items.map(normalizeContact),
    total: typeof data.total_count === "number" ? data.total_count : null,
    nextStartingAfter: pages.nextStartingAfter,
  };
}

// ---------------------------------------------------------------------------
// Companies
// ---------------------------------------------------------------------------

interface IntercomCompany {
  type?: string;
  id?: string | number | null;
  name?: string | null;
  company_id?: string | null;
  plan?: { type?: string; id?: string; name?: string } | string | null;
  monthly_spend?: number | null;
  size?: number | null;
  website?: string | null;
  industry?: string | null;
  created_at?: number | string | null;
  updated_at?: number | string | null;
}

function planName(plan: IntercomCompany["plan"]): string | null {
  if (plan == null) return null;
  if (typeof plan === "string") return plan.length > 0 ? plan : null;
  if (typeof plan === "object" && typeof plan.name === "string") return plan.name;
  return null;
}

export function normalizeCompany(company: IntercomCompany): NormalizedCompany {
  const id = asStringId(company.id) ?? "";
  return {
    id: `intercom-company:${id}`,
    provider: "intercom",
    name: company.name ?? "",
    companyId: company.company_id ?? null,
    plan: planName(company.plan),
    monthlySpend: typeof company.monthly_spend === "number" ? company.monthly_spend : null,
    size: typeof company.size === "number" ? company.size : null,
    website: company.website ?? null,
    industry: company.industry ?? null,
    createdAt: asIsoTimestamp(company.created_at),
    updatedAt: asIsoTimestamp(company.updated_at),
  };
}


export function parseContactGetResponse(raw: unknown): {
  contact: NormalizedContact | null;
} {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return { contact: null };
  }
  const contact = raw as IntercomContact;
  if (asStringId(contact.id) == null) return { contact: null };
  return { contact: normalizeContact(contact) };
}

export function parseCompaniesResponse(raw: unknown): {
  companies: NormalizedCompany[];
  total: number | null;
  nextStartingAfter: string | null;
} {
  const data = (raw ?? {}) as IntercomListEnvelope;
  const items = Array.isArray(data.data) ? (data.data as IntercomCompany[]) : [];
  const pages = parsePages(data.pages);
  return {
    companies: items.map(normalizeCompany),
    total: typeof data.total_count === "number" ? data.total_count : null,
    nextStartingAfter: pages.nextStartingAfter,
  };
}

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

interface IntercomSource {
  type?: string | null;
  subject?: string | null;
  body?: string | null;
  delivered_as?: string | null;
}

interface IntercomConversationContacts {
  type?: string;
  contacts?: Array<{ type?: string; id?: string | number | null }>;
}

interface IntercomConversationParts {
  type?: string;
  total_count?: number;
  conversation_parts?: unknown[];
}

interface IntercomConversation {
  type?: string;
  id?: string | number | null;
  title?: string | null;
  created_at?: number | string | null;
  updated_at?: number | string | null;
  waiting_since?: number | string | null;
  snoozed_until?: number | string | null;
  open?: boolean | null;
  state?: string | null;
  read?: boolean | null;
  priority?: string | null;
  admin_assignee_id?: number | string | null;
  team_assignee_id?: number | string | null;
  source?: IntercomSource | null;
  contacts?: IntercomConversationContacts | null;
  conversation_parts?: IntercomConversationParts | null;
  tags?: {
    type?: string;
    tags?: Array<{ type?: string; id?: string | number | null; name?: string | null }>;
  } | null;
}

function contactIdsFrom(contacts: IntercomConversationContacts | null | undefined): string[] {
  if (!contacts || !Array.isArray(contacts.contacts)) return [];
  return contacts.contacts
    .map((c) => asStringId(c?.id))
    .filter((v): v is string => v != null);
}


function tagIdsFrom(
  tags:
    | {
        type?: string;
        tags?: Array<{ type?: string; id?: string | number | null; name?: string | null }>;
      }
    | null
    | undefined,
): string[] {
  if (!tags || !Array.isArray(tags.tags)) return [];
  return tags.tags
    .map((t) => {
      const id = t?.id;
      if (typeof id === "number" && Number.isFinite(id)) return String(id);
      if (typeof id === "string" && id.length > 0) return id;
      return null;
    })
    .filter((v): v is string => v != null);
}

export function normalizeConversation(conversation: IntercomConversation): NormalizedConversation {
  const id = asStringId(conversation.id) ?? "";
  const parts = conversation.conversation_parts;
  const partCount =
    typeof parts?.total_count === "number"
      ? parts.total_count
      : Array.isArray(parts?.conversation_parts)
        ? parts!.conversation_parts!.length
        : null;
  return {
    id: `intercom-conversation:${id}`,
    provider: "intercom",
    title: conversation.title ?? null,
    state: conversation.state ?? null,
    open: conversation.open !== false,
    read: conversation.read === true,
    priority: conversation.priority ?? null,
    adminAssigneeId: asStringId(conversation.admin_assignee_id ?? null),
    teamAssigneeId: asStringId(conversation.team_assignee_id ?? null),
    contactIds: contactIdsFrom(conversation.contacts),
    sourceType: conversation.source?.type ?? null,
    sourceSubject: asIso(conversation.source?.subject ?? null),
    sourceBody: asIso(conversation.source?.body ?? null),
    createdAt: asIsoTimestamp(conversation.created_at),
    updatedAt: asIsoTimestamp(conversation.updated_at),
    waitingSince: asIsoTimestamp(conversation.waiting_since),
    snoozedUntil: asIsoTimestamp(conversation.snoozed_until),
    partCount,
    tagIds: tagIdsFrom(conversation.tags),
  };
}

interface IntercomConversationsListResponse {
  type?: string;
  conversations?: IntercomConversation[];
  total_count?: number;
  pages?: IntercomPages;
}

export function parseConversationsResponse(raw: unknown): {
  conversations: NormalizedConversation[];
  total: number | null;
  nextStartingAfter: string | null;
} {
  const data = (raw ?? {}) as IntercomConversationsListResponse;
  const items = Array.isArray(data.conversations) ? data.conversations : [];
  const pages = parsePages(data.pages);
  return {
    conversations: items.map(normalizeConversation),
    total: typeof data.total_count === "number" ? data.total_count : null,
    nextStartingAfter: pages.nextStartingAfter,
  };
}

export function parseConversationGetResponse(raw: unknown): {
  conversation: NormalizedConversation | null;
} {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return { conversation: null };
  }
  const conversation = raw as IntercomConversation;
  if (asStringId(conversation.id) == null) {
    return { conversation: null };
  }
  return { conversation: normalizeConversation(conversation) };
}

/** Reply returns the updated Conversation object (same shape as get). */
export function parseConversationReplyResponse(raw: unknown): {
  conversation: NormalizedConversation | null;
} {
  return parseConversationGetResponse(raw);
}
