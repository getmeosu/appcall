import { createCalComClient, parseCalComRateLimit, isRecord, prop, unwrapEnvelope } from "./http";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== "number") throw new Error(`${field} is required`);
  return value;
}

function requireStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== "string" || item.length === 0)) {
    throw new Error(`${field} is required`);
  }
  return value as string[];
}

function isSuccessStatus(status: number): boolean {
  return status === 200 || status === 201 || status === 204;
}

function handleError(
  status: number,
  headers: Record<string, string>,
  fallbackMessage: string,
): { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } } {
  const rl = parseCalComRateLimit(status, headers);
  if (rl.limited) {
    return { ok: false, error: { code: "CONNECTOR_RATE_LIMITED", message: "Cal.com rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
  }
  return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: fallbackMessage } };
}

function throwIfError(result: { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } }): never {
  throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
}

// ─── me.get ───────────────────────────────────────────────────────────────────

export function validateMeGetInput(input: unknown): Record<string, never> {
  if (!isRecord(input)) throw new Error("me.get input must be an object");
  return {};
}

export function createMeClient(options: { token: string; fetch?: typeof fetch }) {
  const client = createCalComClient({ token: options.token, fetch: options.fetch, operation: "me.get" });
  return {
    async get() {
      const response = await client.fetchJSON("/me");
      if (response.status === 200) {
        const data = unwrapEnvelope(response.body);
        return { ok: true as const, user: isRecord(data) ? data : response.body };
      }
      return handleError(response.status, response.headers, "Cal.com rejected the me.get request.");
    },
  };
}

export function getMe(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createMeClient({
      token: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).get().then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "cal-com", action: "me.get", source: "connector", user: result.user };
    });
  }
  return { connector: "cal-com", action: "me.get", source: "connector", validated: validateMeGetInput(input) };
}

// ─── event_types.list ─────────────────────────────────────────────────────────

export type EventTypesListInput = { username?: string; eventSlug?: string };

export function validateEventTypesListInput(input: unknown): EventTypesListInput {
  if (!isRecord(input)) throw new Error("event_types.list input must be an object");
  const payload: EventTypesListInput = {};
  if (typeof input.username === "string") payload.username = input.username;
  if (typeof input.eventSlug === "string") payload.eventSlug = input.eventSlug;
  return payload;
}

export function createEventTypesClient(options: { token: string; fetch?: typeof fetch }) {
  const client = createCalComClient({ token: options.token, fetch: options.fetch, operation: "event_types.list", calApiVersion: "2024-06-14" });
  return {
    async list(input: unknown) {
      const payload = validateEventTypesListInput(input);
      const params = new URLSearchParams();
      if (payload.username) params.set("username", payload.username);
      if (payload.eventSlug) params.set("eventSlug", payload.eventSlug);
      const query = params.toString();
      const response = await client.fetchJSON(`/event-types${query ? `?${query}` : ""}`, {}, "2024-06-14");
      if (response.status === 200) {
        const data = unwrapEnvelope(response.body);
        const eventTypes = isRecord(data) && Array.isArray(data.eventTypeGroups)
          ? (data.eventTypeGroups as unknown[]).flatMap((g) => isRecord(g) && Array.isArray(g.eventTypes) ? g.eventTypes : [])
          : Array.isArray(data) ? data : [];
        return { ok: true as const, eventTypes };
      }
      return handleError(response.status, response.headers, "Cal.com rejected the event_types.list request.");
    },

    async get(id: number) {
      const response = await client.fetchJSON(`/event-types/${id}`, {}, "2024-06-14");
      if (response.status === 200) {
        const data = unwrapEnvelope(response.body);
        return { ok: true as const, eventType: data };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Event type not found." } };
      }
      return handleError(response.status, response.headers, "Cal.com rejected the event_types.get request.");
    },

    async create(input: unknown) {
      const payload = validateEventTypesCreateInput(input);
      const body: Record<string, unknown> = {
        title: payload.title,
        slug: payload.slug,
        lengthInMinutes: payload.lengthInMinutes,
      };
      if (payload.description !== undefined) body.description = payload.description;
      if (payload.hidden !== undefined) body.hidden = payload.hidden;
      if (payload.scheduleId !== undefined) body.scheduleId = payload.scheduleId;
      if (payload.locations !== undefined) body.locations = payload.locations;
      const response = await client.fetchJSON("/event-types", { method: "POST", body: JSON.stringify(body) }, "2024-06-14");
      if (isSuccessStatus(response.status)) {
        const data = unwrapEnvelope(response.body);
        return { ok: true as const, eventType: data };
      }
      return handleError(response.status, response.headers, "Cal.com rejected the event_types.create request.");
    },

    async update(input: unknown) {
      const payload = validateEventTypesUpdateInput(input);
      const body: Record<string, unknown> = {};
      if (payload.title !== undefined) body.title = payload.title;
      if (payload.slug !== undefined) body.slug = payload.slug;
      if (payload.lengthInMinutes !== undefined) body.lengthInMinutes = payload.lengthInMinutes;
      if (payload.description !== undefined) body.description = payload.description;
      if (payload.hidden !== undefined) body.hidden = payload.hidden;
      if (payload.scheduleId !== undefined) body.scheduleId = payload.scheduleId;
      const response = await client.fetchJSON(`/event-types/${payload.id}`, { method: "PATCH", body: JSON.stringify(body) }, "2024-06-14");
      if (isSuccessStatus(response.status)) {
        const data = unwrapEnvelope(response.body);
        return { ok: true as const, eventType: data };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Event type not found." } };
      }
      return handleError(response.status, response.headers, "Cal.com rejected the event_types.update request.");
    },

    async delete(id: number) {
      const response = await client.fetchJSON(`/event-types/${id}`, { method: "DELETE" }, "2024-06-14");
      if (isSuccessStatus(response.status)) {
        const data = unwrapEnvelope(response.body);
        return { ok: true as const, eventType: data };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Event type not found." } };
      }
      return handleError(response.status, response.headers, "Cal.com rejected the event_types.delete request.");
    },
  };
}

