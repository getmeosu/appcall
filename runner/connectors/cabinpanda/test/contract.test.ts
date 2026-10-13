import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const routes = {
  "profile.get": { method: "GET", path: "/profile" },
} as const;

const response = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers });

const profileBody = {
  id: 1,
  name: "Fixture User",
  email: "fixture@example.com",
};

describe("cabinpanda contract", () => {
  test("uses Bearer auth on api.cabinpanda.com", () => {
    expect(manifest.key).toBe("cabinpanda");
    expect(manifest.version).toBe("0.1.0");
    expect(manifest.network.allowedHosts).toEqual(["api.cabinpanda.com"]);
    expect(manifest.http.baseUrl).toBe("https://api.cabinpanda.com/api/v1");
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

  test("maps profile.get to one body-less JSON GET", () => {
    const httpHeaders = manifest.http.headers ?? {};
    for (const [name, operation] of Object.entries(manifest.operations)) {
      const route = routes[name as keyof typeof routes];
      expect(operation.kind, name).toBe("action");
      expect(operation.sideEffect, name).toBe("read");
      expect(operation.title.length, name).toBeGreaterThan(0);
      expect(operation.description.length, name).toBeGreaterThan(0);
      expect(operation.timeoutMs, name).toBeGreaterThan(0);
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
      expect(operation.request?.body, name).toBeUndefined();
      expect(JSON.stringify(operation.request?.headers ?? {}), name).not.toContain("Content-Type");
      expect(JSON.stringify(httpHeaders), name).not.toContain("Content-Type");
    }
  });

  test("sends Bearer and does not follow another route", async () => {
    const { actions } = compileDeclarativeConnector(manifest as never);
    const seen: Request[] = [];
    const result = await actions["profile.get"]!({
      apiKey: "secret-token",
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return response(profileBody);
      },
    });
    expect(seen).toHaveLength(1);
    expect(seen[0].method).toBe("GET");
    expect(seen[0].headers.get("authorization")).toBe("Bearer secret-token");
    expect(seen[0].headers.get("accept")).toBe("application/json");
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(await seen[0].text()).toBe("");
    const url = new URL(seen[0].url);
    expect(url.origin).toBe("https://api.cabinpanda.com");
    expect(url.pathname).toBe("/api/v1/profile");
    expect(url.search).toBe("");
    expect(result.data).toEqual(profileBody);
  });

  test("rejects extra input, a non-object body, 401, and 429", async () => {
    const { actions } = compileDeclarativeConnector(manifest as never);
    await expect(actions["profile.get"]!({
      apiKey: "secret-token",
      page: 1,
      fetch: async () => response(profileBody),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["profile.get"]!({
      apiKey: "secret-token",
      fetch: async () => response([]),
    })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["profile.get"]!({
      apiKey: "secret-token",
      fetch: async () => response({}, 401),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(actions["profile.get"]!({
      apiKey: "secret-token",
      fetch: async () => response({}, 429, { "Retry-After": "4" }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });
});
