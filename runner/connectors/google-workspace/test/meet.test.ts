import { describe, expect, test } from "bun:test";
import meetEventFixture from "../fixtures/meet_event_with_conference.json";
import meetSpaceFixture from "../fixtures/meet_space.json";
import conferenceRecordsFixture from "../fixtures/meet_conference_records.json";
import rateLimitedFixture from "../fixtures/rate_limited.json";
import {
  createMeetClient,
  validateCreateMeetEventInput,
  validateAddMeetToEventInput,
  validateCreateMeetSpaceInput,
  validateGetMeetSpaceInput,
  validateListConferenceRecordsInput,
  createMeetEvent,
  addMeetToEvent,
  createMeetSpace,
  getMeetSpace,
  listConferenceRecords,
} from "../src/meet";

// ─── meet.create ─────────────────────────────────────────────────────────────

describe("google-workspace Meet: meet.create", () => {
  test("validateCreateMeetEventInput accepts valid input", () => {
    const r = validateCreateMeetEventInput({
      calendarId: "primary",
      summary: "Standup",
      startDateTime: "2024-01-15T09:00:00Z",
      endDateTime: "2024-01-15T09:15:00Z",
    });
    expect(r.calendarId).toBe("primary");
    expect(r.summary).toBe("Standup");
  });

  test("validateCreateMeetEventInput accepts optional requestId", () => {
    const r = validateCreateMeetEventInput({
      calendarId: "primary",
      summary: "Standup",
      startDateTime: "2024-01-15T09:00:00Z",
      endDateTime: "2024-01-15T09:15:00Z",
      requestId: "my-uuid-123",
    });
    expect(r.requestId).toBe("my-uuid-123");
  });

  test("validateCreateMeetEventInput throws on missing required fields", () => {
    expect(() =>
      validateCreateMeetEventInput({ calendarId: "primary", summary: "x" }),
    ).toThrow();
    expect(() => validateCreateMeetEventInput("not-an-object")).toThrow();
  });

  test("createMeetEvent POSTs to Calendar API with conferenceDataVersion=1", async () => {
    const requests: Request[] = [];
    const client = createMeetClient({
      accessToken: "ya29.test",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(meetEventFixture);
      },
    });

    const result = await client.createMeetEvent({
      calendarId: "primary",
      summary: "Standup",
      startDateTime: "2024-01-15T09:00:00-07:00",
      endDateTime: "2024-01-15T09:15:00-07:00",
    });

    expect(requests).toHaveLength(1);
    const url = requests[0].url;
    expect(url).toContain("https://www.googleapis.com/calendar/v3/calendars/primary/events");
    expect(url).toContain("conferenceDataVersion=1");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer ya29.test");
  });

  test("createMeetEvent request body includes hangoutsMeet conferenceSolutionKey", async () => {
    let sentBody: Record<string, unknown> | null = null;
    const client = createMeetClient({
      accessToken: "ya29.test",
      fetch: async (input, init) => {
        const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
        sentBody = body;
        return Response.json(meetEventFixture);
      },
    });

    await client.createMeetEvent({
      calendarId: "primary",
      summary: "Standup",
      startDateTime: "2024-01-15T09:00:00Z",
      endDateTime: "2024-01-15T09:15:00Z",
    });

    expect(sentBody).not.toBeNull();
    const conf = (sentBody as Record<string, unknown>).conferenceData as Record<string, unknown>;
    expect(conf).toBeDefined();
    const createReq = conf.createRequest as Record<string, unknown>;
    expect(createReq).toBeDefined();
    expect((createReq.conferenceSolutionKey as Record<string, unknown>).type).toBe("hangoutsMeet");
    // requestId should be present (auto-generated)
    expect(typeof createReq.requestId).toBe("string");
    expect((createReq.requestId as string).length).toBeGreaterThan(0);
  });

  test("createMeetEvent uses provided requestId in body", async () => {
    let sentBody: Record<string, unknown> | null = null;
    const client = createMeetClient({
      accessToken: "ya29.test",
      fetch: async (input, init) => {
        sentBody = typeof init?.body === "string" ? JSON.parse(init.body) : {};
        return Response.json(meetEventFixture);
      },
    });

    await client.createMeetEvent({
      calendarId: "primary",
      summary: "Standup",
      startDateTime: "2024-01-15T09:00:00Z",
      endDateTime: "2024-01-15T09:15:00Z",
      requestId: "my-custom-req-id",
    });

    const createReq = ((sentBody as Record<string, unknown>).conferenceData as Record<string, unknown>).createRequest as Record<string, unknown>;
    expect(createReq.requestId).toBe("my-custom-req-id");
  });

  test("createMeetEvent parses hangoutLink from response", async () => {
    const client = createMeetClient({
      accessToken: "ya29.test",
      fetch: async () => Response.json(meetEventFixture),
    });

    const result = await client.createMeetEvent({
      calendarId: "primary",
      summary: "Standup",
      startDateTime: "2024-01-15T09:00:00-07:00",
      endDateTime: "2024-01-15T09:15:00-07:00",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.event.hangoutLink).toBe("https://meet.google.com/abc-defg-hij");
      expect(result.event.conferenceData).not.toBeNull();
      const cd = result.event.conferenceData as Record<string, unknown>;
      expect(Array.isArray(cd.entryPoints)).toBe(true);
    }
  });

  test("createMeetEvent maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    const client = createMeetClient({
      accessToken: "token",
      fetch: async () =>
        new Response(JSON.stringify(rateLimitedFixture), {
          status: 429,
          headers: { "Retry-After": "60" },
        }),
    });

    const result = await client.createMeetEvent({
      calendarId: "primary",
      summary: "Test",
      startDateTime: "2024-01-15T09:00:00Z",
      endDateTime: "2024-01-15T10:00:00Z",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("CONNECTOR_RATE_LIMITED");
      expect(result.error.retryAfterSeconds).toBe(60);
    }
  });

  test("createMeetEvent maps 5xx to CONNECTOR_UPSTREAM_ERROR", async () => {
    const client = createMeetClient({
      accessToken: "token",
      fetch: async () =>
        new Response(
          JSON.stringify({ error: { code: 500, message: "Internal error", status: 500 } }),
          { status: 500 },
        ),
    });

    const result = await client.createMeetEvent({
      calendarId: "primary",
      summary: "Test",
      startDateTime: "2024-01-15T09:00:00Z",
      endDateTime: "2024-01-15T10:00:00Z",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("CONNECTOR_UPSTREAM_ERROR");
    }
  });

  test("createMeetEvent dual-mode: returns validated when no accessToken", () => {
    const result = createMeetEvent({
      calendarId: "primary",
      summary: "Standup",
      startDateTime: "2024-01-15T09:00:00Z",
      endDateTime: "2024-01-15T09:15:00Z",
    });
    expect(result).toEqual(
      expect.objectContaining({
        connector: "google-workspace",
        action: "meet.create",
        source: "connector",
      }),
    );
    const r = result as Record<string, unknown>;
    expect(r.validated).toBeDefined();
  });

  test("createMeetEvent dual-mode: calls API when accessToken present", async () => {
    const result = await createMeetEvent({
      accessToken: "ya29.test",
      calendarId: "primary",
      summary: "Standup",
      startDateTime: "2024-01-15T09:00:00-07:00",
      endDateTime: "2024-01-15T09:15:00-07:00",
      fetch: async () => Response.json(meetEventFixture),
    });
    expect((result as Record<string, unknown>).connector).toBe("google-workspace");
    expect((result as Record<string, unknown>).action).toBe("meet.create");
    expect((result as Record<string, unknown>).hangoutLink).toBe("https://meet.google.com/abc-defg-hij");
  });
});