export function validateEventTypesGetInput(input: unknown): { id: number } {
  if (!isRecord(input)) throw new Error("event_types.get input must be an object");
  return { id: requireNumber(input.id, "id") };
}

export type EventTypesCreateInput = {
  title: string;
  slug: string;
  lengthInMinutes: number;
  description?: string;
  hidden?: boolean;
  scheduleId?: number;
  locations?: unknown[];
};

export function validateEventTypesCreateInput(input: unknown): EventTypesCreateInput {
  if (!isRecord(input)) throw new Error("event_types.create input must be an object");
  const payload: EventTypesCreateInput = {
    title: requireString(input.title, "title"),
    slug: requireString(input.slug, "slug"),
    lengthInMinutes: requireNumber(input.lengthInMinutes, "lengthInMinutes"),
  };
  if (typeof input.description === "string") payload.description = input.description;
  if (typeof input.hidden === "boolean") payload.hidden = input.hidden;
  if (typeof input.scheduleId === "number") payload.scheduleId = input.scheduleId;
  if (Array.isArray(input.locations)) payload.locations = input.locations;
  return payload;
}

export type EventTypesUpdateInput = {
  id: number;
  title?: string;
  slug?: string;
  lengthInMinutes?: number;
  description?: string;
  hidden?: boolean;
  scheduleId?: number;
};

export function validateEventTypesUpdateInput(input: unknown): EventTypesUpdateInput {
  if (!isRecord(input)) throw new Error("event_types.update input must be an object");
  const payload: EventTypesUpdateInput = { id: requireNumber(input.id, "id") };
  if (typeof input.title === "string") payload.title = input.title;
  if (typeof input.slug === "string") payload.slug = input.slug;
  if (typeof input.lengthInMinutes === "number") payload.lengthInMinutes = input.lengthInMinutes;
  if (typeof input.description === "string") payload.description = input.description;
  if (typeof input.hidden === "boolean") payload.hidden = input.hidden;
  if (typeof input.scheduleId === "number") payload.scheduleId = input.scheduleId;
  return payload;
}

export function validateEventTypesDeleteInput(input: unknown): { id: number } {
  if (!isRecord(input)) throw new Error("event_types.delete input must be an object");
  return { id: requireNumber(input.id, "id") };
}

export function listEventTypes(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createEventTypesClient({
      token: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).list(input).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "cal-com", action: "event_types.list", source: "connector", eventTypes: result.eventTypes };
    });
  }
  return { connector: "cal-com", action: "event_types.list", source: "connector", validated: validateEventTypesListInput(input) };
}

export function getEventType(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const payload = validateEventTypesGetInput(input);
    return createEventTypesClient({
      token: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).get(payload.id).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "cal-com", action: "event_types.get", source: "connector", eventType: result.eventType };
    });
  }
  return { connector: "cal-com", action: "event_types.get", source: "connector", validated: validateEventTypesGetInput(input) };
}

export function createEventType(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createEventTypesClient({
      token: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).create(input).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "cal-com", action: "event_types.create", source: "connector", eventType: result.eventType };
    });
  }
  return { connector: "cal-com", action: "event_types.create", source: "connector", validated: validateEventTypesCreateInput(input) };
}

