import { createGraphClient, parseGraphRateLimit, type GraphClient } from "./http";
import { normalizeCalendarEvent, type CalendarEvent } from "./events";
import { assertNoTraversalSegment, encodePathSegment } from "../../_shared/jobboard";

// ─── Types ────────────────────────────────────────────────────────────────────

export type OnlineMeeting = {
  id: string;
  subject?: string;
  startDateTime?: string;
  endDateTime?: string;
  joinWebUrl?: string;
  joinInformation?: { content?: string; contentType?: string };
  audioConferencing?: Record<string, unknown>;
  chatInfo?: Record<string, unknown>;
  organizer?: Record<string, unknown>;
  creationDateTime?: string;
  [key: string]: unknown;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function parseMeeting(raw: unknown): OnlineMeeting {
  if (!isRecord(raw)) throw new Error("meeting response must be an object");
  return {
    id: typeof raw.id === "string" ? raw.id : "",
    subject: typeof raw.subject === "string" ? raw.subject : undefined,
    startDateTime: typeof raw.startDateTime === "string" ? raw.startDateTime : undefined,
    endDateTime: typeof raw.endDateTime === "string" ? raw.endDateTime : undefined,
    joinWebUrl: typeof raw.joinWebUrl === "string" ? raw.joinWebUrl : undefined,
    joinInformation: isRecord(raw.joinInformation) ? raw.joinInformation as { content?: string; contentType?: string } : undefined,
    audioConferencing: isRecord(raw.audioConferencing) ? (raw.audioConferencing as Record<string, unknown>) : undefined,
    chatInfo: isRecord(raw.chatInfo) ? (raw.chatInfo as Record<string, unknown>) : undefined,
    organizer: isRecord(raw.organizer) ? (raw.organizer as Record<string, unknown>) : undefined,
    creationDateTime: typeof raw.creationDateTime === "string" ? raw.creationDateTime : undefined,
  };
}

// ─── Input Validation ─────────────────────────────────────────────────────────

export type CreateMeetingInput = {
  subject: string;
  startDateTime: string;
  endDateTime: string;
  userId?: string;
};

export function validateCreateMeetingInput(input: unknown): CreateMeetingInput {
  if (!isRecord(input)) throw new Error("create meeting input must be an object");
  return {
    subject: requireString(input.subject, "subject"),
    startDateTime: requireString(input.startDateTime, "startDateTime"),
    endDateTime: requireString(input.endDateTime, "endDateTime"),
    userId: optionalUserId(input.userId),
  };
}

export type GetMeetingInput = {
  meetingId: string;
  userId?: string;
};

export function validateGetMeetingInput(input: unknown): GetMeetingInput {
  if (!isRecord(input)) throw new Error("get meeting input must be an object");
  return {
    meetingId: requireString(input.meetingId, "meetingId"),
    userId: optionalUserId(input.userId),
  };
}

export type UpdateMeetingInput = {
  meetingId: string;
  subject?: string;
  startDateTime?: string;
  endDateTime?: string;
  userId?: string;
};

export function validateUpdateMeetingInput(input: unknown): UpdateMeetingInput {
  if (!isRecord(input)) throw new Error("update meeting input must be an object");
  return {
    meetingId: requireString(input.meetingId, "meetingId"),
    subject: typeof input.subject === "string" ? input.subject : undefined,
    startDateTime: typeof input.startDateTime === "string" ? input.startDateTime : undefined,
    endDateTime: typeof input.endDateTime === "string" ? input.endDateTime : undefined,
    userId: optionalUserId(input.userId),
  };
}

export type DeleteMeetingInput = {
  meetingId: string;
  userId?: string;
};

export function validateDeleteMeetingInput(input: unknown): DeleteMeetingInput {
  if (!isRecord(input)) throw new Error("delete meeting input must be an object");
  return {
    meetingId: requireString(input.meetingId, "meetingId"),
    userId: optionalUserId(input.userId),
  };
}

export type GetMeetingByJoinUrlInput = {
  joinWebUrl: string;
  userId?: string;
};

export function validateGetMeetingByJoinUrlInput(input: unknown): GetMeetingByJoinUrlInput {
  if (!isRecord(input)) throw new Error("get meeting by join URL input must be an object");
  return {
    joinWebUrl: requireString(input.joinWebUrl, "joinWebUrl"),
    userId: optionalUserId(input.userId),
  };
}

export type CreateCalendarTeamsEventInput = {
  subject: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  body?: string;
  location?: string;
  attendees?: string[];
  userId?: string;
};

export function validateCreateCalendarTeamsEventInput(input: unknown): CreateCalendarTeamsEventInput {
  if (!isRecord(input)) throw new Error("create calendar teams event input must be an object");
  const subject = requireString(input.subject, "subject");
  if (!isRecord(input.start)) throw new Error("start must be an object");
  if (!isRecord(input.end)) throw new Error("end must be an object");
  return {
    subject,
    start: {
      dateTime: requireString(input.start.dateTime, "start.dateTime"),
      timeZone: requireString(input.start.timeZone, "start.timeZone"),
    },
    end: {
      dateTime: requireString(input.end.dateTime, "end.dateTime"),
      timeZone: requireString(input.end.timeZone, "end.timeZone"),
    },
    body: typeof input.body === "string" ? input.body : undefined,
    location: typeof input.location === "string" ? input.location : undefined,
    attendees: Array.isArray(input.attendees) ? (input.attendees as unknown[]).filter((a): a is string => typeof a === "string") : undefined,
    userId: optionalUserId(input.userId),
  };
}

// ─── Teams Meetings Client ────────────────────────────────────────────────────

// SEC-PATH-2c: only an omitted userId means the signed-in user (/me). A present
// value (including "" or whitespace) must be a real user id or UPN; before this,
// teams_meetings.delete with userId "" acted on the caller's own meetings.
function optionalUserId(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  return assertNoTraversalSegment(value, "userId");
}

function meetingsBasePath(userId?: string): string {
  return userId !== undefined ? `/v1.0/users/${encodePathSegment(userId, "userId")}/onlineMeetings` : "/v1.0/me/onlineMeetings";
}

function eventsBasePath(userId?: string): string {
  return userId !== undefined ? `/v1.0/users/${encodePathSegment(userId, "userId")}/events` : "/v1.0/me/events";
}

export function createTeamsMeetingsClient(options: { accessToken: string; fetch?: typeof fetch; graphClient?: GraphClient }) {
  const client = options.graphClient ?? createGraphClient({ accessToken: options.accessToken, fetch: options.fetch, operation: "teams_meetings.create" });

  return {
    async create(input: unknown) {
      const payload = validateCreateMeetingInput(input);
      const basePath = meetingsBasePath(payload.userId);
      const body: Record<string, unknown> = {
        subject: payload.subject,
        startDateTime: payload.startDateTime,
        endDateTime: payload.endDateTime,
      };

      const response = await client.fetchJSON(basePath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (response.status === 201) {
        const meeting = parseMeeting(response.body);
        return { ok: true as const, meeting };
      }
      if (response.status === 429) {
        const rl = parseGraphRateLimit(response.status, response.headers);
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "Graph rate limit exceeded.", retryAfterSeconds: rl.limited ? rl.retryAfterSeconds : undefined } };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Graph rejected the create meeting request." } };
    },

    async get(input: unknown) {
      const payload = validateGetMeetingInput(input);
      const basePath = meetingsBasePath(payload.userId);

      const response = await client.fetchJSON(`${basePath}/${encodePathSegment(payload.meetingId, "meetingId")}`);

      if (response.status === 200) {
        const meeting = parseMeeting(response.body);
        return { ok: true as const, meeting };
      }
      if (response.status === 429) {
        const rl = parseGraphRateLimit(response.status, response.headers);
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "Graph rate limit exceeded.", retryAfterSeconds: rl.limited ? rl.retryAfterSeconds : undefined } };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Graph rejected the get meeting request." } };
    },

    async update(input: unknown) {
      const payload = validateUpdateMeetingInput(input);
      const basePath = meetingsBasePath(payload.userId);
      const body: Record<string, unknown> = {};
      if (payload.subject !== undefined) body.subject = payload.subject;
      if (payload.startDateTime !== undefined) body.startDateTime = payload.startDateTime;
      if (payload.endDateTime !== undefined) body.endDateTime = payload.endDateTime;

      const response = await client.fetchJSON(`${basePath}/${encodePathSegment(payload.meetingId, "meetingId")}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (response.status === 200) {
        const meeting = parseMeeting(response.body);
        return { ok: true as const, meeting };
      }
      if (response.status === 429) {
        const rl = parseGraphRateLimit(response.status, response.headers);
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "Graph rate limit exceeded.", retryAfterSeconds: rl.limited ? rl.retryAfterSeconds : undefined } };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Graph rejected the update meeting request." } };
    },

    async delete(input: unknown) {
      const payload = validateDeleteMeetingInput(input);
      const basePath = meetingsBasePath(payload.userId);

      const response = await client.fetchJSON(`${basePath}/${encodePathSegment(payload.meetingId, "meetingId")}`, {
        method: "DELETE",
      });

      if (response.status === 204) return { ok: true as const };
      if (response.status === 429) {
        const rl = parseGraphRateLimit(response.status, response.headers);
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "Graph rate limit exceeded.", retryAfterSeconds: rl.limited ? rl.retryAfterSeconds : undefined } };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Graph rejected the delete meeting request." } };
    },

    async getByJoinUrl(input: unknown) {
      const payload = validateGetMeetingByJoinUrlInput(input);
      const basePath = meetingsBasePath(payload.userId);
      const filter = `JoinWebUrl eq '${payload.joinWebUrl}'`;
      const path = `${basePath}?$filter=${encodeURIComponent(filter)}`;

      const response = await client.fetchJSON(path);

      if (response.status === 200) {
        if (isRecord(response.body) && Array.isArray(response.body.value)) {
          const meetings = (response.body.value as unknown[]).map(parseMeeting);
          return { ok: true as const, meetings };
        }
        return { ok: true as const, meetings: [] };
      }
      if (response.status === 429) {
        const rl = parseGraphRateLimit(response.status, response.headers);
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "Graph rate limit exceeded.", retryAfterSeconds: rl.limited ? rl.retryAfterSeconds : undefined } };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Graph rejected the get meeting by join URL request." } };
    },

    async createCalendarTeamsEvent(input: unknown) {
      const payload = validateCreateCalendarTeamsEventInput(input);
      const basePath = eventsBasePath(payload.userId);
      const body: Record<string, unknown> = {
        subject: payload.subject,
        start: payload.start,
        end: payload.end,
        isOnlineMeeting: true,
        onlineMeetingProvider: "teamsForBusiness",
      };
      if (payload.body) body.body = { contentType: "text", content: payload.body };
      if (payload.location) body.location = { displayName: payload.location };
      if (payload.attendees) body.attendees = payload.attendees.map((a) => ({ emailAddress: { address: a }, type: "required" }));

      const response = await client.fetchJSON(basePath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (response.status === 201) {
        return { ok: true as const, event: normalizeCalendarEvent(response.body as CalendarEvent) };
      }
      if (response.status === 429) {
        const rl = parseGraphRateLimit(response.status, response.headers);
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "Graph rate limit exceeded.", retryAfterSeconds: rl.limited ? rl.retryAfterSeconds : undefined } };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Graph rejected the create Teams calendar event request." } };
    },
  };
}
