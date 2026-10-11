import { describe, expect, it } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import eventFixture from "../fixtures/event.json";
import guildFixture from "../fixtures/guild.json";
import inviteFixture from "../fixtures/invite.json";
import memberFixture from "../fixtures/member.json";
import messageFixture from "../fixtures/message.json";
import threadFixture from "../fixtures/thread.json";
import { mockFetch, jsonBody as body, auditReason as reason, authHeader as auth } from "./support";

const { actions } = compileDeclarativeConnector(manifest as never);
const creds = { botToken: "tok_TEST" };
const header = (calls: { init?: RequestInit }[]) => new Headers(calls[0]!.init?.headers);

describe("http envelope", () => {
  it("sends Bot auth and omits Content-Type on GET", async () => {
    const { calls, fetchFn } = mockFetch(inviteFixture);
    await actions["invites.get"]!({ ...creds, code: "abc123", fetch: fetchFn });
    expect(auth(calls)).toBe("Bot tok_TEST");
    expect(calls[0]!.init?.body).toBeUndefined();
    expect(header(calls).get("content-type")).toBeNull();
  });

  it("sends JSON Content-Type only when a body is present", async () => {
    const send = mockFetch(messageFixture);
    await actions["messages.send"]!({ ...creds, channelId: "1300000000000000001", content: "hi", fetch: send.fetchFn });
    expect(header(send.calls).get("content-type")).toBe("application/json");

    const pin = mockFetch("", 204);
    await actions["messages.pin"]!({ ...creds, channelId: "1300000000000000001", messageId: "1400000000000000001", fetch: pin.fetchFn });
    expect(pin.calls[0]!.init?.body).toBeUndefined();
    expect(header(pin.calls).get("content-type")).toBeNull();
  });
});

describe("channels depth", () => {
  it("lists and creates channel invites", async () => {
    const list = mockFetch([inviteFixture]);
    const listed = (await actions["channels.listInvites"]!({ ...creds, channelId: "1300000000000000001", fetch: list.fetchFn })) as Record<string, unknown>;
    expect(list.calls[0]!.url).toBe("https://discord.com/api/v10/channels/1300000000000000001/invites");
    expect(listed.invites).toEqual([inviteFixture]);

    const create = mockFetch(inviteFixture, 200);
    await actions["channels.createInvite"]!({
      ...creds, channelId: "1300000000000000001", maxAge: 3600, maxUses: 1, temporary: true, unique: true, reason: "onboarding", fetch: create.fetchFn,
    });
    expect(create.calls[0]!.init?.method).toBe("POST");
    expect(body(create.calls)).toEqual({ max_age: 3600, max_uses: 1, temporary: true, unique: true });
    expect(reason(create.calls)).toBe("onboarding");
    expect(header(create.calls).get("content-type")).toBe("application/json");
  });

  it("edits and deletes permission overwrites without a GET body", async () => {
    const edit = mockFetch("", 204);
    await actions["channels.editPermissions"]!({
      ...creds, channelId: "1300000000000000001", overwriteId: "1600000000000000002", type: 0, allow: "1024", deny: "0", fetch: edit.fetchFn,
    });
    expect(edit.calls[0]!.url).toBe("https://discord.com/api/v10/channels/1300000000000000001/permissions/1600000000000000002");
    expect(edit.calls[0]!.init?.method).toBe("PUT");
    expect(body(edit.calls)).toEqual({ type: 0, allow: "1024", deny: "0" });

    const del = mockFetch("", 204);
    const result = (await actions["channels.deletePermission"]!({
      ...creds, channelId: "1300000000000000001", overwriteId: "1600000000000000002", fetch: del.fetchFn,
    })) as Record<string, unknown>;
    expect(del.calls[0]!.init?.method).toBe("DELETE");
    expect(del.calls[0]!.init?.body).toBeUndefined();
    expect(header(del.calls).get("content-type")).toBeNull();
    expect(result.deleted).toBe(true);
  });

  it("triggers typing with no body and lists or creates webhooks", async () => {
    const typing = mockFetch("", 204);
    const typed = (await actions["channels.triggerTyping"]!({ ...creds, channelId: "1300000000000000001", fetch: typing.fetchFn })) as Record<string, unknown>;
    expect(typing.calls[0]!.url).toBe("https://discord.com/api/v10/channels/1300000000000000001/typing");
    expect(typing.calls[0]!.init?.method).toBe("POST");
    expect(typing.calls[0]!.init?.body).toBeUndefined();
    expect(header(typing.calls).get("content-type")).toBeNull();
    expect(typed.typing).toBe(true);

    const hooks = mockFetch([{ id: "1", name: "mod-log", channel_id: "1300000000000000001" }]);
    const listed = (await actions["channels.listWebhooks"]!({ ...creds, channelId: "1300000000000000001", fetch: hooks.fetchFn })) as Record<string, unknown>;
    expect(hooks.calls[0]!.url).toBe("https://discord.com/api/v10/channels/1300000000000000001/webhooks");
    expect(listed.webhooks).toHaveLength(1);

    const create = mockFetch({ id: "1", name: "alerts" }, 200);
    await actions["channels.createWebhook"]!({ ...creds, channelId: "1300000000000000001", name: "alerts", fetch: create.fetchFn });
    expect(body(create.calls)).toEqual({ name: "alerts" });
  });

  it("follows an announcement channel", async () => {
    const { calls, fetchFn } = mockFetch({ channel_id: "1300000000000000001", webhook_id: "1" });
    const result = (await actions["channels.follow"]!({
      ...creds, channelId: "1300000000000000005", webhookChannelId: "1300000000000000001", fetch: fetchFn,
    })) as Record<string, unknown>;
    expect(calls[0]!.url).toBe("https://discord.com/api/v10/channels/1300000000000000005/followers");
    expect(body(calls)).toEqual({ webhook_channel_id: "1300000000000000001" });
    expect(result.followed).toEqual({ channel_id: "1300000000000000001", webhook_id: "1" });
  });
});

