import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest);
const response = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers });

describe("Chatforma contract", () => {
  test("sends the api_key header and does not follow response links", async () => {
    const seen: Request[] = [];
    const result = await actions["bots.list"]!({
      apiKey: "secret",
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response([{ id: 1, title: "Support", type: "telegram", next: "https://evil.example/next" }]);
      },
    });
    expect(seen).toHaveLength(1);
    expect(seen[0].headers.get("api_key")).toBe("secret");
    expect(seen[0].headers.get("authorization")).toBeNull();
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(seen[0].method).toBe("GET");
    expect(seen[0].body).toBeNull();
    const url = new URL(seen[0].url);
    expect(url.host).toBe("api.pro.chatforma.com");
    expect(url.pathname).toBe("/public/v1/bots");
    expect(url.search).toBe("");
    expect(result.data).toHaveLength(1);
  });

  test("encodes dialog path ids and keeps optional paging off the first page", async () => {
    const seen: Request[] = [];
    await actions["dialogs.messages.list"]!({
      apiKey: "secret",
      botId: 15,
      userId: 3,
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response([]);
      },
    });
    const url = new URL(seen[0].url);
    expect(url.pathname).toBe("/public/v1/bots/15/dialogs/3/messages");
    expect(url.search).toBe("");
    expect(seen[0].headers.get("content-type")).toBeNull();
  });

  test("posts one JSON body for a dialog message", async () => {
    const seen: Request[] = [];
    await actions["dialogs.message.send"]!({
      apiKey: "secret",
      botId: 15,
      userId: 3,
      message: "Hello",
      idempotencyKey: "idem-1",
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response([]);
      },
    });
    expect(seen[0].method).toBe("POST");
    expect(seen[0].headers.get("content-type")).toBe("application/json");
    expect(await seen[0].text()).toBe('{"message":"Hello","uid":"idem-1"}');
    expect(new URL(seen[0].url).pathname).toBe("/public/v1/bots/15/dialogs/3/message");
  });

  test("rejects a free-form URL, a bad id, malformed JSON output, 401, and 429", async () => {
    await expect(actions["bots.list"]!({
      apiKey: "secret",
      url: "https://evil.example",
      fetch: async () => response([]),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["segments.list"]!({
      apiKey: "secret",
      botId: "15/../admin",
      fetch: async () => response([]),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["bots.list"]!({
      apiKey: "secret",
      fetch: async () => response({ data: [] }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["bots.list"]!({
      apiKey: "secret",
      fetch: async () => response({ message: "no" }, 401),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(actions["bots.list"]!({
      apiKey: "secret",
      fetch: async () => response({}, 429, { "Retry-After": "4" }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });
});
