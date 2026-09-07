import { describe, expect, test } from "bun:test";
import teamsMeetingCreateFixture from "../fixtures/teams_meeting_create.json";
import teamsMeetingGetByJoinUrlFixture from "../fixtures/teams_meeting_get_by_join_url.json";
import calendarEventTeamsFixture from "../fixtures/calendar_event_teams.json";
import {
  validateCreateMeetingInput,
  validateGetMeetingInput,
  validateUpdateMeetingInput,
  validateDeleteMeetingInput,
  validateGetMeetingByJoinUrlInput,
  validateCreateCalendarTeamsEventInput,
  createTeamsMeetingsClient,
} from "../src/teams";

describe("microsoft-365 Teams meetings", () => {
  // ─── Input validation ────────────────────────────────────────────────────────

  test("validateCreateMeetingInput returns full input", () => {
    const result = validateCreateMeetingInput({
      subject: "Sprint Review",
      startDateTime: "2026-06-01T09:00:00Z",
      endDateTime: "2026-06-01T10:00:00Z",
    });
    expect(result.subject).toBe("Sprint Review");
    expect(result.startDateTime).toBe("2026-06-01T09:00:00Z");
    expect(result.endDateTime).toBe("2026-06-01T10:00:00Z");
    expect(result.userId).toBeUndefined();
  });

  test("validateCreateMeetingInput accepts optional userId", () => {
    const result = validateCreateMeetingInput({
      subject: "Review",
      startDateTime: "2026-06-01T09:00:00Z",
      endDateTime: "2026-06-01T10:00:00Z",
      userId: "user-abc",
    });
    expect(result.userId).toBe("user-abc");
  });

  test("validateCreateMeetingInput throws on missing required fields", () => {
    expect(() => validateCreateMeetingInput({})).toThrow("subject is required");
    expect(() => validateCreateMeetingInput({ subject: "Test" })).toThrow("startDateTime is required");
    expect(() => validateCreateMeetingInput({ subject: "Test", startDateTime: "2026-06-01T09:00:00Z" })).toThrow("endDateTime is required");
    expect(() => validateCreateMeetingInput("not-object")).toThrow("create meeting input must be an object");
  });

  test("validateGetMeetingInput returns meetingId", () => {
    const result = validateGetMeetingInput({ meetingId: "MTG123" });
    expect(result.meetingId).toBe("MTG123");
    expect(result.userId).toBeUndefined();
  });

  test("validateGetMeetingInput throws on missing meetingId", () => {
    expect(() => validateGetMeetingInput({})).toThrow("meetingId is required");
  });

  test("validateUpdateMeetingInput returns meetingId and optional fields", () => {
    const result = validateUpdateMeetingInput({ meetingId: "MTG123", subject: "Updated" });
    expect(result.meetingId).toBe("MTG123");
    expect(result.subject).toBe("Updated");
    expect(result.startDateTime).toBeUndefined();
  });

  test("validateUpdateMeetingInput throws on missing meetingId", () => {
    expect(() => validateUpdateMeetingInput({ subject: "Oops" })).toThrow("meetingId is required");
  });

  test("validateDeleteMeetingInput returns meetingId", () => {
    const result = validateDeleteMeetingInput({ meetingId: "MTG456" });
    expect(result.meetingId).toBe("MTG456");
  });

  test("validateDeleteMeetingInput throws on missing meetingId", () => {
    expect(() => validateDeleteMeetingInput({})).toThrow("meetingId is required");
  });

  test("validateGetMeetingByJoinUrlInput returns joinWebUrl", () => {
    const result = validateGetMeetingByJoinUrlInput({ joinWebUrl: "https://teams.microsoft.com/l/meetup-join/..." });
    expect(result.joinWebUrl).toBe("https://teams.microsoft.com/l/meetup-join/...");
  });

  test("validateGetMeetingByJoinUrlInput throws on missing joinWebUrl", () => {
    expect(() => validateGetMeetingByJoinUrlInput({})).toThrow("joinWebUrl is required");
  });

  test("validateCreateCalendarTeamsEventInput returns full input", () => {
    const result = validateCreateCalendarTeamsEventInput({
      subject: "Project Sync",
      start: { dateTime: "2026-06-02T14:00:00", timeZone: "UTC" },
      end: { dateTime: "2026-06-02T15:00:00", timeZone: "UTC" },
      body: "Weekly sync",
      attendees: ["bob@example.com"],
    });
    expect(result.subject).toBe("Project Sync");
    expect(result.start.dateTime).toBe("2026-06-02T14:00:00");
    expect(result.end.timeZone).toBe("UTC");
    expect(result.body).toBe("Weekly sync");
    expect(result.attendees).toEqual(["bob@example.com"]);
  });

  test("validateCreateCalendarTeamsEventInput throws on missing required fields", () => {
    expect(() => validateCreateCalendarTeamsEventInput({})).toThrow("subject is required");
    expect(() => validateCreateCalendarTeamsEventInput({ subject: "Test" })).toThrow("start must be an object");
    expect(() => validateCreateCalendarTeamsEventInput({ subject: "Test", start: { dateTime: "2026-06-02T14:00:00", timeZone: "UTC" } })).toThrow("end must be an object");
  });

  // ─── Mocked HTTP: teams_meetings.create ─────────────────────────────────────

  test("create POSTs to /v1.0/me/onlineMeetings with correct body and Bearer token", async () => {
    const requests: Request[] = [];
    const client = createTeamsMeetingsClient({
      accessToken: "tok-create",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(teamsMeetingCreateFixture), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        });
      },
    });

    const result = await client.create({
      subject: "Team Kickoff",
      startDateTime: "2026-06-01T09:00:00.0000000Z",
      endDateTime: "2026-06-01T10:00:00.0000000Z",
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://graph.microsoft.com/v1.0/me/onlineMeetings");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer tok-create");
    expect(requests[0].headers.get("Content-Type")).toBe("application/json");

    const sentBody = await requests[0].json();
    expect(sentBody.subject).toBe("Team Kickoff");
    expect(sentBody.startDateTime).toBe("2026-06-01T09:00:00.0000000Z");
    expect(sentBody.endDateTime).toBe("2026-06-01T10:00:00.0000000Z");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.meeting.joinWebUrl).toBe(teamsMeetingCreateFixture.joinWebUrl);
      expect(result.meeting.id).toBe(teamsMeetingCreateFixture.id);
      expect(result.meeting.subject).toBe("Team Kickoff");
    }
  });

  test("create uses /v1.0/users/{userId}/onlineMeetings when userId is provided", async () => {
    const requests: Request[] = [];
    const client = createTeamsMeetingsClient({
      accessToken: "tok-create",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(teamsMeetingCreateFixture), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        });
      },
    });

    await client.create({
      subject: "Review",
      startDateTime: "2026-06-01T09:00:00Z",
      endDateTime: "2026-06-01T10:00:00Z",
      userId: "user-abc",
    });

    expect(requests[0].url).toBe("https://graph.microsoft.com/v1.0/users/user-abc/onlineMeetings");
  });

  test("create maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    const client = createTeamsMeetingsClient({
      accessToken: "tok-create",
      fetch: async () => new Response("{}", { status: 429, headers: { "Retry-After": "30" } }),
    });

    const result = await client.create({
      subject: "Test",
      startDateTime: "2026-06-01T09:00:00Z",
      endDateTime: "2026-06-01T10:00:00Z",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("CONNECTOR_RATE_LIMITED");
      expect(result.error.retryAfterSeconds).toBe(30);
    }
  });

  test("create maps non-201/429 to CONNECTOR_UPSTREAM_ERROR", async () => {
    const client = createTeamsMeetingsClient({
      accessToken: "tok-create",
      fetch: async () => new Response("{}", { status: 400 }),
    });

    const result = await client.create({
      subject: "Test",
      startDateTime: "2026-06-01T09:00:00Z",
      endDateTime: "2026-06-01T10:00:00Z",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONNECTOR_UPSTREAM_ERROR");
  });

  // ─── Mocked HTTP: teams_meetings.get ────────────────────────────────────────

  test("get GETs /v1.0/me/onlineMeetings/{meetingId} with Bearer token", async () => {
    const requests: Request[] = [];
    const client = createTeamsMeetingsClient({
      accessToken: "tok-get",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(teamsMeetingCreateFixture), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    });

    const result = await client.get({ meetingId: "MSp1NTk4" });

    expect(requests[0].url).toContain("/v1.0/me/onlineMeetings/MSp1NTk4");
    expect(requests[0].method).toBe("GET");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer tok-get");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.meeting.id).toBe(teamsMeetingCreateFixture.id);
  });

  test("get uses /v1.0/users/{userId}/onlineMeetings when userId provided", async () => {
    const requests: Request[] = [];
    const client = createTeamsMeetingsClient({
      accessToken: "tok-get",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(teamsMeetingCreateFixture), { status: 200, headers: { "Content-Type": "application/json" } });
      },
    });

    await client.get({ meetingId: "MTG123", userId: "user-xyz" });
    expect(requests[0].url).toContain("/v1.0/users/user-xyz/onlineMeetings/MTG123");
  });

  test("get maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    const client = createTeamsMeetingsClient({
      accessToken: "tok-get",
      fetch: async () => new Response("{}", { status: 429, headers: { "Retry-After": "15" } }),
    });

    const result = await client.get({ meetingId: "MTG1" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONNECTOR_RATE_LIMITED");
  });

  test("get maps non-200/429 to CONNECTOR_UPSTREAM_ERROR", async () => {
    const client = createTeamsMeetingsClient({
      accessToken: "tok-get",
      fetch: async () => new Response("{}", { status: 404 }),
    });

    const result = await client.get({ meetingId: "missing" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONNECTOR_UPSTREAM_ERROR");
  });

  // ─── Mocked HTTP: teams_meetings.update ──────────────────────────────────────

  test("update PATCHes /v1.0/me/onlineMeetings/{meetingId} with Bearer token", async () => {
    const requests: Request[] = [];
    const updatedMeeting = { ...teamsMeetingCreateFixture, subject: "Updated Meeting" };
    const client = createTeamsMeetingsClient({
      accessToken: "tok-update",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(updatedMeeting), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    });

    const result = await client.update({ meetingId: "MSp1NTk4", subject: "Updated Meeting" });

    expect(requests[0].url).toContain("/v1.0/me/onlineMeetings/MSp1NTk4");
    expect(requests[0].method).toBe("PATCH");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer tok-update");

    const sentBody = await requests[0].json();
    expect(sentBody.subject).toBe("Updated Meeting");

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.meeting.subject).toBe("Updated Meeting");
  });

  test("update maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    const client = createTeamsMeetingsClient({
      accessToken: "tok-update",
      fetch: async () => new Response("{}", { status: 429, headers: { "Retry-After": "5" } }),
    });

    const result = await client.update({ meetingId: "MTG1", subject: "New" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONNECTOR_RATE_LIMITED");
  });

  test("update maps non-200/429 to CONNECTOR_UPSTREAM_ERROR", async () => {
    const client = createTeamsMeetingsClient({
      accessToken: "tok-update",
      fetch: async () => new Response("{}", { status: 500 }),
    });

    const result = await client.update({ meetingId: "MTG1", subject: "New" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONNECTOR_UPSTREAM_ERROR");
  });

  // ─── Mocked HTTP: teams_meetings.delete ──────────────────────────────────────

  test("delete sends DELETE and returns ok on 204 (empty body)", async () => {
    const requests: Request[] = [];
    const client = createTeamsMeetingsClient({
      accessToken: "tok-delete",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(null, { status: 204 });
      },
    });

    const result = await client.delete({ meetingId: "MTG999" });

    expect(requests[0].url).toContain("/v1.0/me/onlineMeetings/MTG999");
    expect(requests[0].method).toBe("DELETE");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer tok-delete");
    expect(result.ok).toBe(true);
  });

  test("delete maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    const client = createTeamsMeetingsClient({
      accessToken: "tok-delete",
      fetch: async () => new Response("{}", { status: 429, headers: { "Retry-After": "10" } }),
    });

    const result = await client.delete({ meetingId: "MTG1" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONNECTOR_RATE_LIMITED");
  });

  test("delete maps non-204/429 to CONNECTOR_UPSTREAM_ERROR", async () => {
    const client = createTeamsMeetingsClient({
      accessToken: "tok-delete",
      fetch: async () => new Response("{}", { status: 403 }),
    });

    const result = await client.delete({ meetingId: "MTG1" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONNECTOR_UPSTREAM_ERROR");
  });

  // ─── Mocked HTTP: teams_meetings.get_by_join_url ─────────────────────────────

  test("getByJoinUrl encodes $filter with JoinWebUrl and returns meetings", async () => {
    const requests: Request[] = [];
    const client = createTeamsMeetingsClient({
      accessToken: "tok-filter",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(teamsMeetingGetByJoinUrlFixture), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    });

    const joinUrl = "https://teams.microsoft.com/l/meetup-join/19%3ameeting_NTk4%40thread.v2/0";
    const result = await client.getByJoinUrl({ joinWebUrl: joinUrl });

    expect(requests[0].url).toContain("/v1.0/me/onlineMeetings");
    expect(requests[0].url).toContain("filter=");
    expect(requests[0].url).toContain("JoinWebUrl");
    expect(requests[0].method).toBe("GET");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer tok-filter");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.meetings).toHaveLength(1);
      expect(result.meetings[0].joinWebUrl).toBe(teamsMeetingGetByJoinUrlFixture.value[0].joinWebUrl);
    }
  });

  test("getByJoinUrl encodes filter correctly in URL", async () => {
    const requests: Request[] = [];
    const client = createTeamsMeetingsClient({
      accessToken: "tok-filter",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify({ value: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
      },
    });

    const joinUrl = "https://teams.microsoft.com/join/test";
    await client.getByJoinUrl({ joinWebUrl: joinUrl });

    const url = new URL(requests[0].url);
    const filterParam = url.searchParams.get("$filter");
    expect(filterParam).toBe(`JoinWebUrl eq '${joinUrl}'`);
  });

  test("getByJoinUrl maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    const client = createTeamsMeetingsClient({
      accessToken: "tok-filter",
      fetch: async () => new Response("{}", { status: 429, headers: { "Retry-After": "20" } }),
    });

    const result = await client.getByJoinUrl({ joinWebUrl: "https://teams.microsoft.com/join/x" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONNECTOR_RATE_LIMITED");
  });

  // ─── Mocked HTTP: calendar.event.create_teams ────────────────────────────────

  test("createCalendarTeamsEvent POSTs to /v1.0/me/events with isOnlineMeeting:true and teamsForBusiness provider", async () => {
    const requests: Request[] = [];
    const client = createTeamsMeetingsClient({
      accessToken: "tok-cal",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(calendarEventTeamsFixture), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        });
      },
    });

    const result = await client.createCalendarTeamsEvent({
      subject: "Project Sync",
      start: { dateTime: "2026-06-02T14:00:00", timeZone: "UTC" },
      end: { dateTime: "2026-06-02T15:00:00", timeZone: "UTC" },
      attendees: ["bob@example.com"],
    });

    expect(requests[0].url).toBe("https://graph.microsoft.com/v1.0/me/events");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer tok-cal");

    const sentBody = await requests[0].json();
    expect(sentBody.subject).toBe("Project Sync");
    expect(sentBody.isOnlineMeeting).toBe(true);
    expect(sentBody.onlineMeetingProvider).toBe("teamsForBusiness");
    expect(sentBody.attendees).toHaveLength(1);
    expect(sentBody.attendees[0].emailAddress.address).toBe("bob@example.com");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.event.summary).toBe("Project Sync");
    }
  });

  test("createCalendarTeamsEvent always sets isOnlineMeeting:true regardless of input", async () => {
    const requests: Request[] = [];
    const client = createTeamsMeetingsClient({
      accessToken: "tok-cal",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(calendarEventTeamsFixture), { status: 201, headers: { "Content-Type": "application/json" } });
      },
    });

    await client.createCalendarTeamsEvent({
      subject: "Meeting",
      start: { dateTime: "2026-06-02T14:00:00", timeZone: "UTC" },
      end: { dateTime: "2026-06-02T15:00:00", timeZone: "UTC" },
    });

    const sentBody = await requests[0].json();
    expect(sentBody.isOnlineMeeting).toBe(true);
    expect(sentBody.onlineMeetingProvider).toBe("teamsForBusiness");
  });

  test("createCalendarTeamsEvent maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    const client = createTeamsMeetingsClient({
      accessToken: "tok-cal",
      fetch: async () => new Response("{}", { status: 429, headers: { "Retry-After": "25" } }),
    });

    const result = await client.createCalendarTeamsEvent({
      subject: "Meeting",
      start: { dateTime: "2026-06-02T14:00:00", timeZone: "UTC" },
      end: { dateTime: "2026-06-02T15:00:00", timeZone: "UTC" },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("CONNECTOR_RATE_LIMITED");
      expect(result.error.retryAfterSeconds).toBe(25);
    }
  });

  test("createCalendarTeamsEvent maps non-201/429 to CONNECTOR_UPSTREAM_ERROR", async () => {
    const client = createTeamsMeetingsClient({
      accessToken: "tok-cal",
      fetch: async () => new Response("{}", { status: 400 }),
    });

    const result = await client.createCalendarTeamsEvent({
      subject: "Meeting",
      start: { dateTime: "2026-06-02T14:00:00", timeZone: "UTC" },
      end: { dateTime: "2026-06-02T15:00:00", timeZone: "UTC" },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONNECTOR_UPSTREAM_ERROR");
  });
});
