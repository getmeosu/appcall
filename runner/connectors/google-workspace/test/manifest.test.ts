import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";

describe("google-workspace connector manifest", () => {
  test("manifest declares key, runtime, and auth", () => {
    expect(manifest.key).toBe("google-workspace");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.auth.type).toBe("oauth2");
    expect(manifest.auth.scopes).toContain("https://www.googleapis.com/auth/gmail.readonly");
    expect(manifest.auth.scopes).toContain("https://www.googleapis.com/auth/gmail.send");
    expect(manifest.auth.scopes).toContain("https://www.googleapis.com/auth/drive.readonly");
    expect(manifest.auth.scopes).toContain("https://www.googleapis.com/auth/calendar.readonly");
  });

  test("manifest declares network controls", () => {
    expect(manifest.network.allowedHosts).toContain("gmail.googleapis.com");
    expect(manifest.network.allowedHosts).toContain("www.googleapis.com");
  });

  test("manifest declares sync and action operations", () => {
    expect(manifest.operations["messages.list"].kind).toBe("sync");
    expect(manifest.operations["messages.send"].kind).toBe("action");
    expect(manifest.operations["messages.get"].kind).toBe("action");
    expect(manifest.operations["messages.modify"].kind).toBe("action");
    expect(manifest.operations["messages.trash"].kind).toBe("action");
    expect(manifest.operations["drafts.create"].kind).toBe("action");
    expect(manifest.operations["labels.list"].kind).toBe("action");
    expect(manifest.operations["files.list"].kind).toBe("sync");
    expect(manifest.operations["drive.files.get"].kind).toBe("action");
    expect(manifest.operations["drive.files.create"].kind).toBe("action");
    expect(manifest.operations["drive.files.delete"].kind).toBe("action");
    expect(manifest.operations["drive.permissions.create"].kind).toBe("action");
    expect(manifest.operations["events.list"].kind).toBe("sync");
    expect(manifest.operations["calendar.events.create"].kind).toBe("action");
    expect(manifest.operations["calendar.events.update"].kind).toBe("action");
    expect(manifest.operations["calendar.events.delete"].kind).toBe("action");
    expect(manifest.operations["calendar.events.get"].kind).toBe("action");
    expect(manifest.operations["calendar.calendars.list"].kind).toBe("action");
    expect(manifest.operations["sheets.values.update"].kind).toBe("action");
    expect(manifest.operations["sheets.values.clear"].kind).toBe("action");
    expect(manifest.operations["sheets.spreadsheets.create"].kind).toBe("action");
    expect(manifest.operations["sheets.spreadsheets.batchUpdate"].kind).toBe("action");
    expect(manifest.operations["docs.create"].kind).toBe("action");
    expect(manifest.operations["healthcheck"].kind).toBe("action");
  });

  test("manifest has all new operations with required fields", () => {
    const newActions = [
      "messages.get", "messages.modify", "messages.trash", "drafts.create", "labels.list",
      "drive.files.get", "drive.files.create", "drive.files.delete", "drive.permissions.create",
      "calendar.events.create", "calendar.events.update", "calendar.events.delete",
      "calendar.events.get", "calendar.calendars.list",
      "sheets.values.update", "sheets.values.clear", "sheets.spreadsheets.create", "sheets.spreadsheets.batchUpdate",
      "docs.create",
    ];
    for (const op of newActions) {
      const s = manifest.operations[op as keyof typeof manifest.operations] as Record<string, unknown>;
      expect(s, `missing op: ${op}`).toBeDefined();
      expect(typeof s.title, `missing title on ${op}`).toBe("string");
      expect(String(s.title).length > 0, `empty title on ${op}`).toBe(true);
      expect(typeof s.description, `missing description on ${op}`).toBe("string");
      expect(String(s.description).length > 0, `empty description on ${op}`).toBe(true);
      const schema = s.inputSchema as Record<string, unknown>;
      expect(schema, `missing inputSchema on ${op}`).toBeDefined();
      expect(schema.type, `inputSchema not object on ${op}`).toBe("object");
    }
  });

  test("manifest declares models", () => {
    expect(manifest.models).toContain("message");
    expect(manifest.models).toContain("file");
    expect(manifest.models).toContain("calendar_event");
  });

  test("manifest has timeout and size limits on all operations", () => {
    for (const [op, spec] of Object.entries(manifest.operations)) {
      const s = spec as Record<string, unknown>;
      expect(typeof s.timeoutMs).toBe("number");
      expect((s.timeoutMs as number) > 0).toBe(true);
      expect(typeof s.maxInputBytes).toBe("number");
      expect(typeof s.maxResponseBytes).toBe("number");
    }
  });
});