export function updateEventType(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createEventTypesClient({
      token: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).update(input).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "cal-com", action: "event_types.update", source: "connector", eventType: result.eventType };
    });
  }
  return { connector: "cal-com", action: "event_types.update", source: "connector", validated: validateEventTypesUpdateInput(input) };
}

export function deleteEventType(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const payload = validateEventTypesDeleteInput(input);
    return createEventTypesClient({
      token: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).delete(payload.id).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "cal-com", action: "event_types.delete", source: "connector", eventType: result.eventType };
    });
  }
  return { connector: "cal-com", action: "event_types.delete", source: "connector", validated: validateEventTypesDeleteInput(input) };
}

// ─── bookings.list ────────────────────────────────────────────────────────────

export type BookingsListInput = {
  status?: string;
  attendeeEmail?: string;
  eventTypeId?: number;
  afterStart?: string;
  beforeEnd?: string;
  take?: number;
  skip?: number;
};

export function validateBookingsListInput(input: unknown): BookingsListInput {
  if (!isRecord(input)) throw new Error("bookings.list input must be an object");
  const payload: BookingsListInput = {};
  if (typeof input.status === "string") payload.status = input.status;
  if (typeof input.attendeeEmail === "string") payload.attendeeEmail = input.attendeeEmail;
  if (typeof input.eventTypeId === "number") payload.eventTypeId = input.eventTypeId;
  if (typeof input.afterStart === "string") payload.afterStart = input.afterStart;
  if (typeof input.beforeEnd === "string") payload.beforeEnd = input.beforeEnd;
  if (typeof input.take === "number") payload.take = input.take;
  if (typeof input.skip === "number") payload.skip = input.skip;
  return payload;
}

export function createBookingsClient(options: { token: string; fetch?: typeof fetch }) {
  const client = createCalComClient({ token: options.token, fetch: options.fetch, operation: "bookings.list", calApiVersion: "2024-08-13" });
  return {
    async list(input: unknown) {
      const payload = validateBookingsListInput(input);
      const params = new URLSearchParams();
      if (payload.status) params.set("status", payload.status);
      if (payload.attendeeEmail) params.set("attendeeEmail", payload.attendeeEmail);
      if (payload.eventTypeId !== undefined) params.set("eventTypeId", String(payload.eventTypeId));
      if (payload.afterStart) params.set("afterStart", payload.afterStart);
      if (payload.beforeEnd) params.set("beforeEnd", payload.beforeEnd);
      if (payload.take !== undefined) params.set("take", String(payload.take));
      if (payload.skip !== undefined) params.set("skip", String(payload.skip));
      const query = params.toString();
      const response = await client.fetchJSON(`/bookings${query ? `?${query}` : ""}`);
      if (response.status === 200) {
        const data = unwrapEnvelope(response.body);
        const bookings = Array.isArray(data) ? data : isRecord(data) && Array.isArray(data.bookings) ? data.bookings : [];
        return { ok: true as const, bookings };
      }
      return handleError(response.status, response.headers, "Cal.com rejected the bookings.list request.");
    },

    async get(uid: string) {
      const response = await client.fetchJSON(`/bookings/${uid}`);
      if (response.status === 200) {
        const data = unwrapEnvelope(response.body);
        return { ok: true as const, booking: data };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Booking not found." } };
      }
      return handleError(response.status, response.headers, "Cal.com rejected the bookings.get request.");
    },

    async create(input: unknown) {
      if (!isRecord(input)) throw new Error("bookings.create input must be an object");
      const start = requireString(input.start, "start");
      const eventTypeId = requireNumber(input.eventTypeId, "eventTypeId");
      if (!isRecord(input.attendee)) throw new Error("attendee is required");
      const attendee = {
        name: requireString(input.attendee.name, "attendee.name"),
        email: requireString(input.attendee.email, "attendee.email"),
        timeZone: requireString(input.attendee.timeZone, "attendee.timeZone"),
        ...(typeof input.attendee.language === "string" ? { language: input.attendee.language } : {}),
      };
      const body: Record<string, unknown> = { start, eventTypeId, attendee };
      if (typeof input.location === "string") body.location = input.location;
      if (isRecord(input.metadata)) body.metadata = input.metadata;
      if (typeof input.lengthInMinutes === "number") body.lengthInMinutes = input.lengthInMinutes;
      const response = await client.fetchJSON("/bookings", { method: "POST", body: JSON.stringify(body) });
      if (response.status === 200 || response.status === 201) {
        const data = unwrapEnvelope(response.body);
        return { ok: true as const, booking: data };
      }
      return handleError(response.status, response.headers, "Cal.com rejected the bookings.create request.");
    },

    async cancel(uid: string, cancellationReason?: string) {
      const body: Record<string, unknown> = {};
      if (cancellationReason) body.cancellationReason = cancellationReason;
      const response = await client.fetchJSON(`/bookings/${uid}/cancel`, { method: "POST", body: JSON.stringify(body) });
      if (response.status === 200 || response.status === 201) {
        const data = unwrapEnvelope(response.body);
        return { ok: true as const, booking: data };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Booking not found." } };
      }
      return handleError(response.status, response.headers, "Cal.com rejected the bookings.cancel request.");
    },

    async reschedule(uid: string, start: string, reschedulingReason?: string) {
      const body: Record<string, unknown> = { start };
      if (reschedulingReason) body.reschedulingReason = reschedulingReason;
      const response = await client.fetchJSON(`/bookings/${uid}/reschedule`, { method: "POST", body: JSON.stringify(body) });
      if (response.status === 200 || response.status === 201) {
        const data = unwrapEnvelope(response.body);
        return { ok: true as const, booking: data };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Booking not found." } };
      }
      return handleError(response.status, response.headers, "Cal.com rejected the bookings.reschedule request.");
    },

    async confirm(uid: string) {
      const response = await client.fetchJSON(`/bookings/${uid}/confirm`, { method: "POST", body: JSON.stringify({}) });
      if (response.status === 200 || response.status === 201) {
        const data = unwrapEnvelope(response.body);
        return { ok: true as const, booking: data };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Booking not found." } };
      }
      return handleError(response.status, response.headers, "Cal.com rejected the bookings.confirm request.");
    },

    async decline(uid: string, reason?: string) {
      const body: Record<string, unknown> = {};
      if (reason) body.reason = reason;
      const response = await client.fetchJSON(`/bookings/${uid}/decline`, { method: "POST", body: JSON.stringify(body) });
      if (response.status === 200 || response.status === 201) {
        const data = unwrapEnvelope(response.body);
        return { ok: true as const, booking: data };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Booking not found." } };
      }
      return handleError(response.status, response.headers, "Cal.com rejected the bookings.decline request.");
    },
  };
}

