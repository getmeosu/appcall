import { describe, expect, test } from "bun:test";
import usersListFixture from "../fixtures/users_list.json";
import {
  createSlackUsersClient,
  normalizeUser,
  validateUsersListInput,
} from "../src/users";
import { listUsers } from "../src/actions";

// ─── normalizeUser ────────────────────────────────────────────────────────────

describe("normalizeUser", () => {
  test("normalizes a full user object", () => {
    const raw = usersListFixture.members[0];
    const normalized = normalizeUser(raw);
    expect(normalized.id).toBe("U001");
    expect(normalized.provider).toBe("slack");
    expect(normalized.name).toBe("alice");
    expect(normalized.realName).toBe("Alice Smith");
    expect(normalized.displayName).toBe("alice");
    expect(normalized.email).toBe("alice@example.com");
    expect(normalized.isBot).toBe(false);
    expect(normalized.deleted).toBe(false);
    expect(normalized.modelVersion).toBe("2026-05-14");
    expect(normalized.raw).toBe(raw);
  });
});

// ─── Validators ───────────────────────────────────────────────────────────────

describe("validateUsersListInput", () => {
  test("accepts empty input", () => {
    expect(validateUsersListInput({})).toEqual({ cursor: undefined, limit: undefined });
  });

  test("accepts cursor and limit", () => {
    expect(validateUsersListInput({ cursor: "dXNlcjox", limit: 50 }))
      .toEqual({ cursor: "dXNlcjox", limit: 50 });
  });

  test("clamps limit to 1000", () => {
    expect(validateUsersListInput({ limit: 9999 })).toEqual({ cursor: undefined, limit: 1000 });
  });

  test("clamps limit minimum to 1", () => {
    expect(validateUsersListInput({ limit: 0 })).toEqual({ cursor: undefined, limit: 1 });
  });
});

// ─── Static validation via action ─────────────────────────────────────────────

describe("listUsers action static validation", () => {
  test("returns validated without token", () => {
    const result = listUsers({});
    expect((result as Record<string, unknown>).source).toBe("connector");
    expect((result as Record<string, unknown>).validated).toBeDefined();
  });

  test("rejects non-object input", () => {
    expect(() => listUsers("not-an-object")).toThrow();
  });
});

// ─── Live (mocked) tests ─────────────────────────────────────────────────────

describe("users.list live (mocked fetch)", () => {
  test("GETs users.list and normalizes member list", async () => {
    const requests: Request[] = [];
    const client = createSlackUsersClient({
      token: "xoxb-test-token",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(usersListFixture);
      },
    });

    const result = await client.list({});

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toContain("https://slack.com/api/users.list");
    expect(requests[0].method).toBe("GET");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer xoxb-test-token");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.members).toHaveLength(2);
      expect(result.members[0].id).toBe("U001");
      expect(result.members[0].email).toBe("alice@example.com");
      expect(result.members[1].id).toBe("U002");
      expect(result.nextCursor).toBeNull();
    }
  });

  test("passes cursor and limit as query params", async () => {
    const requests: Request[] = [];
    const client = createSlackUsersClient({
      token: "xoxb-test-token",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(usersListFixture);
      },
    });

    await client.list({ cursor: "abc123", limit: 10 });

    expect(requests).toHaveLength(1);
    const url = new URL(requests[0].url);
    expect(url.searchParams.get("cursor")).toBe("abc123");
    expect(url.searchParams.get("limit")).toBe("10");
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    const client = createSlackUsersClient({
      token: "xoxb-test-token",
      fetch: async () => new Response(JSON.stringify({ ok: false, error: "ratelimited" }), {
        status: 429,
        headers: { "Retry-After": "30" },
      }),
    });

    const result = await client.list({});
    expect(result).toEqual({
      ok: false,
      error: {
        code: "CONNECTOR_RATE_LIMITED",
        message: "The upstream provider rate limited this request.",
        retryAfterSeconds: 0,
      },
    });
  });

  test("maps Slack error to CONNECTOR_UPSTREAM_ERROR", async () => {
    const client = createSlackUsersClient({
      token: "xoxb-test-token",
      fetch: async () => Response.json({ ok: false, error: "not_authed" }),
    });

    const result = await client.list({});
    expect(result).toEqual({
      ok: false,
      error: {
        code: "CONNECTOR_UPSTREAM_ERROR",
        message: "Slack rejected the users.list request.",
        providerError: "not_authed",
      },
    });
  });
});

// ─── Full action integration (via listUsers with token) ───────────────────────

describe("listUsers action with mocked fetch", () => {
  test("calls users.list API and returns connector-owned output", async () => {
    const requests: Request[] = [];
    const result = await listUsers({
      token: "xoxb-test-token",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(usersListFixture);
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toContain("https://slack.com/api/users.list");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer xoxb-test-token");
    expect(result.connector).toBe("slack");
    expect(result.action).toBe("users.list");
    expect(result.source).toBe("connector");
    expect(Array.isArray(result.members)).toBe(true);
  });
});
