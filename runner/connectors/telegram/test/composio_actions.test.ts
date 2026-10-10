import { describe, expect, test } from "bun:test";
import sendLocationFixture from "../fixtures/send_location.json";
import sendPollFixture from "../fixtures/send_poll.json";
import getChatMemberFixture from "../fixtures/get_chat_member.json";
import getChatAdministratorsFixture from "../fixtures/get_chat_administrators.json";
import exportInviteLinkFixture from "../fixtures/export_invite_link.json";
import getUpdatesFixture from "../fixtures/get_updates.json";
import answerCallbackFixture from "../fixtures/answer_callback.json";
import setMyCommandsFixture from "../fixtures/set_my_commands.json";
import manifest from "../manifest.json";
import {
  answerCallbackQuery,
  exportChatInviteLink,
  getChatAdministrators,
  getChatHistory,
  getChatMember,
  getUpdates,
  sendLocation,
  sendPoll,
  setMyCommands,
} from "../src/actions";

const COMPOSIO_TOOL_OPERATIONS: Record<string, string> = {
  TELEGRAM_ANSWER_CALLBACK_QUERY: "callbacks.answer",
  TELEGRAM_CREATE_CHAT_INVITE_LINK: "chats.exportInviteLink",
  TELEGRAM_DELETE_MESSAGE: "messages.delete",
  TELEGRAM_EDIT_MESSAGE: "messages.edit",
  TELEGRAM_FORWARD_MESSAGE: "messages.forward",
  TELEGRAM_GET_CHAT: "chats.get",
  TELEGRAM_GET_CHAT_ADMINISTRATORS: "chats.getAdministrators",
  TELEGRAM_GET_CHAT_HISTORY: "chats.getHistory",
  TELEGRAM_GET_CHAT_MEMBER: "chats.getMember",
  TELEGRAM_GET_CHAT_MEMBERS_COUNT: "chats.getMemberCount",
  TELEGRAM_GET_ME: "bot.getMe",
  TELEGRAM_GET_UPDATES: "bot.getUpdates",
  TELEGRAM_SEND_DOCUMENT: "messages.sendDocument",
  TELEGRAM_SEND_LOCATION: "messages.sendLocation",
  TELEGRAM_SEND_MESSAGE: "messages.send",
  TELEGRAM_SEND_PHOTO: "messages.sendPhoto",
  TELEGRAM_SEND_POLL: "messages.sendPoll",
  TELEGRAM_SET_MY_COMMANDS: "bot.setMyCommands",
};

function floodControl(retryAfter = 5) {
  return new Response(JSON.stringify({
    ok: false,
    error_code: 429,
    description: "Too Many Requests",
    parameters: { retry_after: retryAfter },
  }), { status: 429 });
}

describe("telegram composio mapping", () => {
  test("maps all 18 Composio Telegram tools onto real operations", () => {
    expect(Object.keys(COMPOSIO_TOOL_OPERATIONS)).toHaveLength(18);
    for (const [tool, operation] of Object.entries(COMPOSIO_TOOL_OPERATIONS)) {
      const spec = (manifest.operations as Record<string, Record<string, unknown>>)[operation];
      expect(spec, `${tool} -> ${operation}`).toBeDefined();
      expect(spec.kind).toBe("action");
      expect(typeof spec.title).toBe("string");
      expect(String(spec.title).length).toBeGreaterThan(0);
      expect(typeof spec.description).toBe("string");
      expect(String(spec.description).length).toBeGreaterThan(0);
      const inputSchema = spec.inputSchema as { type?: string };
      expect(inputSchema).toMatchObject({ type: "object" });
    }
  });

  test("keeps baseline operations and adds the missing Composio tools", () => {
    const operations = Object.keys(manifest.operations);
    expect(manifest.version).toBe("0.2.0");
    expect(operations).toContain("messages.list");
    expect(operations).toContain("messages.pin");
    expect(operations).toContain("chats.sendAction");
    expect(operations).toContain("credentials.validate");
    expect(operations).toContain("healthcheck");
    expect(operations).toHaveLength(23);
  });

  test("does not declare webhooks without a read side effect", () => {
    for (const [name, spec] of Object.entries(manifest.operations as Record<string, { kind?: string; sideEffect?: string }>)) {
      if (spec.kind === "webhook") {
        expect(spec.sideEffect, name).toBe("read");
      }
    }
  });
});