describe("messages and threads depth", () => {
  it("crossposts an announcement and deletes one emoji's reactions", async () => {
    const cross = mockFetch(messageFixture);
    await actions["messages.crosspost"]!({ ...creds, channelId: "1300000000000000005", messageId: "1400000000000000001", fetch: cross.fetchFn });
    expect(cross.calls[0]!.url).toBe("https://discord.com/api/v10/channels/1300000000000000005/messages/1400000000000000001/crosspost");
    expect(cross.calls[0]!.init?.method).toBe("POST");
    expect(cross.calls[0]!.init?.body).toBeUndefined();

    const clear = mockFetch("", 204);
    await actions["reactions.deleteEmoji"]!({
      ...creds, channelId: "1300000000000000001", messageId: "1400000000000000001", emoji: "👍", fetch: clear.fetchFn,
    });
    expect(clear.calls[0]!.url).toBe("https://discord.com/api/v10/channels/1300000000000000001/messages/1400000000000000001/reactions/%F0%9F%91%8D");
    expect(clear.calls[0]!.init?.method).toBe("DELETE");
  });

  it("lists private archived threads and thread members", async () => {
    const archived = mockFetch({ threads: [threadFixture], has_more: false });
    const listed = (await actions["threads.listPrivateArchived"]!({
      ...creds, channelId: "1300000000000000001", limit: 5, fetch: archived.fetchFn,
    })) as Record<string, unknown>;
    expect(archived.calls[0]!.url).toBe("https://discord.com/api/v10/channels/1300000000000000001/threads/archived/private?limit=5");
    expect(listed.threads).toEqual([threadFixture]);
    expect(listed.hasMore).toBe(false);

    const joined = mockFetch({ threads: [threadFixture], has_more: true });
    await actions["threads.listJoinedPrivateArchived"]!({ ...creds, channelId: "1300000000000000001", fetch: joined.fetchFn });
    expect(joined.calls[0]!.url).toBe("https://discord.com/api/v10/channels/1300000000000000001/users/@me/threads/archived/private");

    const member = mockFetch({ id: "1500000000000000001", user_id: "900000000000000002" });
    await actions["threads.getMember"]!({ ...creds, threadId: "1500000000000000001", userId: "900000000000000002", fetch: member.fetchFn });
    expect(member.calls[0]!.url).toBe("https://discord.com/api/v10/channels/1500000000000000001/thread-members/900000000000000002");

    const members = mockFetch([{ id: "1500000000000000001", user_id: "900000000000000002" }]);
    await actions["threads.listMembers"]!({ ...creds, threadId: "1500000000000000001", fetch: members.fetchFn });
    expect(members.calls[0]!.url).toBe("https://discord.com/api/v10/channels/1500000000000000001/thread-members");

    const remove = mockFetch("", 204);
    const result = (await actions["threads.removeMember"]!({
      ...creds, threadId: "1500000000000000001", userId: "900000000000000002", fetch: remove.fetchFn,
    })) as Record<string, unknown>;
    expect(remove.calls[0]!.init?.method).toBe("DELETE");
    expect(result.removed).toBe(true);
  });
});

