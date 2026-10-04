import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";

describe("google-workspace connector manifest", () => {
  test("manifest declares key, runtime, version, and auth", () => {
    expect(manifest.key).toBe("google-workspace");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.version).toBe("0.2.0");
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
    expect(manifest.operations["messages.untrash"].kind).toBe("action");
    expect(manifest.operations["messages.delete"].kind).toBe("action");
    expect(manifest.operations["messages.attachments.get"].kind).toBe("action");
    expect(manifest.operations["threads.list"].kind).toBe("action");
    expect(manifest.operations["threads.get"].kind).toBe("action");
    expect(manifest.operations["drafts.create"].kind).toBe("action");
    expect(manifest.operations["drafts.send"].kind).toBe("action");
    expect(manifest.operations["drafts.delete"].kind).toBe("action");
    expect(manifest.operations["labels.list"].kind).toBe("action");
    expect(manifest.operations["labels.create"].kind).toBe("action");
    expect(manifest.operations["labels.get"].kind).toBe("action");
    expect(manifest.operations["files.list"].kind).toBe("sync");
    expect(manifest.operations["drive.files.get"].kind).toBe("action");
    expect(manifest.operations["drive.files.create"].kind).toBe("action");
    expect(manifest.operations["drive.files.delete"].kind).toBe("action");
    expect(manifest.operations["drive.files.copy"].kind).toBe("action");
    expect(manifest.operations["drive.files.update"].kind).toBe("action");
    expect(manifest.operations["drive.permissions.create"].kind).toBe("action");
    expect(manifest.operations["drive.permissions.list"].kind).toBe("action");
    expect(manifest.operations["drive.permissions.delete"].kind).toBe("action");
    expect(manifest.operations["events.list"].kind).toBe("sync");
    expect(manifest.operations["calendar.events.create"].kind).toBe("action");
    expect(manifest.operations["calendar.events.update"].kind).toBe("action");
    expect(manifest.operations["calendar.events.delete"].kind).toBe("action");
    expect(manifest.operations["calendar.events.get"].kind).toBe("action");
    expect(manifest.operations["calendar.events.instances"].kind).toBe("action");
    expect(manifest.operations["calendar.events.move"].kind).toBe("action");
    expect(manifest.operations["calendar.calendars.list"].kind).toBe("action");
    expect(manifest.operations["calendar.calendars.get"].kind).toBe("action");
    expect(manifest.operations["calendar.acl.list"].kind).toBe("action");
    expect(manifest.operations["sheets.values.update"].kind).toBe("action");
    expect(manifest.operations["sheets.values.clear"].kind).toBe("action");
    expect(manifest.operations["sheets.values.batchUpdate"].kind).toBe("action");
    expect(manifest.operations["sheets.spreadsheets.create"].kind).toBe("action");
    expect(manifest.operations["sheets.spreadsheets.get"].kind).toBe("action");
    expect(manifest.operations["sheets.spreadsheets.batchUpdate"].kind).toBe("action");
    expect(manifest.operations["docs.create"].kind).toBe("action");
    expect(manifest.operations["docs.update"].kind).toBe("action");
    expect(manifest.operations["webhook.gmail.message"].kind).toBe("webhook");
    expect(manifest.operations["webhook.calendar.event"].kind).toBe("webhook");
    expect(manifest.operations["webhook.drive.change"].kind).toBe("webhook");
    expect(manifest.operations["healthcheck"].kind).toBe("action");
    expect(Object.keys(manifest.operations)).toHaveLength(57);
  });

  test("manifest has all new operations with required fields", () => {
    const newActions = [
      "messages.get", "messages.modify", "messages.trash", "messages.untrash", "messages.delete",
      "messages.attachments.get", "threads.list", "threads.get",
      "drafts.create", "drafts.send", "drafts.delete",
      "labels.list", "labels.create", "labels.get",
      "drive.files.get", "drive.files.create", "drive.files.delete", "drive.files.copy", "drive.files.update",
      "drive.permissions.create", "drive.permissions.list", "drive.permissions.delete",
      "calendar.events.create", "calendar.events.update", "calendar.events.delete",
      "calendar.events.get", "calendar.events.instances", "calendar.events.move",
      "calendar.calendars.list", "calendar.calendars.get", "calendar.acl.list",
      "sheets.values.update", "sheets.values.clear", "sheets.values.batchUpdate",
      "sheets.spreadsheets.create", "sheets.spreadsheets.get", "sheets.spreadsheets.batchUpdate",
      "docs.create", "docs.update",
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
      expect(s.outputSchema, `missing outputSchema on ${op}`).toBeDefined();
    }
  });

  test("permanent delete operations are classified destructive", () => {
    expect((manifest.operations["messages.delete"] as { sideEffect: string }).sideEffect).toBe("destructive");
    expect((manifest.operations["drive.permissions.delete"] as { sideEffect: string }).sideEffect).toBe("destructive");
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

  test("docs.get output schema declares the additive tab hierarchy", () => {
    const outputSchema = manifest.operations["docs.get"].outputSchema as Record<string, unknown>;
    const properties = outputSchema.properties as Record<string, unknown>;
    const tabs = properties.tabs as Record<string, unknown>;

    expect(tabs.type).toBe("array");
    expect((tabs.items as Record<string, unknown>).type).toBe("object");
  });
});