export function validateBookingsGetInput(input: unknown): { uid: string } {
  if (!isRecord(input)) throw new Error("bookings.get input must be an object");
  return { uid: requireString(input.uid, "uid") };
}

export type BookingsCreateInput = {
  start: string;
  eventTypeId: number;
  attendee: { name: string; email: string; timeZone: string; language?: string };
  location?: string;
  metadata?: Record<string, unknown>;
  lengthInMinutes?: number;
};

export function validateBookingsCreateInput(input: unknown): BookingsCreateInput {
  if (!isRecord(input)) throw new Error("bookings.create input must be an object");
  const start = requireString(input.start, "start");
  const eventTypeId = requireNumber(input.eventTypeId, "eventTypeId");
  if (!isRecord(input.attendee)) throw new Error("attendee is required");
  const attendee: BookingsCreateInput["attendee"] = {
    name: requireString(input.attendee.name, "attendee.name"),
    email: requireString(input.attendee.email, "attendee.email"),
    timeZone: requireString(input.attendee.timeZone, "attendee.timeZone"),
  };
  if (typeof input.attendee.language === "string") attendee.language = input.attendee.language;
  return {
    start,
    eventTypeId,
    attendee,
    location: typeof input.location === "string" ? input.location : undefined,
    metadata: isRecord(input.metadata) ? input.metadata as Record<string, unknown> : undefined,
    lengthInMinutes: typeof input.lengthInMinutes === "number" ? input.lengthInMinutes : undefined,
  };
}

export function validateBookingsCancelInput(input: unknown): { uid: string; cancellationReason?: string } {
  if (!isRecord(input)) throw new Error("bookings.cancel input must be an object");
  return {
    uid: requireString(input.uid, "uid"),
    cancellationReason: typeof input.cancellationReason === "string" ? input.cancellationReason : undefined,
  };
}

export function validateBookingsRescheduleInput(input: unknown): { uid: string; start: string; reschedulingReason?: string } {
  if (!isRecord(input)) throw new Error("bookings.reschedule input must be an object");
  return {
    uid: requireString(input.uid, "uid"),
    start: requireString(input.start, "start"),
    reschedulingReason: typeof input.reschedulingReason === "string" ? input.reschedulingReason : undefined,
  };
}

