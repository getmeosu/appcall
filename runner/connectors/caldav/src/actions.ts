import { createCalDAVClient, parseCalDAVRateLimit, isRecord } from "./http";
import {
  buildPrincipalPropfind,
  buildCalendarHomePropfind,
  buildCalendarListPropfind,
  buildCalendarQueryReport,
  buildFreeBusyReport,
  buildVEvent,
  parseVEvent,
  parseMultiStatus,
  generateUid,
} from "./dav";

// ─── Shared helpers ────────────────────────────────────────────────────────────

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function handleError(
  status: number,
  headers: Record<string, string>,
  fallbackMessage: string
): { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } } {
  const rl = parseCalDAVRateLimit(status, headers);
  if (rl.limited) {
    return { ok: false, error: { code: "CONNECTOR_RATE_LIMITED", message: "CalDAV rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
  }
  if (status === 401 || status === 403) {
    return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "CalDAV authentication failed: invalid username or password." } };
  }
  return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: fallbackMessage } };
}

function throwIfError(result: { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } }): never {
  throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
}

/** Extract injected fetch from input */
function extractFetch(input: Record<string, unknown>): typeof fetch | undefined {
  return typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
}

/** Build client options from input record */
function clientOpts(input: Record<string, unknown>, operation: string) {
  return {
    username: input.username as string,
    password: input.password as string,
    baseUrl: typeof input.baseUrl === "string" ? input.baseUrl : undefined,
    fetch: extractFetch(input),
    operation,
  };
}

// ─── principal.discover ────────────────────────────────────────────────────────

export type PrincipalDiscoverInput = { username: string; password: string; baseUrl?: string };

export function validatePrincipalDiscoverInput(input: unknown): PrincipalDiscoverInput {
  if (!isRecord(input)) throw new Error("principal.discover input must be an object");
  return {
    username: requireString(input.username, "username"),
    password: requireString(input.password, "password"),
    baseUrl: typeof input.baseUrl === "string" ? input.baseUrl : undefined,
  };
}

export async function runPrincipalDiscover(input: Record<string, unknown>, operation = "principal.discover"): Promise<{ ok: true; principalHref: string } | { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } }> {
  const payload = validatePrincipalDiscoverInput(input);
  const client = createCalDAVClient(clientOpts(input, operation));
  const response = await client.propfind("/", "0", buildPrincipalPropfind());
  if (response.status === 207 || response.status === 200) {
    const parsed = parseMultiStatus(response.body);
    let principalHref = "";
    for (const r of parsed.responses) {
      if (r.principalHref) { principalHref = r.principalHref; break; }
    }
    if (!principalHref) {
      // fallback: use well-known path with username
      principalHref = `/principals/${payload.username}/`;
    }
    return { ok: true, principalHref };
  }
  return handleError(response.status, response.headers, "CalDAV principal discovery failed.");
}

export function discoverPrincipal(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.username === "string" && typeof input.password === "string") {
    return runPrincipalDiscover(input).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "caldav", action: "principal.discover", source: "connector", principalHref: result.principalHref };
    });
  }
  return { connector: "caldav", action: "principal.discover", source: "connector", validated: validatePrincipalDiscoverInput(input) };
}

// ─── calendar_home.get ─────────────────────────────────────────────────────────

export type CalendarHomeGetInput = { username: string; password: string; baseUrl?: string; principalHref: string };

export function validateCalendarHomeGetInput(input: unknown): CalendarHomeGetInput {
  if (!isRecord(input)) throw new Error("calendar_home.get input must be an object");
  return {
    username: requireString(input.username, "username"),
    password: requireString(input.password, "password"),
    baseUrl: typeof input.baseUrl === "string" ? input.baseUrl : undefined,
    principalHref: requireString(input.principalHref, "principalHref"),
  };
}

export async function runCalendarHomeGet(input: Record<string, unknown>): Promise<{ ok: true; calendarHomeHref: string } | { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } }> {
  const payload = validateCalendarHomeGetInput(input);
  const client = createCalDAVClient(clientOpts(input, "calendar_home.get"));
  const response = await client.propfind(payload.principalHref, "0", buildCalendarHomePropfind());
  if (response.status === 207 || response.status === 200) {
    const parsed = parseMultiStatus(response.body);
    let calendarHomeHref = "";
    for (const r of parsed.responses) {
      if (r.calendarHomeHref) { calendarHomeHref = r.calendarHomeHref; break; }
    }
    return { ok: true, calendarHomeHref };
  }
  return handleError(response.status, response.headers, "CalDAV calendar home discovery failed.");
}

export function getCalendarHome(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.username === "string" && typeof input.password === "string") {
    return runCalendarHomeGet(input).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "caldav", action: "calendar_home.get", source: "connector", calendarHomeHref: result.calendarHomeHref };
    });
  }
  return { connector: "caldav", action: "calendar_home.get", source: "connector", validated: validateCalendarHomeGetInput(input) };
}

