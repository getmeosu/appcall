import { describe, expect, test } from "bun:test";
import chatUpdateFixture from "../fixtures/chat_update.json";
import chatDeleteFixture from "../fixtures/chat_delete.json";
import chatPostEphemeralFixture from "../fixtures/chat_post_ephemeral.json";
import {
  createSlackChatClient,
  validateChatUpdateInput,
  validateChatDeleteInput,
  validateChatPostEphemeralInput,
} from "../src/chat";
import { updateMessage, deleteMessage, postEphemeral } from "../src/actions";

// ─── Validation tests ─────────────────────────────────────────────────────────

describe("chat validators", () => {
  test("validateChatUpdateInput accepts valid input", () => {
    expect(validateChatUpdateInput({ channel: "C123", ts: "1715680861.000200", text: "updated" }))
      .toEqual({ channel: "C123", ts: "1715680861.000200", text: "updated" });
  });

  test("validateChatUpdateInput rejects missing channel", () => {
    expect(() => validateChatUpdateInput({ channel: "", ts: "1715680861.000200", text: "hi" })).toThrow();
  });

  test("validateChatUpdateInput rejects missing ts", () => {
    expect(() => validateChatUpdateInput({ channel: "C123", ts: "", text: "hi" })).toThrow();
  });

  test("validateChatUpdateInput rejects empty text", () => {
    expect(() => validateChatUpdateInput({ channel: "C123", ts: "1715680861.000200", text: "" })).toThrow();
  });

  test("validateChatUpdateInput rejects oversized text", () => {
    expect(() => validateChatUpdateInput({ channel: "C123", ts: "1715680861.000200", text: "x".repeat(40001) })).toThrow();
  });

  test("validateChatDeleteInput accepts valid input", () => {
    expect(validateChatDeleteInput({ channel: "C123", ts: "1715680861.000200" }))
      .toEqual({ channel: "C123", ts: "1715680861.000200" });
  });

  test("validateChatDeleteInput rejects missing channel", () => {
    expect(() => validateChatDeleteInput({ channel: "", ts: "1715680861.000200" })).toThrow();
  });

  test("validateChatPostEphemeralInput accepts valid input", () => {
    expect(validateChatPostEphemeralInput({ channel: "C123", user: "U456", text: "ephemeral" }))
      .toEqual({ channel: "C123", user: "U456", text: "ephemeral" });
  });

  test("validateChatPostEphemeralInput rejects missing user", () => {
    expect(() => validateChatPostEphemeralInput({ channel: "C123", user: "", text: "hi" })).toThrow();
  });
});

// ─── Static validation via actions ───────────────────────────────────────────

describe("chat action static validation", () => {
  test("updateMessage returns validated without token", () => {
    const result = updateMessage({ channel: "C123", ts: "1715680861.000200", text: "new text" });
    expect((result as Record<string, unknown>).source).toBe("connector");
    expect((result as Record<string, unknown>).validated).toEqual({ channel: "C123", ts: "1715680861.000200", text: "new text" });
  });

  test("deleteMessage returns validated without token", () => {
    const result = deleteMessage({ channel: "C123", ts: "1715680861.000200" });
    expect((result as Record<string, unknown>).source).toBe("connector");
    expect((result as Record<string, unknown>).validated).toEqual({ channel: "C123", ts: "1715680861.000200" });
  });

  test("postEphemeral returns validated without token", () => {
    const result = postEphemeral({ channel: "C123", user: "U456", text: "ephemeral msg" });
    expect((result as Record<string, unknown>).source).toBe("connector");
    expect((result as Record<string, unknown>).validated).toEqual({ channel: "C123", user: "U456", text: "ephemeral msg" });
  });
});

// ─── Live (mocked) tests via client ──────────────────────────────────────────