describe("guilds depth", () => {
  it("updates a guild and reads preview, vanity, and widget", async () => {
    const update = mockFetch(guildFixture);
    await actions["guild.update"]!({ ...creds, guildId: "1100000000000000001", name: "Meosu", verificationLevel: 2, fetch: update.fetchFn });
    expect(update.calls[0]!.init?.method).toBe("PATCH");
    expect(body(update.calls)).toEqual({ name: "Meosu", verification_level: 2 });

    const preview = mockFetch(guildFixture);
    await actions["guild.getPreview"]!({ ...creds, guildId: "1100000000000000001", fetch: preview.fetchFn });
    expect(preview.calls[0]!.url).toBe("https://discord.com/api/v10/guilds/1100000000000000001/preview");

    const vanity = mockFetch({ code: "meosu", uses: 12 });
    const got = (await actions["guild.getVanityUrl"]!({ ...creds, guildId: "1100000000000000001", fetch: vanity.fetchFn })) as Record<string, unknown>;
    expect(vanity.calls[0]!.url).toBe("https://discord.com/api/v10/guilds/1100000000000000001/vanity-url");
    expect(got.vanity).toEqual({ code: "meosu", uses: 12 });

    const widget = mockFetch({ id: "1100000000000000001", name: "Meosu", presence_count: 3 });
    await actions["guild.getWidget"]!({ ...creds, guildId: "1100000000000000001", fetch: widget.fetchFn });
    expect(widget.calls[0]!.url).toBe("https://discord.com/api/v10/guilds/1100000000000000001/widget.json");

    const settings = mockFetch({ enabled: true, channel_id: "1300000000000000001" });
    await actions["guild.getWidgetSettings"]!({ ...creds, guildId: "1100000000000000001", fetch: settings.fetchFn });
    expect(settings.calls[0]!.url).toBe("https://discord.com/api/v10/guilds/1100000000000000001/widget");

    const patch = mockFetch({ enabled: false, channel_id: null });
    await actions["guild.updateWidget"]!({ ...creds, guildId: "1100000000000000001", enabled: false, fetch: patch.fetchFn });
    expect(body(patch.calls)).toEqual({ enabled: false });
  });

  it("reads and updates the welcome screen, audit log, integrations, and prune", async () => {
    const screen = mockFetch({ description: "hi", welcome_channels: [] });
    await actions["guild.getWelcomeScreen"]!({ ...creds, guildId: "1100000000000000001", fetch: screen.fetchFn });
    expect(screen.calls[0]!.url).toBe("https://discord.com/api/v10/guilds/1100000000000000001/welcome-screen");

    const update = mockFetch({ description: "welcome", welcome_channels: [] });
    await actions["guild.updateWelcomeScreen"]!({ ...creds, guildId: "1100000000000000001", enabled: true, description: "welcome", fetch: update.fetchFn });
    expect(body(update.calls)).toEqual({ enabled: true, description: "welcome" });

    const audit = mockFetch({ audit_log_entries: [], users: [] });
    await actions["guild.getAuditLog"]!({ ...creds, guildId: "1100000000000000001", limit: 10, fetch: audit.fetchFn });
    expect(audit.calls[0]!.url).toBe("https://discord.com/api/v10/guilds/1100000000000000001/audit-logs?limit=10");

    const integrations = mockFetch([{ id: "9", name: "youtube", type: "youtube" }]);
    await actions["guild.listIntegrations"]!({ ...creds, guildId: "1100000000000000001", fetch: integrations.fetchFn });
    expect(integrations.calls[0]!.url).toBe("https://discord.com/api/v10/guilds/1100000000000000001/integrations");

    const del = mockFetch("", 204);
    await actions["guild.deleteIntegration"]!({ ...creds, guildId: "1100000000000000001", integrationId: "9", reason: "unused", fetch: del.fetchFn });
    expect(del.calls[0]!.init?.method).toBe("DELETE");
    expect(reason(del.calls)).toBe("unused");

    const count = mockFetch({ pruned: 4 });
    const preview = (await actions["guild.getPruneCount"]!({ ...creds, guildId: "1100000000000000001", days: 7, fetch: count.fetchFn })) as Record<string, unknown>;
    expect(count.calls[0]!.url).toBe("https://discord.com/api/v10/guilds/1100000000000000001/prune?days=7");
    expect(preview.pruned).toBe(4);

    const prune = mockFetch({ pruned: 4 });
    await actions["guild.beginPrune"]!({ ...creds, guildId: "1100000000000000001", days: 14, computePruneCount: true, fetch: prune.fetchFn });
    expect(body(prune.calls)).toEqual({ days: 14, compute_prune_count: true });
  });

  it("lists voice regions and guild webhooks, then leaves", async () => {
    const regions = mockFetch([{ id: "us-east", name: "US East" }]);
    await actions["guild.listVoiceRegions"]!({ ...creds, guildId: "1100000000000000001", fetch: regions.fetchFn });
    expect(regions.calls[0]!.url).toBe("https://discord.com/api/v10/guilds/1100000000000000001/regions");

    const hooks = mockFetch([{ id: "1", name: "mod-log" }]);
    await actions["guild.listWebhooks"]!({ ...creds, guildId: "1100000000000000001", fetch: hooks.fetchFn });
    expect(hooks.calls[0]!.url).toBe("https://discord.com/api/v10/guilds/1100000000000000001/webhooks");

    const leave = mockFetch("", 204);
    const result = (await actions["guild.leave"]!({ ...creds, guildId: "1100000000000000001", fetch: leave.fetchFn })) as Record<string, unknown>;
    expect(leave.calls[0]!.url).toBe("https://discord.com/api/v10/users/@me/guilds/1100000000000000001");
    expect(leave.calls[0]!.init?.method).toBe("DELETE");
    expect(result.left).toBe(true);
  });
});

