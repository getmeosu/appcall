import { describe, expect, test } from "bun:test";
import {
  discoverPrincipal,
  getCalendarHome,
  listCalendars,
  listEvents,
  getEvent,
  createEvent,
  updateEvent,
  deleteEvent,
  queryFreeBusy,
  validatePrincipalDiscoverInput,
  validateCalendarHomeGetInput,
  validateCalendarsListInput,
  validateEventsListInput,
  validateEventsGetInput,
  validateEventsCreateInput,
  validateEventsUpdateInput,
  validateEventsDeleteInput,
  validateFreeBusyQueryInput,
} from "../src/actions";
import { buildVEvent } from "../src/dav";

const principalXml = await Bun.file(`${import.meta.dir}/../fixtures/principal.xml`).text();
const calendarHomeXml = await Bun.file(`${import.meta.dir}/../fixtures/calendar_home.xml`).text();
const calendarsXml = await Bun.file(`${import.meta.dir}/../fixtures/calendars.xml`).text();
const eventsReportXml = await Bun.file(`${import.meta.dir}/../fixtures/events_report.xml`).text();
const eventIcs = await Bun.file(`${import.meta.dir}/../fixtures/event.ics`).text();

const CREDS = { username: "test@icloud.com", password: "app-password" };

// ─── principal.discover ────────────────────────────────────────────────────────