export function validateBookingsConfirmInput(input: unknown): { uid: string } {
  if (!isRecord(input)) throw new Error("bookings.confirm input must be an object");
  return { uid: requireString(input.uid, "uid") };
}

export function validateBookingsDeclineInput(input: unknown): { uid: string; reason?: string } {
  if (!isRecord(input)) throw new Error("bookings.decline input must be an object");
  return {
    uid: requireString(input.uid, "uid"),
    reason: typeof input.reason === "string" ? input.reason : undefined,
  };
}

export function listBookings(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createBookingsClient({
      token: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).list(input).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "cal-com", action: "bookings.list", source: "connector", bookings: result.bookings };
    });
  }
  return { connector: "cal-com", action: "bookings.list", source: "connector", validated: validateBookingsListInput(input) };
}

export function getBooking(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const payload = validateBookingsGetInput(input);
    return createBookingsClient({
      token: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).get(payload.uid).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "cal-com", action: "bookings.get", source: "connector", booking: result.booking };
    });
  }
  return { connector: "cal-com", action: "bookings.get", source: "connector", validated: validateBookingsGetInput(input) };
}

export function createBooking(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createBookingsClient({
      token: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).create(input).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "cal-com", action: "bookings.create", source: "connector", booking: result.booking };
    });
  }
  return { connector: "cal-com", action: "bookings.create", source: "connector", validated: validateBookingsCreateInput(input) };
}

export function cancelBooking(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const payload = validateBookingsCancelInput(input);
    return createBookingsClient({
      token: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).cancel(payload.uid, payload.cancellationReason).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "cal-com", action: "bookings.cancel", source: "connector", booking: result.booking };
    });
  }
  return { connector: "cal-com", action: "bookings.cancel", source: "connector", validated: validateBookingsCancelInput(input) };
}

export function rescheduleBooking(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const payload = validateBookingsRescheduleInput(input);
    return createBookingsClient({
      token: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).reschedule(payload.uid, payload.start, payload.reschedulingReason).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "cal-com", action: "bookings.reschedule", source: "connector", booking: result.booking };
    });
  }
  return { connector: "cal-com", action: "bookings.reschedule", source: "connector", validated: validateBookingsRescheduleInput(input) };
}

export function confirmBooking(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const payload = validateBookingsConfirmInput(input);
    return createBookingsClient({
      token: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).confirm(payload.uid).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "cal-com", action: "bookings.confirm", source: "connector", booking: result.booking };
    });
  }
  return { connector: "cal-com", action: "bookings.confirm", source: "connector", validated: validateBookingsConfirmInput(input) };
}

export function declineBooking(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const payload = validateBookingsDeclineInput(input);
    return createBookingsClient({
      token: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).decline(payload.uid, payload.reason).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "cal-com", action: "bookings.decline", source: "connector", booking: result.booking };
    });
  }
  return { connector: "cal-com", action: "bookings.decline", source: "connector", validated: validateBookingsDeclineInput(input) };
}

// ─── slots.available ──────────────────────────────────────────────────────────

export type SlotsAvailableInput = {
  eventTypeId: number;
  start: string;
  end: string;
  timeZone?: string;
};

export function validateSlotsAvailableInput(input: unknown): SlotsAvailableInput {
  if (!isRecord(input)) throw new Error("slots.available input must be an object");
  return {
    eventTypeId: requireNumber(input.eventTypeId, "eventTypeId"),
    start: requireString(input.start, "start"),
    end: requireString(input.end, "end"),
    timeZone: typeof input.timeZone === "string" ? input.timeZone : undefined,
  };
}

export function createSlotsClient(options: { token: string; fetch?: typeof fetch }) {
  const client = createCalComClient({ token: options.token, fetch: options.fetch, operation: "slots.available", calApiVersion: "2024-09-04" });
  return {
    async available(input: unknown) {
      const payload = validateSlotsAvailableInput(input);
      const params = new URLSearchParams({
        eventTypeId: String(payload.eventTypeId),
        start: payload.start,
        end: payload.end,
      });
      if (payload.timeZone) params.set("timeZone", payload.timeZone);
      const response = await client.fetchJSON(`/slots?${params.toString()}`, {}, "2024-09-04");
      if (response.status === 200) {
        const data = unwrapEnvelope(response.body);
        const slots = isRecord(data) && isRecord(data.slots) ? data.slots : isRecord(data) ? data : {};
        return { ok: true as const, slots };
      }
      return handleError(response.status, response.headers, "Cal.com rejected the slots.available request.");
    },
  };
}

