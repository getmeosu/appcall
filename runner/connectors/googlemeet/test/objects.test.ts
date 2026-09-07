import { describe, expect, test } from "bun:test";
import { normalizeMeeting, parseMeetingsResponse } from "../src/objects";

describe("normalizeMeeting", () => {
  test("extracts meet link and times from a calendar event", () => {
    const m = normalizeMeeting({
      id: "evt_1",
      summary: "Sync",
      hangoutLink: "https://meet.google.com/abc-defg-hij",
      start: { dateTime: "2026-06-01T09:00:00Z" },
      end: { dateTime: "2026-06-01T09:30:00Z" },
    });
    expect(m.provider).toBe("googlemeet");
    expect(m.providerMeetingId).toBe("evt_1");
    expect(m.title).toBe("Sync");
    expect(m.meetingUrl).toBe("https://meet.google.com/abc-defg-hij");
    expect(m.startTime).toBe("2026-06-01T09:00:00Z");
  });

  test("parseMeetingsResponse maps the items array", () => {
    const parsed = parseMeetingsResponse({ items: [{ id: "evt_1", summary: "Sync" }] });
    expect(parsed.meetings).toHaveLength(1);
    expect(parsed.meetings[0].providerMeetingId).toBe("evt_1");
  });

  test("parseMeetingsResponse tolerates missing items", () => {
    expect(parseMeetingsResponse({}).meetings).toHaveLength(0);
  });
});
