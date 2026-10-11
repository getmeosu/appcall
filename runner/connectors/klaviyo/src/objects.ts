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
// KV-1: Klaviyo campaigns carry no `channel`/`created` attributes (any revision;
// arch notes TF:198-199/214-215/224-225). createdAt comes from `created_at`
// (TF:200/216/226); the channel lives on the campaign-message resource at
// `attributes.definition.channel` (get_campaign 2026-07-15,
// CampaignMessageResponseObjectResource), reachable through
// `relationships.campaign-messages` + the compound document's `included`.
// When neither is present the channel is returned empty.
export function campaignChannelFromIncluded(d: Record<string, unknown>, included: unknown): string {
  if (!Array.isArray(included)) return "";
  const messages = included.filter((r): r is Record<string, unknown> => isRecord(r) && r.type === "campaign-message");
  if (!messages.length) return "";
  const rels = isRecord(d.relationships) ? d.relationships : {};
  const rel = isRecord(rels["campaign-messages"]) ? rels["campaign-messages"] : {};
  const ids = Array.isArray(rel.data) ? rel.data.filter(isRecord).map((r) => prop(r, "id")).filter((id) => id.length > 0) : [];
  const campaignId = prop(d, "id");
  const owned = messages.filter((m) => {
    if (ids.includes(prop(m, "id"))) return true;
    const mrels = isRecord(m.relationships) ? m.relationships : {};
    const parent = isRecord(mrels.campaign) && isRecord(mrels.campaign.data) ? mrels.campaign.data : {};
    return campaignId.length > 0 && prop(parent, "id") === campaignId;
  });
  for (const m of owned) {
    const attrs = isRecord(m.attributes) ? m.attributes : {};
    const definition = isRecord(attrs.definition) ? attrs.definition : {};
    const channel = prop(definition, "channel");
    if (channel) return channel;
  }
  return "";
}
export function normalizeCampaign(d: Record<string, unknown>, included?: unknown): NormalizedCampaign {
  const attrs = isRecord(d.attributes) ? d.attributes : {};
  return {
    id: `kl-campaign:${prop(d, "id")}`, provider: "klaviyo", providerCampaignId: prop(d, "id"),
    name: prop(attrs, "name"), status: prop(attrs, "status"), channelId: campaignChannelFromIncluded(d, included),
    sentCount: typeof attrs.sent === "number" ? attrs.sent : 0,
    openCount: typeof attrs.opens === "number" ? attrs.opens : 0,
    clickCount: typeof attrs.clicks === "number" ? attrs.clicks : 0,
    createdAt: prop(attrs, "created_at"), modelVersion: "2026-05-16", raw: d,
  };
}
export function parseCampaignsResponse(response: unknown): { campaigns: NormalizedCampaign[]; nextPageToken: string | null } {
  if (!isRecord(response)) return { campaigns: [], nextPageToken: null };
  const data = response.data;
  if (!Array.isArray(data)) return { campaigns: [], nextPageToken: null };
  const nextUrl = parseNextCursor(response);
  const included = response.included;
  return { campaigns: data.filter(isRecord).map((d) => normalizeCampaign(d, included)), nextPageToken: nextUrl ? extractCursorFromUrl(nextUrl) : null };
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

export type NormalizedMetric = {
  id: string; provider: "klaviyo"; providerMetricId: string;
  name: string; createdAt: string; updatedAt: string;
  modelVersion: "2026-05-16"; raw: Record<string, unknown>;
};
export function normalizeMetric(d: Record<string, unknown>): NormalizedMetric {
  const attrs = isRecord(d.attributes) ? d.attributes : {};
  return {
    id: `kl-metric:${prop(d, "id")}`, provider: "klaviyo", providerMetricId: prop(d, "id"),
    name: prop(attrs, "name"), createdAt: prop(attrs, "created"), updatedAt: prop(attrs, "updated"),
    modelVersion: "2026-05-16", raw: d,
  };
}
export function parseMetricsResponse(response: unknown): { metrics: NormalizedMetric[] } {
  if (!isRecord(response) || !Array.isArray(response.data)) return { metrics: [] };
  return { metrics: response.data.filter(isRecord).map(normalizeMetric) };
}

export type NormalizedCatalogItem = {
  id: string; provider: "klaviyo"; providerItemId: string;
  externalId: string; title: string; description: string; url: string; published: boolean;
  modelVersion: "2026-05-16"; raw: Record<string, unknown>;
};
export function normalizeCatalogItem(d: Record<string, unknown>): NormalizedCatalogItem {
  const attrs = isRecord(d.attributes) ? d.attributes : {};
  return {
    id: `kl-catalog:${prop(d, "id")}`, provider: "klaviyo", providerItemId: prop(d, "id"),
    externalId: prop(attrs, "external_id"), title: prop(attrs, "title"), description: prop(attrs, "description"),
    url: prop(attrs, "url"), published: attrs.published === true,
    modelVersion: "2026-05-16", raw: d,
  };
}
export function parseCatalogItemsResponse(response: unknown): { items: NormalizedCatalogItem[] } {
  if (!isRecord(response) || !Array.isArray(response.data)) return { items: [] };
  return { items: response.data.filter(isRecord).map(normalizeCatalogItem) };
}

export type NormalizedTemplate = {
  id: string; provider: "klaviyo"; providerTemplateId: string;
  name: string; editorType: string; createdAt: string; updatedAt: string;
  modelVersion: "2026-05-16"; raw: Record<string, unknown>;
};
export function normalizeTemplate(d: Record<string, unknown>): NormalizedTemplate {
  const attrs = isRecord(d.attributes) ? d.attributes : {};
  return {
    id: `kl-template:${prop(d, "id")}`, provider: "klaviyo", providerTemplateId: prop(d, "id"),
    name: prop(attrs, "name"), editorType: prop(attrs, "editor_type"),
    createdAt: prop(attrs, "created"), updatedAt: prop(attrs, "updated"),
    modelVersion: "2026-05-16", raw: d,
  };
}
export function parseTemplatesResponse(response: unknown): { templates: NormalizedTemplate[] } {
  if (!isRecord(response) || !Array.isArray(response.data)) return { templates: [] };
  return { templates: response.data.filter(isRecord).map(normalizeTemplate) };
}

export type NormalizedFlow = {
  id: string; provider: "klaviyo"; providerFlowId: string;
  name: string; status: string; triggerType: string; createdAt: string;
  modelVersion: "2026-05-16"; raw: Record<string, unknown>;
};
export function normalizeFlow(d: Record<string, unknown>): NormalizedFlow {
  const attrs = isRecord(d.attributes) ? d.attributes : {};
  return {
    id: `kl-flow:${prop(d, "id")}`, provider: "klaviyo", providerFlowId: prop(d, "id"),
    name: prop(attrs, "name"), status: prop(attrs, "status"), triggerType: prop(attrs, "trigger_type"),
    createdAt: prop(attrs, "created"), modelVersion: "2026-05-16", raw: d,
  };
}
export function parseFlowsResponse(response: unknown): { flows: NormalizedFlow[] } {
  if (!isRecord(response) || !Array.isArray(response.data)) return { flows: [] };
  return { flows: response.data.filter(isRecord).map(normalizeFlow) };
}

export function jsonApiData(body: unknown): Record<string, unknown> {
  if (!isRecord(body)) return {};
  return isRecord(body.data) ? body.data : {};
}
export function jsonApiList(body: unknown): Record<string, unknown>[] {
  if (!isRecord(body) || !Array.isArray(body.data)) return [];
  return body.data.filter(isRecord);
}
