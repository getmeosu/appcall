import { describe, expect, test } from "bun:test";
import fixture from "../fixtures/message.json";
import sendMessageFixture from "../fixtures/send_message.json";
import manifest from "../manifest.json";
import {
  createSlackMessagesClient,
  normalizeMessage,
  parseNextCursor,
  parseRateLimit,
  parseRateLimitMetadata,
  validateSendMessageInput,
} from "../src/messages";

describe("slack connector foundation", () => {
  test("manifest declares Slack operations and network controls", () => {
    expect(manifest.key).toBe("slack");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.auth.type).toBe("oauth2");
    expect(manifest.network.allowedHosts).toContain("slack.com");
    expect(manifest.operations["messages.list"].kind).toBe("sync");
    expect(manifest.operations["messages.send"].kind).toBe("action");
    expect(manifest.models).toContain("message");
  });

  test("normalizes Slack message fixture", () => {
    const message = normalizeMessage(fixture.messages[0], "C123");

    expect(message.id).toBe("slack:C123:1715680861.000100");
    expect(message.provider).toBe("slack");
    expect(message.providerMessageId).toBe("1715680861.000100");
    expect(message.channelId).toBe("C123");
    expect(message.senderId).toBe("U123");
    expect(message.text).toBe("hello from slack");
    expect(message.modelVersion).toBe("2026-05-14");
    expect(message.raw.type).toBe("message");
  });

  test("extracts cursor from Slack response metadata", () => {
    expect(parseNextCursor(fixture)).toBe("next-cursor");
    expect(parseNextCursor({ ok: true, response_metadata: { next_cursor: "" } })).toBeNull();
  });

  test("parses Retry-After rate limit header", () => {
    const response = new Response("rate limited", {
      status: 429,
      headers: { "Retry-After": "60" },
    });

    expect(parseRateLimit(response)).toEqual({ limited: true, retryAfterSeconds: 60 });
    expect(parseRateLimit(new Response("ok", { status: 200 }))).toEqual({ limited: false });
    expect(parseRateLimitMetadata(429, { "retry-after": "30" })).toEqual({
      limited: true,
      retryAfterSeconds: 30,
    });
  });

  test("validates send message input", () => {
    expect(validateSendMessageInput({ channel: "C123", text: "hello" })).toEqual({
      channel: "C123",
      text: "hello",
    });

    expect(() => validateSendMessageInput({ channel: "", text: "hello" })).toThrow();
    expect(() => validateSendMessageInput({ channel: "C123", text: "" })).toThrow();
    expect(() => validateSendMessageInput({ channel: "C123", text: "x".repeat(40001) })).toThrow();
  });

  test("messages.send posts to Slack chat.postMessage and normalizes the response", async () => {
    const requests: Request[] = [];
    const client = createSlackMessagesClient({
      token: "xoxb-test-token",
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return Response.json(sendMessageFixture);
      },
    });

    const result = await client.send({ channel: "C123", text: "hello from slack" });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://slack.com/api/chat.postMessage");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer xoxb-test-token");
    expect(requests[0].headers.get("Content-Type")).toBe("application/json");
    expect(await requests[0].json()).toEqual({ channel: "C123", text: "hello from slack" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.message.id).toBe("slack:C123:1715680861.000200");
      expect(result.message.text).toBe("hello from slack");
    }
  });

  test("messages.send maps Slack rate limits to a safe connector error", async () => {
    const client = createSlackMessagesClient({
      token: "xoxb-test-token",
      fetch: async () => new Response(JSON.stringify({ ok: false, error: "ratelimited" }), {
        status: 429,
        headers: { "Retry-After": "45" },
      }),
    });

    const result = await client.send({ channel: "C123", text: "hello" });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "CONNECTOR_RATE_LIMITED",
        message: "The upstream provider rate limited this request.",
        retryAfterSeconds: 45,
      },
    });
  });

  test("messages.send maps Slack provider errors without leaking request secrets", async () => {
    const client = createSlackMessagesClient({
      token: "xoxb-secret-token",
      fetch: async () => Response.json({ ok: false, error: "channel_not_found" }, { status: 200 }),
    });

    const result = await client.send({ channel: "C404", text: "hello" });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "CONNECTOR_UPSTREAM_ERROR",
        message: "Slack rejected the message send request.",
        providerError: "channel_not_found",
      },
    });
    expect(JSON.stringify(result)).not.toContain("xoxb-secret-token");
  });
});
