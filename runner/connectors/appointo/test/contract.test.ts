import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const routes = {
  healthcheck: { method: "GET", path: "/products", sideEffect: "read" },
  "bookings.cancel": { method: "PUT", path: "/bookings/cancel", sideEffect: "destructive" },
  "bookings.create": { method: "POST", path: "/bookings", sideEffect: "write" },
  "appointments.availability": { method: "GET", path: "/appointments/{{appointment_id}}/calendar_availability", sideEffect: "read" },
  "appointments.list": { method: "GET", path: "/appointments", sideEffect: "read" },
  "bookings.list": { method: "GET", path: "/bookings", sideEffect: "read" },
  "products.list": { method: "GET", path: "/products", sideEffect: "read" },
  "subscription-contracts.list": { method: "GET", path: "/appointment_subscriptions", sideEffect: "read" },
  "bookings.reschedule": { method: "PUT", path: "/bookings/reschedule", sideEffect: "write" },
  "bookings.update": { method: "PUT", path: "/bookings/{{booking_id}}", sideEffect: "write" },
  "appointments.upsert-config": { method: "PUT", path: "/appointments/{{appointment_id}}", sideEffect: "write" },
} as const;

const response = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers });

describe("appointo contract", () => {
  test("uses the documented host and APPOINTO-TOKEN header", () => {
    expect(manifest.key).toBe("appointo");
    expect(manifest.version).toBe("0.1.0");
    expect(manifest.network.allowedHosts).toEqual(["app.appointo.me"]);
    expect(manifest.http.baseUrl).toBe("https://app.appointo.me/api");
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "APPOINTO-TOKEN",
      value: "{{apiKey}}",
    });
    expect(manifest.http.headers).toEqual({ Accept: "application/json" });
    expect(JSON.stringify(manifest.http)).not.toContain("Bearer");
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
      if (route.method === "GET") {
        expect(operation.request?.body, name).toBeUndefined();
        expect(JSON.stringify(operation.request?.headers ?? {}), name).not.toContain("Content-Type");
        expect(JSON.stringify(httpHeaders), name).not.toContain("Content-Type");
      } else {
        expect(operation.request?.headers?.["Content-Type"], name).toBe("application/json");
      }
    }
  });

  test("sends APPOINTO-TOKEN and wraps a JSON array", async () => {
    const { actions } = compileDeclarativeConnector(manifest as never);
    const seen: Request[] = [];
    const result = await actions["products.list"]!({
      apiKey: "secret-token",
      limit: 1,
      search_term: "shirt",
      offset: "10",
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return response([{ id: 142, product_name: "Short" }]);
      },
    });
    expect(seen).toHaveLength(1);
    expect(seen[0].headers.get("appointo-token")).toBe("secret-token");
    expect(seen[0].headers.get("authorization")).toBeNull();
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(seen[0].method).toBe("GET");
    const url = new URL(seen[0].url);
    expect(url.origin + url.pathname).toBe("https://app.appointo.me/api/products");
    expect(url.searchParams.get("limit")).toBe("1");
    expect(url.searchParams.get("search_term")).toBe("shirt");
    expect(url.searchParams.get("offset")).toBe("10");
    expect(result.data).toEqual([{ id: 142, product_name: "Short" }]);
  });

  test("repeats team-member ids on the availability query", async () => {
    const { actions } = compileDeclarativeConnector(manifest as never);
    const seen: Request[] = [];
    await actions["appointments.availability"]!({
      apiKey: "secret-token",
      appointment_id: 304,
      start_date: "2024-03-28",
      end_date: "2024-03-29",
      impersonated_tms: [123, 234],
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return response([{ id: 123 }]);
      },
    });
    const url = new URL(seen[0].url);
    expect(url.pathname).toBe("/api/appointments/304/calendar_availability");
    expect(url.searchParams.getAll("impersonated_tms")).toEqual(["123", "234"]);
    expect(seen[0].headers.get("content-type")).toBeNull();
  });

  test("rejects invalid input, a bad token, and a rate limit", async () => {
    const { actions } = compileDeclarativeConnector(manifest as never);
    await expect(actions["bookings.create"]!({
      apiKey: "secret-token",
      fetch: async () => response({}),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["appointments.list"]!({
      apiKey: "secret-token",
      extra: true,
      fetch: async () => response([]),
    })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions.healthcheck!({
      apiKey: "secret-token",
      fetch: async () => response({
        error_code: "invalid_api_token",
        message: "API token is invalid. Please check token in Appointo settings.",
      }, 401),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(actions.healthcheck!({
      apiKey: "secret-token",
      fetch: async () => response({}, 429, { "Retry-After": "4" }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });

  test("cancel is one JSON PUT and not a bearer call", async () => {
    const { actions } = compileDeclarativeConnector(manifest as never);
    const seen: Request[] = [];
    const result = await actions["bookings.cancel"]!({
      apiKey: "secret-token",
      booking_id: 969,
      customer_ids: [1095],
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return response({ response: { status: "ok", booking: { id: 969 } } });
      },
    });
    expect(seen[0].method).toBe("PUT");
    expect(new URL(seen[0].url).pathname).toBe("/api/bookings/cancel");
    expect(seen[0].headers.get("content-type")).toBe("application/json");
    expect(seen[0].headers.get("authorization")).toBeNull();
    expect(await seen[0].text()).toBe('{"booking_id":969,"customer_ids":[1095]}');
    expect(result.data.response.status).toBe("ok");
  });
});
