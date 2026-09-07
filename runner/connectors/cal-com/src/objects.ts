import { prop, isRecord } from "./http";

// ---------------------------------------------------------------------------
// NormalizedBooking
// ---------------------------------------------------------------------------

export type NormalizedBooking = {
  id: string;
  provider: "cal-com";
  title: string;
  start: string;
  end: string;
  status: string;
  attendees: Array<{ name: string; email: string; timeZone: string }>;
  meetingUrl: string;
  modelVersion: "2026-05-17";
  raw: Record<string, unknown>;
};

export function normalizeBooking(b: Record<string, unknown>): NormalizedBooking {
  const attendeesRaw = Array.isArray(b.attendees) ? b.attendees : [];
  const attendees = attendeesRaw.filter(isRecord).map((a) => ({
    name: prop(a, "name"),
    email: prop(a, "email"),
    timeZone: prop(a, "timeZone"),
  }));

  // meetingUrl may be in different places depending on location type
  let meetingUrl = "";
  if (typeof b.meetingUrl === "string") {
    meetingUrl = b.meetingUrl;
  } else if (isRecord(b.location) && typeof b.location.link === "string") {
    meetingUrl = b.location.link;
  }

  return {
    id: `cal-booking:${prop(b, "uid") || String(b.id ?? "")}`,
    provider: "cal-com",
    title: prop(b, "title"),
    start: prop(b, "start") || prop(b, "startTime"),
    end: prop(b, "end") || prop(b, "endTime"),
    status: prop(b, "status"),
    attendees,
    meetingUrl,
    modelVersion: "2026-05-17",
    raw: b,
  };
}

export function parseBookingsResponse(response: unknown): { bookings: NormalizedBooking[] } {
  // Handle direct array input
  if (Array.isArray(response)) {
    return { bookings: response.filter(isRecord).map(normalizeBooking) };
  }

  if (!isRecord(response)) return { bookings: [] };

  // Cal.com v2 envelope: {status:"success", data:[...]} or {status:"success", data:{bookings:[...]}}
  let data: unknown = response;
  if (response.status === "success" && response.data !== undefined) {
    data = response.data;
  }

  const items: unknown[] = Array.isArray(data)
    ? data
    : isRecord(data) && Array.isArray((data as Record<string, unknown>).bookings)
      ? (data as Record<string, unknown>).bookings as unknown[]
      : [];

  return {
    bookings: items.filter(isRecord).map(normalizeBooking),
  };
}

export function parseBookingResponse(response: unknown): { booking: NormalizedBooking | null } {
  if (!isRecord(response)) return { booking: null };

  let data: unknown = response;
  if (response.status === "success" && response.data !== undefined) {
    data = response.data;
  }

  if (!isRecord(data)) return { booking: null };
  return { booking: normalizeBooking(data) };
}
