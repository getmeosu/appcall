import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest as never);
const response = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers });

const listBody = {
  data: [{ id: "brd_1", name: "Feature requests" }],
  meta: { request_id: "req_1", has_more: false, next_cursor: null },
};

describe("FeedBear API contract", () => {
  test("sends bearer auth on the default API host and keeps reads body-less", async () => {
    const seen: Request[] = [];
    await actions["boards.list"]!({
      apiKey: "secret",
      limit: 2,
      includePrivate: false,
      fetch: async (input: RequestInfo, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return response(listBody);
      },
    });
    const url = new URL(seen[0].url);
    expect(url.protocol).toBe("https:");
    expect(url.hostname).toBe("app.feedbear.com");
    expect(url.pathname).toBe("/api/v1/boards");
    expect(url.searchParams.get("limit")).toBe("2");
    expect(url.searchParams.get("include_private")).toBe("false");
    expect(seen[0].method).toBe("GET");
    expect(seen[0].headers.get("authorization")).toBe("Bearer secret");
    expect(seen[0].headers.get("accept")).toBe("application/json");
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(seen[0].body).toBeNull();
    expect(seen).toHaveLength(1);
  });

  test("encodes board and item ids and passes the documented cursor query", async () => {
    const seen: Request[] = [];
    await actions["items.get"]!({
      apiKey: "secret",
      boardId: "brd/a",
      itemId: "itm/b",
      includeVoters: true,
      fetch: async (input: RequestInfo, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return response({ data: { id: "itm/b", title: "Dark mode" }, meta: { request_id: "req_2" } });
      },
    });
    const url = new URL(seen[0].url);
    expect(url.pathname).toBe("/api/v1/boards/brd%2Fa/items/itm%2Fb");
    expect(url.searchParams.get("include_voters")).toBe("true");
    expect(seen[0].method).toBe("GET");
    expect(seen).toHaveLength(1);

    const listed: Request[] = [];
    await actions["items.list"]!({
      apiKey: "secret",
      boardId: "brd_1",
      sort: "created_at",
      cursor: "eyJpIjoiMSJ9",
      fetch: async (input: RequestInfo, init?: RequestInit) => {
        listed.push(new Request(input, init));
        return response({ data: [], meta: { request_id: "req_3", has_more: false, next_cursor: null } });
      },
    });
    const items = new URL(listed[0].url);
    expect(items.pathname).toBe("/api/v1/boards/brd_1/items");
    expect(items.searchParams.get("sort")).toBe("created_at");
    expect(items.searchParams.get("cursor")).toBe("eyJpIjoiMSJ9");
    expect(items.searchParams.get("next_cursor")).toBeNull();
    expect(listed).toHaveLength(1);
  });

  test("posts JSON resource documents and omits unset update fields", async () => {
    const created: Request[] = [];
    await actions["items.create"]!({
      apiKey: "secret",
      boardId: "brd_1",
      title: "Dark mode",
      content: "<p>Please add dark mode</p>",
      statusId: "status_1",
      externalId: "ext-1",
      isPrivate: false,
      commentsDisabled: true,
      fetch: async (input: RequestInfo, init?: RequestInit) => {
        created.push(new Request(input, init));
        return response({ data: { id: "itm_1", title: "Dark mode" }, meta: { request_id: "req_4" } }, 201);
      },
    });
    expect(created[0].method).toBe("POST");
    expect(created[0].headers.get("content-type")).toBe("application/json");
    expect(await created[0].text()).toBe("{\"item\":{\"title\":\"Dark mode\",\"content\":\"<p>Please add dark mode</p>\",\"status_id\":\"status_1\",\"external_id\":\"ext-1\",\"is_private\":false,\"comments_disabled\":true}}");

    const updated: Request[] = [];
    await actions["items.update"]!({
      apiKey: "secret",
      boardId: "brd_1",
      itemId: "itm_1",
      title: "Renamed",
      isPrivate: true,
      fetch: async (input: RequestInfo, init?: RequestInit) => {
        updated.push(new Request(input, init));
        return response({ data: { id: "itm_1", title: "Renamed" }, meta: { request_id: "req_5" } });
      },
    });
    expect(updated[0].method).toBe("PATCH");
    expect(await updated[0].text()).toBe("{\"item\":{\"title\":\"Renamed\",\"is_private\":true}}");

    const commented: Request[] = [];
    await actions["comments.create"]!({
      apiKey: "secret",
      boardId: "brd_1",
      itemId: "itm_1",
      commentBody: "Shipped in 2.4.",
      fetch: async (input: RequestInfo, init?: RequestInit) => {
        commented.push(new Request(input, init));
        return response({ data: { id: "cmt_1", body: "Shipped in 2.4." }, meta: { request_id: "req_6" } }, 201);
      },
    });
    expect(new URL(commented[0].url).pathname).toBe("/api/v1/boards/brd_1/items/itm_1/comments");
    expect(await commented[0].text()).toBe("{\"comment\":{\"body\":\"Shipped in 2.4.\"}}");
  });

  test("rejects bad input, a caller host, malformed JSON, 401, and reads Retry-After", async () => {
    const fetch = async () => response({});
    await expect(actions["items.create"]!({ apiKey: "secret", boardId: "brd_1", title: "", fetch })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["items.get"]!({ apiKey: "secret", boardId: "brd_1", itemId: "..", fetch })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["boards.list"]!({ apiKey: "secret", baseUrl: "https://evil.example", fetch })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["statuses.list"]!({ apiKey: "secret", fetch: async () => response({ data: {} }) })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["boards.list"]!({ apiKey: "secret", fetch: async () => response({ error: { code: "invalid_credentials", message: "Invalid API credentials" } }, 401) })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(actions["boards.list"]!({ apiKey: "secret", fetch: async () => response({ error: { code: "rate_limited", message: "Too many requests" } }, 429, { "Retry-After": "4" }) })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });
});
