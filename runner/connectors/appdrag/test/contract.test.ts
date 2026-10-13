import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import coverage from "../../appdrag.coverage.json";

const { actions } = compileDeclarativeConnector(manifest);
const response = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers });

const base = {
  apiKey: "fixture-key",
  project: "demo-project",
};

describe("AppDrag contract", () => {
  test("maps every live tool to one request or a missing_still reason", () => {
    const live = [
      "APPDRAG_EXECUTE_FUNCTION_DELETE_DEFAULT",
      "APPDRAG_EXECUTE_FUNCTION_DELETE_PREPROD",
      "APPDRAG_EXECUTE_FUNCTION_GET_PROD",
      "APPDRAG_EXECUTE_FUNCTION_PATCH_DEV",
      "APPDRAG_EXECUTE_FUNCTION_POST_DEFAULT",
      "APPDRAG_EXECUTE_FUNCTION_POST_PREPROD",
      "APPDRAG_EXECUTE_FUNCTION_PUT_DEFAULT",
      "APPDRAG_EXECUTE_FUNCTION_PUT_PREPROD",
      "APPDRAG_VISUAL_SQL_DELETE",
      "APPDRAG_VISUAL_SQL_SELECT",
      "APPDRAG_VISUAL_SQL_UPDATE",
    ];
    const mapped = coverage.mapped.map((row: { tool: string }) => row.tool);
    const missing = coverage.missing_still.map((row: { tool: string }) => row.tool);
    expect(coverage.missing_http).toEqual([]);
    expect([...mapped, ...missing].sort()).toEqual([...live].sort());
    expect(mapped.length + missing.length).toBe(11);
    for (const row of coverage.mapped) {
      const operation = manifest.operations[row.operation];
      expect(operation?.request?.method, row.tool).toBeTypeOf("string");
      expect(operation?.request?.path, row.tool).toBeTypeOf("string");
      expect(actions[row.operation], row.tool).toBeTypeOf("function");
    }
  });

  test("sends APIKey as a query parameter on the project host, not a bearer header", async () => {
    const seen: { url: string; method: string; body: unknown; headers: Headers }[] = [];
    await actions["functions.get"]!({
      ...base,
      folder: "crm",
      function: "list-rows",
      query_params: { id: "row/1" },
      fetch: async (input: unknown, init: { method?: string; body?: unknown; headers?: HeadersInit }) => {
        seen.push({
          url: String(input),
          method: String(init?.method),
          body: init?.body,
          headers: new Headers(init?.headers),
        });
        return response({ status: "OK", execTime: 1, billedTime: 1000, payload: { id: "row/1" }, logs: "" });
      },
    });
    const url = new URL(seen[0].url);
    expect(url.hostname).toBe("demo-project.appdrag.com");
    expect(url.pathname).toBe("/api/crm/list-rows");
    expect(url.searchParams.get("APIKey")).toBe("fixture-key");
    expect(url.searchParams.get("id")).toBe("row/1");
    expect(seen[0].method).toBe("GET");
    expect(seen[0].body ?? null).toBeNull();
    expect(seen[0].headers.get("authorization")).toBeNull();
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(seen[0].headers.get("accept")).toBe("application/json");
  });

  test("posts a JSON object body and keeps a slash inside one path segment", async () => {
    const seen: { url: string; body: unknown; headers: Headers }[] = [];
    await actions["functions.post"]!({
      ...base,
      folder: "a/b",
      function: "add-row",
      parameters: { name: "ada" },
      fetch: async (input: unknown, init: { body?: unknown; headers?: HeadersInit }) => {
        seen.push({ url: String(input), body: init?.body, headers: new Headers(init?.headers) });
        return response({ status: "OK", execTime: 1, billedTime: 1000, payload: { name: "ada" }, logs: "" });
      },
    });
    expect(new URL(seen[0].url).pathname).toBe("/api/a%2Fb/add-row");
    expect(seen[0].body).toBe("{\"name\":\"ada\"}");
    expect(seen[0].headers.get("content-type")).toBe("application/json");
    expect(seen[0].headers.get("authorization")).toBeNull();
  });

  test("rejects a project value that would leave appdrag.com", async () => {
    let called = false;
    await expect(actions["functions.get"]!({
      ...base,
      project: "evil.com/",
      folder: "crm",
      function: "list-rows",
      fetch: async () => {
        called = true;
        return response({});
      },
    })).rejects.toMatchObject({ code: "OUTBOUND_HOST_NOT_ALLOWED" });
    expect(called).toBe(false);
  });

  test("validates input, malformed JSON, 401, and 429", async () => {
    await expect(actions["functions.post"]!({
      ...base,
      folder: "",
      function: "add-row",
      parameters: { name: "ada" },
      fetch: async () => response({}),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["visual-sql.select"]!({
      ...base,
      folder: "hr",
      visualSelectFunction: "employees",
      fetch: async () => new Response("not-json", { status: 200 }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["functions.get"]!({
      ...base,
      folder: "crm",
      function: "list-rows",
      fetch: async () => response({ error: "bad key" }, 401),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(actions["functions.get"]!({
      ...base,
      folder: "crm",
      function: "list-rows",
      fetch: async () => response({ error: "slow" }, 429, { "Retry-After": "4" }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });
});
