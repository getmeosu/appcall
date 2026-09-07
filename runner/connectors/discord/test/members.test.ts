import { describe, expect, it } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import memberFixture from "../fixtures/member.json";
import membersList from "../fixtures/members_list.json";
import roleFixture from "../fixtures/role.json";
import rolesList from "../fixtures/roles_list.json";
import banFixture from "../fixtures/ban.json";
import inviteFixture from "../fixtures/invite.json";
import dmFixture from "../fixtures/dm_channel.json";
import { mockFetch, jsonBody as body, auditReason as reason } from "./support";

const { actions } = compileDeclarativeConnector(manifest as never);
const ops = manifest.operations as Record<string, { sideEffect: string }>;

describe("members", () => {
  it("lists members with a limit and after cursor", async () => {
    const { calls, fetchFn } = mockFetch(membersList);
    const result = (await actions["members.list"]!({ botToken: "tok_TEST", guildId: "1100000000000000001", limit: 100, after: "0", fetch: fetchFn })) as Record<string, unknown>;
    expect(calls[0]!.url).toBe("https://discord.com/api/v10/guilds/1100000000000000001/members?limit=100&after=0");
    expect(result.members).toEqual(membersList);
  });

  it("searches members by name prefix", async () => {
    const { calls, fetchFn } = mockFetch(membersList);
    await actions["members.search"]!({ botToken: "tok_TEST", guildId: "1100000000000000001", query: "an", fetch: fetchFn });
    expect(calls[0]!.url).toBe("https://discord.com/api/v10/guilds/1100000000000000001/members/search?query=an");
  });

  it("gets one member and one user", async () => {
    const member = mockFetch(memberFixture);
    const got = (await actions["members.get"]!({ botToken: "tok_TEST", guildId: "1100000000000000001", userId: "900000000000000002", fetch: member.fetchFn })) as Record<string, unknown>;
    expect(member.calls[0]!.url).toBe("https://discord.com/api/v10/guilds/1100000000000000001/members/900000000000000002");
    expect(got.member).toEqual(memberFixture);

    const user = mockFetch(memberFixture.user);
    await actions["users.get"]!({ botToken: "tok_TEST", userId: "900000000000000002", fetch: user.fetchFn });
    expect(user.calls[0]!.url).toBe("https://discord.com/api/v10/users/900000000000000002");
  });

  it("times out and clears a timeout as writes", async () => {
    const timeout = mockFetch(memberFixture);
    await actions["members.timeout"]!({ botToken: "tok_TEST", guildId: "1100000000000000001", userId: "900000000000000002", until: "2026-09-06T09:00:00Z", reason: "Rule 2", fetch: timeout.fetchFn });
    expect(timeout.calls[0]!.init?.method).toBe("PATCH");
    expect(body(timeout.calls)).toEqual({ communication_disabled_until: "2026-09-06T09:00:00Z" });
    expect(reason(timeout.calls)).toBe("Rule 2");
    expect(ops["members.timeout"]!.sideEffect).toBe("write");

    const clear = mockFetch(memberFixture);
    await actions["members.clearTimeout"]!({ botToken: "tok_TEST", guildId: "1100000000000000001", userId: "900000000000000002", fetch: clear.fetchFn });
    expect(body(clear.calls)).toEqual({ communication_disabled_until: null });
    // An absent reason must drop X-Audit-Log-Reason, never send the literal template.
    expect(reason(clear.calls)).toBeUndefined();
  });

  it("kicks as a destructive action with a reason", async () => {
    const { calls, fetchFn } = mockFetch("", 204);
    const result = (await actions["members.kick"]!({ botToken: "tok_TEST", guildId: "1100000000000000001", userId: "900000000000000009", reason: "Rule 1", fetch: fetchFn })) as Record<string, unknown>;
    expect(calls[0]!.init?.method).toBe("DELETE");
    expect(calls[0]!.url).toBe("https://discord.com/api/v10/guilds/1100000000000000001/members/900000000000000009");
    expect(reason(calls)).toBe("Rule 1");
    expect(result.kicked).toBe(true);
    expect(ops["members.kick"]!.sideEffect).toBe("destructive");
  });

  it("adds and removes a role", async () => {
    const add = mockFetch("", 204);
    await actions["members.addRole"]!({ botToken: "tok_TEST", guildId: "1100000000000000001", userId: "900000000000000003", roleId: "1600000000000000002", fetch: add.fetchFn });
    expect(add.calls[0]!.url).toBe("https://discord.com/api/v10/guilds/1100000000000000001/members/900000000000000003/roles/1600000000000000002");
    expect(add.calls[0]!.init?.method).toBe("PUT");

    const remove = mockFetch("", 204);
    await actions["members.removeRole"]!({ botToken: "tok_TEST", guildId: "1100000000000000001", userId: "900000000000000003", roleId: "1600000000000000002", fetch: remove.fetchFn });
    expect(remove.calls[0]!.init?.method).toBe("DELETE");
  });
});

