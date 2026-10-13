import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const routes = {
  "docsets.create": { method: "POST", path: "/v1/storage/docsets", sideEffect: "write" },
  "docsets.delete": { method: "DELETE", path: "/v1/storage/docsets/{{docset_id}}", sideEffect: "destructive" },
  "plans.generate": { method: "POST", path: "/v1/query/plan", sideEffect: "read" },
  "docsets.get": { method: "GET", path: "/v1/storage/docsets/{{docset_id}}", sideEffect: "read" },
  "documents.get": { method: "GET", path: "/v1/storage/docsets/{{docset_id}}/docs/{{doc_id}}", sideEffect: "read" },
  "tasks.list": { method: "GET", path: "/v1/async/list", sideEffect: "read" },
} as const;

const response = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers });

const docset = {
  account_id: "acct-fixture",
  docset_id: "ds-fixture1",
  name: "Fixture DocSet",
  created_at: "2026-01-01T00:00:00Z",
  readonly: false,
};

describe("aryn contract", () => {
  test("uses bearer auth on the documented US API host", () => {
    expect(manifest.key).toBe("aryn");
    expect(manifest.version).toBe("0.1.0");
    expect(manifest.network.allowedHosts).toEqual([
      "api.aryn.cloud",
      "api.aryn.ai",
      "api.us.aryn.cloud",
      "api.us.aryn.ai",
    ]);
    expect(manifest.http.baseUrl).toBe("https://api.aryn.cloud");
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "Authorization",
      value: "Bearer {{apiKey}}",
    });
    expect(manifest.http.headers).toEqual({ Accept: "application/json" });
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
    expect(Object.keys(manifest.operations).sort()).toEqual(Object.keys(routes).sort());
  });

  test("maps each action to one JSON route inside the budget", () => {
    const httpHeaders = manifest.http.headers ?? {};
    for (const [name, operation] of Object.entries(manifest.operations)) {
      const route = routes[name as keyof typeof routes];
      expect(operation.kind, name).toBe("action");
      expect(operation.sideEffect, name).toBe(route.sideEffect);
      expect(operation.title.length, name).toBeGreaterThan(0);
      expect(operation.description.length, name).toBeGreaterThan(0);
      expect(operation.timeoutMs, name).toBeGreaterThanOrEqual(1);
      expect(operation.timeoutMs, name).toBeLessThanOrEqual(300000);
      expect(operation.maxInputBytes, name).toBeLessThanOrEqual(26214400);
      expect(operation.maxResponseBytes, name).toBeGreaterThanOrEqual(operation.maxInputBytes);
      expect(operation.inputSchema.type, name).toBe("object");
      expect(operation.inputSchema.additionalProperties, name).toBe(false);
      expect(operation.outputSchema.type, name).toBe("object");
      expect(operation.enforceOutputSchema, name).toBe(true);
      expect(operation.validationMode, name).toBe("strict-generated");
      expect(operation.responseFormat, name).toBe("json");
      expect(operation.request?.method, name).toBe(route.method);
      expect(operation.request?.path, name).toBe(route.path);
      expect(operation.request?.success, name).toEqual([200]);
      expect(operation.request?.baseUrl, name).toBeUndefined();
      const bodyless = route.method === "GET" || route.method === "DELETE";
      if (bodyless) {
        expect(operation.request?.body, name).toBeUndefined();
        expect(JSON.stringify(operation.request?.headers ?? {}), name).not.toContain("Content-Type");
        expect(JSON.stringify(httpHeaders), name).not.toContain("Content-Type");
      } else {
        expect(operation.request?.headers?.["Content-Type"], name).toBe("application/json");
      }
    }
  });

  test("sends bearer auth, encodes ids, and keeps GET body-less", async () => {
    const { actions } = compileDeclarativeConnector(manifest as never);
    const seen: Request[] = [];
    const result = await actions["documents.get"]!({
      apiKey: "secret-token",
      docset_id: "aryn:ds-abc",
      doc_id: "aryn:f-xyz",
      include_elements: false,
      include_binary: false,
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return response({ id: "aryn:f-xyz", elements: [], properties: {}, binary_data: null });
      },
    });
    const url = new URL(seen[0].url);
    expect(seen[0].headers.get("authorization")).toBe("Bearer secret-token");
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(seen[0].method).toBe("GET");
    expect(url.pathname).toBe("/v1/storage/docsets/aryn%3Ads-abc/docs/aryn%3Af-xyz");
    expect(url.searchParams.get("include_elements")).toBe("false");
    expect(url.searchParams.get("include_binary")).toBe("false");
    expect(result.data.id).toBe("aryn:f-xyz");
    expect(seen).toHaveLength(1);
  });

  test("lists partition tasks with the required path filter", async () => {
    const { actions } = compileDeclarativeConnector(manifest as never);
    const seen: Request[] = [];
    await actions["tasks.list"]!({
      apiKey: "secret-token",
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return response({ tasks: {} });
      },
    });
    const url = new URL(seen[0].url);
    expect(seen[0].method).toBe("GET");
    expect(url.pathname).toBe("/v1/async/list");
    expect(url.searchParams.get("path_filter")).toBe("^/v1/document/partition$");
    expect(seen[0].headers.get("content-type")).toBeNull();
  });

  test("creates a DocSet without optional fields and rejects bad input", async () => {
    const { actions } = compileDeclarativeConnector(manifest as never);
    const seen: Request[] = [];
    await actions["docsets.create"]!({
      apiKey: "secret-token",
      name: "Fixture DocSet",
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return response(docset);
      },
    });
    expect(seen[0].method).toBe("POST");
    expect(seen[0].headers.get("content-type")).toBe("application/json");
    expect(await seen[0].text()).toBe("{\"name\":\"Fixture DocSet\"}");
    await expect(actions["docsets.get"]!({
      apiKey: "secret-token",
      docset_id: "",
      fetch: async () => response(docset),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["docsets.get"]!({
      apiKey: "secret-token",
      docset_id: "ds-fixture1",
      fetch: async () => response([]),
    })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["docsets.get"]!({
      apiKey: "secret-token",
      docset_id: "ds-fixture1",
      fetch: async () => response({ detail: "Invalid Aryn API key" }, 401),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(actions["docsets.get"]!({
      apiKey: "secret-token",
      docset_id: "ds-fixture1",
      fetch: async () => response({ detail: "Too many requests" }, 429, { "Retry-After": "4" }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });
});
