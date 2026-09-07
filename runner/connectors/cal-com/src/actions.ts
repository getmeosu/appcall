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
  };
}

export function validateEventTypesGetInput(input: unknown): { id: number } {
  if (!isRecord(input)) throw new Error("event_types.get input must be an object");
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
