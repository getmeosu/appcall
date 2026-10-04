import { createCalendlyClient, parseCalendlyRateLimit, isRecord, prop } from "./http";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function requireUuid(value: unknown, field: string): string {
  const raw = requireString(value, field);
  const parts = raw.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? raw;
}

function handleError(status: number, headers: Record<string, string>, fallbackMessage: string): { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } } {
  const rl = parseCalendlyRateLimit(status, headers);
  if (rl.limited) {
    return { ok: false, error: { code: "CONNECTOR_RATE_LIMITED", message: "Calendly rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
  }
  return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: fallbackMessage } };
}

function throwIfError(result: { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } }): never {
  throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
}

// ─── users.me ─────────────────────────────────────────────────────────────────

export type UsersMeActionInput = { accessToken?: string; fetch?: typeof fetch };

export function validateUsersMeInput(input: unknown): Record<string, never> {
  if (!isRecord(input)) throw new Error("users.me input must be an object");
  return {};
}

export function createUsersMeClient(options: { accessToken: string; fetch?: typeof fetch }) {
  const client = createCalendlyClient({ accessToken: options.accessToken, fetch: options.fetch, operation: "users.me.action" });
  return {
    async get() {
      const response = await client.fetchJSON("/users/me");
      if (response.status === 200) {
        const body = response.body as Record<string, unknown>;
        const resource = isRecord(body.resource) ? body.resource : body;
        return { ok: true as const, user: resource };
      }
      return handleError(response.status, response.headers, "Calendly rejected the users.me request.");
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
      return { connector: "calendly", action: "users.me.action", source: "connector", user: result.user };
    });
  }
  return { connector: "calendly", action: "users.me.action", source: "connector", validated: validateUsersMeInput(input) };
}

// ─── event_types.list ─────────────────────────────────────────────────────────

export type EventTypesListInput = { user: string; organization?: string; active?: boolean; count?: number; pageToken?: string };

export function validateEventTypesListInput(input: unknown): EventTypesListInput {
  if (!isRecord(input)) throw new Error("event_types.list input must be an object");
  return {
    user: requireString(input.user, "user"),
    organization: typeof input.organization === "string" ? input.organization : undefined,
    active: typeof input.active === "boolean" ? input.active : undefined,
    count: typeof input.count === "number" ? input.count : undefined,
    pageToken: typeof input.pageToken === "string" ? input.pageToken : undefined,
  };
}

export function createEventTypesClient(options: { accessToken: string; fetch?: typeof fetch }) {
  const client = createCalendlyClient({ accessToken: options.accessToken, fetch: options.fetch, operation: "event_types.list" });
  return {
    async list(input: unknown) {
      const payload = validateEventTypesListInput(input);
      const params = new URLSearchParams({ user: payload.user });
      if (payload.organization) params.set("organization", payload.organization);
      if (payload.active !== undefined) params.set("active", String(payload.active));
      if (payload.count !== undefined) params.set("count", String(payload.count));
      if (payload.pageToken) params.set("page_token", payload.pageToken);
      const response = await client.fetchJSON(`/event_types?${params.toString()}`);
      if (response.status === 200) {
        const body = response.body as Record<string, unknown>;
        const collection = Array.isArray(body.collection) ? body.collection : [];
        return { ok: true as const, eventTypes: collection, pagination: isRecord(body.pagination) ? body.pagination : {} };
      }
      return handleError(response.status, response.headers, "Calendly rejected the event_types.list request.");
    },
  };
}

export function listEventTypes(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createEventTypesClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).list(input).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "calendly", action: "event_types.list", source: "connector", eventTypes: result.eventTypes, pagination: result.pagination };
    });
  }
  return { connector: "calendly", action: "event_types.list", source: "connector", validated: validateEventTypesListInput(input) };
}

// ─── scheduled_events.list ────────────────────────────────────────────────────

export type ScheduledEventsListInput = { user?: string; organization?: string; status?: string; count?: number; pageToken?: string; minStartTime?: string; maxStartTime?: string };

export function validateScheduledEventsListInput(input: unknown): ScheduledEventsListInput {
  if (!isRecord(input)) throw new Error("scheduled_events.list input must be an object");
  const payload: ScheduledEventsListInput = {};
  if (typeof input.user === "string") payload.user = input.user;
  if (typeof input.organization === "string") payload.organization = input.organization;
  if (typeof input.status === "string") payload.status = input.status;
  if (typeof input.count === "number") payload.count = input.count;
  if (typeof input.pageToken === "string") payload.pageToken = input.pageToken;
  if (typeof input.minStartTime === "string") payload.minStartTime = input.minStartTime;
  if (typeof input.maxStartTime === "string") payload.maxStartTime = input.maxStartTime;
  return payload;
}