// ─── meet.add_to_event ───────────────────────────────────────────────────────

describe("google-workspace Meet: meet.add_to_event", () => {
  test("validateAddMeetToEventInput accepts valid input", () => {
    const r = validateAddMeetToEventInput({ calendarId: "primary", eventId: "evt123" });
    expect(r.calendarId).toBe("primary");
    expect(r.eventId).toBe("evt123");
  });

  test("validateAddMeetToEventInput throws on missing calendarId", () => {
    expect(() => validateAddMeetToEventInput({ eventId: "evt123" })).toThrow();
  });

  test("validateAddMeetToEventInput throws on missing eventId", () => {
    expect(() => validateAddMeetToEventInput({ calendarId: "primary" })).toThrow();
  });

  test("addMeetToEvent sends PATCH with conferenceDataVersion=1", async () => {
    const requests: Request[] = [];
    const client = createMeetClient({
      accessToken: "ya29.test",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(meetEventFixture);
      },
    });

    const result = await client.addMeetToEvent({ calendarId: "primary", eventId: "evt123" });

    expect(requests).toHaveLength(1);
    const url = requests[0].url;
    expect(url).toContain("https://www.googleapis.com/calendar/v3/calendars/primary/events/evt123");
    expect(url).toContain("conferenceDataVersion=1");
    expect(requests[0].method).toBe("PATCH");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer ya29.test");
    expect(result.ok).toBe(true);
  });

  test("addMeetToEvent request body contains hangoutsMeet type", async () => {
    let sentBody: Record<string, unknown> | null = null;
    const client = createMeetClient({
      accessToken: "ya29.test",
      fetch: async (input, init) => {
        sentBody = typeof init?.body === "string" ? JSON.parse(init.body) : {};
        return Response.json(meetEventFixture);
      },
    });

    await client.addMeetToEvent({ calendarId: "primary", eventId: "evt123" });

    const conf = (sentBody as Record<string, unknown>).conferenceData as Record<string, unknown>;
    const createReq = conf.createRequest as Record<string, unknown>;
    expect((createReq.conferenceSolutionKey as Record<string, unknown>).type).toBe("hangoutsMeet");
    expect(typeof createReq.requestId).toBe("string");
  });

  test("addMeetToEvent maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    const client = createMeetClient({
      accessToken: "token",
      fetch: async () =>
        new Response(JSON.stringify(rateLimitedFixture), {
          status: 429,
          headers: { "Retry-After": "30" },
        }),
    });

    const result = await client.addMeetToEvent({ calendarId: "primary", eventId: "evt123" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("CONNECTOR_RATE_LIMITED");
      expect(result.error.retryAfterSeconds).toBe(30);
    }
  });

  test("addMeetToEvent maps 5xx to CONNECTOR_UPSTREAM_ERROR", async () => {
    const client = createMeetClient({
      accessToken: "token",
      fetch: async () =>
        new Response(
          JSON.stringify({ error: { code: 503, message: "Service unavailable", status: 503 } }),
          { status: 503 },
        ),
    });

    const result = await client.addMeetToEvent({ calendarId: "primary", eventId: "evt123" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONNECTOR_UPSTREAM_ERROR");
  });

  test("addMeetToEvent dual-mode: returns validated when no accessToken", () => {
    const result = addMeetToEvent({ calendarId: "primary", eventId: "evt123" });
    const r = result as Record<string, unknown>;
    expect(r.action).toBe("meet.add_to_event");
    expect(r.validated).toBeDefined();
  });
});

