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
