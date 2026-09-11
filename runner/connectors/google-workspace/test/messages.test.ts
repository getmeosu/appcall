import { describe, expect, test } from "bun:test";
import messagesListFixture from "../fixtures/messages_list.json";
import messagesNoPageFixture from "../fixtures/messages_list_no_page.json";
import sendMessageFixture from "../fixtures/send_message.json";
import rateLimitedFixture from "../fixtures/rate_limited.json";
import draftCreateFixture from "../fixtures/draft_create.json";
import {
  createGmailClient,
  normalizeGmailMessage,
  parseMessagesListResponse,
  validateSendMessageInput,
} from "../src/messages";
import { parseGoogleError, parseGoogleRateLimitMetadata, parseNextPageToken } from "../src/http";

type HeaderField = "to" | "subject";
type WriteField = HeaderField | "body";
type GmailWriteOperation = "messages.send" | "drafts.create";
type HeaderPosition = "leading" | "middle" | "trailing";

const invalidHeaderCases: Array<{
  operation: GmailWriteOperation;
  field: HeaderField;
  newline: "\r" | "\n" | "\r\n";
  position: HeaderPosition;
}> = [
  ...(["messages.send", "drafts.create"] as const).flatMap((operation) =>
    (["to", "subject"] as const).flatMap((field) =>
      (["\r", "\n", "\r\n"] as const).flatMap((newline) =>
        (["leading", "middle", "trailing"] as const).map((position) => ({ operation, field, newline, position })),
      ),
    ),
  ),
];

const malformedUnicodeCases = (["to", "subject", "body"] as const).flatMap((field) => [
  { field, label: "a lone high surrogate", value: "\uD800" },
  { field, label: "a lone low surrogate", value: "\uDC00" },
  { field, label: "a high surrogate in the middle of a string", value: "before\uD800after" },
  { field, label: "a low surrogate in the middle of a string", value: "before\uDC00after" },
]);

const validUnicodeCases: Array<{ field: WriteField; label: string; value: string }> = [
  { field: "to", label: "a paired emoji", value: "recipient😀@example.com" },
  { field: "to", label: "a literal replacement character", value: "recipient�@example.com" },
  { field: "subject", label: "a paired emoji", value: "Subject 😀" },
  { field: "subject", label: "a literal replacement character", value: "Subject �" },
  { field: "body", label: "a paired emoji", value: "Body 😀" },
  { field: "body", label: "a literal replacement character", value: "Body �" },
];

function writeInputWithFieldValue(field: WriteField, value: string): { to: string; subject: string; body: string } {
  return {
    to: field === "to" ? value : "recipient@example.com",
    subject: field === "subject" ? value : "Test subject",
    body: field === "body" ? value : "Body",
  };
}

function addNewline(value: string, newline: string, position: HeaderPosition): string {
  if (position === "leading") return `${newline}${value}`;
  if (position === "trailing") return `${value}${newline}`;
  const midpoint = Math.floor(value.length / 2);
  return `${value.slice(0, midpoint)}${newline}${value.slice(midpoint)}`;
}

async function decodeRawMime(request: Request): Promise<string> {
  const payload = await request.clone().json() as { raw?: unknown };
  if (typeof payload.raw !== "string") throw new Error("raw MIME payload is missing");
  return Buffer.from(payload.raw, "base64url").toString("utf8");
}

function readSubjectValue(rawMime: string): string {
  const lines = rawMime.split("\r\n");
  const subjectIndex = lines.findIndex((line) => line.startsWith("Subject:"));
  if (subjectIndex < 0) throw new Error("Subject header is missing");
  const firstLineValue = lines[subjectIndex].slice("Subject:".length);
  const subjectLines = [firstLineValue.startsWith(" ") ? firstLineValue.slice(1) : firstLineValue];
  for (let index = subjectIndex + 1; index < lines.length && lines[index].startsWith(" "); index += 1) {
    subjectLines.push(lines[index].slice(1));
  }
  return subjectLines.join("");
}

function decodeSubject(rawMime: string): string {
  return readSubjectValue(rawMime).replace(/=\?UTF-8\?B\?([A-Za-z0-9+/=]+)\?=/g, (_word, encoded: string) => {
    return Buffer.from(encoded, "base64").toString("utf8");
  });
}