export function getAvailableSlots(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createSlotsClient({
      token: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).available(input).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "cal-com", action: "slots.available", source: "connector", slots: result.slots };
    });
  }
  return { connector: "cal-com", action: "slots.available", source: "connector", validated: validateSlotsAvailableInput(input) };
}

// ─── schedules.list ───────────────────────────────────────────────────────────

export function validateSchedulesListInput(input: unknown): Record<string, never> {
  if (!isRecord(input)) throw new Error("schedules.list input must be an object");
  return {};
}

export function createSchedulesClient(options: { token: string; fetch?: typeof fetch }) {
  const client = createCalComClient({ token: options.token, fetch: options.fetch, operation: "schedules.list" });
  return {
    async list() {
      const response = await client.fetchJSON("/schedules");
      if (response.status === 200) {
        const data = unwrapEnvelope(response.body);
        const schedules = Array.isArray(data) ? data : isRecord(data) && Array.isArray(data.schedules) ? data.schedules : [];
        return { ok: true as const, schedules };
      }
      return handleError(response.status, response.headers, "Cal.com rejected the schedules.list request.");
    },

    async get(id: number) {
      const response = await client.fetchJSON(`/schedules/${id}`, {}, "2024-06-11");
      if (response.status === 200) {
        const data = unwrapEnvelope(response.body);
        return { ok: true as const, schedule: data };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Schedule not found." } };
      }
      return handleError(response.status, response.headers, "Cal.com rejected the schedules.get request.");
    },

    async create(input: unknown) {
      const payload = validateSchedulesCreateInput(input);
      const body: Record<string, unknown> = { name: payload.name, timeZone: payload.timeZone };
      if (payload.isDefault !== undefined) body.isDefault = payload.isDefault;
      if (payload.availability !== undefined) body.availability = payload.availability;
      const response = await client.fetchJSON("/schedules", { method: "POST", body: JSON.stringify(body) }, "2024-06-11");
      if (isSuccessStatus(response.status)) {
        const data = unwrapEnvelope(response.body);
        return { ok: true as const, schedule: data };
      }
      return handleError(response.status, response.headers, "Cal.com rejected the schedules.create request.");
    },

    async update(input: unknown) {
      const payload = validateSchedulesUpdateInput(input);
      const body: Record<string, unknown> = {};
      if (payload.name !== undefined) body.name = payload.name;
      if (payload.timeZone !== undefined) body.timeZone = payload.timeZone;
      if (payload.isDefault !== undefined) body.isDefault = payload.isDefault;
      if (payload.availability !== undefined) body.availability = payload.availability;
      const response = await client.fetchJSON(`/schedules/${payload.id}`, { method: "PATCH", body: JSON.stringify(body) }, "2024-06-11");
      if (isSuccessStatus(response.status)) {
        const data = unwrapEnvelope(response.body);
        return { ok: true as const, schedule: data };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Schedule not found." } };
      }
      return handleError(response.status, response.headers, "Cal.com rejected the schedules.update request.");
    },

    async delete(id: number) {
      const response = await client.fetchJSON(`/schedules/${id}`, { method: "DELETE" }, "2024-06-11");
      if (isSuccessStatus(response.status)) {
        const data = unwrapEnvelope(response.body);
        return { ok: true as const, schedule: data };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Schedule not found." } };
      }
      return handleError(response.status, response.headers, "Cal.com rejected the schedules.delete request.");
    },
  };
}

export function listSchedules(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createSchedulesClient({
      token: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).list().then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "cal-com", action: "schedules.list", source: "connector", schedules: result.schedules };
    });
  }
  return { connector: "cal-com", action: "schedules.list", source: "connector", validated: validateSchedulesListInput(input) };
}

export function validateSchedulesGetInput(input: unknown): { id: number } {
  if (!isRecord(input)) throw new Error("schedules.get input must be an object");
  return { id: requireNumber(input.id, "id") };
}

export type SchedulesCreateInput = {
  name: string;
  timeZone: string;
  isDefault?: boolean;
  availability?: unknown[];
};

export function validateSchedulesCreateInput(input: unknown): SchedulesCreateInput {
  if (!isRecord(input)) throw new Error("schedules.create input must be an object");
  const payload: SchedulesCreateInput = {
    name: requireString(input.name, "name"),
    timeZone: requireString(input.timeZone, "timeZone"),
  };
  if (typeof input.isDefault === "boolean") payload.isDefault = input.isDefault;
  if (Array.isArray(input.availability)) payload.availability = input.availability;
  return payload;
}

export type SchedulesUpdateInput = {
  id: number;
  name?: string;
  timeZone?: string;
  isDefault?: boolean;
  availability?: unknown[];
};

