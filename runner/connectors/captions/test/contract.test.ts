import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import coverage from "../../captions.coverage.json";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest);
const response = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers });
const credentials = { apiKey: "fixture-api-token" };

type Operation = {
  kind: string;
  sideEffect: string;
  title: string;
  description: string;
  timeoutMs: number;
  maxInputBytes: number;
  maxResponseBytes: number;
  inputSchema: { type: string; properties?: Record<string, unknown> };
  outputSchema: { type: string };
  responseFormat: string;
  request: {
    method: string;
    path: string;
    body?: unknown;
    bodyEncoding?: string;
    baseUrl?: string;
    headers?: Record<string, string>;
    success: number[];
  };
};

const video = {
  id: "video_abc123def456",
  object: "video",
  status: "COMPLETE",
  created_at: 1730822400,
  completed_at: 1730822520,
  progress: 100,
  model: "mirage-avatar-x",
  video_id: "video_abc123def456",
};

describe("Captions declarative contract", () => {
  test("uses the documented x-api-key host and no caller URL", () => {
    expect(manifest.key).toBe("captions");
    expect(manifest.http.baseUrl).toBe("https://api.mirage.app");
    expect(manifest.network.allowedHosts).toEqual(["api.mirage.app"]);
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "x-api-key",
      value: "{{apiKey}}",
    });
    expect(manifest.auth.setup.fields.map((field: { key: string }) => field.key)).toEqual(["apiKey"]);
    expect(manifest.http.headers).toEqual({ Accept: "application/json" });
    expect(Object.keys(manifest.operations)).toEqual([
      "healthcheck",
      "videos.list",
      "videos.get",
      "caption-templates.list",
      "caption-templates.get",
    ]);
    for (const operation of Object.values(manifest.operations) as Operation[]) {
      expect(operation.request.baseUrl).toBeUndefined();
      const names = Object.keys(operation.inputSchema.properties ?? {});
      expect(names.some((name) => /url/i.test(name))).toBe(false);
    }
  });

  test("maps each live JSON tool once and keeps budgets inside the contract", () => {
    expect(coverage.composio_tools).toBe(8);
    expect(coverage.missing_http).toEqual([]);
    expect(coverage.missing_still.map((entry) => entry.tool)).toEqual([
      "CAPTIONS_ADD_CAPTIONS",
      "CAPTIONS_DOWNLOAD_VIDEO",
      "CAPTIONS_GENERATE_SPEECH",
      "CAPTIONS_GENERATE_VIDEO",
    ]);
    expect(coverage.mapped).toHaveLength(4);
    expect(coverage.mapped.length + coverage.missing_http.length + coverage.missing_still.length).toBe(8);
    const seen = new Set<string>();
    for (const entry of coverage.mapped) {
      const operation = manifest.operations[entry.operation] as Operation;
      expect(operation?.request?.method, entry.tool).toBe(entry.method);
      expect(operation?.request?.path, entry.tool).toBe(entry.path);
      expect(operation.request.bodyEncoding, entry.tool).toBeUndefined();
      expect(operation.outputSchema.type, entry.tool).toBe("object");
      expect(operation.inputSchema.type, entry.tool).toBe("object");
      expect(operation.title.length, entry.tool).toBeGreaterThan(0);
      expect(operation.description.length, entry.tool).toBeGreaterThan(0);
      expect(operation.kind, entry.tool).toBe("action");
      expect(operation.sideEffect, entry.tool).toBe("read");
      expect(operation.responseFormat, entry.tool).toBe("json");
      expect(operation.timeoutMs).toBeGreaterThanOrEqual(1);
      expect(operation.timeoutMs).toBeLessThanOrEqual(300000);
      expect(operation.maxInputBytes).toBeLessThanOrEqual(26214400);
      expect(operation.maxResponseBytes).toBeGreaterThanOrEqual(operation.maxInputBytes);
      expect(operation.request.success, entry.tool).toEqual([200]);
      expect(operation.request.method, entry.tool).toBe("GET");
      expect(operation.request.body, entry.tool).toBeUndefined();
      expect(operation.request.headers?.["Content-Type"], entry.tool).toBeUndefined();
      seen.add(entry.operation);
    }
    expect([...seen].sort()).toEqual([
      "caption-templates.get",
      "caption-templates.list",
      "videos.get",
      "videos.list",
    ]);
    expect(manifest.operations["videos.create"]).toBeUndefined();
    expect(manifest.operations["videos.content"]).toBeUndefined();
    expect(manifest.operations["captions.add"]).toBeUndefined();
    expect(manifest.operations["speech.generate"]).toBeUndefined();
  });

  test("wraps the video list array and sends after for the Composio cursor", async () => {
    const seen: Request[] = [];
    const result = await actions["videos.list"]!({
      ...credentials,
      limit: 2,
      order: "asc",
      after: "video_prev123",
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return response([video]);
      },
    });
    expect(seen[0].url).toBe("https://api.mirage.app/v1/videos?limit=2&order=asc&after=video_prev123");
    expect(seen[0].headers.get("x-api-key")).toBe("fixture-api-token");
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(await seen[0].text()).toBe("");
    expect(result.data).toEqual([video]);
    expect(new URL(seen[0].url).hostname).toBe("api.mirage.app");
  });

  test("omits unset list filters and does not follow a preview URL", async () => {
    const seen: Request[] = [];
    const listed = await actions["videos.list"]!({
      ...credentials,
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return response([]);
      },
    });
    expect(seen[0].url).toBe("https://api.mirage.app/v1/videos");
    expect(listed.data).toEqual([]);

    seen.length = 0;
    const templates = await actions["caption-templates.list"]!({
      ...credentials,
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return response({
          data: [
            {
              id: "ctpl_123456789abcdefg",
              name: "Bold White",
              created_at: 1730000000,
              preview_url: "https://captions-cdn.xyz/preview.mp4",
            },
          ],
          has_more: false,
          object: "list",
        });
      },
    });
    expect(seen).toHaveLength(1);
    expect(seen[0].url).toBe("https://api.mirage.app/v1/videos/captions/templates");
    expect(templates.data[0].preview_url).toBe("https://captions-cdn.xyz/preview.mp4");
    expect(templates.has_more).toBe(false);
  });

  test("encodes path ids and keeps reads body-less", async () => {
    const seen: Request[] = [];
    const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(new Request(input, init));
      return response(video);
    };
    await actions["videos.get"]!({ ...credentials, video_id: "video_a/b", fetch });
    expect(new URL(seen[0].url).pathname).toBe("/v1/videos/video_a%2Fb");
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(await seen[0].text()).toBe("");

    seen.length = 0;
    await actions["caption-templates.get"]!({
      ...credentials,
      template_id: "ctpl_a/b",
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return response({
          id: "ctpl_a/b",
          name: "Bold White",
          created_at: 1730000000,
          object: "caption_template",
          preview_url: null,
        });
      },
    });
    expect(new URL(seen[0].url).pathname).toBe("/v1/videos/captions/templates/ctpl_a%2Fb");
  });

  test("validates input and classifies malformed JSON, 401, and 429", async () => {
    await expect(actions["videos.get"]!({
      ...credentials,
      video_id: "",
      fetch: async () => response(video),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["videos.list"]!({
      ...credentials,
      limit: 0,
      fetch: async () => response([]),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["videos.list"]!({
      ...credentials,
      limit: 101,
      fetch: async () => response([]),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["videos.list"]!({
      ...credentials,
      order: "newest",
      fetch: async () => response([]),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["caption-templates.get"]!({
      ...credentials,
      template_id: "ctpl_123456789abcdefg",
      url: "https://evil.example/template",
      fetch: async () => response({}),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["videos.list"]!({
      ...credentials,
      fetch: async () => response({ data: [] }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["caption-templates.list"]!({
      ...credentials,
      fetch: async () => response([]),
    })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["videos.get"]!({
      ...credentials,
      video_id: "video_abc123def456",
      fetch: async () => new Response("not-json", { status: 200 }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["videos.get"]!({
      ...credentials,
      video_id: "video_abc123def456",
      fetch: async () => response({ detail: "bad key fixture-api-token" }, 401),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR", message: "bad key [REDACTED]" });
    await expect(actions["caption-templates.list"]!({
      ...credentials,
      fetch: async () => response({ detail: "Too many requests." }, 429, { "Retry-After": "4" }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });

  test("does not call the network without the API key", async () => {
    let called = false;
    const result = await actions.healthcheck!({
      fetch: async () => {
        called = true;
        return response([]);
      },
    });
    expect(called).toBe(false);
    expect(result.source).toBe("connector");
    expect(result.validated).toEqual({});
  });
});
