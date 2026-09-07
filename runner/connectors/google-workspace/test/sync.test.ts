import { describe, expect, test } from "bun:test";
import messagesListFixture from "../fixtures/messages_list.json";
import filesListFixture from "../fixtures/files_list.json";
import eventsListFixture from "../fixtures/events_list.json";
import {
  executeMessagesListSync,
  executeFilesListSync,
  executeEventsListSync,
} from "../src/sync";

describe("google-workspace sync operations", () => {
  test("messages.list sync parses and normalizes Gmail messages", () => {
    const result = executeMessagesListSync({ response: messagesListFixture });

    expect(result.provider).toBe("google-workspace");
    expect(result.operation).toBe("messages.list");
    expect(result.items).toHaveLength(2);
    expect(result.items[0].id).toBe("gmail:18e4a3c29a8d7a7e");
    expect(result.items[0].providerMessageId).toBe("18e4a3c29a8d7a7e");
    expect(result.items[1].providerMessageId).toBe("18e4a3c29a8d7a7f");
    expect(result.cursor).toBe("page_token_abc123");
  });

  test("messages.list sync handles empty response", () => {
    const result = executeMessagesListSync({ response: { messages: [] } });

    expect(result.items).toHaveLength(0);
    expect(result.cursor).toBeNull();
  });

  test("files.list sync parses and normalizes Drive files, filtering trashed", () => {
    const result = executeFilesListSync({ response: filesListFixture });

    expect(result.provider).toBe("google-workspace");
    expect(result.operation).toBe("files.list");
    expect(result.items).toHaveLength(2);
    expect(result.items[0].id).toBe("drive:1a2b3c4d5e6f");
    expect(result.items[1].id).toBe("drive:2b3c4d5e6f7g");
    expect(result.cursor).toBe("drive_page_token_1");
  });

  test("events.list sync parses and normalizes Calendar events, filtering cancelled", () => {
    const result = executeEventsListSync({ response: eventsListFixture });

    expect(result.provider).toBe("google-workspace");
    expect(result.operation).toBe("events.list");
    expect(result.items).toHaveLength(2);
    expect(result.items[0].id).toBe("gcal:ev1a2b3c4d5e6f");
    expect(result.items[0].summary).toBe("Team Standup");
    expect(result.items[1].id).toBe("gcal:ev2b3c4d5e6f7g");
    expect(result.cursor).toBe("cal_page_token_1");
  });

  test("events.list sync handles empty response", () => {
    const result = executeEventsListSync({ response: { items: [] } });

    expect(result.items).toHaveLength(0);
    expect(result.cursor).toBeNull();
  });
});