export function createScheduledEventsClient(options: { accessToken: string; fetch?: typeof fetch }) {
  const client = createCalendlyClient({ accessToken: options.accessToken, fetch: options.fetch, operation: "scheduled_events.list" });
  return {
    async list(input: unknown) {
      const payload = validateScheduledEventsListInput(input);
      const params = new URLSearchParams();
      if (payload.user) params.set("user", payload.user);
      if (payload.organization) params.set("organization", payload.organization);
      if (payload.status) params.set("status", payload.status);
      if (payload.count !== undefined) params.set("count", String(payload.count));
      if (payload.pageToken) params.set("page_token", payload.pageToken);
      if (payload.minStartTime) params.set("min_start_time", payload.minStartTime);
      if (payload.maxStartTime) params.set("max_start_time", payload.maxStartTime);
      const query = params.toString();
      const response = await client.fetchJSON(`/scheduled_events${query ? `?${query}` : ""}`);
      if (response.status === 200) {
        const body = response.body as Record<string, unknown>;
        const collection = Array.isArray(body.collection) ? body.collection : [];
        return { ok: true as const, events: collection, pagination: isRecord(body.pagination) ? body.pagination : {} };
      }
      return handleError(response.status, response.headers, "Calendly rejected the scheduled_events.list request.");
    },

    async get(input: unknown) {
      if (!isRecord(input)) throw new Error("scheduled_events.get input must be an object");
      const uuid = requireString(input.uuid, "uuid");
      const response = await client.fetchJSON(`/scheduled_events/${uuid}`);
      if (response.status === 200) {
        const body = response.body as Record<string, unknown>;
        const resource = isRecord(body.resource) ? body.resource : body;
        return { ok: true as const, event: resource };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Scheduled event not found." } };
      }
      return handleError(response.status, response.headers, "Calendly rejected the scheduled_events.get request.");
    },

    async cancel(input: unknown) {
      if (!isRecord(input)) throw new Error("scheduled_events.cancel input must be an object");
      const uuid = requireString(input.uuid, "uuid");
      const body: Record<string, string> = {};
      if (typeof input.reason === "string") body.reason = input.reason;
      const response = await client.fetchJSON(`/scheduled_events/${uuid}/cancellation`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (response.status === 201 || response.status === 200) {
        const respBody = response.body as Record<string, unknown>;
        const resource = isRecord(respBody.resource) ? respBody.resource : respBody;
        return { ok: true as const, cancellation: resource };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Scheduled event not found." } };
      }
      return handleError(response.status, response.headers, "Calendly rejected the scheduled_events.cancel request.");
    },
  };
}

export function validateScheduledEventsGetInput(input: unknown): { uuid: string } {
  if (!isRecord(input)) throw new Error("scheduled_events.get input must be an object");
  return { uuid: requireString(input.uuid, "uuid") };
}

export function validateScheduledEventsCancelInput(input: unknown): { uuid: string; reason?: string } {
  if (!isRecord(input)) throw new Error("scheduled_events.cancel input must be an object");
  return {
    uuid: requireString(input.uuid, "uuid"),
    reason: typeof input.reason === "string" ? input.reason : undefined,
  };
}

export function listScheduledEvents(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createScheduledEventsClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).list(input).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "calendly", action: "scheduled_events.list", source: "connector", events: result.events, pagination: result.pagination };
    });
  }
  return { connector: "calendly", action: "scheduled_events.list", source: "connector", validated: validateScheduledEventsListInput(input) };
}

export function getScheduledEvent(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createScheduledEventsClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).get(input).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "calendly", action: "scheduled_events.get", source: "connector", event: result.event };
    });
  }
  return { connector: "calendly", action: "scheduled_events.get", source: "connector", validated: validateScheduledEventsGetInput(input) };
}

export function cancelScheduledEvent(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createScheduledEventsClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).cancel(input).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "calendly", action: "scheduled_events.cancel", source: "connector", cancellation: result.cancellation };
    });
  }
  return { connector: "calendly", action: "scheduled_events.cancel", source: "connector", validated: validateScheduledEventsCancelInput(input) };
}

