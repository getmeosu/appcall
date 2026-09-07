import { describe, expect, test } from "bun:test";
import bookingsListFixture from "../fixtures/bookings_list.json";
import bookingGetFixture from "../fixtures/booking_get.json";
import {
  normalizeBooking,
  parseBookingsResponse,
  parseBookingResponse,
} from "../src/objects";

// ---------------------------------------------------------------------------
// normalizeBooking
// ---------------------------------------------------------------------------

describe("normalizeBooking", () => {
  test("normalizes a full booking from the bookings list fixture", () => {
    const raw = bookingsListFixture.data[0] as Record<string, unknown>;
    const result = normalizeBooking(raw);

    expect(result.id).toBe("cal-booking:booking_uid_001");
    expect(result.provider).toBe("cal-com");
    expect(result.title).toBe("30 Minute Meeting between John and Alice");
    expect(result.start).toBe("2024-09-15T10:00:00.000Z");
    expect(result.end).toBe("2024-09-15T10:30:00.000Z");
    expect(result.status).toBe("ACCEPTED");
    expect(result.meetingUrl).toBe("https://meet.google.com/abc-defg-hij");
    expect(result.attendees).toHaveLength(1);
    expect(result.attendees[0].name).toBe("Alice Smith");
    expect(result.attendees[0].email).toBe("alice@example.com");
    expect(result.attendees[0].timeZone).toBe("America/Los_Angeles");
    expect(result.modelVersion).toBe("2026-05-17");
    expect(result.raw).toBe(raw);
  });

  test("normalizes a booking with missing optional fields", () => {
    const result = normalizeBooking({});
    expect(result.id).toBe("cal-booking:");
    expect(result.provider).toBe("cal-com");
    expect(result.title).toBe("");
    expect(result.start).toBe("");
    expect(result.end).toBe("");
    expect(result.status).toBe("");
    expect(result.attendees).toEqual([]);
    expect(result.meetingUrl).toBe("");
  });

  test("falls back to startTime/endTime when start/end are missing", () => {
    const result = normalizeBooking({
      uid: "uid_123",
      startTime: "2024-09-15T10:00:00.000Z",
      endTime: "2024-09-15T10:30:00.000Z",
    });
    expect(result.start).toBe("2024-09-15T10:00:00.000Z");
    expect(result.end).toBe("2024-09-15T10:30:00.000Z");
  });

  test("uses id as fallback when uid is missing", () => {
    const result = normalizeBooking({ id: 55001 });
    expect(result.id).toBe("cal-booking:55001");
  });

  test("extracts meetingUrl from location.link object", () => {
    const result = normalizeBooking({
      uid: "uid_xyz",
      location: { link: "https://zoom.us/j/12345" },
    });
    expect(result.meetingUrl).toBe("https://zoom.us/j/12345");
  });
});

// ---------------------------------------------------------------------------
// parseBookingsResponse
// ---------------------------------------------------------------------------

describe("parseBookingsResponse", () => {
  test("parses bookings_list fixture (array envelope)", () => {
    const result = parseBookingsResponse(bookingsListFixture);
    expect(result.bookings).toHaveLength(2);
    expect(result.bookings[0].id).toBe("cal-booking:booking_uid_001");
    expect(result.bookings[1].id).toBe("cal-booking:booking_uid_002");
  });

  test("returns empty array for null input", () => {
    const result = parseBookingsResponse(null);
    expect(result.bookings).toEqual([]);
  });

  test("returns empty array for non-record input", () => {
    const result = parseBookingsResponse("bad");
    expect(result.bookings).toEqual([]);
  });

  test("handles direct array data (no envelope)", () => {
    const result = parseBookingsResponse([
      { uid: "uid_a", title: "Meeting A", status: "ACCEPTED", start: "2024-09-15T10:00:00Z", end: "2024-09-15T10:30:00Z", attendees: [] },
    ]);
    expect(result.bookings).toHaveLength(1);
    expect(result.bookings[0].id).toBe("cal-booking:uid_a");
  });

  test("filters out non-record entries", () => {
    const result = parseBookingsResponse({
      status: "success",
      data: [null, { uid: "uid_b", title: "B", status: "ACCEPTED", start: "", end: "", attendees: [] }, "bad"],
    });
    expect(result.bookings).toHaveLength(1);
    expect(result.bookings[0].id).toBe("cal-booking:uid_b");
  });
});

// ---------------------------------------------------------------------------
// parseBookingResponse
// ---------------------------------------------------------------------------

describe("parseBookingResponse", () => {
  test("parses booking_get fixture", () => {
    const result = parseBookingResponse(bookingGetFixture);
    expect(result.booking).not.toBeNull();
    expect(result.booking!.id).toBe("cal-booking:booking_uid_001");
    expect(result.booking!.title).toBe("30 Minute Meeting between John and Alice");
    expect(result.booking!.status).toBe("ACCEPTED");
  });

  test("returns null for null input", () => {
    const result = parseBookingResponse(null);
    expect(result.booking).toBeNull();
  });

  test("returns null when data is not a record", () => {
    const result = parseBookingResponse({ status: "success", data: [1, 2] });
    expect(result.booking).toBeNull();
  });
});
