import { describe, expect, it } from "bun:test";
import {
  sendLocation,
  sendPoll,
  unpinMessage,
  copyMessage,
  getChatMember,
  getChatAdministrators,
  exportChatInviteLink,
  leaveChat,
  getUpdates,
  setCommands,
  answerCallbackQuery,
} from "../src/actions";
import sendLocationFixture from "../fixtures/send_location.json";
import sendPollFixture from "../fixtures/send_poll.json";
import copyMessageFixture from "../fixtures/copy_message.json";
import getChatMemberFixture from "../fixtures/get_chat_member.json";
import getChatAdministratorsFixture from "../fixtures/get_chat_administrators.json";
import exportInviteLinkFixture from "../fixtures/export_invite_link.json";
import getUpdatesFixture from "../fixtures/get_updates.json";

const TOKEN = "fixture-bot-token";

function capturingFetch(status: number, body: unknown, capture: { url?: string; method?: string; payload?: unknown }) {
  return (url: string, init?: RequestInit) => {
    capture.url = url;
    capture.method = init?.method ?? "GET";
    try {
      capture.payload = init?.body ? JSON.parse(String(init.body)) : undefined;
    } catch {
      capture.payload = init?.body;
    }
    return Promise.resolve(new Response(JSON.stringify(body), { status }));
  };
}

describe("telegram sendLocation", () => {
  it("validates input without auth", () => {
    const result = sendLocation({ chatId: "1001", latitude: 37.77, longitude: -122.41 });
    expect(result).toMatchObject({ action: "messages.sendLocation", validated: { chatId: "1001", latitude: 37.77, longitude: -122.41 } });
  });

  it("rejects missing coordinates", () => {
    expect(() => sendLocation({ chatId: "1001" })).toThrow("latitude is required");
  });

  it("posts sendLocation", async () => {
    const capture: { url?: string; payload?: unknown } = {};
    const result = await sendLocation({
      botToken: TOKEN,
      chatId: "1001",
      latitude: 37.7749,
      longitude: -122.4194,
      fetch: capturingFetch(200, sendLocationFixture, capture),
    });
    expect(capture.url).toBe(`https://api.telegram.org/bot${TOKEN}/sendLocation`);
    expect(capture.payload).toEqual({ chat_id: "1001", latitude: 37.7749, longitude: -122.4194 });
    expect(result).toMatchObject({ action: "messages.sendLocation", providerMessageId: "501", channelId: "1001" });
  });
});

describe("telegram sendPoll", () => {
  it("rejects fewer than two options", () => {
    expect(() => sendPoll({ chatId: "1001", question: "Ship it?", options: ["yes"] })).toThrow("options must contain at least 2 strings");
  });

  it("posts sendPoll", async () => {
    const capture: { url?: string; payload?: unknown } = {};
    const result = await sendPoll({
      botToken: TOKEN,
      chatId: "1001",
      question: "Ship it?",
      options: ["yes", "no"],
      fetch: capturingFetch(200, sendPollFixture, capture),
    });
    expect(capture.url).toBe(`https://api.telegram.org/bot${TOKEN}/sendPoll`);
    expect(capture.payload).toEqual({ chat_id: "1001", question: "Ship it?", options: ["yes", "no"] });
    expect(result).toMatchObject({ action: "messages.sendPoll", providerMessageId: "502" });
  });
});

describe("telegram unpinMessage", () => {
  it("unpins a message", async () => {
    const capture: { url?: string; payload?: unknown } = {};
    const result = await unpinMessage({
      botToken: TOKEN,
      chatId: "1001",
      messageId: 42,
      fetch: capturingFetch(200, { ok: true, result: true }, capture),
    });
    expect(capture.url).toContain("/unpinChatMessage");
    expect(capture.payload).toEqual({ chat_id: "1001", message_id: 42 });
    expect(result).toMatchObject({ action: "messages.unpin", unpinned: true });
  });
});

