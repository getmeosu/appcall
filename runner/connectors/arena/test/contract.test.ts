import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest);
const operations = manifest.operations as Record<string, Record<string, any>>;

const liveTools = [
  "ARENA_ADD_TO_CHANNELS",
  "ARENA_CREATE_CHANNEL",
  "ARENA_DELETE_CHANNEL",
  "ARENA_GET_BLOCK",
  "ARENA_GET_CHANNEL",
  "ARENA_GET_CURRENT_USER",
  "ARENA_GET_MY_FEED",
  "ARENA_LIST_CHANNEL_CONTENTS",
  "ARENA_REMOVE_FROM_CHANNEL",
  "ARENA_UPDATE_CHANNEL",
] as const;

const mapped: Record<string, string> = {
  ARENA_ADD_TO_CHANNELS: "connections.create",
  ARENA_CREATE_CHANNEL: "channels.create",
  ARENA_GET_BLOCK: "blocks.get",
  ARENA_GET_CHANNEL: "channels.get",
  ARENA_GET_CURRENT_USER: "users.me",
  ARENA_GET_MY_FEED: "feed.get",
  ARENA_LIST_CHANNEL_CONTENTS: "channels.contents.list",
  ARENA_UPDATE_CHANNEL: "channels.update",
};

const jsonResponse = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

describe("Are.na declarative contract", () => {
  test("uses bearer auth on api.are.na and compiles every mapped tool", () => {
    expect(manifest.network.allowedHosts).toEqual(["api.are.na"]);
    expect(manifest.http.baseUrl).toBe("https://api.are.na/v3");
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "Authorization",
      value: "Bearer {{apiKey}}",
    });
    expect(Object.keys(mapped).sort()).toEqual(liveTools.filter((tool) => tool in mapped).sort());
    expect(liveTools).toHaveLength(10);
    expect(Object.keys(operations).sort()).toEqual(Object.values(mapped).sort());
    for (const operation of Object.values(mapped)) {
      expect(actions[operation]).toBeTypeOf("function");
      expect(operations[operation].request.method).toMatch(/^(GET|POST|PUT)$/);
      expect(operations[operation].request.path).toBeTypeOf("string");
      expect(operations[operation].responseFormat).toBe("json");
      expect(operations[operation].outputSchema.type).toBe("object");
      expect(operations[operation].maxResponseBytes).toBeGreaterThanOrEqual(operations[operation].maxInputBytes);
      expect(operations[operation].maxInputBytes).toBeLessThanOrEqual(26214400);
      expect(operations[operation].timeoutMs).toBeGreaterThanOrEqual(1);
      expect(operations[operation].timeoutMs).toBeLessThanOrEqual(300000);
      expect(operations[operation].request.success).not.toContain(204);
    }
  });

  test("current user is a body-less bearer GET", async () => {
    const seen: Array<{ url: string; init: RequestInit }> = [];
    const result = await actions["users.me"]!({
      apiKey: "secret",
      fetch: async (url, init) => {
        seen.push({ url: String(url), init });
        return jsonResponse({ id: 7, type: "User", slug: "ada" });
      },
    });
    expect(seen[0].init.method).toBe("GET");
    expect(seen[0].init.body).toBeUndefined();
    expect(new Headers(seen[0].init.headers).get("authorization")).toBe("Bearer secret");
    expect(new Headers(seen[0].init.headers).get("content-type")).toBeNull();
    expect(seen[0].url).toBe("https://api.are.na/v3/me");
    expect(result.data).toEqual({ id: 7, type: "User", slug: "ada" });
  });

  test("encodes channel ids and omits unset content filters", async () => {
    const seen: Array<{ url: string; init: RequestInit }> = [];
    await actions["channels.contents.list"]!({
      apiKey: "secret",
      channel_id: "a/b",
      per: 5,
      fetch: async (url, init) => {
        seen.push({ url: String(url), init });
        return jsonResponse({ data: [], meta: { current_page: 1 } });
      },
    });
    const url = new URL(seen[0].url);
    expect(url.pathname).toBe("/v3/channels/a%2Fb/contents");
    expect(url.searchParams.get("per")).toBe("5");
    expect(url.searchParams.has("page")).toBe(false);
    expect(url.searchParams.has("sort")).toBe(false);
    expect(url.searchParams.has("user_id")).toBe(false);
    expect(seen[0].init.method).toBe("GET");
    expect(seen[0].init.body).toBeUndefined();
    expect(new Headers(seen[0].init.headers).get("content-type")).toBeNull();
  });

  test("creates a channel with compact JSON and drops omitted fields", async () => {
    const seen: Array<{ url: string; init: RequestInit }> = [];
    await actions["channels.create"]!({
      apiKey: "secret",
      title: "Desk",
      fetch: async (url, init) => {
        seen.push({ url: String(url), init });
        return jsonResponse({ id: 1, type: "Channel", title: "Desk" }, 201);
      },
    });
    expect(seen[0].url).toBe("https://api.are.na/v3/channels");
    expect(seen[0].init.method).toBe("POST");
    expect(seen[0].init.body).toBe("{\"title\":\"Desk\"}");
    expect(new Headers(seen[0].init.headers).get("content-type")).toBe("application/json");
  });

  test("sends feed cursors on the public next and prev query names", async () => {
    const seen: string[] = [];
    await actions["feed.get"]!({
      apiKey: "secret",
      next: "older",
      fetch: async (url) => {
        seen.push(String(url));
        return jsonResponse({ meta: { limit: 24, next_cursor: null, prev_cursor: null, has_more: false }, data: [] });
      },
    });
    const url = new URL(seen[0]);
    expect(url.pathname).toBe("/v3/me/feed");
    expect(url.searchParams.get("next")).toBe("older");
    expect(url.searchParams.has("limit")).toBe(false);
    expect(url.searchParams.has("prev")).toBe(false);
    expect(url.searchParams.has("next_cursor")).toBe(false);
  });

  test("rejects invalid input, non-object JSON, empty bodies, 401, and 429", async () => {
    const fetch = async () => jsonResponse({});
    await expect(actions["channels.get"]!({ apiKey: "secret", channel_id: "", fetch })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["users.me"]!({ apiKey: "secret", extra: true, fetch })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["connections.create"]!({
      apiKey: "secret",
      connectable_id: 1,
      connectable_type: "Block",
      channel_ids: [],
      fetch,
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["channels.update"]!({
      apiKey: "secret",
      channel_id: "1",
      description: null,
      fetch,
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["blocks.get"]!({
      apiKey: "secret",
      block_id: 8693,
      fetch: async () => jsonResponse([]),
    })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["channels.get"]!({
      apiKey: "secret",
      channel_id: "desk",
      fetch: async () => new Response("", { status: 200, headers: { "content-type": "application/json" } }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["users.me"]!({
      apiKey: "secret",
      fetch: async () => jsonResponse({ error: "Unauthorized", code: 401 }, 401),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(actions["feed.get"]!({
      apiKey: "secret",
      fetch: async () => jsonResponse({ error: { message: "slow" } }, 429, { "Retry-After": "4" }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });
});