describe("members, bans, events, invites depth", () => {
  it("updates a member, the current member, and reads @me", async () => {
    const update = mockFetch(memberFixture);
    await actions["members.update"]!({
      ...creds, guildId: "1100000000000000001", userId: "900000000000000002", nick: "ana", mute: false, fetch: update.fetchFn,
    });
    expect(update.calls[0]!.init?.method).toBe("PATCH");
    expect(body(update.calls)).toEqual({ nick: "ana", mute: false });

    const me = mockFetch(memberFixture);
    await actions["members.updateMe"]!({ ...creds, guildId: "1100000000000000001", nick: "bot", fetch: me.fetchFn });
    expect(me.calls[0]!.url).toBe("https://discord.com/api/v10/guilds/1100000000000000001/members/@me");
    expect(body(me.calls)).toEqual({ nick: "bot" });

    const got = mockFetch(memberFixture);
    const result = (await actions["members.getMe"]!({ ...creds, guildId: "1100000000000000001", fetch: got.fetchFn })) as Record<string, unknown>;
    expect(got.calls[0]!.url).toBe("https://discord.com/api/v10/guilds/1100000000000000001/members/@me");
    expect(result.member).toEqual(memberFixture);
  });

  it("gets one ban and bulk-bans", async () => {
    const ban = mockFetch({ reason: "Rule 1", user: { id: "900000000000000009" } });
    await actions["bans.get"]!({ ...creds, guildId: "1100000000000000001", userId: "900000000000000009", fetch: ban.fetchFn });
    expect(ban.calls[0]!.url).toBe("https://discord.com/api/v10/guilds/1100000000000000001/bans/900000000000000009");

    const bulk = mockFetch({ banned_users: ["900000000000000009"], failed_users: [] });
    await actions["bans.bulkBan"]!({
      ...creds, guildId: "1100000000000000001", userIds: ["900000000000000009"], deleteMessageSeconds: 0, fetch: bulk.fetchFn,
    });
    expect(bulk.calls[0]!.url).toBe("https://discord.com/api/v10/guilds/1100000000000000001/bulk-ban");
    expect(body(bulk.calls)).toEqual({ user_ids: ["900000000000000009"], delete_message_seconds: 0 });
  });

  it("gets a scheduled event and its users", async () => {
    const event = mockFetch(eventFixture);
    await actions["events.get"]!({ ...creds, guildId: "1100000000000000001", eventId: "1800000000000000001", withUserCount: true, fetch: event.fetchFn });
    expect(event.calls[0]!.url).toBe("https://discord.com/api/v10/guilds/1100000000000000001/scheduled-events/1800000000000000001?with_user_count=true");

    const users = mockFetch([{ user: { id: "900000000000000002" } }]);
    await actions["events.listUsers"]!({ ...creds, guildId: "1100000000000000001", eventId: "1800000000000000001", limit: 20, fetch: users.fetchFn });
    expect(users.calls[0]!.url).toBe("https://discord.com/api/v10/guilds/1100000000000000001/scheduled-events/1800000000000000001/users?limit=20");
  });

  it("resolves an invite with counts", async () => {
    const { calls, fetchFn } = mockFetch(inviteFixture);
    const result = (await actions["invites.get"]!({ ...creds, code: "abc123", withCounts: true, fetch: fetchFn })) as Record<string, unknown>;
    expect(calls[0]!.url).toBe("https://discord.com/api/v10/invites/abc123?with_counts=true");
    expect(result.invite).toEqual(inviteFixture);
  });

  it("requires path ids before calling the provider", () => {
    expect(() => actions["channels.follow"]!({ ...creds, webhookChannelId: "1" })).toThrow("channelId is required");
    expect(() => actions["guild.leave"]!({ ...creds })).toThrow("guildId is required");
  });
});

describe("compile coverage", () => {
  it("compiles every new action", () => {
    for (const key of [
      "channels.listInvites", "channels.createInvite", "channels.editPermissions", "channels.deletePermission",
      "channels.triggerTyping", "channels.listWebhooks", "channels.createWebhook", "channels.follow",
      "threads.listPrivateArchived", "threads.listJoinedPrivateArchived", "threads.getMember", "threads.listMembers",
      "threads.removeMember", "messages.crosspost", "reactions.deleteEmoji", "guild.update", "guild.getPreview",
      "guild.getVanityUrl", "guild.getWidget", "guild.getWidgetSettings", "guild.updateWidget", "guild.getWelcomeScreen",
      "guild.updateWelcomeScreen", "guild.getAuditLog", "guild.listIntegrations", "guild.deleteIntegration",
      "guild.getPruneCount", "guild.beginPrune", "guild.listVoiceRegions", "guild.listWebhooks", "guild.leave",
      "members.update", "members.updateMe", "members.getMe", "bans.get", "bans.bulkBan", "events.get",
      "events.listUsers", "invites.get",
    ]) {
      expect(actions[key], key).toBeFunction();
    }
  });
});