// ─── meet.spaces.create ──────────────────────────────────────────────────────

describe("google-workspace Meet: meet.spaces.create", () => {
  test("validateCreateMeetSpaceInput accepts empty input", () => {
    const r = validateCreateMeetSpaceInput({});
    expect(r.config).toBeUndefined();
  });

  test("validateCreateMeetSpaceInput accepts config object", () => {
    const r = validateCreateMeetSpaceInput({ config: { accessType: "OPEN" } });
    expect(r.config).toEqual({ accessType: "OPEN" });
  });

  test("createSpace POSTs to meet.googleapis.com/v2/spaces", async () => {
    const requests: Request[] = [];
    const client = createMeetClient({
      accessToken: "ya29.test",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(meetSpaceFixture);
      },
    });

    const result = await client.createSpace({});

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://meet.googleapis.com/v2/spaces");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer ya29.test");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.space.name).toBe("spaces/abc123xyz");
      expect(result.space.meetingUri).toBe("https://meet.google.com/abc-defg-hij");
      expect(result.space.meetingCode).toBe("abc-defg-hij");
    }
  });

  test("createSpace maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    const client = createMeetClient({
      accessToken: "token",
      fetch: async () =>
        new Response(JSON.stringify(rateLimitedFixture), {
          status: 429,
          headers: { "Retry-After": "45" },
        }),
    });

    const result = await client.createSpace({});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("CONNECTOR_RATE_LIMITED");
      expect(result.error.retryAfterSeconds).toBe(45);
    }
  });

  test("createSpace maps 5xx to CONNECTOR_UPSTREAM_ERROR", async () => {
    const client = createMeetClient({
      accessToken: "token",
      fetch: async () =>
        new Response(
          JSON.stringify({ error: { code: 500, message: "Server error", status: 500 } }),
          { status: 500 },
        ),
    });

    const result = await client.createSpace({});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONNECTOR_UPSTREAM_ERROR");
  });

  test("createSpace treats empty error responses as failures", async () => {
    for (const status of [401, 403, 500, 503]) {
      const client = createMeetClient({
        accessToken: "token",
        fetch: async () => new Response("", { status }),
      });
      const result = await client.createSpace({});
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("CONNECTOR_UPSTREAM_ERROR");
    }
  });

  test("createSpace rejects an incomplete successful response", async () => {
    const client = createMeetClient({
      accessToken: "token",
      fetch: async () => Response.json({}),
    });
    const result = await client.createSpace({});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONNECTOR_UPSTREAM_ERROR");
  });

  test("createSpace dual-mode: returns validated when no accessToken", () => {
    const result = createMeetSpace({});
    const r = result as Record<string, unknown>;
    expect(r.action).toBe("meet.spaces.create");
    expect(r.validated).toBeDefined();
  });

  test("createSpace dual-mode: calls API when accessToken present", async () => {
    const result = await createMeetSpace({
      accessToken: "ya29.test",
      fetch: async () => Response.json(meetSpaceFixture),
    });
    expect((result as Record<string, unknown>).connector).toBe("google-workspace");
    expect((result as Record<string, unknown>).meetingUri).toBe("https://meet.google.com/abc-defg-hij");
  });
});

