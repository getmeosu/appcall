import { describe, expect, test } from "bun:test";
import eventsListFixture from "../fixtures/events_list.json";
import { normalizeCalendarEvent, parseEventsListResponse } from "../src/events";

describe("google-workspace calendar events", () => {
  test("normalizes calendar event with dateTime from fixture", () => {
    const event = normalizeCalendarEvent(eventsListFixture.items[0]);

    expect(event.id).toBe("gcal:ev1a2b3c4d5e6f");
    expect(event.provider).toBe("google-workspace");
    expect(event.providerEventId).toBe("ev1a2b3c4d5e6f");
    expect(event.summary).toBe("Team Standup");
    expect(event.description).toBe("Daily standup meeting");
    expect(event.location).toBe("Conference Room A");
    expect(event.startTime).toBe("2026-05-16T09:00:00+05:30");
    expect(event.endTime).toBe("2026-05-16T09:30:00+05:30");
    expect(event.status).toBe("confirmed");
    expect(event.htmlLink).toBe("https://calendar.google.com/event?id=ev1a2b3c4d5e6f");
    expect(event.modelVersion).toBe("2026-05-16");
  });

  test("normalizes all-day event with date field", () => {
    const event = normalizeCalendarEvent(eventsListFixture.items[1]);

    expect(event.id).toBe("gcal:ev2b3c4d5e6f7g");
    expect(event.summary).toBe("Sprint Planning");
    expect(event.location).toBe("Main Hall");
    expect(event.startTime).toBe("2026-05-18");
    expect(event.endTime).toBe("2026-05-19");
  });

  test("handles event without optional fields", () => {
    const event = normalizeCalendarEvent({
      id: "minimal",
      status: "tentative",
    });

    expect(event.summary).toBe("");
    expect(event.description).toBe("");
    expect(event.location).toBe("");
    expect(event.startTime).toBe("");
    expect(event.endTime).toBe("");
    expect(event.status).toBe("tentative");
    expect(event.htmlLink).toBe("");
  });

  test("parses events list response with pagination", () => {
    const parsed = parseEventsListResponse(eventsListFixture);

    expect(parsed.events).toHaveLength(3);
    expect(parsed.events[0].id).toBe("ev1a2b3c4d5e6f");
    expect(parsed.events[1].id).toBe("ev2b3c4d5e6f7g");
    expect(parsed.events[2].status).toBe("cancelled");
    expect(parsed.nextPageToken).toBe("cal_page_token_1");
  });

  test("parses empty events list response", () => {
    const parsed = parseEventsListResponse({ items: [] });

    expect(parsed.events).toHaveLength(0);
    expect(parsed.nextPageToken).toBeNull();
  });
});