function readEncodedSubjectWords(rawMime: string): string[] {
  return readSubjectValue(rawMime).split(/(?==\?UTF-8\?B\?)/);
}

describe("google-workspace messages", () => {
  test("normalizes Gmail message from fixture", () => {
    const message = normalizeGmailMessage(messagesListFixture.messages[0]);

    expect(message.id).toBe("gmail:18e4a3c29a8d7a7e");
    expect(message.provider).toBe("google-workspace");
    expect(message.providerMessageId).toBe("18e4a3c29a8d7a7e");
    expect(message.threadId).toBe("18e4a3c29a8d7a7e");
    expect(message.senderId).toBe("sender@example.com");
    expect(message.subject).toBe("Test message");
    expect(message.text).toBe("Hello from Google Workspace connector");
    expect(message.modelVersion).toBe("2026-05-16");
    expect(message.raw.snippet).toBe("Hello from Google Workspace connector");
  });

  test("extracts sender from angle bracket format", () => {
    const message = normalizeGmailMessage({
      id: "abc",
      threadId: "abc",
      payload: {
        headers: [{ name: "From", value: "John Doe <john@example.com>" }],
      },
    });

    expect(message.senderId).toBe("john@example.com");
  });

  test("normalizes a mixed Gmail page without inventing a missing sender", () => {
    const messages = [messagesListFixture.messages[0], messagesListFixture.messages[1]].map(normalizeGmailMessage);

    expect(messages.map((message) => message.senderId)).toEqual(["sender@example.com", ""]);
    expect(messages[1].id).toBe("gmail:18e4a3c29a8d7a7f");
  });

  test("extracts next page token from response", () => {
    expect(parseNextPageToken(messagesListFixture)).toBe("page_token_abc123");
    expect(parseNextPageToken(messagesNoPageFixture)).toBeNull();
    expect(parseNextPageToken(null)).toBeNull();
    expect(parseNextPageToken("not an object")).toBeNull();
  });

  test("parses messages list response", () => {
    const parsed = parseMessagesListResponse(messagesListFixture);

    expect(parsed.messages).toHaveLength(2);
    expect(parsed.messages[0].id).toBe("18e4a3c29a8d7a7e");
    expect(parsed.messages[1].id).toBe("18e4a3c29a8d7a7f");
    expect(parsed.nextPageToken).toBe("page_token_abc123");
  });

  test("parses empty messages list response", () => {
    const parsed = parseMessagesListResponse({ messages: [] });

    expect(parsed.messages).toHaveLength(0);
    expect(parsed.nextPageToken).toBeNull();
  });

  test("parses Google rate limit metadata", () => {
    expect(parseGoogleRateLimitMetadata(429, { "retry-after": "30" })).toEqual({
      limited: true,
      retryAfterSeconds: 30,
    });
    expect(parseGoogleRateLimitMetadata(200, {})).toEqual({ limited: false });
  });

  test("parses Google error response", () => {
    const error = parseGoogleError(rateLimitedFixture);

    expect(error).not.toBeNull();
    expect(error!.code).toBe("CONNECTOR_RATE_LIMITED");
    expect(error!.message).toBe("Rate Limit Exceeded");
    expect(error!.retryAfterSeconds).toBe(30);
  });

  test("validates send message input", () => {
    expect(validateSendMessageInput({ to: "test@example.com", subject: "Hello", body: "World" })).toEqual({
      to: "test@example.com",
      subject: "Hello",
      body: "World",
    });

    expect(() => validateSendMessageInput({ to: "", subject: "Hello", body: "World" })).toThrow();
    expect(() => validateSendMessageInput({ to: "test@example.com", subject: "", body: "World" })).toThrow();
    expect(() => validateSendMessageInput("not an object")).toThrow();
  });

  test("send message posts to Gmail API and normalizes response", async () => {
    const requests: Request[] = [];
    const client = createGmailClient({
      accessToken: "ya29.test-token",
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return Response.json(sendMessageFixture);
      },
    });

    const result = await client.send({ to: "recipient@example.com", subject: "Test", body: "Hello" });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://gmail.googleapis.com/gmail/v1/users/me/messages/send");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer ya29.test-token");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.message.id).toBe("18e4a3c29a8d7a80");
      expect(result.message.threadId).toBe("18e4a3c29a8d7a80");
    }
  });

  test("send message encodes headers and preserves multiline body", async () => {
    const requests: Request[] = [];
    const body = "first line\nsecond line\r\nthird line";
    const client = createGmailClient({
      accessToken: "ya29.test-token",
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return Response.json(sendMessageFixture);
      },
    });

    await client.send({ to: "recipient@example.com", subject: "Test", body });

    expect(requests).toHaveLength(1);
    expect(await decodeRawMime(requests[0])).toBe(
      `To: recipient@example.com\r\nSubject: Test\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`,
    );
  });

  test("send message preserves Unicode body and RFC 2047 subject encoding", async () => {
    const requests: Request[] = [];
    const subject = "Résumé 日本語 🚀";
    const body = "Café 世界 🚀\nsecond line\r\nthird line";
    const client = createGmailClient({
      accessToken: "ya29.test-token",
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return Response.json(sendMessageFixture);
      },
    });

    await client.send({ to: "recipient@example.com", subject, body });

    const rawMime = await decodeRawMime(requests[0]);
    expect(decodeSubject(rawMime)).toBe(subject);
    expect(rawMime).toContain("MIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n");
    expect(rawMime.endsWith(body)).toBe(true);
  });

  test("drafts.create preserves Unicode body and RFC 2047 subject encoding", async () => {
    const requests: Request[] = [];
    const subject = "下書き café 🚀";
    const body = "こんにちは, café 🚀\nsecond line\r\nthird line";
    const client = createGmailClient({
      accessToken: "ya29.test-token",
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return Response.json(draftCreateFixture);
      },
    });

    await client.createDraft({ to: "recipient@example.com", subject, body });

    const payload = await requests[0].clone().json() as { message?: { raw?: unknown } };
    expect(typeof payload.message?.raw).toBe("string");
    const rawMime = Buffer.from(payload.message!.raw as string, "base64url").toString("utf8");
    expect(decodeSubject(rawMime)).toBe(subject);
    expect(rawMime).toContain("MIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n");
    expect(rawMime.endsWith(body)).toBe(true);
  });

  test("splits long non-BMP subjects at codepoint boundaries into padded encoded words", async () => {
    const requests: Request[] = [];
    const subject = "🚀".repeat(20);
    const client = createGmailClient({
      accessToken: "ya29.test-token",
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return Response.json(sendMessageFixture);
      },
    });

    await client.send({ to: "recipient@example.com", subject, body: "Body" });

    const rawMime = await decodeRawMime(requests[0]);
    const words = readEncodedSubjectWords(rawMime);
    expect(words.length).toBeGreaterThan(1);
    expect(rawMime).toContain("Subject:\r\n =?UTF-8?B?");
    expect(rawMime).toContain("\r\n =?UTF-8?B?");
    expect(rawMime.split("\r\n").filter((line) => line.includes("=?UTF-8?B?")).every((line) => line.length <= 76)).toBe(true);
    expect(words.every((word) => word.length <= 75)).toBe(true);
    expect(words.every((word) => /^=\?UTF-8\?B\?[A-Za-z0-9+/]+={0,2}\?=$/.test(word))).toBe(true);
    const encodedPayloads = words.map((word) => word.slice("=?UTF-8?B?".length, -"?=".length));
    expect(encodedPayloads.some((payload) => /=+$/.test(payload))).toBe(true);
    expect(encodedPayloads.some((payload) => /[-_]/.test(payload))).toBe(false);
    expect(decodeSubject(rawMime)).toBe(subject);
  });

  for (const testCase of invalidHeaderCases) {
    test(`${testCase.operation} rejects ${testCase.field} ${JSON.stringify(testCase.newline)} in ${testCase.position} position before dispatch`, async () => {
      let fetchCalls = 0;
      const client = createGmailClient({
        accessToken: "ya29.test-token",
        fetch: async () => {
          fetchCalls += 1;
          return Response.json(sendMessageFixture);
        },
      });
      const invalidValue = testCase.field === "to" ? "recipient@example.com" : "Test subject";
      const input = {
        to: testCase.field === "to"
          ? addNewline(invalidValue, testCase.newline, testCase.position)
          : "recipient@example.com",
        subject: testCase.field === "subject"
          ? addNewline(invalidValue, testCase.newline, testCase.position)
          : "Test subject",
        body: "Body",
      };

      const result = testCase.operation === "messages.send"
        ? client.send(input)
        : client.createDraft(input);

      const error = await result.then(() => null, (reason) => reason);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe(`${testCase.field} must not contain CR or LF`);
      expect((error as Error).message).not.toContain(invalidValue);
      expect(fetchCalls).toBe(0);
    });
  }

  for (const operation of ["messages.send", "drafts.create"] as const) {
    for (const testCase of malformedUnicodeCases) {
      test(`${operation} rejects ${testCase.label} in ${testCase.field} before dispatch`, async () => {
        let fetchCalls = 0;
        const client = createGmailClient({
          accessToken: "ya29.test-token",
          fetch: async () => {
            fetchCalls += 1;
            return Response.json(operation === "messages.send" ? sendMessageFixture : draftCreateFixture);
          },
        });

        const input = writeInputWithFieldValue(testCase.field, testCase.value);
        const result = operation === "messages.send" ? client.send(input) : client.createDraft(input);
        const error = await result.then(() => null, (reason) => reason);

        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe(`${testCase.field} must contain well-formed Unicode`);
        expect((error as Error).message).not.toContain(testCase.value);
        expect(fetchCalls).toBe(0);
      });
    }

    for (const field of ["to", "subject"] as const) {
      test(`${operation} preserves CR/LF validation precedence over malformed Unicode in ${field}`, async () => {
        let fetchCalls = 0;
        const client = createGmailClient({
          accessToken: "ya29.test-token",
          fetch: async () => {
            fetchCalls += 1;
            return Response.json(operation === "messages.send" ? sendMessageFixture : draftCreateFixture);
          },
        });

        const input = writeInputWithFieldValue(field, "before\r\uD800after");
        const result = operation === "messages.send" ? client.send(input) : client.createDraft(input);
        const error = await result.then(() => null, (reason) => reason);

        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe(`${field} must not contain CR or LF`);
        expect(fetchCalls).toBe(0);
      });
    }

    for (const testCase of validUnicodeCases) {
      test(`${operation} accepts ${testCase.label} in ${testCase.field}`, async () => {
        let fetchCalls = 0;
        const client = createGmailClient({
          accessToken: "ya29.test-token",
          fetch: async () => {
            fetchCalls += 1;
            return Response.json(operation === "messages.send" ? sendMessageFixture : draftCreateFixture);
          },
        });

        const input = writeInputWithFieldValue(testCase.field, testCase.value);
        const result = operation === "messages.send" ? await client.send(input) : await client.createDraft(input);

        expect(result.ok).toBe(true);
        expect(fetchCalls).toBe(1);
      });
    }
  }

  test("drafts.create encodes headers and preserves multiline body", async () => {
    const requests: Request[] = [];
    const body = "first line\nsecond line\r\nthird line";
    const client = createGmailClient({
      accessToken: "ya29.test-token",
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return Response.json(draftCreateFixture);
      },
    });

    await client.createDraft({ to: "recipient@example.com", subject: "Draft subject", body });

    expect(requests).toHaveLength(1);
    const payload = await requests[0].clone().json() as { message?: { raw?: unknown } };
    expect(typeof payload.message?.raw).toBe("string");
    expect(Buffer.from(payload.message!.raw as string, "base64url").toString("utf8")).toBe(
      `To: recipient@example.com\r\nSubject: Draft subject\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`,
    );
  });

  test("send message maps Gmail rate limits to safe connector error", async () => {
    const client = createGmailClient({
      accessToken: "ya29.test-token",
      fetch: async () => new Response(JSON.stringify(rateLimitedFixture), {
        status: 429,
        headers: { "Retry-After": "30" },
      }),
    });

    const result = await client.send({ to: "test@example.com", subject: "Test", body: "Hello" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("CONNECTOR_RATE_LIMITED");
      expect(result.error.retryAfterSeconds).toBe(30);
    }
  });
});
