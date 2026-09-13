import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest);
const response = (body: unknown, status = 200, headers?: HeadersInit) => new Response(JSON.stringify(body), { status, headers });
const page = { number: 1, size: 50, totalElements: 1, totalPages: 1 };

describe("Help Scout declarative read-only contract", () => {
  test("healthcheck uses OAuth bearer and maps users", async () => {
    const seen: Request[] = [];
    const result = await actions.healthcheck!({ accessToken: "secret", fetch: async (input, init) => { seen.push(new Request(input, init)); return response({ _embedded: { users: [{ id: 1 }] }, page }); } });
    expect(seen[0].url).toBe("https://api.helpscout.net/v2/users?page=1&pageSize=50");
    expect(seen[0].headers.get("authorization")).toBe("Bearer secret");
    expect(result).toMatchObject({ status: "ok", users: [{ id: 1 }], page });
  });

  test("maps collections, fixed page sizes, query filters, and does not follow links", async () => {
    const seen: Request[] = [];
    const result = await actions["conversations.list"]!({ accessToken: "tok", page: 2, status: "open", mailbox: 7, sortField: "modifiedAt", sortOrder: "desc", fetch: async (input, init) => { seen.push(new Request(input, init)); return response({ _embedded: { conversations: [{ id: 9 }] }, page: { ...page, number: 2, size: 25 }, _links: { next: { href: "https://evil.example" } } }); } });
    const url = new URL(seen[0].url);
    expect(url.pathname).toBe("/v2/conversations");
    expect(url.searchParams.get("pageSize")).toBe("25");
    expect(url.searchParams.get("status")).toBe("open");
    expect(result.conversations).toEqual([{ id: 9 }]);
    expect(seen).toHaveLength(1);
  });

  test("escapes conversation IDs and rejects invalid required inputs", async () => {
    const seen: Request[] = [];
    await actions["conversations.get"]!({ accessToken: "tok", conversationId: 42, fetch: async (input, init) => { seen.push(new Request(input, init)); return response({ id: 42 }); } });
    expect(new URL(seen[0].url).pathname).toBe("/v2/conversations/42");
    for (const value of [undefined, "42", "   "]) await expect(actions["conversations.get"]!({ accessToken: "tok", conversationId: value, fetch: async () => response({}) })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
  });

  test("maps upstream failures and Retry-After without exposing credentials", async () => {
    for (const status of [401, 403, 404, 500, 502, 503]) await expect(actions["users.list"]!({ accessToken: "secret", fetch: async () => response({ message: "provider detail", accessToken: "secret" }, status) })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(actions["users.list"]!({ accessToken: "secret", fetch: async () => response({ message: "slow" }, 429, { "Retry-After": "5" }) })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 5 });
  });

  test("rejects malformed collection responses", async () => {
    await expect(actions["tags.list"]!({ accessToken: "tok", fetch: async () => response({ _embedded: { tags: {} }, page }) })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
  });
});