describe("telegram callbacks.answer", () => {
  test("validates input without auth", () => {
    const result = answerCallbackQuery({ callbackQueryId: "cbq-1", text: "ok" });
    expect(result).toMatchObject({
      connector: "telegram",
      action: "callbacks.answer",
      source: "connector",
      validated: { callbackQueryId: "cbq-1", text: "ok" },
    });
  });

  test("rejects missing callbackQueryId", () => {
    expect(() => answerCallbackQuery({})).toThrow();
    expect(() => answerCallbackQuery({ callbackQueryId: "" })).toThrow();
  });

  test("rejects notification text longer than 200 characters", () => {
    expect(() => answerCallbackQuery({ callbackQueryId: "cbq-1", text: "x".repeat(201) })).toThrow();
  });

  test("calls answerCallbackQuery with optional alert fields", async () => {
    const requests: Request[] = [];
    const result = await answerCallbackQuery({
      botToken: "123:abc",
      callbackQueryId: "cbq-1",
      text: "Done",
      showAlert: true,
      cacheTime: 10,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(answerCallbackFixture), { status: 200 });
      },
    });

    expect(requests[0].url).toBe("https://api.telegram.org/bot123:abc/answerCallbackQuery");
    expect(requests[0].method).toBe("POST");
    expect(await requests[0].json()).toEqual({
      callback_query_id: "cbq-1",
      text: "Done",
      show_alert: true,
      cache_time: 10,
    });
    expect(result).toMatchObject({
      connector: "telegram",
      action: "callbacks.answer",
      source: "connector",
      ok: true,
    });
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(answerCallbackQuery({
      botToken: "123:abc",
      callbackQueryId: "cbq-1",
      fetch: async () => floodControl(4),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });
});

describe("telegram chats.exportInviteLink", () => {
  test("validates input without auth", () => {
    const result = exportChatInviteLink({ chatId: "-100123" });
    expect(result).toMatchObject({
      connector: "telegram",
      action: "chats.exportInviteLink",
      source: "connector",
      validated: { chatId: "-100123" },
    });
  });

  test("rejects missing chatId", () => {
    expect(() => exportChatInviteLink({})).toThrow();
    expect(() => exportChatInviteLink({ chatId: "" })).toThrow();
  });

  test("calls exportChatInviteLink and returns the primary invite link", async () => {
    const requests: Request[] = [];
    const result = await exportChatInviteLink({
      botToken: "123:abc",
      chatId: "-100123",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(exportInviteLinkFixture), { status: 200 });
      },
    });

    expect(requests[0].url).toBe("https://api.telegram.org/bot123:abc/exportChatInviteLink");
    expect(await requests[0].json()).toEqual({ chat_id: "-100123" });
    expect(result).toMatchObject({
      connector: "telegram",
      action: "chats.exportInviteLink",
      source: "connector",
      inviteLink: "https://t.me/+AbCdEfGhIjKlMnOp",
      chatId: "-100123",
    });
  });
});

