import { createZoomClient, parseZoomRateLimit, isRecord, requireField, fieldString, fieldNumber, fieldValue, assertZoomRawSegment, optionalZoomSegment } from "./http";
import { assertNoTraversalSegment, encodePathSegment } from "../../_shared/jobboard";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function handleError(status: number, headers: Record<string, string>, fallbackMessage: string): { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } } {
  const rl = parseZoomRateLimit(status, headers);
  if (rl.limited) {
    return { ok: false, error: { code: "CONNECTOR_RATE_LIMITED", message: "Zoom rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
  }
  return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: fallbackMessage } };
}

function throwIfError(result: { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } }): never {
  throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
}

// ─── users.me ─────────────────────────────────────────────────────────────────

export function validateUsersMeInput(input: unknown): Record<string, never> {
  if (!isRecord(input)) throw new Error("users.me input must be an object");
  return {};
}

export function createUsersMeClient(options: { accessToken: string; fetch?: typeof fetch }) {
  const client = createZoomClient({ accessToken: options.accessToken, fetch: options.fetch, operation: "users.me" });
  return {
    async get() {
      const response = await client.fetchJSON("/v2/users/me");
      if (response.status === 200) {
        return { ok: true as const, user: response.body as Record<string, unknown> };
      }
      return handleError(response.status, response.headers, "Zoom rejected the users.me request.");
    },
  };
}

export function getUsersMe(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createUsersMeClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).get().then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "zoom", action: "users.me", source: "connector", user: result.user };
    });
  }
  return { connector: "zoom", action: "users.me", source: "connector", validated: validateUsersMeInput(input) };
}

// ─── users.list ───────────────────────────────────────────────────────────────

export type UsersListInput = { page_size?: number; next_page_token?: string; status?: string };

export function validateUsersListInput(input: unknown): UsersListInput {
  if (!isRecord(input)) throw new Error("users.list input must be an object");
  const payload: UsersListInput = {};
  const pageSize = fieldNumber(input, "page_size", "pageSize");
  if (pageSize !== undefined) payload.page_size = pageSize;
  const nextPageToken = fieldString(input, "next_page_token", "nextPageToken");
  if (nextPageToken) payload.next_page_token = nextPageToken;
  const status = fieldString(input, "status");
  if (status) payload.status = status;
  return payload;
}

export function createUsersListClient(options: { accessToken: string; fetch?: typeof fetch }) {
  const client = createZoomClient({ accessToken: options.accessToken, fetch: options.fetch, operation: "users.list" });
  return {
    async list(input: unknown) {
      const payload = validateUsersListInput(input);
      const params = new URLSearchParams();
      if (payload.page_size !== undefined) params.set("page_size", String(payload.page_size));
      if (payload.next_page_token) params.set("next_page_token", payload.next_page_token);
      if (payload.status) params.set("status", payload.status);
      const query = params.toString();
      const response = await client.fetchJSON(`/v2/users${query ? `?${query}` : ""}`);
      if (response.status === 200) {
        const body = response.body as Record<string, unknown>;
        const users = Array.isArray(body.users) ? body.users : [];
        const nextPageToken = typeof body.next_page_token === "string" ? body.next_page_token : "";
        const totalRecords = typeof body.total_records === "number" ? body.total_records : 0;
        return { ok: true as const, users, nextPageToken, totalRecords };
      }
      return handleError(response.status, response.headers, "Zoom rejected the users.list request.");
    },
  };
}

export function listUsers(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createUsersListClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).list(input).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "zoom", action: "users.list", source: "connector", users: result.users, nextPageToken: result.nextPageToken, totalRecords: result.totalRecords };
    });
  }
  return { connector: "zoom", action: "users.list", source: "connector", validated: validateUsersListInput(input) };
}

// ─── meetings.create ──────────────────────────────────────────────────────────

export type MeetingsCreateInput = {
  userId?: string;
  topic: string;
  type?: number;
  start_time?: string;
  duration?: number;
  timezone?: string;
  password?: string;
  agenda?: string;
  settings?: Record<string, unknown>;
};

function collectPrefixedObject(input: Record<string, unknown>, prefix: string): Record<string, unknown> {
  const collected: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!key.startsWith(prefix)) continue;
    collected[key.slice(prefix.length).replaceAll("__", "_")] = value;
  }
  return collected;
}

