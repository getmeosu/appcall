export type NormalizedOrganization = {
  id: string;
  provider: "linkedin";
  providerOrgId: string;
  name: string;
  vanityName: string;
  description: string;
  logoUrl: string;
  websiteUrl: string;
  industry: string;
  companyType: string;
  followerCount: number;
  employeeCount: number;
  headquarters: string;
  modelVersion: "2026-05-16";
  raw: Record<string, unknown>;
};

export function normalizeOrganization(data: Record<string, unknown>): NormalizedOrganization {
  const id = extractString(data, "id") || "";
  const simpleId = id.replace("urn:li:organization:", "");

  let name = extractLocalizedField(data, "localizedName");
  if (!name) name = extractString(data, "name");

  let description = extractLocalizedField(data, "localizedDescription");
  if (!description) description = extractString(data, "description");

  let logoUrl = "";
  const logo = data.logoV2;
  if (isRecord(logo)) {
    const rawLogo = logo["image~"];
    if (isRecord(rawLogo)) {
      const elements = rawLogo.elements;
      if (Array.isArray(elements) && elements.length > 0 && isRecord(elements[0])) {
        const identifiers = elements[0].identifiers;
        if (Array.isArray(identifiers) && identifiers.length > 0 && isRecord(identifiers[0])) {
          logoUrl = extractString(identifiers[0], "content") || extractString(identifiers[0], "identifier");
        }
      }
    }
  }

  return {
    id: `li-org:${simpleId}`,
    provider: "linkedin",
    providerOrgId: simpleId,
    name,
    vanityName: extractString(data, "vanityName"),
    description,
    logoUrl,
    websiteUrl: extractString(data, "websiteUrl"),
    industry: extractString(data, "industries"),
    companyType: extractString(data, "companyType"),
    followerCount: extractNumber(data, "followerCount") || extractNumber(data, "numFollowers"),
    employeeCount: extractNumber(data, "staffCount") || extractNumber(data, "employeeCount"),
    headquarters: extractString(data, "headquarters"),
    modelVersion: "2026-05-16",
    raw: data,
  };
}

export function parseOrganizationsResponse(response: unknown): { organizations: NormalizedOrganization[]; nextStart: number | null; count: number } {
  if (!isRecord(response)) return { organizations: [], nextStart: null, count: 0 };
  const elements = response.elements;
  if (!Array.isArray(elements)) return { organizations: [], nextStart: null, count: 0 };
  const orgs = elements.filter(isRecord).map(normalizeOrganization);
  const paging = extractOrgPaging(response);
  return { organizations: orgs, ...paging };
}

function extractOrgPaging(response: Record<string, unknown>): { nextStart: number | null; count: number } {
  const paging = response.paging;
  if (!isRecord(paging)) return { nextStart: null, count: 0 };
  const count = typeof paging.count === "number" ? paging.count : 0;
  const links = paging.links;
  if (!Array.isArray(links) || links.length === 0) return { nextStart: null, count };
  const nextLink = links.find((l: any) => isRecord(l) && l.rel === "next");
  if (!nextLink || !isRecord(nextLink)) return { nextStart: null, count };
  const uri = nextLink.uri;
  if (typeof uri !== "string") return { nextStart: null, count };
  const match = uri.match(/start=(\d+)/);
  if (!match) return { nextStart: null, count };
  return { nextStart: Number(match[1]), count };
}

function extractLocalizedField(data: Record<string, unknown>, field: string): string {
  const val = data[field];
  if (typeof val === "string") return val;
  if (isRecord(val)) {
    const preferred = val[Object.keys(val)[0]];
    if (typeof preferred === "string") return preferred;
  }
  return "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractString(obj: Record<string, unknown>, field: string): string {
  const val = obj[field];
  return typeof val === "string" ? val : "";
}

function extractNumber(obj: Record<string, unknown>, field: string): number {
  const val = obj[field];
  if (typeof val === "number") return Number.isFinite(val) ? val : 0;
  if (typeof val === "string") { const n = Number(val); return Number.isFinite(n) ? n : 0; }
  return 0;
}
