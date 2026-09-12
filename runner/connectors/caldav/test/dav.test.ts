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
  mergeVEvent,
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

  test("converts non-UTC offsets to UTC", () => {
    expect(toCalDAVDateTime("2026-09-09T10:00:00+05:30")).toBe("20260909T043000Z");
  });

  test("converts a negative numeric offset to UTC", () => {
    expect(toCalDAVDateTime("2024-06-15T10:00:00-04:00")).toBe("20240615T140000Z");
  });

  test("truncates six digit fractional seconds", () => {
    expect(toCalDAVDateTime("2024-06-15T10:00:00.123456Z")).toBe("20240615T100000Z");
  });

  test("interprets a timezone-less timestamp in the supplied IANA timezone", () => {
    expect(toCalDAVDateTime("2024-06-15T10:00:00", "Asia/Kolkata")).toBe("20240615T043000Z");
  });

  test("defaults a timezone-less timestamp to UTC", () => {
    expect(toCalDAVDateTime("2024-06-15T10:00:00")).toBe("20240615T100000Z");
  });

  test("rejects an impossible calendar date", () => {
    expect(() => toCalDAVDateTime("2024-02-30T10:00:00Z")).toThrow("Invalid CalDAV date-time.");
  });

  test("rejects an invalid timezone", () => {
    expect(() => toCalDAVDateTime("2024-06-15T10:00:00", "Not/AZone")).toThrow("Invalid CalDAV timezone.");
  });

  test("rejects numeric fixed-offset timezones while accepting IANA fixed-offset zones", () => {
    expect(() => toCalDAVDateTime("2024-06-15T10:00:00", "+05:30")).toThrow("Invalid CalDAV timezone.");
    expect(() => toCalDAVDateTime("2024-06-15T10:00:00", "-04:00")).toThrow("Invalid CalDAV timezone.");
    expect(toCalDAVDateTime("2024-06-15T10:00:00", "UTC")).toBe("20240615T100000Z");
    expect(toCalDAVDateTime("2024-06-15T10:00:00", "Etc/GMT+5")).toBe("20240615T150000Z");
  });

  test("rejects a 2026 New York daylight-saving gap", () => {
    expect(() => toCalDAVDateTime("2026-03-08T02:30:00", "America/New_York")).toThrow("Invalid CalDAV date-time.");
  });

  test("rejects a 2026 New York daylight-saving fold", () => {
    expect(() => toCalDAVDateTime("2026-11-01T01:30:00", "America/New_York")).toThrow("Invalid CalDAV date-time.");
  });

  test("accepts an explicit zone offset through a DST transition", () => {
    expect(toCalDAVDateTime("2026-03-08T02:30:00-05:00", "America/New_York")).toBe("20260308T073000Z");
  });

  test("rejects leap seconds instead of normalizing them", () => {
    expect(() => toCalDAVDateTime("2024-06-15T10:00:60Z")).toThrow("Invalid CalDAV date-time.");
  });

  test("rejects instants outside the four-digit iCalendar year range", () => {
    expect(() => toCalDAVDateTime("0001-01-01T00:00:00+01:00")).toThrow("Invalid CalDAV date-time.");
    expect(() => toCalDAVDateTime("9999-12-31T23:59:59-01:00")).toThrow("Invalid CalDAV date-time.");
  });

  test("rejects calendar annotations and expanded years", () => {
    expect(() => toCalDAVDateTime("2024-06-15T10:00:00Z[u-ca=iso8601]")).toThrow("Invalid CalDAV date-time.");
    expect(() => toCalDAVDateTime("+002024-06-15T10:00:00Z")).toThrow("Invalid CalDAV date-time.");
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

  test("preserves no time-range for a valid lone start or end", () => {
    expect(buildCalendarQueryReport("2024-06-01T00:00:00Z")).not.toContain("time-range");
    expect(buildCalendarQueryReport(undefined, "2024-06-30T23:59:59Z")).not.toContain("time-range");
  });

  test("rejects malformed lone start and end bounds", () => {
    expect(() => buildCalendarQueryReport("not-a-date")).toThrow("Invalid CalDAV date-time.");
    expect(() => buildCalendarQueryReport(undefined, "not-a-date")).toThrow("Invalid CalDAV date-time.");
  });

  test("rejects an empty provided start or end bound", () => {
    expect(() => buildCalendarQueryReport("", "2024-06-30T23:59:59Z")).toThrow("Invalid CalDAV date-time.");
    expect(() => buildCalendarQueryReport("2024-06-01T00:00:00Z", "")).toThrow("Invalid CalDAV date-time.");
  });

  test("includes time-range when start and end provided", () => {
    const xml = buildCalendarQueryReport("2024-06-01T00:00:00Z", "2024-06-30T23:59:59Z");
    expect(xml).toContain("time-range");
    expect(xml).toContain("20240601T000000Z");
    expect(xml).toContain("20240630T235959Z");
  });

  test("normalizes timezone-less report filters as UTC", () => {
    const xml = buildCalendarQueryReport("2024-06-01T10:00:00", "2024-06-01T11:00:00");
    expect(xml).toContain('start="20240601T100000Z"');
    expect(xml).toContain('end="20240601T110000Z"');
  });
});

