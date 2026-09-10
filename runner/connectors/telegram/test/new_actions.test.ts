import { describe, expect, test } from "bun:test";
import sendPhotoFixture from "../fixtures/send_photo.json";
import sendDocumentFixture from "../fixtures/send_document.json";
import editMessageFixture from "../fixtures/edit_message.json";
import forwardMessageFixture from "../fixtures/forward_message.json";
import getChatFixture from "../fixtures/get_chat.json";
import getMeFixture from "../fixtures/get_me.json";
import {
  sendPhoto,
  sendDocument,
  editMessage,
  deleteMessage,
  forwardMessage,
  pinMessage,
  getChatInfo,
  getChatMemberCountAction,
  sendChatActionHandler,
  getMeAction,
} from "../src/actions";

// ─── messages.sendPhoto ───────────────────────────────────────────────────────

describe("telegram sendPhoto action", () => {
  test("validates input without auth", () => {
    const result = sendPhoto({ chatId: "1001", photo: "https://example.com/img.jpg" });
    expect(result).toMatchObject({
      connector: "telegram",
      action: "messages.sendPhoto",
      source: "connector",
      validated: { chatId: "1001", photo: "https://example.com/img.jpg" },
    });
  });

  test("validates input with caption without auth", () => {
    const result = sendPhoto({ chatId: "1001", photo: "AgACBQ", caption: "nice pic" });
    expect((result as Record<string, unknown>).validated).toMatchObject({ caption: "nice pic" });
  });

  test("rejects missing chatId", () => {
    expect(() => sendPhoto({ photo: "AgACBQ" })).toThrow();
    expect(() => sendPhoto({ chatId: "", photo: "AgACBQ" })).toThrow();
  });

  test("rejects missing photo", () => {
    expect(() => sendPhoto({ chatId: "1001", photo: "" })).toThrow();
  });

  test("calls sendPhoto API with correct URL and body", async () => {
    const requests: Request[] = [];
    const result = await sendPhoto({
      botToken: "123:abc",
      chatId: "1001",
      photo: "AgACBQ",
      caption: "A nice photo",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(sendPhotoFixture), { status: 200 });
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.telegram.org/bot123:abc/sendPhoto");
    expect(requests[0].method).toBe("POST");
    const body = await requests[0].json();
    expect(body).toEqual({ chat_id: "1001", photo: "AgACBQ", caption: "A nice photo" });
    expect(result).toMatchObject({
      connector: "telegram",
      action: "messages.sendPhoto",
      source: "connector",
      providerMessageId: "101",
      channelId: "1001",
    });
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(sendPhoto({
      botToken: "123:abc",
      chatId: "1001",
      photo: "AgACBQ",
      fetch: async () => new Response(JSON.stringify({
        ok: false,
        error_code: 429,
        description: "Too Many Requests: retry after 5",
        parameters: { retry_after: 5 },
      }), { status: 429 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 5 });
  });

  test("maps upstream error", async () => {
    await expect(sendPhoto({
      botToken: "123:abc",
      chatId: "1001",
      photo: "bad_file",
      fetch: async () => new Response(JSON.stringify({
        ok: false,
        error_code: 400,
        description: "Bad Request: wrong file identifier",
      }), { status: 400 }),
    })).rejects.toMatchObject({ ok: false, code: "INVALID_REQUEST" });
  });
});

// ─── messages.sendDocument ────────────────────────────────────────────────────

describe("telegram sendDocument action", () => {
  test("validates input without auth", () => {
    const result = sendDocument({ chatId: "1001", document: "BQACBQABQw" });
    expect(result).toMatchObject({
      connector: "telegram",
      action: "messages.sendDocument",
      source: "connector",
      validated: { chatId: "1001", document: "BQACBQABQw" },
    });
  });

  test("rejects missing fields", () => {
    expect(() => sendDocument({ chatId: "1001" })).toThrow();
    expect(() => sendDocument({ document: "BQACBQABQw" })).toThrow();
  });

  test("calls sendDocument API with correct URL and body", async () => {
    const requests: Request[] = [];
    const result = await sendDocument({
      botToken: "123:abc",
      chatId: "1001",
      document: "BQACBQABQw",
      caption: "Important doc",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(sendDocumentFixture), { status: 200 });
      },
    });

    expect(requests[0].url).toBe("https://api.telegram.org/bot123:abc/sendDocument");
    expect(requests[0].method).toBe("POST");
    const body = await requests[0].json();
    expect(body).toEqual({ chat_id: "1001", document: "BQACBQABQw", caption: "Important doc" });
    expect(result).toMatchObject({
      connector: "telegram",
      action: "messages.sendDocument",
      source: "connector",
      providerMessageId: "102",
      channelId: "1001",
    });
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(sendDocument({
      botToken: "123:abc",
      chatId: "1001",
      document: "BQACBQABQw",
      fetch: async () => new Response(JSON.stringify({
        ok: false, error_code: 429, description: "Too Many Requests", parameters: { retry_after: 10 },
      }), { status: 429 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED" });
  });
});

// ─── messages.edit ────────────────────────────────────────────────────────────

describe("telegram editMessage action", () => {
  test("validates input without auth", () => {
    const result = editMessage({ chatId: "1001", messageId: 42, text: "Updated" });
    expect(result).toMatchObject({
      connector: "telegram",
      action: "messages.edit",
      source: "connector",
      validated: { chatId: "1001", messageId: 42, text: "Updated" },
    });
  });

  test("rejects missing messageId", () => {
    expect(() => editMessage({ chatId: "1001", text: "hello" })).toThrow();
  });

  test("rejects empty text", () => {
    expect(() => editMessage({ chatId: "1001", messageId: 42, text: "" })).toThrow();
  });

  test("calls editMessageText API with correct URL", async () => {
    const requests: Request[] = [];
    const result = await editMessage({
      botToken: "123:abc",
      chatId: "1001",
      messageId: 42,
      text: "Updated text",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(editMessageFixture), { status: 200 });
      },
    });

    expect(requests[0].url).toBe("https://api.telegram.org/bot123:abc/editMessageText");
    expect(requests[0].method).toBe("POST");
    const body = await requests[0].json();
    expect(body).toEqual({ chat_id: "1001", message_id: 42, text: "Updated text" });
    expect(result).toMatchObject({
      connector: "telegram",
      action: "messages.edit",
      source: "connector",
      providerMessageId: "42",
      text: "Updated text",
    });
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(editMessage({
      botToken: "123:abc",
      chatId: "1001",
      messageId: 42,
      text: "hello",
      fetch: async () => new Response(JSON.stringify({
        ok: false, error_code: 429, description: "Too Many Requests", parameters: { retry_after: 3 },
      }), { status: 429 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 3 });
  });
});

// ─── messages.delete ──────────────────────────────────────────────────────────

describe("telegram deleteMessage action", () => {
  test("validates input without auth", () => {
    const result = deleteMessage({ chatId: "1001", messageId: 42 });
    expect(result).toMatchObject({
      connector: "telegram",
      action: "messages.delete",
      source: "connector",
      validated: { chatId: "1001", messageId: 42 },
    });
  });

  test("rejects missing messageId", () => {
    expect(() => deleteMessage({ chatId: "1001" })).toThrow();
  });

  test("calls deleteMessage API with correct URL", async () => {
    const requests: Request[] = [];
    const result = await deleteMessage({
      botToken: "123:abc",
      chatId: "1001",
      messageId: 42,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify({ ok: true, result: true }), { status: 200 });
      },
    });

    expect(requests[0].url).toBe("https://api.telegram.org/bot123:abc/deleteMessage");
    expect(requests[0].method).toBe("POST");
    const body = await requests[0].json();
    expect(body).toEqual({ chat_id: "1001", message_id: 42 });
    expect(result).toMatchObject({
      connector: "telegram",
      action: "messages.delete",
      source: "connector",
      deleted: true,
    });
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(deleteMessage({
      botToken: "123:abc",
      chatId: "1001",
      messageId: 42,
      fetch: async () => new Response(JSON.stringify({
        ok: false, error_code: 429, description: "Too Many Requests", parameters: { retry_after: 7 },
      }), { status: 429 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED" });
  });
});

// ─── messages.forward ─────────────────────────────────────────────────────────

describe("telegram forwardMessage action", () => {
  test("validates input without auth", () => {
    const result = forwardMessage({ chatId: "2002", fromChatId: "1001", messageId: 42 });
    expect(result).toMatchObject({
      connector: "telegram",
      action: "messages.forward",
      source: "connector",
      validated: { chatId: "2002", fromChatId: "1001", messageId: 42 },
    });
  });

  test("rejects missing fromChatId", () => {
    expect(() => forwardMessage({ chatId: "2002", messageId: 42 })).toThrow();
    expect(() => forwardMessage({ chatId: "2002", fromChatId: "", messageId: 42 })).toThrow();
  });

  test("calls forwardMessage API with correct URL", async () => {
    const requests: Request[] = [];
    const result = await forwardMessage({
      botToken: "123:abc",
      chatId: "2002",
      fromChatId: "1001",
      messageId: 42,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(forwardMessageFixture), { status: 200 });
      },
    });

    expect(requests[0].url).toBe("https://api.telegram.org/bot123:abc/forwardMessage");
    expect(requests[0].method).toBe("POST");
    const body = await requests[0].json();
    expect(body).toEqual({ chat_id: "2002", from_chat_id: "1001", message_id: 42 });
    expect(result).toMatchObject({
      connector: "telegram",
      action: "messages.forward",
      source: "connector",
      providerMessageId: "200",
      channelId: "2002",
    });
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(forwardMessage({
      botToken: "123:abc",
      chatId: "2002",
      fromChatId: "1001",
      messageId: 42,
      fetch: async () => new Response(JSON.stringify({
        ok: false, error_code: 429, description: "Too Many Requests", parameters: { retry_after: 2 },
      }), { status: 429 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED" });
  });
});

// ─── messages.pin ─────────────────────────────────────────────────────────────

describe("telegram pinMessage action", () => {
  test("validates input without auth", () => {
    const result = pinMessage({ chatId: "1001", messageId: 42 });
    expect(result).toMatchObject({
      connector: "telegram",
      action: "messages.pin",
      source: "connector",
      validated: { chatId: "1001", messageId: 42 },
    });
  });

  test("rejects missing messageId", () => {
    expect(() => pinMessage({ chatId: "1001" })).toThrow();
  });

  test("calls pinChatMessage API with correct URL", async () => {
    const requests: Request[] = [];
    const result = await pinMessage({
      botToken: "123:abc",
      chatId: "1001",
      messageId: 42,
      disableNotification: true,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify({ ok: true, result: true }), { status: 200 });
      },
    });

    expect(requests[0].url).toBe("https://api.telegram.org/bot123:abc/pinChatMessage");
    expect(requests[0].method).toBe("POST");
    const body = await requests[0].json();
    expect(body).toEqual({ chat_id: "1001", message_id: 42, disable_notification: true });
    expect(result).toMatchObject({
      connector: "telegram",
      action: "messages.pin",
      source: "connector",
      pinned: true,
    });
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(pinMessage({
      botToken: "123:abc",
      chatId: "1001",
      messageId: 42,
      fetch: async () => new Response(JSON.stringify({
        ok: false, error_code: 429, description: "Too Many Requests", parameters: { retry_after: 8 },
      }), { status: 429 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED" });
  });
});

// ─── chats.get ────────────────────────────────────────────────────────────────

describe("telegram getChatInfo action", () => {
  test("validates input without auth", () => {
    const result = getChatInfo({ chatId: "-1001234567890" });
    expect(result).toMatchObject({
      connector: "telegram",
      action: "chats.get",
      source: "connector",
      validated: { chatId: "-1001234567890" },
    });
  });

  test("rejects empty chatId", () => {
    expect(() => getChatInfo({ chatId: "" })).toThrow();
    expect(() => getChatInfo({})).toThrow();
  });

  test("calls getChat API with correct URL", async () => {
    const requests: Request[] = [];
    const result = await getChatInfo({
      botToken: "123:abc",
      chatId: "-1001234567890",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(getChatFixture), { status: 200 });
      },
    });

    expect(requests[0].url).toBe("https://api.telegram.org/bot123:abc/getChat");
    expect(requests[0].method).toBe("POST");
    const body = await requests[0].json();
    expect(body).toEqual({ chat_id: "-1001234567890" });
    expect(result).toMatchObject({
      connector: "telegram",
      action: "chats.get",
      source: "connector",
    });
    expect((result as Record<string, unknown>).chat).toBeDefined();
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(getChatInfo({
      botToken: "123:abc",
      chatId: "-1001234567890",
      fetch: async () => new Response(JSON.stringify({
        ok: false, error_code: 429, description: "Too Many Requests", parameters: { retry_after: 4 },
      }), { status: 429 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED" });
  });
});

// ─── chats.getMemberCount ─────────────────────────────────────────────────────

describe("telegram getChatMemberCount action", () => {
  test("validates input without auth", () => {
    const result = getChatMemberCountAction({ chatId: "-1001234567890" });
    expect(result).toMatchObject({
      connector: "telegram",
      action: "chats.getMemberCount",
      source: "connector",
      validated: { chatId: "-1001234567890" },
    });
  });

  test("calls getChatMemberCount API with correct URL", async () => {
    const requests: Request[] = [];
    const result = await getChatMemberCountAction({
      botToken: "123:abc",
      chatId: "-1001234567890",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify({ ok: true, result: 342 }), { status: 200 });
      },
    });

    expect(requests[0].url).toBe("https://api.telegram.org/bot123:abc/getChatMemberCount");
    expect(requests[0].method).toBe("POST");
    const body = await requests[0].json();
    expect(body).toEqual({ chat_id: "-1001234567890" });
    expect(result).toMatchObject({
      connector: "telegram",
      action: "chats.getMemberCount",
      source: "connector",
      count: 342,
      chatId: "-1001234567890",
    });
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(getChatMemberCountAction({
      botToken: "123:abc",
      chatId: "-1001234567890",
      fetch: async () => new Response(JSON.stringify({
        ok: false, error_code: 429, description: "Too Many Requests", parameters: { retry_after: 6 },
      }), { status: 429 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED" });
  });
});

// ─── chats.sendAction ─────────────────────────────────────────────────────────

describe("telegram sendChatAction action", () => {
  test("validates input without auth", () => {
    const result = sendChatActionHandler({ chatId: "1001", action: "typing" });
    expect(result).toMatchObject({
      connector: "telegram",
      action: "chats.sendAction",
      source: "connector",
      validated: { chatId: "1001", action: "typing" },
    });
  });

  test("rejects invalid action type", () => {
    expect(() => sendChatActionHandler({ chatId: "1001", action: "invalid_action" })).toThrow();
  });

  test("calls sendChatAction API with correct URL", async () => {
    const requests: Request[] = [];
    const result = await sendChatActionHandler({
      botToken: "123:abc",
      chatId: "1001",
      action: "typing",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify({ ok: true, result: true }), { status: 200 });
      },
    });

    expect(requests[0].url).toBe("https://api.telegram.org/bot123:abc/sendChatAction");
    expect(requests[0].method).toBe("POST");
    const body = await requests[0].json();
    expect(body).toEqual({ chat_id: "1001", action: "typing" });
    expect(result).toMatchObject({
      connector: "telegram",
      action: "chats.sendAction",
      source: "connector",
      ok: true,
    });
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(sendChatActionHandler({
      botToken: "123:abc",
      chatId: "1001",
      action: "typing",
      fetch: async () => new Response(JSON.stringify({
        ok: false, error_code: 429, description: "Too Many Requests", parameters: { retry_after: 9 },
      }), { status: 429 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED" });
  });
});

// ─── bot.getMe ────────────────────────────────────────────────────────────────

describe("telegram getMeAction action", () => {
  test("returns validated placeholder without auth", () => {
    const result = getMeAction({});
    expect(result).toMatchObject({
      connector: "telegram",
      action: "bot.getMe",
      source: "connector",
      validated: {},
    });
  });

  test("calls getMe API with correct URL", async () => {
    const requests: Request[] = [];
    const result = await getMeAction({
      botToken: "123:abc",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(getMeFixture), { status: 200 });
      },
    });

    expect(requests[0].url).toBe("https://api.telegram.org/bot123:abc/getMe");
    expect(requests[0].method).toBe("GET");
    expect(result).toMatchObject({
      connector: "telegram",
      action: "bot.getMe",
      source: "connector",
    });
    const bot = (result as Record<string, unknown>).bot as Record<string, unknown>;
    expect(bot.is_bot).toBe(true);
    expect(bot.username).toBe("testbot");
  });

  test("maps 401 to AUTHENTICATION_FAILED", async () => {
    await expect(getMeAction({
      botToken: "bad:token",
      fetch: async () => new Response(JSON.stringify({
        ok: false, error_code: 401, description: "Unauthorized",
      }), { status: 401 }),
    })).rejects.toMatchObject({ ok: false, code: "AUTHENTICATION_FAILED" });
  });
});
