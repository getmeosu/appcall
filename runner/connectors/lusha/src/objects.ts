import { prop, propNum, isRecord } from "./http";

// ---------------------------------------------------------------------------
// NormalizedPerson
// ---------------------------------------------------------------------------

export type NormalizedPerson = {
  id: string;
  provider: "lusha";
  firstName: string;
  lastName: string;
  fullName: string;
  jobTitle: string;
  companyName: string;
  companyDomain: string;
  linkedinUrl: string;
  emails: string[];
  phones: string[];
  location: string;
  modelVersion: "2026-05-17";
  raw: Record<string, unknown>;
};

export function normalizePerson(p: Record<string, unknown>): NormalizedPerson {
  const emails: string[] = [];
  if (Array.isArray(p.emails)) {
    for (const e of p.emails) {
      if (isRecord(e) && typeof e.email === "string") emails.push(e.email);
      else if (typeof e === "string") emails.push(e);
    }
  }

  const phones: string[] = [];
  if (Array.isArray(p.phones)) {
    for (const ph of p.phones) {
      if (isRecord(ph) && typeof ph.localizedNumber === "string") phones.push(ph.localizedNumber);
      else if (isRecord(ph) && typeof ph.number === "string") phones.push(ph.number);
      else if (typeof ph === "string") phones.push(ph);
    }
  }

  const location = isRecord(p.location)
    ? [prop(p.location, "city"), prop(p.location, "state"), prop(p.location, "country")].filter(Boolean).join(", ")
    : prop(p, "location");

  const company = isRecord(p.company) ? p.company : {} as Record<string, unknown>;

  return {
    id: `lusha-person:${prop(p, "id") || prop(p, "contactId")}`,
    provider: "lusha",
    firstName: prop(p, "firstName"),
    lastName: prop(p, "lastName"),
    fullName: prop(p, "fullName") || [prop(p, "firstName"), prop(p, "lastName")].filter(Boolean).join(" "),
    jobTitle: prop(p, "jobTitle"),
    companyName: isRecord(p.company) ? prop(company, "name") : prop(p, "companyName"),
    companyDomain: isRecord(p.company) ? prop(company, "domain") : prop(p, "companyDomain"),
    linkedinUrl: prop(p, "linkedinUrl"),
    emails,
    phones,
    location,
    modelVersion: "2026-05-17",
    raw: p,
  };
}

export function parsePersonResponse(response: unknown): { person: NormalizedPerson | null } {
  if (!isRecord(response)) return { person: null };
  const data = isRecord(response.data) ? response.data : isRecord(response.person) ? response.person : response;
  if (!isRecord(data)) return { person: null };
  return { person: normalizePerson(data) };
}

// ---------------------------------------------------------------------------
// NormalizedCompany
// ---------------------------------------------------------------------------

export type NormalizedCompany = {
  id: string;
  provider: "lusha";
  name: string;
  domain: string;
  industry: string;
  employeeCount: number;
  revenue: string;
  location: string;
  linkedinUrl: string;
  website: string;
  phone: string;
  modelVersion: "2026-05-17";
  raw: Record<string, unknown>;
};

export function normalizeCompany(c: Record<string, unknown>): NormalizedCompany {
  const location = isRecord(c.location)
    ? [prop(c.location, "city"), prop(c.location, "state"), prop(c.location, "country")].filter(Boolean).join(", ")
    : prop(c, "location");

  return {
    id: `lusha-company:${prop(c, "id") || prop(c, "companyId")}`,
    provider: "lusha",
    name: prop(c, "name"),
    domain: prop(c, "domain"),
    industry: prop(c, "industry"),
    employeeCount: propNum(c, "employeeCount"),
    revenue: prop(c, "revenue"),
    location,
    linkedinUrl: prop(c, "linkedinUrl"),
    website: prop(c, "website"),
    phone: prop(c, "phone"),
    modelVersion: "2026-05-17",
    raw: c,
  };
}

export function parseCompanyResponse(response: unknown): { company: NormalizedCompany | null } {
  if (!isRecord(response)) return { company: null };
  const data = isRecord(response.data) ? response.data : isRecord(response.company) ? response.company : response;
  if (!isRecord(data)) return { company: null };
  return { company: normalizeCompany(data) };
}
