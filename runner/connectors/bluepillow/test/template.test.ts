import { expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import coverage from "../../bluepillow.coverage.json";
import manifest from "../manifest.json";

compileDeclarativeConnector(manifest);

const routes: Record<string, { method: string; path: string; idempotency: boolean }> = {
  healthcheck: { method: "GET", path: "/health", idempotency: false },
  "properties.get": { method: "GET", path: "/properties/{{property_id}}", idempotency: false },
  "destinations.resolve": { method: "POST", path: "/destinations/resolve", idempotency: false },
  "destinations.discoverNear": { method: "POST", path: "/destinations/discover-near", idempotency: false },
  "stays.search": { method: "POST", path: "/search/stays", idempotency: true },
  "stays.recommend": { method: "POST", path: "/decide", idempotency: true },
  "offers.recommend": { method: "POST", path: "/recommendations/by-hotel", idempotency: true },
  "offers.validate": { method: "POST", path: "/validate", idempotency: true },
  "bookings.handoff": { method: "POST", path: "/bookings/initiate", idempotency: true },
};

test("manifest routes match the Blue Pillow OpenAPI and the live toolkit", () => {
  expect(manifest.key).toBe("bluepillow");
  expect(manifest.http.baseUrl).toBe("https://api.b2a.bluepillow.com/v1");
  expect(manifest.network.allowedHosts).toEqual(["api.b2a.bluepillow.com"]);
  expect(manifest.http.auth).toEqual({
    field: "apiKey",
    in: "header",
    name: "Authorization",
    value: "Bearer {{apiKey}}",
  });
  expect(manifest.http.headers).toEqual({ Accept: "application/json" });
  expect(Object.keys(manifest.operations)).toEqual(Object.keys(routes));
  expect(coverage.composio_tools).toBe(8);
  expect(coverage.missing_http).toEqual([]);
  expect(coverage.missing_still).toEqual([]);
  expect(coverage.mapped).toHaveLength(8);
  expect(coverage.mapped.length + coverage.missing_still.length).toBe(coverage.composio_tools);

  const mapped = new Map(coverage.mapped.map((entry) => [entry.operation, entry]));
  expect(mapped.has("healthcheck")).toBe(false);
  for (const [key, route] of Object.entries(routes)) {
    const operation = manifest.operations[key];
    expect(operation.kind, key).toBe("action");
    expect(operation.title.length, key).toBeGreaterThan(0);
    expect(operation.description.length, key).toBeGreaterThan(0);
    expect(operation.inputSchema.type, key).toBe("object");
    expect(operation.outputSchema.type, key).toBe("object");
    expect(operation.responseFormat, key).toBe("json");
    expect(operation.timeoutMs, key).toBeGreaterThanOrEqual(1);
    expect(operation.timeoutMs, key).toBeLessThanOrEqual(300000);
    expect(operation.maxInputBytes, key).toBeLessThanOrEqual(26214400);
    expect(operation.maxResponseBytes, key).toBeGreaterThanOrEqual(operation.maxInputBytes);
    expect(operation.request.method, key).toBe(route.method);
    expect(operation.request.path, key).toBe(route.path);
    expect(operation.request.success, key).toEqual([200]);
    if (route.method === "GET") {
      expect(operation.request.body, key).toBeUndefined();
      expect(operation.request.headers?.["Content-Type"], key).toBeUndefined();
    } else {
      expect(operation.request.body, key).toBeDefined();
      expect(operation.request.headers["Content-Type"], key).toBe("application/json");
    }
    expect(operation.request.headers?.["Idempotency-Key"], key).toBe(
      route.idempotency ? "{{idempotency_key}}" : undefined,
    );
    expect(["read", "write"]).toContain(operation.sideEffect);
  }
  expect(manifest.operations["bookings.handoff"].sideEffect).toBe("write");
  for (const entry of coverage.mapped) {
    expect(manifest.operations[entry.operation].request.method, entry.tool).toBe(entry.method);
    expect(manifest.operations[entry.operation].request.path, entry.tool).toBe(entry.path);
  }
});