describe("buildFreeBusyReport", () => {
  test("builds free-busy-query with time range", () => {
    const xml = buildFreeBusyReport("2024-06-01T00:00:00Z", "2024-06-30T23:59:59Z");
    expect(xml).toContain("free-busy-query");
    expect(xml).toContain("time-range");
    expect(xml).toContain("20240601T000000Z");
  });

  test("normalizes timezone-less free-busy filters as UTC", () => {
    const xml = buildFreeBusyReport("2024-06-01T10:00:00", "2024-06-01T11:00:00");
    expect(xml).toContain('start="20240601T100000Z"');
    expect(xml).toContain('end="20240601T110000Z"');
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

  test("preserves quoted etag", () => {
    const result = parseMultiStatus(eventsReportXml);
    const event1 = result.responses.find((r) => r.href.includes("meeting-uid-001"));
    expect(event1?.etag).toBe('"etag-abc123"');
  });

  test("preserves weak etag marker and quotes", () => {
    const result = parseMultiStatus(`
      <D:multistatus xmlns:D="DAV:">
        <D:response>
          <D:href>/calendars/home/weak.ics</D:href>
          <D:propstat><D:prop><D:getetag>W/"weak-123"</D:getetag></D:prop></D:propstat>
        </D:response>
      </D:multistatus>
    `);
    expect(result.responses[0]?.etag).toBe('W/"weak-123"');
  });

  test("decodes ETag XML entities once, including numeric quote entities", () => {
    const result = parseMultiStatus(`
      <D:multistatus xmlns:D="DAV:">
        <D:response>
          <D:href>/calendars/home/entity.ics</D:href>
          <D:propstat><D:prop><D:getetag>&quot;entity-123&quot;</D:getetag></D:prop></D:propstat>
        </D:response>
        <D:response>
          <D:href>/calendars/home/numeric.ics</D:href>
          <D:propstat><D:prop><D:getetag>&#x57;/&#34;numeric-123&#34;</D:getetag></D:prop></D:propstat>
        </D:response>
        <D:response>
          <D:href>/calendars/home/literal.ics</D:href>
          <D:propstat><D:prop><D:getetag>&amp;quot;literal-123&amp;quot;</D:getetag></D:prop></D:propstat>
        </D:response>
      </D:multistatus>
    `);
    expect(result.responses[0]?.etag).toBe('"entity-123"');
    expect(result.responses[1]?.etag).toBe('W/"numeric-123"');
    expect(result.responses[2]?.etag).toBe('&quot;literal-123&quot;');
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

  test("escapes embedded newlines and rejects CRLF injection", () => {
    const ics = buildVEvent({
      uid: "text-uid",
      summary: "Line one\nLine two",
      start: "2024-06-15T10:00:00Z",
      end: "2024-06-15T11:00:00Z",
      description: "Notes\ncontinue",
    });
    expect(ics).toContain("SUMMARY:Line one\\nLine two");
    expect(ics).toContain("DESCRIPTION:Notes\\ncontinue");
    expect(ics).not.toContain("Line one\r\nLine two");

    expect(() => buildVEvent({
      uid: "uid\r\nX-INJECTED:value",
      summary: "Summary",
      start: "2024-06-15T10:00:00Z",
      end: "2024-06-15T11:00:00Z",
    })).toThrow(/line break|control character/i);
    expect(() => buildVEvent({
      uid: "uid\nX-INJECTED:value",
      summary: "Summary",
      start: "2024-06-15T10:00:00Z",
      end: "2024-06-15T11:00:00Z",
    })).toThrow(/line break|control character/i);
    expect(() => buildVEvent({
      uid: "uid",
      summary: "Summary\r\nX-INJECTED:value",
      start: "2024-06-15T10:00:00Z",
      end: "2024-06-15T11:00:00Z",
    })).toThrow(/line break|control character/i);
    expect(() => buildVEvent({
      uid: "uid",
      summary: "Summary",
      start: "2024-06-15T10:00:00Z",
      end: "2024-06-15T11:00:00Z",
      attendees: ["alice@example.com\r\nX-INJECTED:value"],
    })).toThrow(/address|line break|control character/i);
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

  test("normalizes timezone-less event times using the supplied timezone", () => {
    const ics = buildVEvent({
      uid: "timezone-uid",
      summary: "Timezone Event",
      start: "2024-06-15T10:00:00",
      end: "2024-06-15T11:00:00",
      timezone: "Asia/Kolkata",
    });
    expect(ics).toContain("DTSTART:20240615T043000Z");
    expect(ics).toContain("DTEND:20240615T053000Z");
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

describe("mergeVEvent", () => {
  test("updates the master while preserving unrelated properties, exceptions, and alarms", () => {
    const resource = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "X-WR-CALNAME:Shared Calendar",
      "BEGIN:VEVENT",
      "UID:series-001",
      "DTSTART:20240615T100000Z",
      "DTEND:20240615T110000Z",
      "SUMMARY:Original",
      "ORGANIZER;CN=Owner:mailto:owner@example.com",
      "RRULE:FREQ=WEEKLY",
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "DESCRIPTION:Reminder",
      "TRIGGER:-PT15M",
      "END:VALARM",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:series-001",
      "RECURRENCE-ID:20240622T100000Z",
      "DTSTART:20240622T120000Z",
      "DTEND:20240622T130000Z",
      "SUMMARY:Exception",
      "END:VEVENT",
      "END:VCALENDAR",
      "",
    ].join("\r\n");

    const updated = mergeVEvent(resource, {
      uid: "series-001",
      summary: "Updated",
      start: "2024-06-15T14:00:00Z",
      end: "2024-06-15T15:00:00Z",
    });

    expect(updated).toContain("X-WR-CALNAME:Shared Calendar");
    expect(updated).toContain("SUMMARY:Updated");
    expect(updated).toContain("DTSTART:20240615T140000Z");
    expect(updated).toContain("ORGANIZER;CN=Owner:mailto:owner@example.com");
    expect(updated).toContain("RRULE:FREQ=WEEKLY");
    expect(updated).toContain("BEGIN:VALARM");
    expect(updated).toContain("RECURRENCE-ID:20240622T100000Z");
    expect(updated).toContain("SUMMARY:Exception");
    expect(updated.endsWith("\r\n")).toBe(true);
  });

  test("fails closed for unsupported resources", () => {
    expect(() => mergeVEvent("BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n", {
      uid: "missing",
      summary: "Updated",
      start: "2024-06-15T10:00:00Z",
      end: "2024-06-15T11:00:00Z",
    })).toThrow(/cannot be safely updated|VEVENT/i);
  });

  test("fails closed for duplicate UID masters", () => {
    const resource = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      "UID:duplicate-001",
      "DTSTART:20240615T100000Z",
      "DTEND:20240615T110000Z",
      "SUMMARY:First",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:duplicate-001",
      "DTSTART:20240616T100000Z",
      "DTEND:20240616T110000Z",
      "SUMMARY:Second",
      "END:VEVENT",
      "END:VCALENDAR",
      "",
    ].join("\r\n");
    expect(() => mergeVEvent(resource, {
      uid: "duplicate-001",
      summary: "Updated",
      start: "2024-06-15T10:00:00Z",
      end: "2024-06-15T11:00:00Z",
    })).toThrow(/missing or ambiguous|safely updated/i);
  });

  test("fails closed for duplicate UID properties and malformed nesting", () => {
    const duplicateUid = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      "UID:duplicate-property-001",
      "UID:duplicate-property-001",
      "DTSTART:20240615T100000Z",
      "DTEND:20240615T110000Z",
      "SUMMARY:Duplicate",
      "END:VEVENT",
      "END:VCALENDAR",
      "",
    ].join("\r\n");
    expect(() => mergeVEvent(duplicateUid, {
      uid: "duplicate-property-001",
      summary: "Updated",
      start: "2024-06-15T10:00:00Z",
      end: "2024-06-15T11:00:00Z",
    })).toThrow(/UID.*duplicated/i);

    const malformed = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      "UID:malformed-001",
      "DTSTART:20240615T100000Z",
      "DTEND:20240615T110000Z",
      "SUMMARY:Malformed",
      "BEGIN:VALARM",
      "END:VEVENT",
      "END:VALARM",
      "END:VCALENDAR",
      "",
    ].join("\r\n");
    expect(() => mergeVEvent(malformed, {
      uid: "malformed-001",
      summary: "Updated",
      start: "2024-06-15T10:00:00Z",
      end: "2024-06-15T11:00:00Z",
    })).toThrow(/malformed component nesting/i);
  });

  test("replaces all-day duration fields with a valid updated date-time pair", () => {
    const resource = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      "UID:all-day-001",
      "DTSTART;VALUE=DATE:20240615",
      "DURATION:P1D",
      "SUMMARY:All day",
      "END:VEVENT",
      "END:VCALENDAR",
      "",
    ].join("\r\n");
    const updated = mergeVEvent(resource, {
      uid: "all-day-001",
      summary: "Timed event",
      start: "2024-06-15T10:00:00Z",
      end: "2024-06-15T11:00:00Z",
    });
    expect(updated).toContain("DTSTART:20240615T100000Z");
    expect(updated).toContain("DTEND:20240615T110000Z");
    expect(updated).not.toContain("DTSTART;VALUE=DATE");
    expect(updated).not.toContain("DURATION:P1D");
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
