import { describe, expect, it } from "bun:test";
import manifest from "../manifest.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;

const expectedKeys = [
  "bans.create", "bans.delete", "bans.list",
  "bot.getMe",
  "channels.create", "channels.delete", "channels.get", "channels.list", "channels.update",
  "dm.open",
  "emojis.list",
  "events.createExternal", "events.createVoice", "events.delete", "events.list", "events.update",
  "guild.get", "guilds.list",
  "healthcheck",
  "invites.list", "invites.revoke",
  "members.addRole", "members.clearTimeout", "members.get", "members.kick", "members.list", "members.removeRole", "members.search", "members.timeout",
  "messages.bulkDelete", "messages.create", "messages.delete", "messages.edit", "messages.get", "messages.list", "messages.listPinned", "messages.pin", "messages.reply", "messages.send", "messages.unpin",
  "normalized.post.create",
  "reactions.add", "reactions.clear", "reactions.list", "reactions.remove", "reactions.removeUser",
  "roles.create", "roles.delete", "roles.list", "roles.update",
  "threads.addMember", "threads.create", "threads.createFromMessage", "threads.join", "threads.leave", "threads.listActive", "threads.listArchived",
  "users.get",
];

const destructive = ["bans.create", "bans.delete", "channels.delete", "events.delete", "invites.revoke", "members.kick", "messages.bulkDelete", "roles.delete"];

describe("discord manifest", () => {
  it("declares exactly the community-manager operation set", () => {
    expect(Object.keys(operations).sort()).toEqual(expectedKeys);
  });

  it("classifies every irreversible action as destructive and nothing else", () => {
    const actual = Object.entries(operations).filter(([, op]) => op.sideEffect === "destructive").map(([key]) => key).sort();
    expect(actual).toEqual(destructive);
  });

  it("gives every action the limits and tool schema the MCP gateway requires", () => {
    for (const [key, operation] of Object.entries(operations)) {
      expect(operation.kind, key).toBe("action");
      expect(operation.timeoutMs as number).toBeGreaterThan(0);
      expect(operation.maxInputBytes as number).toBeGreaterThan(0);
      expect(operation.maxResponseBytes as number).toBeGreaterThan(0);
      expect(String(operation.title ?? "").length, key).toBeGreaterThan(0);
      expect(String(operation.description ?? "").length, key).toBeGreaterThan(0);
      expect((operation.inputSchema as Record<string, unknown>).type, key).toBe("object");
      expect((operation.outputSchema as Record<string, unknown>).type, key).toBe("object");
      expect(["read", "write", "destructive"], key).toContain(operation.sideEffect as string);
      expect(operation.request, `${key} must declare a request block`).toBeDefined();
    }
  });

  it("keeps every request inside discord.com", () => {
    for (const operation of Object.values(operations)) {
      const request = operation.request as Record<string, unknown>;
      const baseUrl = String(request.baseUrl ?? manifest.http.baseUrl);
      expect(new URL(baseUrl).hostname).toBe("discord.com");
    }
    expect(manifest.network.allowedHosts).toEqual(["discord.com"]);
  });

  it("only interpolates path placeholders that the operation requires", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as Record<string, unknown>;
      const schema = operation.inputSchema as { required?: string[] };
      const placeholders = [...String(request.path ?? "").matchAll(/\{\{\s*([A-Za-z0-9_.$-]+)\s*\}\}/g)].map((m) => m[1]);
      for (const placeholder of placeholders) {
        expect(schema.required ?? [], `${key} path uses {{${placeholder}}}`).toContain(placeholder);
      }
    }
  });

  it("carries setup guidance so the product rendering the form needs no copy of its own", () => {
    const setup = manifest.auth.setup as { help?: string; docsUrl?: string };
    expect(String(setup.help ?? "")).toContain("Server Members");
    expect(String(setup.help ?? "")).toContain("Message Content");
    expect(String(setup.help ?? "")).toContain("Reset Token");
    // Clients render this as a link, so it must be https and no other scheme.
    expect(new URL(String(setup.docsUrl)).protocol).toBe("https:");
    expect(new URL(String(setup.docsUrl)).hostname).toBe("discord.com");
  });

  it("never makes a mutation with the bot token in a query string", () => {
    expect(manifest.http.auth.in).toBe("header");
    for (const operation of Object.values(operations)) {
      const query = ((operation.request as Record<string, unknown>).query ?? {}) as Record<string, string>;
      expect(Object.values(query).join(" ")).not.toContain("botToken");
    }
  });
});
