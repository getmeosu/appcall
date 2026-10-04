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

export type NormalizedTemplate = {
  id: string; provider: "mailchimp"; providerTemplateId: string;
  name: string; type: string; active: boolean;
  createdAt: string; updatedAt: string;
  modelVersion: "2026-05-16"; raw: Record<string, unknown>;
};

export function normalizeTemplate(t: Record<string, unknown>): NormalizedTemplate {
  const id = t.id == null ? "" : String(t.id);
  return {
    id: `mc-template:${id}`,
    provider: "mailchimp",
    providerTemplateId: id,
    name: prop(t, "name"),
    type: prop(t, "type"),
    active: t.active === true,
    createdAt: prop(t, "date_created"),
    updatedAt: prop(t, "date_edited"),
    modelVersion: "2026-05-16",
    raw: t,
  };
}

export function parseTemplatesResponse(response: unknown): { templates: NormalizedTemplate[]; total: number } {
  if (!isRecord(response)) return { templates: [], total: 0 };
  const templates = response.templates;
  if (!Array.isArray(templates)) return { templates: [], total: typeof response.total_items === "number" ? response.total_items : 0 };
  return {
    templates: templates.filter(isRecord).map(normalizeTemplate),
    total: typeof response.total_items === "number" ? response.total_items : 0,
  };
}

export type NormalizedReport = {
  id: string; provider: "mailchimp"; providerCampaignId: string;
  title: string; emailsSent: number; unsubscribed: number;
  openRate: number; clickRate: number; uniqueOpens: number; uniqueClicks: number;
  sendTime: string;
  modelVersion: "2026-05-16"; raw: Record<string, unknown>;
};

export function normalizeReport(r: Record<string, unknown>): NormalizedReport {
  const opens = isRecord(r.opens) ? r.opens : {};
  const clicks = isRecord(r.clicks) ? r.clicks : {};
  return {
    id: `mc-report:${prop(r, "id")}`,
    provider: "mailchimp",
    providerCampaignId: prop(r, "id"),
    title: prop(r, "campaign_title"),
    emailsSent: typeof r.emails_sent === "number" ? r.emails_sent : 0,
    unsubscribed: typeof r.unsubscribed === "number" ? r.unsubscribed : 0,
    openRate: typeof opens.open_rate === "number" ? opens.open_rate : 0,
    clickRate: typeof clicks.click_rate === "number" ? clicks.click_rate : 0,
    uniqueOpens: typeof opens.unique_opens === "number" ? opens.unique_opens : 0,
    uniqueClicks: typeof clicks.unique_clicks === "number" ? clicks.unique_clicks : 0,
    sendTime: prop(r, "send_time"),
    modelVersion: "2026-05-16",
    raw: r,
  };
}

export type NormalizedOpen = { email: string; opensCount: number };
export function parseOpensResponse(response: unknown): { opens: NormalizedOpen[] } {
  if (!isRecord(response) || !Array.isArray(response.members)) return { opens: [] };
  return {
    opens: response.members.filter(isRecord).map((m) => ({
      email: prop(m, "email_address"),
      opensCount: typeof m.opens_count === "number" ? m.opens_count : 0,
    })),
  };
}

export type NormalizedClick = { url: string; totalClicks: number; uniqueClicks: number };
export function parseClicksResponse(response: unknown): { clicks: NormalizedClick[] } {
  if (!isRecord(response) || !Array.isArray(response.urls_clicked)) return { clicks: [] };
  return {
    clicks: response.urls_clicked.filter(isRecord).map((u) => ({
      url: prop(u, "url"),
      totalClicks: typeof u.total_clicks === "number" ? u.total_clicks : 0,
      uniqueClicks: typeof u.unique_clicks === "number" ? u.unique_clicks : 0,
    })),
  };
}

export type NormalizedUnsubscribe = { email: string; timestamp: string; reason: string };
export function parseUnsubscribedResponse(response: unknown): { unsubscribed: NormalizedUnsubscribe[] } {
  if (!isRecord(response) || !Array.isArray(response.unsubscribes)) return { unsubscribed: [] };
  return {
    unsubscribed: response.unsubscribes.filter(isRecord).map((u) => ({
      email: prop(u, "email_address"),
      timestamp: prop(u, "timestamp"),
      reason: prop(u, "reason"),
    })),
  };
}

export type NormalizedAutomation = {
  id: string; provider: "mailchimp"; providerAutomationId: string;
  title: string; status: string; emailsSent: number; audienceId: string;
  createdAt: string;
  modelVersion: "2026-05-16"; raw: Record<string, unknown>;
};

export function normalizeAutomation(a: Record<string, unknown>): NormalizedAutomation {
  const settings = isRecord(a.settings) ? a.settings : {};
  const recipients = isRecord(a.recipients) ? a.recipients : {};
  return {
    id: `mc-automation:${prop(a, "id")}`,
    provider: "mailchimp",
    providerAutomationId: prop(a, "id"),
    title: prop(settings, "title"),
    status: prop(a, "status"),
    emailsSent: typeof a.emails_sent === "number" ? a.emails_sent : 0,
    audienceId: prop(recipients, "list_id"),
    createdAt: prop(a, "create_time"),
    modelVersion: "2026-05-16",
    raw: a,
  };
}

export function parseAutomationsResponse(response: unknown): { automations: NormalizedAutomation[] } {
  if (!isRecord(response) || !Array.isArray(response.automations)) return { automations: [] };
  return { automations: response.automations.filter(isRecord).map(normalizeAutomation) };
}

export type NormalizedMemberNote = {
  id: string; provider: "mailchimp"; providerNoteId: string;
  note: string; listId: string; createdAt: string;
  modelVersion: "2026-05-16"; raw: Record<string, unknown>;
};

export function normalizeMemberNote(n: Record<string, unknown>): NormalizedMemberNote {
  const id = n.id == null ? "" : String(n.id);
  return {
    id: `mc-note:${id}`,
    provider: "mailchimp",
    providerNoteId: id,
    note: prop(n, "note"),
    listId: prop(n, "list_id"),
    createdAt: prop(n, "created_at"),
    modelVersion: "2026-05-16",
    raw: n,
  };
}