// ─── meet.spaces.get ─────────────────────────────────────────────────────────

describe("google-workspace Meet: meet.spaces.get", () => {
  const malformedSpaceNames = [
    "",
    "spaces/",
    "spaces/abc/def",
    "meetings/abc",
    "spaces/../abc",
    "../abc",
    "spaces/abc%2Fdef",
    "spaces/abc\n",
    `spaces/${"a".repeat(129)}`,
  ];

  test("validateGetMeetSpaceInput accepts name", () => {
    const r = validateGetMeetSpaceInput({ name: "spaces/abc123xyz" });
    expect(r.name).toBe("spaces/abc123xyz");
  });

  test("validateGetMeetSpaceInput accepts server-generated leading-hyphen IDs", () => {
    const r = validateGetMeetSpaceInput({ name: "spaces/-yy3uKlef_QB" });
    expect(r.name).toBe("spaces/-yy3uKlef_QB");
  });

  test("validateGetMeetSpaceInput throws when name is missing", () => {
    expect(() => validateGetMeetSpaceInput({})).toThrow();
    expect(() => validateGetMeetSpaceInput({ name: "" })).toThrow();
  });

  test("validateGetMeetSpaceInput rejects malformed space names", () => {
    for (const name of malformedSpaceNames) {
      expect(() => validateGetMeetSpaceInput({ name })).toThrow();
    }
  });

  test("getSpace GETs from meet.googleapis.com/v2/spaces/{name}", async () => {
    const requests: Request[] = [];
    const client = createMeetClient({
      accessToken: "ya29.test",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(meetSpaceFixture);
      },
    });

    const result = await client.getSpace({ name: "spaces/abc123xyz" });

    expect(requests).toHaveLength(1);
    // URL should encode the resource name properly
    expect(requests[0].url).toContain("meet.googleapis.com/v2/");
    expect(requests[0].method).toBe("GET");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer ya29.test");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.space.name).toBe("spaces/abc123xyz");
    }
  });

  test("getSpace preserves the resource slash for bare and full names", async () => {
    const requests: Request[] = [];
    const client = createMeetClient({
      accessToken: "ya29.test",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(meetSpaceFixture);
      },
    });

    await client.getSpace({ name: "abc123xyz" });
    await client.getSpace({ name: "spaces/abc123xyz" });

    expect(requests.map((request) => request.url)).toEqual([
      "https://meet.googleapis.com/v2/spaces/abc123xyz",
      "https://meet.googleapis.com/v2/spaces/abc123xyz",
    ]);
  });

  test("getSpace rejects malformed names without dispatching a request", async () => {
    const requests: Request[] = [];
    const client = createMeetClient({
      accessToken: "ya29.test",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(meetSpaceFixture);
      },
    });

    for (const name of malformedSpaceNames) {
      await expect(client.getSpace({ name })).rejects.toThrow();
    }

    expect(requests).toHaveLength(0);
  });

  test("getSpace rejects a trailing newline without dispatching a request", async () => {
    const requests: Request[] = [];
    const client = createMeetClient({
      accessToken: "ya29.test",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(meetSpaceFixture);
      },
    });

    await expect(client.getSpace({ name: "spaces/abc\n" })).rejects.toThrow();
    expect(requests).toHaveLength(0);
  });

  test("getSpace dual-mode: returns validated when no accessToken", () => {
    const result = getMeetSpace({ name: "spaces/abc123xyz" });
    const r = result as Record<string, unknown>;
    expect(r.action).toBe("meet.spaces.get");
    expect(r.validated).toBeDefined();
  });
});

// ─── meet.conference_records.list ────────────────────────────────────────────

