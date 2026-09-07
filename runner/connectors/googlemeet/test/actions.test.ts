import { describe, expect, test } from "bun:test";
import { createMeeting, validateCreateMeetingInput, listMeetings } from "../src/actions";
import createFixture from "../fixtures/create_meeting.json";

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