// ─── scheduled_events.invitees.list ───────────────────────────────────────────

export type InviteesListInput = { uuid: string; status?: string; count?: number; pageToken?: string; email?: string };

export function validateInviteesListInput(input: unknown): InviteesListInput {
  if (!isRecord(input)) throw new Error("scheduled_events.invitees.list input must be an object");
  return {
    uuid: requireString(input.uuid, "uuid"),
    status: typeof input.status === "string" ? input.status : undefined,
    count: typeof input.count === "number" ? input.count : undefined,
    pageToken: typeof input.pageToken === "string" ? input.pageToken : undefined,
    email: typeof input.email === "string" ? input.email : undefined,
  };
}

export function createInviteesClient(options: { accessToken: string; fetch?: typeof fetch }) {
  const client = createCalendlyClient({ accessToken: options.accessToken, fetch: options.fetch, operation: "scheduled_events.invitees.list" });
  return {
    async list(input: unknown) {
      const payload = validateInviteesListInput(input);
      const params = new URLSearchParams();
      if (payload.status) params.set("status", payload.status);
      if (payload.count !== undefined) params.set("count", String(payload.count));
      if (payload.pageToken) params.set("page_token", payload.pageToken);
      if (payload.email) params.set("email", payload.email);
      const query = params.toString();
      const response = await client.fetchJSON(`/scheduled_events/${payload.uuid}/invitees${query ? `?${query}` : ""}`);
      if (response.status === 200) {
        const body = response.body as Record<string, unknown>;
        const collection = Array.isArray(body.collection) ? body.collection : [];
        return { ok: true as const, invitees: collection, pagination: isRecord(body.pagination) ? body.pagination : {} };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Scheduled event not found." } };
      }
      return handleError(response.status, response.headers, "Calendly rejected the invitees.list request.");
    },
  };
}

export function listInvitees(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createInviteesClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).list(input).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "calendly", action: "scheduled_events.invitees.list", source: "connector", invitees: result.invitees, pagination: result.pagination };
    });
  }
  return { connector: "calendly", action: "scheduled_events.invitees.list", source: "connector", validated: validateInviteesListInput(input) };
}

// ─── invitee_no_shows.create ──────────────────────────────────────────────────

export type InviteeNoShowCreateInput = { invitee: string };

export function validateInviteeNoShowCreateInput(input: unknown): InviteeNoShowCreateInput {
  if (!isRecord(input)) throw new Error("invitee_no_shows.create input must be an object");
  return { invitee: requireString(input.invitee, "invitee") };
}

export function createInviteeNoShowsClient(options: { accessToken: string; fetch?: typeof fetch }) {
  const client = createCalendlyClient({ accessToken: options.accessToken, fetch: options.fetch, operation: "invitee_no_shows.create" });
  return {
    async create(input: unknown) {
      const payload = validateInviteeNoShowCreateInput(input);
      const response = await client.fetchJSON("/invitee_no_shows", {
        method: "POST",
        body: JSON.stringify({ invitee: payload.invitee }),
      });
      if (response.status === 201) {
        const body = response.body as Record<string, unknown>;
        const resource = isRecord(body.resource) ? body.resource : body;
        return { ok: true as const, noShow: resource };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Invitee not found." } };
      }
      return handleError(response.status, response.headers, "Calendly rejected the invitee_no_shows.create request.");
    },
  };
}

export function createInviteeNoShow(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createInviteeNoShowsClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).create(input).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "calendly", action: "invitee_no_shows.create", source: "connector", noShow: result.noShow };
    });
  }
  return { connector: "calendly", action: "invitee_no_shows.create", source: "connector", validated: validateInviteeNoShowCreateInput(input) };
}

// ─── scheduling_links.create ──────────────────────────────────────────────────

export type SchedulingLinkCreateInput = { owner: string; ownerType: string; maxEventCount?: number };

export function validateSchedulingLinkCreateInput(input: unknown): SchedulingLinkCreateInput {
  if (!isRecord(input)) throw new Error("scheduling_links.create input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    ownerType: requireString(input.ownerType, "ownerType"),
    maxEventCount: typeof input.maxEventCount === "number" ? input.maxEventCount : undefined,
  };
}

