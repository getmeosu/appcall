import { describe, expect, test } from "bun:test";
import messagesListFixture from "../fixtures/messages_list.json";
import eventsListFixture from "../fixtures/events_list.json";
import calendarsListFixture from "../fixtures/calendars_list.json";
import filesListFixture from "../fixtures/files_list.json";
import {
  executeMessagesListSync,
  executeEventsListSync,
  executeCalendarsListSync,
  executeFilesListSync,
} from "../src/sync";

describe("microsoft-365 sync operations", () => {
  test("messages.list sync parses and normalizes Outlook messages", () => {
    const result = executeMessagesListSync({ response: messagesListFixture });

    expect(result.provider).toBe("microsoft-365");
    expect(result.operation).toBe("messages.list");
    expect(result.items).toHaveLength(2);
    expect(result.items[0].id).toBe("outlook:AAMkAGI2TG93AAA=");
    expect(result.items[0].providerMessageId).toBe("AAMkAGI2TG93AAA=");
    expect(result.items[1].providerMessageId).toBe("AAMkAGI2TG94AAA=");
    expect(result.nextLink).toBe("https://graph.microsoft.com/v1.0/me/messages?$skip=10");
  });

  test("messages.list sync handles empty response", () => {
    const result = executeMessagesListSync({ response: { value: [] } });

    expect(result.items).toHaveLength(0);
    expect(result.nextLink).toBeNull();
  });

  test("events.list sync parses and normalizes events, filtering cancelled", () => {
    const result = executeEventsListSync({ response: eventsListFixture });

    expect(result.provider).toBe("microsoft-365");
    expect(result.operation).toBe("events.list");
    expect(result.items).toHaveLength(2);
    expect(result.items[0].id).toBe("outlook:AAMkAGI2TG93AAA=");
    expect(result.items[0].summary).toBe("Team Standup");
    expect(result.items[1].id).toBe("outlook:AAMkAGI2TG94AAA=");
    expect(result.nextLink).toBe("https://graph.microsoft.com/v1.0/me/events?$skip=10");
  });

  test("events.list sync handles empty response", () => {
    const result = executeEventsListSync({ response: { value: [] } });

    expect(result.items).toHaveLength(0);
    expect(result.nextLink).toBeNull();
  });

  test("calendars.list sync parses and normalizes calendars", () => {
    const result = executeCalendarsListSync({ response: calendarsListFixture });

    expect(result.provider).toBe("microsoft-365");
    expect(result.operation).toBe("calendars.list");
    expect(result.items).toHaveLength(3);
    expect(result.items[0].id).toBe("AAMkAGI2TG93AAA=");
    expect(result.items[0].name).toBe("Calendar");
    expect(result.items[0].isDefaultCalendar).toBe(true);
    expect(result.items[2].canEdit).toBe(false);
  });

  test("calendars.list sync handles empty response", () => {
    const result = executeCalendarsListSync({ response: { value: [] } });

    expect(result.items).toHaveLength(0);
  });

  test("files.list sync parses and normalizes OneDrive files", () => {
    const result = executeFilesListSync({ response: filesListFixture });

    expect(result.provider).toBe("microsoft-365");
    expect(result.operation).toBe("files.list");
    expect(result.items).toHaveLength(3);
    expect(result.items[0].id).toBe("onedrive:01ABCD1234XYZ567!123");
    expect(result.items[1].isFolder).toBe(true);
    expect(result.nextLink).toBe("https://graph.microsoft.com/v1.0/me/drive/root/children?$skipToken=abc");
  });

  test("files.list sync handles empty response", () => {
    const result = executeFilesListSync({ response: { value: [] } });

    expect(result.items).toHaveLength(0);
    expect(result.nextLink).toBeNull();
  });
});
