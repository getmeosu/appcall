import { describe, expect, it } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import userBot from "../fixtures/user_bot.json";
import guildFixture from "../fixtures/guild.json";
import channelFixture from "../fixtures/channel.json";
import channelsList from "../fixtures/channels_list.json";
import rateLimit from "../fixtures/error_rate_limit.json";
import { mockFetch, authHeader as auth } from "./support";

const { actions } = compileDeclarativeConnector(manifest as never);

describe("discord identity", () => {
  it("is an api-key connector whose only secret is the bot token", () => {
    expect(manifest.key).toBe("discord");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.auth.setup.mode).toBe("api_key");
    expect(manifest.auth.setup.fields.filter((f) => f.secret).map((f) => f.key)).toEqual(["botToken"]);
    expect(manifest.http.auth.field).toBe("botToken");
    expect(manifest.http.baseUrl).toBe("https://discord.com/api/v10");
    expect(manifest.network.allowedHosts).toEqual(["discord.com"]);
  });
});

describe("healthcheck and bot.getMe", () => {
  it("echoes ok without a credential", () => {
    expect(actions.healthcheck!({})).toMatchObject({ connector: "discord", action: "healthcheck", status: "ok" });
  });

  it("calls GET /users/@me with the bot token", async () => {
    const { calls, fetchFn } = mockFetch(userBot);
    const result = (await actions["bot.getMe"]!({ botToken: "tok_TEST", fetch: fetchFn })) as Record<string, unknown>;
    expect(calls[0]!.url).toBe("https://discord.com/api/v10/users/@me");
    expect(calls[0]!.init?.method).toBe("GET");
    expect(auth(calls)).toBe("Bot tok_TEST");
    expect(result.user).toEqual(userBot);
  });
});

describe("guild.get", () => {
  it("asks for counts and returns the guild", async () => {
    const { calls, fetchFn } = mockFetch(guildFixture);
    const result = (await actions["guild.get"]!({ botToken: "tok_TEST", guildId: "1100000000000000001", fetch: fetchFn })) as Record<string, unknown>;
    expect(calls[0]!.url).toBe("https://discord.com/api/v10/guilds/1100000000000000001?with_counts=true");
    expect(result.guild).toEqual(guildFixture);
  });

  it("requires guildId", () => {
    expect(() => actions["guild.get"]!({})).toThrow("guildId is required");
  });
});

describe("channels", () => {
  it("lists a guild's channels", async () => {
    const { calls, fetchFn } = mockFetch(channelsList);
    const result = (await actions["channels.list"]!({ botToken: "tok_TEST", guildId: "1100000000000000001", fetch: fetchFn })) as Record<string, unknown>;
    expect(calls[0]!.url).toBe("https://discord.com/api/v10/guilds/1100000000000000001/channels");
    expect(result.channels).toEqual(channelsList);
  });

  it("gets one channel", async () => {
    const { calls, fetchFn } = mockFetch(channelFixture);
    const result = (await actions["channels.get"]!({ botToken: "tok_TEST", channelId: "1300000000000000001", fetch: fetchFn })) as Record<string, unknown>;
    expect(calls[0]!.url).toBe("https://discord.com/api/v10/channels/1300000000000000001");
    expect(result.channel).toEqual(channelFixture);
  });

  it("creates a text channel with an audit reason and omits fields not supplied", async () => {
    const { calls, fetchFn } = mockFetch(channelFixture, 201);
    await actions["channels.create"]!({
      botToken: "tok_TEST", guildId: "1100000000000000001", name: "general", reason: "Set up by the community manager", fetch: fetchFn,
    });
    expect(calls[0]!.url).toBe("https://discord.com/api/v10/guilds/1100000000000000001/channels");
    expect(calls[0]!.init?.method).toBe("POST");
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({ name: "general" });
    expect((calls[0]!.init?.headers as Record<string, string>)["X-Audit-Log-Reason"]).toBe("Set up by the community manager");
  });

  it("updates a channel's name and topic", async () => {
    const { calls, fetchFn } = mockFetch(channelFixture);
    await actions["channels.update"]!({ botToken: "tok_TEST", channelId: "1300000000000000001", name: "lobby", topic: "Welcome", fetch: fetchFn });
    expect(calls[0]!.init?.method).toBe("PATCH");
    expect(calls[0]!.url).toBe("https://discord.com/api/v10/channels/1300000000000000001");
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({ name: "lobby", topic: "Welcome" });
  });

  it("deletes a channel and is classified destructive", async () => {
    const { calls, fetchFn } = mockFetch(channelFixture);
    const result = (await actions["channels.delete"]!({ botToken: "tok_TEST", channelId: "1300000000000000001", fetch: fetchFn })) as Record<string, unknown>;
    expect(calls[0]!.init?.method).toBe("DELETE");
    expect(calls[0]!.url).toBe("https://discord.com/api/v10/channels/1300000000000000001");
    expect(result.channel).toEqual(channelFixture);
    expect((manifest.operations as Record<string, { sideEffect: string }>)["channels.delete"]!.sideEffect).toBe("destructive");
  });

  it("maps a 429 to CONNECTOR_RATE_LIMITED using Discord's retry_after body", async () => {
    const { fetchFn } = mockFetch(rateLimit, 429);
    await expect(actions["channels.list"]!({ botToken: "tok_TEST", guildId: "1100000000000000001", fetch: fetchFn }))
      .rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 3 }); // the runner rounds 2.5 s up
  });
});
