import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest as never);
const response = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers });

const chatBody = {
  id: "chatcmpl-fixture",
  object: "chat.completion",
  created: 1710000000,
  model: "openai/gpt-4o-mini",
  choices: [{ index: 0, message: { role: "assistant", content: "Hello" }, finish_reason: "stop" }],
};

async function capture(action: string, input: Record<string, unknown>, body: unknown = chatBody, status = 200) {
  const seen: Request[] = [];
  const result = await actions[action]!({
    apiKey: "secret",
    ...input,
    fetch: async (requestInput: RequestInfo, init?: RequestInit) => {
      seen.push(new Request(requestInput, init));
      return response(body, status);
    },
  });
  return { seen, result };
}

describe("Eden AI JSON contract", () => {
  test("sends bearer JSON to api.edenai.run and omits unset fields", async () => {
    const { seen } = await capture("chat-completions.create", {
      model: "openai/gpt-4o-mini",
      messages: [{ role: "user", content: "Hi" }],
    });
    expect(seen).toHaveLength(1);
    expect(seen[0].method).toBe("POST");
    expect(seen[0].headers.get("authorization")).toBe("Bearer secret");
    expect(seen[0].headers.get("accept")).toBe("application/json");
    expect(seen[0].headers.get("content-type")).toBe("application/json");
    const url = new URL(seen[0].url);
    expect(url.hostname).toBe("api.edenai.run");
    expect(url.pathname).toBe("/v3/chat/completions");
    expect(url.search).toBe("");
    expect(await seen[0].text()).toBe('{"model":"openai/gpt-4o-mini","messages":[{"role":"user","content":"Hi"}]}');
  });

  test("forwards chat options on one route and rejects stream", async () => {
    const { seen } = await capture("chat-completions.create", {
      model: "@edenai",
      messages: [{ role: "user", content: "Hi" }],
      fallbacks: ["openai/gpt-4o-mini"],
      max_tokens: 16,
      temperature: 0,
      response_format: { type: "text" },
      reasoning_effort: "low",
      router_candidates: ["openai/gpt-4o-mini"],
    });
    expect(new URL(seen[0].url).pathname).toBe("/v3/chat/completions");
    expect(await seen[0].text()).toBe('{"model":"@edenai","messages":[{"role":"user","content":"Hi"}],"fallbacks":["openai/gpt-4o-mini"],"max_tokens":16,"temperature":0,"response_format":{"type":"text"},"reasoning_effort":"low","router_candidates":["openai/gpt-4o-mini"]}');
    await expect(actions["chat-completions.create"]!({
      apiKey: "secret",
      model: "openai/gpt-4o-mini",
      messages: [{ role: "user", content: "Hi" }],
      stream: true,
      fetch: async () => response(chatBody),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
  });

  test("gets one stored response without a body or a caller URL", async () => {
    const { seen } = await capture("responses.get", { response_id: "resp/a" }, { id: "resp/a", object: "response", created_at: 1, model: "openai/gpt-4o-mini", status: "completed", output: [] });
    expect(seen[0].method).toBe("GET");
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(await seen[0].text()).toBe("");
    const url = new URL(seen[0].url);
    expect(url.hostname).toBe("api.edenai.run");
    expect(url.pathname).toBe("/v3/responses/resp%2Fa");
    const escaped = await capture("responses.get", { response_id: "https://evil.example/x" }, { id: "x", object: "response", created_at: 1, model: "m", status: "completed", output: [] });
    const escapedUrl = new URL(escaped.seen[0].url);
    expect(escapedUrl.hostname).toBe("api.edenai.run");
    expect(escapedUrl.pathname).toBe("/v3/responses/https%3A%2F%2Fevil.example%2Fx");
    await expect(actions["responses.get"]!({
      apiKey: "secret",
      response_id: "..",
      fetch: async () => response({}),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
  });

  test("keeps universal AI on one JSON route when input carries a file URL", async () => {
    const { seen } = await capture("universal-ai.run", {
      model: "text/ai_detection/openai",
      input: { file: "https://example.com/note.txt", language: "en" },
      show_original_response: false,
    }, { status: "success", cost: "0", provider: "openai", feature: "text", subfeature: "ai_detection", output: {} });
    expect(seen).toHaveLength(1);
    const url = new URL(seen[0].url);
    expect(url.hostname).toBe("api.edenai.run");
    expect(url.pathname).toBe("/v3/universal-ai");
    expect(await seen[0].text()).toBe('{"model":"text/ai_detection/openai","input":{"file":"https://example.com/note.txt","language":"en"},"show_original_response":false}');
    await expect(actions["universal-ai.run"]!({
      apiKey: "secret",
      model: "text/ai_detection/openai",
      input: {},
      fetch: async () => response({}),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
  });

  test("validates input, malformed output, 401 and 429", async () => {
    await expect(actions["responses.create"]!({
      apiKey: "secret",
      model: "openai/gpt-4o-mini",
      fetch: async () => response({}),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["embeddings.create"]!({
      apiKey: "secret",
      model: "openai/text-embedding-3-small",
      input: "text",
      dimensions: 0,
      fetch: async () => response({}),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["chat-completions.create"]!({
      apiKey: "secret",
      model: "openai/gpt-4o-mini",
      messages: [{ role: "user", content: "Hi" }],
      fetch: async () => response([], 200),
    })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["chat-completions.create"]!({
      apiKey: "secret",
      model: "openai/gpt-4o-mini",
      messages: [{ role: "user", content: "Hi" }],
      fetch: async () => response({ error: { message: "bad key" } }, 401),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(actions["chat-completions.create"]!({
      apiKey: "secret",
      model: "openai/gpt-4o-mini",
      messages: [{ role: "user", content: "Hi" }],
      fetch: async () => response({}, 429, { "Retry-After": "4" }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
    await expect(actions["responses.get"]!({
      apiKey: "secret",
      response_id: "resp_1",
      fetch: async () => new Response(null, { status: 302, headers: { Location: "https://evil.example/file" } }),
    })).rejects.toMatchObject({ code: "OUTBOUND_REDIRECT_BLOCKED" });
  });
});
