import { createGoogleMeetClient, parseGoogleRateLimit, googleErrorDetail, isRecord, extractFetch } from "./http";
import { normalizeMeeting, parseMeetingsResponse } from "./objects";

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function fail(status: number, headers: Record<string, string>, body: unknown, fallback: string): never {
  const rl = parseGoogleRateLimit(status, headers);
  if (rl.limited) {
    throw { ok: false, code: "CONNECTOR_RATE_LIMITED", message: "Google Meet rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds };
  }
  throw { ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message: googleErrorDetail(body, fallback) };
}

function encodeMeetingId(meetingId: string): string {
  return encodeURIComponent(meetingId);
}

// ─── meetings.create ─────────────────────────────────────────────────────────

export type CreateMeetingInput = { summary: string; start: string; end: string; description?: string; attendees?: string[] };

export function validateCreateMeetingInput(input: unknown): CreateMeetingInput {
  if (!isRecord(input)) throw new Error("meetings.create input must be an object");
  let attendees: string[] | undefined;
  if (input.attendees !== undefined) {
    if (!Array.isArray(input.attendees) || !input.attendees.every((a) => typeof a === "string" && a.length > 0)) {
      throw new Error("attendees must be an array of email strings");
    }
    attendees = input.attendees as string[];
  }
  return {
    summary: requireString(input.summary, "summary"),
    start: requireString(input.start, "start"),
    end: requireString(input.end, "end"),
    description: typeof input.description === "string" ? input.description : undefined,
    attendees,
  };
}

export function createMeeting(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const payload = validateCreateMeetingInput(input);
    const client = createGoogleMeetClient({ accessToken: input.accessToken, fetch: extractFetch(input), operation: "meetings.create" });
    const body = JSON.stringify({
      summary: payload.summary,
      description: payload.description,
      start: { dateTime: payload.start },
      end: { dateTime: payload.end },
      ...(payload.attendees ? { attendees: payload.attendees.map((email) => ({ email })) } : {}),
      conferenceData: { createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } } },
    });
    // sendUpdates=all so Google emails calendar invites to attendees.
    return client.fetchJSON("/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all", { method: "POST", body }).then((res) => {
      if (res.status >= 200 && res.status < 300 && isRecord(res.body)) {
        return { connector: "googlemeet", action: "meetings.create", source: "provider", meeting: normalizeMeeting(res.body) };
      }
      fail(res.status, res.headers, res.body, "Google Meet could not create the meeting.");
    });
  }
  return { connector: "googlemeet", action: "meetings.create", source: "connector", validated: validateCreateMeetingInput(input) };
}

// ─── meetings.list ───────────────────────────────────────────────────────────

export function listMeetings(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const client = createGoogleMeetClient({ accessToken: input.accessToken, fetch: extractFetch(input), operation: "meetings.list" });
    const maxResults = typeof input.maxResults === "number" && input.maxResults > 0 ? Math.floor(input.maxResults) : 50;
    const timeMin = encodeURIComponent(new Date().toISOString());
    return client.fetchJSON(`/calendars/primary/events?maxResults=${maxResults}&singleEvents=true&orderBy=startTime&timeMin=${timeMin}`, { method: "GET" }).then((res) => {
      if (res.status >= 200 && res.status < 300) {
        return { connector: "googlemeet", action: "meetings.list", source: "provider", meetings: parseMeetingsResponse(res.body).meetings };
      }
      fail(res.status, res.headers, res.body, "Google Meet could not list meetings.");
    });
  }
  return { connector: "googlemeet", action: "meetings.list", source: "connector", validated: {} };
}

// ─── meetings.get ────────────────────────────────────────────────────────────

export function validateGetMeetingInput(input: unknown): { meetingId: string } {
  if (!isRecord(input)) throw new Error("meetings.get input must be an object");
  return { meetingId: requireString(input.meetingId, "meetingId") };
}

