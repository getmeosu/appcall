import { describe, expect, test } from "bun:test";
import eventsFixture from "../fixtures/events_list.json";
import eventsEmptyFixture from "../fixtures/events_list_empty.json";
import eventsNoPaginationFixture from "../fixtures/events_list_no_pagination.json";
import userMeFixture from "../fixtures/user_me.json";
import {
  normalizeEvent, parseEventsResponse,
  normalizeUser, parseUserResponse,
} from "../src/objects";

// ---------------------------------------------------------------------------
// normalizeEvent
// ---------------------------------------------------------------------------

describe("normalizeEvent", () => {
  test("normalizes a full event from fixture", () => {
    const raw = eventsFixture.collection[0];
    const result = normalizeEvent(raw);

    expect(result).toEqual({
      id: "cld-event:evt_001",
      provider: "calendly",
      title: "30 Minute Meeting",
      startTime: "2025-07-15T10:00:00.000000Z",
      endTime: "2025-07-15T10:30:00.000000Z",
      status: "active",
      uri: "https://api.calendly.com/scheduled_events/evt_001",
      cancelUrl: "https://calendly.com/cancellations/evt_001",
      rescheduleUrl: "https://calendly.com/reschedulings/evt_001",
      modelVersion: "2026-05-17",
      raw,
    });
  });

  test("normalizes an event with minimal fields", () => {
    const result = normalizeEvent({});

    expect(result.id).toBe("cld-event:");
    expect(result.provider).toBe("calendly");
    expect(result.title).toBe("");
    expect(result.startTime).toBe("");
    expect(result.endTime).toBe("");
    expect(result.status).toBe("");
    expect(result.uri).toBe("");
    expect(result.cancelUrl).toBe("");
    expect(result.rescheduleUrl).toBe("");
  });

  test("extracts the last segment of the uri as the event id", () => {
    const result = normalizeEvent({ uri: "https://api.calendly.com/scheduled_events/abc-def-123" });
    expect(result.id).toBe("cld-event:abc-def-123");
  });

  test("falls back to full uri when no path segments", () => {
    const result = normalizeEvent({ uri: "plain-value" });
    expect(result.id).toBe("cld-event:plain-value");
  });
});

// ---------------------------------------------------------------------------
// parseEventsResponse
// ---------------------------------------------------------------------------

describe("parseEventsResponse", () => {
  test("parses the events_list fixture", () => {
    const result = parseEventsResponse(eventsFixture);

    expect(result.events).toHaveLength(2);
    expect(result.events[0].id).toBe("cld-event:evt_001");
    expect(result.events[0].title).toBe("30 Minute Meeting");
    expect(result.events[0].status).toBe("active");
    expect(result.events[1].id).toBe("cld-event:evt_002");
    expect(result.events[1].title).toBe("Discovery Call");
    expect(result.events[1].status).toBe("canceled");
    expect(result.pagination.nextPage).toBe("https://api.calendly.com/scheduled_events?page_token=abc123");
  });

  test("parses empty collection with null pagination", () => {
    const result = parseEventsResponse(eventsEmptyFixture);

    expect(result.events).toEqual([]);
    expect(result.pagination.nextPage).toBeNull();
  });

  test("returns empty events for null input", () => {
    const result = parseEventsResponse(null);
    expect(result.events).toEqual([]);
    expect(result.pagination.nextPage).toBeNull();
  });

  test("returns empty events for non-record input", () => {
    const result = parseEventsResponse("string");
    expect(result.events).toEqual([]);
    expect(result.pagination.nextPage).toBeNull();
  });

  test("returns empty events when collection is not an array", () => {
    const result = parseEventsResponse({ collection: "bad" });
    expect(result.events).toEqual([]);
    expect(result.pagination.nextPage).toBeNull();
  });

  test("defaults pagination to null when pagination is missing", () => {
    const result = parseEventsResponse(eventsNoPaginationFixture);
    expect(result.events).toHaveLength(1);
    expect(result.pagination.nextPage).toBeNull();
  });

  test("defaults pagination to null when pagination.next_page is not a string", () => {
    const result = parseEventsResponse({ collection: [], pagination: { next_page: 123 } });
    expect(result.pagination.nextPage).toBeNull();
  });

  test("filters out non-record entries in collection array", () => {
    const result = parseEventsResponse({
      collection: [null, { uri: "https://api.calendly.com/scheduled_events/evt_005" }, "bad", 42],
      pagination: { next_page: null },
    });
    expect(result.events).toHaveLength(1);
    expect(result.events[0].id).toBe("cld-event:evt_005");
  });
});

// ---------------------------------------------------------------------------
// normalizeUser
// ---------------------------------------------------------------------------

describe("normalizeUser", () => {
  test("normalizes a full user from fixture", () => {
    const raw = userMeFixture.resource;
    const result = normalizeUser(raw);

    expect(result).toEqual({
      id: "cld-user:usr_001",
      provider: "calendly",
      name: "Jane Doe",
      email: "jane@example.com",
      schedulingUrl: "https://calendly.com/janedoe",
      avatarUrl: "https://cdn.calendly.com/assets/img/avatar.png",
      timezone: "America/New_York",
      modelVersion: "2026-05-17",
      raw,
    });
  });

  test("normalizes a user with missing fields", () => {
    const result = normalizeUser({});

    expect(result.id).toBe("cld-user:");
    expect(result.provider).toBe("calendly");
    expect(result.name).toBe("");
    expect(result.email).toBe("");
    expect(result.schedulingUrl).toBe("");
    expect(result.avatarUrl).toBe("");
    expect(result.timezone).toBe("");
  });

  test("extracts the last segment of the uri as the user id", () => {
    const result = normalizeUser({ uri: "https://api.calendly.com/users/usr_xyz" });
    expect(result.id).toBe("cld-user:usr_xyz");
  });
});

// ---------------------------------------------------------------------------
// parseUserResponse
// ---------------------------------------------------------------------------

describe("parseUserResponse", () => {
  test("parses the user_me fixture", () => {
    const result = parseUserResponse(userMeFixture);

    expect(result.user).not.toBeNull();
    expect(result.user!.id).toBe("cld-user:usr_001");
    expect(result.user!.name).toBe("Jane Doe");
    expect(result.user!.email).toBe("jane@example.com");
    expect(result.user!.schedulingUrl).toBe("https://calendly.com/janedoe");
    expect(result.user!.timezone).toBe("America/New_York");
  });

  test("returns null user for null input", () => {
    const result = parseUserResponse(null);
    expect(result.user).toBeNull();
  });

  test("returns null user for non-record input", () => {
    const result = parseUserResponse("string");
    expect(result.user).toBeNull();
  });

  test("returns null user when resource is not a record", () => {
    const result = parseUserResponse({ resource: "not-an-object" });
    expect(result.user).toBeNull();
  });

  test("returns null user when resource is missing", () => {
    const result = parseUserResponse({});
    expect(result.user).toBeNull();
  });
});
