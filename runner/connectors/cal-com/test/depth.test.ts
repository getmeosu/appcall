import { describe, expect, test } from "bun:test";
import eventTypeCreateFixture from "../fixtures/event_type_create.json";
import eventTypeUpdateFixture from "../fixtures/event_type_update.json";
import eventTypeDeleteFixture from "../fixtures/event_type_delete.json";
import scheduleGetFixture from "../fixtures/schedule_get.json";
import scheduleCreateFixture from "../fixtures/schedule_create.json";
import scheduleUpdateFixture from "../fixtures/schedule_update.json";
import scheduleDeleteFixture from "../fixtures/schedule_delete.json";
import availabilityGetFixture from "../fixtures/availability_get.json";
import webhooksListFixture from "../fixtures/webhooks_list.json";
import webhookCreateFixture from "../fixtures/webhook_create.json";
import webhookGetFixture from "../fixtures/webhook_get.json";
import webhookDeleteFixture from "../fixtures/webhook_delete.json";

import {
  createEventType,
  updateEventType,
  deleteEventType,
  getSchedule,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  getAvailability,
  listWebhooks,
  createWebhook,
  getWebhook,
  deleteWebhook,
  validateEventTypesCreateInput,
  validateEventTypesUpdateInput,
  validateEventTypesDeleteInput,
  validateSchedulesGetInput,
  validateSchedulesCreateInput,
  validateSchedulesUpdateInput,
  validateSchedulesDeleteInput,
  validateAvailabilityGetInput,
  validateWebhooksListInput,
  validateWebhooksCreateInput,
  validateWebhooksGetInput,
  validateWebhooksDeleteInput,
} from "../src/actions";

function mockFetch(fixture: unknown, status = 200) {
  const requests: Request[] = [];
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push(new Request(input, init));
    return new Response(JSON.stringify(fixture), { status });
  };
  return { requests, fetch };
}

// ─── event_types.create ───────────────────────────────────────────────────────

