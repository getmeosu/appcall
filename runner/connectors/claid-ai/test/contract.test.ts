import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import coverage from "../../claid-ai.coverage.json";
import manifest from "../manifest.json";

const operations = manifest.operations as Record<string, Record<string, any>>;
const { actions } = compileDeclarativeConnector(manifest as never);
const liveTools = [
  "CLAID_AI_BACKGROUND_GENERATE",
  "CLAID_AI_BACKGROUND_REMOVE",
  "CLAID_AI_CLAID_STORAGE_DETAILS",
  "CLAID_AI_CREATE_STORAGE",
  "CLAID_AI_GENERATIVE_RESIZE",
  "CLAID_AI_IMAGE_AI_EDIT",
  "CLAID_AI_IMAGE_EDIT_BATCH",
  "CLAID_AI_IMAGE_GENERATE",
  "CLAID_AI_LICENSE_PLATE_BLUR",
  "CLAID_AI_PATCH_STORAGE",
  "CLAID_AI_POLISH_IMAGE",
  "CLAID_AI_SMART_FRAME",
  "CLAID_AI_STORAGE_LIST",
  "CLAID_AI_STORAGE_TYPES",
];

const json = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

const editBody = {
  data: {
    input: { ext: "png", mps: 0.125, mime: "image/png", format: "PNG", width: 500, height: 250 },
    output: {
      ext: "png",
      mps: 0.431,
      mime: "image/jpeg",
      format: "JPEG",
      width: 1000,
      height: 431,
      tmp_url: "https://storage.googleapis.com/production-leapi-tmp-public/example.png",
    },
  },
};

