import { describe, expect, test } from "bun:test";
import messagesListFixture from "../fixtures/messages_list.json";
import messagesNoPageFixture from "../fixtures/messages_list_no_page.json";
import {
  normalizeOutlookMessage,
  parseMessagesResponse,
  validateSendMessageInput,
  createOutlookClient,
} from "../src/messages";
import { parseGraphRateLimit } from "../src/http";

describe("microsoft-365 messages", () => {
  test("normalizes Outlook message from fixture", () => {
    const message = normalizeOutlookMessage(messagesListFixture.value[0]);

    expect(message.id).toBe("outlook:AAMkAGI2TG93AAA=");
    expect(message.provider).toBe("microsoft-365");
    expect(message.providerMessageId).toBe("AAMkAGI2TG93AAA=");
    expect(message.threadId).toBe("AAQkAGI2TG93AAA=");
    expect(message.senderId).toBe("sender@example.com");
    expect(message.subject).toBe("Project kickoff meeting");
    expect(message.text).toBe("Hi team, let's sync on the project kickoff...");
    expect(message.modelVersion).toBe("2026-05-16");
    expect(message.raw.subject).toBe("Project kickoff meeting");
  });

  test("normalizes message with minimal fields", () => {
    const message = normalizeOutlookMessage({ id: "minimal-id" });

    expect(message.id).toBe("outlook:minimal-id");
    expect(message.subject).toBe("");
    expect(message.text).toBe("");
    expect(message.senderId).toBe("");
    expect(message.threadId).toBe("");
  });

  test("parses messages list response with nextLink", () => {
    const parsed = parseMessagesResponse(messagesListFixture);

    expect(parsed.messages).toHaveLength(2);
    expect(parsed.messages[0].id).toBe("AAMkAGI2TG93AAA=");
    expect(parsed.messages[1].id).toBe("AAMkAGI2TG94AAA=");
    expect(parsed.nextLink).toBe("https://graph.microsoft.com/v1.0/me/messages?$skip=10");
  });

  test("parses messages list response without nextLink", () => {
    const parsed = parseMessagesResponse(messagesNoPageFixture);

    expect(parsed.messages).toHaveLength(1);
    expect(parsed.nextLink).toBeNull();
  });

  test("parses empty messages list response", () => {
    const parsed = parseMessagesResponse({ value: [] });

    expect(parsed.messages).toHaveLength(0);
    expect(parsed.nextLink).toBeNull();
  });

  test("handles non-object response gracefully", () => {
    expect(parseMessagesResponse(null)).toEqual({ messages: [], nextLink: null });
    expect(parseMessagesResponse("string")).toEqual({ messages: [], nextLink: null });
  });

  test("parses Graph rate limit metadata", () => {
    expect(parseGraphRateLimit(429, { "retry-after": "30" })).toEqual({
      limited: true,
      retryAfterSeconds: 30,
    });
    expect(parseGraphRateLimit(429, { "Retry-After": "60" })).toEqual({
      limited: true,
      retryAfterSeconds: 60,
    });
    expect(parseGraphRateLimit(200, {})).toEqual({ limited: false });
  });

  test("validates send message input with to as array of objects", () => {
    const result = validateSendMessageInput({
      to: [{ emailAddress: { address: "recipient@example.com" } }],
      subject: "Hello",
      body: "World",
    });

    expect(result).toEqual({
      to: ["recipient@example.com"],
      subject: "Hello",
      body: "World",
      contentType: "text",
    });
  });

  test("validates send message input with to as array of plain addresses", () => {
    const result = validateSendMessageInput({
      to: [{ address: "recipient@example.com" }],
      subject: "Hello",
      body: "World",
    });

    expect(result.to).toEqual(["recipient@example.com"]);
  });

  test("validates send message input with custom contentType", () => {
    const result = validateSendMessageInput({
      to: [{ address: "recipient@example.com" }],
      subject: "HTML Test",
      body: "<b>Bold</b>",
      contentType: "html",
    });

    expect(result.contentType).toBe("html");
  });

  test("rejects invalid send message input", () => {
    expect(() => validateSendMessageInput("not an object")).toThrow();
    expect(() => validateSendMessageInput({})).toThrow();
    expect(() => validateSendMessageInput({ to: "not array", subject: "Hello", body: "World" })).toThrow();
    expect(() => validateSendMessageInput({ to: [{ address: "" }], subject: "Hello", body: "World" })).toThrow();
    expect(() => validateSendMessageInput({ to: [{ address: "valid@example.com" }], subject: "", body: "World" })).toThrow();
  });

  test("send message posts to Graph API and returns on 202", async () => {
    const requests: Request[] = [];
    const client = createOutlookClient({
      accessToken: "test-token",
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return new Response(null, { status: 202 });
      },
    });

    const result = await client.send({
      to: [{ address: "recipient@example.com" }],
      subject: "Test",
      body: "Hello",
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toContain("https://graph.microsoft.com/v1.0/me/sendMail");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer test-token");
    expect(result.ok).toBe(true);
  });

  test("send message maps Graph 429 to rate limit error", async () => {
    const client = createOutlookClient({
      accessToken: "test-token",
      fetch: async () => new Response(JSON.stringify({ error: { code: "ErrorActivityLimitReached" } }), {
        status: 429,
        headers: { "Retry-After": "30" },
      }),
    });

    const result = await client.send({
      to: [{ address: "test@example.com" }],
      subject: "Test",
      body: "Hello",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("CONNECTOR_RATE_LIMITED");
      expect(result.error.retryAfterSeconds).toBe(30);
    }
  });

  test("send message maps non-202/429 to upstream error", async () => {
    const client = createOutlookClient({
      accessToken: "test-token",
      fetch: async () => new Response(JSON.stringify({ error: { code: "ErrorInvalidRequest" } }), {
        status: 400,
      }),
    });

    const result = await client.send({
      to: [{ address: "test@example.com" }],
      subject: "Test",
      body: "Hello",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("CONNECTOR_UPSTREAM_ERROR");
    }
  });
});
