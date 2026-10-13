import { describe, expect, it } from "bun:test";
import manifest from "../manifest.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;

const expectedKeys = [
  "bans.bulkBan", "bans.create", "bans.delete", "bans.get",
  "bans.list", "bot.getMe", "channels.create", "channels.createInvite",
  "channels.createWebhook", "channels.delete", "channels.deletePermission", "channels.editPermissions",
  "channels.follow", "channels.get", "channels.list", "channels.listInvites",
  "channels.listWebhooks", "channels.triggerTyping", "channels.update", "commands.editPermissions",
  "commands.getPermissions", "commands.listPermissions", "dm.open", "emojis.list",
  "entitlements.consume", "entitlements.deleteTest", "events.createExternal", "events.createVoice",
  "events.delete", "events.get", "events.list", "events.listUsers",
  "events.update", "gateway.get", "guild.beginPrune", "guild.deleteIntegration",
  "guild.get", "guild.getAuditLog", "guild.getPreview", "guild.getPruneCount",
  "guild.getVanityUrl", "guild.getWelcomeScreen", "guild.getWidget", "guild.getWidgetSettings",
  "guild.leave", "guild.listIntegrations", "guild.listVoiceRegions", "guild.listWebhooks",
  "guild.update", "guild.updateWelcomeScreen", "guild.updateWidget", "guilds.list",
  "healthcheck", "invites.get", "invites.list", "invites.revoke",
  "members.addRole", "members.clearTimeout", "members.get", "members.getMe",
  "members.kick", "members.list", "members.removeRole", "members.search",
  "members.timeout", "members.update", "members.updateMe", "messages.bulkDelete",
  "messages.create", "messages.crosspost", "messages.delete", "messages.edit",
  "messages.get", "messages.list", "messages.listPinned", "messages.pin",
  "messages.reply", "messages.send", "messages.unpin", "normalized.post.create",
  "oauth2.getAuthorization", "oauth2.getPublicKeys", "oauth2.getUserInfo", "reactions.add", "reactions.clear", "reactions.deleteEmoji",
  "reactions.list", "reactions.remove", "reactions.removeUser", "roles.create",
  "roles.delete", "roles.list", "roles.update", "stickers.listPacks",
  "subscriptions.get", "subscriptions.list", "templates.get", "threads.addMember",
  "threads.create", "threads.createFromMessage", "threads.getMember", "threads.join",
  "threads.leave", "threads.listActive", "threads.listArchived", "threads.listJoinedPrivateArchived",
  "threads.listMembers", "threads.listPrivateArchived", "threads.removeMember", "users.deleteMyRoleConnection",
  "users.get", "users.getMyGuildMember", "users.getMyRoleConnection", "users.listMyApplicationEntitlements", "users.listMyConnections",
  "users.updateMe", "users.updateMyRoleConnection", "webhook.channel_create", "webhook.guild_member_add",
  "webhook.message_create", "webhook.message_reaction_add"
];

const destructive = [
  "bans.bulkBan", "bans.create", "bans.delete", "channels.delete",
  "entitlements.deleteTest", "events.delete", "guild.beginPrune", "guild.deleteIntegration",
  "guild.leave", "invites.revoke", "members.kick", "messages.bulkDelete",
  "roles.delete", "users.deleteMyRoleConnection"
];

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
      expect(operation.timeoutMs as number).toBeGreaterThan(0);
      expect(operation.maxInputBytes as number).toBeGreaterThan(0);
      expect(operation.maxResponseBytes as number).toBeGreaterThan(0);
      if (operation.kind === "webhook") {
        expect(key.startsWith("webhook.")).toBe(true);
        continue;
      }
      expect(operation.kind, key).toBe("action");
      expect(String(operation.title ?? "").length, key).toBeGreaterThan(0);
      expect(String(operation.description ?? "").length, key).toBeGreaterThan(0);
      expect((operation.inputSchema as Record<string, unknown>).type, key).toBe("object");
      expect((operation.outputSchema as Record<string, unknown>).type, key).toBe("object");
      expect(["read", "write", "destructive"], key).toContain(operation.sideEffect as string);
      expect(operation.request, `${key} must declare a request block`).toBeDefined();
    }
  });

  it("declares Discord gateway webhook operations without request blocks", () => {
    for (const key of ["webhook.message_create", "webhook.message_reaction_add", "webhook.guild_member_add", "webhook.channel_create"]) {
      expect(operations[key].kind).toBe("webhook");
      expect(operations[key].request).toBeUndefined();
    }
  });

  it("bumps the connector version above the origin manifest", () => {
    expect(manifest.version).toBe("0.4.1");
  });

  it("keeps every request inside discord.com", () => {
    for (const operation of Object.values(operations)) {
      if (operation.kind === "webhook") continue;
      const request = operation.request as Record<string, unknown>;
      const baseUrl = String(request.baseUrl ?? manifest.http.baseUrl);
      expect(new URL(baseUrl).hostname).toBe("discord.com");
    }
    expect(manifest.network.allowedHosts).toEqual(["discord.com"]);
  });

  it("only interpolates path placeholders that the operation requires", () => {
    for (const [key, operation] of Object.entries(operations)) {
      if (operation.kind === "webhook") continue;
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
      if (operation.kind === "webhook") continue;
      const query = ((operation.request as Record<string, unknown>).query ?? {}) as Record<string, string>;
      expect(Object.values(query).join(" ")).not.toContain("botToken");
    }
  });

  it("keeps GET and DELETE body-less and sets JSON Content-Type only when a body is declared", () => {
    expect(manifest.http.headers?.["Content-Type"]).toBeUndefined();
    expect(manifest.http.headers?.["content-type"]).toBeUndefined();
    for (const [key, operation] of Object.entries(operations)) {
      if (operation.kind === "webhook") continue;
      const request = operation.request as Record<string, unknown>;
      const method = String(request.method);
      const headers = (request.headers ?? {}) as Record<string, string>;
      const contentType = Object.entries(headers).find(([name]) => name.toLowerCase() === "content-type")?.[1];
      if (method === "GET" || method === "DELETE") {
        expect(request.body, key).toBeUndefined();
        expect(contentType, key).toBeUndefined();
      } else if (request.body !== undefined) {
        expect(contentType, key).toBe("application/json");
      } else {
        expect(contentType, key).toBeUndefined();
      }
    }
  });

  it("keeps webhook sideEffect read", () => {
    for (const [key, operation] of Object.entries(operations)) {
      if (operation.kind !== "webhook") continue;
      expect(operation.sideEffect, key).toBe("read");
    }
  });
});
