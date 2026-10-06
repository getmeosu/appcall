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

export type NormalizedFolder = {
  id: string; provider: "brevo"; providerFolderId: string;
  name: string; uniqueSubscribers: number; totalSubscribers: number;
  modelVersion: "2026-05-16"; raw: Record<string, unknown>;
};
export function normalizeFolder(f: Record<string, unknown>): NormalizedFolder {
  return {
    id: `brv-folder:${String(f.id ?? "")}`, provider: "brevo", providerFolderId: String(f.id ?? ""),
    name: prop(f, "name"), uniqueSubscribers: propNum(f, "uniqueSubscribers"),
    totalSubscribers: propNum(f, "totalSubscribers"), modelVersion: "2026-05-16", raw: f,
  };
}
export function parseFoldersResponse(response: unknown): { folders: NormalizedFolder[] } {
  if (!isRecord(response)) return { folders: [] };
  const folders = response.folders;
  if (!Array.isArray(folders)) return { folders: [] };
  return { folders: folders.filter(isRecord).map(normalizeFolder) };
}

export type NormalizedTemplate = {
  id: string; provider: "brevo"; providerTemplateId: string;
  name: string; subject: string; isActive: boolean; createdAt: string;
  modelVersion: "2026-05-16"; raw: Record<string, unknown>;
};
export function normalizeTemplate(t: Record<string, unknown>): NormalizedTemplate {
  return {
    id: `brv-template:${String(t.id ?? "")}`, provider: "brevo", providerTemplateId: String(t.id ?? ""),
    name: prop(t, "name"), subject: prop(t, "subject"),
    isActive: t.isActive === true, createdAt: prop(t, "createdAt"),
    modelVersion: "2026-05-16", raw: t,
  };
}
export function parseTemplatesResponse(response: unknown): { templates: NormalizedTemplate[]; count: number } {
  if (!isRecord(response)) return { templates: [], count: 0 };
  const templates = response.templates;
  if (!Array.isArray(templates)) return { templates: [], count: typeof response.count === "number" ? response.count : 0 };
  return { templates: templates.filter(isRecord).map(normalizeTemplate), count: typeof response.count === "number" ? response.count : 0 };
}

export type NormalizedSender = {
  id: string; provider: "brevo"; providerSenderId: string;
  name: string; email: string; active: boolean;
  modelVersion: "2026-05-16"; raw: Record<string, unknown>;
};
export function normalizeSender(s: Record<string, unknown>): NormalizedSender {
  return {
    id: `brv-sender:${String(s.id ?? "")}`, provider: "brevo", providerSenderId: String(s.id ?? ""),
    name: prop(s, "name"), email: prop(s, "email"), active: s.active === true,
    modelVersion: "2026-05-16", raw: s,
  };
}
export function parseSendersResponse(response: unknown): { senders: NormalizedSender[] } {
  if (!isRecord(response)) return { senders: [] };
  const senders = response.senders;
  if (!Array.isArray(senders)) return { senders: [] };
  return { senders: senders.filter(isRecord).map(normalizeSender) };
}
