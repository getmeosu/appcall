import { describe, expect, test } from "bun:test";
import fixture from "../fixtures/users.json";
import { createNotionUsersClient, executeUsersListSync } from "../src/sync";

describe("notion users.list sync handler", () => {
  test("executes users.list from a Notion fixture response", () => {
    const result = executeUsersListSync({ response: fixture });

    expect(result.provider).toBe("notion");
    expect(result.operation).toBe("users.list");
    expect(result.cursor).toBe("next-user-cursor");
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({
      id: "notion:11111111-1111-1111-1111-111111111111",
      email: "ada@example.com",
      userType: "person",
    });
  });

  test("rejects invalid users.list fixture responses", () => {
    expect(() => executeUsersListSync({
      response: { object: "list", results: {} },
    })).toThrow("results must be an array");
  });

  test("users.list client fetches Notion users with pagination params", async () => {
    const requests: Request[] = [];
    const client = createNotionUsersClient({
      notionToken: "secret_notion_token",
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return Response.json(fixture);
      },
    });

    const result = await client.list({ cursor: "cursor-1", pageSize: 50 });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.notion.com/v1/users?start_cursor=cursor-1&page_size=50");
    expect(requests[0].method).toBe("GET");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer secret_notion_token");
    expect(requests[0].headers.get("Notion-Version")).toBe("2026-03-11");
    expect(result.ok).toBe(true);
    expect(result.ok && result.items[0].id).toBe("notion:11111111-1111-1111-1111-111111111111");
    expect(JSON.stringify(result)).not.toContain("secret_notion_token");
  });

  test("users.list client maps missing capabilities without leaking token", async () => {
    const client = createNotionUsersClient({
      notionToken: "secret_notion_token",
      fetch: async () => Response.json({
        object: "error",
        status: 403,
        code: "restricted_resource",
        message: "Insufficient capabilities.",
      }, { status: 403 }),
    });

    const result = await client.list({});

    expect(result).toEqual({
      ok: false,
      error: {
        code: "CONNECTOR_CAPABILITY_MISSING",
        message: "Notion credentials do not have access to list users.",
        providerError: "restricted_resource",
      },
    });
    expect(JSON.stringify(result)).not.toContain("secret_notion_token");
  });

  test("users.list client maps Notion rate limits", async () => {
    const client = createNotionUsersClient({
      notionToken: "secret_notion_token",
      fetch: async () => Response.json({
        object: "error",
        status: 429,
        code: "rate_limited",
      }, {
        status: 429,
        headers: { "Retry-After": "9" },
      }),
    });

    const result = await client.list({});

    expect(result).toEqual({
      ok: false,
      error: {
        code: "CONNECTOR_RATE_LIMITED",
        message: "The upstream provider rate limited this request.",
        providerError: "rate_limited",
        retryAfterSeconds: 9,
      },
    });
  });
});
