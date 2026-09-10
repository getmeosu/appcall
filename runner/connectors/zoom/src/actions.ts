import { createZoomClient, parseZoomRateLimit, isRecord } from "./http";

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
  if (typeof input.page_size === "number") payload.page_size = input.page_size;
  if (typeof input.next_page_token === "string") payload.next_page_token = input.next_page_token;
  if (typeof input.status === "string") payload.status = input.status;
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

export function validateMeetingsCreateInput(input: unknown): MeetingsCreateInput {
  if (!isRecord(input)) throw new Error("meetings.create input must be an object");
  return {
    userId: typeof input.userId === "string" ? input.userId : undefined,
    topic: requireString(input.topic, "topic"),
    type: typeof input.type === "number" ? input.type : undefined,
    start_time: typeof input.start_time === "string" ? input.start_time : undefined,
    duration: typeof input.duration === "number" ? input.duration : undefined,
    timezone: typeof input.timezone === "string" ? input.timezone : undefined,
    password: typeof input.password === "string" ? input.password : undefined,
    agenda: typeof input.agenda === "string" ? input.agenda : undefined,
    settings: isRecord(input.settings) ? input.settings : undefined,
  };
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
      const response = await client.fetchJSON(`/v2/users/${userId}/meetings`, {
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
  if (typeof input.userId === "string") payload.userId = input.userId;
  if (typeof input.type === "string") payload.type = input.type;
  if (typeof input.page_size === "number") payload.page_size = input.page_size;
  if (typeof input.next_page_token === "string") payload.next_page_token = input.next_page_token;
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
      const response = await client.fetchJSON(`/v2/users/${userId}/meetings${query ? `?${query}` : ""}`);
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
  return { meetingId: requireString(input.meetingId, "meetingId") };
}

export function createMeetingsGetClient(options: { accessToken: string; fetch?: typeof fetch }) {
  const client = createZoomClient({ accessToken: options.accessToken, fetch: options.fetch, operation: "meetings.get" });
  return {
    async get(input: unknown) {
      const payload = validateMeetingsGetInput(input);
      const response = await client.fetchJSON(`/v2/meetings/${payload.meetingId}`);
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
  const payload: MeetingsUpdateInput = {
    meetingId: requireString(input.meetingId, "meetingId"),
  };
  if (typeof input.topic === "string") payload.topic = input.topic;
  if (typeof input.start_time === "string") payload.start_time = input.start_time;
  if (typeof input.duration === "number") payload.duration = input.duration;
  if (typeof input.timezone === "string") payload.timezone = input.timezone;
  if (typeof input.password === "string") payload.password = input.password;
  if (typeof input.agenda === "string") payload.agenda = input.agenda;
  if (isRecord(input.settings)) payload.settings = input.settings;
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
      const response = await client.fetchJSON(`/v2/meetings/${payload.meetingId}`, {
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
  return { meetingId: requireString(input.meetingId, "meetingId") };
}

export function createMeetingsDeleteClient(options: { accessToken: string; fetch?: typeof fetch }) {
  const client = createZoomClient({ accessToken: options.accessToken, fetch: options.fetch, operation: "meetings.delete" });
  return {
    async delete(input: unknown) {
      const payload = validateMeetingsDeleteInput(input);
      const response = await client.fetchJSON(`/v2/meetings/${payload.meetingId}`, { method: "DELETE" });
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
    meetingId: requireString(input.meetingId, "meetingId"),
    page_size: typeof input.page_size === "number" ? input.page_size : undefined,
    next_page_token: typeof input.next_page_token === "string" ? input.next_page_token : undefined,
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
      const response = await client.fetchJSON(`/v2/meetings/${payload.meetingId}/registrants${query ? `?${query}` : ""}`);
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
      const meetingId = requireString(input.meetingId, "meetingId");
      const email = requireString(input.email, "email");
      const first_name = requireString(input.first_name, "first_name");
      const body: Record<string, unknown> = { email, first_name };
      if (typeof input.last_name === "string") body.last_name = input.last_name;
      const response = await client.fetchJSON(`/v2/meetings/${meetingId}/registrants`, {
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
    meetingId: requireString(input.meetingId, "meetingId"),
    email: requireString(input.email, "email"),
    first_name: requireString(input.first_name, "first_name"),
    last_name: typeof input.last_name === "string" ? input.last_name : undefined,
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

// ─── past_meetings.participants ───────────────────────────────────────────────

export type PastMeetingParticipantsInput = { meetingUUID: string; page_size?: number; next_page_token?: string };

export function validatePastMeetingParticipantsInput(input: unknown): PastMeetingParticipantsInput {
  if (!isRecord(input)) throw new Error("past_meetings.participants input must be an object");
  return {
    meetingUUID: requireString(input.meetingUUID, "meetingUUID"),
    page_size: typeof input.page_size === "number" ? input.page_size : undefined,
    next_page_token: typeof input.next_page_token === "string" ? input.next_page_token : undefined,
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
      const response = await client.fetchJSON(`/v2/past_meetings/${pathUUID}/participants${query ? `?${query}` : ""}`);
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
    userId: typeof input.userId === "string" ? input.userId : undefined,
    topic: requireString(input.topic, "topic"),
    type: typeof input.type === "number" ? input.type : undefined,
    start_time: typeof input.start_time === "string" ? input.start_time : undefined,
    duration: typeof input.duration === "number" ? input.duration : undefined,
    timezone: typeof input.timezone === "string" ? input.timezone : undefined,
    agenda: typeof input.agenda === "string" ? input.agenda : undefined,
    password: typeof input.password === "string" ? input.password : undefined,
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
      const response = await client.fetchJSON(`/v2/users/${userId}/webinars`, {
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
      const userId = typeof input.userId === "string" ? input.userId : "me";
      const params = new URLSearchParams();
      if (typeof input.page_size === "number") params.set("page_size", String(input.page_size));
      if (typeof input.next_page_token === "string") params.set("next_page_token", input.next_page_token);
      const query = params.toString();
      const response = await client.fetchJSON(`/v2/users/${userId}/webinars${query ? `?${query}` : ""}`);
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
  if (typeof input.userId === "string") payload.userId = input.userId;
  if (typeof input.page_size === "number") payload.page_size = input.page_size;
  if (typeof input.next_page_token === "string") payload.next_page_token = input.next_page_token;
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