describe("createEventType", () => {
  test("validates input and returns connector-owned output without accessToken", () => {
    const result = createEventType({ title: "Discovery Call", slug: "discovery", lengthInMinutes: 30 });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("event_types.create");
    expect((result.validated as { slug: string }).slug).toBe("discovery");
  });

  test("throws when title, slug, or lengthInMinutes is missing", () => {
    expect(() => validateEventTypesCreateInput({ slug: "discovery", lengthInMinutes: 30 })).toThrow("title is required");
    expect(() => validateEventTypesCreateInput({ title: "Discovery Call", lengthInMinutes: 30 })).toThrow("slug is required");
    expect(() => validateEventTypesCreateInput({ title: "Discovery Call", slug: "discovery" })).toThrow("lengthInMinutes is required");
  });

  test("calls POST /v2/event-types with body and 2024-06-14 version header", async () => {
    const { requests, fetch } = mockFetch(eventTypeCreateFixture);
    const result = await createEventType({
      accessToken: "key",
      title: "Discovery Call",
      slug: "discovery",
      lengthInMinutes: 30,
      description: "Intro call with a new prospect.",
      fetch,
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.cal.com/v2/event-types");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("cal-api-version")).toBe("2024-06-14");
    const body = await requests[0].json() as Record<string, unknown>;
    expect(body.title).toBe("Discovery Call");
    expect(body.slug).toBe("discovery");
    expect(body.lengthInMinutes).toBe(30);
    expect(result.action).toBe("event_types.create");
    expect((result.eventType as Record<string, unknown>).id).toBe(2001);
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(createEventType({
      accessToken: "key",
      title: "Discovery Call",
      slug: "discovery",
      lengthInMinutes: 30,
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "9" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 9 });
  });
});

// ─── event_types.update ───────────────────────────────────────────────────────

describe("updateEventType", () => {
  test("validates input and returns connector-owned output without accessToken", () => {
    const result = updateEventType({ id: 1001, title: "45 Minute Meeting" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("event_types.update");
    expect((result.validated as { id: number; title: string }).id).toBe(1001);
  });

  test("throws when id is missing", () => {
    expect(() => validateEventTypesUpdateInput({ title: "45 Minute Meeting" })).toThrow("id is required");
  });

  test("calls PATCH /v2/event-types/{id}", async () => {
    const { requests, fetch } = mockFetch(eventTypeUpdateFixture);
    const result = await updateEventType({
      accessToken: "key",
      id: 1001,
      title: "45 Minute Meeting",
      lengthInMinutes: 45,
      fetch,
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.cal.com/v2/event-types/1001");
    expect(requests[0].method).toBe("PATCH");
    const body = await requests[0].json() as Record<string, unknown>;
    expect(body.title).toBe("45 Minute Meeting");
    expect(body.lengthInMinutes).toBe(45);
    expect(result.action).toBe("event_types.update");
    expect((result.eventType as Record<string, unknown>).lengthInMinutes).toBe(45);
  });

  test("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(updateEventType({
      accessToken: "key",
      id: 9999,
      title: "Missing",
      fetch: async () => new Response("{}", { status: 404 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

// ─── event_types.delete ───────────────────────────────────────────────────────

describe("deleteEventType", () => {
  test("validates input and returns connector-owned output without accessToken", () => {
    const result = deleteEventType({ id: 1001 });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("event_types.delete");
    expect((result.validated as { id: number }).id).toBe(1001);
  });

  test("throws when id is missing", () => {
    expect(() => validateEventTypesDeleteInput({})).toThrow("id is required");
  });

  test("calls DELETE /v2/event-types/{id}", async () => {
    const { requests, fetch } = mockFetch(eventTypeDeleteFixture);
    const result = await deleteEventType({ accessToken: "key", id: 1001, fetch });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.cal.com/v2/event-types/1001");
    expect(requests[0].method).toBe("DELETE");
    expect(result.action).toBe("event_types.delete");
    expect((result.eventType as Record<string, unknown>).id).toBe(1001);
  });

  test("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(deleteEventType({
      accessToken: "key",
      id: 9999,
      fetch: async () => new Response("{}", { status: 404 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

// ─── schedules.get ────────────────────────────────────────────────────────────

describe("getSchedule", () => {
  test("validates input and returns connector-owned output without accessToken", () => {
    const result = getSchedule({ id: 100 });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("schedules.get");
    expect((result.validated as { id: number }).id).toBe(100);
  });

  test("throws when id is missing", () => {
    expect(() => validateSchedulesGetInput({})).toThrow("id is required");
  });

  test("calls GET /v2/schedules/{id} with cal-api-version 2024-06-11", async () => {
    const { requests, fetch } = mockFetch(scheduleGetFixture);
    const result = await getSchedule({ accessToken: "key", id: 100, fetch });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.cal.com/v2/schedules/100");
    expect(requests[0].method).toBe("GET");
    expect(requests[0].headers.get("cal-api-version")).toBe("2024-06-11");
    expect(result.action).toBe("schedules.get");
    expect((result.schedule as Record<string, unknown>).name).toBe("Working Hours");
  });

  test("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(getSchedule({
      accessToken: "key",
      id: 9999,
      fetch: async () => new Response("{}", { status: 404 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

// ─── schedules.create ─────────────────────────────────────────────────────────

describe("createSchedule", () => {
  test("validates input and returns connector-owned output without accessToken", () => {
    const result = createSchedule({ name: "Catch up hours", timeZone: "Europe/Rome" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("schedules.create");
    expect((result.validated as { name: string }).name).toBe("Catch up hours");
  });

  test("throws when name or timeZone is missing", () => {
    expect(() => validateSchedulesCreateInput({ timeZone: "Europe/Rome" })).toThrow("name is required");
    expect(() => validateSchedulesCreateInput({ name: "Catch up hours" })).toThrow("timeZone is required");
  });

  test("calls POST /v2/schedules with 2024-06-11 version header", async () => {
    const { requests, fetch } = mockFetch(scheduleCreateFixture, 201);
    const result = await createSchedule({
      accessToken: "key",
      name: "Catch up hours",
      timeZone: "Europe/Rome",
      isDefault: false,
      availability: [{ days: ["Monday", "Tuesday"], startTime: "17:00", endTime: "19:00" }],
      fetch,
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.cal.com/v2/schedules");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("cal-api-version")).toBe("2024-06-11");
    const body = await requests[0].json() as Record<string, unknown>;
    expect(body.name).toBe("Catch up hours");
    expect(body.timeZone).toBe("Europe/Rome");
    expect(result.action).toBe("schedules.create");
    expect((result.schedule as Record<string, unknown>).id).toBe(200);
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(createSchedule({
      accessToken: "key",
      name: "Catch up hours",
      timeZone: "Europe/Rome",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "11" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 11 });
  });
});

// ─── schedules.update ─────────────────────────────────────────────────────────

describe("updateSchedule", () => {
  test("validates input and returns connector-owned output without accessToken", () => {
    const result = updateSchedule({ id: 100, name: "Updated Working Hours" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("schedules.update");
    expect((result.validated as { id: number }).id).toBe(100);
  });

  test("throws when id is missing", () => {
    expect(() => validateSchedulesUpdateInput({ name: "Updated" })).toThrow("id is required");
  });

  test("calls PATCH /v2/schedules/{id}", async () => {
    const { requests, fetch } = mockFetch(scheduleUpdateFixture);
    const result = await updateSchedule({
      accessToken: "key",
      id: 100,
      name: "Updated Working Hours",
      fetch,
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.cal.com/v2/schedules/100");
    expect(requests[0].method).toBe("PATCH");
    expect(result.action).toBe("schedules.update");
    expect((result.schedule as Record<string, unknown>).name).toBe("Updated Working Hours");
  });

  test("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(updateSchedule({
      accessToken: "key",
      id: 9999,
      name: "Missing",
      fetch: async () => new Response("{}", { status: 404 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

// ─── schedules.delete ─────────────────────────────────────────────────────────

describe("deleteSchedule", () => {
  test("validates input and returns connector-owned output without accessToken", () => {
    const result = deleteSchedule({ id: 101 });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("schedules.delete");
    expect((result.validated as { id: number }).id).toBe(101);
  });

  test("throws when id is missing", () => {
    expect(() => validateSchedulesDeleteInput({})).toThrow("id is required");
  });

  test("calls DELETE /v2/schedules/{id}", async () => {
    const { requests, fetch } = mockFetch(scheduleDeleteFixture);
    const result = await deleteSchedule({ accessToken: "key", id: 101, fetch });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.cal.com/v2/schedules/101");
    expect(requests[0].method).toBe("DELETE");
    expect(result.action).toBe("schedules.delete");
    expect((result.schedule as Record<string, unknown>).id).toBe(101);
  });

  test("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(deleteSchedule({
      accessToken: "key",
      id: 9999,
      fetch: async () => new Response("{}", { status: 404 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

// ─── availability.get ─────────────────────────────────────────────────────────

describe("getAvailability", () => {
  test("validates input and returns connector-owned output without accessToken", () => {
    const result = getAvailability({ dateFrom: "2024-10-01", dateTo: "2024-10-31" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("availability.get");
    expect((result.validated as { dateFrom: string }).dateFrom).toBe("2024-10-01");
  });

  test("throws when dateFrom or dateTo is missing", () => {
    expect(() => validateAvailabilityGetInput({ dateTo: "2024-10-31" })).toThrow("dateFrom is required");
    expect(() => validateAvailabilityGetInput({ dateFrom: "2024-10-01" })).toThrow("dateTo is required");
  });

  test("calls GET /v2/calendars/busy-times with date range", async () => {
    const { requests, fetch } = mockFetch(availabilityGetFixture);
    const result = await getAvailability({
      accessToken: "key",
      dateFrom: "2024-10-01",
      dateTo: "2024-10-31",
      timeZone: "America/New_York",
      fetch,
    });
    expect(requests).toHaveLength(1);
    const url = new URL(requests[0].url);
    expect(url.pathname).toBe("/v2/calendars/busy-times");
    expect(url.searchParams.get("dateFrom")).toBe("2024-10-01");
    expect(url.searchParams.get("dateTo")).toBe("2024-10-31");
    expect(url.searchParams.get("timeZone")).toBe("America/New_York");
    expect(result.action).toBe("availability.get");
    expect(Array.isArray(result.busyTimes)).toBe(true);
    expect((result.busyTimes as unknown[]).length).toBe(2);
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(getAvailability({
      accessToken: "key",
      dateFrom: "2024-10-01",
      dateTo: "2024-10-31",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "7" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 7 });
  });
});

// ─── webhooks.list ────────────────────────────────────────────────────────────

describe("listWebhooks", () => {
  test("validates input and returns connector-owned output without accessToken", () => {
    const result = listWebhooks({ take: 25 });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("webhooks.list");
    expect((result.validated as { take: number }).take).toBe(25);
  });

  test("accepts empty object input", () => {
    expect(validateWebhooksListInput({})).toEqual({});
  });

  test("calls GET /v2/webhooks with pagination", async () => {
    const { requests, fetch } = mockFetch(webhooksListFixture);
    const result = await listWebhooks({ accessToken: "key", take: 25, skip: 0, fetch });
    expect(requests).toHaveLength(1);
    const url = new URL(requests[0].url);
    expect(url.pathname).toBe("/v2/webhooks");
    expect(url.searchParams.get("take")).toBe("25");
    expect(url.searchParams.get("skip")).toBe("0");
    expect(result.action).toBe("webhooks.list");
    expect(Array.isArray(result.webhooks)).toBe(true);
    expect((result.webhooks as unknown[]).length).toBe(2);
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(listWebhooks({
      accessToken: "key",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "14" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 14 });
  });
});

// ─── webhooks.create ──────────────────────────────────────────────────────────

describe("createWebhook", () => {
  test("validates input and returns connector-owned output without accessToken", () => {
    const result = createWebhook({
      subscriberUrl: "https://hooks.example.com/cal",
      triggers: ["BOOKING_CREATED"],
    });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("webhooks.create");
    expect((result.validated as { subscriberUrl: string }).subscriberUrl).toBe("https://hooks.example.com/cal");
  });

  test("throws when subscriberUrl or triggers is missing", () => {
    expect(() => validateWebhooksCreateInput({ triggers: ["BOOKING_CREATED"] })).toThrow("subscriberUrl is required");
    expect(() => validateWebhooksCreateInput({ subscriberUrl: "https://hooks.example.com/cal" })).toThrow("triggers is required");
  });

  test("calls POST /v2/webhooks with body", async () => {
    const { requests, fetch } = mockFetch(webhookCreateFixture, 201);
    const result = await createWebhook({
      accessToken: "key",
      subscriberUrl: "https://hooks.example.com/cal",
      triggers: ["BOOKING_CREATED", "BOOKING_CANCELLED"],
      active: true,
      fetch,
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.cal.com/v2/webhooks");
    expect(requests[0].method).toBe("POST");
    const body = await requests[0].json() as Record<string, unknown>;
    expect(body.subscriberUrl).toBe("https://hooks.example.com/cal");
    expect(body.triggers).toEqual(["BOOKING_CREATED", "BOOKING_CANCELLED"]);
    expect(result.action).toBe("webhooks.create");
    expect((result.webhook as Record<string, unknown>).id).toBe(601);
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(createWebhook({
      accessToken: "key",
      subscriberUrl: "https://hooks.example.com/cal",
      triggers: ["BOOKING_CREATED"],
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "6" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 6 });
  });
});

// ─── webhooks.get ─────────────────────────────────────────────────────────────

describe("getWebhook", () => {
  test("validates input and returns connector-owned output without accessToken", () => {
    const result = getWebhook({ id: 501 });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("webhooks.get");
    expect((result.validated as { id: number }).id).toBe(501);
  });

  test("throws when id is missing", () => {
    expect(() => validateWebhooksGetInput({})).toThrow("id is required");
  });

  test("calls GET /v2/webhooks/{id}", async () => {
    const { requests, fetch } = mockFetch(webhookGetFixture);
    const result = await getWebhook({ accessToken: "key", id: 501, fetch });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.cal.com/v2/webhooks/501");
    expect(result.action).toBe("webhooks.get");
    expect((result.webhook as Record<string, unknown>).subscriberUrl).toBe("https://example.com/webhooks/cal");
  });

  test("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(getWebhook({
      accessToken: "key",
      id: 9999,
      fetch: async () => new Response("{}", { status: 404 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

// ─── webhooks.delete ──────────────────────────────────────────────────────────

describe("deleteWebhook", () => {
  test("validates input and returns connector-owned output without accessToken", () => {
    const result = deleteWebhook({ id: 501 });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("webhooks.delete");
    expect((result.validated as { id: number }).id).toBe(501);
  });

  test("throws when id is missing", () => {
    expect(() => validateWebhooksDeleteInput({})).toThrow("id is required");
  });

  test("calls DELETE /v2/webhooks/{id}", async () => {
    const { requests, fetch } = mockFetch(webhookDeleteFixture);
    const result = await deleteWebhook({ accessToken: "key", id: 501, fetch });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.cal.com/v2/webhooks/501");
    expect(requests[0].method).toBe("DELETE");
    expect(result.action).toBe("webhooks.delete");
    expect((result.webhook as Record<string, unknown>).id).toBe(501);
  });

  test("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(deleteWebhook({
      accessToken: "key",
      id: 9999,
      fetch: async () => new Response("{}", { status: 404 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});
