/**
 * Lever object normalization.
 *
 * jobs.list uses the public postings shape (array of postings).
 * Authenticated list ops use Lever's collection envelope: { data, next, hasNext }.
 */

export interface NormalizedJob {
  id: string;
  provider: string;
  title: string;
  location: string | null;
  team: string | null;
  commitment: string | null;
  description: string | null;
  url: string | null;
}

export interface NormalizedOpportunity {
  id: string;
  provider: string;
  name: string;
  headline: string | null;
  location: string | null;
  stageId: string | null;
  origin: string | null;
  ownerId: string | null;
  contactId: string | null;
  emails: string[];
  tags: string[];
  sources: string[];
  archived: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  urls: { list: string | null; show: string | null } | null;
}

export interface NormalizedStage {
  id: string;
  provider: string;
  name: string;
}

export interface NormalizedUser {
  id: string;
  provider: string;
  name: string;
  username: string | null;
  email: string | null;
  accessRole: string | null;
  photo: string | null;
  createdAt: string | null;
  deactivatedAt: string | null;
}

interface LeverCategories {
  location?: string | null;
  team?: string | null;
  commitment?: string | null;
}

interface LeverContent {
  description?: string | null;
}

interface LeverPosting {
  id: string;
  text?: string | null;
  categories?: LeverCategories | null;
  content?: LeverContent | null;
  hostedUrl?: string | null;
}

function asStringId(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && value.length > 0) return value;
  return null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && v.length > 0);
}

function msToIso(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return new Date(value).toISOString();
}

export function normalizeJob(posting: LeverPosting): NormalizedJob {
  const categories = posting.categories ?? {};
  const content = posting.content ?? {};

  return {
    id: `lev-job:${posting.id}`,
    provider: "lever",
    title: posting.text ?? "",
    location: categories.location ?? null,
    team: categories.team ?? null,
    commitment: categories.commitment ?? null,
    description: content.description ?? null,
    url: posting.hostedUrl ?? null,
  };
}

export function parseJobsResponse(raw: unknown): NormalizedJob[] {
  const data = raw as LeverPosting[];
  const postings = Array.isArray(data) ? data : [];
  return postings.map(normalizeJob);
}

interface LeverOpportunity {
  id: string;
  name?: string | null;
  headline?: string | null;
  location?: string | null;
  stage?: string | null;
  origin?: string | null;
  owner?: string | null;
  contact?: string | null;
  emails?: unknown;
  tags?: unknown;
  sources?: unknown;
  archived?: { archivedAt?: number; reason?: string } | null;
  createdAt?: number | null;
  updatedAt?: number | null;
  urls?: { list?: string | null; show?: string | null } | null;
}

export function normalizeOpportunity(opp: LeverOpportunity): NormalizedOpportunity {
  const id = asStringId(opp.id) ?? "";
  return {
    id: `lev-opportunity:${id}`,
    provider: "lever",
    name: opp.name ?? "",
    headline: opp.headline ?? null,
    location: opp.location ?? null,
    stageId: opp.stage ?? null,
    origin: opp.origin ?? null,
    ownerId: opp.owner ?? null,
    contactId: opp.contact ?? null,
    emails: asStringArray(opp.emails),
    tags: asStringArray(opp.tags),
    sources: asStringArray(opp.sources),
    archived: opp.archived != null,
    createdAt: msToIso(opp.createdAt),
    updatedAt: msToIso(opp.updatedAt),
    urls: opp.urls
      ? { list: opp.urls.list ?? null, show: opp.urls.show ?? null }
      : null,
  };
}

export function parseOpportunitiesResponse(raw: unknown): {
  opportunities: NormalizedOpportunity[];
  next: string | null;
  hasNext: boolean;
} {
  const data = raw as {
    data?: LeverOpportunity[];
    next?: string | null;
    hasNext?: boolean;
  };
  const items = Array.isArray(data.data) ? data.data : [];
  return {
    opportunities: items.map(normalizeOpportunity),
    next: typeof data.next === "string" ? data.next : null,
    hasNext: data.hasNext === true,
  };
}

interface LeverStage {
  id: string;
  text?: string | null;
}

export function normalizeStage(stage: LeverStage): NormalizedStage {
  const id = asStringId(stage.id) ?? "";
  return {
    id: `lev-stage:${id}`,
    provider: "lever",
    name: stage.text ?? "",
  };
}

export function parseStagesResponse(raw: unknown): {
  stages: NormalizedStage[];
  next: string | null;
  hasNext: boolean;
} {
  const data = raw as {
    data?: LeverStage[];
    next?: string | null;
    hasNext?: boolean;
  };
  const items = Array.isArray(data.data) ? data.data : [];
  return {
    stages: items.map(normalizeStage),
    next: typeof data.next === "string" ? data.next : null,
    hasNext: data.hasNext === true,
  };
}

interface LeverUser {
  id: string;
  name?: string | null;
  username?: string | null;
  email?: string | null;
  accessRole?: string | null;
  photo?: string | null;
  createdAt?: number | null;
  deactivatedAt?: number | null;
}

export function normalizeUser(user: LeverUser): NormalizedUser {
  const id = asStringId(user.id) ?? "";
  return {
    id: `lev-user:${id}`,
    provider: "lever",
    name: user.name ?? "",
    username: user.username ?? null,
    email: user.email ?? null,
    accessRole: user.accessRole ?? null,
    photo: user.photo ?? null,
    createdAt: msToIso(user.createdAt),
    deactivatedAt: msToIso(user.deactivatedAt),
  };
}

export function parseUsersResponse(raw: unknown): {
  users: NormalizedUser[];
  next: string | null;
  hasNext: boolean;
} {
  const data = raw as {
    data?: LeverUser[];
    next?: string | null;
    hasNext?: boolean;
  };
  const items = Array.isArray(data.data) ? data.data : [];
  return {
    users: items.map(normalizeUser),
    next: typeof data.next === "string" ? data.next : null,
    hasNext: data.hasNext === true,
  };
}
