import { createGraphClient, parseGraphRateLimit, type GraphClient } from "./http";

export type CalendarEvent = {
  id: string;
  subject?: string;
  bodyPreview?: string;
  start?: { dateTime: string; timeZone: string };
  end?: { dateTime: string; timeZone: string };
  location?: { displayName?: string };
  isAllDay?: boolean;
  isCancelled?: boolean;
  importance?: string;
  sensitivity?: string;
  webLink?: string;
  organizer?: { emailAddress?: { address?: string; name?: string } };
  categories?: string[];
  createdDateTime?: string;
  lastModifiedDateTime?: string;
  [key: string]: unknown;
};

export type NormalizedEvent = {
  id: string;
  provider: "microsoft-365";
  providerEventId: string;
  summary: string;
  description: string;
  location: string;
  startTime: string;
  endTime: string;
  status: string;
  webLink: string;
  modelVersion: "2026-05-16";
  raw: CalendarEvent;
};

export function normalizeCalendarEvent(event: CalendarEvent): NormalizedEvent {
  return {
    id: `outlook:${event.id}`,
    provider: "microsoft-365",
    providerEventId: event.id,
    summary: event.subject ?? "",
    description: event.bodyPreview ?? "",
    location: event.location?.displayName ?? "",
    startTime: event.start?.dateTime ?? "",
    endTime: event.end?.dateTime ?? "",
    status: event.isCancelled ? "cancelled" : "confirmed",
    webLink: event.webLink ?? "",
    modelVersion: "2026-05-16",
    raw: event,
  };
}

export function parseEventsResponse(response: unknown): { events: CalendarEvent[]; nextLink: string | null } {
  if (!isRecord(response)) return { events: [], nextLink: null };
  const value = response.value;
  if (!Array.isArray(value)) return { events: [], nextLink: null };
  return {
    events: value.filter(isRecord).map((e) => ({
      id: requireString(e.id, "id"),
      subject: typeof e.subject === "string" ? e.subject : undefined,
      bodyPreview: typeof e.bodyPreview === "string" ? e.bodyPreview : undefined,
      start: isRecord(e.start) ? e.start as { dateTime: string; timeZone: string } : undefined,
      end: isRecord(e.end) ? e.end as { dateTime: string; timeZone: string } : undefined,
      location: isRecord(e.location) ? e.location as { displayName?: string } : undefined,
      isAllDay: typeof e.isAllDay === "boolean" ? e.isAllDay : undefined,
      isCancelled: typeof e.isCancelled === "boolean" ? e.isCancelled : undefined,
      importance: typeof e.importance === "string" ? e.importance : undefined,
      sensitivity: typeof e.sensitivity === "string" ? e.sensitivity : undefined,
      webLink: typeof e.webLink === "string" ? e.webLink : undefined,
      organizer: isRecord(e.organizer) ? e.organizer : undefined,
      categories: Array.isArray(e.categories) ? e.categories.filter((c): c is string => typeof c === "string") : undefined,
      createdDateTime: typeof e.createdDateTime === "string" ? e.createdDateTime : undefined,
      lastModifiedDateTime: typeof e.lastModifiedDateTime === "string" ? e.lastModifiedDateTime : undefined,
    })),
    nextLink: parseNextOdataLink(response),
  };
}

export type Calendar = {
  id: string;
  name: string;
  canEdit: boolean;
  canShare: boolean;
  isDefaultCalendar: boolean;
  isRemovable: boolean;
  owner?: { address: string; name: string };
  [key: string]: unknown;
};

export function parseCalendarsResponse(response: unknown): { calendars: Calendar[] } {
  if (!isRecord(response)) return { calendars: [] };
  const value = response.value;
  if (!Array.isArray(value)) return { calendars: [] };
  return {
    calendars: value.filter(isRecord).map((c) => ({
      id: requireString(c.id, "id"),
      name: requireString(c.name ?? c.displayName, "name"),
      canEdit: typeof c.canEdit === "boolean" ? c.canEdit : false,
      canShare: typeof c.canShare === "boolean" ? c.canShare : false,
      isDefaultCalendar: typeof c.isDefaultCalendar === "boolean" ? c.isDefaultCalendar : false,
      isRemovable: typeof c.isRemovable === "boolean" ? c.isRemovable : false,
      owner: isRecord(c.owner) ? (isRecord(c.owner.emailAddress) ? { address: requireString(c.owner.emailAddress.address ?? "", "address"), name: requireString(c.owner.emailAddress.name ?? "", "name") } : { address: "", name: "" }) : undefined,
    })),
  };
}

