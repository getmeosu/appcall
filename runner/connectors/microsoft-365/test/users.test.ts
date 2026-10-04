import { describe, expect, test } from "bun:test";
import userMeFixture from "../fixtures/user_me.json";
import { validateGetMeInput, createUsersClient } from "../src/users";

describe("microsoft-365 users.me", () => {
  test("validateGetMeInput accepts an empty object", () => {
    expect(validateGetMeInput({})).toEqual({});
    expect(validateGetMeInput(undefined)).toEqual({});
  });

  test("validateGetMeInput throws on a non-object", () => {
    expect(() => validateGetMeInput("not-an-object")).toThrow("get me input must be an object");
  });

  test("getMe GETs /v1.0/me with Bearer token", async () => {
    const requests: Request[] = [];
    const client = createUsersClient({
      accessToken: "tok-me",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(userMeFixture), { status: 200, headers: { "Content-Type": "application/json" } });
      },
    });

    const result = await client.me({});

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://graph.microsoft.com/v1.0/me");
    expect(requests[0].method).toBe("GET");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer tok-me");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user.id).toBe("87d349ed-44d7-43e1-9a83-5f2406dee5bd");
      expect(result.user.displayName).toBe("Alice Johnson");
      expect(result.user.mail).toBe("alice@example.com");
      expect(result.user.userPrincipalName).toBe("alice@example.com");
    }
  });

  test("getMe maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    const client = createUsersClient({
      accessToken: "tok-me",
      fetch: async () => new Response("{}", { status: 429, headers: { "Retry-After": "12" } }),
    });

    const result = await client.me({});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("CONNECTOR_RATE_LIMITED");
      expect(result.error.retryAfterSeconds).toBe(12);
    }
  });

  test("getMe maps non-200/429 to CONNECTOR_UPSTREAM_ERROR", async () => {
    const client = createUsersClient({
      accessToken: "tok-me",
      fetch: async () => new Response("{}", { status: 401 }),
    });

    const result = await client.me({});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONNECTOR_UPSTREAM_ERROR");
  });
});
