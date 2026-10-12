import { describe, expect, test } from "bun:test";
import { expectPathFieldGuarded, expectRejectedWithoutFetch, requestsFor } from "../../_shared/test/path_segment_harness";

// SEC-PATH-2c: every (operation, path field) below reached the provider with a
// dot-only, empty or whitespace id before this fix (fuzzed on 6af924c2). Each
// must now be rejected before any request; percent-encoded dot forms must never
// arrive as a dot segment.
const CREDS = {"accessToken": "credaccessToken"};
const CASES: Array<[string, string]> = [
  ["calendars.get", "calendarId"],
  ["contacts.get", "contactId"],
  ["contacts.update", "contactId"],
  ["drive.items.copy", "itemId"],
  ["drive.items.delete", "itemId"],
  ["drive.items.get", "itemId"],
  ["drive.items.update", "itemId"],
  ["events.delete", "eventId"],
  ["events.get", "eventId"],
  ["mailFolders.get", "folderId"],
  ["messages.delete", "messageId"],
  ["messages.get", "messageId"],
  ["messages.move", "messageId"],
  ["messages.reply", "messageId"],
  ["teams_meetings.create", "userId"],
  ["teams_meetings.delete", "meetingId"],
  ["teams_meetings.delete", "userId"],
  ["teams_meetings.get", "meetingId"],
  ["teams_meetings.get", "userId"],
  ["teams_meetings.get_by_join_url", "userId"],
  ["teams_meetings.update", "meetingId"],
  ["teams_meetings.update", "userId"],
];

describe("microsoft-365 SEC-PATH-2c path ids", () => {
  for (const [action, field] of CASES) {
    test(`${action} ${field} rejects dot-only/blank before fetch`, async () => {
      await expectPathFieldGuarded("microsoft-365", action, field, CREDS);
    });
  }
});

describe("microsoft-365 teams_meetings userId (beyond-13 empty collapse)", () => {
  const base = { accessToken: "t", meetingId: "MSo1" };
  test("a present but blank userId is rejected instead of acting on /me", async () => {
    for (const userId of ["", " ", "  ", ".", "..", null]) {
      await expectRejectedWithoutFetch("microsoft-365", "teams_meetings.delete", { ...base, userId });
      await expectRejectedWithoutFetch("microsoft-365", "teams_meetings.get", { ...base, userId });
    }
  });
  test("only an omitted userId targets the signed-in user", async () => {
    const calls = await requestsFor("microsoft-365", "teams_meetings.get", base);
    expect(new URL(calls[0]!.url).pathname).toBe("/v1.0/me/onlineMeetings/MSo1");
  });
  test("a UPN userId is one encoded segment", async () => {
    const calls = await requestsFor("microsoft-365", "teams_meetings.get", { ...base, userId: "ada@contoso.com" });
    expect(new URL(calls[0]!.url).pathname).toBe("/v1.0/users/ada%40contoso.com/onlineMeetings/MSo1");
  });
});
