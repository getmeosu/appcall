import { createGoogleClient, parseGoogleError, parseGoogleRateLimitMetadata, parseNextPageToken, type ConnectorError } from "./http";
import type { ConnectorHttpClient } from "../../../bun/src/http";

export type CalendarEvent = {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  created?: string;
  updated?: string;
  start?: Record<string, unknown>;
  end?: Record<string, unknown>;
  creator?: Record<string, unknown>;
  organizer?: Record<string, unknown>;
  attendees?: Record<string, unknown>[];
  [key: string]: unknown;
};

export type NormalizedEvent = {
  id: string;
  provider: "google-workspace";
  providerEventId: string;
  summary: string;
  description: string;
  location: string;
  startTime: string;
  endTime: string;
  status: string;
  htmlLink: string;
  modelVersion: "2026-05-16";
  raw: CalendarEvent;
};

export function normalizeCalendarEvent(event: CalendarEvent): NormalizedEvent {
  const startTime = extractTime(event.start);
  const endTime = extractTime(event.end);

  return {
    id: `gcal:${event.id}`,
    provider: "google-workspace",
    providerEventId: event.id,
    summary: event.summary ?? "",
    description: event.description ?? "",
    location: event.location ?? "",
    startTime,
    endTime,
    status: event.status ?? "confirmed",
    htmlLink: event.htmlLink ?? "",
    modelVersion: "2026-05-16",
    raw: event,
  };
}

export function parseEventsListResponse(response: unknown): { events: CalendarEvent[]; nextPageToken: string | null } {
  if (!isRecord(response)) {
    return { events: [], nextPageToken: null };
  }
  const rawItems = response.items;
  if (!Array.isArray(rawItems)) {
    return { events: [], nextPageToken: parseNextPageToken(response) };
  }
  return {
    events: rawItems.filter(isRecord).map((e) => ({
      id: requireString(e.id, "id"),
      status: typeof e.status === "string" ? e.status : undefined,
      summary: typeof e.summary === "string" ? e.summary : undefined,
      description: typeof e.description === "string" ? e.description : undefined,
      location: typeof e.location === "string" ? e.location : undefined,
      htmlLink: typeof e.htmlLink === "string" ? e.htmlLink : undefined,
      created: typeof e.created === "string" ? e.created : undefined,
      updated: typeof e.updated === "string" ? e.updated : undefined,
      start: isRecord(e.start) ? e.start : undefined,
      end: isRecord(e.end) ? e.end : undefined,
      creator: isRecord(e.creator) ? e.creator : undefined,
      organizer: isRecord(e.organizer) ? e.organizer : undefined,
      attendees: Array.isArray(e.attendees) ? e.attendees.filter(isRecord) : undefined,
    })),
    nextPageToken: parseNextPageToken(response),
  };
}

