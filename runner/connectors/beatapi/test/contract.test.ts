import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import coverage from "../../beatapi.coverage.json";

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
  inputSchema: { type: string };
  outputSchema: { type: string };
  responseFormat: string;
  request: {
    method: string;
    path: string;
    body?: unknown;
    bodyEncoding?: string;
    headers?: Record<string, string>;
    success: number[];
  };
};

describe("BeatAPI declarative contract", () => {
  test("uses bearer auth on the documented host", () => {
    expect(manifest.key).toBe("beatapi");
    expect(manifest.http.baseUrl).toBe("https://api.beatapi.io");
    expect(manifest.network.allowedHosts).toEqual(["api.beatapi.io"]);
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "Authorization",
      value: "Bearer {{apiKey}}",
    });
    expect(manifest.auth.setup.fields.map((field: { key: string }) => field.key)).toEqual(["apiKey"]);
    expect(manifest.http.headers).toEqual({ Accept: "application/json" });
    expect(Object.keys(manifest.operations)).toHaveLength(9);
  });

  test("maps each live JSON tool once and keeps budgets inside the contract", () => {
    expect(coverage.composio_tools).toBe(10);
    expect(coverage.missing_http).toEqual([]);
    expect(coverage.missing_still).toEqual([
      {
        tool: "BEATAPI_UPLOAD_FILE",
        reason: "POST /v1/files accepts only multipart form data or a raw binary file body, not a JSON request.",
      },
    ]);
    expect(coverage.mapped).toHaveLength(9);
    expect(coverage.mapped.length + coverage.missing_http.length + coverage.missing_still.length).toBe(10);
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
      expect(operation.responseFormat, entry.tool).toBe("json");
      expect(operation.timeoutMs).toBeGreaterThanOrEqual(1);
      expect(operation.timeoutMs).toBeLessThanOrEqual(300000);
      expect(operation.maxInputBytes).toBeLessThanOrEqual(26214400);
      expect(operation.maxResponseBytes).toBeGreaterThanOrEqual(operation.maxInputBytes);
      expect(operation.request.success, entry.tool).not.toContain(204);
      expect(["read", "write"]).toContain(operation.sideEffect);
      if (operation.request.method === "GET" || operation.request.method === "DELETE") {
        expect(operation.request.body, entry.tool).toBeUndefined();
        expect(operation.request.headers?.["Content-Type"], entry.tool).toBeUndefined();
      } else {
        expect(operation.request.body, entry.tool).toBeDefined();
        expect(operation.request.headers?.["Content-Type"], entry.tool).toBe("application/json");
      }
      seen.add(entry.operation);
    }
    expect([...seen].sort()).toEqual(Object.keys(manifest.operations).sort());
    expect(manifest.operations["files.upload"]).toBeUndefined();
  });

  test("posts one image generation body and keeps idempotency off the JSON", async () => {
    const seen: Request[] = [];
    const result = await actions["images.create"]!({
      ...credentials,
      generation: { model: "nano-banana", prompt: "A cup.", aspect_ratio: "1:1" },
      idempotencyKey: "img_retry_1",
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return response({ data: { id: "task_img1", object: "task", status: "queued" } }, 201);
      },
    });
    expect(seen[0].url).toBe("https://api.beatapi.io/v1/images/tasks");
    expect(seen[0].headers.get("authorization")).toBe("Bearer fixture-api-token");
    expect(seen[0].headers.get("idempotency-key")).toBe("img_retry_1");
    expect(JSON.parse(await seen[0].text())).toEqual({
      model: "nano-banana",
      prompt: "A cup.",
      aspect_ratio: "1:1",
    });
    expect(result.data).toEqual({ id: "task_img1", object: "task", status: "queued" });
  });

  test("omits optional ecommerce fields and the idempotency header", async () => {
    const seen: Request[] = [];
    await actions["ecommerce-video.create"]!({
      ...credentials,
      images: ["https://media.beatapi.io/inputs/product.png"],
      duration: 10,
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return response({ data: { id: "task_eco2", object: "task", status: "queued" } }, 201);
      },
    });
    expect(seen[0].headers.get("idempotency-key")).toBeNull();
    expect(seen[0].headers.get("content-type")).toBe("application/json");
    expect(JSON.parse(await seen[0].text())).toEqual({
      images: ["https://media.beatapi.io/inputs/product.png"],
      duration: 10,
    });
  });

  test("sends a prompt-free video contract on the single video route", async () => {
    const seen: Request[] = [];
    await actions["videos.create"]!({
      ...credentials,
      generation: {
        model: "kling-2.6-motion-control",
        images: ["https://media.beatapi.io/inputs/person.png"],
        reference_videos: ["https://media.beatapi.io/inputs/motion.mp4"],
      },
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return response({ data: { id: "task_vid2", object: "task", status: "queued" } }, 201);
      },
    });
    expect(new URL(seen[0].url).pathname).toBe("/v1/videos/tasks");
    expect(seen[0].headers.get("idempotency-key")).toBeNull();
    expect(JSON.parse(await seen[0].text())).toEqual({
      model: "kling-2.6-motion-control",
      images: ["https://media.beatapi.io/inputs/person.png"],
      reference_videos: ["https://media.beatapi.io/inputs/motion.mp4"],
    });
  });

  test("encodes the task id and leaves catalog reads body-less", async () => {
    const seen: Request[] = [];
    const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(new Request(input, init));
      return response({ data: { id: "task/a", object: "task", status: "queued" } });
    };
    await actions["tasks.get"]!({ ...credentials, taskId: "task/a", fetch });
    expect(new URL(seen[0].url).pathname).toBe("/v1/tasks/task%2Fa");
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(await seen[0].text()).toBe("");

    seen.length = 0;
    await actions["usage.get"]!({
      ...credentials,
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return response({ data: { object: "usage", period: "all", credit_balance: 0, total_tasks: 0, credits_settled: 0, credits_refunded: 0, concurrency: { limit: 1, active: 0 }, by_workflow: [], by_capability: [], by_model: [], by_api_key: [] } });
      },
    });
    expect(seen[0].url).toBe("https://api.beatapi.io/v1/usage");
    expect(seen[0].headers.get("authorization")).toBe("Bearer fixture-api-token");
    expect(seen[0].method).toBe("GET");
  });

  test("validates input and classifies malformed JSON, 401, and 429", async () => {
    await expect(actions["images.create"]!({
      ...credentials,
      generation: { prompt: "A cup." },
      fetch: async () => response({}),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["ecommerce-video.create"]!({
      ...credentials,
      images: [],
      duration: 10,
      fetch: async () => response({}),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["tasks.get"]!({
      ...credentials,
      taskId: "task_1",
      extra: true,
      fetch: async () => response({}),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["usage.get"]!({
      ...credentials,
      period: "1d",
      fetch: async () => response({}),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["workflows.list"]!({
      ...credentials,
      fetch: async () => response([]),
    })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["workflows.list"]!({
      ...credentials,
      fetch: async () => new Response("not-json", { status: 200 }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["usage.get"]!({
      ...credentials,
      fetch: async () => response({ error: { code: "invalid_api_key", message: "Key fixture-api-token is invalid", retryable: false, request_id: "req_x" } }, 401),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR", message: "Key [REDACTED] is invalid" });
    await expect(actions["effects.list"]!({
      ...credentials,
      fetch: async () => response({ error: { code: "rate_limit_exceeded", message: "Too many requests.", retryable: true, request_id: "req_y" } }, 429, { "Retry-After": "4" }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
    await expect(actions["generation-models.list"]!({
      ...credentials,
      fetch: async () => response({ error: { code: "rate_limit_exceeded", message: "Slow down.", retryable: true, request_id: "req_z", retry_after_seconds: 12 } }, 429, { "Retry-After": "4" }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 12 });
  });

  test("does not call the network without the API key", async () => {
    let called = false;
    const result = await actions["workflows.list"]!({
      fetch: async () => {
        called = true;
        return response({});
      },
    });
    expect(called).toBe(false);
    expect(result.source).toBe("connector");
  });
});