describe("Claid.ai contract", () => {
  test("maps every live tool to one JSON route", () => {
    const mapped = coverage.mapped.map((row: { tool: string }) => row.tool);
    const missing = coverage.missing_still.map((row: { tool: string }) => row.tool);
    expect(coverage.missing_http).toEqual([]);
    expect(coverage.missing_still).toEqual([]);
    expect([...mapped, ...missing].sort()).toEqual([...liveTools].sort());
    expect(mapped.length + missing.length).toBe(liveTools.length);
    expect(mapped.length).toBe(14);
    for (const row of coverage.mapped) {
      const operation = operations[row.operation];
      expect(operation.request.method, row.tool).toBe(row.method);
      expect(operation.request.path, row.tool).toBe(row.path);
      expect(operation.request.success, row.tool).toEqual([200]);
      expect(typeof actions[row.operation], row.tool).toBe("function");
    }
  });

  test("keeps bearer auth, fixed host, and JSON bounds", () => {
    expect(manifest.key).toBe("claid-ai");
    expect(manifest.version).toBe("0.1.0");
    expect(manifest.network.allowedHosts).toEqual(["api.claid.ai"]);
    expect(manifest.http.baseUrl).toBe("https://api.claid.ai/v1");
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "Authorization",
      value: "Bearer {{apiKey}}",
    });
    expect(manifest.http.headers).toEqual({ Accept: "application/json" });
    for (const [name, operation] of Object.entries(operations)) {
      expect(operation.kind, name).toBe("action");
      expect(operation.title.length, name).toBeGreaterThan(0);
      expect(operation.description.length, name).toBeGreaterThan(0);
      expect(operation.inputSchema.type, name).toBe("object");
      expect(operation.inputSchema.additionalProperties, name).toBe(false);
      expect(operation.outputSchema.type, name).toBe("object");
      expect(operation.responseFormat, name).toBe("json");
      expect(operation.enforceOutputSchema, name).toBe(true);
      expect(operation.validationMode, name).toBe("strict-generated");
      expect(operation.maxResponseBytes, name).toBeGreaterThanOrEqual(operation.maxInputBytes);
      expect(operation.maxInputBytes, name).toBeLessThanOrEqual(26214400);
      expect(operation.timeoutMs, name).toBeGreaterThanOrEqual(1);
      expect(operation.timeoutMs, name).toBeLessThanOrEqual(300000);
      expect(operation.request.baseUrl, name).toBeUndefined();
      const method = operation.request.method;
      expect(["GET", "POST", "PATCH"].includes(method), name).toBe(true);
      if (method === "GET" || method === "DELETE") {
        expect(operation.request.body, name).toBeUndefined();
        expect(operation.request.headers?.["Content-Type"], name).toBeUndefined();
      } else {
        expect(operation.request.headers?.["Content-Type"], name).toBe("application/json");
        expect(typeof operation.request.body, name).toBe("object");
      }
    }
  });

  test("sends bearer to api.claid.ai and does not fetch the image URL", async () => {
    const seen: Request[] = [];
    const result = await actions["images.background.remove"]!({
      apiKey: "secret-token",
      input: "https://evil.example/image.png",
      operations: { background: { remove: true } },
      fetch: async (input: string | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return json(editBody);
      },
    });
    expect(seen).toHaveLength(1);
    expect(seen[0].method).toBe("POST");
    expect(seen[0].headers.get("authorization")).toBe("Bearer secret-token");
    expect(seen[0].headers.get("content-type")).toBe("application/json");
    expect(new URL(seen[0].url).origin).toBe("https://api.claid.ai");
    expect(new URL(seen[0].url).pathname).toBe("/v1/image/edit");
    expect(await seen[0].text()).toBe('{"input":"https://evil.example/image.png","operations":{"background":{"remove":true}}}');
    expect(result.data.output.tmp_url).toContain("https://");
  });

  test("keeps reads body-less and frames only the supplied canvas fields", async () => {
    const seen: Request[] = [];
    const capture = async (input: string | URL, init?: RequestInit) => {
      seen.push(new Request(input, init));
      return json({ data: ["web_folder", "s3", "gcs"] });
    };
    const types = await actions["storages.types"]!({ apiKey: "secret-token", fetch: capture });
    expect(seen[0].method).toBe("GET");
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(await seen[0].text()).toBe("");
    expect(new URL(seen[0].url).pathname).toBe("/v1/storage/storage-types");
    expect(types.data).toEqual(["web_folder", "s3", "gcs"]);

    seen.length = 0;
    await actions["images.smartFrame"]!({
      apiKey: "secret-token",
      input: "storage://bucket/shoe.png",
      options: { width: 800, height: 800 },
      fetch: async (input: string | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return json(editBody);
      },
    });
    expect(await seen[0].text()).toBe(
      '{"input":"storage://bucket/shoe.png","operations":{"resizing":{"width":800,"height":800,"fit":"canvas"}}}',
    );

    seen.length = 0;
    await actions["images.aiEdit"]!({
      apiKey: "secret-token",
      input: "https://picsum.photos/500",
      options: { prompt: "add a duck" },
      fetch: async (input: string | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return json({
          data: {
            id: 1,
            status: "ACCEPTED",
            result_url: "https://api.claid.ai/v1/image/ai-edit/1",
            created_at: "2025-03-13T11:37:09.160554+00:00",
            request: { input: "https://picsum.photos/500", options: { prompt: "add a duck" } },
          },
        });
      },
    });
    expect(seen).toHaveLength(1);
    expect(new URL(seen[0].url).pathname).toBe("/v1/image/ai-edit");
  });

  test("rejects bad input, empty JSON, unauthorized, and rate limits", async () => {
    const fetch = async () => json(editBody);
    await expect(actions["images.background.remove"]!({
      apiKey: "secret-token",
      input: "https://claid.ai/assets/cms/shoe_example_05fb154a3a/shoe_example_05fb154a3a.png",
      fetch,
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["storages.get"]!({
      apiKey: "secret-token",
      storageId: 0,
      fetch,
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["storages.list"]!({
      apiKey: "secret-token",
      extra: true,
      fetch,
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["storages.types"]!({
      apiKey: "secret-token",
      fetch: async () => new Response("", { status: 200, headers: { "content-type": "application/json" } }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["storages.types"]!({
      apiKey: "secret-token",
      fetch: async () => new Response("not-json", { status: 200, headers: { "content-type": "application/json" } }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["storages.types"]!({
      apiKey: "secret-token",
      fetch: async () => json({ error_message: "Authorization is required." }, 401),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(actions["storages.types"]!({
      apiKey: "secret-token",
      fetch: async () => json({ error_message: "Too many requests." }, 429, { "RateLimit-Reset": "4" }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });
});
