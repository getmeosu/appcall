import { describe, expect, test } from "bun:test";
import templateFixture from "../fixtures/send_template.json";
import imageFixture from "../fixtures/send_image.json";
import documentFixture from "../fixtures/send_document.json";
import locationFixture from "../fixtures/send_location.json";
import contactsFixture from "../fixtures/send_contacts.json";
import reactionFixture from "../fixtures/send_reaction.json";
import markReadFixture from "../fixtures/mark_read.json";
import interactiveFixture from "../fixtures/send_interactive.json";
import {
  validateSendTemplateInput, createSendTemplateClient,
  validateSendImageInput, createSendImageClient,
  validateSendDocumentInput, createSendDocumentClient,
  validateSendLocationInput, createSendLocationClient,
  validateSendContactsInput, createSendContactsClient,
  validateSendReactionInput, createSendReactionClient,
  validateMarkReadInput, createMarkReadClient,
  validateSendInteractiveInput, createSendInteractiveClient,
} from "../src/media_messages";

// ─── messages.sendTemplate ────────────────────────────────────────────────────

describe("messages.sendTemplate", () => {
  test("validates sendTemplate input (static, no auth)", () => {
    const result = validateSendTemplateInput({
      phoneNumberId: "123456789",
      to: "15551234567",
      templateName: "hello_world",
      languageCode: "en_US",
      components: [],
    });
    expect(result).toEqual({
      graphVersion: "v25.0",
      phoneNumberId: "123456789",
      to: "15551234567",
      templateName: "hello_world",
      languageCode: "en_US",
      components: [],
    });
  });

  test("defaults languageCode to en_US when omitted", () => {
    const result = validateSendTemplateInput({
      phoneNumberId: "123456789",
      to: "15551234567",
      templateName: "hello_world",
    });
    expect(result.languageCode).toBe("en_US");
  });

  test("throws on missing phoneNumberId", () => {
    expect(() => validateSendTemplateInput({ to: "15551234567", templateName: "t" })).toThrow();
  });

  test("throws on missing to", () => {
    expect(() => validateSendTemplateInput({ phoneNumberId: "123", templateName: "t" })).toThrow();
  });

  test("throws on missing templateName", () => {
    expect(() => validateSendTemplateInput({ phoneNumberId: "123", to: "15551234567" })).toThrow();
  });

  test("posts template message to WhatsApp Cloud API", async () => {
    const requests: Request[] = [];
    const client = createSendTemplateClient({
      accessToken: "meta-test-token",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(templateFixture);
      },
    });

    const result = await client.sendTemplate({
      phoneNumberId: "123456789",
      to: "15551234567",
      templateName: "hello_world",
      languageCode: "en_US",
      components: [],
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://graph.facebook.com/v25.0/123456789/messages");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer meta-test-token");
    expect(await requests[0].json()).toMatchObject({
      messaging_product: "whatsapp",
      type: "template",
      to: "15551234567",
      template: { name: "hello_world", language: { code: "en_US" } },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.providerMessageId).toBe(templateFixture.messages[0].id);
    }
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    const client = createSendTemplateClient({
      accessToken: "tok",
      fetch: async () => Response.json({ error: { code: 130429, message: "Rate limited" } }, { status: 400 }),
    });
    const result = await client.sendTemplate({ phoneNumberId: "123", to: "15551234567", templateName: "t" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONNECTOR_RATE_LIMITED");
  });

  test("maps non-rate-limit error to CONNECTOR_UPSTREAM_ERROR", async () => {
    const client = createSendTemplateClient({
      accessToken: "tok",
      fetch: async () => Response.json({ error: { code: 100, message: "Invalid param" } }, { status: 400 }),
    });
    const result = await client.sendTemplate({ phoneNumberId: "123", to: "15551234567", templateName: "t" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONNECTOR_UPSTREAM_ERROR");
  });
});

// ─── messages.sendImage ───────────────────────────────────────────────────────

describe("messages.sendImage", () => {
  test("validates sendImage input (static, no auth)", () => {
    const result = validateSendImageInput({
      phoneNumberId: "123456789",
      to: "15551234567",
      imageUrl: "https://example.com/image.jpg",
      caption: "Check this out",
    });
    expect(result.imageUrl).toBe("https://example.com/image.jpg");
    expect(result.caption).toBe("Check this out");
  });

  test("throws on missing imageUrl", () => {
    expect(() => validateSendImageInput({ phoneNumberId: "123", to: "15551234567" })).toThrow();
  });

  test("posts image message to WhatsApp Cloud API", async () => {
    const requests: Request[] = [];
    const client = createSendImageClient({
      accessToken: "meta-test-token",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(imageFixture);
      },
    });

    const result = await client.sendImage({
      phoneNumberId: "123456789",
      to: "15551234567",
      imageUrl: "https://example.com/image.jpg",
      caption: "Hi",
    });

    expect(requests[0].url).toBe("https://graph.facebook.com/v25.0/123456789/messages");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer meta-test-token");
    const body = await requests[0].json();
    expect(body.type).toBe("image");
    expect(body.image.link).toBe("https://example.com/image.jpg");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.providerMessageId).toBe(imageFixture.messages[0].id);
  });

  test("maps rate limit error to CONNECTOR_RATE_LIMITED", async () => {
    const client = createSendImageClient({
      accessToken: "tok",
      fetch: async () => Response.json({ error: { code: 130429, message: "Rate limited" } }, { status: 400 }),
    });
    const result = await client.sendImage({ phoneNumberId: "123", to: "15551234567", imageUrl: "https://example.com/img.jpg" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONNECTOR_RATE_LIMITED");
  });
});

// ─── messages.sendDocument ────────────────────────────────────────────────────

describe("messages.sendDocument", () => {
  test("validates sendDocument input (static, no auth)", () => {
    const result = validateSendDocumentInput({
      phoneNumberId: "123456789",
      to: "15551234567",
      documentUrl: "https://example.com/doc.pdf",
      filename: "doc.pdf",
      caption: "Here is the file",
    });
    expect(result.documentUrl).toBe("https://example.com/doc.pdf");
    expect(result.filename).toBe("doc.pdf");
  });

  test("throws on missing documentUrl", () => {
    expect(() => validateSendDocumentInput({ phoneNumberId: "123", to: "15551234567" })).toThrow();
  });

  test("posts document message to WhatsApp Cloud API", async () => {
    const requests: Request[] = [];
    const client = createSendDocumentClient({
      accessToken: "meta-test-token",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(documentFixture);
      },
    });

    const result = await client.sendDocument({
      phoneNumberId: "123456789",
      to: "15551234567",
      documentUrl: "https://example.com/doc.pdf",
      filename: "doc.pdf",
    });

    expect(requests[0].url).toBe("https://graph.facebook.com/v25.0/123456789/messages");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer meta-test-token");
    const body = await requests[0].json();
    expect(body.type).toBe("document");
    expect(body.document.link).toBe("https://example.com/doc.pdf");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.providerMessageId).toBe(documentFixture.messages[0].id);
  });

  test("maps upstream error to CONNECTOR_UPSTREAM_ERROR", async () => {
    const client = createSendDocumentClient({
      accessToken: "tok",
      fetch: async () => Response.json({ error: { code: 100, message: "err" } }, { status: 500 }),
    });
    const result = await client.sendDocument({ phoneNumberId: "123", to: "15551234567", documentUrl: "https://example.com/doc.pdf" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONNECTOR_UPSTREAM_ERROR");
  });
});

// ─── messages.sendLocation ────────────────────────────────────────────────────

describe("messages.sendLocation", () => {
  test("validates sendLocation input (static, no auth)", () => {
    const result = validateSendLocationInput({
      phoneNumberId: "123456789",
      to: "15551234567",
      latitude: 37.7749,
      longitude: -122.4194,
      name: "San Francisco",
      address: "SF, CA",
    });
    expect(result.latitude).toBe(37.7749);
    expect(result.longitude).toBe(-122.4194);
  });

  test("throws on invalid latitude", () => {
    expect(() => validateSendLocationInput({ phoneNumberId: "123", to: "15551234567", latitude: 200, longitude: 0 })).toThrow();
  });

  test("throws on missing latitude", () => {
    expect(() => validateSendLocationInput({ phoneNumberId: "123", to: "15551234567", longitude: 0 })).toThrow();
  });

  test("posts location message to WhatsApp Cloud API", async () => {
    const requests: Request[] = [];
    const client = createSendLocationClient({
      accessToken: "meta-test-token",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(locationFixture);
      },
    });

    const result = await client.sendLocation({
      phoneNumberId: "123456789",
      to: "15551234567",
      latitude: 37.7749,
      longitude: -122.4194,
      name: "SF",
    });

    expect(requests[0].url).toBe("https://graph.facebook.com/v25.0/123456789/messages");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer meta-test-token");
    const body = await requests[0].json();
    expect(body.type).toBe("location");
    expect(body.location.latitude).toBe(37.7749);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.providerMessageId).toBe(locationFixture.messages[0].id);
  });

  test("maps rate limit to CONNECTOR_RATE_LIMITED", async () => {
    const client = createSendLocationClient({
      accessToken: "tok",
      fetch: async () => Response.json({ error: { code: 131056, message: "Rate limited" } }, { status: 400 }),
    });
    const result = await client.sendLocation({ phoneNumberId: "123", to: "15551234567", latitude: 0, longitude: 0 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONNECTOR_RATE_LIMITED");
  });
});

// ─── messages.sendContacts ────────────────────────────────────────────────────

describe("messages.sendContacts", () => {
  const sampleContact = { name: { formatted_name: "John Doe" }, phones: [{ phone: "+15551234567" }] };

  test("validates sendContacts input (static, no auth)", () => {
    const result = validateSendContactsInput({
      phoneNumberId: "123456789",
      to: "15551234567",
      contacts: [sampleContact],
    });
    expect(result.contacts).toHaveLength(1);
  });

  test("throws on empty contacts array", () => {
    expect(() => validateSendContactsInput({ phoneNumberId: "123", to: "15551234567", contacts: [] })).toThrow();
  });

  test("throws on missing contacts", () => {
    expect(() => validateSendContactsInput({ phoneNumberId: "123", to: "15551234567" })).toThrow();
  });

  test("posts contacts message to WhatsApp Cloud API", async () => {
    const requests: Request[] = [];
    const client = createSendContactsClient({
      accessToken: "meta-test-token",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(contactsFixture);
      },
    });

    const result = await client.sendContacts({
      phoneNumberId: "123456789",
      to: "15551234567",
      contacts: [sampleContact],
    });

    expect(requests[0].url).toBe("https://graph.facebook.com/v25.0/123456789/messages");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer meta-test-token");
    const body = await requests[0].json();
    expect(body.type).toBe("contacts");
    expect(Array.isArray(body.contacts)).toBe(true);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.providerMessageId).toBe(contactsFixture.messages[0].id);
  });

  test("maps upstream error to CONNECTOR_UPSTREAM_ERROR", async () => {
    const client = createSendContactsClient({
      accessToken: "tok",
      fetch: async () => Response.json({ error: { code: 100, message: "err" } }, { status: 400 }),
    });
    const result = await client.sendContacts({ phoneNumberId: "123", to: "15551234567", contacts: [sampleContact] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONNECTOR_UPSTREAM_ERROR");
  });
});

// ─── messages.sendReaction ────────────────────────────────────────────────────

describe("messages.sendReaction", () => {
  test("validates sendReaction input (static, no auth)", () => {
    const result = validateSendReactionInput({
      phoneNumberId: "123456789",
      to: "15551234567",
      messageId: "wamid.abc123",
      emoji: "👍",
    });
    expect(result.emoji).toBe("👍");
    expect(result.messageId).toBe("wamid.abc123");
  });

  test("throws on missing messageId", () => {
    expect(() => validateSendReactionInput({ phoneNumberId: "123", to: "15551234567", emoji: "👍" })).toThrow();
  });

  test("throws on missing emoji", () => {
    expect(() => validateSendReactionInput({ phoneNumberId: "123", to: "15551234567", messageId: "wamid.abc" })).toThrow();
  });

  test("posts reaction message to WhatsApp Cloud API", async () => {
    const requests: Request[] = [];
    const client = createSendReactionClient({
      accessToken: "meta-test-token",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(reactionFixture);
      },
    });

    const result = await client.sendReaction({
      phoneNumberId: "123456789",
      to: "15551234567",
      messageId: "wamid.abc123",
      emoji: "👍",
    });

    expect(requests[0].url).toBe("https://graph.facebook.com/v25.0/123456789/messages");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer meta-test-token");
    const body = await requests[0].json();
    expect(body.type).toBe("reaction");
    expect(body.reaction.emoji).toBe("👍");
    expect(body.reaction.message_id).toBe("wamid.abc123");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.providerMessageId).toBe(reactionFixture.messages[0].id);
  });

  test("maps rate limit to CONNECTOR_RATE_LIMITED", async () => {
    const client = createSendReactionClient({
      accessToken: "tok",
      fetch: async () => Response.json({ error: { code: 130429, message: "Rate limited" } }, { status: 400 }),
    });
    const result = await client.sendReaction({ phoneNumberId: "123", to: "15551234567", messageId: "wamid.x", emoji: "👍" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONNECTOR_RATE_LIMITED");
  });
});

// ─── messages.markRead ────────────────────────────────────────────────────────

describe("messages.markRead", () => {
  test("validates markRead input (static, no auth)", () => {
    const result = validateMarkReadInput({
      phoneNumberId: "123456789",
      messageId: "wamid.abc123",
    });
    expect(result.messageId).toBe("wamid.abc123");
    expect(result.phoneNumberId).toBe("123456789");
  });

  test("throws on missing messageId", () => {
    expect(() => validateMarkReadInput({ phoneNumberId: "123" })).toThrow();
  });

  test("throws on missing phoneNumberId", () => {
    expect(() => validateMarkReadInput({ messageId: "wamid.abc" })).toThrow();
  });

  test("PUTs mark-read to WhatsApp Cloud API", async () => {
    const requests: Request[] = [];
    const client = createMarkReadClient({
      accessToken: "meta-test-token",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(markReadFixture);
      },
    });

    const result = await client.markRead({
      phoneNumberId: "123456789",
      messageId: "wamid.abc123",
    });

    expect(requests[0].url).toBe("https://graph.facebook.com/v25.0/123456789/messages");
    expect(requests[0].method).toBe("PUT");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer meta-test-token");
    const body = await requests[0].json();
    expect(body.messaging_product).toBe("whatsapp");
    expect(body.status).toBe("read");
    expect(body.message_id).toBe("wamid.abc123");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.success).toBe(true);
  });

  test("maps 429 HTTP status to CONNECTOR_RATE_LIMITED", async () => {
    const client = createMarkReadClient({
      accessToken: "tok",
      fetch: async () => Response.json({ error: { code: 100, message: "err" } }, { status: 429 }),
    });
    const result = await client.markRead({ phoneNumberId: "123", messageId: "wamid.x" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONNECTOR_RATE_LIMITED");
  });

  test("maps upstream failure to CONNECTOR_UPSTREAM_ERROR", async () => {
    const client = createMarkReadClient({
      accessToken: "tok",
      fetch: async () => Response.json({ error: { code: 100, message: "bad" } }, { status: 400 }),
    });
    const result = await client.markRead({ phoneNumberId: "123", messageId: "wamid.x" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONNECTOR_UPSTREAM_ERROR");
  });
});

// ─── messages.sendInteractive ─────────────────────────────────────────────────

describe("messages.sendInteractive", () => {
  const buttonInteractive = {
    body: { text: "Pick an option" },
    action: {
      buttons: [
        { type: "reply", reply: { id: "btn1", title: "Yes" } },
        { type: "reply", reply: { id: "btn2", title: "No" } },
      ],
    },
  };

  test("validates sendInteractive input (static, no auth)", () => {
    const result = validateSendInteractiveInput({
      phoneNumberId: "123456789",
      to: "15551234567",
      interactiveType: "button",
      interactive: buttonInteractive,
    });
    expect(result.interactiveType).toBe("button");
  });

  test("throws on invalid interactiveType", () => {
    expect(() => validateSendInteractiveInput({
      phoneNumberId: "123",
      to: "15551234567",
      interactiveType: "unknown",
      interactive: buttonInteractive,
    })).toThrow();
  });

  test("throws on non-object interactive", () => {
    expect(() => validateSendInteractiveInput({
      phoneNumberId: "123",
      to: "15551234567",
      interactiveType: "button",
      interactive: "not-an-object",
    })).toThrow();
  });

  test("posts interactive message to WhatsApp Cloud API", async () => {
    const requests: Request[] = [];
    const client = createSendInteractiveClient({
      accessToken: "meta-test-token",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(interactiveFixture);
      },
    });

    const result = await client.sendInteractive({
      phoneNumberId: "123456789",
      to: "15551234567",
      interactiveType: "button",
      interactive: buttonInteractive,
    });

    expect(requests[0].url).toBe("https://graph.facebook.com/v25.0/123456789/messages");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer meta-test-token");
    const body = await requests[0].json();
    expect(body.type).toBe("interactive");
    expect(body.interactive.type).toBe("button");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.providerMessageId).toBe(interactiveFixture.messages[0].id);
  });

  test("maps rate limit to CONNECTOR_RATE_LIMITED", async () => {
    const client = createSendInteractiveClient({
      accessToken: "tok",
      fetch: async () => Response.json({ error: { code: 130429, message: "Rate limited" } }, { status: 400 }),
    });
    const result = await client.sendInteractive({
      phoneNumberId: "123",
      to: "15551234567",
      interactiveType: "button",
      interactive: buttonInteractive,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONNECTOR_RATE_LIMITED");
  });
});
