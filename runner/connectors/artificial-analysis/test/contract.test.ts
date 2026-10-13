import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const operations = manifest.operations as Record<string, Record<string, any>>;
const { actions } = compileDeclarativeConnector(manifest as never);
const json = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers });

const mapped: Record<string, string> = {
  ARTIFICIAL_ANALYSIS_LIST_IMAGE_EDITING_MODELS: "image-editing-models.list",
  ARTIFICIAL_ANALYSIS_LIST_IMAGE_TO_VIDEO_AUDIO_MODELS: "image-to-video-audio-models.list",
  ARTIFICIAL_ANALYSIS_LIST_IMAGE_TO_VIDEO_MODELS: "image-to-video-models.list",
  ARTIFICIAL_ANALYSIS_LIST_LANGUAGE_MODELS: "language-models.list",
  ARTIFICIAL_ANALYSIS_LIST_MUSIC_INSTRUMENTAL_MODELS: "music-instrumental-models.list",
  ARTIFICIAL_ANALYSIS_LIST_MUSIC_WITH_VOCALS_MODELS: "music-with-vocals-models.list",
  ARTIFICIAL_ANALYSIS_LIST_SPEECH_TO_SPEECH_MODELS: "speech-to-speech-models.list",
  ARTIFICIAL_ANALYSIS_LIST_SPEECH_TO_TEXT_MODELS: "speech-to-text-models.list",
  ARTIFICIAL_ANALYSIS_LIST_TEXT_TO_IMAGE_MODELS: "text-to-image-models.list",
  ARTIFICIAL_ANALYSIS_LIST_TEXT_TO_SPEECH_MODELS: "text-to-speech-models.list",
  ARTIFICIAL_ANALYSIS_LIST_TEXT_TO_VIDEO_AUDIO_MODELS: "text-to-video-audio-models.list",
  ARTIFICIAL_ANALYSIS_LIST_TEXT_TO_VIDEO_MODELS: "text-to-video-models.list",
};

describe("artificial-analysis contract", () => {
  test("uses the documented host and x-api-key header", () => {
    expect(manifest.key).toBe("artificial-analysis");
    expect(manifest.version).toBe("0.1.0");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.network.allowedHosts).toEqual(["artificialanalysis.ai"]);
    expect(manifest.http.baseUrl).toBe("https://artificialanalysis.ai/api/v2");
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "x-api-key",
      value: "{{apiKey}}",
    });
    expect(manifest.http.headers).toEqual({ Accept: "application/json" });
    expect(JSON.stringify(manifest.http).toLowerCase()).not.toContain("content-type");
  });

  test("maps the 12 live tools onto one GET each", () => {
    expect(Object.keys(mapped)).toHaveLength(12);
    expect(Object.keys(operations)).toHaveLength(13);
    for (const [tool, operation] of Object.entries(mapped)) {
      const request = operations[operation]?.request;
      expect(request, tool).toBeDefined();
      expect(request.method, tool).toBe("GET");
      expect(String(request.path), tool).toMatch(/^\/[^?]+$/);
      expect(request.body, tool).toBeUndefined();
      expect(actions[operation], tool).toBeTypeOf("function");
    }
    const paths = Object.values(mapped).map((operation) => operations[operation].request.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  test("keeps budgets, read side effects, and object schemas", () => {
    for (const [key, operation] of Object.entries(operations)) {
      expect(operation.kind, key).toBe("action");
      expect(operation.sideEffect, key).toBe("read");
      expect(operation.responseFormat, key).toBe("json");
      expect(operation.validationMode, key).toBe("strict-generated");
      expect(operation.enforceOutputSchema, key).toBe(true);
      expect(operation.inputSchema.type, key).toBe("object");
      expect(operation.outputSchema.type, key).toBe("object");
      expect(operation.title.length, key).toBeGreaterThan(0);
      expect(operation.description.length, key).toBeGreaterThan(0);
      expect(operation.timeoutMs, key).toBeGreaterThanOrEqual(1);
      expect(operation.timeoutMs, key).toBeLessThanOrEqual(300000);
      expect(operation.maxInputBytes, key).toBeLessThanOrEqual(26214400);
      expect(operation.maxResponseBytes, key).toBeGreaterThanOrEqual(operation.maxInputBytes);
      expect(operation.request.method, key).toBe("GET");
      expect(operation.request.headers, key).toBeUndefined();
      expect(operation.request.body, key).toBeUndefined();
    }
  });

  test("sends the API key and does not forward local slice fields", async () => {
    const seen: Request[] = [];
    const fetchImpl = async (url: string | URL, init?: RequestInit) => {
      seen.push(new Request(url, init));
      return json({ tier: "free", data: [] });
    };
    await actions["text-to-image-models.list"]!({ apiKey: "secret-key", limit: 3, fetch: fetchImpl });
    expect(seen[0].headers.get("x-api-key")).toBe("secret-key");
    expect(seen[0].headers.get("authorization")).toBeNull();
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(seen[0].method).toBe("GET");
    expect(new URL(seen[0].url).search).toBe("");
    expect(new URL(seen[0].url).pathname).toBe("/api/v2/media/text-to-image/models/free");

    seen.length = 0;
    await actions["language-models.list"]!({ apiKey: "secret-key", cursor: "3", start: 0, end: 25, fetch: fetchImpl });
    const page = new URL(seen[0].url);
    expect(page.pathname).toBe("/api/v2/language/models/free");
    expect(page.searchParams.get("page")).toBe("3");
    expect(page.searchParams.has("start")).toBe(false);
    expect(page.searchParams.has("end")).toBe(false);
    expect(page.searchParams.has("cursor")).toBe(false);
  });

  test("rejects bad input and classifies 401, 429, and a non-object body", async () => {
    const fetchImpl = async () => json({ tier: "free", data: [] });
    await expect(actions["text-to-image-models.list"]!({ apiKey: "k", limit: 0, fetch: fetchImpl })).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
    await expect(actions["language-models.list"]!({ apiKey: "k", cursor: "", fetch: fetchImpl })).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
    await expect(actions["language-models.list"]!({ apiKey: "k", extra: true, fetch: fetchImpl })).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
    await expect(
      actions["language-models.list"]!({ apiKey: "k", fetch: async () => json({ error: "Invalid/missing API key" }, 401) }),
    ).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(
      actions["language-models.list"]!({
        apiKey: "k",
        fetch: async () => json({ error: "Rate limit exceeded" }, 429, { "Retry-After": "9" }),
      }),
    ).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 9 });
    await expect(actions["language-models.list"]!({ apiKey: "k", fetch: async () => json([]) })).rejects.toMatchObject({
      code: "CONNECTOR_RESPONSE_INVALID",
    });
    await expect(
      actions["language-models.list"]!({ apiKey: "k", fetch: async () => new Response("", { status: 200 }) }),
    ).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
  });
});
