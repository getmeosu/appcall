import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest as never);
const operations = manifest.operations as Record<string, {
  kind?: string;
  sideEffect?: string;
  timeoutMs?: number;
  maxInputBytes?: number;
  maxResponseBytes?: number;
  title?: string;
  description?: string;
  responseFormat?: string;
  validationMode?: string;
  enforceOutputSchema?: boolean;
  inputSchema?: { type?: string; additionalProperties?: boolean; required?: string[] };
  outputSchema?: { type?: string };
  request?: {
    method?: string;
    path?: string;
    baseUrl?: string;
    body?: unknown;
    headers?: Record<string, string>;
    success?: number[];
  };
}>;

const realtimeQuery = "{ EVM(network: eth) { Blocks(limit: {count: 1}, orderBy: {descending: Block_Number}) { Block { Number Time } } } }";

const response = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers });

const envelope = { data: { EVM: { Blocks: [{ Block: { Number: 1, Time: "2024-01-01T00:00:00Z" } }] } } };

describe("Bitquery contract", () => {
  test("uses one bearer access token on the documented GraphQL hosts", () => {
    expect(manifest.network.allowedHosts).toEqual(["streaming.bitquery.io", "graphql.bitquery.io"]);
    expect(manifest.http.baseUrl).toBe("https://streaming.bitquery.io");
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "Authorization",
      value: "Bearer {{apiKey}}",
    });
    const httpHeaders = (manifest.http.headers ?? {}) as Record<string, string>;
    expect(httpHeaders["Content-Type"] ?? httpHeaders["content-type"]).toBeUndefined();
    expect(httpHeaders.Accept).toBe("application/json");
  });

  test("keeps JSON POST budgets and object outputs inside the declarative rules", () => {
    expect(Object.keys(operations).sort()).toEqual(["archive.query", "combined.query", "eap.query", "realtime.query"]);
    for (const [name, operation] of Object.entries(operations)) {
      expect(operation.kind, name).toBe("action");
      expect(operation.sideEffect, name).toBe("read");
      expect(operation.title, name).toBeString();
      expect(operation.description, name).toBeString();
      expect(operation.responseFormat, name).toBe("json");
      expect(operation.validationMode, name).toBe("strict-generated");
      expect(operation.enforceOutputSchema, name).toBe(true);
      expect(operation.outputSchema?.type, name).toBe("object");
      expect(operation.inputSchema?.type, name).toBe("object");
      expect(operation.inputSchema?.additionalProperties, name).toBe(false);
      expect(operation.inputSchema?.required, name).toEqual(["query"]);
      expect(operation.timeoutMs, name).toBeGreaterThanOrEqual(1);
      expect(operation.timeoutMs, name).toBeLessThanOrEqual(300000);
      expect(operation.maxInputBytes, name).toBeLessThanOrEqual(26214400);
      expect(operation.maxResponseBytes, name).toBeGreaterThanOrEqual(operation.maxInputBytes ?? 0);
      const request = operation.request;
      expect(request?.method, name).toBe("POST");
      expect(String(request?.path ?? "").startsWith("/"), name).toBe(true);
      expect(request?.body, name).toEqual({
        query: "{{query}}",
        variables: "{{variables}}",
        operationName: "{{operationName}}",
      });
      expect(request?.headers?.["Content-Type"], name).toBe("application/json");
      expect(request?.success, name).toEqual([200]);
    }
    expect(operations["archive.query"]?.request?.baseUrl).toBe("https://graphql.bitquery.io");
    expect(operations["archive.query"]?.request?.path).toBe("/");
    expect(operations["combined.query"]?.request?.path).toBe("/graphql");
    expect(operations["realtime.query"]?.request?.path).toBe("/graphql");
    expect(operations["eap.query"]?.request?.path).toBe("/eap");
    expect(operations["combined.query"]?.request?.baseUrl).toBeUndefined();
    expect(operations["realtime.query"]?.request?.baseUrl).toBeUndefined();
    expect(operations["eap.query"]?.request?.baseUrl).toBeUndefined();
  });

  test("posts the caller query with bearer auth and drops unset GraphQL fields", async () => {
    const seen: Request[] = [];
    const result = await actions["realtime.query"]!({
      apiKey: "secret",
      query: realtimeQuery,
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response(envelope);
      },
    });
    expect(seen).toHaveLength(1);
    expect(seen[0].method).toBe("POST");
    expect(seen[0].url).toBe("https://streaming.bitquery.io/graphql");
    expect(seen[0].headers.get("authorization")).toBe("Bearer secret");
    expect(seen[0].headers.get("accept")).toBe("application/json");
    expect(seen[0].headers.get("content-type")).toBe("application/json");
    expect(await seen[0].text()).toBe(JSON.stringify({ query: realtimeQuery }));
    expect(result).toEqual({
      connector: "bitquery",
      action: "realtime.query",
      source: "provider",
      data: envelope,
    });
  });

  test("sends archive, combined, and EAP queries to their single documented routes", async () => {
    const seen: Request[] = [];
    const fetch = async (input: string | URL, init?: RequestInit) => {
      seen.push(new Request(input, init));
      return response(envelope);
    };
    await actions["archive.query"]!({ apiKey: "secret", query: realtimeQuery, fetch });
    await actions["combined.query"]!({
      apiKey: "secret",
      query: realtimeQuery,
      variables: { network: "eth" },
      operationName: "Blocks",
      fetch,
    });
    await actions["eap.query"]!({ apiKey: "secret", query: realtimeQuery, variables: { limit: 1 }, fetch });
    expect(seen.map((item) => item.url)).toEqual([
      "https://graphql.bitquery.io/",
      "https://streaming.bitquery.io/graphql",
      "https://streaming.bitquery.io/eap",
    ]);
    expect(await seen[1].text()).toBe(JSON.stringify({
      query: realtimeQuery,
      variables: { network: "eth" },
      operationName: "Blocks",
    }));
    expect(await seen[2].text()).toBe(JSON.stringify({ query: realtimeQuery, variables: { limit: 1 } }));
  });

  test("rejects bad input, non-object JSON, GraphQL errors, upstream failure, and rate limits", async () => {
    await expect(actions["realtime.query"]!({ apiKey: "secret", query: "", fetch: async () => response(envelope) })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["archive.query"]!({ apiKey: "secret", fetch: async () => response(envelope) })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["eap.query"]!({ apiKey: "secret", query: realtimeQuery, operationName: "Blocks", fetch: async () => response(envelope) })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["combined.query"]!({ apiKey: "secret", query: realtimeQuery, fetch: async () => response([]) })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["realtime.query"]!({ apiKey: "secret", query: realtimeQuery, fetch: async () => response("OK") })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["realtime.query"]!({ apiKey: "secret", query: realtimeQuery, fetch: async () => response({ errors: [{ message: "schema mismatch" }] }) })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(actions["archive.query"]!({ apiKey: "secret", query: realtimeQuery, fetch: async () => response({ message: "unauthorized" }, 401) })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(actions["eap.query"]!({ apiKey: "secret", query: realtimeQuery, fetch: async () => response({}, 429, { "Retry-After": "4" }) })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });
});
