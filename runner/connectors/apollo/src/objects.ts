import { prop, propNum, isRecord } from "./http";

// ---------------------------------------------------------------------------
// NormalizedPerson
// ---------------------------------------------------------------------------

export type NormalizedPerson = {
  id: string;
  provider: "apollo";
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  title: string;
  seniority: string;
  organizationName: string;
  organizationId: string;
  linkedinUrl: string;
  city: string;
  state: string;
  country: string;
  photoUrl: string;
  modelVersion: "2026-05-17";
  raw: Record<string, unknown>;
};

export function normalizePerson(p: Record<string, unknown>): NormalizedPerson {
  return {
    id: `apl-person:${prop(p, "id")}`,
    provider: "apollo",
    firstName: prop(p, "first_name"),
    lastName: prop(p, "last_name"),
    name: prop(p, "name"),
    email: prop(p, "email"),
    title: prop(p, "title"),
    seniority: prop(p, "seniority"),
    organizationName: prop(p, "organization_name") || (isRecord(p.organization) ? prop(p.organization as Record<string, unknown>, "name") : ""),
    organizationId: prop(p, "organization_id") || (isRecord(p.organization) ? prop(p.organization as Record<string, unknown>, "id") : ""),
    linkedinUrl: prop(p, "linkedin_url"),
    city: prop(p, "city"),
    state: prop(p, "state"),
    country: prop(p, "country"),
    photoUrl: prop(p, "photo_url"),
    modelVersion: "2026-05-17",
    raw: p,
  };
}

export type ApolloPagination = { page: number; perPage: number; totalEntries: number; totalPages: number };

export function parsePagination(b: Record<string, unknown>): ApolloPagination {
  return {
    page: propNum(b, "page"),
    perPage: propNum(b, "per_page"),
    totalEntries: propNum(b, "total_entries"),
    totalPages: propNum(b, "total_pages"),
  };
}

export function parsePeopleSearchResponse(response: unknown): { people: NormalizedPerson[]; pagination: ApolloPagination } {
  const empty: ApolloPagination = { page: 1, perPage: 25, totalEntries: 0, totalPages: 0 };
  if (!isRecord(response)) return { people: [], pagination: empty };
  const people = Array.isArray(response.people) ? response.people.filter(isRecord).map(normalizePerson) : [];
  const pagination = isRecord(response.pagination) ? parsePagination(response.pagination as Record<string, unknown>) : empty;
  return { people, pagination };
}

// ---------------------------------------------------------------------------
// NormalizedOrganization
// ---------------------------------------------------------------------------

export type NormalizedOrganization = {
  id: string;
  provider: "apollo";
  name: string;
  domain: string;
  websiteUrl: string;
  linkedinUrl: string;
  twitterUrl: string;
  facebookUrl: string;
  phone: string;
  industry: string;
  city: string;
  state: string;
  country: string;
  numEmployees: number;
  estimatedNumEmployees: number;
  annualRevenue: number;
  logoUrl: string;
  shortDescription: string;
  modelVersion: "2026-05-17";
  raw: Record<string, unknown>;
};

export function normalizeOrganization(o: Record<string, unknown>): NormalizedOrganization {
  return {
    id: `apl-org:${prop(o, "id")}`,
    provider: "apollo",
    name: prop(o, "name"),
    domain: prop(o, "primary_domain") || prop(o, "domain"),
    websiteUrl: prop(o, "website_url"),
    linkedinUrl: prop(o, "linkedin_url"),
    twitterUrl: prop(o, "twitter_url"),
    facebookUrl: prop(o, "facebook_url"),
    phone: prop(o, "phone"),
    industry: prop(o, "industry"),
    city: prop(o, "city"),
    state: prop(o, "state"),
    country: prop(o, "country"),
    numEmployees: propNum(o, "num_employees"),
    estimatedNumEmployees: propNum(o, "estimated_num_employees"),
    annualRevenue: propNum(o, "annual_revenue"),
    logoUrl: prop(o, "logo_url"),
    shortDescription: prop(o, "short_description"),
    modelVersion: "2026-05-17",
    raw: o,
  };
}

export function parseOrganizationsSearchResponse(response: unknown): { organizations: NormalizedOrganization[]; pagination: ApolloPagination } {
  const empty: ApolloPagination = { page: 1, perPage: 25, totalEntries: 0, totalPages: 0 };
  if (!isRecord(response)) return { organizations: [], pagination: empty };
  const organizations = Array.isArray(response.organizations) ? response.organizations.filter(isRecord).map(normalizeOrganization) : [];
  const pagination = isRecord(response.pagination) ? parsePagination(response.pagination as Record<string, unknown>) : empty;
  return { organizations, pagination };
}

export function parseOrganizationEnrichResponse(response: unknown): { organization: NormalizedOrganization | null } {
  if (!isRecord(response)) return { organization: null };
  const org = isRecord(response.organization) ? response.organization : response;
  if (!isRecord(org) || !prop(org, "id")) return { organization: null };
  return { organization: normalizeOrganization(org) };
}
