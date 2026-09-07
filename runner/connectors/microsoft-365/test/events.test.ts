import { describe, expect, test } from "bun:test";
import eventsListFixture from "../fixtures/events_list.json";
import calendarsListFixture from "../fixtures/calendars_list.json";
import {
  normalizeCalendarEvent,
  parseEventsResponse,
  parseCalendarsResponse,
} from "../src/events";

describe("microsoft-365 events", () => {
  test("normalizes calendar event from fixture", () => {
    const event = normalizeCalendarEvent(eventsListFixture.value[0]);

    expect(event.id).toBe("outlook:AAMkAGI2TG93AAA=");
    expect(event.provider).toBe("microsoft-365");
    expect(event.providerEventId).toBe("AAMkAGI2TG93AAA=");
    expect(event.summary).toBe("Team Standup");
    expect(event.description).toBe("Daily standup meeting");
    expect(event.location).toBe("Conference Room A");
    expect(event.startTime).toBe("2026-05-16T09:00:00");
    expect(event.endTime).toBe("2026-05-16T09:30:00");
    expect(event.status).toBe("confirmed");
    expect(event.webLink).toBe("https://outlook.office.com/calendar/item/AAMkAGI2TG93AAA=");
    expect(event.modelVersion).toBe("2026-05-16");
    expect(event.raw.subject).toBe("Team Standup");
  });

  test("normalizes cancelled event", () => {
    const event = normalizeCalendarEvent(eventsListFixture.value[2]);

    expect(event.id).toBe("outlook:AAMkAGI2TG95AAA=");
    expect(event.status).toBe("cancelled");
  });

  test("normalizes event with minimal fields", () => {
    const event = normalizeCalendarEvent({ id: "minimal-id" });

    expect(event.id).toBe("outlook:minimal-id");
    expect(event.summary).toBe("");
    expect(event.location).toBe("");
    expect(event.startTime).toBe("");
    expect(event.endTime).toBe("");
    expect(event.status).toBe("confirmed");
  });

  test("parses events list response with nextLink", () => {
    const parsed = parseEventsResponse(eventsListFixture);

    expect(parsed.events).toHaveLength(3);
    expect(parsed.events[0].id).toBe("AAMkAGI2TG93AAA=");
    expect(parsed.events[2].isCancelled).toBe(true);
    expect(parsed.nextLink).toBe("https://graph.microsoft.com/v1.0/me/events?$skip=10");
  });

  test("parses events list response without nextLink", () => {
    const parsed = parseEventsResponse({ value: [{ id: "ev1", subject: "Test" }] });

    expect(parsed.events).toHaveLength(1);
    expect(parsed.nextLink).toBeNull();
  });

  test("parses empty events list response", () => {
    const parsed = parseEventsResponse({ value: [] });

    expect(parsed.events).toHaveLength(0);
    expect(parsed.nextLink).toBeNull();
  });

  test("handles non-object response gracefully", () => {
    expect(parseEventsResponse(null)).toEqual({ events: [], nextLink: null });
    expect(parseEventsResponse("string")).toEqual({ events: [], nextLink: null });
  });

  test("parses calendars list response", () => {
    const parsed = parseCalendarsResponse(calendarsListFixture);

    expect(parsed.calendars).toHaveLength(3);
    expect(parsed.calendars[0].id).toBe("AAMkAGI2TG93AAA=");
    expect(parsed.calendars[0].name).toBe("Calendar");
    expect(parsed.calendars[0].canEdit).toBe(true);
    expect(parsed.calendars[0].canShare).toBe(true);
    expect(parsed.calendars[0].isDefaultCalendar).toBe(true);
    expect(parsed.calendars[0].isRemovable).toBe(false);
    expect(parsed.calendars[0].owner?.address).toBe("me@example.com");
    expect(parsed.calendars[0].owner?.name).toBe("Alice Johnson");
  });

  test("parses calendars with read-only permissions", () => {
    const parsed = parseCalendarsResponse(calendarsListFixture);

    expect(parsed.calendars[2].canEdit).toBe(false);
    expect(parsed.calendars[2].isDefaultCalendar).toBe(false);
    expect(parsed.calendars[2].isRemovable).toBe(false);
    expect(parsed.calendars[2].owner?.address).toBe("team@example.com");
  });

  test("parses empty calendars list response", () => {
    const parsed = parseCalendarsResponse({ value: [] });

    expect(parsed.calendars).toHaveLength(0);
  });

  test("handles non-object calendars response gracefully", () => {
    expect(parseCalendarsResponse(null)).toEqual({ calendars: [] });
    expect(parseCalendarsResponse("string")).toEqual({ calendars: [] });
  });
});
