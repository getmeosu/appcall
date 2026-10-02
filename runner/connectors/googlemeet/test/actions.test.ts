import { describe, expect, test } from "bun:test";
import {
  createMeeting,
  validateCreateMeetingInput,
  listMeetings,
  getMeeting,
  validateGetMeetingInput,
  updateMeeting,
  validateUpdateMeetingInput,
  deleteMeeting,
  validateDeleteMeetingInput,
} from "../src/actions";
import createFixture from "../fixtures/create_meeting.json";
import getFixture from "../fixtures/get_meeting.json";
import updateFixture from "../fixtures/update_meeting.json";

const TOKEN = "ya29.test";

describe("createMeeting", () => {
  test("validates required fields without a token", () => {
    const v = validateCreateMeetingInput({ summary: "Sync", start: "2026-06-01T09:00:00Z", end: "2026-06-01T09:30:00Z" });
    expect(v.summary).toBe("Sync");
  });

  test("throws when summary missing", () => {
    expect(() => validateCreateMeetingInput({ start: "x", end: "y" })).toThrow("summary is required");
  });

  test("creates a meeting with conferenceDataVersion=1 and returns the meet link", async () => {
    const requests: Request[] = [];
    const result = await createMeeting({
      accessToken: TOKEN,
      summary: "Intro call",
      start: "2026-06-01T09:00:00Z",
      end: "2026-06-01T09:30:00Z",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(createFixture, { status: 200 });
      },
    }) as Record<string, any>;
    expect(requests[0].method).toBe("POST");
    expect(new URL(requests[0].url).searchParams.get("conferenceDataVersion")).toBe("1");
    expect(result.connector).toBe("googlemeet");
    expect(result.action).toBe("meetings.create");
    expect(result.meeting.meetingUrl).toBe("https://meet.google.com/abc-defg-hij");
  });

  test("invites attendees and sends updates", async () => {
    const requests: Request[] = [];
    await createMeeting({
      accessToken: TOKEN,
      summary: "Intro call",
      start: "2026-06-01T09:00:00Z",
      end: "2026-06-01T09:30:00Z",
      attendees: ["prospect@example.com", "guest@example.com"],
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(createFixture, { status: 200 });
      },
    });
    expect(new URL(requests[0].url).searchParams.get("sendUpdates")).toBe("all");
    const body = await requests[0].json() as Record<string, any>;
    expect(body.attendees).toEqual([{ email: "prospect@example.com" }, { email: "guest@example.com" }]);
  });

  test("rejects non-string attendees", () => {
    expect(() => validateCreateMeetingInput({ summary: "x", start: "a", end: "b", attendees: [123] }))
      .toThrow("attendees must be an array of email strings");
  });

  test("maps 401 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(createMeeting({
      accessToken: "bad",
      summary: "x", start: "a", end: "b",
      fetch: async () => new Response(JSON.stringify({ error: { message: "Invalid Credentials" } }), { status: 401 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

describe("listMeetings", () => {
  test("returns validated shape without a token", () => {
    const r = listMeetings({}) as Record<string, unknown>;
    expect(r.connector).toBe("googlemeet");
    expect(r.action).toBe("meetings.list");
  });

  test("maps 401 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(listMeetings({
      accessToken: "bad",
      fetch: async () => new Response(JSON.stringify({ error: { message: "Invalid Credentials" } }), { status: 401 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED with retryAfterSeconds", async () => {
    await expect(listMeetings({
      accessToken: "bad",
      fetch: async () => new Response("", { status: 429, headers: { "retry-after": "30" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 30 });
  });

  test("happy path: returns normalized meetings and includes timeMin in URL", async () => {
    const requests: Request[] = [];
    const result = await listMeetings({
      accessToken: TOKEN,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json({ items: [{ id: "evt_1", summary: "Sync" }] }, { status: 200 });
      },
    }) as Record<string, any>;
    const url = new URL(requests[0].url);
    expect(url.searchParams.has("timeMin")).toBe(true);
    expect(result.connector).toBe("googlemeet");
    expect(result.action).toBe("meetings.list");
    expect(result.source).toBe("provider");
    expect(Array.isArray(result.meetings)).toBe(true);
    expect(result.meetings[0].providerMeetingId).toBe("evt_1");
  });
});

describe("getMeeting", () => {
  test("validates input without a token", () => {
    const result = getMeeting({ meetingId: "evt_123" }) as Record<string, any>;
    expect(result.connector).toBe("googlemeet");
    expect(result.action).toBe("meetings.get");
    expect(result.source).toBe("connector");
    expect(result.validated.meetingId).toBe("evt_123");
  });

  test("throws when meetingId is missing", () => {
    expect(() => validateGetMeetingInput({})).toThrow("meetingId is required");
  });

  test("calls GET /calendars/primary/events/{meetingId} and normalizes", async () => {
    const requests: Request[] = [];
    const result = await getMeeting({
      accessToken: TOKEN,
      meetingId: "evt_123",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(getFixture, { status: 200 });
      },
    }) as Record<string, any>;
    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe("GET");
    expect(new URL(requests[0].url).pathname).toBe("/calendar/v3/calendars/primary/events/evt_123");
    expect(requests[0].headers.get("Authorization")).toBe(`Bearer ${TOKEN}`);
    expect(result.action).toBe("meetings.get");
    expect(result.source).toBe("provider");
    expect(result.meeting.providerMeetingId).toBe("evt_123");
    expect(result.meeting.meetingUrl).toBe("https://meet.google.com/abc-defg-hij");
  });

  test("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(getMeeting({
      accessToken: TOKEN,
      meetingId: "missing",
      fetch: async () => new Response(JSON.stringify({ error: { message: "Not Found" } }), { status: 404 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(getMeeting({
      accessToken: TOKEN,
      meetingId: "evt_123",
      fetch: async () => new Response("", { status: 429, headers: { "retry-after": "15" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 15 });
  });
});

describe("updateMeeting", () => {
  test("validates input without a token", () => {
    const result = updateMeeting({ meetingId: "evt_123", summary: "Rescheduled" }) as Record<string, any>;
    expect(result.connector).toBe("googlemeet");
    expect(result.action).toBe("meetings.update");
    expect(result.source).toBe("connector");
    expect(result.validated.meetingId).toBe("evt_123");
    expect(result.validated.summary).toBe("Rescheduled");
  });

  test("throws when meetingId is missing", () => {
    expect(() => validateUpdateMeetingInput({ summary: "x" })).toThrow("meetingId is required");
  });

  test("calls PATCH with sendUpdates and returns normalized meeting", async () => {
    const requests: Request[] = [];
    const result = await updateMeeting({
      accessToken: TOKEN,
      meetingId: "evt_123",
      summary: "Intro call (rescheduled)",
      start: "2026-06-01T10:00:00Z",
      end: "2026-06-01T10:30:00Z",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(updateFixture, { status: 200 });
      },
    }) as Record<string, any>;
    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe("PATCH");
    const url = new URL(requests[0].url);
    expect(url.pathname).toBe("/calendar/v3/calendars/primary/events/evt_123");
    expect(url.searchParams.get("conferenceDataVersion")).toBe("1");
    expect(url.searchParams.get("sendUpdates")).toBe("all");
    const body = await requests[0].json() as Record<string, any>;
    expect(body.summary).toBe("Intro call (rescheduled)");
    expect(body.start).toEqual({ dateTime: "2026-06-01T10:00:00Z" });
    expect(body.end).toEqual({ dateTime: "2026-06-01T10:30:00Z" });
    expect(result.action).toBe("meetings.update");
    expect(result.source).toBe("provider");
    expect(result.meeting.title).toBe("Intro call (rescheduled)");
    expect(result.meeting.startTime).toBe("2026-06-01T10:00:00Z");
  });

  test("rejects non-string attendees", () => {
    expect(() => validateUpdateMeetingInput({ meetingId: "evt_123", attendees: [1] }))
      .toThrow("attendees must be an array of email strings");
  });

  test("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(updateMeeting({
      accessToken: TOKEN,
      meetingId: "missing",
      summary: "x",
      fetch: async () => new Response(JSON.stringify({ error: { message: "Not Found" } }), { status: 404 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(updateMeeting({
      accessToken: TOKEN,
      meetingId: "evt_123",
      fetch: async () => new Response("", { status: 429, headers: { "retry-after": "5" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 5 });
  });
});

describe("deleteMeeting", () => {
  test("validates input without a token", () => {
    const result = deleteMeeting({ meetingId: "evt_123" }) as Record<string, any>;
    expect(result.connector).toBe("googlemeet");
    expect(result.action).toBe("meetings.delete");
    expect(result.source).toBe("connector");
    expect(result.validated.meetingId).toBe("evt_123");
  });

  test("throws when meetingId is missing", () => {
    expect(() => validateDeleteMeetingInput({})).toThrow("meetingId is required");
  });

  test("calls DELETE with sendUpdates=all and returns deleted", async () => {
    const requests: Request[] = [];
    const result = await deleteMeeting({
      accessToken: TOKEN,
      meetingId: "evt_123",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response("", { status: 204 });
      },
    }) as Record<string, any>;
    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe("DELETE");
    const url = new URL(requests[0].url);
    expect(url.pathname).toBe("/calendar/v3/calendars/primary/events/evt_123");
    expect(url.searchParams.get("sendUpdates")).toBe("all");
    expect(result.action).toBe("meetings.delete");
    expect(result.source).toBe("provider");
    expect(result.deleted).toBe(true);
    expect(result.meetingId).toBe("evt_123");
  });

  test("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(deleteMeeting({
      accessToken: TOKEN,
      meetingId: "missing",
      fetch: async () => new Response(JSON.stringify({ error: { message: "Not Found" } }), { status: 404 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(deleteMeeting({
      accessToken: TOKEN,
      meetingId: "evt_123",
      fetch: async () => new Response("", { status: 429, headers: { "retry-after": "20" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 20 });
  });
});
