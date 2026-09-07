import { describe, expect, test } from "bun:test";
import meetingGetFixture from "../fixtures/meeting_get.json";
import meetingsListFixture from "../fixtures/meetings_list.json";
import {
  normalizeMeeting,
  parseMeetingResponse,
  parseMeetingsListResponse,
} from "../src/objects";

// ---------------------------------------------------------------------------
// normalizeMeeting
// ---------------------------------------------------------------------------

describe("normalizeMeeting", () => {
  test("normalizes a full meeting from fixture", () => {
    const raw = meetingGetFixture as unknown as Record<string, unknown>;
    const result = normalizeMeeting(raw);

    expect(result.id).toBe("zoom-meeting:123456789");
    expect(result.provider).toBe("zoom");
    expect(result.topic).toBe("Q3 Planning Meeting");
    expect(result.startTime).toBe("2025-07-15T10:00:00Z");
    expect(result.duration).toBe(60);
    expect(result.joinUrl).toBe("https://zoom.us/j/123456789");
    expect(result.timezone).toBe("America/New_York");
    expect(result.modelVersion).toBe("2026-05-17");
    expect(result.raw).toBe(raw);
  });

  test("normalizes a meeting with minimal fields", () => {
    const result = normalizeMeeting({});

    expect(result.id).toBe("zoom-meeting:");
    expect(result.provider).toBe("zoom");
    expect(result.topic).toBe("");
    expect(result.startTime).toBe("");
    expect(result.duration).toBe(0);
    expect(result.joinUrl).toBe("");
    expect(result.timezone).toBe("");
  });

  test("handles numeric meeting id", () => {
    const result = normalizeMeeting({ id: 987654321, topic: "Test", join_url: "https://zoom.us/j/987654321" });
    expect(result.id).toBe("zoom-meeting:987654321");
  });

  test("handles string meeting id", () => {
    const result = normalizeMeeting({ id: "abc-uuid", topic: "Test" });
    expect(result.id).toBe("zoom-meeting:abc-uuid");
  });
});

// ---------------------------------------------------------------------------
// parseMeetingResponse
// ---------------------------------------------------------------------------

describe("parseMeetingResponse", () => {
  test("parses a meeting fixture", () => {
    const result = parseMeetingResponse(meetingGetFixture);
    expect(result.meeting).not.toBeNull();
    expect(result.meeting!.id).toBe("zoom-meeting:123456789");
    expect(result.meeting!.topic).toBe("Q3 Planning Meeting");
    expect(result.meeting!.joinUrl).toBe("https://zoom.us/j/123456789");
  });

  test("returns null for null input", () => {
    const result = parseMeetingResponse(null);
    expect(result.meeting).toBeNull();
  });

  test("returns null for non-record input", () => {
    const result = parseMeetingResponse("string");
    expect(result.meeting).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// parseMeetingsListResponse
// ---------------------------------------------------------------------------

describe("parseMeetingsListResponse", () => {
  test("parses the meetings list fixture", () => {
    const result = parseMeetingsListResponse(meetingsListFixture);
    expect(result.meetings).toHaveLength(2);
    expect(result.meetings[0].id).toBe("zoom-meeting:123456789");
    expect(result.meetings[0].topic).toBe("Q3 Planning Meeting");
    expect(result.meetings[1].id).toBe("zoom-meeting:987654321");
    expect(result.meetings[1].topic).toBe("1:1 with Engineering");
    expect(result.nextPageToken).toBeNull();
    expect(result.totalRecords).toBe(2);
  });

  test("returns empty list for null input", () => {
    const result = parseMeetingsListResponse(null);
    expect(result.meetings).toEqual([]);
    expect(result.nextPageToken).toBeNull();
    expect(result.totalRecords).toBe(0);
  });

  test("returns empty list when meetings is not an array", () => {
    const result = parseMeetingsListResponse({ meetings: "bad" });
    expect(result.meetings).toEqual([]);
  });

  test("extracts next_page_token when present", () => {
    const result = parseMeetingsListResponse({
      meetings: [],
      next_page_token: "tok_next_page_xyz",
      total_records: 0,
    });
    expect(result.nextPageToken).toBe("tok_next_page_xyz");
  });

  test("filters out non-record entries in meetings array", () => {
    const result = parseMeetingsListResponse({
      meetings: [null, { id: 100, topic: "Valid", join_url: "https://zoom.us/j/100" }, "bad", 42],
      total_records: 4,
    });
    expect(result.meetings).toHaveLength(1);
    expect(result.meetings[0].id).toBe("zoom-meeting:100");
  });
});