describe("google-workspace Meet: meet.conference_records.list", () => {
  test("validateListConferenceRecordsInput accepts empty input", () => {
    const r = validateListConferenceRecordsInput({});
    expect(r.pageSize).toBeUndefined();
    expect(r.pageToken).toBeUndefined();
    expect(r.filter).toBeUndefined();
  });

  test("validateListConferenceRecordsInput accepts all options", () => {
    const r = validateListConferenceRecordsInput({
      pageSize: 10,
      pageToken: "tok123",
      filter: 'space.name="spaces/abc"',
    });
    expect(r.pageSize).toBe(10);
    expect(r.pageToken).toBe("tok123");
    expect(r.filter).toBe('space.name="spaces/abc"');
  });

  test("listConferenceRecords GETs meet.googleapis.com/v2/conferenceRecords", async () => {
    const requests: Request[] = [];
    const client = createMeetClient({
      accessToken: "ya29.test",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(conferenceRecordsFixture);
      },
    });

    const result = await client.listConferenceRecords({});

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toContain("https://meet.googleapis.com/v2/conferenceRecords");
    expect(requests[0].method).toBe("GET");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer ya29.test");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.conferenceRecords).toHaveLength(2);
      expect(result.nextPageToken).toBe("token_page2_abc");
    }
  });

  test("uses conference-record listing and event creation response budgets independently", async () => {
    const responseWithinListBudget = JSON.stringify({
      id: "event-1",
      start: { dateTime: "2024-01-15T09:00:00Z" },
      end: { dateTime: "2024-01-15T09:15:00Z" },
      conferenceRecords: [],
    }) + " ".repeat(1_048_576);
    const client = createMeetClient({
      accessToken: "ya29.test",
      fetch: async () => new Response(responseWithinListBudget),
    });

    await expect(client.listConferenceRecords({})).resolves.toMatchObject({
      ok: true,
    });
    await expect(client.createMeetEvent({
      calendarId: "primary",
      summary: "Standup",
      startDateTime: "2024-01-15T09:00:00Z",
      endDateTime: "2024-01-15T09:15:00Z",
    })).rejects.toMatchObject({
      name: "ConnectorHttpError",
      code: "OUTBOUND_RESPONSE_TOO_LARGE",
    });
  });

  test("listConferenceRecords appends query params", async () => {
    const requests: Request[] = [];
    const client = createMeetClient({
      accessToken: "ya29.test",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json({ conferenceRecords: [] });
      },
    });

    await client.listConferenceRecords({
      pageSize: 5,
      pageToken: "nextTok",
      filter: 'space.name="spaces/abc"',
    });

    const url = new URL(requests[0].url);
    expect(url.searchParams.get("pageSize")).toBe("5");
    expect(url.searchParams.get("pageToken")).toBe("nextTok");
    expect(url.searchParams.get("filter")).toBe('space.name="spaces/abc"');
  });

  test("listConferenceRecords maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    const client = createMeetClient({
      accessToken: "token",
      fetch: async () =>
        new Response(JSON.stringify(rateLimitedFixture), {
          status: 429,
          headers: { "Retry-After": "20" },
        }),
    });

    const result = await client.listConferenceRecords({});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("CONNECTOR_RATE_LIMITED");
      expect(result.error.retryAfterSeconds).toBe(20);
    }
  });

  test("listConferenceRecords maps 5xx to CONNECTOR_UPSTREAM_ERROR", async () => {
    const client = createMeetClient({
      accessToken: "token",
      fetch: async () =>
        new Response(
          JSON.stringify({ error: { code: 502, message: "Bad gateway", status: 502 } }),
          { status: 502 },
        ),
    });

    const result = await client.listConferenceRecords({});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONNECTOR_UPSTREAM_ERROR");
  });

  test("listConferenceRecords keeps an empty 204 success as an empty page", async () => {
    const client = createMeetClient({
      accessToken: "token",
      fetch: async () => new Response("", { status: 204 }),
    });
    await expect(client.listConferenceRecords({})).resolves.toEqual({
      ok: true,
      conferenceRecords: [],
      nextPageToken: null,
    });
  });

  test("listConferenceRecords dual-mode: returns validated when no accessToken", () => {
    const result = listConferenceRecords({});
    const r = result as Record<string, unknown>;
    expect(r.action).toBe("meet.conference_records.list");
    expect(r.validated).toBeDefined();
  });

  test("listConferenceRecords dual-mode: calls API when accessToken present", async () => {
    const result = await listConferenceRecords({
      accessToken: "ya29.test",
      fetch: async () => Response.json(conferenceRecordsFixture),
    });
    expect((result as Record<string, unknown>).conferenceRecords).toHaveLength(2);
  });
});
