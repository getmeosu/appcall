import { createGoogleClient, parseGoogleError, parseGoogleRateLimitMetadata, type ConnectorError } from "./http";
import type { ConnectorHttpClient } from "../../../bun/src/http";

// ─── helpers ────────────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${field} is required`);
  }
  return value;
}

function randomRequestId(): string {
  // crypto.randomUUID is available in Bun
  return crypto.randomUUID();
}

// ─── shared response handler ─────────────────────────────────────────────────

async function handleMeetResponse(
  response: { status: number; headers: Record<string, string>; body: string },
): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; error: ConnectorError }> {
  const rateLimit = parseGoogleRateLimitMetadata(response.status, response.headers);
  if (rateLimit.limited) {
    return {
      ok: false,
      error: {
        code: "CONNECTOR_RATE_LIMITED",
        message: "Google Meet / Calendar rate limit exceeded.",
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      },
    };
  }
  if (response.status === 204 || response.body.trim() === "") {
    return { ok: true, body: {} };
  }
  let body: Record<string, unknown> = {};
  try { body = JSON.parse(response.body); } catch { /* ignore */ }
  if (!isRecord(body)) body = {};
  if (response.status >= 400) {
    const parsed = parseGoogleError(body);
    return { ok: false, error: parsed ?? { code: "CONNECTOR_UPSTREAM_ERROR", message: "Google Meet / Calendar API error." } };
  }
  return { ok: true, body };
}

// ─── types ───────────────────────────────────────────────────────────────────

export type MeetEventResult =
  | {
      ok: true;
      event: {
        eventId: string;
        htmlLink: string;
        summary: string;
        status: string;
        startDateTime: string;
        endDateTime: string;
        hangoutLink: string | null;
        conferenceData: Record<string, unknown> | null;
      };
    }
  | { ok: false; error: ConnectorError };

export type MeetSpaceResult =
  | {
      ok: true;
      space: {
        name: string;
        meetingUri: string;
        meetingCode: string;
        config: Record<string, unknown> | null;
      };
    }
  | { ok: false; error: ConnectorError };

export type ConferenceRecordsListResult =
  | {
      ok: true;
      conferenceRecords: Record<string, unknown>[];
      nextPageToken: string | null;
    }
  | { ok: false; error: ConnectorError };

// ─── input types ─────────────────────────────────────────────────────────────

export type CreateMeetEventInput = {
  calendarId: string;
  summary: string;
  description?: string;
  location?: string;
  startDateTime: string;
  endDateTime: string;
  timeZone?: string;
  attendees?: string[];
  requestId?: string;
};

export type AddMeetToEventInput = {
  calendarId: string;
  eventId: string;
  requestId?: string;
};

export type CreateMeetSpaceInput = {
  config?: Record<string, unknown>;
};

export type GetMeetSpaceInput = {
  name: string;
};

export type ListConferenceRecordsInput = {
  pageSize?: number;
  pageToken?: string;
  filter?: string;
};

// ─── validators ──────────────────────────────────────────────────────────────

export function validateCreateMeetEventInput(input: unknown): CreateMeetEventInput {
  if (!isRecord(input)) throw new Error("meet.create input must be an object");
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
    requestId: typeof input.requestId === "string" ? input.requestId : undefined,
  };
}

export function validateAddMeetToEventInput(input: unknown): AddMeetToEventInput {
  if (!isRecord(input)) throw new Error("meet.add_to_event input must be an object");
  return {
    calendarId: requireString(input.calendarId, "calendarId"),
    eventId: requireString(input.eventId, "eventId"),
    requestId: typeof input.requestId === "string" ? input.requestId : undefined,
  };
}

export function validateCreateMeetSpaceInput(input: unknown): CreateMeetSpaceInput {
  if (!isRecord(input) && input !== undefined && input !== null) {
    throw new Error("meet.spaces.create input must be an object or empty");
  }
  const rec = isRecord(input) ? input : {};
  return {
    config: isRecord(rec.config) ? (rec.config as Record<string, unknown>) : undefined,
  };
}

export function validateGetMeetSpaceInput(input: unknown): GetMeetSpaceInput {
  if (!isRecord(input)) throw new Error("meet.spaces.get input must be an object");
  return {
    name: requireString(input.name, "name"),
  };
}

export function validateListConferenceRecordsInput(input: unknown): ListConferenceRecordsInput {
  const rec = isRecord(input) ? input : {};
  return {
    pageSize: typeof rec.pageSize === "number" ? rec.pageSize : undefined,
    pageToken: typeof rec.pageToken === "string" ? rec.pageToken : undefined,
    filter: typeof rec.filter === "string" ? rec.filter : undefined,
  };
}

// ─── response normalizers ─────────────────────────────────────────────────────

