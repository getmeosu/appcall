import { describe, expect, test } from "bun:test";
import sendMessageFixture from "../fixtures/send_message.json";
import messageGetFixture from "../fixtures/message_get.json";
import calendarEventFixture from "../fixtures/calendar_event.json";
import driveFileFixture from "../fixtures/drive_file.json";
import sheetsUpdateFixture from "../fixtures/sheets_update.json";
import rateLimitedFixture from "../fixtures/rate_limited.json";
import {
  sendMessage,
  getMessage,
  modifyMessage,
  trashMessage,
  createDraft,
  listLabels,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  getCalendarEvent,
  listCalendars,
  getDriveFile,
  createDriveFile,
  deleteDriveFile,
  createDrivePermission,
  updateSheetValues,
  clearSheetValues,
  createSpreadsheet,
  batchUpdateSpreadsheet,
  getDocument,
  createDocument,
} from "../src/actions";

describe("google-workspace connector actions", () => {
  test("sendMessage validates input and marks connector-owned output", () => {
    const result = sendMessage({ to: "test@example.com", subject: "Hello", body: "World" });

    expect(result.source).toBe("connector");
    expect(result.validated).toEqual({ to: "test@example.com", subject: "Hello", body: "World" });
  });

  test("sendMessage rejects invalid input", () => {
    expect(() => sendMessage({ to: "", subject: "Hello", body: "World" })).toThrow();
  });

  test("sendMessage posts to Gmail API with connector-owned raw HTTP", async () => {
    const requests: Request[] = [];
    const result = await sendMessage({
      accessToken: "ya29.test-token",
      to: "recipient@example.com",
      subject: "Test",
      body: "Hello",
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return Response.json(sendMessageFixture);
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://gmail.googleapis.com/gmail/v1/users/me/messages/send");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer ya29.test-token");
    expect(result).toEqual({
      connector: "google-workspace",
      action: "messages.send",
      source: "connector",
      messageId: "18e4a3c29a8d7a80",
      threadId: "18e4a3c29a8d7a80",
    });
  });

  test("sendMessage rejects Gmail rate limits with retry metadata", async () => {
    await expect(sendMessage({
      accessToken: "ya29.test-token",
      to: "test@example.com",
      subject: "Test",
      body: "Hello",
      fetch: async () => new Response(JSON.stringify(rateLimitedFixture), {
        status: 429,
        headers: { "Retry-After": "30" },
      }),
    })).rejects.toEqual({
      ok: false,
      code: "CONNECTOR_RATE_LIMITED",
      message: "Gmail rate limit exceeded.",
      retryAfterSeconds: 30,
    });
  });

  // ─── messages.get action ────────────────────────────────────────────────

  test("getMessage returns validated without accessToken", () => {
    const result = getMessage({ messageId: "abc123" });
    expect(result.source).toBe("connector");
    expect(result.validated).toEqual({ messageId: "abc123", format: undefined });
  });

  test("getMessage throws on invalid input", () => {
    expect(() => getMessage({})).toThrow();
  });

  test("getMessage resolves with connector metadata when accessToken present", async () => {
    const result = await getMessage({
      accessToken: "ya29.test-token",
      messageId: "18e4a3c29a8d7a7e",
      fetch: async () => Response.json(messageGetFixture),
    });
    expect(result.connector).toBe("google-workspace");
    expect(result.action).toBe("messages.get");
    expect(result.source).toBe("connector");
    expect(result.id).toBe("18e4a3c29a8d7a7e");
  });

  // ─── messages.modify action ─────────────────────────────────────────────

  test("modifyMessage returns validated without accessToken", () => {
    const result = modifyMessage({ messageId: "abc", addLabelIds: ["STARRED"] });
    expect(result.source).toBe("connector");
    expect((result.validated as Record<string, unknown>).messageId).toBe("abc");
  });

  // ─── messages.trash action ──────────────────────────────────────────────

  test("trashMessage returns validated without accessToken", () => {
    const result = trashMessage({ messageId: "abc" });
    expect(result.source).toBe("connector");
  });

  // ─── drafts.create action ───────────────────────────────────────────────

  test("createDraft returns validated without accessToken", () => {
    const result = createDraft({ to: "a@b.com", subject: "s", body: "b" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("drafts.create");
  });

  // ─── labels.list action ─────────────────────────────────────────────────

  test("listLabels returns validated without accessToken", () => {
    const result = listLabels({});
    expect(result.source).toBe("connector");
    expect(result.action).toBe("labels.list");
  });

  // ─── calendar.events.create action ──────────────────────────────────────

  test("createCalendarEvent returns validated without accessToken", () => {
    const result = createCalendarEvent({
      calendarId: "primary",
      summary: "Test",
      startDateTime: "2024-01-15T09:00:00Z",
      endDateTime: "2024-01-15T10:00:00Z",
    });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("calendar.events.create");
  });

  test("createCalendarEvent resolves with connector metadata when accessToken present", async () => {
    const result = await createCalendarEvent({
      accessToken: "ya29.test-token",
      calendarId: "primary",
      summary: "Team Meeting",
      startDateTime: "2024-01-15T09:00:00-07:00",
      endDateTime: "2024-01-15T10:00:00-07:00",
      fetch: async () => Response.json(calendarEventFixture),
    });
    expect(result.connector).toBe("google-workspace");
    expect(result.action).toBe("calendar.events.create");
    expect(result.eventId).toBe("abc123eventid");
  });

  // ─── calendar.events.update action ──────────────────────────────────────

  test("updateCalendarEvent returns validated without accessToken", () => {
    const result = updateCalendarEvent({ calendarId: "primary", eventId: "abc" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("calendar.events.update");
  });

  // ─── calendar.events.delete action ──────────────────────────────────────

  test("deleteCalendarEvent returns validated without accessToken", () => {
    const result = deleteCalendarEvent({ calendarId: "primary", eventId: "abc" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("calendar.events.delete");
  });

  // ─── calendar.events.get action ─────────────────────────────────────────

  test("getCalendarEvent returns validated without accessToken", () => {
    const result = getCalendarEvent({ calendarId: "primary", eventId: "abc" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("calendar.events.get");
  });

  // ─── calendar.calendars.list action ─────────────────────────────────────

  test("listCalendars returns validated without accessToken", () => {
    const result = listCalendars({});
    expect(result.source).toBe("connector");
    expect(result.action).toBe("calendar.calendars.list");
  });

  // ─── drive.files.get action ─────────────────────────────────────────────

  test("getDriveFile returns validated without accessToken", () => {
    const result = getDriveFile({ fileId: "fileId123" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("drive.files.get");
  });

  test("getDriveFile resolves with connector metadata when accessToken present", async () => {
    const result = await getDriveFile({
      accessToken: "ya29.test-token",
      fileId: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms",
      fetch: async () => Response.json(driveFileFixture),
    });
    expect(result.connector).toBe("google-workspace");
    expect(result.action).toBe("drive.files.get");
    expect(result.id).toBe("1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms");
  });

  // ─── drive.files.create action ──────────────────────────────────────────

  test("createDriveFile returns validated without accessToken", () => {
    const result = createDriveFile({ name: "Doc", mimeType: "application/vnd.google-apps.document" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("drive.files.create");
  });

  // ─── drive.files.delete action ──────────────────────────────────────────

  test("deleteDriveFile returns validated without accessToken", () => {
    const result = deleteDriveFile({ fileId: "abc" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("drive.files.delete");
  });

  // ─── drive.permissions.create action ────────────────────────────────────

  test("createDrivePermission returns validated without accessToken", () => {
    const result = createDrivePermission({ fileId: "abc", role: "reader", type: "user" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("drive.permissions.create");
  });

  // ─── sheets.values.update action ────────────────────────────────────────

  test("updateSheetValues returns validated without accessToken", () => {
    const result = updateSheetValues({ spreadsheetId: "s", range: "A1", values: [["a"]] });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("sheets.values.update");
  });

  test("updateSheetValues resolves with connector metadata when accessToken present", async () => {
    const result = await updateSheetValues({
      accessToken: "ya29.test-token",
      spreadsheetId: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms",
      range: "Sheet1!A1:C2",
      values: [["a", "b", "c"], ["d", "e", "f"]],
      fetch: async () => Response.json(sheetsUpdateFixture),
    });
    expect(result.connector).toBe("google-workspace");
    expect(result.action).toBe("sheets.values.update");
    expect(result.updatedCells).toBe(6);
  });

  // ─── sheets.values.clear action ─────────────────────────────────────────

  test("clearSheetValues returns validated without accessToken", () => {
    const result = clearSheetValues({ spreadsheetId: "s", range: "A1:B2" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("sheets.values.clear");
  });

  // ─── sheets.spreadsheets.create action ──────────────────────────────────

  test("createSpreadsheet returns validated without accessToken", () => {
    const result = createSpreadsheet({ title: "My Sheet" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("sheets.spreadsheets.create");
  });

  // ─── sheets.spreadsheets.batchUpdate action ─────────────────────────────

  test("batchUpdateSpreadsheet returns validated without accessToken", () => {
    const result = batchUpdateSpreadsheet({
      spreadsheetId: "s",
      requests: [{ freezeRows: { sheetId: 0, rowCount: 1 } }],
    });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("sheets.spreadsheets.batchUpdate");
  });

  // ─── docs.create action ─────────────────────────────────────────────────

  test("createDocument returns validated without accessToken", () => {
    const result = createDocument({ title: "My Doc" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("docs.create");
  });
});
