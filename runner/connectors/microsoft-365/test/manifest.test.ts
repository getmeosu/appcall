import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";

describe("microsoft-365 connector manifest", () => {
  test("manifest declares key, runtime, and auth", () => {
    expect(manifest.key).toBe("microsoft-365");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.auth.type).toBe("oauth2");
    expect(manifest.auth.scopes).toContain("Mail.Read");
    expect(manifest.auth.scopes).toContain("Mail.ReadWrite");
    expect(manifest.auth.scopes).toContain("Calendars.Read");
    expect(manifest.auth.scopes).toContain("Calendars.ReadWrite");
    expect(manifest.auth.scopes).toContain("Files.Read.All");
    expect(manifest.auth.scopes).toContain("User.Read.All");
    expect(manifest.auth.scopes).toContain("Contacts.Read");
    expect(manifest.auth.scopes).toContain("Contacts.ReadWrite");
  });

  test("manifest declares network controls", () => {
    expect(manifest.network.allowedHosts).toContain("graph.microsoft.com");
  });

  test("manifest declares sync and action operations", () => {
    expect(manifest.operations["messages.list"].kind).toBe("sync");
    expect(manifest.operations["messages.send"].kind).toBe("action");
    expect(manifest.operations["events.list"].kind).toBe("sync");
    expect(manifest.operations["calendars.list"].kind).toBe("sync");
    expect(manifest.operations["files.list"].kind).toBe("sync");
    expect(manifest.operations["healthcheck"].kind).toBe("action");
  });

  test("manifest declares new action operations", () => {
    expect(manifest.operations["messages.get"].kind).toBe("action");
    expect(manifest.operations["messages.reply"].kind).toBe("action");
    expect(manifest.operations["messages.move"].kind).toBe("action");
    expect(manifest.operations["messages.delete"].kind).toBe("action");
    expect(manifest.operations["mailFolders.list"].kind).toBe("action");
    expect(manifest.operations["events.create"].kind).toBe("action");
    expect(manifest.operations["events.update"].kind).toBe("action");
    expect(manifest.operations["events.delete"].kind).toBe("action");
    expect(manifest.operations["events.get"].kind).toBe("action");
    expect(manifest.operations["drive.items.get"].kind).toBe("action");
    expect(manifest.operations["drive.items.delete"].kind).toBe("action");
    expect(manifest.operations["drive.items.copy"].kind).toBe("action");
    expect(manifest.operations["contacts.create"].kind).toBe("action");
    expect(manifest.operations["contacts.list"].kind).toBe("action");
  });

  test("all new action ops have non-empty title and description", () => {
    const newActionOps = [
      "messages.get", "messages.reply", "messages.move", "messages.delete",
      "mailFolders.list", "events.create", "events.update", "events.delete", "events.get",
      "drive.items.get", "drive.items.delete", "drive.items.copy",
      "contacts.create", "contacts.list",
    ];
    for (const op of newActionOps) {
      const spec = manifest.operations[op] as Record<string, unknown>;
      expect(typeof spec.title).toBe("string");
      expect((spec.title as string).length).toBeGreaterThan(0);
      expect(typeof spec.description).toBe("string");
      expect((spec.description as string).length).toBeGreaterThan(0);
    }
  });

  test("all action ops have object inputSchema with type object", () => {
    for (const [op, spec] of Object.entries(manifest.operations)) {
      const s = spec as Record<string, unknown>;
      if (s.kind !== "action") continue;
      const schema = s.inputSchema as Record<string, unknown> | undefined;
      expect(schema).toBeDefined();
      expect(schema?.type).toBe("object");
    }
  });

  test("manifest declares models", () => {
    expect(manifest.models).toContain("message");
    expect(manifest.models).toContain("calendar_event");
    expect(manifest.models).toContain("calendar");
    expect(manifest.models).toContain("drive_file");
    expect(manifest.models).toContain("contact");
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
