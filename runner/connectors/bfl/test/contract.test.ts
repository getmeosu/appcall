import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import coverage from "../../bfl.coverage.json";
import manifest from "../manifest.json";

const operations = manifest.operations as Record<string, Record<string, any>>;
const { actions } = compileDeclarativeConnector(manifest);
const liveTools = [
  "BFL_DEBLUR_IMAGE",
  "BFL_EDIT_VIDEO",
  "BFL_ERASE_IMAGE_OBJECT",
  "BFL_GENERATE_FINETUNED_IMAGE",
  "BFL_GENERATE_OR_EDIT_FLUX_2_KLEIN_IMAGE",
  "BFL_GENERATE_OR_EDIT_IMAGE",
  "BFL_GENERATE_VIDEO",
  "BFL_GET_CREDITS",
  "BFL_GET_FINETUNE",
  "BFL_GET_GENERATION_RESULT",
  "BFL_LIST_FINETUNES",
  "BFL_OUTPAINT_IMAGE",
  "BFL_UPSCALE_VIDEO",
  "BFL_VIRTUAL_TRY_ON",
];

const response = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers });

describe("Black Forest Labs contract", () => {
  test("maps every live tool to one request or a single-route gap", () => {
    const mapped = coverage.mapped.map((row) => row.tool);
    const missing = coverage.missing_still.map((row) => row.tool);
    expect(coverage.missing_http).toEqual([]);
    expect(coverage.composio_tools).toBe(liveTools.length);
    expect([...mapped, ...missing].sort()).toEqual([...liveTools].sort());
    expect(mapped.length + missing.length).toBe(liveTools.length);
    expect(new Set(mapped).size).toBe(mapped.length);
    for (const row of coverage.mapped) {
      const operation = operations[row.operation];
      expect(operation.request.method, row.tool).toBe(row.method);
      expect(operation.request.path, row.tool).toBe(row.path);
      expect(typeof actions[row.operation], row.tool).toBe("function");
    }
    expect(JSON.stringify(operations)).not.toContain("flux-2-klein");
  });

  test("uses the documented api.bfl.ai host and x-key header", () => {
    expect(manifest.network.allowedHosts).toEqual(["api.bfl.ai", "api.eu.bfl.ai", "api.us.bfl.ai"]);
    expect(manifest.http.baseUrl).toBe("https://api.bfl.ai");
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "x-key",
      value: "{{apiKey}}",
    });
    expect(JSON.stringify(manifest.http.auth)).not.toContain("Bearer");
  });

  test("keeps budgets, body-less reads, and JSON content type on writes", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as Record<string, any>;
      expect(operation.maxResponseBytes, key).toBeGreaterThanOrEqual(operation.maxInputBytes);
      expect(operation.maxInputBytes, key).toBeLessThanOrEqual(26214400);
      expect(operation.maxInputBytes, key).toBeGreaterThanOrEqual(1);
      expect(operation.timeoutMs, key).toBeGreaterThanOrEqual(1);
      expect(operation.timeoutMs, key).toBeLessThanOrEqual(300000);
      expect(operation.outputSchema.type, key).toBe("object");
      expect(operation.responseFormat, key).toBe("json");
      expect(request.success, key).toEqual([200]);
      if (request.method === "GET" || request.method === "DELETE") {
        expect(request.body, key).toBeUndefined();
        expect(request.headers?.["Content-Type"], key).toBeUndefined();
      } else {
        expect(request.headers["Content-Type"], key).toBe("application/json");
        expect(request.body, key).toBeDefined();
      }
    }
  });

  test("credits and finetune lookup send x-key and encode the id", async () => {
    const seen: Array<{ url: string; init: RequestInit }> = [];
    const credits = await actions["credits.get"]!({
      apiKey: "secret",
      fetch: async (url, init) => {
        seen.push({ url: String(url), init: init ?? {} });
        return response({ credits: 12 });
      },
    });
    expect(seen[0].url).toBe("https://api.bfl.ai/v1/credits");
    expect(seen[0].init.method).toBe("GET");
    expect(seen[0].init.body).toBeUndefined();
    const headers = seen[0].init.headers as Record<string, string>;
    expect(headers["x-key"]).toBe("secret");
    expect(headers.Authorization).toBeUndefined();
    expect(headers["Content-Type"]).toBeUndefined();
    expect(credits.data).toEqual({ credits: 12 });

    seen.length = 0;
    await actions["finetunes.get"]!({
      apiKey: "secret",
      finetune_id: "org/lora",
      fetch: async (url, init) => {
        seen.push({ url: String(url), init: init ?? {} });
        return response({ finetune_details: { finetune_id: "org/lora" } });
      },
    });
    const lookup = new URL(seen[0].url);
    expect(lookup.pathname).toBe("/v1/finetune_details");
    expect(lookup.search).toBe("?finetune_id=org%2Flora");
    expect(seen[0].init.body).toBeUndefined();
  });

  test("deblur posts one JSON body and omits unset fields", async () => {
    const seen: Array<{ url: string; init: RequestInit }> = [];
    const result = await actions["images.deblur"]!({
      apiKey: "secret",
      image: "https://cdn.example/blur.png",
      output_format: "png",
      fetch: async (url, init) => {
        seen.push({ url: String(url), init: init ?? {} });
        return response({
          id: "task_deblur",
          polling_url: "https://api.bfl.ai/v1/get_result?id=task_deblur",
        });
      },
    });
    expect(seen[0].url).toBe("https://api.bfl.ai/v1/flux-tools/deblur-v1");
    expect(seen[0].init.method).toBe("POST");
    expect(seen[0].init.body).toBe('{"image":"https://cdn.example/blur.png","output_format":"png"}');
    const headers = seen[0].init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["x-key"]).toBe("secret");
    expect(result.data.id).toBe("task_deblur");
  });

  test("generation result is only GET /v1/get_result on the global host", async () => {
    const seen: Array<{ url: string; init: RequestInit }> = [];
    await actions["generations.get"]!({
      apiKey: "secret",
      id: "task_1",
      fetch: async (url, init) => {
        seen.push({ url: String(url), init: init ?? {} });
        return response({
          id: "task_1",
          status: "Ready",
          cost: 4,
          result: { sample: "https://delivery.bfl.ai/results/task_1.jpeg" },
        });
      },
    });
    expect(seen[0].url).toBe("https://api.bfl.ai/v1/get_result?id=task_1");
    expect(seen[0].init.method).toBe("GET");
    expect(seen[0].init.body).toBeUndefined();
    await expect(actions["generations.get"]!({
      apiKey: "secret",
      polling_url: "https://api.eu.bfl.ai/v1/get_result?id=task_1",
      fetch: async () => response({}),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
  });

  test("rejects extra input, malformed JSON, 401, and 429", async () => {
    await expect(actions["credits.get"]!({
      apiKey: "secret",
      extra: true,
      fetch: async () => response({}),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["images.deblur"]!({
      apiKey: "secret",
      image: "",
      fetch: async () => response({}),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["credits.get"]!({
      apiKey: "secret",
      fetch: async () => new Response("not-json", { status: 200, headers: { "content-type": "text/plain" } }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["credits.get"]!({
      apiKey: "secret",
      fetch: async () => response([], 200),
    })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["credits.get"]!({
      apiKey: "secret",
      fetch: async () => response({ detail: "unauthorized" }, 401),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(actions["images.deblur"]!({
      apiKey: "secret",
      image: "https://cdn.example/blur.png",
      fetch: async () => response({ detail: "slow down" }, 429, { "Retry-After": "4" }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });
});