// ─── calendars.list ────────────────────────────────────────────────────────────

export type CalendarsListInput = { username: string; password: string; baseUrl?: string; calendarHomeHref: string };

export function validateCalendarsListInput(input: unknown): CalendarsListInput {
  if (!isRecord(input)) throw new Error("calendars.list input must be an object");
  return {
    username: requireString(input.username, "username"),
    password: requireString(input.password, "password"),
    baseUrl: typeof input.baseUrl === "string" ? input.baseUrl : undefined,
    calendarHomeHref: requireString(input.calendarHomeHref, "calendarHomeHref"),
  };
}

export async function runCalendarsList(input: Record<string, unknown>): Promise<{ ok: true; calendars: unknown[] } | { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } }> {
  const payload = validateCalendarsListInput(input);
  const client = createCalDAVClient(clientOpts(input, "calendars.list"));
  const response = await client.propfind(payload.calendarHomeHref, "1", buildCalendarListPropfind());
  if (response.status === 207 || response.status === 200) {
    const parsed = parseMultiStatus(response.body);
    const calendars = parsed.responses
      .filter((r) => r.isCalendar && r.href !== payload.calendarHomeHref)
      .map((r) => ({
        href: r.href,
        displayName: r.displayName ?? "",
        color: r.calendarColor ?? "",
        components: r.components ?? [],
        ctag: r.ctag ?? "",
      }));
    return { ok: true, calendars };
  }
  return handleError(response.status, response.headers, "CalDAV calendars.list failed.");
}

export function listCalendars(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.username === "string" && typeof input.password === "string") {
    return runCalendarsList(input).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "caldav", action: "calendars.list", source: "connector", calendars: result.calendars };
    });
  }
  return { connector: "caldav", action: "calendars.list", source: "connector", validated: validateCalendarsListInput(input) };
}

// ─── events.list ──────────────────────────────────────────────────────────────

export type EventsListInput = { username: string; password: string; baseUrl?: string; calendarHref: string; start?: string; end?: string };

export function validateEventsListInput(input: unknown): EventsListInput {
  if (!isRecord(input)) throw new Error("events.list input must be an object");
  return {
    username: requireString(input.username, "username"),
    password: requireString(input.password, "password"),
    baseUrl: typeof input.baseUrl === "string" ? input.baseUrl : undefined,
    calendarHref: requireString(input.calendarHref, "calendarHref"),
    start: typeof input.start === "string" ? input.start : undefined,
    end: typeof input.end === "string" ? input.end : undefined,
  };
}

export async function runEventsList(input: Record<string, unknown>): Promise<{ ok: true; events: unknown[] } | { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } }> {
  const payload = validateEventsListInput(input);
  const client = createCalDAVClient(clientOpts(input, "events.list"));
  const reportBody = buildCalendarQueryReport(payload.start, payload.end);
  const response = await client.report(payload.calendarHref, "1", reportBody);
  if (response.status === 207 || response.status === 200) {
    const parsed = parseMultiStatus(response.body);
    const events = parsed.responses
      .filter((r) => r.calendarData)
      .map((r) => {
        const vevent = parseVEvent(r.calendarData ?? "");
        return {
          href: r.href,
          etag: r.etag ?? "",
          uid: vevent.uid ?? "",
          summary: vevent.summary ?? "",
          start: vevent.start ?? "",
          end: vevent.end ?? "",
          location: vevent.location ?? "",
          description: vevent.description ?? "",
          calendarData: r.calendarData ?? "",
        };
      });
    return { ok: true, events };
  }
  return handleError(response.status, response.headers, "CalDAV events.list failed.");
}

export function listEvents(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.username === "string" && typeof input.password === "string") {
    return runEventsList(input).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "caldav", action: "events.list", source: "connector", events: result.events };
    });
  }
  return { connector: "caldav", action: "events.list", source: "connector", validated: validateEventsListInput(input) };
}

// ─── events.get ───────────────────────────────────────────────────────────────

export type EventsGetInput = { username: string; password: string; baseUrl?: string; eventHref: string };

export function validateEventsGetInput(input: unknown): EventsGetInput {
  if (!isRecord(input)) throw new Error("events.get input must be an object");
  return {
    username: requireString(input.username, "username"),
    password: requireString(input.password, "password"),
    baseUrl: typeof input.baseUrl === "string" ? input.baseUrl : undefined,
    eventHref: requireString(input.eventHref, "eventHref"),
  };
}