export function validateSchedulesUpdateInput(input: unknown): SchedulesUpdateInput {
  if (!isRecord(input)) throw new Error("schedules.update input must be an object");
  const payload: SchedulesUpdateInput = { id: requireNumber(input.id, "id") };
  if (typeof input.name === "string") payload.name = input.name;
  if (typeof input.timeZone === "string") payload.timeZone = input.timeZone;
  if (typeof input.isDefault === "boolean") payload.isDefault = input.isDefault;
  if (Array.isArray(input.availability)) payload.availability = input.availability;
  return payload;
}

export function validateSchedulesDeleteInput(input: unknown): { id: number } {
  if (!isRecord(input)) throw new Error("schedules.delete input must be an object");
  return { id: requireNumber(input.id, "id") };
}

export function getSchedule(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const payload = validateSchedulesGetInput(input);
    return createSchedulesClient({
      token: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).get(payload.id).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "cal-com", action: "schedules.get", source: "connector", schedule: result.schedule };
    });
  }
  return { connector: "cal-com", action: "schedules.get", source: "connector", validated: validateSchedulesGetInput(input) };
}

export function createSchedule(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createSchedulesClient({
      token: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).create(input).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "cal-com", action: "schedules.create", source: "connector", schedule: result.schedule };
    });
  }
  return { connector: "cal-com", action: "schedules.create", source: "connector", validated: validateSchedulesCreateInput(input) };
}

export function updateSchedule(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createSchedulesClient({
      token: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).update(input).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "cal-com", action: "schedules.update", source: "connector", schedule: result.schedule };
    });
  }
  return { connector: "cal-com", action: "schedules.update", source: "connector", validated: validateSchedulesUpdateInput(input) };
}

export function deleteSchedule(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const payload = validateSchedulesDeleteInput(input);
    return createSchedulesClient({
      token: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).delete(payload.id).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "cal-com", action: "schedules.delete", source: "connector", schedule: result.schedule };
    });
  }
  return { connector: "cal-com", action: "schedules.delete", source: "connector", validated: validateSchedulesDeleteInput(input) };
}

// ─── availability.get ─────────────────────────────────────────────────────────

export type AvailabilityGetInput = { dateFrom: string; dateTo: string; timeZone?: string };

export function validateAvailabilityGetInput(input: unknown): AvailabilityGetInput {
  if (!isRecord(input)) throw new Error("availability.get input must be an object");
  return {
    dateFrom: requireString(input.dateFrom, "dateFrom"),
    dateTo: requireString(input.dateTo, "dateTo"),
    timeZone: typeof input.timeZone === "string" ? input.timeZone : undefined,
  };
}

export function createAvailabilityClient(options: { token: string; fetch?: typeof fetch }) {
  const client = createCalComClient({ token: options.token, fetch: options.fetch, operation: "availability.get" });
  return {
    async get(input: unknown) {
      const payload = validateAvailabilityGetInput(input);
      const params = new URLSearchParams({ dateFrom: payload.dateFrom, dateTo: payload.dateTo });
      if (payload.timeZone) params.set("timeZone", payload.timeZone);
      const response = await client.fetchJSON(`/calendars/busy-times?${params.toString()}`);
      if (response.status === 200) {
        const data = unwrapEnvelope(response.body);
        const busyTimes = Array.isArray(data) ? data : [];
        return { ok: true as const, busyTimes };
      }
      return handleError(response.status, response.headers, "Cal.com rejected the availability.get request.");
    },
  };
}

export function getAvailability(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createAvailabilityClient({
      token: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).get(input).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "cal-com", action: "availability.get", source: "connector", busyTimes: result.busyTimes };
    });
  }
  return { connector: "cal-com", action: "availability.get", source: "connector", validated: validateAvailabilityGetInput(input) };
}

// ─── webhooks ─────────────────────────────────────────────────────────────────

export type WebhooksListInput = { take?: number; skip?: number };

export function validateWebhooksListInput(input: unknown): WebhooksListInput {
  if (!isRecord(input)) throw new Error("webhooks.list input must be an object");
  const payload: WebhooksListInput = {};
  if (typeof input.take === "number") payload.take = input.take;
  if (typeof input.skip === "number") payload.skip = input.skip;
  return payload;
}

export type WebhooksCreateInput = {
  subscriberUrl: string;
  triggers: string[];
  active?: boolean;
  secret?: string;
  payloadTemplate?: string;
};

