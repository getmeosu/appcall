import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import coverage from "../../explorium.coverage.json";

const { actions } = compileDeclarativeConnector(manifest);
const response = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers });
const apiKey = "fixture-api-key";
const businessId = "a".repeat(32);

describe("Explorium declarative contract", () => {
  test("uses the api_key header on api.explorium.ai", () => {
    expect(manifest.key).toBe("explorium");
    expect(manifest.http.baseUrl).toBe("https://api.explorium.ai");
    expect(manifest.network.allowedHosts).toEqual(["api.explorium.ai"]);
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "api_key",
      value: "{{apiKey}}",
    });
    expect(manifest.auth.setup.fields.map((field: { key: string }) => field.key)).toEqual(["apiKey"]);
    expect(Object.keys(manifest.operations)).toHaveLength(9);
    expect(coverage.composio_tools).toBe(10);
    expect(coverage.missing_http).toEqual([]);
    expect(coverage.missing_still).toEqual([
      {
        tool: "EXPLORIUM_GET_AUDIENCE_STATS",
        reason: "entity_type selects POST /v2/businesses/stats or POST /v2/prospects/stats, more than one route.",
      },
    ]);
    expect(coverage.mapped).toHaveLength(9);
  });

  test("maps each live JSON tool to one route inside the budget", () => {
    const seen = new Set<string>();
    for (const entry of coverage.mapped) {
      const operation = manifest.operations[entry.operation];
      expect(operation.request.method, entry.tool).toBe(entry.method);
      expect(operation.request.path, entry.tool).toBe(entry.path);
      expect(operation.request.path.includes(" "), entry.tool).toBe(false);
      expect(operation.outputSchema.type, entry.tool).toBe("object");
      expect(operation.inputSchema.type, entry.tool).toBe("object");
      expect(operation.inputSchema.additionalProperties, entry.tool).toBe(false);
      expect(operation.title.length, entry.tool).toBeGreaterThan(0);
      expect(operation.description.length, entry.tool).toBeGreaterThan(0);
      expect(operation.timeoutMs).toBeGreaterThanOrEqual(1);
      expect(operation.timeoutMs).toBeLessThanOrEqual(300000);
      expect(operation.maxInputBytes).toBeLessThanOrEqual(26214400);
      expect(operation.maxResponseBytes).toBeGreaterThanOrEqual(operation.maxInputBytes);
      expect(operation.request.success, entry.tool).toEqual([200]);
      expect(operation.sideEffect, entry.tool).toBe("read");
      expect(operation.responseFormat, entry.tool).toBe("json");
      expect(operation.validationMode, entry.tool).toBe("strict-generated");
      if (operation.request.method === "GET" || operation.request.method === "DELETE") {
        expect(operation.request.body, entry.tool).toBeUndefined();
        expect(operation.request.headers?.["Content-Type"], entry.tool).toBeUndefined();
      } else {
        expect(operation.request.headers["Content-Type"], entry.tool).toBe("application/json");
        expect(operation.request.body, entry.tool).toBeDefined();
      }
      seen.add(entry.operation);
    }
    expect([...seen].sort()).toEqual(Object.keys(manifest.operations).sort());
  });

  test("sends the raw api key and encodes the job id", async () => {
    const seen: Request[] = [];
    const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(new Request(input, init));
      return response({ job_id: "job/id", status: "running", input: {}, timing: {} });
    };
    await actions["jobs.get"]!({ apiKey, job_id: "job/id", fetch: fetchImpl });
    expect(new URL(seen[0].url).hostname).toBe("api.explorium.ai");
    expect(new URL(seen[0].url).pathname).toBe("/v2/jobs/status/job%2Fid");
    expect(seen[0].headers.get("api_key")).toBe(apiKey);
    expect(seen[0].headers.get("authorization")).toBeNull();
    expect(await seen[0].text()).toBe("");
    expect(seen[0].headers.get("content-type")).toBeNull();
  });

  test("rejects invalid input before a provider call", async () => {
    const fetchImpl = async () => response({});
    await expect(actions["autocomplete.filter-values"]!({ apiKey, fetch: fetchImpl })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["autocomplete.filter-values"]!({ apiKey, field: "nope", fetch: fetchImpl })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["credits.get"]!({ apiKey, extra: true, fetch: fetchImpl })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["businesses.firmographics.enrich"]!({ apiKey, business_ids: [], fetch: fetchImpl })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["businesses.firmographics.enrich"]!({ apiKey, business_ids: ["short"], fetch: fetchImpl })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["businesses.search"]!({ apiKey, page_size: 1, fetch: fetchImpl })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["businesses.search"]!({ apiKey, mode: "preview", page_size: 0, fetch: fetchImpl })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["businesses.match"]!({ apiKey, businesses_to_match: [{}], fetch: fetchImpl })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
  });

  test("rejects a non-json body and the wrong json shape", async () => {
    await expect(actions["credits.get"]!({
      apiKey,
      fetch: async () => new Response("not-json", { status: 200, headers: { "content-type": "text/plain" } }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["credits.get"]!({
      apiKey,
      fetch: async () => new Response("", { status: 200 }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["credits.get"]!({
      apiKey,
      fetch: async () => response([]),
    })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["autocomplete.filter-values"]!({
      apiKey,
      field: "country",
      fetch: async () => response({ query: "unit", label: "United States", value: "united states" }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
  });

  test("classifies 401 and 429", async () => {
    await expect(actions["credits.get"]!({
      apiKey,
      fetch: async () => response({ message: "unauthorized" }, 401),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR", message: "unauthorized" });
    await expect(actions["jobs.list"]!({
      apiKey,
      fetch: async () => response({ detail: "slow down" }, 429, { "Retry-After": "4" }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });

  test("does not call the network without the API key", async () => {
    let called = false;
    const result = await actions["credits.get"]!({
      fetch: async () => {
        called = true;
        return response({});
      },
    });
    expect(called).toBe(false);
    expect(result.source).toBe("connector");
    expect(result.connector).toBe("explorium");
  });

  test("keeps a single business id string on the firmographics body", async () => {
    const seen: Request[] = [];
    await actions["businesses.firmographics.enrich"]!({
      apiKey,
      business_ids: businessId,
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return response({
          response_context: { correlation_id: "corr", request_status: "success", time_taken_in_seconds: 0 },
          data: [],
          total_results: 0,
        });
      },
    });
    expect(await seen[0].text()).toBe(`{"business_ids":"${businessId}"}`);
    expect(seen[0].headers.get("content-type")).toBe("application/json");
  });
});
