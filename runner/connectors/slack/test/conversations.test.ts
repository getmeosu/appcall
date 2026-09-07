import { describe, expect, test } from "bun:test";
import conversationsCreateFixture from "../fixtures/conversations_create.json";
import conversationsListFixture from "../fixtures/conversations_list.json";
import conversationsHistoryFixture from "../fixtures/conversations_history.json";
import conversationsInfoFixture from "../fixtures/conversations_info.json";
import conversationsInviteFixture from "../fixtures/conversations_invite.json";
import conversationsMembersFixture from "../fixtures/conversations_members.json";
import {
  createSlackConversationsClient,
  normalizeChannel,
  validateConversationsCreateInput,
  validateConversationsListInput,
  validateConversationsHistoryInput,
  validateConversationsInfoInput,
  validateConversationsInviteInput,
  validateConversationsMembersInput,
} from "../src/conversations";
import {
  createConversation,
  listConversations,
  getConversationHistory,
  getConversationInfo,
  inviteToConversation,
  getConversationMembers,
} from "../src/actions";

// ─── normalizeChannel ─────────────────────────────────────────────────────────

describe("normalizeChannel", () => {
  test("normalizes a full channel object", () => {
    const raw = conversationsCreateFixture.channel;
    const normalized = normalizeChannel(raw);
    expect(normalized.id).toBe("C999");
    expect(normalized.provider).toBe("slack");
    expect(normalized.name).toBe("new-channel");
    expect(normalized.isPrivate).toBe(false);
    expect(normalized.isMember).toBe(true);
    expect(normalized.memberCount).toBe(1);
    expect(normalized.modelVersion).toBe("2026-05-14");
    expect(normalized.raw).toBe(raw);
  });
});

// ─── Validators ───────────────────────────────────────────────────────────────

describe("conversations validators", () => {
  test("validateConversationsCreateInput accepts valid input", () => {
    expect(validateConversationsCreateInput({ name: "new-channel" })).toEqual({ name: "new-channel", isPrivate: undefined });
  });

  test("validateConversationsCreateInput rejects empty name", () => {
    expect(() => validateConversationsCreateInput({ name: "" })).toThrow();
  });

  test("validateConversationsListInput accepts empty input", () => {
    expect(validateConversationsListInput({})).toEqual({ cursor: undefined, limit: undefined, excludeArchived: undefined });
  });

  test("validateConversationsListInput clamps limit", () => {
    expect(validateConversationsListInput({ limit: 5000 })).toEqual({ cursor: undefined, limit: 1000, excludeArchived: undefined });
  });

  test("validateConversationsHistoryInput requires channel", () => {
    expect(() => validateConversationsHistoryInput({ channel: "" })).toThrow();
    expect(validateConversationsHistoryInput({ channel: "C123" })).toMatchObject({ channel: "C123" });
  });

  test("validateConversationsInfoInput requires channel", () => {
    expect(() => validateConversationsInfoInput({ channel: "" })).toThrow();
    expect(validateConversationsInfoInput({ channel: "C001" })).toEqual({ channel: "C001" });
  });

  test("validateConversationsInviteInput requires non-empty users array", () => {
    expect(() => validateConversationsInviteInput({ channel: "C123", users: [] })).toThrow();
    expect(validateConversationsInviteInput({ channel: "C123", users: ["U001", "U002"] }))
      .toEqual({ channel: "C123", users: ["U001", "U002"] });
  });

  test("validateConversationsMembersInput requires channel", () => {
    expect(() => validateConversationsMembersInput({ channel: "" })).toThrow();
    expect(validateConversationsMembersInput({ channel: "C123" })).toMatchObject({ channel: "C123" });
  });
});

// ─── Static validation via actions ───────────────────────────────────────────

describe("conversations action static validation", () => {
  test("createConversation validates without token", () => {
    const result = createConversation({ name: "my-channel" });
    expect((result as Record<string, unknown>).source).toBe("connector");
    expect((result as Record<string, unknown>).validated).toMatchObject({ name: "my-channel" });
  });

  test("listConversations validates without token", () => {
    const result = listConversations({});
    expect((result as Record<string, unknown>).source).toBe("connector");
    expect((result as Record<string, unknown>).validated).toBeDefined();
  });

  test("getConversationHistory validates without token", () => {
    const result = getConversationHistory({ channel: "C123" });
    expect((result as Record<string, unknown>).source).toBe("connector");
    expect((result as Record<string, unknown>).validated).toMatchObject({ channel: "C123" });
  });

  test("getConversationInfo validates without token", () => {
    const result = getConversationInfo({ channel: "C001" });
    expect((result as Record<string, unknown>).source).toBe("connector");
    expect((result as Record<string, unknown>).validated).toEqual({ channel: "C001" });
  });

  test("inviteToConversation validates without token", () => {
    const result = inviteToConversation({ channel: "C123", users: ["U001"] });
    expect((result as Record<string, unknown>).source).toBe("connector");
    expect((result as Record<string, unknown>).validated).toMatchObject({ channel: "C123", users: ["U001"] });
  });

  test("getConversationMembers validates without token", () => {
    const result = getConversationMembers({ channel: "C123" });
    expect((result as Record<string, unknown>).source).toBe("connector");
    expect((result as Record<string, unknown>).validated).toMatchObject({ channel: "C123" });
  });
});

// ─── Live (mocked) tests ─────────────────────────────────────────────────────