function extractTime(timeObj?: Record<string, unknown>): string {
  if (!timeObj) return "";
  if (typeof timeObj.dateTime === "string") return timeObj.dateTime;
  if (typeof timeObj.date === "string") return timeObj.date;
  return "";
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${field} is required`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// =====================================================================
// Action operations: calendar.events.create/update/delete/get, calendar.calendars.list
// =====================================================================

export type CreateEventInput = {
  calendarId: string;
  summary: string;
  description?: string;
  location?: string;
  startDateTime: string;
  endDateTime: string;
  timeZone?: string;
  attendees?: string[];
};

export type UpdateEventInput = {
  calendarId: string;
  eventId: string;
  summary?: string;
  description?: string;
  location?: string;
  startDateTime?: string;
  endDateTime?: string;
  timeZone?: string;
};

export type DeleteEventInput = {
  calendarId: string;
  eventId: string;
};

export type GetEventInput = {
  calendarId: string;
  eventId: string;
};

export type CalendarEventActionResult =
  | { ok: true; event: { eventId: string; htmlLink: string; summary: string; status: string; startDateTime: string; endDateTime: string; description?: string; location?: string } }
  | { ok: false; error: ConnectorError };

export type DeleteEventResult =
  | { ok: true; deleted: boolean; eventId: string }
  | { ok: false; error: ConnectorError };

export type CalendarListResult =
  | { ok: true; calendars: Array<{ id: string; summary: string; description?: string; primary?: boolean; accessRole?: string }> }
  | { ok: false; error: ConnectorError };

export function validateCreateEventInput(input: unknown): CreateEventInput {
  if (!isRecord(input)) throw new Error("create event input must be an object");
  return {
    calendarId: requireString(input.calendarId, "calendarId"),
    summary: requireString(input.summary, "summary"),
    description: typeof input.description === "string" ? input.description : undefined,
    location: typeof input.location === "string" ? input.location : undefined,
    startDateTime: requireString(input.startDateTime, "startDateTime"),
    endDateTime: requireString(input.endDateTime, "endDateTime"),
    timeZone: typeof input.timeZone === "string" ? input.timeZone : undefined,
    attendees: Array.isArray(input.attendees)
      ? input.attendees.filter((a): a is string => typeof a === "string")
      : undefined,
  };
}

export function validateUpdateEventInput(input: unknown): UpdateEventInput {
  if (!isRecord(input)) throw new Error("update event input must be an object");
  return {
    calendarId: requireString(input.calendarId, "calendarId"),
    eventId: requireString(input.eventId, "eventId"),
    summary: typeof input.summary === "string" ? input.summary : undefined,
    description: typeof input.description === "string" ? input.description : undefined,
    location: typeof input.location === "string" ? input.location : undefined,
    startDateTime: typeof input.startDateTime === "string" ? input.startDateTime : undefined,
    endDateTime: typeof input.endDateTime === "string" ? input.endDateTime : undefined,
    timeZone: typeof input.timeZone === "string" ? input.timeZone : undefined,
  };
}

export function validateDeleteEventInput(input: unknown): DeleteEventInput {
  if (!isRecord(input)) throw new Error("delete event input must be an object");
  return {
    calendarId: requireString(input.calendarId, "calendarId"),
    eventId: requireString(input.eventId, "eventId"),
  };
}

export function validateGetEventInput(input: unknown): GetEventInput {
  if (!isRecord(input)) throw new Error("get event input must be an object");
  return {
    calendarId: requireString(input.calendarId, "calendarId"),
    eventId: requireString(input.eventId, "eventId"),
  };
}

function normalizeEventResponse(b: Record<string, unknown>): CalendarEventActionResult["event"] | null {
  if (typeof b.id !== "string" || b.id.length === 0) return null;
  const start = isRecord(b.start) ? b.start : {};
  const end = isRecord(b.end) ? b.end : {};
  return {
    eventId: b.id,
    htmlLink: typeof b.htmlLink === "string" ? b.htmlLink : "",
    summary: typeof b.summary === "string" ? b.summary : "",
    status: typeof b.status === "string" ? b.status : "confirmed",
    startDateTime: typeof start.dateTime === "string" ? start.dateTime : (typeof start.date === "string" ? start.date : ""),
    endDateTime: typeof end.dateTime === "string" ? end.dateTime : (typeof end.date === "string" ? end.date : ""),
    description: typeof b.description === "string" ? b.description : undefined,
    location: typeof b.location === "string" ? b.location : undefined,
  };
}

async function handleCalendarResponse(response: { status: number; headers: Record<string, string>; body: string }): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; error: ConnectorError }> {
  const rateLimit = parseGoogleRateLimitMetadata(response.status, response.headers);
  if (rateLimit.limited) {
    return { ok: false, error: { code: "CONNECTOR_RATE_LIMITED", message: "Calendar rate limit exceeded.", retryAfterSeconds: rateLimit.retryAfterSeconds } };
  }
  let body: Record<string, unknown> = {};
  try { body = JSON.parse(response.body); } catch { /* ignore */ }
  if (!isRecord(body)) body = {};
  if (response.status >= 400) {
    const parsed = parseGoogleError(body);
    return { ok: false, error: parsed ?? { code: "CONNECTOR_UPSTREAM_ERROR", message: "Calendar API error." } };
  }
  if (response.status === 204 || response.body.trim() === "") {
    return { ok: true, body: {} };
  }
  return { ok: true, body };
}

function incompleteCalendarResponse(resource: string): ConnectorError {
  return { code: "CONNECTOR_UPSTREAM_ERROR", message: `Google Calendar API returned an incomplete ${resource} response.` };
}

export type CalendarActionsClient = {
  createEvent(input: unknown): Promise<CalendarEventActionResult>;
  updateEvent(input: unknown): Promise<CalendarEventActionResult>;
  deleteEvent(input: unknown): Promise<DeleteEventResult>;
  getEvent(input: unknown): Promise<CalendarEventActionResult>;
  listCalendars(input: unknown): Promise<CalendarListResult>;
};

export function createCalendarActionsClient(options: { accessToken: string; fetch?: typeof fetch; httpClient?: ConnectorHttpClient }): CalendarActionsClient {
  const client = createGoogleClient({ accessToken: options.accessToken, fetch: options.fetch, httpClient: options.httpClient, operation: "calendar.events.create" });
  const authHeaders = { Authorization: `Bearer ${options.accessToken}` };
  const jsonHeaders = { ...authHeaders, "Content-Type": "application/json" };

  return {
    async createEvent(input: unknown): Promise<CalendarEventActionResult> {
      const p = validateCreateEventInput(input);
      const body: Record<string, unknown> = {
        summary: p.summary,
        start: { dateTime: p.startDateTime, timeZone: p.timeZone ?? "UTC" },
        end: { dateTime: p.endDateTime, timeZone: p.timeZone ?? "UTC" },
      };
      if (p.description) body.description = p.description;
      if (p.location) body.location = p.location;
      if (p.attendees) body.attendees = p.attendees.map((email) => ({ email }));
      const response = await client.fetchText(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(p.calendarId)}/events`,
        { method: "POST", headers: jsonHeaders, body: JSON.stringify(body) },
      );
      const res = await handleCalendarResponse(response);
      if (!res.ok) return { ok: false, error: res.error };
      const event = normalizeEventResponse(res.body);
      return event ? { ok: true, event } : { ok: false, error: incompleteCalendarResponse("event") };
    },

    async updateEvent(input: unknown): Promise<CalendarEventActionResult> {
      const p = validateUpdateEventInput(input);
      const body: Record<string, unknown> = {};
      if (p.summary !== undefined) body.summary = p.summary;
      if (p.description !== undefined) body.description = p.description;
      if (p.location !== undefined) body.location = p.location;
      if (p.startDateTime !== undefined) body.start = { dateTime: p.startDateTime, timeZone: p.timeZone ?? "UTC" };
      if (p.endDateTime !== undefined) body.end = { dateTime: p.endDateTime, timeZone: p.timeZone ?? "UTC" };
      const response = await client.fetchText(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(p.calendarId)}/events/${encodeURIComponent(p.eventId)}`,
        { method: "PATCH", headers: jsonHeaders, body: JSON.stringify(body) },
      );
      const res = await handleCalendarResponse(response);
      if (!res.ok) return { ok: false, error: res.error };
      const event = normalizeEventResponse(res.body);
      return event ? { ok: true, event } : { ok: false, error: incompleteCalendarResponse("event") };
    },

    async deleteEvent(input: unknown): Promise<DeleteEventResult> {
      const p = validateDeleteEventInput(input);
      const response = await client.fetchText(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(p.calendarId)}/events/${encodeURIComponent(p.eventId)}`,
        { method: "DELETE", headers: authHeaders },
      );
      const rateLimit = parseGoogleRateLimitMetadata(response.status, response.headers);
      if (rateLimit.limited) {
        return { ok: false, error: { code: "CONNECTOR_RATE_LIMITED", message: "Calendar rate limit exceeded.", retryAfterSeconds: rateLimit.retryAfterSeconds } };
      }
      if (response.status === 204 || response.status === 200) {
        return { ok: true, deleted: true, eventId: p.eventId };
      }
      let body: Record<string, unknown> = {};
      try { body = JSON.parse(response.body); } catch { /* ignore */ }
      if (!isRecord(body)) body = {};
      const parsed = parseGoogleError(body);
      return { ok: false, error: parsed ?? { code: "CONNECTOR_UPSTREAM_ERROR", message: "Calendar API error deleting event." } };
    },

    async getEvent(input: unknown): Promise<CalendarEventActionResult> {
      const p = validateGetEventInput(input);
      const response = await client.fetchText(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(p.calendarId)}/events/${encodeURIComponent(p.eventId)}`,
        { headers: authHeaders },
      );
      const res = await handleCalendarResponse(response);
      if (!res.ok) return { ok: false, error: res.error };
      const event = normalizeEventResponse(res.body);
      return event ? { ok: true, event } : { ok: false, error: incompleteCalendarResponse("event") };
    },

    async listCalendars(_input: unknown): Promise<CalendarListResult> {
      const response = await client.fetchText(
        "https://www.googleapis.com/calendar/v3/users/me/calendarList",
        { headers: authHeaders },
      );
      const res = await handleCalendarResponse(response);
      if (!res.ok) return { ok: false, error: res.error };
      const items = Array.isArray(res.body.items) ? res.body.items.filter(isRecord) : [];
      return {
        ok: true,
        calendars: items.map((c) => ({
          id: typeof c.id === "string" ? c.id : "",
          summary: typeof c.summary === "string" ? c.summary : "",
          description: typeof c.description === "string" ? c.description : undefined,
          primary: typeof c.primary === "boolean" ? c.primary : undefined,
          accessRole: typeof c.accessRole === "string" ? c.accessRole : undefined,
        })),
      };
    },
  };
}
