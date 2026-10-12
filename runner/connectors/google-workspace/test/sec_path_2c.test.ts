import { describe, expect, test } from "bun:test";
import { expectPathFieldGuarded, requestsFor } from "../../_shared/test/path_segment_harness";

// SEC-PATH-2c: every (operation, path field) below reached the provider with a
// dot-only, empty or whitespace id before this fix (fuzzed on 6af924c2). Each
// must now be rejected before any request; percent-encoded dot forms must never
// arrive as a dot segment.
const CREDS = {"accessToken": "credaccessToken"};
const CASES: Array<[string, string]> = [
  ["calendar.acl.list", "calendarId"],
  ["calendar.calendars.get", "calendarId"],
  ["calendar.events.create", "calendarId"],
  ["calendar.events.delete", "calendarId"],
  ["calendar.events.delete", "eventId"],
  ["calendar.events.get", "calendarId"],
  ["calendar.events.get", "eventId"],
  ["calendar.events.instances", "calendarId"],
  ["calendar.events.instances", "eventId"],
  ["calendar.events.move", "calendarId"],
  ["calendar.events.move", "eventId"],
  ["calendar.events.update", "calendarId"],
  ["calendar.events.update", "eventId"],
  ["docs.get", "documentId"],
  ["drafts.delete", "draftId"],
  ["drive.files.copy", "fileId"],
  ["drive.files.delete", "fileId"],
  ["drive.files.get", "fileId"],
  ["drive.files.update", "fileId"],
  ["drive.permissions.create", "fileId"],
  ["drive.permissions.delete", "fileId"],
  ["drive.permissions.delete", "permissionId"],
  ["drive.permissions.list", "fileId"],
  ["labels.get", "labelId"],
  ["meet.add_to_event", "calendarId"],
  ["meet.add_to_event", "eventId"],
  ["meet.create", "calendarId"],
  ["messages.attachments.get", "attachmentId"],
  ["messages.attachments.get", "messageId"],
  ["messages.delete", "messageId"],
  ["messages.get", "messageId"],
  ["messages.modify", "messageId"],
  ["messages.trash", "messageId"],
  ["messages.untrash", "messageId"],
  ["sheets.spreadsheets.get", "spreadsheetId"],
  ["sheets.values.append", "spreadsheetId"],
  ["sheets.values.clear", "spreadsheetId"],
  ["sheets.values.get", "range"],
  ["sheets.values.get", "spreadsheetId"],
  ["sheets.values.update", "range"],
  ["sheets.values.update", "spreadsheetId"],
  ["threads.get", "threadId"],
];

describe("google-workspace SEC-PATH-2c path ids", () => {
  for (const [action, field] of CASES) {
    test(`${action} ${field} rejects dot-only/blank before fetch`, async () => {
      await expectPathFieldGuarded("google-workspace", action, field, CREDS);
    });
  }
});

describe("google-workspace sheets range keeps A1 notation", () => {
  test("a quoted sheet name with '/' is one encoded segment", async () => {
    const calls = await requestsFor("google-workspace", "sheets.values.get", { accessToken: "t", spreadsheetId: "abc", range: "'Q1/Q2'!A1:B2" });
    expect(new URL(calls[0]!.url).pathname).toBe("/v4/spreadsheets/abc/values/'Q1%2FQ2'!A1%3AB2");
  });
});