export function createSchedulingLinksClient(options: { accessToken: string; fetch?: typeof fetch }) {
  const client = createCalendlyClient({ accessToken: options.accessToken, fetch: options.fetch, operation: "scheduling_links.create" });
  return {
    async create(input: unknown) {
      const payload = validateSchedulingLinkCreateInput(input);
      const body: Record<string, unknown> = {
        owner: payload.owner,
        owner_type: payload.ownerType,
      };
      if (payload.maxEventCount !== undefined) body.max_event_count = payload.maxEventCount;
      const response = await client.fetchJSON("/scheduling_links", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (response.status === 201) {
        const respBody = response.body as Record<string, unknown>;
        const resource = isRecord(respBody.resource) ? respBody.resource : respBody;
        return { ok: true as const, link: resource };
      }
      return handleError(response.status, response.headers, "Calendly rejected the scheduling_links.create request.");
    },
  };
}

export function createSchedulingLink(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createSchedulingLinksClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).create(input).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "calendly", action: "scheduling_links.create", source: "connector", link: result.link };
    });
  }
  return { connector: "calendly", action: "scheduling_links.create", source: "connector", validated: validateSchedulingLinkCreateInput(input) };
}

// ─── slots.available ──────────────────────────────────────────────────────────

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export type SlotsAvailableInput = { eventType: string; start: string; end: string };

export function validateSlotsAvailableInput(input: unknown): SlotsAvailableInput {
  if (!isRecord(input)) throw new Error("slots.available input must be an object");
  const payload = {
    eventType: requireString(input.eventType, "eventType"),
    start: requireString(input.start, "start"),
    end: requireString(input.end, "end"),
  };
  // Calendly caps the availability window at 7 days; fail fast with a clear message.
  const startMs = Date.parse(payload.start);
  const endMs = Date.parse(payload.end);
  if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs - startMs > SEVEN_DAYS_MS) {
    throw new Error("start and end must span at most 7 days");
  }
  return payload;
}

export function createSlotsClient(options: { accessToken: string; fetch?: typeof fetch }) {
  const client = createCalendlyClient({ accessToken: options.accessToken, fetch: options.fetch, operation: "slots.available" });
  return {
    async available(input: unknown) {
      const payload = validateSlotsAvailableInput(input);
      const params = new URLSearchParams({
        event_type: payload.eventType,
        start_time: payload.start,
        end_time: payload.end,
      });
      const response = await client.fetchJSON(`/event_type_available_times?${params.toString()}`);
      if (response.status === 200) {
        const body = response.body as Record<string, unknown>;
        const collection = Array.isArray(body.collection) ? body.collection : [];
        return { ok: true as const, slots: collection };
      }
      return handleError(response.status, response.headers, "Calendly rejected the slots.available request.");
    },
  };
}

export function getAvailableSlots(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createSlotsClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).available(input).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "calendly", action: "slots.available", source: "connector", slots: result.slots };
    });
  }
  return { connector: "calendly", action: "slots.available", source: "connector", validated: validateSlotsAvailableInput(input) };
}

// ─── bookings.create ──────────────────────────────────────────────────────────

export type BookingsCreateInput = {
  eventType: string;
  startTime: string;
  invitee: { name: string; email: string; timeZone: string };
  location?: Record<string, unknown>;
  guests?: string[];
};

export function validateBookingsCreateInput(input: unknown): BookingsCreateInput {
  if (!isRecord(input)) throw new Error("bookings.create input must be an object");
  if (!isRecord(input.invitee)) throw new Error("invitee is required");
  let guests: string[] | undefined;
  if (input.guests !== undefined) {
    if (!Array.isArray(input.guests) || !input.guests.every((g) => typeof g === "string" && g.length > 0)) {
      throw new Error("guests must be an array of email strings");
    }
    guests = input.guests as string[];
  }
  return {
    eventType: requireString(input.eventType, "eventType"),
    startTime: requireString(input.startTime, "startTime"),
    invitee: {
      name: requireString(input.invitee.name, "invitee.name"),
      email: requireString(input.invitee.email, "invitee.email"),
      timeZone: requireString(input.invitee.timeZone, "invitee.timeZone"),
    },
    location: isRecord(input.location) ? input.location as Record<string, unknown> : undefined,
    guests,
  };
}