describe("telegram copyMessage", () => {
  it("copies a message", async () => {
    const capture: { url?: string; payload?: unknown } = {};
    const result = await copyMessage({
      botToken: TOKEN,
      chatId: "2002",
      fromChatId: "1001",
      messageId: 42,
      fetch: capturingFetch(200, copyMessageFixture, capture),
    });
    expect(capture.url).toContain("/copyMessage");
    expect(capture.payload).toEqual({ chat_id: "2002", from_chat_id: "1001", message_id: 42 });
    expect(result).toMatchObject({ action: "messages.copy", providerMessageId: "777", channelId: "2002" });
  });
});

describe("telegram getChatMember", () => {
  it("requires userId", () => {
    expect(() => getChatMember({ chatId: "1001" })).toThrow("userId is required");
  });

  it("gets a chat member", async () => {
    const capture: { url?: string; payload?: unknown } = {};
    const result = await getChatMember({
      botToken: TOKEN,
      chatId: "1001",
      userId: 4242,
      fetch: capturingFetch(200, getChatMemberFixture, capture),
    });
    expect(capture.url).toContain("/getChatMember");
    expect(result).toMatchObject({ action: "chats.getMember", member: { status: "administrator" } });
  });
});

describe("telegram getChatAdministrators", () => {
  it("lists administrators", async () => {
    const result = await getChatAdministrators({
      botToken: TOKEN,
      chatId: "1001",
      fetch: capturingFetch(200, getChatAdministratorsFixture, {}),
    });
    expect(result.action).toBe("chats.getAdministrators");
    expect(Array.isArray((result as Record<string, unknown>).administrators)).toBe(true);
  });
});

describe("telegram exportChatInviteLink", () => {
  it("exports an invite link", async () => {
    const result = await exportChatInviteLink({
      botToken: TOKEN,
      chatId: "1001",
      fetch: capturingFetch(200, exportInviteLinkFixture, {}),
    });
    expect(result).toMatchObject({ action: "chats.exportInviteLink", inviteLink: "https://t.me/+fixtureInviteLink" });
  });
});

describe("telegram leaveChat", () => {
  it("leaves a chat", async () => {
    const result = await leaveChat({
      botToken: TOKEN,
      chatId: "1001",
      fetch: capturingFetch(200, { ok: true, result: true }, {}),
    });
    expect(result).toMatchObject({ action: "chats.leave", left: true });
  });

  it("maps 429", async () => {
    await expect(leaveChat({
      botToken: TOKEN,
      chatId: "1001",
      fetch: capturingFetch(429, { ok: false, error_code: 429, description: "Too Many Requests", parameters: { retry_after: 4 } }, {}),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });
});

describe("telegram getUpdates", () => {
  it("validates empty input", () => {
    const result = getUpdates({});
    expect(result).toMatchObject({ action: "bot.getUpdates" });
  });

  it("polls getUpdates", async () => {
    const capture: { url?: string; payload?: unknown } = {};
    const result = await getUpdates({
      botToken: TOKEN,
      offset: 9001,
      limit: 10,
      fetch: capturingFetch(200, getUpdatesFixture, capture),
    });
    expect(capture.url).toContain("/getUpdates");
    expect(capture.payload).toEqual({ offset: 9001, limit: 10 });
    expect((result as Record<string, unknown>).updates).toHaveLength(1);
  });
});

describe("telegram setCommands", () => {
  it("requires commands", () => {
    expect(() => setCommands({})).toThrow("commands is required");
  });

  it("sets bot commands", async () => {
    const capture: { payload?: unknown } = {};
    const result = await setCommands({
      botToken: TOKEN,
      commands: [{ command: "start", description: "Begin" }],
      fetch: capturingFetch(200, { ok: true, result: true }, capture),
    });
    expect(capture.payload).toEqual({ commands: [{ command: "start", description: "Begin" }] });
    expect(result).toMatchObject({ action: "bot.setCommands", ok: true });
  });
});

describe("telegram answerCallbackQuery", () => {
  it("answers a callback query", async () => {
    const capture: { payload?: unknown } = {};
    const result = await answerCallbackQuery({
      botToken: TOKEN,
      callbackQueryId: "cbq-fixture",
      text: "done",
      fetch: capturingFetch(200, { ok: true, result: true }, capture),
    });
    expect(capture.payload).toEqual({ callback_query_id: "cbq-fixture", text: "done" });
    expect(result).toMatchObject({ action: "bot.answerCallbackQuery", ok: true });
  });
});
