import { prop, isRecord } from "./http";

export type NormalizedContact = {
  id: string; provider: "mailchimp"; providerContactId: string;
  email: string; firstName: string; lastName: string; status: string;
  audienceId: string; tags: string[];
  lastChanged: string; createdAt: string;
  modelVersion: "2026-05-16"; raw: Record<string, unknown>;
};

export function normalizeContact(c: Record<string, unknown>): NormalizedContact {
  const mergeFields = isRecord(c.merge_fields) ? c.merge_fields : {};
  return {
    id: `mc-contact:${prop(c, "id")}`,
    provider: "mailchimp",
    providerContactId: prop(c, "id"),
    email: prop(c, "email_address"),
    firstName: prop(mergeFields, "FNAME"),
    lastName: prop(mergeFields, "LNAME"),
    status: prop(c, "status"),
    audienceId: prop(c, "list_id"),
    tags: Array.isArray(c.tags) ? c.tags.filter((t: any) => typeof t?.name === "string").map((t: any) => t.name) : [],
    lastChanged: prop(c, "last_changed"),
    createdAt: prop(c, "timestamp_opt"),
    modelVersion: "2026-05-16",
    raw: c,
  };
}

export function parseContactsResponse(response: unknown): { contacts: NormalizedContact[]; total: number } {
  if (!isRecord(response)) return { contacts: [], total: 0 };
  const members = response.members;
  if (!Array.isArray(members)) return { contacts: [], total: typeof response.total_items === "number" ? response.total_items : 0 };
  return { contacts: members.filter(isRecord).map(normalizeContact), total: typeof response.total_items === "number" ? response.total_items : 0 };
}

export type NormalizedAudience = {
  id: string; provider: "mailchimp"; providerAudienceId: string;
  name: string; memberCount: number; createdAt: string;
  modelVersion: "2026-05-16"; raw: Record<string, unknown>;
};

export function normalizeAudience(a: Record<string, unknown>): NormalizedAudience {
  const stats = isRecord(a.stats) ? a.stats : {};
  return {
    id: `mc-audience:${prop(a, "id")}`,
    provider: "mailchimp",
    providerAudienceId: prop(a, "id"),
    name: prop(a, "name"),
    memberCount: typeof stats.member_count === "number" ? stats.member_count : 0,
    createdAt: prop(a, "date_created"),
    modelVersion: "2026-05-16",
    raw: a,
  };
}

export function parseAudiencesResponse(response: unknown): { audiences: NormalizedAudience[] } {
  if (!isRecord(response)) return { audiences: [] };
  const lists = response.lists;
  if (!Array.isArray(lists)) return { audiences: [] };
  return { audiences: lists.filter(isRecord).map(normalizeAudience) };
}

export type NormalizedCampaign = {
  id: string; provider: "mailchimp"; providerCampaignId: string;
  title: string; status: string; type: string; audienceId: string;
  sentCount: number; openRate: number; clickRate: number;
  createdAt: string; sendTime: string;
  modelVersion: "2026-05-16"; raw: Record<string, unknown>;
};

export function normalizeCampaign(c: Record<string, unknown>): NormalizedCampaign {
  const settings = isRecord(c.settings) ? c.settings : {};
  const report = isRecord(c.report) ? c.report : {};
  return {
    id: `mc-campaign:${prop(c, "id")}`,
    provider: "mailchimp",
    providerCampaignId: prop(c, "id"),
    title: prop(settings, "title"),
    status: prop(c, "status"),
    type: prop(c, "type"),
    audienceId: prop(settings, "recipients") ? (isRecord(settings.recipients) ? prop(settings.recipients as Record<string, unknown>, "list_id") : "") : "",
    sentCount: typeof report.sent === "number" ? report.sent : 0,
    openRate: typeof report.open_rate === "number" ? report.open_rate : 0,
    clickRate: typeof report.click_rate === "number" ? report.click_rate : 0,
    createdAt: prop(c, "create_time"),
    sendTime: prop(c, "send_time"),
    modelVersion: "2026-05-16",
    raw: c,
  };
}

export function parseCampaignsResponse(response: unknown): { campaigns: NormalizedCampaign[] } {
  if (!isRecord(response)) return { campaigns: [] };
  const campaigns = response.campaigns;
  if (!Array.isArray(campaigns)) return { campaigns: [] };
  return { campaigns: campaigns.filter(isRecord).map(normalizeCampaign) };
}
