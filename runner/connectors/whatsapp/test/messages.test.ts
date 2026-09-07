import { describe, expect, test } from "bun:test";
import fixture from "../fixtures/send_message.json";
import manifest from "../manifest.json";
import {
  createWhatsAppMessagesClient,
  mapWhatsAppError,
  validateSendMessageInput,
} from "../src/messages";

describe("whatsapp connector foundation", () => {
  test("manifest declares WhatsApp action operations and network controls", () => {
    expect(manifest.key).toBe("whatsapp");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.network.allowedHosts).toContain("graph.facebook.com");
    expect(manifest.operations["messages.send"].kind).toBe("action");
    expect(manifest.models).toContain("message");
  });

  test("validates send message input", () => {
    expect(validateSendMessageInput({
      phoneNumberId: "123456789",
      to: "15551234567",
      text: "hello from whatsapp",
    })).toEqual({
      graphVersion: "v25.0",
      phoneNumberId: "123456789",
      to: "15551234567",
      text: "hello from whatsapp",
    });

    expect(() => validateSendMessageInput({ phoneNumberId: "", to: "15551234567", text: "hello" })).toThrow();
    expect(() => validateSendMessageInput({ phoneNumberId: "123", to: "", text: "hello" })).toThrow();
    expect(() => validateSendMessageInput({ phoneNumberId: "123", to: "15551234567", text: "" })).toThrow();
    expect(() => validateSendMessageInput({ phoneNumberId: "123", to: "15551234567", text: "x".repeat(4097) })).toThrow();
    expect(() => validateSendMessageInput({ graphVersion: "../v25.0", phoneNumberId: "123", to: "15551234567", text: "hello" })).toThrow();
  });

  test("messages.send posts to WhatsApp Cloud API and returns provider metadata", async () => {
    const requests: Request[] = [];
    const client = createWhatsAppMessagesClient({
      accessToken: "meta-test-token",
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return Response.json(fixture);
      },
    });

    const result = await client.send({
      phoneNumberId: "123456789",
      to: "15551234567",
      text: "hello from whatsapp",
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://graph.facebook.com/v25.0/123456789/messages");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer meta-test-token");
    expect(requests[0].headers.get("Content-Type")).toBe("application/json");
    expect(await requests[0].json()).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "15551234567",
      type: "text",
      text: { body: "hello from whatsapp" },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.message.providerMessageId).toBe(fixture.messages[0].id);
      expect(result.message.channelId).toBe("123456789");
      expect(result.message.text).toBe("hello from whatsapp");
    }
  });

  test("messages.send maps rate limits to a stable connector error", async () => {
    const client = createWhatsAppMessagesClient({
      accessToken: "meta-secret-token",
      fetch: async () => Response.json({
        error: {
          code: 130429,
          message: "Rate limit hit",
          type: "OAuthException",
        },
      }, { status: 400 }),
    });

    const result = await client.send({ phoneNumberId: "123456789", to: "15551234567", text: "hello" });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "CONNECTOR_RATE_LIMITED",
        message: "The upstream provider rate limited this request.",
        providerError: "Rate limit hit",
      },
    });
    expect(JSON.stringify(result)).not.toContain("meta-secret-token");
  });

  test("maps WhatsApp provider errors without leaking request secrets", () => {
    const error = mapWhatsAppError({ status: 401 }, {
      error: {
        code: 190,
        message: "Invalid OAuth access token.",
      },
    });

    expect(error).toEqual({
      code: "CONNECTOR_UPSTREAM_ERROR",
      message: "WhatsApp rejected the message send request.",
      providerError: "Invalid OAuth access token.",
    });
  });
});
