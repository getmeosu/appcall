import { describe, expect, test } from "bun:test";
import calendarEventFixture from "../fixtures/calendar_event.json";
import calendarListFixture from "../fixtures/calendar_list.json";
import rateLimitedFixture from "../fixtures/rate_limited.json";
import {
  createCalendarActionsClient,
  validateCreateEventInput,
  validateUpdateEventInput,
  validateDeleteEventInput,
  validateGetEventInput,
} from "../src/events";

describe("google-workspace Calendar actions", () => {
  // ─── calendar.events.create ─────────────────────────────────────────────

  test("validateCreateEventInput accepts valid input", () => {
    const r = validateCreateEventInput({
      calendarId: "primary",
      summary: "Team Meeting",
      startDateTime: "2024-01-15T09:00:00-07:00",
      endDateTime: "2024-01-15T10:00:00-07:00",
    });
    expect(r.calendarId).toBe("primary");
    expect(r.summary).toBe("Team Meeting");
    expect(r.startDateTime).toBe("2024-01-15T09:00:00-07:00");
  });

  test("validateCreateEventInput throws on missing required fields", () => {
    expect(() => validateCreateEventInput({ calendarId: "primary", summary: "Test" })).toThrow();
    expect(() => validateCreateEventInput("not-object")).toThrow();
  });

  test("createEvent posts to Calendar API with correct URL and auth", async () => {
    const requests: Request[] = [];
    const client = createCalendarActionsClient({
      accessToken: "ya29.test-token",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(calendarEventFixture);
      },
    });

    const result = await client.createEvent({
      calendarId: "primary",
      summary: "Team Meeting",
      startDateTime: "2024-01-15T09:00:00-07:00",
      endDateTime: "2024-01-15T10:00:00-07:00",
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://www.googleapis.com/calendar/v3/calendars/primary/events");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer ya29.test-token");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.event.eventId).toBe("abc123eventid");
      expect(result.event.summary).toBe("Team Meeting");
      expect(result.event.status).toBe("confirmed");
      expect(result.event.startDateTime).toBe("2024-01-15T09:00:00-07:00");
    }
  });

  test("createEvent maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    const client = createCalendarActionsClient({
      accessToken: "token",
      fetch: async () => new Response(JSON.stringify(rateLimitedFixture), {
        status: 429,
        headers: { "Retry-After": "30" },
      }),
    });

    const result = await client.createEvent({
      calendarId: "primary",
      summary: "Test",
      startDateTime: "2024-01-15T09:00:00Z",
      endDateTime: "2024-01-15T10:00:00Z",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("CONNECTOR_RATE_LIMITED");
      expect(result.error.retryAfterSeconds).toBe(30);
    }
  });

  test("createEvent treats empty error responses as failures", async () => {
    for (const status of [401, 403, 500, 503]) {
      const client = createCalendarActionsClient({
        accessToken: "token",
        fetch: async () => new Response("", { status }),
      });
      const result = await client.createEvent({
        calendarId: "primary",
        summary: "Test",
        startDateTime: "2024-01-15T09:00:00Z",
        endDateTime: "2024-01-15T10:00:00Z",
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("CONNECTOR_UPSTREAM_ERROR");
    }
  });

  test("createEvent rejects an incomplete successful response", async () => {
    const client = createCalendarActionsClient({
      accessToken: "token",
      fetch: async () => Response.json({}),
    });
    const result = await client.createEvent({
      calendarId: "primary",
      summary: "Test",
      startDateTime: "2024-01-15T09:00:00Z",
      endDateTime: "2024-01-15T10:00:00Z",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONNECTOR_UPSTREAM_ERROR");
  });

  // ─── calendar.events.update ─────────────────────────────────────────────

  test("validateUpdateEventInput accepts valid input", () => {
    const r = validateUpdateEventInput({ calendarId: "primary", eventId: "abc123" });
    expect(r.calendarId).toBe("primary");
    expect(r.eventId).toBe("abc123");
  });

  test("validateUpdateEventInput throws on missing required fields", () => {
    expect(() => validateUpdateEventInput({ calendarId: "primary" })).toThrow();
    expect(() => validateUpdateEventInput({})).toThrow();
  });

  test("updateEvent patches correct URL", async () => {
    const requests: Request[] = [];
    const client = createCalendarActionsClient({
      accessToken: "ya29.test-token",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json({ ...calendarEventFixture, summary: "Updated Meeting" });
      },
    });

    const result = await client.updateEvent({
      calendarId: "primary",
      eventId: "abc123eventid",
      summary: "Updated Meeting",
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://www.googleapis.com/calendar/v3/calendars/primary/events/abc123eventid");
    expect(requests[0].method).toBe("PATCH");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer ya29.test-token");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.event.summary).toBe("Updated Meeting");
    }
  });

  test("updateEvent maps upstream error to CONNECTOR_UPSTREAM_ERROR", async () => {
    const client = createCalendarActionsClient({
      accessToken: "token",
      fetch: async () => new Response(
        JSON.stringify({ error: { code: 404, message: "Event not found", status: 404 } }),
        { status: 404 },
      ),
    });

    const result = await client.updateEvent({ calendarId: "primary", eventId: "missing" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONNECTOR_UPSTREAM_ERROR");
  });

  // ─── calendar.events.delete ─────────────────────────────────────────────

  test("validateDeleteEventInput accepts valid input", () => {
    const r = validateDeleteEventInput({ calendarId: "primary", eventId: "abc" });
    expect(r.eventId).toBe("abc");
  });

  test("validateDeleteEventInput throws on missing fields", () => {
    expect(() => validateDeleteEventInput({ calendarId: "primary" })).toThrow();
  });

  test("deleteEvent sends DELETE to correct URL and returns deleted:true on 204", async () => {
    const requests: Request[] = [];
    const client = createCalendarActionsClient({
      accessToken: "ya29.test-token",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response("", { status: 204 });
      },
    });

    const result = await client.deleteEvent({ calendarId: "primary", eventId: "abc123eventid" });

    expect(requests[0].url).toBe("https://www.googleapis.com/calendar/v3/calendars/primary/events/abc123eventid");
    expect(requests[0].method).toBe("DELETE");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer ya29.test-token");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.deleted).toBe(true);
      expect(result.eventId).toBe("abc123eventid");
    }
  });

  test("deleteEvent maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    const client = createCalendarActionsClient({
      accessToken: "token",
      fetch: async () => new Response("", {
        status: 429,
        headers: { "Retry-After": "20" },
      }),
    });

    const result = await client.deleteEvent({ calendarId: "primary", eventId: "abc" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONNECTOR_RATE_LIMITED");
  });

  // ─── calendar.events.get ────────────────────────────────────────────────

  test("validateGetEventInput accepts valid input", () => {
    const r = validateGetEventInput({ calendarId: "primary", eventId: "abc" });
    expect(r.eventId).toBe("abc");
  });

  test("getEvent fetches correct URL", async () => {
    const requests: Request[] = [];
    const client = createCalendarActionsClient({
      accessToken: "ya29.test-token",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(calendarEventFixture);
      },
    });

    const result = await client.getEvent({ calendarId: "primary", eventId: "abc123eventid" });

    expect(requests[0].url).toBe("https://www.googleapis.com/calendar/v3/calendars/primary/events/abc123eventid");
    expect(requests[0].method).toBe("GET");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer ya29.test-token");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.event.eventId).toBe("abc123eventid");
      expect(result.event.description).toBe("Weekly sync");
      expect(result.event.location).toBe("Conference Room A");
    }
  });

  test("getEvent maps upstream error to CONNECTOR_UPSTREAM_ERROR", async () => {
    const client = createCalendarActionsClient({
      accessToken: "token",
      fetch: async () => new Response(
        JSON.stringify({ error: { code: 403, message: "Forbidden", status: 403 } }),
        { status: 403 },
      ),
    });

    const result = await client.getEvent({ calendarId: "primary", eventId: "abc" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONNECTOR_UPSTREAM_ERROR");
  });

  // ─── calendar.calendars.list ─────────────────────────────────────────────

  test("listCalendars fetches calendarList endpoint", async () => {
    const requests: Request[] = [];
    const client = createCalendarActionsClient({
      accessToken: "ya29.test-token",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(calendarListFixture);
      },
    });

    const result = await client.listCalendars({});

    expect(requests[0].url).toBe("https://www.googleapis.com/calendar/v3/users/me/calendarList");
    expect(requests[0].method).toBe("GET");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer ya29.test-token");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.calendars).toHaveLength(2);
      expect(result.calendars[0].id).toBe("primary");
      expect(result.calendars[0].primary).toBe(true);
      expect(result.calendars[1].summary).toBe("Team Calendar");
    }
  });

  test("listCalendars maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    const client = createCalendarActionsClient({
      accessToken: "token",
      fetch: async () => new Response(JSON.stringify(rateLimitedFixture), {
        status: 429,
        headers: { "Retry-After": "15" },
      }),
    });

    const result = await client.listCalendars({});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONNECTOR_RATE_LIMITED");
  });

  test("listCalendars treats empty error responses as failures", async () => {
    for (const status of [401, 403, 500, 503]) {
      const client = createCalendarActionsClient({
        accessToken: "token",
        fetch: async () => new Response("", { status }),
      });
      const result = await client.listCalendars({});
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("CONNECTOR_UPSTREAM_ERROR");
    }
  });

  test("listCalendars keeps an empty 204 success as an empty list", async () => {
    const client = createCalendarActionsClient({
      accessToken: "token",
      fetch: async () => new Response("", { status: 204 }),
    });
    await expect(client.listCalendars({})).resolves.toEqual({ ok: true, calendars: [] });
  });
});
