import { describe, expect, it } from "bun:test";
import { normalizeEmail, parseEmailsResponse } from "../src/objects";

describe("normalizeEmail", () => {
  it("normalizes an email with all fields", () => {
    const result = normalizeEmail({
      id: "msg-001",
      from: "sender@example.com",
      to: ["recipient@example.com"],
      cc: ["cc@example.com"],
      bcc: ["bcc@example.com"],
      subject: "Hello World",
      text_body: "Plain text content",
      html_body: "<p>HTML content</p>",
      reply_to: "reply@example.com",
      headers: { "X-Custom": "value", "Message-ID": "abc123" },
      sent_at: "2025-06-01T10:30:00Z",
    });
    expect(result.id).toBe("smtp-email:msg-001");
    expect(result.provider).toBe("smtp-email");
    expect(result.providerEmailId).toBe("msg-001");
    expect(result.from).toBe("sender@example.com");
    expect(result.to).toEqual(["recipient@example.com"]);
    expect(result.cc).toEqual(["cc@example.com"]);
    expect(result.bcc).toEqual(["bcc@example.com"]);
    expect(result.subject).toBe("Hello World");
    expect(result.textBody).toBe("Plain text content");
    expect(result.htmlBody).toBe("<p>HTML content</p>");
    expect(result.replyTo).toBe("reply@example.com");
    expect(result.headers).toEqual({ "X-Custom": "value", "Message-ID": "abc123" });
    expect(result.sentAt).toBe("2025-06-01T10:30:00Z");
    expect(result.modelVersion).toBe("2026-05-17");
  });

  it("defaults missing string fields to empty string", () => {
    const result = normalizeEmail({ id: "msg-002" });
    expect(result.from).toBe("");
    expect(result.subject).toBe("");
    expect(result.textBody).toBe("");
    expect(result.htmlBody).toBe("");
    expect(result.replyTo).toBe("");
    expect(result.sentAt).toBe("");
  });

  it("defaults missing array fields to empty array", () => {
    const result = normalizeEmail({ id: "msg-003" });
    expect(result.to).toEqual([]);
    expect(result.cc).toEqual([]);
    expect(result.bcc).toEqual([]);
  });

  it("filters non-string values from to/cc/bcc arrays", () => {
    const result = normalizeEmail({
      id: "msg-004",
      to: ["a@example.com", 123, null, "b@example.com"],
      cc: [42, "cc@example.com"],
      bcc: [undefined, "bcc@example.com"],
    });
    expect(result.to).toEqual(["a@example.com", "b@example.com"]);
    expect(result.cc).toEqual(["cc@example.com"]);
    expect(result.bcc).toEqual(["bcc@example.com"]);
  });

  it("defaults missing headers to empty object", () => {
    const result = normalizeEmail({ id: "msg-005" });
    expect(result.headers).toEqual({});
  });

  it("filters non-string header values", () => {
    const result = normalizeEmail({
      id: "msg-006",
      headers: { "X-String": "ok", "X-Number": 42, "X-Null": null },
    });
    expect(result.headers).toEqual({ "X-String": "ok" });
  });

  it("preserves raw object", () => {
    const raw = { id: "msg-007", from: "test@example.com" };
    const result = normalizeEmail(raw);
    expect(result.raw).toBe(raw);
  });
});

describe("parseEmailsResponse", () => {
  it("parses an emails response", () => {
    const result = parseEmailsResponse({
      emails: [
        { id: "msg-a", from: "a@example.com", to: ["r@example.com"], subject: "First" },
        { id: "msg-b", from: "b@example.com", to: ["s@example.com"], subject: "Second" },
      ],
    });
    expect(result.emails).toHaveLength(2);
    expect(result.emails[0].id).toBe("smtp-email:msg-a");
    expect(result.emails[0].subject).toBe("First");
    expect(result.emails[1].id).toBe("smtp-email:msg-b");
    expect(result.emails[1].subject).toBe("Second");
  });

  it("returns empty for null input", () => {
    const result = parseEmailsResponse(null);
    expect(result.emails).toEqual([]);
  });

  it("returns empty for non-object input", () => {
    const result = parseEmailsResponse("string");
    expect(result.emails).toEqual([]);
  });

  it("returns empty when emails is not an array", () => {
    const result = parseEmailsResponse({ emails: "not-array" });
    expect(result.emails).toEqual([]);
  });

  it("returns empty for empty emails array", () => {
    const result = parseEmailsResponse({ emails: [] });
    expect(result.emails).toEqual([]);
  });

  it("filters out non-record entries in emails", () => {
    const result = parseEmailsResponse({ emails: [null, "string", { id: "ok" }, 42] });
    expect(result.emails).toHaveLength(1);
    expect(result.emails[0].id).toBe("smtp-email:ok");
  });

  it("returns empty for object without emails key", () => {
    const result = parseEmailsResponse({});
    expect(result.emails).toEqual([]);
  });
});
