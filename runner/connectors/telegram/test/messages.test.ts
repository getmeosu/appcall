import { describe, expect, test } from "bun:test";
import fixture from "../fixtures/update.json";
import manifest from "../manifest.json";
import {
  mapTelegramError,
  normalizeMessage,
  parseNextOffset,
  parseRateLimit,
  validateSendMessageInput,
} from "../src/messages";

describe("telegram connector foundation", () => {
  test("manifest declares Telegram operations and network controls", () => {
    expect(manifest.key).toBe("telegram");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.network.allowedHosts).toContain("api.telegram.org");
    expect(manifest.operations["messages.list"].kind).toBe("sync");
    expect(manifest.operations["messages.send"].kind).toBe("action");
    expect(manifest.models).toContain("message");
  });

  test("normalizes Telegram message update fixture", () => {
    const message = normalizeMessage(fixture.result[0]);

    expect(message.id).toBe("telegram:1001:42");
    expect(message.provider).toBe("telegram");
    expect(message.providerMessageId).toBe("42");
    expect(message.channelId).toBe("1001");
    expect(message.senderId).toBe("501");
    expect(message.text).toBe("hello from telegram");
    expect(message.modelVersion).toBe("2026-05-14");
    expect(message.raw.update_id).toBe(777);
  });

  test("computes next getUpdates offset", () => {
    expect(parseNextOffset(fixture)).toBe("778");
    expect(parseNextOffset({ ok: true, result: [] })).toBeNull();
  });

  test("parses retry_after rate limit response", async () => {
    const response = new Response(JSON.stringify({
      ok: false,
      error_code: 429,
      parameters: { retry_after: 30 },
    }), { status: 429 });

    expect(await parseRateLimit(response)).toEqual({ limited: true, retryAfterSeconds: 30 });
    expect(await parseRateLimit(new Response("ok", { status: 200 }))).toEqual({ limited: false });
  });

  test("maps Telegram retry_after response to rate limit error", () => {
    const response = new Response(JSON.stringify({}), { status: 429 });

    expect(mapTelegramError(response, {
      ok: false,
      error_code: 429,
      description: "Too Many Requests: retry after 30",
      parameters: { retry_after: 30 },
    })).toEqual({
      ok: false,
      code: "CONNECTOR_RATE_LIMITED",
      message: "Too Many Requests: retry after 30",
      status: 429,
      retryAfterSeconds: 30,
    });
  });

  test("maps Telegram flood control in an HTTP 400 envelope to the shared rate-limit code", () => {
    expect(mapTelegramError(new Response("{}", { status: 400 }), {
      ok: false,
      error_code: 429,
      description: "Too Many Requests",
      parameters: { retry_after: 30 },
    })).toEqual({
      ok: false,
      code: "CONNECTOR_RATE_LIMITED",
      message: "Too Many Requests",
      status: 400,
      retryAfterSeconds: 30,
    });
  });

  test("maps Telegram provider errors to stable connector codes", () => {
    expect(mapTelegramError(new Response("{}", { status: 401 }), {
      ok: false,
      error_code: 401,
      description: "Unauthorized",
    }).code).toBe("AUTHENTICATION_FAILED");

    expect(mapTelegramError(new Response("{}", { status: 400 }), {
      ok: false,
      error_code: 400,
      description: "Bad Request: chat not found",
    }).code).toBe("INVALID_REQUEST");

    expect(mapTelegramError(new Response("{}", { status: 502 }), {
      ok: false,
      description: "Bad Gateway",
    }).code).toBe("PROVIDER_ERROR");
  });

  test("validates send message input", () => {
    expect(validateSendMessageInput({ chatId: "1001", text: "hello" })).toEqual({
      chatId: "1001",
      text: "hello",
    });

    expect(() => validateSendMessageInput({ chatId: "", text: "hello" })).toThrow();
    expect(() => validateSendMessageInput({ chatId: "1001", text: "" })).toThrow();
    expect(() => validateSendMessageInput({ chatId: "1001", text: "x".repeat(4097) })).toThrow();
  });
});