describe("telegram chats.getAdministrators", () => {
  test("validates input without auth", () => {
    const result = getChatAdministrators({ chatId: "-100123" });
    expect(result).toMatchObject({
      connector: "telegram",
      action: "chats.getAdministrators",
      source: "connector",
      validated: { chatId: "-100123" },
    });
  });

  test("calls getChatAdministrators and returns the administrator list", async () => {
    const requests: Request[] = [];
    const result = await getChatAdministrators({
      botToken: "123:abc",
      chatId: "-100123",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(getChatAdministratorsFixture), { status: 200 });
      },
    });

    expect(requests[0].url).toBe("https://api.telegram.org/bot123:abc/getChatAdministrators");
    expect(await requests[0].json()).toEqual({ chat_id: "-100123" });
    expect(result).toMatchObject({
      connector: "telegram",
      action: "chats.getAdministrators",
      source: "connector",
      chatId: "-100123",
    });
    const administrators = (result as Record<string, unknown>).administrators as unknown[];
    expect(administrators).toHaveLength(2);
  });
});

describe("telegram chats.getMember", () => {
  test("validates input without auth", () => {
    const result = getChatMember({ chatId: "-100123", userId: 501 });
    expect(result).toMatchObject({
      connector: "telegram",
      action: "chats.getMember",
      source: "connector",
      validated: { chatId: "-100123", userId: 501 },
    });
  });

  test("rejects missing userId", () => {
    expect(() => getChatMember({ chatId: "-100123" })).toThrow();
  });

  test("calls getChatMember with chat and user identifiers", async () => {
    const requests: Request[] = [];
    const result = await getChatMember({
      botToken: "123:abc",
      chatId: "-100123",
      userId: 501,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(getChatMemberFixture), { status: 200 });
      },
    });

    expect(requests[0].url).toBe("https://api.telegram.org/bot123:abc/getChatMember");
    expect(await requests[0].json()).toEqual({ chat_id: "-100123", user_id: 501 });
    expect(result).toMatchObject({
      connector: "telegram",
      action: "chats.getMember",
      source: "connector",
    });
    const member = (result as Record<string, unknown>).member as Record<string, unknown>;
    expect(member.status).toBe("administrator");
  });
});

describe("telegram chats.getHistory", () => {
  test("validates input without auth", () => {
    const result = getChatHistory({ chatId: "1001", limit: 50 });
    expect(result).toMatchObject({
      connector: "telegram",
      action: "chats.getHistory",
      source: "connector",
      validated: { chatId: "1001", limit: 50 },
    });
  });

  test("rejects limit outside 1-100", () => {
    expect(() => getChatHistory({ chatId: "1001", limit: 0 })).toThrow();
    expect(() => getChatHistory({ chatId: "1001", limit: 101 })).toThrow();
  });

  test("polls getUpdates and filters messages to the requested chat", async () => {
    const requests: Request[] = [];
    const result = await getChatHistory({
      botToken: "123:abc",
      chatId: "1001",
      limit: 100,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(getUpdatesFixture), { status: 200 });
      },
    });

    expect(requests[0].url).toBe("https://api.telegram.org/bot123:abc/getUpdates");
    expect(await requests[0].json()).toEqual({ limit: 100 });
    const messages = (result as Record<string, unknown>).messages as Array<Record<string, unknown>>;
    expect(messages.map((message) => message.message_id)).toEqual([10, 12]);
    expect(result).toMatchObject({
      connector: "telegram",
      action: "chats.getHistory",
      source: "connector",
      chatId: "1001",
    });
  });

  test("uses messageId as a starting point when provided", async () => {
    const result = await getChatHistory({
      botToken: "123:abc",
      chatId: "1001",
      messageId: 12,
      fetch: async () => new Response(JSON.stringify(getUpdatesFixture), { status: 200 }),
    });
    const messages = (result as Record<string, unknown>).messages as Array<Record<string, unknown>>;
    expect(messages.map((message) => message.message_id)).toEqual([12]);
  });

  test("maps webhook conflict 409 to PROVIDER_ERROR", async () => {
    await expect(getChatHistory({
      botToken: "123:abc",
      chatId: "1001",
      fetch: async () => new Response(JSON.stringify({
        ok: false,
        error_code: 409,
        description: "Conflict: terminated by other getUpdates request; make sure that only one bot instance is running",
      }), { status: 409 }),
    })).rejects.toMatchObject({ ok: false, code: "PROVIDER_ERROR", status: 409 });
  });
});

