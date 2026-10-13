import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import coverage from "../../checkflow.coverage.json";

const { actions } = compileDeclarativeConnector(manifest);
const response = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers });
const key = { apiKey: "fixture-api-key" };

describe("CheckFlow declarative contract", () => {
  test("uses the documented API key header and host", () => {
    expect(manifest.key).toBe("checkflow");
    expect(manifest.http.baseUrl).toBe("https://app.checkflow.io");
    expect(manifest.network.allowedHosts).toEqual(["app.checkflow.io"]);
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "X-API-KEY",
      value: "{{apiKey}}",
    });
    expect(manifest.http.headers).toEqual({ Accept: "application/json" });
    expect(manifest.auth.setup.fields.map((field: { key: string }) => field.key)).toEqual(["apiKey"]);
  });

  test("maps each live tool to one JSON route inside the budget", () => {
    expect(coverage.composio_tools).toBe(10);
    expect(coverage.missing_http).toEqual([]);
    expect(coverage.missing_still).toEqual([]);
    expect(coverage.mapped).toHaveLength(10);
    const seen = new Set<string>();
    for (const entry of coverage.mapped) {
      const operation = manifest.operations[entry.operation];
      expect(operation.request.method, entry.tool).toBe(entry.method);
      expect(operation.request.path, entry.tool).toBe(entry.path);
      expect(operation.request.path, entry.tool).not.toMatch(/^https?:/i);
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
      expect(operation.request.body, entry.tool).toBeUndefined();
      expect(operation.request.headers?.["Content-Type"], entry.tool).toBeUndefined();
      expect(JSON.stringify(operation.inputSchema)).not.toMatch(/"url"/i);
      seen.add(entry.operation);
    }
    expect([...seen].sort()).toEqual(Object.keys(manifest.operations).sort());
    expect(coverage.mapped.length + coverage.missing_http.length + coverage.missing_still.length).toBe(coverage.composio_tools);
  });

  test("sends the API key, omits unset filters, and keeps create tag body-less", async () => {
    const seen: Request[] = [];
    const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(new Request(input, init));
      return response([{ key: "fixture-tag-key", name: "Finance" }]);
    };
    const listed = await actions["tags.list"]!({ ...key, fetch });
    expect(Array.isArray(listed.data)).toBe(true);
    expect(seen[0].headers.get("x-api-key")).toBe("fixture-api-key");
    expect(seen[0].headers.get("accept")).toBe("application/json");
    expect(seen[0].headers.get("x-api-version")).toBeNull();
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(new URL(seen[0].url).search).toBe("");

    seen.length = 0;
    await actions["tags.create"]!({ ...key, name: "Finance", fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(new Request(input, init));
      return response({ key: "fixture-tag-key", name: "Finance" });
    } });
    expect(seen[0].method).toBe("POST");
    expect(new URL(seen[0].url).pathname).toBe("/api/tag");
    expect(new URL(seen[0].url).searchParams.get("name")).toBe("Finance");
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(await seen[0].text()).toBe("");

    seen.length = 0;
    await actions["checklists.find"]!({ ...key, templateKey: "fixture-template-key", fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(new Request(input, init));
      return response({ checklists: [] });
    } });
    const find = new URL(seen[0].url);
    expect(find.pathname).toBe("/api/checklist/find");
    expect(find.searchParams.get("templateKey")).toBe("fixture-template-key");
    expect(find.searchParams.has("pageNumber")).toBe(false);
    expect(find.searchParams.has("cursor")).toBe(false);
    expect(seen[0].method).toBe("GET");
    expect(await seen[0].text()).toBe("");
  });

  test("sends the analytics version header and rejects bad input, bad JSON, 401, and 429", async () => {
    const seen: Request[] = [];
    await actions["analytics.get"]!({
      ...key,
      periodStartDate: "2024-01-01",
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return response({ periodStartDate: "2024-01-01", checklists: [], tasks: [] });
      },
    });
    expect(seen[0].headers.get("x-api-version")).toBe("2.0");
    expect(new URL(seen[0].url).searchParams.has("periodEndDate")).toBe(false);

    await expect(actions["checklists.find"]!({ ...key, fetch: async () => response({}) })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["checklists.find"]!({
      ...key,
      templateKey: "fixture-template-key",
      pageSize: 11,
      fetch: async () => response({}),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["tags.list"]!({ ...key, url: "https://evil.example", fetch: async () => response([]) })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["tags.list"]!({ ...key, fetch: async () => new Response("not-json", { status: 200 }) })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["tags.list"]!({ ...key, fetch: async () => response({}, 401) })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(actions["tags.list"]!({ ...key, fetch: async () => response({}, 429, { "Retry-After": "4" }) })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });
});
