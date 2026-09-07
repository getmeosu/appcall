import { describe, expect, test } from "bun:test";
import {
  buildPrincipalPropfind,
  buildCalendarHomePropfind,
  buildCalendarListPropfind,
  buildCalendarQueryReport,
  buildFreeBusyReport,
  toCalDAVDateTime,
  parseMultiStatus,
  buildVEvent,
  parseVEvent,
  generateUid,
} from "../src/dav";

// Load fixture files as text
const principalXml = await Bun.file(`${import.meta.dir}/../fixtures/principal.xml`).text();
const calendarHomeXml = await Bun.file(`${import.meta.dir}/../fixtures/calendar_home.xml`).text();
const calendarsXml = await Bun.file(`${import.meta.dir}/../fixtures/calendars.xml`).text();
const eventsReportXml = await Bun.file(`${import.meta.dir}/../fixtures/events_report.xml`).text();
const eventIcs = await Bun.file(`${import.meta.dir}/../fixtures/event.ics`).text();

// ─── toCalDAVDateTime ─────────────────────────────────────────────────────────

describe("toCalDAVDateTime", () => {
  test("converts ISO 8601 UTC to CalDAV format", () => {
    expect(toCalDAVDateTime("2024-06-15T10:00:00Z")).toBe("20240615T100000Z");
  });

  test("strips milliseconds", () => {
    expect(toCalDAVDateTime("2024-06-15T10:00:00.000Z")).toBe("20240615T100000Z");
  });
});

// ─── XML Builders ─────────────────────────────────────────────────────────────

describe("buildPrincipalPropfind", () => {
  test("contains current-user-principal prop", () => {
    const xml = buildPrincipalPropfind();
    expect(xml).toContain("current-user-principal");
    expect(xml).toContain("propfind");
  });
});

describe("buildCalendarHomePropfind", () => {
  test("contains calendar-home-set", () => {
    const xml = buildCalendarHomePropfind();
    expect(xml).toContain("calendar-home-set");
  });
});

describe("buildCalendarListPropfind", () => {
  test("contains displayname and resourcetype", () => {
    const xml = buildCalendarListPropfind();
    expect(xml).toContain("displayname");
    expect(xml).toContain("resourcetype");
    expect(xml).toContain("supported-calendar-component-set");
  });
});

describe("buildCalendarQueryReport", () => {
  test("builds REPORT without time-range when no dates given", () => {
    const xml = buildCalendarQueryReport();
    expect(xml).toContain("calendar-query");
    expect(xml).toContain("VEVENT");
    expect(xml).not.toContain("time-range");
  });

  test("includes time-range when start and end provided", () => {
    const xml = buildCalendarQueryReport("2024-06-01T00:00:00Z", "2024-06-30T23:59:59Z");
    expect(xml).toContain("time-range");
    expect(xml).toContain("20240601T000000Z");
    expect(xml).toContain("20240630T235959Z");
  });
});

describe("buildFreeBusyReport", () => {
  test("builds free-busy-query with time range", () => {
    const xml = buildFreeBusyReport("2024-06-01T00:00:00Z", "2024-06-30T23:59:59Z");
    expect(xml).toContain("free-busy-query");
    expect(xml).toContain("time-range");
    expect(xml).toContain("20240601T000000Z");
  });
});

// ─── parseMultiStatus ─────────────────────────────────────────────────────────

describe("parseMultiStatus - principal.xml", () => {
  test("extracts principal href", () => {
    const result = parseMultiStatus(principalXml);
    expect(result.responses).toHaveLength(1);
    const r = result.responses[0];
    expect(r.href).toBe("/");
    expect(r.principalHref).toBe("/principals/testuser@icloud.com/");
  });
});

describe("parseMultiStatus - calendar_home.xml", () => {
  test("extracts calendar home href", () => {
    const result = parseMultiStatus(calendarHomeXml);
    const r = result.responses[0];
    expect(r.calendarHomeHref).toBe("/1234567890/calendars/");
  });
});

describe("parseMultiStatus - calendars.xml", () => {
  test("extracts 3 responses including 2 calendars", () => {
    const result = parseMultiStatus(calendarsXml);
    expect(result.responses).toHaveLength(3);
  });

  test("extracts displayName for calendar entries", () => {
    const result = parseMultiStatus(calendarsXml);
    const home = result.responses.find((r) => r.href === "/1234567890/calendars/home/");
    expect(home?.displayName).toBe("Home");
    expect(home?.isCalendar).toBe(true);
    expect(home?.calendarColor).toBe("#FF2D55");
    expect(home?.ctag).toBe("abc123ctag");
    expect(home?.components).toContain("VEVENT");
  });

  test("extracts Work calendar", () => {
    const result = parseMultiStatus(calendarsXml);
    const work = result.responses.find((r) => r.href === "/1234567890/calendars/work/");
    expect(work?.displayName).toBe("Work");
    expect(work?.calendarColor).toBe("#007AFF");
  });
});