describe("telegram bot.getUpdates", () => {
  test("validates empty input without auth", () => {
    const result = getUpdates({});
    expect(result).toMatchObject({
      connector: "telegram",
      action: "bot.getUpdates",
      source: "connector",
      validated: {},
    });
  });

  test("rejects limit outside 1-100 and timeout outside 0-50", () => {
    expect(() => getUpdates({ limit: 0 })).toThrow();
    expect(() => getUpdates({ limit: 101 })).toThrow();
    expect(() => getUpdates({ timeout: -1 })).toThrow();
    expect(() => getUpdates({ timeout: 51 })).toThrow();
  });

  test("calls getUpdates with offset, limit, timeout, and allowed_updates", async () => {
    const requests: Request[] = [];
    const result = await getUpdates({
      botToken: "123:abc",
      offset: 9001,
      limit: 20,
      timeout: 0,
      allowedUpdates: ["message", "callback_query"],
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(getUpdatesFixture), { status: 200 });
      },
    });

    expect(requests[0].url).toBe("https://api.telegram.org/bot123:abc/getUpdates");
    expect(await requests[0].json()).toEqual({
      offset: 9001,
      limit: 20,
      timeout: 0,
      allowed_updates: ["message", "callback_query"],
    });
    expect(result).toMatchObject({
      connector: "telegram",
      action: "bot.getUpdates",
      source: "connector",
    });
    const updates = (result as Record<string, unknown>).updates as unknown[];
    expect(updates).toHaveLength(3);
  });
});

describe("telegram messages.sendLocation", () => {
  test("validates input without auth", () => {
    const result = sendLocation({ chatId: "1001", latitude: 37.7749, longitude: -122.4194 });
    expect(result).toMatchObject({
      connector: "telegram",
      action: "messages.sendLocation",
      source: "connector",
      validated: { chatId: "1001", latitude: 37.7749, longitude: -122.4194 },
    });
  });

  test("rejects missing coordinates", () => {
    expect(() => sendLocation({ chatId: "1001", latitude: 1 })).toThrow();
    expect(() => sendLocation({ chatId: "1001", longitude: 1 })).toThrow();
  });

  test("rejects heading, livePeriod, and accuracy outside Bot API ranges", () => {
    expect(() => sendLocation({ chatId: "1001", latitude: 1, longitude: 1, heading: 0 })).toThrow();
    expect(() => sendLocation({ chatId: "1001", latitude: 1, longitude: 1, livePeriod: 59 })).toThrow();
    expect(() => sendLocation({ chatId: "1001", latitude: 1, longitude: 1, horizontalAccuracy: 1501 })).toThrow();
  });

  test("calls sendLocation with live-location optional fields", async () => {
    const requests: Request[] = [];
    const result = await sendLocation({
      botToken: "123:abc",
      chatId: "1001",
      latitude: 37.7749,
      longitude: -122.4194,
      livePeriod: 60,
      heading: 90,
      horizontalAccuracy: 12.5,
      proximityAlertRadius: 100,
      disableNotification: true,
      replyToMessageId: 42,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(sendLocationFixture), { status: 200 });
      },
    });

    expect(requests[0].url).toBe("https://api.telegram.org/bot123:abc/sendLocation");
    expect(await requests[0].json()).toEqual({
      chat_id: "1001",
      latitude: 37.7749,
      longitude: -122.4194,
      live_period: 60,
      heading: 90,
      horizontal_accuracy: 12.5,
      proximity_alert_radius: 100,
      disable_notification: true,
      reply_to_message_id: 42,
    });
    expect(result).toMatchObject({
      connector: "telegram",
      action: "messages.sendLocation",
      source: "connector",
      providerMessageId: "301",
      channelId: "1001",
    });
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(sendLocation({
      botToken: "123:abc",
      chatId: "1001",
      latitude: 1,
      longitude: 2,
      fetch: async () => floodControl(8),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 8 });
  });
});