export function validateMeetingsCreateInput(input: unknown): MeetingsCreateInput {
  if (!isRecord(input)) throw new Error("meetings.create input must be an object");
  const settings = { ...(isRecord(input.settings) ? input.settings : {}), ...collectPrefixedObject(input, "settings__") };
  const recurrence = collectPrefixedObject(input, "recurrence__");
  const payload: MeetingsCreateInput = {
    userId: optionalZoomSegment(input, "userId", "user_id"),
    topic: requireString(input.topic, "topic"),
    type: fieldNumber(input, "type"),
    start_time: fieldString(input, "start_time"),
    duration: fieldNumber(input, "duration"),
    timezone: fieldString(input, "timezone"),
    password: fieldString(input, "password"),
    agenda: fieldString(input, "agenda"),
    settings: Object.keys(settings).length > 0 ? settings : undefined,
  };
  if (Object.keys(recurrence).length > 0) (payload as Record<string, unknown>).recurrence = recurrence;
  return payload;
}

export function createMeetingsClient(options: { accessToken: string; fetch?: typeof fetch }) {
  const client = createZoomClient({ accessToken: options.accessToken, fetch: options.fetch, operation: "meetings.create" });
  return {
    async create(input: unknown) {
      const payload = validateMeetingsCreateInput(input);
      const userId = payload.userId ?? "me";
      const body: Record<string, unknown> = { topic: payload.topic };
      if (payload.type !== undefined) body.type = payload.type;
      if (payload.start_time) body.start_time = payload.start_time;
      if (payload.duration !== undefined) body.duration = payload.duration;
      if (payload.timezone) body.timezone = payload.timezone;
      if (payload.password) body.password = payload.password;
      if (payload.agenda) body.agenda = payload.agenda;
      if (payload.settings) body.settings = payload.settings;
      const recurrence = (payload as Record<string, unknown>).recurrence;
      if (isRecord(recurrence)) body.recurrence = recurrence;
      const response = await client.fetchJSON(`/v2/users/${zoomUserSegment(userId)}/meetings`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (response.status === 201) {
        return { ok: true as const, meeting: response.body as Record<string, unknown> };
      }
      return handleError(response.status, response.headers, "Zoom rejected the meetings.create request.");
    },
  };
}

export function createMeeting(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createMeetingsClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).create(input).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "zoom", action: "meetings.create", source: "connector", meeting: result.meeting };
    });
  }
  return { connector: "zoom", action: "meetings.create", source: "connector", validated: validateMeetingsCreateInput(input) };
}

// ─── meetings.list ────────────────────────────────────────────────────────────

export type MeetingsListInput = { userId?: string; type?: string; page_size?: number; next_page_token?: string };

export function validateMeetingsListInput(input: unknown): MeetingsListInput {
  if (!isRecord(input)) throw new Error("meetings.list input must be an object");
  const payload: MeetingsListInput = {};
  const userId = optionalZoomSegment(input, "userId", "user_id");
  if (userId !== undefined) payload.userId = userId;
  const type = fieldString(input, "type");
  if (type) payload.type = type;
  const pageSize = fieldNumber(input, "page_size", "pageSize");
  if (pageSize !== undefined) payload.page_size = pageSize;
  const nextPageToken = fieldString(input, "next_page_token", "nextPageToken");
  if (nextPageToken) payload.next_page_token = nextPageToken;
  return payload;
}

export function createMeetingsListClient(options: { accessToken: string; fetch?: typeof fetch }) {
  const client = createZoomClient({ accessToken: options.accessToken, fetch: options.fetch, operation: "meetings.list" });
  return {
    async list(input: unknown) {
      const payload = validateMeetingsListInput(input);
      const userId = payload.userId ?? "me";
      const params = new URLSearchParams();
      if (payload.type) params.set("type", payload.type);
      if (payload.page_size !== undefined) params.set("page_size", String(payload.page_size));
      if (payload.next_page_token) params.set("next_page_token", payload.next_page_token);
      const query = params.toString();
      const response = await client.fetchJSON(`/v2/users/${zoomUserSegment(userId)}/meetings${query ? `?${query}` : ""}`);
      if (response.status === 200) {
        const body = response.body as Record<string, unknown>;
        const meetings = Array.isArray(body.meetings) ? body.meetings : [];
        const nextPageToken = typeof body.next_page_token === "string" ? body.next_page_token : "";
        const totalRecords = typeof body.total_records === "number" ? body.total_records : 0;
        return { ok: true as const, meetings, nextPageToken, totalRecords };
      }
      return handleError(response.status, response.headers, "Zoom rejected the meetings.list request.");
    },
  };
}