export async function runEventsGet(input: Record<string, unknown>): Promise<{ ok: true; uid: string; summary: string; start: string; end: string; location: string; description: string; etag: string; calendarData: string } | { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } }> {
  const payload = validateEventsGetInput(input);
  const client = createCalDAVClient(clientOpts(input, "events.get"));
  const response = await client.get(payload.eventHref);
  if (response.status === 200) {
    const vevent = parseVEvent(response.body);
    const etag = response.headers["etag"] ?? response.headers["ETag"] ?? "";
    return {
      ok: true,
      uid: vevent.uid ?? "",
      summary: vevent.summary ?? "",
      start: vevent.start ?? "",
      end: vevent.end ?? "",
      location: vevent.location ?? "",
      description: vevent.description ?? "",
      etag,
      calendarData: response.body,
    };
  }
  if (response.status === 404) {
    return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Event not found." } };
  }
  return handleError(response.status, response.headers, "CalDAV events.get failed.");
}

export function getEvent(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.username === "string" && typeof input.password === "string") {
    return runEventsGet(input).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "caldav", action: "events.get", source: "connector", uid: result.uid, summary: result.summary, start: result.start, end: result.end, location: result.location, description: result.description, etag: result.etag, calendarData: result.calendarData };
    });
  }
  return { connector: "caldav", action: "events.get", source: "connector", validated: validateEventsGetInput(input) };
}

// ─── events.create ────────────────────────────────────────────────────────────

export type EventsCreateInput = {
  username: string; password: string; baseUrl?: string;
  calendarHref: string; summary: string; start: string; end: string;
  uid?: string; description?: string; location?: string; timezone?: string; attendees?: string[];
};

export function validateEventsCreateInput(input: unknown): EventsCreateInput {
  if (!isRecord(input)) throw new Error("events.create input must be an object");
  return {
    username: requireString(input.username, "username"),
    password: requireString(input.password, "password"),
    baseUrl: typeof input.baseUrl === "string" ? input.baseUrl : undefined,
    calendarHref: requireString(input.calendarHref, "calendarHref"),
    summary: requireString(input.summary, "summary"),
    start: requireString(input.start, "start"),
    end: requireString(input.end, "end"),
    uid: typeof input.uid === "string" ? input.uid : undefined,
    description: typeof input.description === "string" ? input.description : undefined,
    location: typeof input.location === "string" ? input.location : undefined,
    timezone: typeof input.timezone === "string" ? input.timezone : undefined,
    attendees: Array.isArray(input.attendees) ? input.attendees.filter((a): a is string => typeof a === "string") : undefined,
  };
}

export async function runEventsCreate(input: Record<string, unknown>): Promise<{ ok: true; href: string; uid: string; etag: string } | { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } }> {
  const payload = validateEventsCreateInput(input);
  const uid = payload.uid ?? generateUid();
  const client = createCalDAVClient(clientOpts(input, "events.create"));
  const calendarData = buildVEvent({ uid, summary: payload.summary, start: payload.start, end: payload.end, description: payload.description, location: payload.location, timezone: payload.timezone, attendees: payload.attendees });
  const href = `${payload.calendarHref.replace(/\/$/, "")}/${uid}.ics`;
  const response = await client.putCreate(href, calendarData);
  if (response.status === 201 || response.status === 200 || response.status === 204) {
    const etag = response.headers["etag"] ?? response.headers["ETag"] ?? "";
    return { ok: true, href, uid, etag };
  }
  return handleError(response.status, response.headers, "CalDAV events.create failed.");
}

export function createEvent(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.username === "string" && typeof input.password === "string") {
    return runEventsCreate(input).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "caldav", action: "events.create", source: "connector", href: result.href, uid: result.uid, etag: result.etag };
    });
  }
  return { connector: "caldav", action: "events.create", source: "connector", validated: validateEventsCreateInput(input) };
}

// ─── events.update ────────────────────────────────────────────────────────────

export type EventsUpdateInput = {
  username: string; password: string; baseUrl?: string;
  eventHref: string; etag: string; uid: string; summary: string; start: string; end: string;
  description?: string; location?: string; timezone?: string; attendees?: string[];
};

export function validateEventsUpdateInput(input: unknown): EventsUpdateInput {
  if (!isRecord(input)) throw new Error("events.update input must be an object");
  return {
    username: requireString(input.username, "username"),
    password: requireString(input.password, "password"),
    baseUrl: typeof input.baseUrl === "string" ? input.baseUrl : undefined,
    eventHref: requireString(input.eventHref, "eventHref"),
    etag: requireString(input.etag, "etag"),
    uid: requireString(input.uid, "uid"),
    summary: requireString(input.summary, "summary"),
    start: requireString(input.start, "start"),
    end: requireString(input.end, "end"),
    description: typeof input.description === "string" ? input.description : undefined,
    location: typeof input.location === "string" ? input.location : undefined,
    timezone: typeof input.timezone === "string" ? input.timezone : undefined,
    attendees: Array.isArray(input.attendees) ? input.attendees.filter((a): a is string => typeof a === "string") : undefined,
  };
}