function normalizeMeetEventResponse(b: Record<string, unknown>): MeetEventResult["event"] {
  const start = isRecord(b.start) ? b.start : {};
  const end = isRecord(b.end) ? b.end : {};
  return {
    eventId: requireString(b.id, "id"),
    htmlLink: typeof b.htmlLink === "string" ? b.htmlLink : "",
    summary: typeof b.summary === "string" ? b.summary : "",
    status: typeof b.status === "string" ? b.status : "confirmed",
    startDateTime: typeof start.dateTime === "string" ? start.dateTime : (typeof start.date === "string" ? start.date : ""),
    endDateTime: typeof end.dateTime === "string" ? end.dateTime : (typeof end.date === "string" ? end.date : ""),
    hangoutLink: typeof b.hangoutLink === "string" ? b.hangoutLink : null,
    conferenceData: isRecord(b.conferenceData) ? (b.conferenceData as Record<string, unknown>) : null,
  };
}

function normalizeMeetSpace(b: Record<string, unknown>): MeetSpaceResult["space"] {
  return {
    name: typeof b.name === "string" ? b.name : "",
    meetingUri: typeof b.meetingUri === "string" ? b.meetingUri : "",
    meetingCode: typeof b.meetingCode === "string" ? b.meetingCode : "",
    config: isRecord(b.config) ? (b.config as Record<string, unknown>) : null,
  };
}

// ─── client ───────────────────────────────────────────────────────────────────

export type MeetClient = {
  createMeetEvent(input: unknown): Promise<MeetEventResult>;
  addMeetToEvent(input: unknown): Promise<MeetEventResult>;
  createSpace(input: unknown): Promise<MeetSpaceResult>;
  getSpace(input: unknown): Promise<MeetSpaceResult>;
  listConferenceRecords(input: unknown): Promise<ConferenceRecordsListResult>;
};

export function createMeetClient(options: {
  accessToken: string;
  fetch?: typeof fetch;
  httpClient?: ConnectorHttpClient;
}): MeetClient {
  const client = createGoogleClient({
    accessToken: options.accessToken,
    fetch: options.fetch,
    httpClient: options.httpClient,
    operation: "meet.create",
  });
  const authHeaders = { Authorization: `Bearer ${options.accessToken}` };
  const jsonHeaders = { ...authHeaders, "Content-Type": "application/json" };

  return {
    async createMeetEvent(input: unknown): Promise<MeetEventResult> {
      const p = validateCreateMeetEventInput(input);
      const reqId = p.requestId ?? randomRequestId();
      const body: Record<string, unknown> = {
        summary: p.summary,
        start: { dateTime: p.startDateTime, timeZone: p.timeZone ?? "UTC" },
        end: { dateTime: p.endDateTime, timeZone: p.timeZone ?? "UTC" },
        conferenceData: {
          createRequest: {
            requestId: reqId,
            conferenceSolutionKey: { type: "hangoutsMeet" },
          },
        },
      };
      if (p.description) body.description = p.description;
      if (p.location) body.location = p.location;
      if (p.attendees) body.attendees = p.attendees.map((email) => ({ email }));

      const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(p.calendarId)}/events?conferenceDataVersion=1`;
      const response = await client.fetchText(url, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify(body),
      });
      const res = await handleMeetResponse(response);
      if (!res.ok) return { ok: false, error: res.error };
      return { ok: true, event: normalizeMeetEventResponse(res.body) };
    },

    async addMeetToEvent(input: unknown): Promise<MeetEventResult> {
      const p = validateAddMeetToEventInput(input);
      const reqId = p.requestId ?? randomRequestId();
      const body: Record<string, unknown> = {
        conferenceData: {
          createRequest: {
            requestId: reqId,
            conferenceSolutionKey: { type: "hangoutsMeet" },
          },
        },
      };
      const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(p.calendarId)}/events/${encodeURIComponent(p.eventId)}?conferenceDataVersion=1`;
      const response = await client.fetchText(url, {
        method: "PATCH",
        headers: jsonHeaders,
        body: JSON.stringify(body),
      });
      const res = await handleMeetResponse(response);
      if (!res.ok) return { ok: false, error: res.error };
      return { ok: true, event: normalizeMeetEventResponse(res.body) };
    },

    async createSpace(input: unknown): Promise<MeetSpaceResult> {
      const p = validateCreateMeetSpaceInput(input);
      const body: Record<string, unknown> = {};
      if (p.config) body.config = p.config;
      const response = await client.fetchText("https://meet.googleapis.com/v2/spaces", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify(body),
      });
      const res = await handleMeetResponse(response);
      if (!res.ok) return { ok: false, error: res.error };
      return { ok: true, space: normalizeMeetSpace(res.body) };
    },

    async getSpace(input: unknown): Promise<MeetSpaceResult> {
      const p = validateGetMeetSpaceInput(input);
      // name can be "spaces/abc" or just "abc"; normalize to path form
      const resourceName = p.name.startsWith("spaces/") ? p.name : `spaces/${p.name}`;
      const url = `https://meet.googleapis.com/v2/${encodeURIComponent(resourceName)}`;
      const response = await client.fetchText(url, { headers: authHeaders });
      const res = await handleMeetResponse(response);
      if (!res.ok) return { ok: false, error: res.error };
      return { ok: true, space: normalizeMeetSpace(res.body) };
    },

    async listConferenceRecords(input: unknown): Promise<ConferenceRecordsListResult> {
      const p = validateListConferenceRecordsInput(input);
      const params = new URLSearchParams();
      if (p.pageSize !== undefined) params.set("pageSize", String(p.pageSize));
      if (p.pageToken) params.set("pageToken", p.pageToken);
      if (p.filter) params.set("filter", p.filter);
      const query = params.toString();
      const url = `https://meet.googleapis.com/v2/conferenceRecords${query ? `?${query}` : ""}`;
      const response = await client.fetchText(url, { headers: authHeaders });
      const res = await handleMeetResponse(response);
      if (!res.ok) return { ok: false, error: res.error };
      const records = Array.isArray(res.body.conferenceRecords)
        ? res.body.conferenceRecords.filter(isRecord)
        : [];
      const nextPageToken =
        typeof res.body.nextPageToken === "string" && res.body.nextPageToken.length > 0
          ? res.body.nextPageToken
          : null;
      return { ok: true, conferenceRecords: records, nextPageToken };
    },
  };
}