export function listMeetings(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createMeetingsListClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).list(input).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "zoom", action: "meetings.list", source: "connector", meetings: result.meetings, nextPageToken: result.nextPageToken, totalRecords: result.totalRecords };
    });
  }
  return { connector: "zoom", action: "meetings.list", source: "connector", validated: validateMeetingsListInput(input) };
}

// ─── meetings.get ─────────────────────────────────────────────────────────────

export function validateMeetingsGetInput(input: unknown): { meetingId: string } {
  if (!isRecord(input)) throw new Error("meetings.get input must be an object");
  return { meetingId: requireField(input, "meetingId", "meeting_id") };
}

export function createMeetingsGetClient(options: { accessToken: string; fetch?: typeof fetch }) {
  const client = createZoomClient({ accessToken: options.accessToken, fetch: options.fetch, operation: "meetings.get" });
  return {
    async get(input: unknown) {
      const payload = validateMeetingsGetInput(input);
      const response = await client.fetchJSON(`/v2/meetings/${zoomIdSegment(payload.meetingId, "meetingId")}`);
      if (response.status === 200) {
        return { ok: true as const, meeting: response.body as Record<string, unknown> };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Meeting not found." } };
      }
      return handleError(response.status, response.headers, "Zoom rejected the meetings.get request.");
    },
  };
}

export function getMeeting(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createMeetingsGetClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).get(input).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "zoom", action: "meetings.get", source: "connector", meeting: result.meeting };
    });
  }
  return { connector: "zoom", action: "meetings.get", source: "connector", validated: validateMeetingsGetInput(input) };
}

// ─── meetings.update ──────────────────────────────────────────────────────────

export type MeetingsUpdateInput = {
  meetingId: string;
  topic?: string;
  start_time?: string;
  duration?: number;
  timezone?: string;
  password?: string;
  agenda?: string;
  settings?: Record<string, unknown>;
};

export function validateMeetingsUpdateInput(input: unknown): MeetingsUpdateInput {
  if (!isRecord(input)) throw new Error("meetings.update input must be an object");
  const settings = { ...(isRecord(input.settings) ? input.settings : {}), ...collectPrefixedObject(input, "settings__") };
  const payload: MeetingsUpdateInput = {
    meetingId: requireField(input, "meetingId", "meeting_id"),
  };
  const topic = fieldString(input, "topic");
  if (topic) payload.topic = topic;
  const startTime = fieldString(input, "start_time");
  if (startTime) payload.start_time = startTime;
  const duration = fieldNumber(input, "duration");
  if (duration !== undefined) payload.duration = duration;
  const timezone = fieldString(input, "timezone");
  if (timezone) payload.timezone = timezone;
  const password = fieldString(input, "password");
  if (password) payload.password = password;
  const agenda = fieldString(input, "agenda");
  if (agenda) payload.agenda = agenda;
  if (Object.keys(settings).length > 0) payload.settings = settings;
  return payload;
}