export async function runEventsUpdate(input: Record<string, unknown>): Promise<{ ok: true; href: string; etag: string } | { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } }> {
  const payload = validateEventsUpdateInput(input);
  const client = createCalDAVClient(clientOpts(input, "events.update"));
  const calendarData = buildVEvent({ uid: payload.uid, summary: payload.summary, start: payload.start, end: payload.end, description: payload.description, location: payload.location, timezone: payload.timezone, attendees: payload.attendees });
  const response = await client.putUpdate(payload.eventHref, payload.etag, calendarData);
  if (response.status === 201 || response.status === 200 || response.status === 204) {
    const newEtag = response.headers["etag"] ?? response.headers["ETag"] ?? "";
    return { ok: true, href: payload.eventHref, etag: newEtag };
  }
  if (response.status === 412) {
    return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "CalDAV conflict: event was modified by another client (ETag mismatch)." } };
  }
  return handleError(response.status, response.headers, "CalDAV events.update failed.");
}

export function updateEvent(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.username === "string" && typeof input.password === "string") {
    return runEventsUpdate(input).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "caldav", action: "events.update", source: "connector", href: result.href, etag: result.etag };
    });
  }
  return { connector: "caldav", action: "events.update", source: "connector", validated: validateEventsUpdateInput(input) };
}

// ─── events.delete ────────────────────────────────────────────────────────────

export type EventsDeleteInput = { username: string; password: string; baseUrl?: string; eventHref: string; etag?: string };

export function validateEventsDeleteInput(input: unknown): EventsDeleteInput {
  if (!isRecord(input)) throw new Error("events.delete input must be an object");
  return {
    username: requireString(input.username, "username"),
    password: requireString(input.password, "password"),
    baseUrl: typeof input.baseUrl === "string" ? input.baseUrl : undefined,
    eventHref: requireString(input.eventHref, "eventHref"),
    etag: typeof input.etag === "string" ? input.etag : undefined,
  };
}

export async function runEventsDelete(input: Record<string, unknown>): Promise<{ ok: true; deleted: boolean; alreadyGone: boolean } | { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } }> {
  const payload = validateEventsDeleteInput(input);
  const client = createCalDAVClient(clientOpts(input, "events.delete"));
  const response = await client.delete(payload.eventHref, payload.etag);
  if (response.status === 204 || response.status === 200) {
    return { ok: true, deleted: true, alreadyGone: false };
  }
  if (response.status === 404) {
    return { ok: true, deleted: true, alreadyGone: true };
  }
  if (response.status === 412) {
    return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "CalDAV conflict: event was modified by another client (ETag mismatch)." } };
  }
  return handleError(response.status, response.headers, "CalDAV events.delete failed.");
}

export function deleteEvent(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.username === "string" && typeof input.password === "string") {
    return runEventsDelete(input).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "caldav", action: "events.delete", source: "connector", deleted: result.deleted, alreadyGone: result.alreadyGone };
    });
  }
  return { connector: "caldav", action: "events.delete", source: "connector", validated: validateEventsDeleteInput(input) };
}

// ─── freebusy.query ───────────────────────────────────────────────────────────

export type FreeBusyQueryInput = { username: string; password: string; baseUrl?: string; href: string; start: string; end: string };

export function validateFreeBusyQueryInput(input: unknown): FreeBusyQueryInput {
  if (!isRecord(input)) throw new Error("freebusy.query input must be an object");
  return {
    username: requireString(input.username, "username"),
    password: requireString(input.password, "password"),
    baseUrl: typeof input.baseUrl === "string" ? input.baseUrl : undefined,
    href: requireString(input.href, "href"),
    start: requireString(input.start, "start"),
    end: requireString(input.end, "end"),
  };
}

export async function runFreeBusyQuery(input: Record<string, unknown>): Promise<{ ok: true; freeBusyData: string; status: number } | { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } }> {
  const payload = validateFreeBusyQueryInput(input);
  const client = createCalDAVClient(clientOpts(input, "freebusy.query"));
  const reportBody = buildFreeBusyReport(payload.start, payload.end);
  const response = await client.report(payload.href, "0", reportBody);
  if (response.status === 207 || response.status === 200) {
    return { ok: true, freeBusyData: response.body, status: response.status };
  }
  return handleError(response.status, response.headers, "CalDAV freebusy.query failed.");
}

export function queryFreeBusy(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.username === "string" && typeof input.password === "string") {
    return runFreeBusyQuery(input).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "caldav", action: "freebusy.query", source: "connector", freeBusyData: result.freeBusyData, status: result.status };
    });
  }
  return { connector: "caldav", action: "freebusy.query", source: "connector", validated: validateFreeBusyQueryInput(input) };
}