describe("parseMultiStatus - events_report.xml", () => {
  test("extracts 2 event responses with calendarData", () => {
    const result = parseMultiStatus(eventsReportXml);
    const withData = result.responses.filter((r) => r.calendarData);
    expect(withData).toHaveLength(2);
  });

  test("extracts etag without quotes", () => {
    const result = parseMultiStatus(eventsReportXml);
    const event1 = result.responses.find((r) => r.href.includes("meeting-uid-001"));
    expect(event1?.etag).toBe("etag-abc123");
  });

  test("calendarData contains VEVENT", () => {
    const result = parseMultiStatus(eventsReportXml);
    const event1 = result.responses.find((r) => r.href.includes("meeting-uid-001"));
    expect(event1?.calendarData).toContain("VEVENT");
    expect(event1?.calendarData).toContain("Team Meeting");
  });
});

// ─── parseVEvent ──────────────────────────────────────────────────────────────

describe("parseVEvent", () => {
  test("parses UID, SUMMARY, DTSTART, DTEND from fixture", () => {
    const parsed = parseVEvent(eventIcs);
    expect(parsed.uid).toBe("meeting-uid-001");
    expect(parsed.summary).toBe("Team Meeting");
    expect(parsed.start).toBe("20240615T100000Z");
    expect(parsed.end).toBe("20240615T110000Z");
    expect(parsed.location).toBe("Conference Room A");
    expect(parsed.description).toBe("Weekly team sync meeting");
  });

  test("returns undefined for missing fields", () => {
    const parsed = parseVEvent("BEGIN:VCALENDAR\nBEGIN:VEVENT\nEND:VEVENT\nEND:VCALENDAR");
    expect(parsed.uid).toBeUndefined();
    expect(parsed.summary).toBeUndefined();
  });
});

// ─── buildVEvent ──────────────────────────────────────────────────────────────

describe("buildVEvent", () => {
  test("builds valid iCalendar string with required fields", () => {
    const ics = buildVEvent({
      uid: "test-uid-123",
      summary: "My Event",
      start: "2024-06-15T10:00:00Z",
      end: "2024-06-15T11:00:00Z",
    });
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("END:VEVENT");
    expect(ics).toContain("END:VCALENDAR");
    expect(ics).toContain("UID:test-uid-123");
    expect(ics).toContain("SUMMARY:My Event");
    expect(ics).toContain("DTSTART:20240615T100000Z");
    expect(ics).toContain("DTEND:20240615T110000Z");
  });

  test("includes DESCRIPTION and LOCATION when provided", () => {
    const ics = buildVEvent({
      uid: "test-uid-456",
      summary: "Meeting",
      start: "2024-06-15T10:00:00Z",
      end: "2024-06-15T11:00:00Z",
      description: "My notes",
      location: "Office",
    });
    expect(ics).toContain("DESCRIPTION:My notes");
    expect(ics).toContain("LOCATION:Office");
  });

  test("includes ATTENDEE lines when attendees provided", () => {
    const ics = buildVEvent({
      uid: "test-uid-789",
      summary: "Team Call",
      start: "2024-06-15T10:00:00Z",
      end: "2024-06-15T11:00:00Z",
      attendees: ["alice@example.com", "bob@example.com"],
    });
    expect(ics).toContain("ATTENDEE:mailto:alice@example.com");
    expect(ics).toContain("ATTENDEE:mailto:bob@example.com");
  });

  test("built iCalendar round-trips through parseVEvent", () => {
    const ics = buildVEvent({
      uid: "roundtrip-uid",
      summary: "Roundtrip Test",
      start: "2024-06-15T10:00:00Z",
      end: "2024-06-15T11:00:00Z",
    });
    const parsed = parseVEvent(ics);
    expect(parsed.uid).toBe("roundtrip-uid");
    expect(parsed.summary).toBe("Roundtrip Test");
  });
});

// ─── generateUid ──────────────────────────────────────────────────────────────

describe("generateUid", () => {
  test("generates a non-empty string", () => {
    const uid = generateUid();
    expect(typeof uid).toBe("string");
    expect(uid.length).toBeGreaterThan(0);
  });

  test("generates unique values", () => {
    const uids = new Set(Array.from({ length: 10 }, generateUid));
    expect(uids.size).toBe(10);
  });
});