export function createMeetingsUpdateClient(options: { accessToken: string; fetch?: typeof fetch }) {
  const client = createZoomClient({ accessToken: options.accessToken, fetch: options.fetch, operation: "meetings.update" });
  return {
    async update(input: unknown) {
      const payload = validateMeetingsUpdateInput(input);
      const body: Record<string, unknown> = {};
      if (payload.topic !== undefined) body.topic = payload.topic;
      if (payload.start_time !== undefined) body.start_time = payload.start_time;
      if (payload.duration !== undefined) body.duration = payload.duration;
      if (payload.timezone !== undefined) body.timezone = payload.timezone;
      if (payload.password !== undefined) body.password = payload.password;
      if (payload.agenda !== undefined) body.agenda = payload.agenda;
      if (payload.settings !== undefined) body.settings = payload.settings;
      const response = await client.fetchJSON(`/v2/meetings/${zoomIdSegment(payload.meetingId, "meetingId")}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      // Zoom PATCH returns 204 on success with empty body
      if (response.status === 204 || response.status === 200) {
        return { ok: true as const, updated: true };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Meeting not found." } };
      }
      return handleError(response.status, response.headers, "Zoom rejected the meetings.update request.");
    },
  };
}

export function updateMeeting(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createMeetingsUpdateClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).update(input).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "zoom", action: "meetings.update", source: "connector", updated: result.updated };
    });
  }
  return { connector: "zoom", action: "meetings.update", source: "connector", validated: validateMeetingsUpdateInput(input) };
}

// ─── meetings.delete ──────────────────────────────────────────────────────────

export function validateMeetingsDeleteInput(input: unknown): { meetingId: string } {
  if (!isRecord(input)) throw new Error("meetings.delete input must be an object");
  return { meetingId: requireField(input, "meetingId", "meeting_id") };
}

export function createMeetingsDeleteClient(options: { accessToken: string; fetch?: typeof fetch }) {
  const client = createZoomClient({ accessToken: options.accessToken, fetch: options.fetch, operation: "meetings.delete" });
  return {
    async delete(input: unknown) {
      const payload = validateMeetingsDeleteInput(input);
      const response = await client.fetchJSON(`/v2/meetings/${zoomIdSegment(payload.meetingId, "meetingId")}`, { method: "DELETE" });
      // Zoom DELETE returns 204 on success with empty body
      if (response.status === 204 || response.status === 200) {
        return { ok: true as const, deleted: true };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Meeting not found." } };
      }
      return handleError(response.status, response.headers, "Zoom rejected the meetings.delete request.");
    },
  };
}

export function deleteMeeting(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createMeetingsDeleteClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).delete(input).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "zoom", action: "meetings.delete", source: "connector", deleted: result.deleted };
    });
  }
  return { connector: "zoom", action: "meetings.delete", source: "connector", validated: validateMeetingsDeleteInput(input) };
}

// ─── meetings.list_registrants ────────────────────────────────────────────────

export type MeetingsListRegistrantsInput = { meetingId: string; page_size?: number; next_page_token?: string };

export function validateMeetingsListRegistrantsInput(input: unknown): MeetingsListRegistrantsInput {
  if (!isRecord(input)) throw new Error("meetings.list_registrants input must be an object");
  return {
    meetingId: requireField(input, "meetingId", "meeting_id"),
    page_size: fieldNumber(input, "page_size", "pageSize"),
    next_page_token: fieldString(input, "next_page_token", "nextPageToken"),
  };
}

export function createMeetingsRegistrantsClient(options: { accessToken: string; fetch?: typeof fetch }) {
  const client = createZoomClient({ accessToken: options.accessToken, fetch: options.fetch, operation: "meetings.list_registrants" });
  return {
    async list(input: unknown) {
      const payload = validateMeetingsListRegistrantsInput(input);
      const params = new URLSearchParams();
      if (payload.page_size !== undefined) params.set("page_size", String(payload.page_size));
      if (payload.next_page_token) params.set("next_page_token", payload.next_page_token);
      const query = params.toString();
      const response = await client.fetchJSON(`/v2/meetings/${zoomIdSegment(payload.meetingId, "meetingId")}/registrants${query ? `?${query}` : ""}`);
      if (response.status === 200) {
        const body = response.body as Record<string, unknown>;
        const registrants = Array.isArray(body.registrants) ? body.registrants : [];
        const nextPageToken = typeof body.next_page_token === "string" ? body.next_page_token : "";
        return { ok: true as const, registrants, nextPageToken };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Meeting not found." } };
      }
      return handleError(response.status, response.headers, "Zoom rejected the meetings.list_registrants request.");
    },

    async addRegistrant(input: unknown) {
      if (!isRecord(input)) throw new Error("meetings.add_registrant input must be an object");
      const payload = validateMeetingsAddRegistrantInput(input);
      const body: Record<string, unknown> = { email: payload.email, first_name: payload.first_name };
      if (payload.last_name) body.last_name = payload.last_name;
      for (const key of ["org", "zip", "city", "phone", "state", "address", "country", "comments", "industry", "language", "job_title", "auto_approve", "no_of_employees", "custom_questions", "purchasing_time_frame", "role_in_purchase_process"] as const) {
        const value = fieldValue(input, key);
        if (value !== undefined) body[key] = value;
      }
      const params = new URLSearchParams();
      const occurrenceIds = fieldString(input, "occurrence_ids");
      if (occurrenceIds) params.set("occurrence_ids", occurrenceIds);
      const query = params.toString();
      const response = await client.fetchJSON(`/v2/meetings/${zoomIdSegment(payload.meetingId, "meetingId")}/registrants${query ? `?${query}` : ""}`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (response.status === 201 || response.status === 200) {
        return { ok: true as const, registrant: response.body as Record<string, unknown> };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Meeting not found." } };
      }
      return handleError(response.status, response.headers, "Zoom rejected the meetings.add_registrant request.");
    },
  };
}

export function validateMeetingsAddRegistrantInput(input: unknown): { meetingId: string; email: string; first_name: string; last_name?: string } {
  if (!isRecord(input)) throw new Error("meetings.add_registrant input must be an object");
  return {
    meetingId: requireField(input, "meetingId", "meeting_id"),
    email: requireField(input, "email"),
    first_name: requireField(input, "first_name"),
    last_name: fieldString(input, "last_name"),
  };
}

export function listMeetingRegistrants(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createMeetingsRegistrantsClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).list(input).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "zoom", action: "meetings.list_registrants", source: "connector", registrants: result.registrants, nextPageToken: result.nextPageToken };
    });
  }
  return { connector: "zoom", action: "meetings.list_registrants", source: "connector", validated: validateMeetingsListRegistrantsInput(input) };
}

export function addMeetingRegistrant(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createMeetingsRegistrantsClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).addRegistrant(input).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "zoom", action: "meetings.add_registrant", source: "connector", registrant: result.registrant };
    });
  }
  return { connector: "zoom", action: "meetings.add_registrant", source: "connector", validated: validateMeetingsAddRegistrantInput(input) };
}

// SEC-PATH-2: Zoom meeting/webinar/recording ids may be raw UUIDs, which are
// base64 and can contain "/", "+" and "=". Zoom documents single URL-encoding,
// and double encoding when the UUID begins with "/" or contains "//". The
// encoded segment then passes the shared no-traversal guard, which rejects
// "." and ".." (encodeURIComponent leaves them intact) and empty values.
// SEC-PATH-2b: the raw value is guarded first (empty/whitespace/backslash/
// control/dot-only), then encoded, then re-checked after encoding.
function zoomIdSegment(value: string, field: string): string {
  const raw = assertZoomRawSegment(value, field);
  const encoded = encodeURIComponent(raw);
  const segment = raw.startsWith("/") || raw.includes("//") ? encodeURIComponent(encoded) : encoded;
  return assertNoTraversalSegment(segment, field);
}

// Zoom userId is a user id, an email address or "me": never contains "/", so
// the raw value must also pass the shared no-traversal guard before encoding.
function zoomUserSegment(value: string): string {
  return encodePathSegment(assertZoomRawSegment(value, "userId"), "userId");
}

// ─── past_meetings.participants ───────────────────────────────────────────────

export type PastMeetingParticipantsInput = { meetingUUID: string; page_size?: number; next_page_token?: string };

function requireSafeMeetingUUID(value: unknown): string {
  const meetingUUID = requireString(value, "meetingUUID");
  const hasWhitespace = /\s/.test(meetingUUID);
  const hasAsciiControl = /[\u0000-\u001F\u007F]/.test(meetingUUID);
  const hasPathTraversal = meetingUUID.split("/").some((segment) => segment === "..");
  const hasUnsafeDelimiter = meetingUUID.includes("?") || meetingUUID.includes("#");
  const hasBackslash = meetingUUID.includes("\\");

  if (hasWhitespace || hasAsciiControl || hasPathTraversal || hasUnsafeDelimiter || hasBackslash) {
    throw new Error("meetingUUID is invalid");
  }
  return meetingUUID;
}

export function validatePastMeetingParticipantsInput(input: unknown): PastMeetingParticipantsInput {
  if (!isRecord(input)) throw new Error("past_meetings.participants input must be an object");
  return {
    meetingUUID: requireSafeMeetingUUID(fieldString(input, "meetingUUID", "meeting_uuid", "meeting_id", "meetingId")),
    page_size: fieldNumber(input, "page_size", "pageSize"),
    next_page_token: fieldString(input, "next_page_token", "nextPageToken"),
  };
}

export function createPastMeetingsClient(options: { accessToken: string; fetch?: typeof fetch }) {
  const client = createZoomClient({ accessToken: options.accessToken, fetch: options.fetch, operation: "past_meetings.participants" });
  return {
    async participants(input: unknown) {
      const payload = validatePastMeetingParticipantsInput(input);
      const params = new URLSearchParams();
      if (payload.page_size !== undefined) params.set("page_size", String(payload.page_size));
      if (payload.next_page_token) params.set("next_page_token", payload.next_page_token);
      const query = params.toString();
      const encodedUUID = encodeURIComponent(payload.meetingUUID);
      const pathUUID = payload.meetingUUID.startsWith("/") || payload.meetingUUID.includes("//")
        ? encodeURIComponent(encodedUUID)
        : encodedUUID;
      const response = await client.fetchJSON(`/v2/past_meetings/${assertNoTraversalSegment(pathUUID, "meetingUUID")}/participants${query ? `?${query}` : ""}`);
      if (response.status === 200) {
        const body = response.body as Record<string, unknown>;
        const participants = Array.isArray(body.participants) ? body.participants : [];
        const nextPageToken = typeof body.next_page_token === "string" ? body.next_page_token : "";
        return { ok: true as const, participants, nextPageToken };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Past meeting not found." } };
      }
      return handleError(response.status, response.headers, "Zoom rejected the past_meetings.participants request.");
    },
  };
}

export function listPastMeetingParticipants(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createPastMeetingsClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).participants(input).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "zoom", action: "past_meetings.participants", source: "connector", participants: result.participants, nextPageToken: result.nextPageToken };
    });
  }
  return { connector: "zoom", action: "past_meetings.participants", source: "connector", validated: validatePastMeetingParticipantsInput(input) };
}

// ─── webinars.create ──────────────────────────────────────────────────────────

export type WebinarsCreateInput = {
  userId?: string;
  topic: string;
  type?: number;
  start_time?: string;
  duration?: number;
  timezone?: string;
  agenda?: string;
  password?: string;
};

export function validateWebinarsCreateInput(input: unknown): WebinarsCreateInput {
  if (!isRecord(input)) throw new Error("webinars.create input must be an object");
  return {
    userId: optionalZoomSegment(input, "userId", "user_id"),
    topic: requireString(input.topic, "topic"),
    type: fieldNumber(input, "type"),
    start_time: fieldString(input, "start_time"),
    duration: fieldNumber(input, "duration"),
    timezone: fieldString(input, "timezone"),
    agenda: fieldString(input, "agenda"),
    password: fieldString(input, "password"),
  };
}

export function createWebinarsClient(options: { accessToken: string; fetch?: typeof fetch }) {
  const client = createZoomClient({ accessToken: options.accessToken, fetch: options.fetch, operation: "webinars.create" });
  return {
    async create(input: unknown) {
      const payload = validateWebinarsCreateInput(input);
      const userId = payload.userId ?? "me";
      const body: Record<string, unknown> = { topic: payload.topic };
      if (payload.type !== undefined) body.type = payload.type;
      if (payload.start_time) body.start_time = payload.start_time;
      if (payload.duration !== undefined) body.duration = payload.duration;
      if (payload.timezone) body.timezone = payload.timezone;
      if (payload.agenda) body.agenda = payload.agenda;
      if (payload.password) body.password = payload.password;
      const response = await client.fetchJSON(`/v2/users/${zoomUserSegment(userId)}/webinars`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (response.status === 201) {
        return { ok: true as const, webinar: response.body as Record<string, unknown> };
      }
      return handleError(response.status, response.headers, "Zoom rejected the webinars.create request.");
    },

    async list(input: unknown) {
      if (!isRecord(input)) throw new Error("webinars.list input must be an object");
      const userId = optionalZoomSegment(input, "userId", "user_id") ?? "me";
      const params = new URLSearchParams();
      const pageSize = fieldNumber(input, "page_size", "pageSize");
      if (pageSize !== undefined) params.set("page_size", String(pageSize));
      const nextPageToken = fieldString(input, "next_page_token", "nextPageToken");
      if (nextPageToken) params.set("next_page_token", nextPageToken);
      const query = params.toString();
      const response = await client.fetchJSON(`/v2/users/${zoomUserSegment(userId)}/webinars${query ? `?${query}` : ""}`);
      if (response.status === 200) {
        const body = response.body as Record<string, unknown>;
        const webinars = Array.isArray(body.webinars) ? body.webinars : [];
        const nextPageToken = typeof body.next_page_token === "string" ? body.next_page_token : "";
        const totalRecords = typeof body.total_records === "number" ? body.total_records : 0;
        return { ok: true as const, webinars, nextPageToken, totalRecords };
      }
      return handleError(response.status, response.headers, "Zoom rejected the webinars.list request.");
    },
  };
}

export function validateWebinarsListInput(input: unknown): { userId?: string; page_size?: number; next_page_token?: string } {
  if (!isRecord(input)) throw new Error("webinars.list input must be an object");
  const payload: { userId?: string; page_size?: number; next_page_token?: string } = {};
  const userId = optionalZoomSegment(input, "userId", "user_id");
  if (userId !== undefined) payload.userId = userId;
  const pageSize = fieldNumber(input, "page_size", "pageSize");
  if (pageSize !== undefined) payload.page_size = pageSize;
  const nextPageToken = fieldString(input, "next_page_token", "nextPageToken");
  if (nextPageToken) payload.next_page_token = nextPageToken;
  return payload;
}

export function createWebinar(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createWebinarsClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).create(input).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "zoom", action: "webinars.create", source: "connector", webinar: result.webinar };
    });
  }
  return { connector: "zoom", action: "webinars.create", source: "connector", validated: validateWebinarsCreateInput(input) };
}

export function listWebinars(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createWebinarsClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).list(input).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "zoom", action: "webinars.list", source: "connector", webinars: result.webinars, nextPageToken: result.nextPageToken, totalRecords: result.totalRecords };
    });
  }
  return { connector: "zoom", action: "webinars.list", source: "connector", validated: validateWebinarsListInput(input) };
}

// ─── users.get ────────────────────────────────────────────────────────────────

export function validateUsersGetInput(input: unknown): { userId: string } {
  if (!isRecord(input)) throw new Error("users.get input must be an object");
  return { userId: requireField(input, "userId", "user_id", "id") };
}

export function createUsersGetClient(options: { accessToken: string; fetch?: typeof fetch }) {
  const client = createZoomClient({ accessToken: options.accessToken, fetch: options.fetch, operation: "users.get" });
  return {
    async get(input: unknown) {
      const payload = validateUsersGetInput(input);
      const response = await client.fetchJSON(`/v2/users/${zoomUserSegment(payload.userId)}`);
      if (response.status === 200) {
        return { ok: true as const, user: response.body as Record<string, unknown> };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "User not found." } };
      }
      return handleError(response.status, response.headers, "Zoom rejected the users.get request.");
    },
  };
}

export function getUser(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createUsersGetClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).get(input).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "zoom", action: "users.get", source: "connector", user: result.user };
    });
  }
  return { connector: "zoom", action: "users.get", source: "connector", validated: validateUsersGetInput(input) };
}

// ─── recordings.list ──────────────────────────────────────────────────────────

export type RecordingsListInput = { userId?: string; from: string; to?: string; page_size?: number; next_page_token?: string };

export function validateRecordingsListInput(input: unknown): RecordingsListInput {
  if (!isRecord(input)) throw new Error("recordings.list input must be an object");
  const payload: RecordingsListInput = { from: requireString(input.from, "from") };
  const userId = optionalZoomSegment(input, "userId", "user_id");
  if (userId !== undefined) payload.userId = userId;
  const to = fieldString(input, "to");
  if (to) payload.to = to;
  const pageSize = fieldNumber(input, "page_size", "pageSize");
  if (pageSize !== undefined) payload.page_size = pageSize;
  const nextPageToken = fieldString(input, "next_page_token", "nextPageToken");
  if (nextPageToken) payload.next_page_token = nextPageToken;
  return payload;
}

export function createRecordingsListClient(options: { accessToken: string; fetch?: typeof fetch }) {
  const client = createZoomClient({ accessToken: options.accessToken, fetch: options.fetch, operation: "recordings.list" });
  return {
    async list(input: unknown) {
      const payload = validateRecordingsListInput(input);
      const userId = payload.userId ?? "me";
      const params = new URLSearchParams();
      params.set("from", payload.from);
      if (payload.to) params.set("to", payload.to);
      if (payload.page_size !== undefined) params.set("page_size", String(payload.page_size));
      if (payload.next_page_token) params.set("next_page_token", payload.next_page_token);
      const response = await client.fetchJSON(`/v2/users/${zoomUserSegment(userId)}/recordings?${params.toString()}`);
      if (response.status === 200) {
        const body = response.body as Record<string, unknown>;
        const meetings = Array.isArray(body.meetings) ? body.meetings : [];
        const nextPageToken = typeof body.next_page_token === "string" ? body.next_page_token : "";
        const totalRecords = typeof body.total_records === "number" ? body.total_records : 0;
        return { ok: true as const, meetings, nextPageToken, totalRecords };
      }
      return handleError(response.status, response.headers, "Zoom rejected the recordings.list request.");
    },
  };
}

export function listRecordings(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createRecordingsListClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).list(input).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "zoom", action: "recordings.list", source: "connector", meetings: result.meetings, nextPageToken: result.nextPageToken, totalRecords: result.totalRecords };
    });
  }
  return { connector: "zoom", action: "recordings.list", source: "connector", validated: validateRecordingsListInput(input) };
}

// ─── recordings.get ───────────────────────────────────────────────────────────

export function validateRecordingsGetInput(input: unknown): { meetingId: string } {
  if (!isRecord(input)) throw new Error("recordings.get input must be an object");
  return { meetingId: requireField(input, "meetingId", "meeting_id") };
}

export function createRecordingsGetClient(options: { accessToken: string; fetch?: typeof fetch }) {
  const client = createZoomClient({ accessToken: options.accessToken, fetch: options.fetch, operation: "recordings.get" });
  return {
    async get(input: unknown) {
      const payload = validateRecordingsGetInput(input);
      const response = await client.fetchJSON(`/v2/meetings/${zoomIdSegment(payload.meetingId, "meetingId")}/recordings`);
      if (response.status === 200) {
        return { ok: true as const, recording: response.body as Record<string, unknown> };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Recording not found." } };
      }
      return handleError(response.status, response.headers, "Zoom rejected the recordings.get request.");
    },
  };
}

export function getRecording(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createRecordingsGetClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).get(input).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "zoom", action: "recordings.get", source: "connector", recording: result.recording };
    });
  }
  return { connector: "zoom", action: "recordings.get", source: "connector", validated: validateRecordingsGetInput(input) };
}

// ─── recordings.delete ────────────────────────────────────────────────────────

export function validateRecordingsDeleteInput(input: unknown): { meetingId: string; recordingId?: string } {
  if (!isRecord(input)) throw new Error("recordings.delete input must be an object");
  const payload: { meetingId: string; recordingId?: string } = { meetingId: requireField(input, "meetingId", "meeting_id") };
  // SEC-PATH-2b: only an omitted recordingId selects the meeting-wide route;
  // "" or whitespace must never collapse into DELETE .../recordings (all files).
  const recordingId = optionalZoomSegment(input, "recordingId", "recording_id");
  if (recordingId !== undefined) payload.recordingId = recordingId;
  return payload;
}

export function createRecordingsDeleteClient(options: { accessToken: string; fetch?: typeof fetch }) {
  const client = createZoomClient({ accessToken: options.accessToken, fetch: options.fetch, operation: "recordings.delete" });
  return {
    async delete(input: unknown) {
      const payload = validateRecordingsDeleteInput(input);
      const path = payload.recordingId !== undefined
        ? `/v2/meetings/${zoomIdSegment(payload.meetingId, "meetingId")}/recordings/${zoomIdSegment(payload.recordingId, "recordingId")}`
        : `/v2/meetings/${zoomIdSegment(payload.meetingId, "meetingId")}/recordings`;
      const response = await client.fetchJSON(path, { method: "DELETE" });
      if (response.status === 204 || response.status === 200) {
        return { ok: true as const, deleted: true };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Recording not found." } };
      }
      return handleError(response.status, response.headers, "Zoom rejected the recordings.delete request.");
    },
  };
}

export function deleteRecording(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createRecordingsDeleteClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).delete(input).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "zoom", action: "recordings.delete", source: "connector", deleted: result.deleted };
    });
  }
  return { connector: "zoom", action: "recordings.delete", source: "connector", validated: validateRecordingsDeleteInput(input) };
}

// ─── webinars.get ─────────────────────────────────────────────────────────────

export function validateWebinarsGetInput(input: unknown): { webinarId: string } {
  if (!isRecord(input)) throw new Error("webinars.get input must be an object");
  return { webinarId: requireField(input, "webinarId", "webinar_id") };
}

export function createWebinarsGetClient(options: { accessToken: string; fetch?: typeof fetch }) {
  const client = createZoomClient({ accessToken: options.accessToken, fetch: options.fetch, operation: "webinars.get" });
  return {
    async get(input: unknown) {
      const payload = validateWebinarsGetInput(input);
      const response = await client.fetchJSON(`/v2/webinars/${zoomIdSegment(payload.webinarId, "webinarId")}`);
      if (response.status === 200) {
        return { ok: true as const, webinar: response.body as Record<string, unknown> };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Webinar not found." } };
      }
      return handleError(response.status, response.headers, "Zoom rejected the webinars.get request.");
    },
  };
}

export function getWebinar(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createWebinarsGetClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).get(input).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "zoom", action: "webinars.get", source: "connector", webinar: result.webinar };
    });
  }
  return { connector: "zoom", action: "webinars.get", source: "connector", validated: validateWebinarsGetInput(input) };
}
