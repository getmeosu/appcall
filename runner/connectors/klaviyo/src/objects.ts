import { prop, isRecord, parseNextCursor, extractCursorFromUrl } from "./http";

export type NormalizedContact = {
  id: string; provider: "klaviyo"; providerContactId: string;
  email: string; firstName: string; lastName: string; phone: string;
  createdAt: string; updatedAt: string;
  modelVersion: "2026-05-16"; raw: Record<string, unknown>;
};
export function normalizeContact(d: Record<string, unknown>): NormalizedContact {
  const attrs = isRecord(d.attributes) ? d.attributes : {};
  return {
    id: `kl-contact:${prop(d, "id")}`, provider: "klaviyo", providerContactId: prop(d, "id"),
    email: prop(attrs, "email"), firstName: prop(attrs, "first_name"), lastName: prop(attrs, "last_name"),
    phone: prop(attrs, "phone_number"),
    createdAt: prop(attrs, "created"), updatedAt: prop(attrs, "updated"),
    modelVersion: "2026-05-16", raw: d,
  };
}
export function parseContactsResponse(response: unknown): { contacts: NormalizedContact[]; nextPageToken: string | null } {
  if (!isRecord(response)) return { contacts: [], nextPageToken: null };
  const data = response.data;
  if (!Array.isArray(data)) return { contacts: [], nextPageToken: null };
  const nextUrl = parseNextCursor(response);
  return { contacts: data.filter(isRecord).map(normalizeContact), nextPageToken: nextUrl ? extractCursorFromUrl(nextUrl) : null };
}

export type NormalizedCampaign = {
  id: string; provider: "klaviyo"; providerCampaignId: string;
  name: string; status: string; channelId: string;
  sentCount: number; openCount: number; clickCount: number;
  createdAt: string;
  modelVersion: "2026-05-16"; raw: Record<string, unknown>;
};
export function normalizeCampaign(d: Record<string, unknown>): NormalizedCampaign {
  const attrs = isRecord(d.attributes) ? d.attributes : {};
  return {
    id: `kl-campaign:${prop(d, "id")}`, provider: "klaviyo", providerCampaignId: prop(d, "id"),
    name: prop(attrs, "name"), status: prop(attrs, "status"), channelId: prop(attrs, "channel"),
    sentCount: typeof attrs.sent === "number" ? attrs.sent : 0,
    openCount: typeof attrs.opens === "number" ? attrs.opens : 0,
    clickCount: typeof attrs.clicks === "number" ? attrs.clicks : 0,
    createdAt: prop(attrs, "created"), modelVersion: "2026-05-16", raw: d,
  };
}
export function parseCampaignsResponse(response: unknown): { campaigns: NormalizedCampaign[]; nextPageToken: string | null } {
  if (!isRecord(response)) return { campaigns: [], nextPageToken: null };
  const data = response.data;
  if (!Array.isArray(data)) return { campaigns: [], nextPageToken: null };
  const nextUrl = parseNextCursor(response);
  return { campaigns: data.filter(isRecord).map(normalizeCampaign), nextPageToken: nextUrl ? extractCursorFromUrl(nextUrl) : null };
}

export type NormalizedList = {
  id: string; provider: "klaviyo"; providerListId: string;
  name: string; totalMembers: number; createdAt: string;
  modelVersion: "2026-05-16"; raw: Record<string, unknown>;
};
export function normalizeList(d: Record<string, unknown>): NormalizedList {
  const attrs = isRecord(d.attributes) ? d.attributes : {};
  return {
    id: `kl-list:${prop(d, "id")}`, provider: "klaviyo", providerListId: prop(d, "id"),
    name: prop(attrs, "name"),
    totalMembers: typeof attrs.total_members === "number" ? attrs.total_members : 0,
    createdAt: prop(attrs, "created"), modelVersion: "2026-05-16", raw: d,
  };
}
export function parseListsResponse(response: unknown): { lists: NormalizedList[]; nextPageToken: string | null } {
  if (!isRecord(response)) return { lists: [], nextPageToken: null };
  const data = response.data;
  if (!Array.isArray(data)) return { lists: [], nextPageToken: null };
  const nextUrl = parseNextCursor(response);
  return { lists: data.filter(isRecord).map(normalizeList), nextPageToken: nextUrl ? extractCursorFromUrl(nextUrl) : null };
}
