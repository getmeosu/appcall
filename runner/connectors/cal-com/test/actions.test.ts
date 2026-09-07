import { describe, expect, test } from "bun:test";
import meGetFixture from "../fixtures/me_get.json";
import eventTypesListFixture from "../fixtures/event_types_list.json";
import eventTypeGetFixture from "../fixtures/event_type_get.json";
import bookingsListFixture from "../fixtures/bookings_list.json";
import bookingGetFixture from "../fixtures/booking_get.json";
import bookingCreateFixture from "../fixtures/booking_create.json";
import bookingCancelFixture from "../fixtures/booking_cancel.json";
import bookingRescheduleFixture from "../fixtures/booking_reschedule.json";
import bookingConfirmFixture from "../fixtures/booking_confirm.json";
import bookingDeclineFixture from "../fixtures/booking_decline.json";
import slotsAvailableFixture from "../fixtures/slots_available.json";
import schedulesListFixture from "../fixtures/schedules_list.json";

import {
  getMe,
  listEventTypes,
  getEventType,
  listBookings,
  getBooking,
  createBooking,
  cancelBooking,
  rescheduleBooking,
  confirmBooking,
  declineBooking,
  getAvailableSlots,
  listSchedules,
  validateMeGetInput,
  validateEventTypesListInput,
  validateEventTypesGetInput,
  validateBookingsListInput,
  validateBookingsGetInput,
  validateBookingsCreateInput,
  validateBookingsCancelInput,
  validateBookingsRescheduleInput,
  validateBookingsConfirmInput,
  validateBookingsDeclineInput,
  validateSlotsAvailableInput,
  validateSchedulesListInput,
} from "../src/actions";

// ─── me.get ───────────────────────────────────────────────────────────────────

