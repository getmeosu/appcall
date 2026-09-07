import { prop, isRecord } from "./http";

// ---------------------------------------------------------------------------
// NormalizedEvent
// ---------------------------------------------------------------------------

export type NormalizedEvent = {
  id: string;
  provider: "calendly";
  title: string;
  startTime: string;
  endTime: string;
  status: string;
  uri: string;
  cancelUrl: string;
  rescheduleUrl: string;
  modelVersion: "2026-05-17";
  raw: Record<string, unknown>;
};

export function normalizeEvent(e: Record<string, unknown>): NormalizedEvent {
  return {
    id: `cld-event:${prop(e, "uri").split("/").pop() ?? prop(e, "uri")}`,
    provider: "calendly",
    title: prop(e, "name"),
    startTime: prop(e, "start_time"),
    endTime: prop(e, "end_time"),
    status: prop(e, "status"),
    uri: prop(e, "uri"),
    cancelUrl: prop(e, "cancel_url"),
    rescheduleUrl: prop(e, "reschedule_url"),
    modelVersion: "2026-05-17",
    raw: e,
  };
}

export type CalendlyPagination = { nextPage: string | null };

export function parseEventsResponse(response: unknown): { events: NormalizedEvent[]; pagination: CalendlyPagination } {
  if (!isRecord(response)) return { events: [], pagination: { nextPage: null } };

  const collection = response.collection;
  if (!Array.isArray(collection)) return { events: [], pagination: { nextPage: null } };

  const nextPage = isRecord(response.pagination) ? (typeof response.pagination.next_page === "string" ? response.pagination.next_page : null) : null;

  return {
    events: collection.filter(isRecord).map(normalizeEvent),
    pagination: { nextPage },
  };
}

// ---------------------------------------------------------------------------
// NormalizedUser
// ---------------------------------------------------------------------------

export type NormalizedUser = {
  id: string;
  provider: "calendly";
  name: string;
  email: string;
  schedulingUrl: string;
  avatarUrl: string;
  timezone: string;
  modelVersion: "2026-05-17";
  raw: Record<string, unknown>;
};

export function normalizeUser(u: Record<string, unknown>): NormalizedUser {
  return {
    id: `cld-user:${prop(u, "uri").split("/").pop() ?? prop(u, "uri")}`,
    provider: "calendly",
    name: prop(u, "name"),
    email: prop(u, "email"),
    schedulingUrl: prop(u, "scheduling_url"),
    avatarUrl: prop(u, "avatar_url"),
    timezone: prop(u, "timezone"),
    modelVersion: "2026-05-17",
    raw: u,
  };
}

export function parseUserResponse(response: unknown): { user: NormalizedUser | null } {
  if (!isRecord(response)) return { user: null };

  const resource = response.resource;
  if (!isRecord(resource)) return { user: null };

  return { user: normalizeUser(resource) };
}