function parseNextOdataLink(response: Record<string, unknown>): string | null {
  const link = response["@odata.nextLink"];
  return typeof link === "string" && link.length > 0 ? link : null;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// ─── Create Event ─────────────────────────────────────────────────────────────

export type CreateEventInput = {
  subject: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  body?: string;
  location?: string;
  attendees?: string[];
  isOnlineMeeting?: boolean;
};

export function validateCreateEventInput(input: unknown): CreateEventInput {
  if (!isRecord(input)) throw new Error("create event input must be an object");
  const subject = requireString(input.subject, "subject");
  const start = requireRecord(input.start, "start");
  const end = requireRecord(input.end, "end");
  return {
    subject,
    start: { dateTime: requireString(start.dateTime, "start.dateTime"), timeZone: requireString(start.timeZone, "start.timeZone") },
    end: { dateTime: requireString(end.dateTime, "end.dateTime"), timeZone: requireString(end.timeZone, "end.timeZone") },
    body: typeof input.body === "string" ? input.body : undefined,
    location: typeof input.location === "string" ? input.location : undefined,
    attendees: Array.isArray(input.attendees) ? (input.attendees as unknown[]).filter((a): a is string => typeof a === "string") : undefined,
    isOnlineMeeting: typeof input.isOnlineMeeting === "boolean" ? input.isOnlineMeeting : undefined,
  };
}

export function createEventsClient(options: { accessToken: string; fetch?: typeof fetch; graphClient?: GraphClient }) {
  const client = options.graphClient ?? createGraphClient({ accessToken: options.accessToken, fetch: options.fetch, operation: "events.create" });

  return {
    async create(input: unknown) {
      const payload = validateCreateEventInput(input);
      const body: Record<string, unknown> = {
        subject: payload.subject,
        start: payload.start,
        end: payload.end,
      };
      if (payload.body) body.body = { contentType: "text", content: payload.body };
      if (payload.location) body.location = { displayName: payload.location };
      if (payload.attendees) body.attendees = payload.attendees.map((a) => ({ emailAddress: { address: a }, type: "required" }));
      if (payload.isOnlineMeeting !== undefined) body.isOnlineMeeting = payload.isOnlineMeeting;

      const response = await client.fetchJSON("/v1.0/me/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.status === 201) {
        return { ok: true as const, event: normalizeCalendarEvent(response.body as CalendarEvent) };
      }
      if (response.status === 429) {
        const rateLimit = parseGraphRateLimit(response.status, response.headers);
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "Graph rate limit exceeded.", retryAfterSeconds: rateLimit.limited ? rateLimit.retryAfterSeconds : undefined } };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Graph rejected the create event request." } };
    },

    async update(input: unknown) {
      const payload = validateUpdateEventInput(input);
      const body: Record<string, unknown> = {};
      if (payload.subject) body.subject = payload.subject;
      if (payload.start) body.start = payload.start;
      if (payload.end) body.end = payload.end;
      if (payload.body) body.body = { contentType: "text", content: payload.body };
      if (payload.location) body.location = { displayName: payload.location };

      const response = await client.fetchJSON(`/v1.0/me/events/${encodeURIComponent(payload.eventId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.status === 200) {
        return { ok: true as const, event: normalizeCalendarEvent(response.body as CalendarEvent) };
      }
      if (response.status === 429) {
        const rateLimit = parseGraphRateLimit(response.status, response.headers);
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "Graph rate limit exceeded.", retryAfterSeconds: rateLimit.limited ? rateLimit.retryAfterSeconds : undefined } };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Graph rejected the update event request." } };
    },

    async delete(input: unknown) {
      const payload = validateDeleteEventInput(input);
      const response = await client.fetchJSON(`/v1.0/me/events/${encodeURIComponent(payload.eventId)}`, {
        method: "DELETE",
      });
      if (response.status === 204) return { ok: true as const };
      if (response.status === 429) {
        const rateLimit = parseGraphRateLimit(response.status, response.headers);
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "Graph rate limit exceeded.", retryAfterSeconds: rateLimit.limited ? rateLimit.retryAfterSeconds : undefined } };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Graph rejected the delete event request." } };
    },

    async get(input: unknown) {
      const payload = validateGetEventInput(input);
      const response = await client.fetchJSON(`/v1.0/me/events/${encodeURIComponent(payload.eventId)}`);
      if (response.status === 200) {
        return { ok: true as const, event: normalizeCalendarEvent(response.body as CalendarEvent) };
      }
      if (response.status === 429) {
        const rateLimit = parseGraphRateLimit(response.status, response.headers);
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "Graph rate limit exceeded.", retryAfterSeconds: rateLimit.limited ? rateLimit.retryAfterSeconds : undefined } };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Graph rejected the get event request." } };
    },
  };
}

// ─── Update Event ─────────────────────────────────────────────────────────────

export type UpdateEventInput = {
  eventId: string;
  subject?: string;
  start?: { dateTime: string; timeZone: string };
  end?: { dateTime: string; timeZone: string };
  body?: string;
  location?: string;
};

export function validateUpdateEventInput(input: unknown): UpdateEventInput {
  if (!isRecord(input)) throw new Error("update event input must be an object");
  return {
    eventId: requireString(input.eventId, "eventId"),
    subject: typeof input.subject === "string" ? input.subject : undefined,
    start: isRecord(input.start) ? { dateTime: requireString(input.start.dateTime, "start.dateTime"), timeZone: requireString(input.start.timeZone, "start.timeZone") } : undefined,
    end: isRecord(input.end) ? { dateTime: requireString(input.end.dateTime, "end.dateTime"), timeZone: requireString(input.end.timeZone, "end.timeZone") } : undefined,
    body: typeof input.body === "string" ? input.body : undefined,
    location: typeof input.location === "string" ? input.location : undefined,
  };
}

// ─── Delete Event ─────────────────────────────────────────────────────────────

export type DeleteEventInput = { eventId: string };

export function validateDeleteEventInput(input: unknown): DeleteEventInput {
  if (!isRecord(input)) throw new Error("delete event input must be an object");
  return { eventId: requireString(input.eventId, "eventId") };
}

// ─── Get Event ────────────────────────────────────────────────────────────────

export type GetEventInput = { eventId: string };

export function validateGetEventInput(input: unknown): GetEventInput {
  if (!isRecord(input)) throw new Error("get event input must be an object");
  return { eventId: requireString(input.eventId, "eventId") };
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${field} must be an object`);
  return value;
}
