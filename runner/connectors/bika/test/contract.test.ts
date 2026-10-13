import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const routes = {
  "spaces.list": { method: "GET", path: "/v1/spaces", sideEffect: "read" },
  "nodes.list": { method: "GET", path: "/v1/spaces/{{spaceId}}/nodes", sideEffect: "read" },
  "records.list": {
    method: "GET",
    path: "/v2/spaces/{{spaceId}}/resources/databases/{{databaseId}}/records",
    sideEffect: "read",
  },
  "records.get": {
    method: "GET",
    path: "/v2/spaces/{{spaceId}}/resources/databases/{{databaseId}}/records/{{recordId}}",
    sideEffect: "read",
  },
  "records.create": {
    method: "POST",
    path: "/v2/spaces/{{spaceId}}/resources/databases/{{databaseId}}/records",
    sideEffect: "write",
  },
  "records.update": {
    method: "PUT",
    path: "/v2/spaces/{{spaceId}}/resources/databases/{{databaseId}}/records",
    sideEffect: "write",
  },
  "records.delete": {
    method: "DELETE",
    path: "/v2/spaces/{{spaceId}}/resources/databases/{{databaseId}}/records",
    sideEffect: "destructive",
  },
} as const;

const response = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers });

const envelope = { success: true, code: 200, message: "SUCCESS", data: { id: "rec_fixture" } };

describe("bika contract", () => {
  test("uses the documented host and bearer token", () => {
    expect(manifest.key).toBe("bika");
    expect(manifest.version).toBe("0.1.0");
    expect(manifest.network.allowedHosts).toEqual(["bika.ai"]);
    expect(manifest.http.baseUrl).toBe("https://bika.ai/api/openapi/bika");
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "Authorization",
      value: "Bearer {{apiKey}}",
    });
    expect(manifest.http.headers).toEqual({ Accept: "application/json" });
    expect(manifest.http.errors).toEqual({
      rateLimitStatuses: [429],
      retryAfterHeader: "Retry-After",
      defaultRetryAfterSeconds: 30,
      messagePaths: ["message"],
    });
    expect(() => compileDeclarativeConnector(manifest)).not.toThrow();
    expect(Object.keys(manifest.operations).sort()).toEqual(Object.keys(routes).sort());
  });

  test("maps each action to one JSON route inside the budget", () => {
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
      if (route.method === "GET" || route.method === "DELETE") {
        expect(operation.request?.body, name).toBeUndefined();
        expect(JSON.stringify(operation.request?.headers ?? {}), name).not.toContain("Content-Type");
      } else {
        expect(operation.request?.headers?.["Content-Type"], name).toBe("application/json");
      }
    }
  });

  test("lists spaces with bearer auth and no body", async () => {
    const { actions } = compileDeclarativeConnector(manifest);
    const seen: Request[] = [];
    const result = await actions["spaces.list"]!({
      apiKey: "fixture-api-token",
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return response(envelope);
      },
    });
    expect(seen).toHaveLength(1);
    expect(seen[0].method).toBe("GET");
    expect(seen[0].url).toBe("https://bika.ai/api/openapi/bika/v1/spaces");
    expect(seen[0].headers.get("authorization")).toBe("Bearer fixture-api-token");
    expect(seen[0].headers.get("accept")).toBe("application/json");
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(await seen[0].text()).toBe("");
    expect(result).toEqual({
      connector: "bika",
      action: "spaces.list",
      source: "provider",
      data: envelope,
    });
  });

  test("repeats field selectors and sends the cursor as offset", async () => {
    const { actions } = compileDeclarativeConnector(manifest);
    const seen: Request[] = [];
    await actions["records.list"]!({
      apiKey: "fixture-api-token",
      spaceId: "spc/a",
      databaseId: "dat_fixture",
      fields: ["Name", "Status"],
      fieldKey: "name",
      pageSize: 2,
      nextCursor: "cur_next",
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return response(envelope);
      },
    });
    const url = new URL(seen[0].url);
    expect(url.pathname).toBe("/api/openapi/bika/v2/spaces/spc%2Fa/resources/databases/dat_fixture/records");
    expect(url.searchParams.getAll("fields")).toEqual(["Name", "Status"]);
    expect(url.searchParams.get("fieldKey")).toBe("name");
    expect(url.searchParams.get("pageSize")).toBe("2");
    expect(url.searchParams.get("offset")).toBe("cur_next");
    expect(url.searchParams.has("next_cursor")).toBe(false);
    expect(seen[0].headers.get("content-type")).toBeNull();
  });

  test("creates records as one JSON body", async () => {
    const { actions } = compileDeclarativeConnector(manifest);
    const seen: Request[] = [];
    await actions["records.create"]!({
      apiKey: "fixture-api-token",
      spaceId: "spc_fixture",
      databaseId: "dat_fixture",
      fieldKey: "name",
      records: [{ fields: { Name: "Fixture record" } }],
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return response(envelope);
      },
    });
    expect(seen[0].method).toBe("POST");
    expect(seen[0].headers.get("content-type")).toBe("application/json");
    expect(await seen[0].text()).toBe('{"fieldKey":"name","records":[{"fields":{"Name":"Fixture record"}}]}');
  });

  test("deletes by repeating record ids and sends no body", async () => {
    const { actions } = compileDeclarativeConnector(manifest);
    const seen: Request[] = [];
    await actions["records.delete"]!({
      apiKey: "fixture-api-token",
      spaceId: "spc_fixture",
      databaseId: "dat_fixture",
      recordIds: ["rec_a", "rec_b"],
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return response({
          success: true,
          code: 200,
          message: "SUCCESS",
          data: [{ id: "rec_a", deleted: true }, { id: "rec_b", deleted: true }],
        });
      },
    });
    const url = new URL(seen[0].url);
    expect(seen[0].method).toBe("DELETE");
    expect(url.pathname).toBe("/api/openapi/bika/v2/spaces/spc_fixture/resources/databases/dat_fixture/records");
    expect(url.searchParams.getAll("records")).toEqual(["rec_a", "rec_b"]);
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(await seen[0].text()).toBe("");
  });

  test("rejects invalid input, a non-object body, upstream failure, and rate limit", async () => {
    const { actions } = compileDeclarativeConnector(manifest);
    await expect(actions["records.create"]!({
      apiKey: "fixture-api-token",
      spaceId: "spc_fixture",
      databaseId: "dat_fixture",
      fetch: async () => response(envelope),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["records.list"]!({
      apiKey: "fixture-api-token",
      spaceId: "",
      databaseId: "dat_fixture",
      fetch: async () => response(envelope),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["spaces.list"]!({
      apiKey: "fixture-api-token",
      extra: true,
      fetch: async () => response(envelope),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["spaces.list"]!({
      apiKey: "fixture-api-token",
      fetch: async () => response([]),
    })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["spaces.list"]!({
      apiKey: "fixture-api-token",
      fetch: async () => response({ message: "unauthorized" }, 401),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(actions["spaces.list"]!({
      apiKey: "fixture-api-token",
      fetch: async () => response({}, 429, { "Retry-After": "4" }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });

  test("refuses a host outside the allowlist", async () => {
    const offHost = structuredClone(manifest);
    offHost.http.baseUrl = "https://evil.example/api/openapi/bika";
    const { actions } = compileDeclarativeConnector(offHost);
    await expect(actions["spaces.list"]!({
      apiKey: "fixture-api-token",
      fetch: async () => response(envelope),
    })).rejects.toMatchObject({ code: "OUTBOUND_HOST_NOT_ALLOWED" });
  });
});
