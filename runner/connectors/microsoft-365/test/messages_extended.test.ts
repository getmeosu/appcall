import { describe, expect, test } from "bun:test";
import messageGetFixture from "../fixtures/message_get.json";
import messageCreateFixture from "../fixtures/message_create.json";
import mailFoldersFixture from "../fixtures/mail_folders_list.json";
import {
  validateGetMessageInput,
  validateReplyMessageInput,
  validateMoveMessageInput,
  validateDeleteMessageInput,
  validateCreateMessageInput,
  validateGetMailFolderInput,
  createGetMessageClient,
  createReplyMessageClient,
  createMoveMessageClient,
  createDeleteMessageClient,
  createCreateMessageClient,
  createMailFoldersClient,
  parseMailFoldersResponse,
} from "../src/messages";

describe("microsoft-365 messages extended (get/reply/move/delete/mailFolders)", () => {
  // ─── Static validation ───────────────────────────────────────────────────────

  test("validateGetMessageInput returns messageId", () => {
    const result = validateGetMessageInput({ messageId: "AAMkAGI2TG93AAA=" });
    expect(result.messageId).toBe("AAMkAGI2TG93AAA=");
  });

  test("validateGetMessageInput throws on missing messageId", () => {
    expect(() => validateGetMessageInput({})).toThrow("messageId is required");
    expect(() => validateGetMessageInput("not-an-object")).toThrow();
  });

  test("validateReplyMessageInput returns messageId and comment", () => {
    const result = validateReplyMessageInput({ messageId: "AAMkAGI2TG93AAA=", comment: "Thanks!" });
    expect(result.messageId).toBe("AAMkAGI2TG93AAA=");
    expect(result.comment).toBe("Thanks!");
  });

  test("validateReplyMessageInput throws on missing fields", () => {
    expect(() => validateReplyMessageInput({ messageId: "id123" })).toThrow("comment is required");
    expect(() => validateReplyMessageInput({ comment: "hi" })).toThrow("messageId is required");
  });

  test("validateMoveMessageInput returns messageId and destinationId", () => {
    const result = validateMoveMessageInput({ messageId: "msg123", destinationId: "inbox" });
    expect(result.messageId).toBe("msg123");
    expect(result.destinationId).toBe("inbox");
  });

  test("validateDeleteMessageInput returns messageId", () => {
    const result = validateDeleteMessageInput({ messageId: "msg456" });
    expect(result.messageId).toBe("msg456");
  });

  test("validateCreateMessageInput requires subject and accepts optional recipients", () => {
    const result = validateCreateMessageInput({
      subject: "Draft: project update",
      to: ["recipient@example.com"],
      body: "Sharing the weekly status...",
    });
    expect(result.subject).toBe("Draft: project update");
    expect(result.to).toEqual(["recipient@example.com"]);
    expect(result.body).toBe("Sharing the weekly status...");
    expect(result.contentType).toBe("text");
  });

  test("validateCreateMessageInput throws on missing subject", () => {
    expect(() => validateCreateMessageInput({})).toThrow("subject is required");
    expect(() => validateCreateMessageInput("not-an-object")).toThrow();
  });

  test("validateGetMailFolderInput returns folderId", () => {
    const result = validateGetMailFolderInput({ folderId: "inbox-folder-id" });
    expect(result.folderId).toBe("inbox-folder-id");
  });

  test("validateGetMailFolderInput throws on missing folderId", () => {
    expect(() => validateGetMailFolderInput({})).toThrow("folderId is required");
  });

  test("parseMailFoldersResponse parses folders", () => {
    const result = parseMailFoldersResponse(mailFoldersFixture);
    expect(result.folders).toHaveLength(3);
    expect(result.folders[0].id).toBe("inbox-folder-id");
    expect(result.folders[0].displayName).toBe("Inbox");
    expect(result.folders[0].totalItemCount).toBe(42);
    expect(result.folders[0].unreadItemCount).toBe(5);
  });

  // ─── Mocked HTTP: messages.get ───────────────────────────────────────────────

  test("getMessage GETs /v1.0/me/messages/{id} with Bearer token", async () => {
    const requests: Request[] = [];
    const client = createGetMessageClient({
      accessToken: "tok-get",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(messageGetFixture), { status: 200, headers: { "Content-Type": "application/json" } });
      },
    });

    const result = await client.get({ messageId: "AAMkAGI2TG93AAA=" });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://graph.microsoft.com/v1.0/me/messages/AAMkAGI2TG93AAA%3D");
    expect(requests[0].method).toBe("GET");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer tok-get");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.message.providerMessageId).toBe("AAMkAGI2TG93AAA=");
      expect(result.message.subject).toBe("Project kickoff meeting");
    }
  });

  test("getMessage maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    const client = createGetMessageClient({
      accessToken: "tok-get",
      fetch: async () => new Response("{}", { status: 429, headers: { "Retry-After": "20" } }),
    });

    const result = await client.get({ messageId: "msg123" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("CONNECTOR_RATE_LIMITED");
      expect(result.error.retryAfterSeconds).toBe(20);
    }
  });

  test("getMessage maps non-200/429 to CONNECTOR_UPSTREAM_ERROR", async () => {
    const client = createGetMessageClient({
      accessToken: "tok-get",
      fetch: async () => new Response("{}", { status: 404 }),
    });

    const result = await client.get({ messageId: "missing" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONNECTOR_UPSTREAM_ERROR");
  });

  // ─── Mocked HTTP: messages.reply ─────────────────────────────────────────────

  test("replyMessage POSTs to /reply with Bearer token", async () => {
    const requests: Request[] = [];
    const client = createReplyMessageClient({
      accessToken: "tok-reply",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(null, { status: 202 });
      },
    });

    const result = await client.reply({ messageId: "AAMkAGI2TG93AAA=", comment: "Got it!" });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toContain("/me/messages/AAMkAGI2TG93AAA%3D/reply");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer tok-reply");
    expect(result.ok).toBe(true);
  });

  test("replyMessage maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    const client = createReplyMessageClient({
      accessToken: "tok-reply",
      fetch: async () => new Response("{}", { status: 429, headers: { "Retry-After": "5" } }),
    });

    const result = await client.reply({ messageId: "msg1", comment: "hi" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONNECTOR_RATE_LIMITED");
  });

  // ─── Mocked HTTP: messages.move ──────────────────────────────────────────────

  test("moveMessage POSTs to /move and returns new messageId", async () => {
    const requests: Request[] = [];
    const movedMsg = { id: "AAMkMOVED=", subject: "Moved" };
    const client = createMoveMessageClient({
      accessToken: "tok-move",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(movedMsg), { status: 201, headers: { "Content-Type": "application/json" } });
      },
    });

    const result = await client.move({ messageId: "msg123", destinationId: "inbox" });

    expect(requests[0].url).toContain("/me/messages/msg123/move");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer tok-move");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.messageId).toBe("AAMkMOVED=");
  });

  test("moveMessage maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    const client = createMoveMessageClient({
      accessToken: "tok-move",
      fetch: async () => new Response("{}", { status: 429, headers: { "Retry-After": "10" } }),
    });

    const result = await client.move({ messageId: "msg1", destinationId: "inbox" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONNECTOR_RATE_LIMITED");
  });

  // ─── Mocked HTTP: messages.delete ────────────────────────────────────────────

  test("deleteMessage sends DELETE and returns ok on 204", async () => {
    const requests: Request[] = [];
    const client = createDeleteMessageClient({
      accessToken: "tok-del",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(null, { status: 204 });
      },
    });

    const result = await client.delete({ messageId: "msgToDelete" });

    expect(requests[0].url).toContain("/me/messages/msgToDelete");
    expect(requests[0].method).toBe("DELETE");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer tok-del");
    expect(result.ok).toBe(true);
  });

  test("deleteMessage maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    const client = createDeleteMessageClient({
      accessToken: "tok-del",
      fetch: async () => new Response("{}", { status: 429, headers: { "Retry-After": "15" } }),
    });

    const result = await client.delete({ messageId: "msg1" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONNECTOR_RATE_LIMITED");
  });

  test("deleteMessage maps non-204/429 to CONNECTOR_UPSTREAM_ERROR", async () => {
    const client = createDeleteMessageClient({
      accessToken: "tok-del",
      fetch: async () => new Response("{}", { status: 403 }),
    });

    const result = await client.delete({ messageId: "msg1" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONNECTOR_UPSTREAM_ERROR");
  });

  // ─── Mocked HTTP: mailFolders.list ───────────────────────────────────────────

  test("listMailFolders GETs /v1.0/me/mailFolders with Bearer token", async () => {
    const requests: Request[] = [];
    const client = createMailFoldersClient({
      accessToken: "tok-folders",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(mailFoldersFixture), { status: 200, headers: { "Content-Type": "application/json" } });
      },
    });

    const result = await client.list({});

    expect(requests[0].url).toBe("https://graph.microsoft.com/v1.0/me/mailFolders");
    expect(requests[0].method).toBe("GET");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer tok-folders");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.folders).toHaveLength(3);
      expect(result.folders[0].displayName).toBe("Inbox");
    }
  });

  test("listMailFolders maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    const client = createMailFoldersClient({
      accessToken: "tok-folders",
      fetch: async () => new Response("{}", { status: 429, headers: { "Retry-After": "30" } }),
    });

    const result = await client.list({});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONNECTOR_RATE_LIMITED");
  });

  // ─── Mocked HTTP: messages.create ────────────────────────────────────────────

  test("createMessage POSTs a draft to /v1.0/me/messages", async () => {
    const requests: Request[] = [];
    const client = createCreateMessageClient({
      accessToken: "tok-draft",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(messageCreateFixture), { status: 201, headers: { "Content-Type": "application/json" } });
      },
    });

    const result = await client.create({
      subject: "Draft: project update",
      to: ["recipient@example.com"],
      body: "Sharing the weekly status...",
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://graph.microsoft.com/v1.0/me/messages");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer tok-draft");
    expect(await requests[0].json()).toEqual({
      subject: "Draft: project update",
      body: { contentType: "text", content: "Sharing the weekly status..." },
      toRecipients: [{ emailAddress: { address: "recipient@example.com" } }],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.message.providerMessageId).toBe("AAMkAGI2DRAFT=");
      expect(result.message.raw.isDraft).toBe(true);
    }
  });

  test("createMessage maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    const client = createCreateMessageClient({
      accessToken: "tok-draft",
      fetch: async () => new Response("{}", { status: 429, headers: { "Retry-After": "9" } }),
    });

    const result = await client.create({ subject: "Draft" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("CONNECTOR_RATE_LIMITED");
      expect(result.error.retryAfterSeconds).toBe(9);
    }
  });

  test("createMessage maps non-201/429 to CONNECTOR_UPSTREAM_ERROR", async () => {
    const client = createCreateMessageClient({
      accessToken: "tok-draft",
      fetch: async () => new Response("{}", { status: 400 }),
    });

    const result = await client.create({ subject: "Draft" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONNECTOR_UPSTREAM_ERROR");
  });

  // ─── Mocked HTTP: mailFolders.get ────────────────────────────────────────────

  test("getMailFolder GETs /v1.0/me/mailFolders/{id} with Bearer token", async () => {
    const requests: Request[] = [];
    const client = createMailFoldersClient({
      accessToken: "tok-folder-get",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(mailFoldersFixture.value[0]), { status: 200, headers: { "Content-Type": "application/json" } });
      },
    });

    const result = await client.get({ folderId: "inbox-folder-id" });

    expect(requests[0].url).toBe("https://graph.microsoft.com/v1.0/me/mailFolders/inbox-folder-id");
    expect(requests[0].method).toBe("GET");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer tok-folder-get");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.folder.id).toBe("inbox-folder-id");
      expect(result.folder.displayName).toBe("Inbox");
      expect(result.folder.totalItemCount).toBe(42);
    }
  });

  test("getMailFolder maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    const client = createMailFoldersClient({
      accessToken: "tok-folder-get",
      fetch: async () => new Response("{}", { status: 429, headers: { "Retry-After": "7" } }),
    });

    const result = await client.get({ folderId: "inbox-folder-id" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONNECTOR_RATE_LIMITED");
  });

  test("getMailFolder maps non-200/429 to CONNECTOR_UPSTREAM_ERROR", async () => {
    const client = createMailFoldersClient({
      accessToken: "tok-folder-get",
      fetch: async () => new Response("{}", { status: 404 }),
    });

    const result = await client.get({ folderId: "missing" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONNECTOR_UPSTREAM_ERROR");
  });
});
