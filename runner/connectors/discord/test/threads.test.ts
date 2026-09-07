import { describe, expect, it } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import threadFixture from "../fixtures/thread.json";
import activeFixture from "../fixtures/threads_active.json";
import usersList from "../fixtures/users_list.json";
import { mockFetch, jsonBody as body } from "./support";

const { actions } = compileDeclarativeConnector(manifest as never);

describe("threads", () => {
  it("creates a public thread with a name and archive window", async () => {
    const { calls, fetchFn } = mockFetch(threadFixture, 201);
    const result = (await actions["threads.create"]!({ botToken: "tok_TEST", channelId: "1300000000000000001", name: "password reset", autoArchiveMinutes: 1440, fetch: fetchFn })) as Record<string, unknown>;
    expect(calls[0]!.url).toBe("https://discord.com/api/v10/channels/1300000000000000001/threads");
    expect(body(calls)).toEqual({ name: "password reset", type: 11, auto_archive_duration: 1440 });
    expect(result.thread).toEqual(threadFixture);
  });

  it("creates a thread from a message", async () => {
    const { calls, fetchFn } = mockFetch(threadFixture, 201);
    await actions["threads.createFromMessage"]!({ botToken: "tok_TEST", channelId: "1300000000000000001", messageId: "1400000000000000003", name: "password reset", fetch: fetchFn });
    expect(calls[0]!.url).toBe("https://discord.com/api/v10/channels/1300000000000000001/messages/1400000000000000003/threads");
    expect(body(calls)).toEqual({ name: "password reset" });
  });

  it("joins, leaves and adds a member", async () => {
    const join = mockFetch("", 204);
    await actions["threads.join"]!({ botToken: "tok_TEST", threadId: "1500000000000000001", fetch: join.fetchFn });
    expect(join.calls[0]!.url).toBe("https://discord.com/api/v10/channels/1500000000000000001/thread-members/@me");
    expect(join.calls[0]!.init?.method).toBe("PUT");

    const leave = mockFetch("", 204);
    await actions["threads.leave"]!({ botToken: "tok_TEST", threadId: "1500000000000000001", fetch: leave.fetchFn });
    expect(leave.calls[0]!.init?.method).toBe("DELETE");

    const add = mockFetch("", 204);
    await actions["threads.addMember"]!({ botToken: "tok_TEST", threadId: "1500000000000000001", userId: "900000000000000002", fetch: add.fetchFn });
    expect(add.calls[0]!.url).toBe("https://discord.com/api/v10/channels/1500000000000000001/thread-members/900000000000000002");
  });

  it("lists active and archived threads", async () => {
    const active = mockFetch(activeFixture);
    const result = (await actions["threads.listActive"]!({ botToken: "tok_TEST", guildId: "1100000000000000001", fetch: active.fetchFn })) as Record<string, unknown>;
    expect(active.calls[0]!.url).toBe("https://discord.com/api/v10/guilds/1100000000000000001/threads/active");
    expect(result.threads).toEqual(activeFixture.threads);

    const archived = mockFetch({ threads: [threadFixture], has_more: false });
    const list = (await actions["threads.listArchived"]!({ botToken: "tok_TEST", channelId: "1300000000000000001", limit: 10, fetch: archived.fetchFn })) as Record<string, unknown>;
    expect(archived.calls[0]!.url).toBe("https://discord.com/api/v10/channels/1300000000000000001/threads/archived/public?limit=10");
    expect(list.hasMore).toBe(false);
  });
});

describe("reactions", () => {
  it("adds the bot's reaction with the emoji URL-encoded in the path", async () => {
    const { calls, fetchFn } = mockFetch("", 204);
    await actions["reactions.add"]!({ botToken: "tok_TEST", channelId: "1300000000000000001", messageId: "1400000000000000001", emoji: "👍", fetch: fetchFn });
    expect(calls[0]!.url).toBe("https://discord.com/api/v10/channels/1300000000000000001/messages/1400000000000000001/reactions/%F0%9F%91%8D/@me");
    expect(calls[0]!.init?.method).toBe("PUT");
  });

  it("removes its own, a user's, or every reaction", async () => {
    const own = mockFetch("", 204);
    await actions["reactions.remove"]!({ botToken: "tok_TEST", channelId: "1300000000000000001", messageId: "1400000000000000001", emoji: "👍", fetch: own.fetchFn });
    expect(own.calls[0]!.url.endsWith("/reactions/%F0%9F%91%8D/@me")).toBe(true);
    expect(own.calls[0]!.init?.method).toBe("DELETE");

    const user = mockFetch("", 204);
    await actions["reactions.removeUser"]!({ botToken: "tok_TEST", channelId: "1300000000000000001", messageId: "1400000000000000001", emoji: "👍", userId: "900000000000000002", fetch: user.fetchFn });
    expect(user.calls[0]!.url.endsWith("/reactions/%F0%9F%91%8D/900000000000000002")).toBe(true);

    const all = mockFetch("", 204);
    await actions["reactions.clear"]!({ botToken: "tok_TEST", channelId: "1300000000000000001", messageId: "1400000000000000001", fetch: all.fetchFn });
    expect(all.calls[0]!.url.endsWith("/messages/1400000000000000001/reactions")).toBe(true);
  });

  it("lists who reacted", async () => {
    const { calls, fetchFn } = mockFetch(usersList);
    const result = (await actions["reactions.list"]!({ botToken: "tok_TEST", channelId: "1300000000000000001", messageId: "1400000000000000001", emoji: "👍", fetch: fetchFn })) as Record<string, unknown>;
    expect(calls[0]!.url.endsWith("/reactions/%F0%9F%91%8D")).toBe(true);
    expect(result.users).toEqual(usersList);
  });
});
