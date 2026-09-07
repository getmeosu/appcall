import { prop, propNum, isRecord } from "./http";

export type NormalizedContact = {
  id: string; provider: "brevo"; providerContactId: string;
  email: string; firstName: string; lastName: string;
  listIds: number[]; attributes: Record<string, unknown>;
  createdAt: string; updatedAt: string;
  modelVersion: "2026-05-16"; raw: Record<string, unknown>;
};
export function normalizeContact(c: Record<string, unknown>): NormalizedContact {
  return {
    id: `brv-contact:${prop(c, "id")}`, provider: "brevo", providerContactId: prop(c, "id"),
    email: prop(c, "email"), firstName: prop(c, "firstName"), lastName: prop(c, "lastName"),
    listIds: Array.isArray(c.listIds) ? c.listIds.filter((v): v is number => typeof v === "number") : [],
    attributes: isRecord(c.attributes) ? c.attributes : {},
    createdAt: prop(c, "createdAt"), updatedAt: prop(c, "modifiedAt"),
    modelVersion: "2026-05-16", raw: c,
  };
}
export function parseContactsResponse(response: unknown): { contacts: NormalizedContact[]; count: number } {
  if (!isRecord(response)) return { contacts: [], count: 0 };
  const contacts = response.contacts;
  if (!Array.isArray(contacts)) return { contacts: [], count: typeof response.count === "number" ? response.count : 0 };
  return { contacts: contacts.filter(isRecord).map(normalizeContact), count: typeof response.count === "number" ? response.count : 0 };
}

export type NormalizedList = {
  id: string; provider: "brevo"; providerListId: string;
  name: string; totalSubscribers: number; createdAt: string;
  modelVersion: "2026-05-16"; raw: Record<string, unknown>;
};
export function normalizeList(l: Record<string, unknown>): NormalizedList {
  return {
    id: `brv-list:${String(l.id ?? "")}`, provider: "brevo", providerListId: String(l.id ?? ""),
    name: prop(l, "name"), totalSubscribers: propNum(l, "totalSubscribers"),
    createdAt: prop(l, "createdAt"), modelVersion: "2026-05-16", raw: l,
  };
}
export function parseListsResponse(response: unknown): { lists: NormalizedList[] } {
  if (!isRecord(response)) return { lists: [] };
  const lists = response.lists;
  if (!Array.isArray(lists)) return { lists: [] };
  return { lists: lists.filter(isRecord).map(normalizeList) };
}

export type NormalizedCampaign = {
  id: string; provider: "brevo"; providerCampaignId: string;
  name: string; status: string; type: string;
  subject: string; sentCount: number; openRate: number; clickRate: number;
  createdAt: string;
  modelVersion: "2026-05-16"; raw: Record<string, unknown>;
};
export function normalizeCampaign(c: Record<string, unknown>): NormalizedCampaign {
  const stats = isRecord(c.stats) ? c.stats : {};
  return {
    id: `brv-campaign:${String(c.id ?? "")}`, provider: "brevo", providerCampaignId: String(c.id ?? ""),
    name: prop(c, "name"), status: prop(c, "status"), type: prop(c, "type"),
    subject: prop(c, "subject"), sentCount: propNum(stats, "sentCount"),
    openRate: propNum(stats, "openRate"), clickRate: propNum(stats, "clickRate"),
    createdAt: prop(c, "createdAt"), modelVersion: "2026-05-16", raw: c,
  };
}
export function parseCampaignsResponse(response: unknown): { campaigns: NormalizedCampaign[] } {
  if (!isRecord(response)) return { campaigns: [] };
  const campaigns = response.campaigns;
  if (!Array.isArray(campaigns)) return { campaigns: [] };
  return { campaigns: campaigns.filter(isRecord).map(normalizeCampaign) };
}
