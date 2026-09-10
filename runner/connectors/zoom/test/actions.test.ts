import { describe, expect, test } from "bun:test";
import usersMeFixture from "../fixtures/users_me.json";
import usersListFixture from "../fixtures/users_list.json";
import meetingCreateFixture from "../fixtures/meeting_create.json";
import meetingsListFixture from "../fixtures/meetings_list.json";
import meetingGetFixture from "../fixtures/meeting_get.json";
import meetingRegistrantsListFixture from "../fixtures/meeting_registrants_list.json";
import meetingAddRegistrantFixture from "../fixtures/meeting_add_registrant.json";
import pastMeetingParticipantsFixture from "../fixtures/past_meeting_participants.json";
import webinarCreateFixture from "../fixtures/webinar_create.json";
import webinarsListFixture from "../fixtures/webinars_list.json";

import {
  getUsersMe,
  listUsers,
  createMeeting,
  listMeetings,
  getMeeting,
  updateMeeting,
  deleteMeeting,
  listMeetingRegistrants,
  addMeetingRegistrant,
  listPastMeetingParticipants,
  createWebinar,
  listWebinars,
  validateUsersMeInput,
  validateUsersListInput,
  validateMeetingsCreateInput,
  validateMeetingsListInput,
  validateMeetingsGetInput,
  validateMeetingsUpdateInput,
  validateMeetingsDeleteInput,
  validateMeetingsListRegistrantsInput,
  validateMeetingsAddRegistrantInput,
  validatePastMeetingParticipantsInput,
  validateWebinarsCreateInput,
  validateWebinarsListInput,
} from "../src/actions";

// ─── users.me ─────────────────────────────────────────────────────────────────

