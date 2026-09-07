import { describe, expect, test } from "bun:test";
import messageGetFixture from "../fixtures/message_get.json";
import messageModifyFixture from "../fixtures/message_modify.json";
import draftCreateFixture from "../fixtures/draft_create.json";
import labelsListFixture from "../fixtures/labels_list.json";
import rateLimitedFixture from "../fixtures/rate_limited.json";
import {
  createGmailClient,
  validateGetMessageInput,
  validateModifyMessageInput,
  validateTrashMessageInput,
  validateCreateDraftInput,
} from "../src/messages";

describe("google-workspace Gmail actions", () => {
  // ─── messages.get ───────────────────────────────────────────────────────

  test("validateGetMessageInput accepts valid input", () => {
    const result = validateGetMessageInput({ messageId: "abc123" });
    expect(result.messageId).toBe("abc123");
  });

  test("validateGetMessageInput accepts optional format", () => {
    const result = validateGetMessageInput({ messageId: "abc123", format: "metadata" });
    expect(result.format).toBe("metadata");
  });

  test("validateGetMessageInput throws on missing messageId", () => {
    expect(() => validateGetMessageInput({})).toThrow();
    expect(() => validateGetMessageInput("not-object")).toThrow();
  });

  test("getMessage fetches correct URL with Authorization header", async () => {
    const requests: Request[] = [];
    const client = createGmailClient({
      accessToken: "ya29.test-token",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(messageGetFixture);
      },
    });

    const result = await client.getMessage({ messageId: "18e4a3c29a8d7a7e" });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://gmail.googleapis.com/gmail/v1/users/me/messages/18e4a3c29a8d7a7e");
    expect(requests[0].method).toBe("GET");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer ya29.test-token");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.message.id).toBe("18e4a3c29a8d7a7e");
      expect(result.message.threadId).toBe("18e4a3c29a8d7a7e");
      expect(result.message.snippet).toBe("Hello from Google Workspace connector");
    }
  });

  test("getMessage with format param appends query string", async () => {
    const requests: Request[] = [];
    const client = createGmailClient({
      accessToken: "token",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(messageGetFixture);
      },
    });

    await client.getMessage({ messageId: "abc", format: "metadata" });
    expect(requests[0].url).toContain("format=metadata");
  });

  test("getMessage maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    const client = createGmailClient({
      accessToken: "token",
      fetch: async () => new Response(JSON.stringify(rateLimitedFixture), {
        status: 429,
        headers: { "Retry-After": "30" },
      }),
    });

    const result = await client.getMessage({ messageId: "abc" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("CONNECTOR_RATE_LIMITED");
      expect(result.error.retryAfterSeconds).toBe(30);
    }
  });

  // ─── messages.modify ────────────────────────────────────────────────────

  test("validateModifyMessageInput accepts valid input", () => {
    const r = validateModifyMessageInput({
      messageId: "abc123",
      addLabelIds: ["STARRED"],
      removeLabelIds: ["UNREAD"],
    });
    expect(r.messageId).toBe("abc123");
    expect(r.addLabelIds).toEqual(["STARRED"]);
    expect(r.removeLabelIds).toEqual(["UNREAD"]);
  });

  test("validateModifyMessageInput throws on missing messageId", () => {
    expect(() => validateModifyMessageInput({})).toThrow();
  });

  test("modifyMessage posts to correct URL with body", async () => {
    const requests: Request[] = [];
    const client = createGmailClient({
      accessToken: "ya29.test-token",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(messageModifyFixture);
      },
    });

    const result = await client.modifyMessage({
      messageId: "18e4a3c29a8d7a7e",
      removeLabelIds: ["UNREAD"],
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://gmail.googleapis.com/gmail/v1/users/me/messages/18e4a3c29a8d7a7e/modify");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer ya29.test-token");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.message.id).toBe("18e4a3c29a8d7a7e");
      expect(result.message.labelIds).toContain("INBOX");
    }
  });

  test("modifyMessage maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    const client = createGmailClient({
      accessToken: "token",
      fetch: async () => new Response(JSON.stringify(rateLimitedFixture), {
        status: 429,
        headers: { "Retry-After": "60" },
      }),
    });

    const result = await client.modifyMessage({ messageId: "abc" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONNECTOR_RATE_LIMITED");
  });

  // ─── messages.trash ─────────────────────────────────────────────────────

  test("validateTrashMessageInput accepts valid input", () => {
    const r = validateTrashMessageInput({ messageId: "abc123" });
    expect(r.messageId).toBe("abc123");
  });

  test("validateTrashMessageInput throws on missing messageId", () => {
    expect(() => validateTrashMessageInput({})).toThrow();
  });

  test("trashMessage posts to correct URL", async () => {
    const requests: Request[] = [];
    const client = createGmailClient({
      accessToken: "ya29.test-token",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(messageModifyFixture);
      },
    });

    const result = await client.trashMessage({ messageId: "18e4a3c29a8d7a7e" });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://gmail.googleapis.com/gmail/v1/users/me/messages/18e4a3c29a8d7a7e/trash");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer ya29.test-token");
    expect(result.ok).toBe(true);
  });

  test("trashMessage maps upstream error to CONNECTOR_UPSTREAM_ERROR", async () => {
    const client = createGmailClient({
      accessToken: "token",
      fetch: async () => new Response(
        JSON.stringify({ error: { code: 404, message: "Not Found", status: 404 } }),
        { status: 404 },
      ),
    });

    const result = await client.trashMessage({ messageId: "missing" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONNECTOR_UPSTREAM_ERROR");
  });

  // ─── drafts.create ──────────────────────────────────────────────────────

  test("validateCreateDraftInput accepts valid input", () => {
    const r = validateCreateDraftInput({ to: "test@example.com", subject: "Hi", body: "Hello" });
    expect(r.to).toBe("test@example.com");
    expect(r.subject).toBe("Hi");
  });

  test("validateCreateDraftInput throws on missing fields", () => {
    expect(() => validateCreateDraftInput({ to: "", subject: "Hi", body: "Hello" })).toThrow();
    expect(() => validateCreateDraftInput({ to: "test@example.com", subject: "Hi" })).toThrow();
  });

  test("createDraft posts to correct URL", async () => {
    const requests: Request[] = [];
    const client = createGmailClient({
      accessToken: "ya29.test-token",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(draftCreateFixture);
      },
    });

    const result = await client.createDraft({
      to: "recipient@example.com",
      subject: "Draft Subject",
      body: "Draft body",
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://gmail.googleapis.com/gmail/v1/users/me/drafts");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer ya29.test-token");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.draft.draftId).toBe("r-1234567890");
      expect(result.draft.messageId).toBe("18e4a3c29a8d7a81");
    }
  });

  test("createDraft maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    const client = createGmailClient({
      accessToken: "token",
      fetch: async () => new Response(JSON.stringify(rateLimitedFixture), {
        status: 429,
        headers: { "Retry-After": "10" },
      }),
    });

    const result = await client.createDraft({ to: "a@b.com", subject: "s", body: "b" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONNECTOR_RATE_LIMITED");
  });

  // ─── labels.list ────────────────────────────────────────────────────────

  test("listLabels fetches correct URL", async () => {
    const requests: Request[] = [];
    const client = createGmailClient({
      accessToken: "ya29.test-token",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(labelsListFixture);
      },
    });

    const result = await client.listLabels();

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://gmail.googleapis.com/gmail/v1/users/me/labels");
    expect(requests[0].method).toBe("GET");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer ya29.test-token");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.labels).toHaveLength(4);
      expect(result.labels[0].id).toBe("INBOX");
      expect(result.labels[3].name).toBe("My Label");
    }
  });

  test("listLabels maps upstream error to CONNECTOR_UPSTREAM_ERROR", async () => {
    const client = createGmailClient({
      accessToken: "token",
      fetch: async () => new Response(
        JSON.stringify({ error: { code: 401, message: "Unauthorized", status: 401 } }),
        { status: 401 },
      ),
    });

    const result = await client.listLabels();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONNECTOR_UPSTREAM_ERROR");
  });
});