export function createBookingsClient(options: { accessToken: string; fetch?: typeof fetch }) {
  const client = createCalendlyClient({ accessToken: options.accessToken, fetch: options.fetch, operation: "bookings.create" });
  return {
    async create(input: unknown) {
      const payload = validateBookingsCreateInput(input);
      const body: Record<string, unknown> = {
        event_type: payload.eventType,
        start_time: payload.startTime,
        invitee: {
          name: payload.invitee.name,
          email: payload.invitee.email,
          timezone: payload.invitee.timeZone,
        },
      };
      if (payload.location) body.location = payload.location;
      if (payload.guests) body.event_guests = payload.guests;
      const response = await client.fetchJSON("/scheduled_events", { method: "POST", body: JSON.stringify(body) });
      if (response.status === 200 || response.status === 201) {
        const respBody = response.body as Record<string, unknown>;
        const resource = isRecord(respBody.resource) ? respBody.resource : respBody;
        return { ok: true as const, booking: resource };
      }
      return handleError(response.status, response.headers, "Calendly rejected the bookings.create request.");
    },
  };
}

export function createBooking(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createBookingsClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).create(input).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "calendly", action: "bookings.create", source: "connector", booking: result.booking };
    });
  }
  return { connector: "calendly", action: "bookings.create", source: "connector", validated: validateBookingsCreateInput(input) };
}

function wrapGet(operation: string, resourceKey: string, result: { ok: true; resource: Record<string, unknown> } | { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } }) {
  if (!result.ok) throwIfError(result);
  return { connector: "calendly", action: operation, source: "connector", [resourceKey]: result.resource };
}

function wrapList(operation: string, collectionKey: string, result: { ok: true; collection: unknown[]; pagination: Record<string, unknown> } | { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } }) {
  if (!result.ok) throwIfError(result);
  return { connector: "calendly", action: operation, source: "connector", [collectionKey]: result.collection, pagination: result.pagination };
}

async function fetchResource(client: ReturnType<typeof createCalendlyClient>, path: string, fallback: string) {
  const response = await client.fetchJSON(path);
  if (response.status === 200) {
    const body = response.body as Record<string, unknown>;
    const resource = isRecord(body.resource) ? body.resource : body;
    return { ok: true as const, resource };
  }
  if (response.status === 404) {
    return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: fallback } };
  }
  return handleError(response.status, response.headers, fallback);
}

async function fetchCollection(client: ReturnType<typeof createCalendlyClient>, path: string, fallback: string) {
  const response = await client.fetchJSON(path);
  if (response.status === 200) {
    const body = response.body as Record<string, unknown>;
    const collection = Array.isArray(body.collection) ? body.collection : [];
    return { ok: true as const, collection, pagination: isRecord(body.pagination) ? body.pagination : {} };
  }
  return handleError(response.status, response.headers, fallback);
}

export function validateEventTypesGetInput(input: unknown): { uuid: string } {
  if (!isRecord(input)) throw new Error("event_types.get input must be an object");
  return { uuid: requireUuid(input.uuid, "uuid") };
}

export function getEventType(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  const validated = validateEventTypesGetInput(input);
  if (isRecord(input) && typeof input.accessToken === "string") {
    const client = createCalendlyClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
      operation: "event_types.get",
    });
    return fetchResource(client, `/event_types/${validated.uuid}`, "Event type not found.").then((result) =>
      wrapGet("event_types.get", "eventType", result),
    );
  }
  return { connector: "calendly", action: "event_types.get", source: "connector", validated };
}

export function validateInviteesGetInput(input: unknown): { eventUuid: string; uuid: string } {
  if (!isRecord(input)) throw new Error("invitees.get input must be an object");
  return {
    eventUuid: requireUuid(input.eventUuid, "eventUuid"),
    uuid: requireUuid(input.uuid, "uuid"),
  };
}

export function getInvitee(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  const validated = validateInviteesGetInput(input);
  if (isRecord(input) && typeof input.accessToken === "string") {
    const client = createCalendlyClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
      operation: "invitees.get",
    });
    return fetchResource(
      client,
      `/scheduled_events/${validated.eventUuid}/invitees/${validated.uuid}`,
      "Invitee not found.",
    ).then((result) => wrapGet("invitees.get", "invitee", result));
  }
  return { connector: "calendly", action: "invitees.get", source: "connector", validated };
}

export type OrganizationMembershipsListInput = { organization: string; user?: string; email?: string; count?: number; pageToken?: string };

export function validateOrganizationMembershipsListInput(input: unknown): OrganizationMembershipsListInput {
  if (!isRecord(input)) throw new Error("organization.memberships.list input must be an object");
  return {
    organization: requireString(input.organization, "organization"),
    user: typeof input.user === "string" ? input.user : undefined,
    email: typeof input.email === "string" ? input.email : undefined,
    count: typeof input.count === "number" ? input.count : undefined,
    pageToken: typeof input.pageToken === "string" ? input.pageToken : undefined,
  };
}