describe("telegram messages.sendPoll", () => {
  test("validates input without auth", () => {
    const result = sendPoll({ chatId: "1001", question: "Ship it?", options: ["Yes", "No"] });
    expect(result).toMatchObject({
      connector: "telegram",
      action: "messages.sendPoll",
      source: "connector",
      validated: { chatId: "1001", question: "Ship it?", options: ["Yes", "No"] },
    });
  });

  test("rejects fewer than two options or options over 100 characters", () => {
    expect(() => sendPoll({ chatId: "1001", question: "Q", options: ["only"] })).toThrow();
    expect(() => sendPoll({ chatId: "1001", question: "Q", options: ["a", "x".repeat(101)] })).toThrow();
  });

  test("rejects quiz polls without correctOptionId", () => {
    expect(() => sendPoll({
      chatId: "1001",
      question: "Capital?",
      options: ["Paris", "Rome"],
      type: "quiz",
    })).toThrow();
  });

  test("rejects openPeriod and closeDate together", () => {
    expect(() => sendPoll({
      chatId: "1001",
      question: "Ship it?",
      options: ["Yes", "No"],
      openPeriod: 30,
      closeDate: 1715681461,
    })).toThrow();
  });

  test("calls sendPoll with quiz fields", async () => {
    const requests: Request[] = [];
    const result = await sendPoll({
      botToken: "123:abc",
      chatId: "1001",
      question: "Ship it?",
      options: ["Yes", "No"],
      type: "quiz",
      correctOptionId: 0,
      explanation: "Always ship",
      explanationParseMode: "HTML",
      isAnonymous: false,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(sendPollFixture), { status: 200 });
      },
    });

    expect(requests[0].url).toBe("https://api.telegram.org/bot123:abc/sendPoll");
    expect(await requests[0].json()).toEqual({
      chat_id: "1001",
      question: "Ship it?",
      options: [{ text: "Yes" }, { text: "No" }],
      type: "quiz",
      correct_option_id: 0,
      explanation: "Always ship",
      explanation_parse_mode: "HTML",
      is_anonymous: false,
    });
    expect(result).toMatchObject({
      connector: "telegram",
      action: "messages.sendPoll",
      source: "connector",
      providerMessageId: "302",
      channelId: "1001",
    });
  });
});

describe("telegram bot.setMyCommands", () => {
  test("validates input without auth", () => {
    const result = setMyCommands({
      commands: [{ command: "start", description: "Start the bot" }],
    });
    expect(result).toMatchObject({
      connector: "telegram",
      action: "bot.setMyCommands",
      source: "connector",
      validated: {
        commands: [{ command: "start", description: "Start the bot" }],
      },
    });
  });

  test("rejects empty command lists and invalid command names", () => {
    expect(() => setMyCommands({ commands: [] })).toThrow();
    expect(() => setMyCommands({
      commands: [{ command: "Start", description: "Nope" }],
    })).toThrow();
    expect(() => setMyCommands({
      commands: [{ command: "start", description: "" }],
    })).toThrow();
  });

  test("parses JSON scope strings and calls setMyCommands", async () => {
    const requests: Request[] = [];
    const result = await setMyCommands({
      botToken: "123:abc",
      commands: [{ command: "start", description: "Start the bot" }],
      scope: "{\"type\":\"all_private_chats\"}",
      languageCode: "en",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(setMyCommandsFixture), { status: 200 });
      },
    });

    expect(requests[0].url).toBe("https://api.telegram.org/bot123:abc/setMyCommands");
    expect(await requests[0].json()).toEqual({
      commands: [{ command: "start", description: "Start the bot" }],
      scope: { type: "all_private_chats" },
      language_code: "en",
    });
    expect(result).toMatchObject({
      connector: "telegram",
      action: "bot.setMyCommands",
      source: "connector",
      ok: true,
    });
  });
});