describe("discoverPrincipal", () => {
  test("validatePrincipalDiscoverInput parses valid input", () => {
    const validated = validatePrincipalDiscoverInput({ username: "user@test.com", password: "pass" });
    expect(validated.username).toBe("user@test.com");
    expect(validated.password).toBe("pass");
    expect(validated.baseUrl).toBeUndefined();
  });

  test("throws when username missing", () => {
    expect(() => validatePrincipalDiscoverInput({ password: "pass" })).toThrow("username is required");
  });

  test("throws when password missing", () => {
    expect(() => validatePrincipalDiscoverInput({ username: "user@test.com" })).toThrow("password is required");
  });

  test("sends PROPFIND / with correct headers", async () => {
    const requests: Request[] = [];
    const result = await discoverPrincipal({
      ...CREDS,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(principalXml, { status: 207 });
      },
    }) as Record<string, unknown>;
    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe("PROPFIND");
    expect(new URL(requests[0].url).pathname).toBe("/");
    expect(requests[0].headers.get("Depth")).toBe("0");
    expect(requests[0].headers.get("Content-Type")).toContain("application/xml");
    const auth = requests[0].headers.get("Authorization");
    expect(auth?.startsWith("Basic ")).toBe(true);
    expect(result.connector).toBe("caldav");
    expect(result.principalHref).toBe("/principals/testuser@icloud.com/");
  });

  test("maps 401 to CONNECTOR_UPSTREAM_ERROR with auth message", async () => {
    await expect(discoverPrincipal({
      ...CREDS,
      fetch: async () => new Response("Unauthorized", { status: 401 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message: expect.stringContaining("authentication failed") });
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(discoverPrincipal({
      ...CREDS,
      fetch: async () => new Response("", { status: 429, headers: { "retry-after": "30" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 30 });
  });

  test("maps 500 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(discoverPrincipal({
      ...CREDS,
      fetch: async () => new Response("Server Error", { status: 500 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

// ─── calendar_home.get ─────────────────────────────────────────────────────────

describe("getCalendarHome", () => {
  test("validateCalendarHomeGetInput parses valid input", () => {
    const validated = validateCalendarHomeGetInput({ username: "u", password: "p", principalHref: "/principals/u/" });
    expect(validated.username).toBe("u");
    expect(validated.principalHref).toBe("/principals/u/");
  });

  test("throws when principalHref missing", () => {
    expect(() => validateCalendarHomeGetInput({ username: "u", password: "p" })).toThrow("principalHref is required");
  });

  test("sends PROPFIND to principalHref and extracts calendarHomeHref", async () => {
    const requests: Request[] = [];
    const result = await getCalendarHome({
      ...CREDS,
      principalHref: "/principals/testuser@icloud.com/",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(calendarHomeXml, { status: 207 });
      },
    }) as Record<string, unknown>;
    expect(requests[0].method).toBe("PROPFIND");
    expect(new URL(requests[0].url).pathname).toBe("/principals/testuser@icloud.com/");
    expect(result.calendarHomeHref).toBe("/1234567890/calendars/");
  });

  test("maps 401 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(getCalendarHome({
      ...CREDS,
      principalHref: "/principals/u/",
      fetch: async () => new Response("", { status: 401 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(getCalendarHome({
      ...CREDS,
      principalHref: "/principals/u/",
      fetch: async () => new Response("", { status: 429, headers: { "retry-after": "15" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 15 });
  });
});

// ─── calendars.list ────────────────────────────────────────────────────────────

describe("listCalendars", () => {
  test("validateCalendarsListInput parses valid input", () => {
    const validated = validateCalendarsListInput({ username: "u", password: "p", calendarHomeHref: "/1234/calendars/" });
    expect(validated.username).toBe("u");
    expect(validated.calendarHomeHref).toBe("/1234/calendars/");
  });

  test("throws when calendarHomeHref missing", () => {
    expect(() => validateCalendarsListInput({ username: "u", password: "p" })).toThrow("calendarHomeHref is required");
  });

  test("sends PROPFIND Depth:1 and returns calendars", async () => {
    const requests: Request[] = [];
    const result = await listCalendars({
      ...CREDS,
      calendarHomeHref: "/1234567890/calendars/",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(calendarsXml, { status: 207 });
      },
    }) as Record<string, unknown>;
    expect(requests[0].method).toBe("PROPFIND");
    expect(requests[0].headers.get("Depth")).toBe("1");
    const calendars = result.calendars as unknown[];
    expect(Array.isArray(calendars)).toBe(true);
    expect(calendars.length).toBe(2);
    const home = (calendars as Array<Record<string, unknown>>).find((c) => c.href === "/1234567890/calendars/home/");
    expect(home?.displayName).toBe("Home");
    expect(home?.color).toBe("#FF2D55");
  });

  test("maps 401 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(listCalendars({
      ...CREDS,
      calendarHomeHref: "/1234/calendars/",
      fetch: async () => new Response("", { status: 401 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(listCalendars({
      ...CREDS,
      calendarHomeHref: "/1234/calendars/",
      fetch: async () => new Response("", { status: 429, headers: { "retry-after": "5" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 5 });
  });
});

// ─── events.list ──────────────────────────────────────────────────────────────

describe("listEvents", () => {
  test("validateEventsListInput parses valid input", () => {
    const validated = validateEventsListInput({ username: "u", password: "p", calendarHref: "/1234/calendars/home/" });
    expect(validated.username).toBe("u");
    expect(validated.calendarHref).toBe("/1234/calendars/home/");
  });

  test("throws when calendarHref missing", () => {
    expect(() => validateEventsListInput({ username: "u", password: "p" })).toThrow("calendarHref is required");
  });

  test("sends REPORT Depth:1 and returns events", async () => {
    const requests: Request[] = [];
    const result = await listEvents({
      ...CREDS,
      calendarHref: "/1234567890/calendars/home/",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(eventsReportXml, { status: 207 });
      },
    }) as Record<string, unknown>;
    expect(requests[0].method).toBe("REPORT");
    expect(requests[0].headers.get("Depth")).toBe("1");
    const events = result.events as unknown[];
    expect(Array.isArray(events)).toBe(true);
    expect(events.length).toBe(2);
    const ev = (events as Array<Record<string, unknown>>)[0];
    expect(ev.uid).toBe("meeting-uid-001");
    expect(ev.summary).toBe("Team Meeting");
    expect(ev.etag).toBe('"etag-abc123"');
  });

  test("decodes XML-escaped list ETag while preserving its quotes", async () => {
    const escapedEventsReportXml = eventsReportXml.replace('>"etag-abc123"<', '>&quot;etag-abc123&quot;<');
    const result = await listEvents({
      ...CREDS,
      calendarHref: "/1234567890/calendars/home/",
      fetch: async () => new Response(escapedEventsReportXml, { status: 207 }),
    }) as Record<string, unknown>;
    const events = result.events as Array<Record<string, unknown>>;
    expect(events[0]?.etag).toBe('"etag-abc123"');
  });

  test("sends time-range in REPORT body when start/end provided", async () => {
    let requestBody = "";
    await listEvents({
      ...CREDS,
      calendarHref: "/1234567890/calendars/home/",
      start: "2024-06-01T00:00:00Z",
      end: "2024-06-30T23:59:59Z",
      fetch: async (input, init) => {
        requestBody = await new Request(input, init).text();
        return new Response(eventsReportXml, { status: 207 });
      },
    });
    expect(requestBody).toContain("time-range");
    expect(requestBody).toContain("20240601T000000Z");
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(listEvents({
      ...CREDS,
      calendarHref: "/1234/calendars/home/",
      fetch: async () => new Response("", { status: 429, headers: { "retry-after": "20" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED" });
  });

  test("maps 401 to CONNECTOR_UPSTREAM_ERROR with auth message", async () => {
    await expect(listEvents({
      ...CREDS,
      calendarHref: "/1234/calendars/home/",
      fetch: async () => new Response("", { status: 401 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message: expect.stringContaining("authentication failed") });
  });
});

describe("ETag action round trips", () => {
  test("passes each produced ETag unchanged into one update and one delete", async () => {
    const scenarios = [
      {
        name: "get",
        expected: 'W/"get-etag-001"',
        read: async () => getEvent({
          ...CREDS,
          eventHref: "/1234567890/calendars/home/get-001.ics",
          fetch: async () => new Response(eventIcs, { status: 200, headers: { etag: 'W/"get-etag-001"' } }),
        }) as Promise<Record<string, unknown>>,
        etagFrom: (output: Record<string, unknown>) => output.etag as string,
      },
      {
        name: "list",
        expected: '"list-etag-001"',
        read: async () => listEvents({
          ...CREDS,
          calendarHref: "/1234567890/calendars/home/",
          fetch: async () => new Response(eventsReportXml.replace('>"etag-abc123"<', '>&quot;list-etag-001&quot;<'), { status: 207 }),
        }) as Promise<Record<string, unknown>>,
        etagFrom: (output: Record<string, unknown>) => ((output.events as Array<Record<string, unknown>>)[0]?.etag) as string,
      },
      {
        name: "create",
        expected: 'W/"create-etag-001"',
        read: async () => createEvent({
          ...CREDS,
          calendarHref: "/1234567890/calendars/home/",
          summary: "Created Event",
          start: "2024-06-15T10:00:00Z",
          end: "2024-06-15T11:00:00Z",
          uid: "create-001",
          fetch: async () => new Response("", { status: 201, headers: { etag: 'W/"create-etag-001"' } }),
        }) as Promise<Record<string, unknown>>,
        etagFrom: (output: Record<string, unknown>) => output.etag as string,
      },
    ];

    for (const scenario of scenarios) {
      const produced = await scenario.read();
      const etag = scenario.etagFrom(produced);
      expect(etag).toBe(scenario.expected);

      const updateRequests: Request[] = [];
      await updateEvent({
        ...CREDS,
        eventHref: `/1234567890/calendars/home/${scenario.name}-001.ics`,
        etag,
        uid: `${scenario.name}-001`,
        summary: "Updated Event",
        start: "2024-06-15T12:00:00Z",
        end: "2024-06-15T13:00:00Z",
        fetch: async (input, init) => {
          updateRequests.push(new Request(input, init));
          if ((init?.method ?? "GET") === "GET") {
            return new Response(buildVEvent({
              uid: `${scenario.name}-001`,
              summary: "Existing Event",
              start: "2024-06-15T10:00:00Z",
              end: "2024-06-15T11:00:00Z",
            }), { status: 200, headers: { etag } });
          }
          return new Response("", { status: 204 });
        },
      });
      expect(updateRequests).toHaveLength(2);
      expect(updateRequests[0].method).toBe("GET");
      expect(updateRequests[1].method).toBe("PUT");
      expect(updateRequests[1].headers.get("If-Match")).toBe(etag);

      const deleteRequests: Request[] = [];
      await deleteEvent({
        ...CREDS,
        eventHref: `/1234567890/calendars/home/${scenario.name}-001.ics`,
        etag,
        fetch: async (input, init) => {
          deleteRequests.push(new Request(input, init));
          return new Response("", { status: 204 });
        },
      });
      expect(deleteRequests).toHaveLength(1);
      expect(deleteRequests[0].headers.get("If-Match")).toBe(etag);
    }
  });
});

// ─── events.get ───────────────────────────────────────────────────────────────

describe("getEvent", () => {
  test("validateEventsGetInput parses valid input", () => {
    const validated = validateEventsGetInput({ username: "u", password: "p", eventHref: "/1234/calendars/home/ev.ics" });
    expect(validated.username).toBe("u");
    expect(validated.eventHref).toBe("/1234/calendars/home/ev.ics");
  });

  test("throws when eventHref missing", () => {
    expect(() => validateEventsGetInput({ username: "u", password: "p" })).toThrow("eventHref is required");
  });

  test("sends GET and returns parsed VEVENT", async () => {
    const requests: Request[] = [];
    const result = await getEvent({
      ...CREDS,
      eventHref: "/1234567890/calendars/home/meeting-uid-001.ics",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(eventIcs, { status: 200, headers: { "etag": '"etag-abc123"' } });
      },
    }) as Record<string, unknown>;
    expect(requests[0].method).toBe("GET");
    expect(result.uid).toBe("meeting-uid-001");
    expect(result.summary).toBe("Team Meeting");
    expect(result.etag).toBe('"etag-abc123"');
    expect(result.calendarData).toContain("BEGIN:VCALENDAR");
  });

  test("preserves weak ETag marker and quotes from GET", async () => {
    const result = await getEvent({
      ...CREDS,
      eventHref: "/1234567890/calendars/home/meeting-uid-001.ics",
      fetch: async () => new Response(eventIcs, { status: 200, headers: { "etag": 'W/"weak-etag-001"' } }),
    }) as Record<string, unknown>;
    expect(result.etag).toBe('W/"weak-etag-001"');
  });

  test("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(getEvent({
      ...CREDS,
      eventHref: "/1234/calendars/home/notfound.ics",
      fetch: async () => new Response("Not Found", { status: 404 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message: expect.stringContaining("not found") });
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(getEvent({
      ...CREDS,
      eventHref: "/1234/calendars/home/ev.ics",
      fetch: async () => new Response("", { status: 429, headers: { "retry-after": "10" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 10 });
  });
});

// ─── events.create ────────────────────────────────────────────────────────────

describe("createEvent", () => {
  test("validateEventsCreateInput parses valid input", () => {
    const validated = validateEventsCreateInput({
      username: "u", password: "p",
      calendarHref: "/1234/calendars/home/",
      summary: "Test", start: "2024-06-15T10:00:00Z", end: "2024-06-15T11:00:00Z",
    });
    expect(validated.username).toBe("u");
    expect(validated.calendarHref).toBe("/1234/calendars/home/");
    expect(validated.summary).toBe("Test");
  });

  test("throws when required fields missing", () => {
    expect(() => validateEventsCreateInput({ username: "u", password: "p" })).toThrow("calendarHref is required");
    expect(() => validateEventsCreateInput({ username: "u", password: "p", calendarHref: "/c/" })).toThrow("summary is required");
    expect(() => validateEventsCreateInput({ username: "u", password: "p", calendarHref: "/c/", summary: "S" })).toThrow("start is required");
  });

  test("sends PUT with If-None-Match:* and text/calendar content", async () => {
    const requests: Request[] = [];
    const result = await createEvent({
      ...CREDS,
      calendarHref: "/1234567890/calendars/home/",
      summary: "New Meeting",
      start: "2024-06-15T10:00:00Z",
      end: "2024-06-15T11:00:00Z",
      description: "Details here",
      uid: "explicit-uid-001",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response("", { status: 201, headers: { "etag": '"new-etag-001"' } });
      },
    }) as Record<string, unknown>;
    expect(requests[0].method).toBe("PUT");
    expect(requests[0].headers.get("If-None-Match")).toBe("*");
    expect(requests[0].headers.get("Content-Type")).toContain("text/calendar");
    const body = await requests[0].text();
    expect(body).toContain("BEGIN:VCALENDAR");
    expect(body).toContain("UID:explicit-uid-001");
    expect(body).toContain("SUMMARY:New Meeting");
    expect(result.href).toContain("explicit-uid-001.ics");
    expect(result.uid).toBe("explicit-uid-001");
    expect(result.etag).toBe('"new-etag-001"');
  });

  test("generates uid when not provided", async () => {
    const result = await createEvent({
      ...CREDS,
      calendarHref: "/1234567890/calendars/home/",
      summary: "Auto UID",
      start: "2024-06-15T10:00:00Z",
      end: "2024-06-15T11:00:00Z",
      fetch: async () => new Response("", { status: 201 }),
    }) as Record<string, unknown>;
    expect(typeof result.uid).toBe("string");
    expect((result.uid as string).length).toBeGreaterThan(0);
  });

  test("rejects invalid attendee addresses before any network call", async () => {
    const requests: Request[] = [];
    await expect(createEvent({
      ...CREDS,
      calendarHref: "/1234/calendars/home/",
      summary: "S", start: "2024-06-15T10:00:00Z", end: "2024-06-15T11:00:00Z",
      attendees: ["attendee@example.com\r\nATTENDEE:mailto:injected@example.com"],
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response("", { status: 201 });
      },
    })).rejects.toThrow(/address|line break|control character/i);
    expect(requests).toHaveLength(0);
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(createEvent({
      ...CREDS,
      calendarHref: "/1234/calendars/home/",
      summary: "S", start: "2024-06-15T10:00:00Z", end: "2024-06-15T11:00:00Z",
      fetch: async () => new Response("", { status: 429, headers: { "retry-after": "60" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED" });
  });

  test("maps 401 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(createEvent({
      ...CREDS,
      calendarHref: "/1234/calendars/home/",
      summary: "S", start: "2024-06-15T10:00:00Z", end: "2024-06-15T11:00:00Z",
      fetch: async () => new Response("", { status: 401 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

// ─── events.update ────────────────────────────────────────────────────────────

describe("updateEvent", () => {
  test("validateEventsUpdateInput parses valid input", () => {
    const validated = validateEventsUpdateInput({
      username: "u", password: "p",
      eventHref: "/1234/calendars/home/ev.ics",
      etag: "oldetag", uid: "uid-001",
      summary: "Updated", start: "2024-06-15T10:00:00Z", end: "2024-06-15T11:00:00Z",
    });
    expect(validated.username).toBe("u");
    expect(validated.eventHref).toBe("/1234/calendars/home/ev.ics");
    expect(validated.etag).toBe("oldetag");
  });

  test("throws when etag missing", () => {
    expect(() => validateEventsUpdateInput({
      username: "u", password: "p",
      eventHref: "/e.ics", uid: "u", summary: "S",
      start: "2024-06-15T10:00:00Z", end: "2024-06-15T11:00:00Z",
    })).toThrow("etag is required");
  });

  test("sends PUT with If-Match header", async () => {
    const requests: Request[] = [];
    const result = await updateEvent({
      ...CREDS,
      eventHref: "/1234567890/calendars/home/uid-001.ics",
      etag: '"current-etag"',
      uid: "uid-001",
      summary: "Updated Meeting",
      start: "2024-06-15T14:00:00Z",
      end: "2024-06-15T15:00:00Z",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        if ((init?.method ?? "GET") === "GET") {
          return new Response(eventIcs.replace("meeting-uid-001", "uid-001"), { status: 200, headers: { etag: '"current-etag"' } });
        }
        return new Response("", { status: 204, headers: { "etag": '"updated-etag-001"' } });
      },
    }) as Record<string, unknown>;
    expect(requests).toHaveLength(2);
    expect(requests[0].method).toBe("GET");
    expect(requests[1].method).toBe("PUT");
    expect(requests[1].headers.get("If-Match")).toBe('"current-etag"');
    expect(result.href).toContain("uid-001.ics");
    expect(result.etag).toBe('"updated-etag-001"');
  });

  test("preserves quoted URI parameter prefixes in the update PUT body", async () => {
    const current = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      "UID:quoted-action-001",
      "DTSTART:20240615T100000Z",
      "DTEND:20240615T110000Z",
      'SUMMARY;ALTREP="cid:part@example.org":Old summary',
      'DESCRIPTION;ALTREP="cid:description@example.org":Old description',
      'LOCATION;ALTREP="cid:location@example.org":Old location',
      "END:VEVENT",
      "END:VCALENDAR",
      "",
    ].join("\r\n");
    const requests: Request[] = [];

    await updateEvent({
      ...CREDS,
      eventHref: "/1234567890/calendars/home/quoted-action-001.ics",
      etag: '"current-etag"',
      uid: "quoted-action-001",
      summary: "New summary",
      start: "2024-06-15T10:00:00Z",
      end: "2024-06-15T11:00:00Z",
      description: "New description",
      location: "New location",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        if ((init?.method ?? "GET") === "GET") {
          return new Response(current, { status: 200, headers: { etag: '"current-etag"' } });
        }
        return new Response("", { status: 204, headers: { etag: '"updated-etag"' } });
      },
    });

    const putBody = await requests[1]?.text();
    expect(putBody).toContain('SUMMARY;ALTREP="cid:part@example.org":New summary');
    expect(putBody).toContain('DESCRIPTION;ALTREP="cid:description@example.org":New description');
    expect(putBody).toContain('LOCATION;ALTREP="cid:location@example.org":New location');
  });

  test("rejects malformed quoted parameters before sending a PUT", async () => {
    const current = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      "UID:malformed-action-001",
      "DTSTART:20240615T100000Z",
      "DTEND:20240615T110000Z",
      'SUMMARY;ALTREP="cid:part@example.org:Old summary',
      "END:VEVENT",
      "END:VCALENDAR",
      "",
    ].join("\r\n");
    const requests: Request[] = [];

    await expect(updateEvent({
      ...CREDS,
      eventHref: "/1234567890/calendars/home/malformed-action-001.ics",
      etag: '"current-etag"',
      uid: "malformed-action-001",
      summary: "New summary",
      start: "2024-06-15T10:00:00Z",
      end: "2024-06-15T11:00:00Z",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        if ((init?.method ?? "GET") === "GET") {
          return new Response(current, { status: 200, headers: { etag: '"current-etag"' } });
        }
        return new Response("", { status: 204 });
      },
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe("GET");
  });

  test("round-trips the returned ETag into a later delete without rewriting it", async () => {
    const requests: Request[] = [];
    const result = await updateEvent({
      ...CREDS,
      eventHref: "/1234567890/calendars/home/uid-001.ics",
      etag: 'W/"current-etag"',
      uid: "uid-001",
      summary: "Updated Meeting",
      start: "2024-06-15T14:00:00Z",
      end: "2024-06-15T15:00:00Z",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        if ((init?.method ?? "GET") === "GET") {
          return new Response(eventIcs.replace("meeting-uid-001", "uid-001"), { status: 200, headers: { etag: 'W/"current-etag"' } });
        }
        return new Response("", { status: 204, headers: { "etag": 'W/"updated-etag-001"' } });
      },
    }) as Record<string, unknown>;
    await deleteEvent({
      ...CREDS,
      eventHref: result.href as string,
      etag: result.etag as string,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response("", { status: 204 });
      },
    });
    expect(requests).toHaveLength(3);
    expect(requests[0].method).toBe("GET");
    expect(requests[1].headers.get("If-Match")).toBe('W/"current-etag"');
    expect(result.etag).toBe('W/"updated-etag-001"');
    expect(requests[2].headers.get("If-Match")).toBe('W/"updated-etag-001"');
  });

  test("fails a stale ETag before sending a PUT", async () => {
    const requests: Request[] = [];
    await expect(updateEvent({
      ...CREDS,
      eventHref: "/1234/calendars/home/ev.ics",
      etag: 'W/"stale-update"',
      uid: "uid-001",
      summary: "S", start: "2024-06-15T10:00:00Z", end: "2024-06-15T11:00:00Z",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(eventIcs.replace("meeting-uid-001", "uid-001"), { status: 200, headers: { etag: 'W/"newer-etag"' } });
      },
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message: expect.stringContaining("conflict") });
    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe("GET");
  });

  test("fails closed when the resource is not a supported VEVENT", async () => {
    const requests: Request[] = [];
    await expect(updateEvent({
      ...CREDS,
      eventHref: "/1234/calendars/home/ev.ics",
      etag: '"current"',
      uid: "uid-001",
      summary: "S", start: "2024-06-15T10:00:00Z", end: "2024-06-15T11:00:00Z",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response("BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n", { status: 200, headers: { etag: '"current"' } });
      },
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe("GET");
  });

  test("rejects CRLF input before any read or write", async () => {
    const requests: Request[] = [];
    await expect(updateEvent({
      ...CREDS,
      eventHref: "/1234/calendars/home/ev.ics",
      etag: '"current"',
      uid: "uid-001",
      summary: "S\r\nX-INJECTED:value", start: "2024-06-15T10:00:00Z", end: "2024-06-15T11:00:00Z",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response("", { status: 500 });
      },
    })).rejects.toThrow(/line break|control character/i);
    expect(requests).toHaveLength(0);
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(updateEvent({
      ...CREDS,
      eventHref: "/1234/calendars/home/ev.ics",
      etag: "e", uid: "u", summary: "S",
      start: "2024-06-15T10:00:00Z", end: "2024-06-15T11:00:00Z",
      fetch: async () => new Response("", { status: 429, headers: { "retry-after": "5" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED" });
  });
});

// ─── events.delete ────────────────────────────────────────────────────────────

describe("deleteEvent", () => {
  test("validateEventsDeleteInput parses valid input", () => {
    const validated = validateEventsDeleteInput({ username: "u", password: "p", eventHref: "/1234/calendars/home/ev.ics" });
    expect(validated.username).toBe("u");
    expect(validated.eventHref).toBe("/1234/calendars/home/ev.ics");
  });

  test("throws when eventHref missing", () => {
    expect(() => validateEventsDeleteInput({ username: "u", password: "p" })).toThrow("eventHref is required");
  });

  test("sends DELETE and returns deleted:true on 204", async () => {
    const requests: Request[] = [];
    const result = await deleteEvent({
      ...CREDS,
      eventHref: "/1234567890/calendars/home/uid-001.ics",
      etag: '"etag-to-delete"',
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response("", { status: 204 });
      },
    }) as Record<string, unknown>;
    expect(requests[0].method).toBe("DELETE");
    expect(requests[0].headers.get("If-Match")).toBe('"etag-to-delete"');
    expect(result.deleted).toBe(true);
    expect(result.alreadyGone).toBe(false);
  });

  test("returns alreadyGone:true on 404", async () => {
    const result = await deleteEvent({
      ...CREDS,
      eventHref: "/1234/calendars/home/ev.ics",
      fetch: async () => new Response("Not Found", { status: 404 }),
    }) as Record<string, unknown>;
    expect(result.deleted).toBe(true);
    expect(result.alreadyGone).toBe(true);
  });

  test("does not send If-Match when etag not provided", async () => {
    const requests: Request[] = [];
    await deleteEvent({
      ...CREDS,
      eventHref: "/1234/calendars/home/ev.ics",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response("", { status: 204 });
      },
    });
    expect(requests[0].headers.get("If-Match")).toBeNull();
  });

  test("maps 412 to a safe conflict without retrying or deleting unconditionally", async () => {
    const requests: Request[] = [];
    await expect(deleteEvent({
      ...CREDS,
      eventHref: "/1234/calendars/home/ev.ics",
      etag: 'W/"stale-etag"',
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response("", { status: 412 });
      },
    })).rejects.toMatchObject({
      ok: false,
      code: "CONNECTOR_UPSTREAM_ERROR",
      message: expect.stringContaining("ETag mismatch"),
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].headers.get("If-Match")).toBe('W/"stale-etag"');
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(deleteEvent({
      ...CREDS,
      eventHref: "/1234/calendars/home/ev.ics",
      fetch: async () => new Response("", { status: 429, headers: { "retry-after": "10" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED" });
  });
});

// ─── freebusy.query ───────────────────────────────────────────────────────────

describe("queryFreeBusy", () => {
  test("validateFreeBusyQueryInput parses valid input", () => {
    const validated = validateFreeBusyQueryInput({
      username: "u", password: "p",
      href: "/1234/calendars/home/",
      start: "2024-06-01T00:00:00Z",
      end: "2024-06-30T23:59:59Z",
    });
    expect(validated.username).toBe("u");
    expect(validated.href).toBe("/1234/calendars/home/");
    expect(validated.start).toBe("2024-06-01T00:00:00Z");
  });

  test("throws when start missing", () => {
    expect(() => validateFreeBusyQueryInput({ username: "u", password: "p", href: "/h/", end: "2024-06-30T00:00:00Z" })).toThrow("start is required");
  });

  test("throws when end missing", () => {
    expect(() => validateFreeBusyQueryInput({ username: "u", password: "p", href: "/h/", start: "2024-06-01T00:00:00Z" })).toThrow("end is required");
  });

  test("sends REPORT free-busy-query and returns freeBusyData", async () => {
    const freeBusyResponse = `<?xml version="1.0" encoding="UTF-8"?><D:multistatus xmlns:D="DAV:"><D:response><D:href>/1234/</D:href><D:propstat><D:prop><C:calendar-data>BEGIN:VCALENDAR\nBEGIN:VFREEBUSY\nEND:VFREEBUSY\nEND:VCALENDAR</C:calendar-data></D:prop></D:propstat></D:response></D:multistatus>`;
    const requests: Request[] = [];
    const result = await queryFreeBusy({
      ...CREDS,
      href: "/1234567890/calendars/",
      start: "2024-06-01T00:00:00Z",
      end: "2024-06-30T23:59:59Z",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(freeBusyResponse, { status: 207 });
      },
    }) as Record<string, unknown>;
    expect(requests[0].method).toBe("REPORT");
    const body = await requests[0].text();
    expect(body).toContain("free-busy-query");
    expect(body).toContain("20240601T000000Z");
    expect(result.freeBusyData).toBeDefined();
    expect(result.status).toBe(207);
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(queryFreeBusy({
      ...CREDS,
      href: "/1234/", start: "2024-06-01T00:00:00Z", end: "2024-06-30T00:00:00Z",
      fetch: async () => new Response("", { status: 429, headers: { "retry-after": "20" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED" });
  });

  test("maps 403 to CONNECTOR_UPSTREAM_ERROR with auth message", async () => {
    await expect(queryFreeBusy({
      ...CREDS,
      href: "/1234/", start: "2024-06-01T00:00:00Z", end: "2024-06-30T00:00:00Z",
      fetch: async () => new Response("", { status: 403 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message: expect.stringContaining("authentication failed") });
  });
});
