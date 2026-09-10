import { describe, expect, test } from "bun:test";
import { errorResponseForExecutionFailure } from "../../../bun/src/server";
import { deleteMessage, editMessage, sendMessage, validateCredentials } from "../src/actions";

describe("telegram connector actions", () => {
  test("sendMessage validates input and marks connector-owned output", () => {
    const result = sendMessage({ chatId: "1001", text: "hello" });

    expect(result.connector).toBe("telegram");
    expect(result.action).toBe("messages.send");
    expect(result.source).toBe("connector");
    expect(result.validated).toEqual({ chatId: "1001", text: "hello" });
  });

  test("sendMessage rejects invalid input", () => {
    expect(() => sendMessage({ chatId: "", text: "hello" })).toThrow();
  });

  test("sendMessage posts to Telegram sendMessage with connector-owned raw HTTP", async () => {
    const requests: Request[] = [];
    const result = await sendMessage({
      botToken: "123:abc",
      chatId: "1001",
      text: "hello",
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return new Response(JSON.stringify({
          ok: true,
          result: {
            message_id: 42,
            chat: { id: 1001 },
            text: "hello",
          },
        }), { status: 200 });
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.telegram.org/bot123:abc/sendMessage");
    expect(requests[0].method).toBe("POST");
    expect(await requests[0].json()).toEqual({ chat_id: "1001", text: "hello" });
    expect(result).toEqual({
      connector: "telegram",
      action: "messages.send",
      source: "connector",
      providerMessageId: "42",
      channelId: "1001",
      text: "hello",
      raw: {
        message_id: 42,
        chat: { id: 1001 },
        text: "hello",
      },
    });
  });

  test("sendMessage rejects Telegram rate limits with retry_after metadata", async () => {
    await expect(sendMessage({
      botToken: "123:abc",
      chatId: "1001",
      text: "hello",
      fetch: async () => new Response(JSON.stringify({
        ok: false,
        error_code: 429,
        description: "Too Many Requests: retry after 12",
        parameters: { retry_after: 12 },
      }), { status: 429 }),
    })).rejects.toEqual({
      ok: false,
      code: "CONNECTOR_RATE_LIMITED",
      message: "Too Many Requests: retry after 12",
      status: 429,
      retryAfterSeconds: 12,
    });
  });

  test("carries Telegram flood control through send, edit, and delete into the runner envelope", async () => {
    const floodControl = () => new Response(JSON.stringify({
      ok: false,
      error_code: 429,
      description: "Too Many Requests: retry after 17",
      parameters: { retry_after: 17 },
    }), { status: 400 });
    const fetch = async () => floodControl();
    const failures = await Promise.all([
      sendMessage({ botToken: "123:abc", chatId: "1001", text: "hello", fetch }).catch((error) => error),
      editMessage({ botToken: "123:abc", chatId: "1001", messageId: 42, text: "updated", fetch }).catch((error) => error),
      deleteMessage({ botToken: "123:abc", chatId: "1001", messageId: 42, fetch }).catch((error) => error),
    ]);

    for (const failure of failures) {
      expect(failure).toMatchObject({
        ok: false,
        code: "CONNECTOR_RATE_LIMITED",
        status: 400,
        retryAfterSeconds: 17,
      });
      expect(errorResponseForExecutionFailure(
        failure,
        "CONNECTOR_UPSTREAM_ERROR",
        "Action failed.",
      )).toEqual({
        status: 429,
        error: {
          code: "CONNECTOR_RATE_LIMITED",
          message: "Too Many Requests: retry after 17",
          retryAfterSeconds: 17,
        },
      });
    }
  });

  test("validateCredentials accepts required setup fields", () => {
    const result = validateCredentials({ botToken: "123456:secret" });
    expect(result).toEqual({
      connector: "telegram",
      action: "credentials.validate",
      source: "connector",
      valid: true,
    });
    expect(JSON.stringify(result)).not.toContain("123456:secret");
  });

  test("validateCredentials rejects missing setup fields", () => {
    expect(() => validateCredentials({})).toThrow();
    expect(() => validateCredentials({ botToken: "" })).toThrow();
  });
});
