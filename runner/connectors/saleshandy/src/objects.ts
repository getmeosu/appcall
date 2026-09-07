import { prop, isRecord } from "./http";

// ---------------------------------------------------------------------------
// NormalizedProspect
// ---------------------------------------------------------------------------

export type NormalizedProspect = {
  id: string;
  provider: "saleshandy";
  email: string;
  firstName: string;
  lastName: string;
  company: string;
  status: string;
  raw: Record<string, unknown>;
};

function anyPropAsString(obj: Record<string, unknown>, ...fields: string[]): string {
  for (const f of fields) {
    const v = obj[f];
    if (typeof v === "string" && v.length > 0) return v;
    if (typeof v === "number") return String(v);
  }
  return "";
}

export function normalizeProspect(p: Record<string, unknown>): NormalizedProspect {
  const id = anyPropAsString(p, "id", "_id", "prospectId");
  return {
    id: `sh-prospect:${id}`,
    provider: "saleshandy",
    // Real API uses 'emailAddress'; also handle legacy 'email'
    email: prop(p, "emailAddress") || prop(p, "email"),
    firstName: prop(p, "firstName") || prop(p, "first_name"),
    lastName: prop(p, "lastName") || prop(p, "last_name"),
    // Real API uses 'companyName'; also handle legacy 'company'
    company: prop(p, "companyName") || prop(p, "company"),
    status: prop(p, "status"),
    raw: p,
  };
}

// Extracts the prospect payload from real API envelope { message, payload } or legacy { data }
function unwrapEnvelope(response: unknown): unknown {
  if (!isRecord(response)) return response;
  // Real API envelope: { message, payload }
  if (response.payload !== undefined) return response.payload;
  // Legacy / fallback: { data }
  if (response.data !== undefined) return response.data;
  return response;
}

export function parseProspectResponse(response: unknown): { prospect: NormalizedProspect | null } {
  if (!isRecord(response)) return { prospect: null };

  // Unwrap envelope to get the inner data
  const inner = unwrapEnvelope(response);
  if (!isRecord(inner)) return { prospect: null };

  // If it's an array-like response, take first element
  if (Array.isArray(inner)) return { prospect: null };

  return { prospect: normalizeProspect(inner) };
}

export function parseProspectsResponse(response: unknown): { prospects: NormalizedProspect[]; meta: Record<string, unknown> } {
  if (!isRecord(response)) return { prospects: [], meta: {} };

  // Unwrap envelope
  const inner = unwrapEnvelope(response);

  // Real API: payload = { list: [...], total: N }
  if (isRecord(inner)) {
    if (Array.isArray((inner as Record<string, unknown>).list)) {
      const list = (inner as Record<string, unknown>).list as unknown[];
      const total = (inner as Record<string, unknown>).total;
      return {
        prospects: list.filter(isRecord).map(normalizeProspect),
        meta: { total: typeof total === "number" ? total : 0 },
      };
    }
    // Legacy: direct array under data (already unwrapped)
    if (Array.isArray(inner)) {
      return { prospects: (inner as unknown[]).filter(isRecord).map(normalizeProspect), meta: {} };
    }
  }

  // Direct array at top level (legacy)
  if (Array.isArray(inner)) {
    return { prospects: (inner as unknown[]).filter(isRecord).map(normalizeProspect), meta: {} };
  }

  // Legacy envelope: { data: [...], meta: {...} }
  const data = isRecord(response) ? response.data : undefined;
  const meta = isRecord(response) && isRecord(response.meta) ? response.meta : {};

  if (Array.isArray(data)) {
    return { prospects: data.filter(isRecord).map(normalizeProspect), meta };
  }

  return { prospects: [], meta: {} };
}