// ─── dual-mode action handlers ────────────────────────────────────────────────

function isRecord2(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function throwConnectorError(result: {
  ok: false;
  error: ConnectorError;
}): never {
  throw {
    ok: false,
    code: result.error.code,
    message: result.error.message,
    retryAfterSeconds: result.error.retryAfterSeconds,
    providerError: result.error.providerError,
  };
}

export function createMeetEvent(
  input: unknown,
): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord2(input) && typeof input.accessToken === "string") {
    return createMeetClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? (input.fetch as typeof fetch) : undefined,
    })
      .createMeetEvent(input)
      .then((result) => {
        if (!result.ok) throwConnectorError(result);
        return {
          connector: "google-workspace",
          action: "meet.create",
          source: "connector",
          ...result.event,
        };
      });
  }
  return {
    connector: "google-workspace",
    action: "meet.create",
    source: "connector",
    validated: validateCreateMeetEventInput(input),
  };
}

export function addMeetToEvent(
  input: unknown,
): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord2(input) && typeof input.accessToken === "string") {
    return createMeetClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? (input.fetch as typeof fetch) : undefined,
    })
      .addMeetToEvent(input)
      .then((result) => {
        if (!result.ok) throwConnectorError(result);
        return {
          connector: "google-workspace",
          action: "meet.add_to_event",
          source: "connector",
          ...result.event,
        };
      });
  }
  return {
    connector: "google-workspace",
    action: "meet.add_to_event",
    source: "connector",
    validated: validateAddMeetToEventInput(input),
  };
}

export function createMeetSpace(
  input: unknown,
): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord2(input) && typeof input.accessToken === "string") {
    return createMeetClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? (input.fetch as typeof fetch) : undefined,
    })
      .createSpace(input)
      .then((result) => {
        if (!result.ok) throwConnectorError(result);
        return {
          connector: "google-workspace",
          action: "meet.spaces.create",
          source: "connector",
          ...result.space,
        };
      });
  }
  return {
    connector: "google-workspace",
    action: "meet.spaces.create",
    source: "connector",
    validated: validateCreateMeetSpaceInput(input),
  };
}

export function getMeetSpace(
  input: unknown,
): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord2(input) && typeof input.accessToken === "string") {
    return createMeetClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? (input.fetch as typeof fetch) : undefined,
    })
      .getSpace(input)
      .then((result) => {
        if (!result.ok) throwConnectorError(result);
        return {
          connector: "google-workspace",
          action: "meet.spaces.get",
          source: "connector",
          ...result.space,
        };
      });
  }
  return {
    connector: "google-workspace",
    action: "meet.spaces.get",
    source: "connector",
    validated: validateGetMeetSpaceInput(input),
  };
}

export function listConferenceRecords(
  input: unknown,
): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord2(input) && typeof input.accessToken === "string") {
    return createMeetClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? (input.fetch as typeof fetch) : undefined,
    })
      .listConferenceRecords(input)
      .then((result) => {
        if (!result.ok) throwConnectorError(result);
        return {
          connector: "google-workspace",
          action: "meet.conference_records.list",
          source: "connector",
          conferenceRecords: result.conferenceRecords,
          nextPageToken: result.nextPageToken,
        };
      });
  }
  return {
    connector: "google-workspace",
    action: "meet.conference_records.list",
    source: "connector",
    validated: validateListConferenceRecordsInput(input),
  };
}