export function listOrganizationMemberships(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  const payload = validateOrganizationMembershipsListInput(input);
  if (isRecord(input) && typeof input.accessToken === "string") {
    const client = createCalendlyClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
      operation: "organization.memberships.list",
    });
    const params = new URLSearchParams({ organization: payload.organization });
    if (payload.user) params.set("user", payload.user);
    if (payload.email) params.set("email", payload.email);
    if (payload.count !== undefined) params.set("count", String(payload.count));
    if (payload.pageToken) params.set("page_token", payload.pageToken);
    return fetchCollection(client, `/organization_memberships?${params.toString()}`, "Calendly rejected the organization.memberships.list request.").then((result) =>
      wrapList("organization.memberships.list", "memberships", result),
    );
  }
  return { connector: "calendly", action: "organization.memberships.list", source: "connector", validated: payload };
}

export type WebhookSubscriptionsCreateInput = {
  url: string;
  events: string[];
  organization: string;
  scope: string;
  user?: string;
};

export function validateWebhookSubscriptionsCreateInput(input: unknown): WebhookSubscriptionsCreateInput {
  if (!isRecord(input)) throw new Error("webhook_subscriptions.create input must be an object");
  if (!Array.isArray(input.events) || !input.events.every((event) => typeof event === "string" && event.length > 0)) {
    throw new Error("events is required");
  }
  return {
    url: requireString(input.url, "url"),
    events: input.events as string[],
    organization: requireString(input.organization, "organization"),
    scope: requireString(input.scope, "scope"),
    user: typeof input.user === "string" ? input.user : undefined,
  };
}

export function createWebhookSubscription(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  const payload = validateWebhookSubscriptionsCreateInput(input);
  if (isRecord(input) && typeof input.accessToken === "string") {
    const client = createCalendlyClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
      operation: "webhook_subscriptions.create",
    });
    const body: Record<string, unknown> = {
      url: payload.url,
      events: payload.events,
      organization: payload.organization,
      scope: payload.scope,
    };
    if (payload.user) body.user = payload.user;
    return client.fetchJSON("/webhook_subscriptions", { method: "POST", body: JSON.stringify(body) }).then((response) => {
      if (response.status === 201 || response.status === 200) {
        const respBody = response.body as Record<string, unknown>;
        const resource = isRecord(respBody.resource) ? respBody.resource : respBody;
        return { connector: "calendly", action: "webhook_subscriptions.create", source: "connector", subscription: resource };
      }
      throwIfError(handleError(response.status, response.headers, "Calendly rejected the webhook_subscriptions.create request."));
    });
  }
  return { connector: "calendly", action: "webhook_subscriptions.create", source: "connector", validated: payload };
}

export type WebhookSubscriptionsListInput = { organization: string; scope?: string; user?: string; count?: number; pageToken?: string };

export function validateWebhookSubscriptionsListInput(input: unknown): WebhookSubscriptionsListInput {
  if (!isRecord(input)) throw new Error("webhook_subscriptions.list input must be an object");
  return {
    organization: requireString(input.organization, "organization"),
    scope: typeof input.scope === "string" ? input.scope : undefined,
    user: typeof input.user === "string" ? input.user : undefined,
    count: typeof input.count === "number" ? input.count : undefined,
    pageToken: typeof input.pageToken === "string" ? input.pageToken : undefined,
  };
}

export function listWebhookSubscriptions(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  const payload = validateWebhookSubscriptionsListInput(input);
  if (isRecord(input) && typeof input.accessToken === "string") {
    const client = createCalendlyClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
      operation: "webhook_subscriptions.list",
    });
    const params = new URLSearchParams({ organization: payload.organization });
    if (payload.scope) params.set("scope", payload.scope);
    if (payload.user) params.set("user", payload.user);
    if (payload.count !== undefined) params.set("count", String(payload.count));
    if (payload.pageToken) params.set("page_token", payload.pageToken);
    return fetchCollection(client, `/webhook_subscriptions?${params.toString()}`, "Calendly rejected the webhook_subscriptions.list request.").then((result) =>
      wrapList("webhook_subscriptions.list", "subscriptions", result),
    );
  }
  return { connector: "calendly", action: "webhook_subscriptions.list", source: "connector", validated: payload };
}

