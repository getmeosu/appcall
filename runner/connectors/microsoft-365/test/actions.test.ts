import { describe, expect, test } from "bun:test";
import {
  sendMessage,
  getMessage,
  replyMessage,
  moveMessage,
  deleteMessage,
  listMailFolders,
  createEvent,
  updateEvent,
  deleteEvent,
  getEvent,
  getDriveItem,
  deleteDriveItem,
  copyDriveItem,
  createContact,
  listContacts,
} from "../src/actions";

describe("microsoft-365 connector actions", () => {
  // ─── sendMessage ─────────────────────────────────────────────────────────────

  test("sendMessage validates input and marks connector-owned output", () => {
    const result = sendMessage({
      to: [{ address: "recipient@example.com" }],
      subject: "Hello",
      body: "World",
    });

    expect(result.source).toBe("connector");
    expect(result.connector).toBe("microsoft-365");
    expect(result.action).toBe("messages.send");
    expect(result.validated.to).toEqual(["recipient@example.com"]);
    expect(result.validated.subject).toBe("Hello");
    expect(result.validated.body).toBe("World");
  });

  test("sendMessage rejects invalid input", () => {
    expect(() => sendMessage("not an object")).toThrow();
    expect(() => sendMessage({ to: [{ address: "test@example.com" }], subject: "", body: "World" })).toThrow();
  });

  test("sendMessage posts to Graph API with connector-owned raw HTTP", async () => {
    const requests: Request[] = [];
    const result = await sendMessage({
      accessToken: "test-token",
      to: [{ address: "recipient@example.com" }],
      subject: "Test",
      body: "Hello",
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return new Response(null, { status: 202 });
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toContain("https://graph.microsoft.com/v1.0/me/sendMail");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer test-token");
    expect(result).toEqual({
      connector: "microsoft-365",
      action: "messages.send",
      source: "connector",
      sent: true,
    });
  });

  test("sendMessage maps Graph 429 to rate limit error", async () => {
    await expect(sendMessage({
      accessToken: "test-token",
      to: [{ address: "test@example.com" }],
      subject: "Test",
      body: "Hello",
      fetch: async () => new Response(JSON.stringify({ error: { code: "ErrorActivityLimitReached" } }), {
        status: 429,
        headers: { "Retry-After": "45" },
      }),
    })).rejects.toEqual({
      ok: false,
      code: "CONNECTOR_RATE_LIMITED",
      message: "Outlook rate limit exceeded.",
      retryAfterSeconds: 45,
    });
  });

  // ─── getMessage ──────────────────────────────────────────────────────────────

  test("getMessage validates input without auth", () => {
    const result = getMessage({ messageId: "msg123" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("messages.get");
    expect(result.validated.messageId).toBe("msg123");
  });

  test("getMessage fetches from Graph API with Bearer token", async () => {
    const requests: Request[] = [];
    const fixture = { id: "msg123", subject: "Hello", conversationId: "conv1", from: { emailAddress: { address: "a@b.com" } } };
    const result = await getMessage({
      accessToken: "tok-get",
      messageId: "msg123",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(fixture), { status: 200, headers: { "Content-Type": "application/json" } });
      },
    });

    expect(requests[0].url).toContain("/me/messages/");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer tok-get");
    expect(result.action).toBe("messages.get");
    expect(result.source).toBe("connector");
  });

  // ─── replyMessage ────────────────────────────────────────────────────────────

  test("replyMessage validates input without auth", () => {
    const result = replyMessage({ messageId: "msg1", comment: "Got it" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("messages.reply");
    expect(result.validated.comment).toBe("Got it");
  });

  test("replyMessage posts to Graph API with Bearer token", async () => {
    const requests: Request[] = [];
    const result = await replyMessage({
      accessToken: "tok-reply",
      messageId: "msg1",
      comment: "Thanks",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(null, { status: 202 });
      },
    });

    expect(requests[0].url).toContain("/reply");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer tok-reply");
    expect(result.replied).toBe(true);
  });

  // ─── moveMessage ─────────────────────────────────────────────────────────────

  test("moveMessage validates input without auth", () => {
    const result = moveMessage({ messageId: "msg1", destinationId: "inbox" });
    expect(result.validated.destinationId).toBe("inbox");
  });

  test("moveMessage posts to Graph API with Bearer token", async () => {
    const requests: Request[] = [];
    const result = await moveMessage({
      accessToken: "tok-move",
      messageId: "msg1",
      destinationId: "inbox",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify({ id: "moved-msg-id" }), { status: 201, headers: { "Content-Type": "application/json" } });
      },
    });

    expect(requests[0].url).toContain("/move");
    expect(result.messageId).toBe("moved-msg-id");
  });

  // ─── deleteMessage ───────────────────────────────────────────────────────────

  test("deleteMessage validates input without auth", () => {
    const result = deleteMessage({ messageId: "msg99" });
    expect(result.validated.messageId).toBe("msg99");
  });

  test("deleteMessage sends DELETE with Bearer token", async () => {
    const requests: Request[] = [];
    const result = await deleteMessage({
      accessToken: "tok-del",
      messageId: "msg99",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(null, { status: 204 });
      },
    });

    expect(requests[0].method).toBe("DELETE");
    expect(result.deleted).toBe(true);
  });

  // ─── listMailFolders ─────────────────────────────────────────────────────────

  test("listMailFolders returns validated stub without auth", () => {
    const result = listMailFolders({});
    expect(result.action).toBe("mailFolders.list");
    expect(result.source).toBe("connector");
  });

  test("listMailFolders fetches from Graph API with Bearer token", async () => {
    const requests: Request[] = [];
    const fixture = { value: [{ id: "inbox", displayName: "Inbox", totalItemCount: 5, unreadItemCount: 2 }] };
    const result = await listMailFolders({
      accessToken: "tok-folders",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(fixture), { status: 200, headers: { "Content-Type": "application/json" } });
      },
    });

    expect(requests[0].url).toContain("/mailFolders");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer tok-folders");
    expect(result.folders).toHaveLength(1);
  });

  // ─── createEvent ─────────────────────────────────────────────────────────────

  test("createEvent validates input without auth", () => {
    const result = createEvent({
      subject: "Team Meeting",
      start: { dateTime: "2026-06-01T09:00:00", timeZone: "UTC" },
      end: { dateTime: "2026-06-01T10:00:00", timeZone: "UTC" },
    });
    expect(result.action).toBe("events.create");
    expect(result.validated.subject).toBe("Team Meeting");
  });

  test("createEvent POSTs to Graph API with Bearer token", async () => {
    const requests: Request[] = [];
    const fixture = { id: "new-evt", subject: "Team Meeting", start: { dateTime: "2026-06-01T09:00:00", timeZone: "UTC" }, end: { dateTime: "2026-06-01T10:00:00", timeZone: "UTC" } };
    const result = await createEvent({
      accessToken: "tok-evt",
      subject: "Team Meeting",
      start: { dateTime: "2026-06-01T09:00:00", timeZone: "UTC" },
      end: { dateTime: "2026-06-01T10:00:00", timeZone: "UTC" },
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(fixture), { status: 201, headers: { "Content-Type": "application/json" } });
      },
    });

    expect(requests[0].url).toContain("/me/events");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer tok-evt");
    expect(result.event.providerEventId).toBe("new-evt");
  });

  // ─── updateEvent ─────────────────────────────────────────────────────────────

  test("updateEvent validates input without auth", () => {
    const result = updateEvent({ eventId: "evt1", subject: "Updated" });
    expect(result.validated.eventId).toBe("evt1");
  });

  // ─── deleteEvent ─────────────────────────────────────────────────────────────

  test("deleteEvent validates input without auth", () => {
    const result = deleteEvent({ eventId: "evt999" });
    expect(result.validated.eventId).toBe("evt999");
  });

  test("deleteEvent sends DELETE with Bearer token", async () => {
    const requests: Request[] = [];
    const result = await deleteEvent({
      accessToken: "tok-evt-del",
      eventId: "evt999",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(null, { status: 204 });
      },
    });

    expect(requests[0].method).toBe("DELETE");
    expect(result.deleted).toBe(true);
  });

  // ─── getEvent ────────────────────────────────────────────────────────────────

  test("getEvent validates input without auth", () => {
    const result = getEvent({ eventId: "evt42" });
    expect(result.validated.eventId).toBe("evt42");
  });

  // ─── getDriveItem ────────────────────────────────────────────────────────────

  test("getDriveItem validates input without auth", () => {
    const result = getDriveItem({ itemId: "item001" });
    expect(result.validated.itemId).toBe("item001");
  });

  test("getDriveItem GETs from Graph API with Bearer token", async () => {
    const requests: Request[] = [];
    const fixture = { id: "item001", name: "doc.docx", file: { mimeType: "application/docx" } };
    const result = await getDriveItem({
      accessToken: "tok-drive",
      itemId: "item001",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(fixture), { status: 200, headers: { "Content-Type": "application/json" } });
      },
    });

    expect(requests[0].url).toContain("/me/drive/items/item001");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer tok-drive");
    expect(result.item.name).toBe("doc.docx");
  });

  // ─── deleteDriveItem ─────────────────────────────────────────────────────────

  test("deleteDriveItem validates input without auth", () => {
    const result = deleteDriveItem({ itemId: "item-del" });
    expect(result.validated.itemId).toBe("item-del");
  });

  test("deleteDriveItem sends DELETE with Bearer token", async () => {
    const requests: Request[] = [];
    const result = await deleteDriveItem({
      accessToken: "tok-drive-del",
      itemId: "item-del",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(null, { status: 204 });
      },
    });

    expect(requests[0].method).toBe("DELETE");
    expect(result.deleted).toBe(true);
  });

  // ─── copyDriveItem ───────────────────────────────────────────────────────────

  test("copyDriveItem validates input without auth", () => {
    const result = copyDriveItem({ itemId: "src", destinationId: "dst" });
    expect(result.validated.itemId).toBe("src");
  });

  // ─── createContact ───────────────────────────────────────────────────────────

  test("createContact validates input without auth", () => {
    const result = createContact({ givenName: "Alice" });
    expect(result.action).toBe("contacts.create");
    expect(result.validated.givenName).toBe("Alice");
  });

  test("createContact POSTs to Graph API with Bearer token", async () => {
    const requests: Request[] = [];
    const fixture = { id: "new-contact", givenName: "Alice", displayName: "Alice" };
    const result = await createContact({
      accessToken: "tok-contact",
      givenName: "Alice",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(fixture), { status: 201, headers: { "Content-Type": "application/json" } });
      },
    });

    expect(requests[0].url).toContain("/me/contacts");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer tok-contact");
    expect(result.contact.givenName).toBe("Alice");
  });

  // ─── listContacts ────────────────────────────────────────────────────────────

  test("listContacts returns validated stub without auth", () => {
    const result = listContacts({});
    expect(result.action).toBe("contacts.list");
  });

  test("listContacts GETs from Graph API with Bearer token", async () => {
    const requests: Request[] = [];
    const fixture = { value: [{ id: "c1", givenName: "Bob", displayName: "Bob" }] };
    const result = await listContacts({
      accessToken: "tok-contacts",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(fixture), { status: 200, headers: { "Content-Type": "application/json" } });
      },
    });

    expect(requests[0].url).toContain("/me/contacts");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer tok-contacts");
    expect(result.contacts).toHaveLength(1);
  });
});
