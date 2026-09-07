import { prop, isRecord } from "./http";

export type NormalizedContact = {
  id: string; provider: "sendgrid"; providerContactId: string;
  email: string; firstName: string; lastName: string;
  listIds: string[]; createdAt: string; updatedAt: string;
  modelVersion: "2026-05-16"; raw: Record<string, unknown>;
};
export function normalizeContact(c: Record<string, unknown>): NormalizedContact {
  return {
    id: `sg-contact:${prop(c, "id")}`, provider: "sendgrid", providerContactId: prop(c, "id"),
    email: prop(c, "email"), firstName: prop(c, "first_name"), lastName: prop(c, "last_name"),
    listIds: Array.isArray(c.list_ids) ? c.list_ids.filter((v): v is string => typeof v === "string") : [],
    createdAt: prop(c, "created_at"), updatedAt: prop(c, "updated_at"),
    modelVersion: "2026-05-16", raw: c,
  };
}
export function parseContactsResponse(response: unknown): { contacts: NormalizedContact[]; nextPageToken: string | null } {
  if (!isRecord(response)) return { contacts: [], nextPageToken: null };
  const contacts = response.contacts;
  if (!Array.isArray(contacts)) return { contacts: [], nextPageToken: null };
  const meta = response._metadata;
  const nextPageToken = isRecord(meta) ? (typeof meta.next_page_token === "string" && meta.next_page_token ? meta.next_page_token : null) : null;
  return { contacts: contacts.filter(isRecord).map(normalizeContact), nextPageToken };
}

export type NormalizedList = {
  id: string; provider: "sendgrid"; providerListId: string;
  name: string; contactCount: number; createdAt: string;
  modelVersion: "2026-05-16"; raw: Record<string, unknown>;
};
export function normalizeList(l: Record<string, unknown>): NormalizedList {
  return {
    id: `sg-list:${prop(l, "id")}`, provider: "sendgrid", providerListId: prop(l, "id"),
    name: prop(l, "name"), contactCount: typeof l.contact_count === "number" ? l.contact_count : 0,
    createdAt: prop(l, "created_at"), modelVersion: "2026-05-16", raw: l,
  };
}
export function parseListsResponse(response: unknown): { lists: NormalizedList[] } {
  const results = isRecord(response) ? response.results : null;
  if (!Array.isArray(results)) return { lists: [] };
  return { lists: results.filter(isRecord).map(normalizeList) };
}

export type NormalizedCampaign = {
  id: string; provider: "sendgrid"; providerCampaignId: string;
  title: string; status: string; subject: string;
  senderId: string; listIds: string[];
  openRate: number; clickRate: number;
  createdAt: string;
  modelVersion: "2026-05-16"; raw: Record<string, unknown>;
};
export function normalizeCampaign(c: Record<string, unknown>): NormalizedCampaign {
  const stats = isRecord(c.stats) ? c.stats : {};
  return {
    id: `sg-campaign:${prop(c, "id")}`, provider: "sendgrid", providerCampaignId: prop(c, "id"),
    title: prop(c, "title"), status: prop(c, "status"), subject: prop(c, "subject"),
    senderId: prop(c, "sender_id"),
    listIds: Array.isArray(c.list_ids) ? c.list_ids.filter((v): v is string => typeof v === "string") : [],
    openRate: typeof stats.open_rate === "number" ? stats.open_rate : 0,
    clickRate: typeof stats.click_rate === "number" ? stats.click_rate : 0,
    createdAt: prop(c, "create_time"), modelVersion: "2026-05-16", raw: c,
  };
}
export function parseCampaignsResponse(response: unknown): { campaigns: NormalizedCampaign[] } {
  const results = isRecord(response) ? response.results : null;
  if (!Array.isArray(results)) return { campaigns: [] };
  return { campaigns: results.filter(isRecord).map(normalizeCampaign) };
}