describe("getMe", () => {
  test("validates input and returns connector-owned output without accessToken", () => {
    const result = getMe({});
    expect(result.source).toBe("connector");
    expect(result.connector).toBe("cal-com");
    expect(result.action).toBe("me.get");
    expect(result.validated).toEqual({});
  });

  test("calls GET /v2/me with Bearer token", async () => {
    const requests: Request[] = [];
    const result = await getMe({
      accessToken: "cal_live_test",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(meGetFixture), { status: 200 });
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.cal.com/v2/me");
    expect(requests[0].method).toBe("GET");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer cal_live_test");
    expect(result.connector).toBe("cal-com");
    expect(result.action).toBe("me.get");
    expect(result.source).toBe("connector");
    expect(result.user).toBeDefined();
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(getMe({
      accessToken: "key",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "30" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 30 });
  });

  test("maps non-200 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(getMe({
      accessToken: "key",
      fetch: async () => new Response("{}", { status: 500 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

// ─── event_types.list ─────────────────────────────────────────────────────────

describe("listEventTypes", () => {
  test("validates input and returns connector-owned output without accessToken", () => {
    const result = listEventTypes({ username: "johndoe" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("event_types.list");
    expect((result.validated as { username: string }).username).toBe("johndoe");
  });

  test("calls GET /v2/event-types with correct headers", async () => {
    const requests: Request[] = [];
    const result = await listEventTypes({
      accessToken: "key",
      username: "johndoe",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(eventTypesListFixture), { status: 200 });
      },
    });
    expect(requests).toHaveLength(1);
    const url = new URL(requests[0].url);
    expect(url.pathname).toBe("/v2/event-types");
    expect(url.searchParams.get("username")).toBe("johndoe");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer key");
    expect(result.action).toBe("event_types.list");
    expect(Array.isArray(result.eventTypes)).toBe(true);
    expect((result.eventTypes as unknown[]).length).toBe(2);
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(listEventTypes({
      accessToken: "key",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "60" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 60 });
  });
});

// ─── event_types.get ──────────────────────────────────────────────────────────

describe("getEventType", () => {
  test("validates input and returns connector-owned output without accessToken", () => {
    const result = getEventType({ id: 1001 });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("event_types.get");
    expect((result.validated as { id: number }).id).toBe(1001);
  });

  test("throws when id is missing", () => {
    expect(() => validateEventTypesGetInput({})).toThrow("id is required");
  });

  test("calls GET /v2/event-types/{id} with correct headers", async () => {
    const requests: Request[] = [];
    const result = await getEventType({
      accessToken: "key",
      id: 1001,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(eventTypeGetFixture), { status: 200 });
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.cal.com/v2/event-types/1001");
    expect(result.action).toBe("event_types.get");
    expect(result.eventType).toBeDefined();
  });

  test("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(getEventType({
      accessToken: "key",
      id: 9999,
      fetch: async () => new Response("{}", { status: 404 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(getEventType({
      accessToken: "key",
      id: 1001,
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "15" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 15 });
  });
});

// ─── bookings.list ────────────────────────────────────────────────────────────

describe("listBookings", () => {
  test("validates input and returns connector-owned output without accessToken", () => {
    const result = listBookings({ status: "upcoming" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("bookings.list");
    expect((result.validated as { status: string }).status).toBe("upcoming");
  });

  test("calls GET /v2/bookings with query params", async () => {
    const requests: Request[] = [];
    const result = await listBookings({
      accessToken: "key",
      status: "upcoming",
      take: 10,
      skip: 0,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(bookingsListFixture), { status: 200 });
      },
    });
    expect(requests).toHaveLength(1);
    const url = new URL(requests[0].url);
    expect(url.pathname).toBe("/v2/bookings");
    expect(url.searchParams.get("status")).toBe("upcoming");
    expect(url.searchParams.get("take")).toBe("10");
    expect(url.searchParams.get("skip")).toBe("0");
    expect(result.action).toBe("bookings.list");
    expect(Array.isArray(result.bookings)).toBe(true);
    expect((result.bookings as unknown[]).length).toBe(2);
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(listBookings({
      accessToken: "key",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "10" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED" });
  });
});

// ─── bookings.get ─────────────────────────────────────────────────────────────

describe("getBooking", () => {
  test("validates input and returns connector-owned output without accessToken", () => {
    const result = getBooking({ uid: "booking_uid_001" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("bookings.get");
    expect((result.validated as { uid: string }).uid).toBe("booking_uid_001");
  });

  test("throws when uid is missing", () => {
    expect(() => validateBookingsGetInput({})).toThrow("uid is required");
  });

  test("calls GET /v2/bookings/{uid} with correct headers", async () => {
    const requests: Request[] = [];
    const result = await getBooking({
      accessToken: "key",
      uid: "booking_uid_001",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(bookingGetFixture), { status: 200 });
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.cal.com/v2/bookings/booking_uid_001");
    expect(result.action).toBe("bookings.get");
    expect(result.booking).toBeDefined();
  });

  test("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(getBooking({
      accessToken: "key",
      uid: "nonexistent",
      fetch: async () => new Response("{}", { status: 404 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(getBooking({
      accessToken: "key",
      uid: "booking_uid_001",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "20" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 20 });
  });
});

// ─── bookings.create ──────────────────────────────────────────────────────────

describe("createBooking", () => {
  test("validates input and returns connector-owned output without accessToken", () => {
    const result = createBooking({
      start: "2024-09-20T09:00:00Z",
      eventTypeId: 1001,
      attendee: { name: "Carol White", email: "carol@example.com", timeZone: "America/Chicago" },
    });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("bookings.create");
    const v = result.validated as { start: string; eventTypeId: number };
    expect(v.start).toBe("2024-09-20T09:00:00Z");
    expect(v.eventTypeId).toBe(1001);
  });

  test("throws when start is missing", () => {
    expect(() => validateBookingsCreateInput({
      eventTypeId: 1001,
      attendee: { name: "A", email: "a@a.com", timeZone: "UTC" },
    })).toThrow("start is required");
  });

  test("throws when eventTypeId is missing", () => {
    expect(() => validateBookingsCreateInput({
      start: "2024-09-20T09:00:00Z",
      attendee: { name: "A", email: "a@a.com", timeZone: "UTC" },
    })).toThrow("eventTypeId is required");
  });

  test("throws when attendee is missing", () => {
    expect(() => validateBookingsCreateInput({
      start: "2024-09-20T09:00:00Z",
      eventTypeId: 1001,
    })).toThrow("attendee is required");
  });

  test("calls POST /v2/bookings with correct body", async () => {
    const requests: Request[] = [];
    const result = await createBooking({
      accessToken: "key",
      start: "2024-09-20T09:00:00Z",
      eventTypeId: 1001,
      attendee: { name: "Carol White", email: "carol@example.com", timeZone: "America/Chicago" },
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(bookingCreateFixture), { status: 200 });
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.cal.com/v2/bookings");
    expect(requests[0].method).toBe("POST");
    const body = await requests[0].json() as Record<string, unknown>;
    expect(body.start).toBe("2024-09-20T09:00:00Z");
    expect(body.eventTypeId).toBe(1001);
    expect(result.action).toBe("bookings.create");
    expect(result.booking).toBeDefined();
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(createBooking({
      accessToken: "key",
      start: "2024-09-20T09:00:00Z",
      eventTypeId: 1001,
      attendee: { name: "A", email: "a@a.com", timeZone: "UTC" },
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "5" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 5 });
  });
});

// ─── bookings.cancel ──────────────────────────────────────────────────────────

describe("cancelBooking", () => {
  test("validates input and returns connector-owned output without accessToken", () => {
    const result = cancelBooking({ uid: "booking_uid_001", cancellationReason: "Conflict" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("bookings.cancel");
    expect((result.validated as { uid: string }).uid).toBe("booking_uid_001");
  });

  test("throws when uid is missing", () => {
    expect(() => validateBookingsCancelInput({})).toThrow("uid is required");
  });

  test("calls POST /v2/bookings/{uid}/cancel with correct body", async () => {
    const requests: Request[] = [];
    const result = await cancelBooking({
      accessToken: "key",
      uid: "booking_uid_001",
      cancellationReason: "Schedule conflict",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(bookingCancelFixture), { status: 200 });
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.cal.com/v2/bookings/booking_uid_001/cancel");
    expect(requests[0].method).toBe("POST");
    const body = await requests[0].json() as Record<string, unknown>;
    expect(body.cancellationReason).toBe("Schedule conflict");
    expect(result.action).toBe("bookings.cancel");
    expect(result.booking).toBeDefined();
  });

  test("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(cancelBooking({
      accessToken: "key",
      uid: "nonexistent",
      fetch: async () => new Response("{}", { status: 404 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(cancelBooking({
      accessToken: "key",
      uid: "booking_uid_001",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "5" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 5 });
  });
});

// ─── bookings.reschedule ──────────────────────────────────────────────────────

describe("rescheduleBooking", () => {
  test("validates input and returns connector-owned output without accessToken", () => {
    const result = rescheduleBooking({ uid: "booking_uid_001", start: "2024-09-22T11:00:00Z" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("bookings.reschedule");
    expect((result.validated as { uid: string; start: string }).start).toBe("2024-09-22T11:00:00Z");
  });

  test("throws when uid is missing", () => {
    expect(() => validateBookingsRescheduleInput({ start: "2024-09-22T11:00:00Z" })).toThrow("uid is required");
  });

  test("throws when start is missing", () => {
    expect(() => validateBookingsRescheduleInput({ uid: "booking_uid_001" })).toThrow("start is required");
  });

  test("calls POST /v2/bookings/{uid}/reschedule with correct body", async () => {
    const requests: Request[] = [];
    const result = await rescheduleBooking({
      accessToken: "key",
      uid: "booking_uid_001",
      start: "2024-09-22T11:00:00Z",
      reschedulingReason: "Conflict with another call",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(bookingRescheduleFixture), { status: 200 });
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.cal.com/v2/bookings/booking_uid_001/reschedule");
    expect(requests[0].method).toBe("POST");
    const body = await requests[0].json() as Record<string, unknown>;
    expect(body.start).toBe("2024-09-22T11:00:00Z");
    expect(result.action).toBe("bookings.reschedule");
    expect(result.booking).toBeDefined();
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(rescheduleBooking({
      accessToken: "key",
      uid: "booking_uid_001",
      start: "2024-09-22T11:00:00Z",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "8" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 8 });
  });
});

// ─── bookings.confirm ─────────────────────────────────────────────────────────

describe("confirmBooking", () => {
  test("validates input and returns connector-owned output without accessToken", () => {
    const result = confirmBooking({ uid: "booking_uid_002" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("bookings.confirm");
    expect((result.validated as { uid: string }).uid).toBe("booking_uid_002");
  });

  test("throws when uid is missing", () => {
    expect(() => validateBookingsConfirmInput({})).toThrow("uid is required");
  });

  test("calls POST /v2/bookings/{uid}/confirm", async () => {
    const requests: Request[] = [];
    const result = await confirmBooking({
      accessToken: "key",
      uid: "booking_uid_002",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(bookingConfirmFixture), { status: 200 });
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.cal.com/v2/bookings/booking_uid_002/confirm");
    expect(requests[0].method).toBe("POST");
    expect(result.action).toBe("bookings.confirm");
    expect(result.booking).toBeDefined();
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(confirmBooking({
      accessToken: "key",
      uid: "booking_uid_002",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "12" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 12 });
  });
});

// ─── bookings.decline ─────────────────────────────────────────────────────────

describe("declineBooking", () => {
  test("validates input and returns connector-owned output without accessToken", () => {
    const result = declineBooking({ uid: "booking_uid_002", reason: "Not available" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("bookings.decline");
    expect((result.validated as { uid: string }).uid).toBe("booking_uid_002");
  });

  test("throws when uid is missing", () => {
    expect(() => validateBookingsDeclineInput({})).toThrow("uid is required");
  });

  test("calls POST /v2/bookings/{uid}/decline with reason", async () => {
    const requests: Request[] = [];
    const result = await declineBooking({
      accessToken: "key",
      uid: "booking_uid_002",
      reason: "Not available that day",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(bookingDeclineFixture), { status: 200 });
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.cal.com/v2/bookings/booking_uid_002/decline");
    expect(requests[0].method).toBe("POST");
    const body = await requests[0].json() as Record<string, unknown>;
    expect(body.reason).toBe("Not available that day");
    expect(result.action).toBe("bookings.decline");
    expect(result.booking).toBeDefined();
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(declineBooking({
      accessToken: "key",
      uid: "booking_uid_002",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "3" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 3 });
  });
});

// ─── slots.available ──────────────────────────────────────────────────────────

describe("getAvailableSlots", () => {
  test("validates input and returns connector-owned output without accessToken", () => {
    const result = getAvailableSlots({ eventTypeId: 1001, start: "2024-09-20T00:00:00Z", end: "2024-09-22T00:00:00Z" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("slots.available");
    const v = result.validated as { eventTypeId: number; start: string };
    expect(v.eventTypeId).toBe(1001);
  });

  test("throws when eventTypeId is missing", () => {
    expect(() => validateSlotsAvailableInput({ start: "2024-09-20T00:00:00Z", end: "2024-09-22T00:00:00Z" })).toThrow("eventTypeId is required");
  });

  test("throws when start is missing", () => {
    expect(() => validateSlotsAvailableInput({ eventTypeId: 1001, end: "2024-09-22T00:00:00Z" })).toThrow("start is required");
  });

  test("throws when end is missing", () => {
    expect(() => validateSlotsAvailableInput({ eventTypeId: 1001, start: "2024-09-20T00:00:00Z" })).toThrow("end is required");
  });

  test("calls GET /v2/slots with correct query params and cal-api-version 2024-09-04", async () => {
    const requests: Request[] = [];
    const result = await getAvailableSlots({
      accessToken: "key",
      eventTypeId: 1001,
      start: "2024-09-20T00:00:00Z",
      end: "2024-09-22T00:00:00Z",
      timeZone: "America/New_York",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(slotsAvailableFixture), { status: 200 });
      },
    });
    expect(requests).toHaveLength(1);
    const url = new URL(requests[0].url);
    expect(url.pathname).toBe("/v2/slots");
    expect(url.searchParams.get("eventTypeId")).toBe("1001");
    expect(url.searchParams.get("start")).toBe("2024-09-20T00:00:00Z");
    expect(url.searchParams.get("end")).toBe("2024-09-22T00:00:00Z");
    expect(url.searchParams.get("timeZone")).toBe("America/New_York");
    expect(requests[0].headers.get("cal-api-version")).toBe("2024-09-04");
    expect(result.action).toBe("slots.available");
    expect(result.slots).toBeDefined();
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(getAvailableSlots({
      accessToken: "key",
      eventTypeId: 1001,
      start: "2024-09-20T00:00:00Z",
      end: "2024-09-22T00:00:00Z",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "15" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 15 });
  });
});

// ─── schedules.list ───────────────────────────────────────────────────────────

describe("listSchedules", () => {
  test("validates input and returns connector-owned output without accessToken", () => {
    const result = listSchedules({});
    expect(result.source).toBe("connector");
    expect(result.action).toBe("schedules.list");
    expect(result.validated).toEqual({});
  });

  test("calls GET /v2/schedules with correct headers", async () => {
    const requests: Request[] = [];
    const result = await listSchedules({
      accessToken: "key",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(schedulesListFixture), { status: 200 });
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.cal.com/v2/schedules");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer key");
    expect(result.action).toBe("schedules.list");
    expect(Array.isArray(result.schedules)).toBe(true);
    expect((result.schedules as unknown[]).length).toBe(2);
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(listSchedules({
      accessToken: "key",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "20" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 20 });
  });
});