export function validateWebhookSubscriptionsDeleteInput(input: unknown): { uuid: string } {
  if (!isRecord(input)) throw new Error("webhook_subscriptions.delete input must be an object");
  return { uuid: requireUuid(input.uuid, "uuid") };
}

export function deleteWebhookSubscription(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  const payload = validateWebhookSubscriptionsDeleteInput(input);
  if (isRecord(input) && typeof input.accessToken === "string") {
    const client = createCalendlyClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
      operation: "webhook_subscriptions.delete",
    });
    return client.fetchJSON(`/webhook_subscriptions/${payload.uuid}`, { method: "DELETE" }).then((response) => {
      if (response.status === 204 || response.status === 200) {
        return { connector: "calendly", action: "webhook_subscriptions.delete", source: "connector", deleted: true, uuid: payload.uuid };
      }
      if (response.status === 404) {
        throwIfError({ ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Webhook subscription not found." } });
      }
      throwIfError(handleError(response.status, response.headers, "Calendly rejected the webhook_subscriptions.delete request."));
    });
  }
  return { connector: "calendly", action: "webhook_subscriptions.delete", source: "connector", validated: payload };
}

export function validateUsersGetInput(input: unknown): { uuid: string } {
  if (!isRecord(input)) throw new Error("users.get input must be an object");
  return { uuid: requireUuid(input.uuid, "uuid") };
}

export function getUser(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  const validated = validateUsersGetInput(input);
  if (isRecord(input) && typeof input.accessToken === "string") {
    const client = createCalendlyClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
      operation: "users.get",
    });
    return fetchResource(client, `/users/${validated.uuid}`, "User not found.").then((result) =>
      wrapGet("users.get", "user", result),
    );
  }
  return { connector: "calendly", action: "users.get", source: "connector", validated };
}

export function validateOrganizationsGetInput(input: unknown): { uuid: string } {
  if (!isRecord(input)) throw new Error("organizations.get input must be an object");
  return { uuid: requireUuid(input.uuid, "uuid") };
}

export function getOrganization(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  const validated = validateOrganizationsGetInput(input);
  if (isRecord(input) && typeof input.accessToken === "string") {
    const client = createCalendlyClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
      operation: "organizations.get",
    });
    return fetchResource(client, `/organizations/${validated.uuid}`, "Organization not found.").then((result) =>
      wrapGet("organizations.get", "organization", result),
    );
  }
  return { connector: "calendly", action: "organizations.get", source: "connector", validated };
}

export type RoutingFormsListInput = { organization: string; count?: number; pageToken?: string };

export function validateRoutingFormsListInput(input: unknown): RoutingFormsListInput {
  if (!isRecord(input)) throw new Error("routing_forms.list input must be an object");
  return {
    organization: requireString(input.organization, "organization"),
    count: typeof input.count === "number" ? input.count : undefined,
    pageToken: typeof input.pageToken === "string" ? input.pageToken : undefined,
  };
}

export function listRoutingForms(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  const payload = validateRoutingFormsListInput(input);
  if (isRecord(input) && typeof input.accessToken === "string") {
    const client = createCalendlyClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
      operation: "routing_forms.list",
    });
    const params = new URLSearchParams({ organization: payload.organization });
    if (payload.count !== undefined) params.set("count", String(payload.count));
    if (payload.pageToken) params.set("page_token", payload.pageToken);
    return fetchCollection(client, `/routing_forms?${params.toString()}`, "Calendly rejected the routing_forms.list request.").then((result) =>
      wrapList("routing_forms.list", "routingForms", result),
    );
  }
  return { connector: "calendly", action: "routing_forms.list", source: "connector", validated: payload };
}

export function validateRoutingFormsGetInput(input: unknown): { uuid: string } {
  if (!isRecord(input)) throw new Error("routing_forms.get input must be an object");
  return { uuid: requireUuid(input.uuid, "uuid") };
}

export function getRoutingForm(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  const validated = validateRoutingFormsGetInput(input);
  if (isRecord(input) && typeof input.accessToken === "string") {
    const client = createCalendlyClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
      operation: "routing_forms.get",
    });
    return fetchResource(client, `/routing_forms/${validated.uuid}`, "Routing form not found.").then((result) =>
      wrapGet("routing_forms.get", "routingForm", result),
    );
  }
  return { connector: "calendly", action: "routing_forms.get", source: "connector", validated };
}
