import { describe, expect, test } from "bun:test";
import eventCreateFixture from "../fixtures/event_create.json";
import calendarsListFixture from "../fixtures/calendars_list.json";
import {
  validateCreateEventInput,
  validateUpdateEventInput,
  validateDeleteEventInput,
  validateGetEventInput,
  validateGetCalendarInput,
  createEventsClient,
  createCalendarsClient,
} from "../src/events";

describe("microsoft-365 events extended (create/update/delete/get)", () => {
  // ─── Static validation ───────────────────────────────────────────────────────

  test("validateCreateEventInput returns full input", () => {
    const result = validateCreateEventInput({
      subject: "Team Kickoff",
      start: { dateTime: "2026-06-01T09:00:00", timeZone: "UTC" },
      end: { dateTime: "2026-06-01T10:00:00", timeZone: "UTC" },
      body: "Kickoff meeting details",
      location: "Conference Room A",
      attendees: ["alice@example.com"],
      isOnlineMeeting: true,
    });

    expect(result.subject).toBe("Team Kickoff");
    expect(result.start.dateTime).toBe("2026-06-01T09:00:00");
    expect(result.end.timeZone).toBe("UTC");
    expect(result.body).toBe("Kickoff meeting details");
    expect(result.location).toBe("Conference Room A");
    expect(result.attendees).toEqual(["alice@example.com"]);
    expect(result.isOnlineMeeting).toBe(true);
  });

  test("validateCreateEventInput throws on missing required fields", () => {
    expect(() => validateCreateEventInput({})).toThrow("subject is required");
    expect(() => validateCreateEventInput({ subject: "Test" })).toThrow("start must be an object");
    expect(() => validateCreateEventInput({ subject: "Test", start: { dateTime: "2026-06-01T09:00:00", timeZone: "UTC" } })).toThrow("end must be an object");
  });

  test("validateUpdateEventInput returns eventId and optional fields", () => {
    const result = validateUpdateEventInput({ eventId: "EVT123", subject: "Updated Title" });
    expect(result.eventId).toBe("EVT123");
    expect(result.subject).toBe("Updated Title");
    expect(result.start).toBeUndefined();
  });

  test("validateUpdateEventInput throws on missing eventId", () => {
    expect(() => validateUpdateEventInput({ subject: "New title" })).toThrow("eventId is required");
  });

  test("validateDeleteEventInput returns eventId", () => {
    const result = validateDeleteEventInput({ eventId: "EVT456" });
    expect(result.eventId).toBe("EVT456");
  });

  test("validateGetEventInput returns eventId", () => {
    const result = validateGetEventInput({ eventId: "EVT789" });
    expect(result.eventId).toBe("EVT789");
  });

  // ─── Mocked HTTP: events.create ──────────────────────────────────────────────

  test("createEvent POSTs to /v1.0/me/events with Bearer token", async () => {
    const requests: Request[] = [];
    const client = createEventsClient({
      accessToken: "tok-create",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(eventCreateFixture), { status: 201, headers: { "Content-Type": "application/json" } });
      },
    });

    const result = await client.create({
      subject: "Team Kickoff",
      start: { dateTime: "2026-06-01T09:00:00", timeZone: "UTC" },
      end: { dateTime: "2026-06-01T10:00:00", timeZone: "UTC" },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://graph.microsoft.com/v1.0/me/events");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer tok-create");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.event.providerEventId).toBe("AAMkAGI2eventAAA=");
      expect(result.event.summary).toBe("Team Kickoff");
    }
  });

  test("createEvent maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    const client = createEventsClient({
      accessToken: "tok-create",
      fetch: async () => new Response("{}", { status: 429, headers: { "Retry-After": "20" } }),
    });

    const result = await client.create({
      subject: "Test",
      start: { dateTime: "2026-06-01T09:00:00", timeZone: "UTC" },
      end: { dateTime: "2026-06-01T10:00:00", timeZone: "UTC" },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("CONNECTOR_RATE_LIMITED");
      expect(result.error.retryAfterSeconds).toBe(20);
    }
  });

  test("createEvent maps non-201/429 to CONNECTOR_UPSTREAM_ERROR", async () => {
    const client = createEventsClient({
      accessToken: "tok-create",
      fetch: async () => new Response("{}", { status: 400 }),
    });

    const result = await client.create({
      subject: "Test",
      start: { dateTime: "2026-06-01T09:00:00", timeZone: "UTC" },
      end: { dateTime: "2026-06-01T10:00:00", timeZone: "UTC" },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONNECTOR_UPSTREAM_ERROR");
  });

  // ─── Mocked HTTP: events.update ──────────────────────────────────────────────

  test("updateEvent PATCHes /v1.0/me/events/{id} with Bearer token", async () => {
    const requests: Request[] = [];
    const updatedEvent = { ...eventCreateFixture, subject: "Updated Subject" };
    const client = createEventsClient({
      accessToken: "tok-update",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(updatedEvent), { status: 200, headers: { "Content-Type": "application/json" } });
      },
    });

    const result = await client.update({ eventId: "AAMkAGI2eventAAA=", subject: "Updated Subject" });

    expect(requests[0].url).toContain("/me/events/AAMkAGI2eventAAA%3D");
    expect(requests[0].method).toBe("PATCH");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer tok-update");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.event.summary).toBe("Updated Subject");
  });

  test("updateEvent maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    const client = createEventsClient({
      accessToken: "tok-update",
      fetch: async () => new Response("{}", { status: 429, headers: { "Retry-After": "5" } }),
    });

    const result = await client.update({ eventId: "EVT1", subject: "New" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONNECTOR_RATE_LIMITED");
  });

  // ─── Mocked HTTP: events.delete ──────────────────────────────────────────────

  test("deleteEvent sends DELETE and returns ok on 204", async () => {
    const requests: Request[] = [];
    const client = createEventsClient({
      accessToken: "tok-delete",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(null, { status: 204 });
      },
    });

    const result = await client.delete({ eventId: "EVT999" });

    expect(requests[0].url).toContain("/me/events/EVT999");
    expect(requests[0].method).toBe("DELETE");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer tok-delete");
    expect(result.ok).toBe(true);
  });

  test("deleteEvent maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    const client = createEventsClient({
      accessToken: "tok-delete",
      fetch: async () => new Response("{}", { status: 429, headers: { "Retry-After": "10" } }),
    });

    const result = await client.delete({ eventId: "EVT1" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONNECTOR_RATE_LIMITED");
  });

  // ─── Mocked HTTP: events.get ─────────────────────────────────────────────────

  test("getEvent GETs /v1.0/me/events/{id} with Bearer token", async () => {
    const requests: Request[] = [];
    const client = createEventsClient({
      accessToken: "tok-get",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(eventCreateFixture), { status: 200, headers: { "Content-Type": "application/json" } });
      },
    });

    const result = await client.get({ eventId: "AAMkAGI2eventAAA=" });

    expect(requests[0].url).toContain("/me/events/AAMkAGI2eventAAA%3D");
    expect(requests[0].method).toBe("GET");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer tok-get");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.event.providerEventId).toBe("AAMkAGI2eventAAA=");
  });

  test("getEvent maps non-200/429 to CONNECTOR_UPSTREAM_ERROR", async () => {
    const client = createEventsClient({
      accessToken: "tok-get",
      fetch: async () => new Response("{}", { status: 404 }),
    });

    const result = await client.get({ eventId: "missing" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONNECTOR_UPSTREAM_ERROR");
  });

  test("validateGetCalendarInput returns calendarId", () => {
    const result = validateGetCalendarInput({ calendarId: "AAMkAGI2TG93AAA=" });
    expect(result.calendarId).toBe("AAMkAGI2TG93AAA=");
  });

  test("validateGetCalendarInput throws on missing calendarId", () => {
    expect(() => validateGetCalendarInput({})).toThrow("calendarId is required");
  });

  test("getCalendar GETs /v1.0/me/calendars/{id} with Bearer token", async () => {
    const requests: Request[] = [];
    const client = createCalendarsClient({
      accessToken: "tok-cal-get",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(calendarsListFixture.value[0]), { status: 200, headers: { "Content-Type": "application/json" } });
      },
    });

    const result = await client.get({ calendarId: "AAMkAGI2TG93AAA=" });

    expect(requests[0].url).toBe("https://graph.microsoft.com/v1.0/me/calendars/AAMkAGI2TG93AAA%3D");
    expect(requests[0].method).toBe("GET");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer tok-cal-get");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.calendar.id).toBe("AAMkAGI2TG93AAA=");
      expect(result.calendar.name).toBe("Calendar");
      expect(result.calendar.isDefaultCalendar).toBe(true);
    }
  });

  test("getCalendar maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    const client = createCalendarsClient({
      accessToken: "tok-cal-get",
      fetch: async () => new Response("{}", { status: 429, headers: { "Retry-After": "11" } }),
    });

    const result = await client.get({ calendarId: "cal1" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONNECTOR_RATE_LIMITED");
  });

  test("getCalendar maps non-200/429 to CONNECTOR_UPSTREAM_ERROR", async () => {
    const client = createCalendarsClient({
      accessToken: "tok-cal-get",
      fetch: async () => new Response("{}", { status: 404 }),
    });

    const result = await client.get({ calendarId: "missing" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONNECTOR_UPSTREAM_ERROR");
  });
});