describe("roles", () => {
  it("lists, creates with booleans passed through, updates and deletes", async () => {
    const list = mockFetch(rolesList);
    const listed = (await actions["roles.list"]!({ botToken: "tok_TEST", guildId: "1100000000000000001", fetch: list.fetchFn })) as Record<string, unknown>;
    expect(listed.roles).toEqual(rolesList);

    const create = mockFetch(roleFixture, 200);
    await actions["roles.create"]!({ botToken: "tok_TEST", guildId: "1100000000000000001", name: "welcomed", hoist: false, mentionable: false, fetch: create.fetchFn });
    expect(body(create.calls)).toEqual({ name: "welcomed", hoist: false, mentionable: false });

    const update = mockFetch(roleFixture);
    await actions["roles.update"]!({ botToken: "tok_TEST", guildId: "1100000000000000001", roleId: "1600000000000000002", color: 3447003, fetch: update.fetchFn });
    expect(update.calls[0]!.init?.method).toBe("PATCH");
    expect(body(update.calls)).toEqual({ color: 3447003 });

    const del = mockFetch("", 204);
    await actions["roles.delete"]!({ botToken: "tok_TEST", guildId: "1100000000000000001", roleId: "1600000000000000002", fetch: del.fetchFn });
    expect(del.calls[0]!.init?.method).toBe("DELETE");
    expect(ops["roles.delete"]!.sideEffect).toBe("destructive");
  });
});

describe("bans, invites, dm", () => {
  it("bans with message pruning and unbans, both destructive", async () => {
    const ban = mockFetch("", 204);
    await actions["bans.create"]!({ botToken: "tok_TEST", guildId: "1100000000000000001", userId: "900000000000000009", deleteMessageSeconds: 3600, reason: "Rule 1: harassment", fetch: ban.fetchFn });
    expect(ban.calls[0]!.url).toBe("https://discord.com/api/v10/guilds/1100000000000000001/bans/900000000000000009");
    expect(ban.calls[0]!.init?.method).toBe("PUT");
    expect(body(ban.calls)).toEqual({ delete_message_seconds: 3600 });
    expect(reason(ban.calls)).toBe("Rule 1: harassment");
    expect(ops["bans.create"]!.sideEffect).toBe("destructive");

    const unban = mockFetch("", 204);
    await actions["bans.delete"]!({ botToken: "tok_TEST", guildId: "1100000000000000001", userId: "900000000000000009", fetch: unban.fetchFn });
    expect(unban.calls[0]!.init?.method).toBe("DELETE");
    expect(ops["bans.delete"]!.sideEffect).toBe("destructive");

    const list = mockFetch(banFixture);
    const listed = (await actions["bans.list"]!({ botToken: "tok_TEST", guildId: "1100000000000000001", fetch: list.fetchFn })) as Record<string, unknown>;
    expect(listed.bans).toEqual(banFixture);
  });

  it("lists and revokes invites", async () => {
    const list = mockFetch([inviteFixture]);
    const listed = (await actions["invites.list"]!({ botToken: "tok_TEST", guildId: "1100000000000000001", fetch: list.fetchFn })) as Record<string, unknown>;
    expect(listed.invites).toEqual([inviteFixture]);

    const revoke = mockFetch(inviteFixture);
    await actions["invites.revoke"]!({ botToken: "tok_TEST", code: "abc123", fetch: revoke.fetchFn });
    expect(revoke.calls[0]!.url).toBe("https://discord.com/api/v10/invites/abc123");
    expect(revoke.calls[0]!.init?.method).toBe("DELETE");
    expect(ops["invites.revoke"]!.sideEffect).toBe("destructive");
  });

  it("opens a DM channel to a user", async () => {
    const { calls, fetchFn } = mockFetch(dmFixture);
    const result = (await actions["dm.open"]!({ botToken: "tok_TEST", userId: "900000000000000003", fetch: fetchFn })) as Record<string, unknown>;
    expect(calls[0]!.url).toBe("https://discord.com/api/v10/users/@me/channels");
    expect(body(calls)).toEqual({ recipient_id: "900000000000000003" });
    expect(result.channel).toEqual(dmFixture);
  });
});