export function getMeeting(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const payload = validateGetMeetingInput(input);
    const client = createGoogleMeetClient({ accessToken: input.accessToken, fetch: extractFetch(input), operation: "meetings.get" });
    return client.fetchJSON(`/calendars/primary/events/${encodeMeetingId(payload.meetingId)}`, { method: "GET" }).then((res) => {
      if (res.status >= 200 && res.status < 300 && isRecord(res.body)) {
        return { connector: "googlemeet", action: "meetings.get", source: "provider", meeting: normalizeMeeting(res.body) };
      }
      fail(res.status, res.headers, res.body, "Google Meet could not get the meeting.");
    });
  }
  return { connector: "googlemeet", action: "meetings.get", source: "connector", validated: validateGetMeetingInput(input) };
}

// ─── meetings.update ─────────────────────────────────────────────────────────

export type UpdateMeetingInput = {
  meetingId: string;
  summary?: string;
  start?: string;
  end?: string;
  description?: string;
  attendees?: string[];
};

export function validateUpdateMeetingInput(input: unknown): UpdateMeetingInput {
  if (!isRecord(input)) throw new Error("meetings.update input must be an object");
  const payload: UpdateMeetingInput = {
    meetingId: requireString(input.meetingId, "meetingId"),
  };
  if (typeof input.summary === "string") payload.summary = input.summary;
  if (typeof input.start === "string") payload.start = input.start;
  if (typeof input.end === "string") payload.end = input.end;
  if (typeof input.description === "string") payload.description = input.description;
  if (input.attendees !== undefined) {
    if (!Array.isArray(input.attendees) || !input.attendees.every((a) => typeof a === "string" && a.length > 0)) {
      throw new Error("attendees must be an array of email strings");
    }
    payload.attendees = input.attendees as string[];
  }
  return payload;
}

export function updateMeeting(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const payload = validateUpdateMeetingInput(input);
    const client = createGoogleMeetClient({ accessToken: input.accessToken, fetch: extractFetch(input), operation: "meetings.update" });
    const body: Record<string, unknown> = {};
    if (payload.summary !== undefined) body.summary = payload.summary;
    if (payload.description !== undefined) body.description = payload.description;
    if (payload.start !== undefined) body.start = { dateTime: payload.start };
    if (payload.end !== undefined) body.end = { dateTime: payload.end };
    if (payload.attendees !== undefined) body.attendees = payload.attendees.map((email) => ({ email }));
    return client
      .fetchJSON(`/calendars/primary/events/${encodeMeetingId(payload.meetingId)}?conferenceDataVersion=1&sendUpdates=all`, {
        method: "PATCH",
        body: JSON.stringify(body),
      })
      .then((res) => {
        if (res.status >= 200 && res.status < 300 && isRecord(res.body)) {
          return { connector: "googlemeet", action: "meetings.update", source: "provider", meeting: normalizeMeeting(res.body) };
        }
        fail(res.status, res.headers, res.body, "Google Meet could not update the meeting.");
      });
  }
  return { connector: "googlemeet", action: "meetings.update", source: "connector", validated: validateUpdateMeetingInput(input) };
}

// ─── meetings.delete ─────────────────────────────────────────────────────────

export function validateDeleteMeetingInput(input: unknown): { meetingId: string } {
  if (!isRecord(input)) throw new Error("meetings.delete input must be an object");
  return { meetingId: requireString(input.meetingId, "meetingId") };
}

export function deleteMeeting(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const payload = validateDeleteMeetingInput(input);
    const client = createGoogleMeetClient({ accessToken: input.accessToken, fetch: extractFetch(input), operation: "meetings.delete" });
    return client
      .fetchJSON(`/calendars/primary/events/${encodeMeetingId(payload.meetingId)}?sendUpdates=all`, { method: "DELETE" })
      .then((res) => {
        // Calendar API returns 204 No Content on successful delete.
        if (res.status === 204 || res.status === 200) {
          return { connector: "googlemeet", action: "meetings.delete", source: "provider", deleted: true, meetingId: payload.meetingId };
        }
        fail(res.status, res.headers, res.body, "Google Meet could not delete the meeting.");
      });
  }
  return { connector: "googlemeet", action: "meetings.delete", source: "connector", validated: validateDeleteMeetingInput(input) };
}