describe("conversations.create live (mocked fetch)", () => {
  test("POSTs to conversations.create and normalizes response", async () => {
    const requests: Request[] = [];
    const client = createSlackConversationsClient({
      token: "xoxb-test-token",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(conversationsCreateFixture);
      },
    });

    const result = await client.create({ name: "new-channel" });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://slack.com/api/conversations.create");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer xoxb-test-token");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.channel.id).toBe("C999");
      expect(result.channel.name).toBe("new-channel");
    }
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    const client = createSlackConversationsClient({
      token: "xoxb-test-token",
      fetch: async () => new Response(JSON.stringify({ ok: false, error: "ratelimited" }), { status: 429 }),
    });
    const result = await client.create({ name: "my-channel" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONNECTOR_RATE_LIMITED");
  });

  test("maps Slack error to CONNECTOR_UPSTREAM_ERROR", async () => {
    const client = createSlackConversationsClient({
      token: "xoxb-test-token",
      fetch: async () => Response.json({ ok: false, error: "name_taken" }),
    });
    const result = await client.create({ name: "existing-channel" });
    expect(result).toEqual({ ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Slack rejected the conversations.create request.", providerError: "name_taken" } });
  });
});

describe("conversations.list live (mocked fetch)", () => {
  test("GETs conversations.list and normalizes channel list", async () => {
    const requests: Request[] = [];
    const client = createSlackConversationsClient({
      token: "xoxb-test-token",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(conversationsListFixture);
      },
    });

    const result = await client.list({});

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toContain("https://slack.com/api/conversations.list");
    expect(requests[0].method).toBe("GET");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer xoxb-test-token");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.channels).toHaveLength(2);
      expect(result.channels[0].id).toBe("C001");
      expect(result.channels[1].id).toBe("C002");
      expect(result.nextCursor).toBeNull();
    }
  });

  test("maps upstream error to CONNECTOR_UPSTREAM_ERROR", async () => {
    const client = createSlackConversationsClient({
      token: "xoxb-test-token",
      fetch: async () => Response.json({ ok: false, error: "not_authed" }),
    });
    const result = await client.list({});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONNECTOR_UPSTREAM_ERROR");
  });
});

describe("conversations.history live (mocked fetch)", () => {
  test("GETs conversations.history and returns messages", async () => {
    const requests: Request[] = [];
    const client = createSlackConversationsClient({
      token: "xoxb-test-token",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(conversationsHistoryFixture);
      },
    });

    const result = await client.history({ channel: "C001" });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toContain("channel=C001");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer xoxb-test-token");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.messages).toHaveLength(2);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    }
  });

  test("maps 429 rate limit to CONNECTOR_RATE_LIMITED", async () => {
    const client = createSlackConversationsClient({
      token: "xoxb-test-token",
      fetch: async () => new Response(JSON.stringify({ ok: false, error: "ratelimited" }), {
        status: 429,
        headers: { "Retry-After": "20" },
      }),
    });
    const result = await client.history({ channel: "C001" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONNECTOR_RATE_LIMITED");
  });
});

describe("conversations.info live (mocked fetch)", () => {
  test("GETs conversations.info and returns normalized channel", async () => {
    const requests: Request[] = [];
    const client = createSlackConversationsClient({
      token: "xoxb-test-token",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(conversationsInfoFixture);
      },
    });

    const result = await client.info({ channel: "C001" });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toContain("channel=C001");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer xoxb-test-token");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.channel.id).toBe("C001");
      expect(result.channel.name).toBe("general");
      expect(result.channel.memberCount).toBe(42);
    }
  });

  test("maps channel_not_found to CONNECTOR_UPSTREAM_ERROR", async () => {
    const client = createSlackConversationsClient({
      token: "xoxb-test-token",
      fetch: async () => Response.json({ ok: false, error: "channel_not_found" }),
    });
    const result = await client.info({ channel: "C999" });
    expect(result).toEqual({ ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Slack rejected the conversations.info request.", providerError: "channel_not_found" } });
  });
});

describe("conversations.invite live (mocked fetch)", () => {
  test("POSTs to conversations.invite with comma-joined user IDs", async () => {
    const requests: Request[] = [];
    const client = createSlackConversationsClient({
      token: "xoxb-test-token",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(conversationsInviteFixture);
      },
    });

    const result = await client.invite({ channel: "C001", users: ["U002", "U003"] });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://slack.com/api/conversations.invite");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer xoxb-test-token");
    const body = await requests[0].json() as Record<string, unknown>;
    expect(body.channel).toBe("C001");
    expect(body.users).toBe("U002,U003");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.channel.id).toBe("C001");
      expect(result.channel.memberCount).toBe(43);
    }
  });

  test("maps already_in_channel to CONNECTOR_UPSTREAM_ERROR", async () => {
    const client = createSlackConversationsClient({
      token: "xoxb-test-token",
      fetch: async () => Response.json({ ok: false, error: "already_in_channel" }),
    });
    const result = await client.invite({ channel: "C001", users: ["U001"] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("CONNECTOR_UPSTREAM_ERROR");
      expect(result.error.providerError).toBe("already_in_channel");
    }
  });
});

describe("conversations.members live (mocked fetch)", () => {
  test("GETs conversations.members and returns member IDs", async () => {
    const requests: Request[] = [];
    const client = createSlackConversationsClient({
      token: "xoxb-test-token",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(conversationsMembersFixture);
      },
    });

    const result = await client.members({ channel: "C001" });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toContain("channel=C001");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer xoxb-test-token");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.members).toEqual(["U001", "U002", "U003"]);
      expect(result.nextCursor).toBeNull();
    }
  });

  test("maps upstream error to CONNECTOR_UPSTREAM_ERROR", async () => {
    const client = createSlackConversationsClient({
      token: "xoxb-test-token",
      fetch: async () => Response.json({ ok: false, error: "channel_not_found" }),
    });
    const result = await client.members({ channel: "C999" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONNECTOR_UPSTREAM_ERROR");
  });
});