describe("getUsersMe", () => {
  test("validates input and returns connector-owned output", () => {
    const result = getUsersMe({});
    expect(result.source).toBe("connector");
    expect(result.connector).toBe("zoom");
    expect(result.action).toBe("users.me");
    expect(result.validated).toEqual({});
  });

  test("calls GET /v2/users/me with Bearer token", async () => {
    const requests: Request[] = [];
    const result = await getUsersMe({
      accessToken: "tok_test",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(usersMeFixture), { status: 200 });
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.zoom.us/v2/users/me");
    expect(requests[0].method).toBe("GET");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer tok_test");
    expect(result.connector).toBe("zoom");
    expect(result.action).toBe("users.me");
    expect(result.source).toBe("connector");
    expect(result.user).toBeDefined();
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(getUsersMe({
      accessToken: "tok_test",
      fetch: async () => new Response(JSON.stringify({ message: "rate limited" }), {
        status: 429,
        headers: { "retry-after": "30" },
      }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 30 });
  });

  test("maps non-200 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(getUsersMe({
      accessToken: "tok_test",
      fetch: async () => new Response(JSON.stringify({ message: "server error" }), { status: 500 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

// ─── users.list ───────────────────────────────────────────────────────────────

describe("listUsers", () => {
  test("validates input and returns connector-owned output", () => {
    const result = listUsers({ status: "active", page_size: 10 });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("users.list");
    expect((result.validated as { status: string }).status).toBe("active");
  });

  test("calls GET /v2/users with correct query params and Bearer token", async () => {
    const requests: Request[] = [];
    const result = await listUsers({
      accessToken: "tok_test",
      status: "active",
      page_size: 10,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(usersListFixture), { status: 200 });
      },
    });
    expect(requests).toHaveLength(1);
    const url = new URL(requests[0].url);
    expect(url.pathname).toBe("/v2/users");
    expect(url.searchParams.get("status")).toBe("active");
    expect(url.searchParams.get("page_size")).toBe("10");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer tok_test");
    expect(result.action).toBe("users.list");
    expect(Array.isArray(result.users)).toBe(true);
    expect((result.users as unknown[]).length).toBe(2);
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(listUsers({
      accessToken: "tok_test",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "60" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 60 });
  });
});

// ─── meetings.create ──────────────────────────────────────────────────────────

describe("createMeeting", () => {
  test("validates input and returns connector-owned output", () => {
    const result = createMeeting({ topic: "My Meeting" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("meetings.create");
    expect((result.validated as { topic: string }).topic).toBe("My Meeting");
  });

  test("throws when topic is missing", () => {
    expect(() => validateMeetingsCreateInput({})).toThrow("topic is required");
  });

  test("calls POST /v2/users/me/meetings with Bearer token and correct body", async () => {
    const requests: Request[] = [];
    const result = await createMeeting({
      accessToken: "tok_test",
      topic: "Q3 Planning Meeting",
      type: 2,
      start_time: "2025-07-15T10:00:00Z",
      duration: 60,
      timezone: "America/New_York",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(meetingCreateFixture), { status: 201 });
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.zoom.us/v2/users/me/meetings");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer tok_test");
    const body = await requests[0].json() as Record<string, unknown>;
    expect(body.topic).toBe("Q3 Planning Meeting");
    expect(body.type).toBe(2);
    expect(body.start_time).toBe("2025-07-15T10:00:00Z");
    expect(body.duration).toBe(60);
    expect(result.action).toBe("meetings.create");
    expect(result.meeting).toBeDefined();
    expect((result.meeting as Record<string, unknown>).join_url).toBe("https://zoom.us/j/123456789");
  });

  test("uses custom userId when provided", async () => {
    const requests: Request[] = [];
    await createMeeting({
      accessToken: "tok_test",
      topic: "Meeting",
      userId: "user_001",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(meetingCreateFixture), { status: 201 });
      },
    });
    expect(requests[0].url).toBe("https://api.zoom.us/v2/users/user_001/meetings");
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(createMeeting({
      accessToken: "tok_test",
      topic: "Meeting",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "20" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 20 });
  });

  test("maps non-201 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(createMeeting({
      accessToken: "tok_test",
      topic: "Meeting",
      fetch: async () => new Response("{}", { status: 400 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

// ─── meetings.list ────────────────────────────────────────────────────────────

describe("listMeetings", () => {
  test("validates input and returns connector-owned output", () => {
    const result = listMeetings({ type: "scheduled" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("meetings.list");
    expect((result.validated as { type: string }).type).toBe("scheduled");
  });

  test("calls GET /v2/users/me/meetings with correct params", async () => {
    const requests: Request[] = [];
    const result = await listMeetings({
      accessToken: "tok_test",
      type: "scheduled",
      page_size: 30,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(meetingsListFixture), { status: 200 });
      },
    });
    expect(requests).toHaveLength(1);
    const url = new URL(requests[0].url);
    expect(url.pathname).toBe("/v2/users/me/meetings");
    expect(url.searchParams.get("type")).toBe("scheduled");
    expect(url.searchParams.get("page_size")).toBe("30");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer tok_test");
    expect(result.action).toBe("meetings.list");
    expect(Array.isArray(result.meetings)).toBe(true);
    expect((result.meetings as unknown[]).length).toBe(2);
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(listMeetings({
      accessToken: "tok_test",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "10" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED" });
  });
});

// ─── meetings.get ─────────────────────────────────────────────────────────────

describe("getMeeting", () => {
  test("validates input and returns connector-owned output", () => {
    const result = getMeeting({ meetingId: "123456789" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("meetings.get");
    expect((result.validated as { meetingId: string }).meetingId).toBe("123456789");
  });

  test("throws when meetingId is missing", () => {
    expect(() => validateMeetingsGetInput({})).toThrow("meetingId is required");
  });

  test("calls GET /v2/meetings/{meetingId} with Bearer token", async () => {
    const requests: Request[] = [];
    const result = await getMeeting({
      accessToken: "tok_test",
      meetingId: "123456789",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(meetingGetFixture), { status: 200 });
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.zoom.us/v2/meetings/123456789");
    expect(requests[0].method).toBe("GET");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer tok_test");
    expect(result.action).toBe("meetings.get");
    expect(result.meeting).toBeDefined();
  });

  test("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(getMeeting({
      accessToken: "tok_test",
      meetingId: "nonexistent",
      fetch: async () => new Response("{}", { status: 404 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(getMeeting({
      accessToken: "tok_test",
      meetingId: "123456789",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "15" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 15 });
  });
});

// ─── meetings.update ──────────────────────────────────────────────────────────

describe("updateMeeting", () => {
  test("validates input and returns connector-owned output", () => {
    const result = updateMeeting({ meetingId: "123456789", topic: "Updated Topic" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("meetings.update");
    expect((result.validated as { meetingId: string; topic: string }).meetingId).toBe("123456789");
    expect((result.validated as { meetingId: string; topic: string }).topic).toBe("Updated Topic");
  });

  test("throws when meetingId is missing", () => {
    expect(() => validateMeetingsUpdateInput({})).toThrow("meetingId is required");
  });

  test("calls PATCH /v2/meetings/{meetingId} with Bearer token and body", async () => {
    const requests: Request[] = [];
    const result = await updateMeeting({
      accessToken: "tok_test",
      meetingId: "123456789",
      topic: "Updated Q3 Planning",
      duration: 90,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response("", { status: 204 });
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.zoom.us/v2/meetings/123456789");
    expect(requests[0].method).toBe("PATCH");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer tok_test");
    const body = await requests[0].json() as Record<string, unknown>;
    expect(body.topic).toBe("Updated Q3 Planning");
    expect(body.duration).toBe(90);
    expect(result.action).toBe("meetings.update");
    expect(result.updated).toBe(true);
  });

  test("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(updateMeeting({
      accessToken: "tok_test",
      meetingId: "nonexistent",
      fetch: async () => new Response("{}", { status: 404 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(updateMeeting({
      accessToken: "tok_test",
      meetingId: "123456789",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "5" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 5 });
  });
});

// ─── meetings.delete ──────────────────────────────────────────────────────────

describe("deleteMeeting", () => {
  test("validates input and returns connector-owned output", () => {
    const result = deleteMeeting({ meetingId: "123456789" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("meetings.delete");
    expect((result.validated as { meetingId: string }).meetingId).toBe("123456789");
  });

  test("throws when meetingId is missing", () => {
    expect(() => validateMeetingsDeleteInput({})).toThrow("meetingId is required");
  });

  test("calls DELETE /v2/meetings/{meetingId} with Bearer token", async () => {
    const requests: Request[] = [];
    const result = await deleteMeeting({
      accessToken: "tok_test",
      meetingId: "123456789",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response("", { status: 204 });
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.zoom.us/v2/meetings/123456789");
    expect(requests[0].method).toBe("DELETE");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer tok_test");
    expect(result.action).toBe("meetings.delete");
    expect(result.deleted).toBe(true);
  });

  test("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(deleteMeeting({
      accessToken: "tok_test",
      meetingId: "nonexistent",
      fetch: async () => new Response("{}", { status: 404 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(deleteMeeting({
      accessToken: "tok_test",
      meetingId: "123456789",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "10" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 10 });
  });
});

// ─── meetings.list_registrants ────────────────────────────────────────────────

describe("listMeetingRegistrants", () => {
  test("validates input and returns connector-owned output", () => {
    const result = listMeetingRegistrants({ meetingId: "123456789" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("meetings.list_registrants");
    expect((result.validated as { meetingId: string }).meetingId).toBe("123456789");
  });

  test("throws when meetingId is missing", () => {
    expect(() => validateMeetingsListRegistrantsInput({})).toThrow("meetingId is required");
  });

  test("calls GET /v2/meetings/{meetingId}/registrants with Bearer token", async () => {
    const requests: Request[] = [];
    const result = await listMeetingRegistrants({
      accessToken: "tok_test",
      meetingId: "123456789",
      page_size: 30,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(meetingRegistrantsListFixture), { status: 200 });
      },
    });
    expect(requests).toHaveLength(1);
    const url = new URL(requests[0].url);
    expect(url.pathname).toBe("/v2/meetings/123456789/registrants");
    expect(url.searchParams.get("page_size")).toBe("30");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer tok_test");
    expect(result.action).toBe("meetings.list_registrants");
    expect(Array.isArray(result.registrants)).toBe(true);
    expect((result.registrants as unknown[]).length).toBe(2);
  });

  test("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(listMeetingRegistrants({
      accessToken: "tok_test",
      meetingId: "nonexistent",
      fetch: async () => new Response("{}", { status: 404 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(listMeetingRegistrants({
      accessToken: "tok_test",
      meetingId: "123456789",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "25" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 25 });
  });
});

// ─── meetings.add_registrant ──────────────────────────────────────────────────

describe("addMeetingRegistrant", () => {
  test("validates input and returns connector-owned output", () => {
    const result = addMeetingRegistrant({ meetingId: "123456789", email: "alice@example.com", first_name: "Alice" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("meetings.add_registrant");
    expect((result.validated as { email: string }).email).toBe("alice@example.com");
  });

  test("throws when meetingId is missing", () => {
    expect(() => validateMeetingsAddRegistrantInput({ email: "a@b.com", first_name: "A" })).toThrow("meetingId is required");
  });

  test("throws when email is missing", () => {
    expect(() => validateMeetingsAddRegistrantInput({ meetingId: "123", first_name: "A" })).toThrow("email is required");
  });

  test("throws when first_name is missing", () => {
    expect(() => validateMeetingsAddRegistrantInput({ meetingId: "123", email: "a@b.com" })).toThrow("first_name is required");
  });

  test("calls POST /v2/meetings/{meetingId}/registrants with Bearer token and body", async () => {
    const requests: Request[] = [];
    const result = await addMeetingRegistrant({
      accessToken: "tok_test",
      meetingId: "123456789",
      email: "alice@example.com",
      first_name: "Alice",
      last_name: "Williams",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(meetingAddRegistrantFixture), { status: 201 });
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.zoom.us/v2/meetings/123456789/registrants");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer tok_test");
    const body = await requests[0].json() as Record<string, unknown>;
    expect(body.email).toBe("alice@example.com");
    expect(body.first_name).toBe("Alice");
    expect(body.last_name).toBe("Williams");
    expect(result.action).toBe("meetings.add_registrant");
    expect(result.registrant).toBeDefined();
    expect((result.registrant as Record<string, unknown>).join_url).toContain("zoom.us");
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(addMeetingRegistrant({
      accessToken: "tok_test",
      meetingId: "123456789",
      email: "alice@example.com",
      first_name: "Alice",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "15" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 15 });
  });
});

// ─── past_meetings.participants ───────────────────────────────────────────────

describe("listPastMeetingParticipants", () => {
  test("validates input and returns connector-owned output", () => {
    const result = listPastMeetingParticipants({ meetingUUID: "mUUID001==" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("past_meetings.participants");
    expect((result.validated as { meetingUUID: string }).meetingUUID).toBe("mUUID001==");
  });

  test("throws when meetingUUID is missing", () => {
    expect(() => validatePastMeetingParticipantsInput({})).toThrow("meetingUUID is required");
  });

  test("calls GET /v2/past_meetings/{uuid}/participants with Bearer token and preserves query params", async () => {
    const requests: Request[] = [];
    const result = await listPastMeetingParticipants({
      accessToken: "tok_test",
      meetingUUID: "mUUID001==",
      page_size: 25,
      next_page_token: "next-page-token",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(pastMeetingParticipantsFixture), { status: 200 });
      },
    });
    expect(requests).toHaveLength(1);
    const url = new URL(requests[0].url);
    expect(url.pathname).toBe("/v2/past_meetings/mUUID001%3D%3D/participants");
    expect(url.searchParams.get("page_size")).toBe("25");
    expect(url.searchParams.get("next_page_token")).toBe("next-page-token");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer tok_test");
    expect(result.action).toBe("past_meetings.participants");
    expect(Array.isArray(result.participants)).toBe(true);
    expect((result.participants as unknown[]).length).toBe(3);
  });

  test("double-encodes a UUID that begins with a slash", async () => {
    const requests: Request[] = [];
    await listPastMeetingParticipants({
      accessToken: "tok_test",
      meetingUUID: "/abc//def==",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(pastMeetingParticipantsFixture), { status: 200 });
      },
    });
    expect(requests).toHaveLength(1);
    expect(new URL(requests[0].url).pathname).toBe(
      "/v2/past_meetings/%252Fabc%252F%252Fdef%253D%253D/participants",
    );
  });

  test("double-encodes a UUID that contains an embedded double slash", async () => {
    const requests: Request[] = [];
    await listPastMeetingParticipants({
      accessToken: "tok_test",
      meetingUUID: "abc//def==",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(pastMeetingParticipantsFixture), { status: 200 });
      },
    });
    expect(requests).toHaveLength(1);
    expect(new URL(requests[0].url).pathname).toBe(
      "/v2/past_meetings/abc%252F%252Fdef%253D%253D/participants",
    );
  });

  test("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(listPastMeetingParticipants({
      accessToken: "tok_test",
      meetingUUID: "nonexistent",
      fetch: async () => new Response("{}", { status: 404 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(listPastMeetingParticipants({
      accessToken: "tok_test",
      meetingUUID: "mUUID001==",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "20" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 20 });
  });
});

// ─── webinars.create ──────────────────────────────────────────────────────────

describe("createWebinar", () => {
  test("validates input and returns connector-owned output", () => {
    const result = createWebinar({ topic: "Product Launch Webinar" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("webinars.create");
    expect((result.validated as { topic: string }).topic).toBe("Product Launch Webinar");
  });

  test("throws when topic is missing", () => {
    expect(() => validateWebinarsCreateInput({})).toThrow("topic is required");
  });

  test("calls POST /v2/users/me/webinars with Bearer token and body", async () => {
    const requests: Request[] = [];
    const result = await createWebinar({
      accessToken: "tok_test",
      topic: "Product Launch Webinar",
      type: 5,
      start_time: "2025-08-01T16:00:00Z",
      duration: 90,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(webinarCreateFixture), { status: 201 });
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.zoom.us/v2/users/me/webinars");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer tok_test");
    const body = await requests[0].json() as Record<string, unknown>;
    expect(body.topic).toBe("Product Launch Webinar");
    expect(body.type).toBe(5);
    expect(result.action).toBe("webinars.create");
    expect(result.webinar).toBeDefined();
  });

  test("uses custom userId when provided", async () => {
    const requests: Request[] = [];
    await createWebinar({
      accessToken: "tok_test",
      topic: "Webinar",
      userId: "user_001",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(webinarCreateFixture), { status: 201 });
      },
    });
    expect(requests[0].url).toBe("https://api.zoom.us/v2/users/user_001/webinars");
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(createWebinar({
      accessToken: "tok_test",
      topic: "Webinar",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "30" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 30 });
  });

  test("maps non-201 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(createWebinar({
      accessToken: "tok_test",
      topic: "Webinar",
      fetch: async () => new Response("{}", { status: 400 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

// ─── webinars.list ────────────────────────────────────────────────────────────

describe("listWebinars", () => {
  test("validates input and returns connector-owned output", () => {
    const result = listWebinars({ page_size: 10 });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("webinars.list");
    expect((result.validated as { page_size: number }).page_size).toBe(10);
  });

  test("calls GET /v2/users/me/webinars with Bearer token", async () => {
    const requests: Request[] = [];
    const result = await listWebinars({
      accessToken: "tok_test",
      page_size: 30,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(webinarsListFixture), { status: 200 });
      },
    });
    expect(requests).toHaveLength(1);
    const url = new URL(requests[0].url);
    expect(url.pathname).toBe("/v2/users/me/webinars");
    expect(url.searchParams.get("page_size")).toBe("30");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer tok_test");
    expect(result.action).toBe("webinars.list");
    expect(Array.isArray(result.webinars)).toBe(true);
    expect((result.webinars as unknown[]).length).toBe(2);
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(listWebinars({
      accessToken: "tok_test",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "40" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 40 });
  });
});
