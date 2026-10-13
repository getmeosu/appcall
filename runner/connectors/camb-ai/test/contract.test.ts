import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import coverage from "../../camb-ai.coverage.json";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest);
const response = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers });
const liveTools = [
  "CAMB_AI_DUB_MEDIA",
  "CAMB_AI_GENERATE_SUBTITLES",
  "CAMB_AI_GET_RUN_RESULT",
  "CAMB_AI_GET_TASK_STATUS",
  "CAMB_AI_LIST_LANGUAGES",
  "CAMB_AI_LIST_VOICES",
  "CAMB_AI_TRANSCRIBE_MEDIA",
  "CAMB_AI_TRANSLATE_TEXT",
];

describe("CAMB.AI declarative contract", () => {
  test("uses the documented x-api-key host and no caller-supplied base URL", () => {
    expect(manifest.key).toBe("camb-ai");
    expect(manifest.http.baseUrl).toBe("https://client.camb.ai/apis");
    expect(manifest.network.allowedHosts).toEqual(["client.camb.ai"]);
    expect(manifest.http.auth).toEqual({ field: "apiKey", in: "header", name: "x-api-key", value: "{{apiKey}}" });
    expect(manifest.auth.setup.fields.map((field: { key: string }) => field.key)).toEqual(["apiKey"]);
    expect(JSON.stringify(manifest)).not.toContain("{{baseUrl}}");
    expect(JSON.stringify(manifest)).not.toContain("{{host}}");
  });

  test("maps each single JSON route and keeps the other live tools in missing_still", () => {
    const mappedTools = coverage.mapped.map((entry: { tool: string }) => entry.tool);
    const stillTools = coverage.missing_still.map((entry: { tool: string }) => entry.tool);
    expect(coverage.missing_http).toEqual([]);
    expect(coverage.composio_tools).toBe(8);
    expect([...mappedTools, ...stillTools].sort()).toEqual([...liveTools].sort());
    expect(new Set([...mappedTools, ...stillTools]).size).toBe(8);
    const seen = new Set<string>();
    for (const entry of coverage.mapped) {
      const operation = manifest.operations[entry.operation];
      expect(operation.request.method, entry.tool).toBe(entry.method);
      expect(operation.request.path, entry.tool).toBe(entry.path);
      expect(operation.request.baseUrl, entry.tool).toBeUndefined();
      expect(operation.outputSchema.type, entry.tool).toBe("object");
      expect(operation.inputSchema.type, entry.tool).toBe("object");
      expect(operation.inputSchema.additionalProperties, entry.tool).toBe(false);
      expect(operation.title.length, entry.tool).toBeGreaterThan(0);
      expect(operation.description.length, entry.tool).toBeGreaterThan(0);
      expect(operation.timeoutMs).toBeGreaterThanOrEqual(1);
      expect(operation.timeoutMs).toBeLessThanOrEqual(300000);
      expect(operation.maxInputBytes).toBeLessThanOrEqual(26214400);
      expect(operation.maxResponseBytes).toBeGreaterThanOrEqual(operation.maxInputBytes);
      expect(operation.responseFormat, entry.tool).toBe("json");
      expect(operation.request.success, entry.tool).toEqual([200]);
      expect(operation.request.success, entry.tool).not.toContain(204);
      seen.add(entry.operation);
    }
    expect([...seen].sort()).toEqual(Object.keys(manifest.operations).sort());
    for (const entry of coverage.missing_still) {
      expect(entry.reason.length, entry.tool).toBeGreaterThan(0);
      expect(manifest.operations[entry.tool]).toBeUndefined();
    }
  });

  test("lists voices with one body-less GET and wraps the JSON array", async () => {
    const seen: Request[] = [];
    const voices = [{ id: 1, voice_name: "Ada", gender: 2, language: "en-us", is_published: true }];
    const result = await actions["voices.list"]!({
      apiKey: "secret",
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return response(voices);
      },
    });
    expect(seen).toHaveLength(1);
    expect(seen[0].method).toBe("GET");
    expect(new URL(seen[0].url).hostname).toBe("client.camb.ai");
    expect(new URL(seen[0].url).pathname).toBe("/apis/list-voices");
    expect(new URL(seen[0].url).search).toBe("");
    expect(seen[0].headers.get("x-api-key")).toBe("secret");
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(await seen[0].text()).toBe("");
    expect(result.data).toEqual(voices);
  });

  test("keeps a media URL in the JSON body and does not retarget the host", async () => {
    const seen: Request[] = [];
    await actions["dub.create"]!({
      apiKey: "secret",
      videoUrl: "https://evil.example/watch",
      sourceLanguage: "en-us",
      targetLanguages: ["fr-fr"],
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return response({ task_id: "task_dub_2" });
      },
    });
    const url = new URL(seen[0].url);
    expect(url.hostname).toBe("client.camb.ai");
    expect(url.pathname).toBe("/apis/dub");
    expect(JSON.parse(await seen[0].text())).toEqual({
      video_url: "https://evil.example/watch",
      source_language: "en-us",
      target_languages: ["fr-fr"],
    });
    expect(seen[0].headers.get("content-type")).toBe("application/json");
  });

  test("omits unset translation fields and does not send timeout_seconds", async () => {
    const seen: Request[] = [];
    await actions["text.translate"]!({
      apiKey: "secret",
      sourceLanguage: "en-us",
      targetLanguage: "fr-fr",
      texts: ["Hello", "World"],
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return response({ task_id: "task_translate_2" });
      },
    });
    expect(JSON.parse(await seen[0].text())).toEqual({
      source_language: "en-us",
      target_language: "fr-fr",
      texts: ["Hello", "World"],
    });
  });

  test("rejects invalid input, non-object success, empty bodies, 401, and 429", async () => {
    await expect(actions["text.translate"]!({ apiKey: "secret", sourceLanguage: "", targetLanguage: "es-es", texts: ["Hi"], fetch: async () => response({}) })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["text.translate"]!({ apiKey: "secret", sourceLanguage: "en-us", targetLanguage: "es-es", texts: [], fetch: async () => response({}) })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["text.translate"]!({ apiKey: "secret", sourceLanguage: "en-us", targetLanguage: "es-es", texts: ["Hi"], formality: 3, fetch: async () => response({}) })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["subtitles.create"]!({ apiKey: "secret", mediaUrl: "https://cdn.example/a.mp4", sourceLanguage: "en-us", targetLanguages: ["es-es"], folderId: 0, fetch: async () => response({}) })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["voices.list"]!({ apiKey: "secret", search: "gary", fetch: async () => response([]) })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["text.translate"]!({ apiKey: "secret", sourceLanguage: "en-us", targetLanguage: "es-es", texts: ["Hi"], fetch: async () => response([]) })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["voices.list"]!({ apiKey: "secret", fetch: async () => new Response("", { status: 200 }) })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["voices.list"]!({ apiKey: "secret", fetch: async () => new Response("not-json", { status: 200 }) })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["dub.create"]!({
      apiKey: "secret-value",
      videoUrl: "https://cdn.example/clip.mp4",
      sourceLanguage: "en-us",
      targetLanguages: ["es-es"],
      fetch: async () => response({ error: "bad secret-value" }, 401),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR", message: "bad [REDACTED]" });
    await expect(actions["subtitles.create"]!({
      apiKey: "secret",
      mediaUrl: "https://cdn.example/a.mp4",
      sourceLanguage: "en-us",
      targetLanguages: ["es-es"],
      fetch: async () => response({ error: "slow down" }, 429, { "Retry-After": "4" }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });

  test("does not call the network without the API key", async () => {
    let called = false;
    const result = await actions["voices.list"]!({
      fetch: async () => {
        called = true;
        return response([]);
      },
    });
    expect(called).toBe(false);
    expect(result.source).toBe("connector");
  });
});