export function validateWebhooksCreateInput(input: unknown): WebhooksCreateInput {
  if (!isRecord(input)) throw new Error("webhooks.create input must be an object");
  const payload: WebhooksCreateInput = {
    subscriberUrl: requireString(input.subscriberUrl, "subscriberUrl"),
    triggers: requireStringArray(input.triggers, "triggers"),
  };
  if (typeof input.active === "boolean") payload.active = input.active;
  if (typeof input.secret === "string") payload.secret = input.secret;
  if (typeof input.payloadTemplate === "string") payload.payloadTemplate = input.payloadTemplate;
  return payload;
}

export function validateWebhooksGetInput(input: unknown): { id: number } {
  if (!isRecord(input)) throw new Error("webhooks.get input must be an object");
  return { id: requireNumber(input.id, "id") };
}

export function validateWebhooksDeleteInput(input: unknown): { id: number } {
  if (!isRecord(input)) throw new Error("webhooks.delete input must be an object");
  return { id: requireNumber(input.id, "id") };
}

export function createWebhooksClient(options: { token: string; fetch?: typeof fetch }) {
  const client = createCalComClient({ token: options.token, fetch: options.fetch, operation: "webhooks.list" });
  return {
    async list(input: unknown) {
      const payload = validateWebhooksListInput(input);
      const params = new URLSearchParams();
      if (payload.take !== undefined) params.set("take", String(payload.take));
      if (payload.skip !== undefined) params.set("skip", String(payload.skip));
      const query = params.toString();
      const response = await client.fetchJSON(`/webhooks${query ? `?${query}` : ""}`);
      if (response.status === 200) {
        const data = unwrapEnvelope(response.body);
        const webhooks = Array.isArray(data) ? data : isRecord(data) && Array.isArray(data.webhooks) ? data.webhooks : [];
        return { ok: true as const, webhooks };
      }
      return handleError(response.status, response.headers, "Cal.com rejected the webhooks.list request.");
    },

    async create(input: unknown) {
      const payload = validateWebhooksCreateInput(input);
      const body: Record<string, unknown> = {
        subscriberUrl: payload.subscriberUrl,
        triggers: payload.triggers,
        active: payload.active ?? true,
      };
      if (payload.secret !== undefined) body.secret = payload.secret;
      if (payload.payloadTemplate !== undefined) body.payloadTemplate = payload.payloadTemplate;
      const response = await client.fetchJSON("/webhooks", { method: "POST", body: JSON.stringify(body) });
      if (isSuccessStatus(response.status)) {
        const data = unwrapEnvelope(response.body);
        return { ok: true as const, webhook: data };
      }
      return handleError(response.status, response.headers, "Cal.com rejected the webhooks.create request.");
    },

    async get(id: number) {
      const response = await client.fetchJSON(`/webhooks/${id}`);
      if (response.status === 200) {
        const data = unwrapEnvelope(response.body);
        return { ok: true as const, webhook: data };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Webhook not found." } };
      }
      return handleError(response.status, response.headers, "Cal.com rejected the webhooks.get request.");
    },

    async delete(id: number) {
      const response = await client.fetchJSON(`/webhooks/${id}`, { method: "DELETE" });
      if (isSuccessStatus(response.status)) {
        const data = unwrapEnvelope(response.body);
        return { ok: true as const, webhook: data };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Webhook not found." } };
      }
      return handleError(response.status, response.headers, "Cal.com rejected the webhooks.delete request.");
    },
  };
}

export function listWebhooks(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createWebhooksClient({
      token: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).list(input).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "cal-com", action: "webhooks.list", source: "connector", webhooks: result.webhooks };
    });
  }
  return { connector: "cal-com", action: "webhooks.list", source: "connector", validated: validateWebhooksListInput(input) };
}

export function createWebhook(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createWebhooksClient({
      token: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).create(input).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "cal-com", action: "webhooks.create", source: "connector", webhook: result.webhook };
    });
  }
  return { connector: "cal-com", action: "webhooks.create", source: "connector", validated: validateWebhooksCreateInput(input) };
}

export function getWebhook(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const payload = validateWebhooksGetInput(input);
    return createWebhooksClient({
      token: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).get(payload.id).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "cal-com", action: "webhooks.get", source: "connector", webhook: result.webhook };
    });
  }
  return { connector: "cal-com", action: "webhooks.get", source: "connector", validated: validateWebhooksGetInput(input) };
}

export function deleteWebhook(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    const payload = validateWebhooksDeleteInput(input);
    return createWebhooksClient({
      token: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).delete(payload.id).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "cal-com", action: "webhooks.delete", source: "connector", webhook: result.webhook };
    });
  }
  return { connector: "cal-com", action: "webhooks.delete", source: "connector", validated: validateWebhooksDeleteInput(input) };
}