describe("chat.update live (mocked fetch)", () => {
  test("calls chat.update endpoint with correct payload and Authorization", async () => {
    const requests: Request[] = [];
    const client = createSlackChatClient({
      token: "xoxb-test-token",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(chatUpdateFixture);
      },
    });

    const result = await client.update({ channel: "C123", ts: "1715680861.000200", text: "updated message text" });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://slack.com/api/chat.update");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer xoxb-test-token");
    expect(await requests[0].json()).toEqual({ channel: "C123", ts: "1715680861.000200", text: "updated message text" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.channel).toBe("C123");
      expect(result.ts).toBe("1715680861.000200");
      expect(result.text).toBe("updated message text");
    }
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    const client = createSlackChatClient({
      token: "xoxb-test-token",
      fetch: async () => new Response(JSON.stringify({ ok: false, error: "ratelimited" }), {
        status: 429,
        headers: { "Retry-After": "10" },
      }),
    });

    const result = await client.update({ channel: "C123", ts: "1715680861.000200", text: "hi" });
    expect(result).toEqual({
      ok: false,
      error: {
        code: "CONNECTOR_RATE_LIMITED",
        message: "The upstream provider rate limited this request.",
        retryAfterSeconds: 0,
      },
    });
  });

  test("maps Slack error body to CONNECTOR_UPSTREAM_ERROR", async () => {
    const client = createSlackChatClient({
      token: "xoxb-test-token",
      fetch: async () => Response.json({ ok: false, error: "cant_update_message" }),
    });

    const result = await client.update({ channel: "C123", ts: "1715680861.000200", text: "hi" });
    expect(result).toEqual({
      ok: false,
      error: {
        code: "CONNECTOR_UPSTREAM_ERROR",
        message: "Slack rejected the chat.update request.",
        providerError: "cant_update_message",
      },
    });
  });
});

describe("chat.delete live (mocked fetch)", () => {
  test("calls chat.delete endpoint with correct payload and Authorization", async () => {
    const requests: Request[] = [];
    const client = createSlackChatClient({
      token: "xoxb-test-token",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(chatDeleteFixture);
      },
    });

    const result = await client.delete({ channel: "C123", ts: "1715680861.000200" });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://slack.com/api/chat.delete");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer xoxb-test-token");
    expect(await requests[0].json()).toEqual({ channel: "C123", ts: "1715680861.000200" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.channel).toBe("C123");
      expect(result.ts).toBe("1715680861.000200");
    }
  });

  test("maps Slack upstream error to CONNECTOR_UPSTREAM_ERROR", async () => {
    const client = createSlackChatClient({
      token: "xoxb-test-token",
      fetch: async () => Response.json({ ok: false, error: "message_not_found" }),
    });

    const result = await client.delete({ channel: "C123", ts: "1715680861.000200" });
    expect(result).toEqual({
      ok: false,
      error: {
        code: "CONNECTOR_UPSTREAM_ERROR",
        message: "Slack rejected the chat.delete request.",
        providerError: "message_not_found",
      },
    });
  });
});

describe("chat.postEphemeral live (mocked fetch)", () => {
  test("calls chat.postEphemeral endpoint with correct payload and Authorization", async () => {
    const requests: Request[] = [];
    const client = createSlackChatClient({
      token: "xoxb-test-token",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(chatPostEphemeralFixture);
      },
    });

    const result = await client.postEphemeral({ channel: "C123", user: "U456", text: "only you can see this" });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://slack.com/api/chat.postEphemeral");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer xoxb-test-token");
    expect(await requests[0].json()).toEqual({ channel: "C123", user: "U456", text: "only you can see this" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.messageTs).toBe("1715680900.000100");
    }
  });

  test("maps rate limit to CONNECTOR_RATE_LIMITED", async () => {
    const client = createSlackChatClient({
      token: "xoxb-test-token",
      fetch: async () => new Response(JSON.stringify({ ok: false, error: "ratelimited" }), {
        status: 429,
        headers: { "Retry-After": "5" },
      }),
    });

    const result = await client.postEphemeral({ channel: "C123", user: "U456", text: "hi" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("CONNECTOR_RATE_LIMITED");
    }
  });
});
