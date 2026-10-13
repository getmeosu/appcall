import { expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import coverage from "../../dpd2.coverage.json";
import manifest from "../manifest.json";

compileDeclarativeConnector(manifest);

const liveTools = [
  "DPD2_GET_STOREFRONT",
  "DPD2_LIST_CUSTOMERS2",
  "DPD2_LIST_PURCHASES",
  "DPD2_LIST_STOREFRONTS",
  "DPD2_LIST_SUBSCRIBERS",
  "DPD2_PING",
  "DPD2_VERIFY_NOTIFICATION2",
  "DPD2_VERIFY_SUBSCRIBER",
];

const routes: Record<string, { method: string; path: string }> = {
  ping: { method: "GET", path: "/" },
  "storefronts.list": { method: "GET", path: "/storefronts" },
  "storefronts.get": { method: "GET", path: "/storefronts/{{id}}" },
  "customers.list": { method: "GET", path: "/customers" },
  "purchases.list": { method: "GET", path: "/purchases" },
  "subscribers.list": { method: "GET", path: "/storefronts/{{storefront_id}}/subscribers" },
  "subscribers.verify": { method: "GET", path: "/storefronts/{{storefront_id}}/subscribers/verify" },
};

test("manifest routes match the DPD API and the live toolkit", () => {
  expect(manifest.key).toBe("dpd2");
  expect(manifest.http.baseUrl).toBe("https://api.getdpd.com/v2");
  expect(manifest.network.allowedHosts).toEqual(["api.getdpd.com"]);
  expect(manifest.http.auth).toEqual({
    field: "apiPassword",
    in: "header",
    name: "Authorization",
    basic: { username: "{{accountUsername}}", password: "{{apiPassword}}" },
  });
  expect(manifest.http.headers).toEqual({ Accept: "application/json" });
  expect(Object.keys(manifest.operations)).toEqual(Object.keys(routes));
  expect(coverage.composio_tools).toBe(8);
  expect(coverage.live_tools).toEqual(liveTools);
  expect(coverage.missing_http).toEqual([]);
  expect(coverage.missing_still).toEqual([
    {
      tool: "DPD2_VERIFY_NOTIFICATION2",
      reason: "POST /notification/verify returns plain text VERIFIED or INVALID, not JSON.",
    },
  ]);
  expect(coverage.mapped).toHaveLength(7);
  expect(coverage.mapped.length + coverage.missing_still.length + coverage.missing_http.length).toBe(liveTools.length);
  expect(coverage.full_depth).toBe(true);
  expect(new Set(coverage.mapped.map((entry) => entry.tool)).has("DPD2_VERIFY_NOTIFICATION2")).toBe(false);

  const mapped = new Map(coverage.mapped.map((entry) => [entry.operation, entry]));
  for (const [key, route] of Object.entries(routes)) {
    const operation = manifest.operations[key];
    expect(operation.kind, key).toBe("action");
    expect(operation.sideEffect, key).toBe("read");
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
    expect(operation.request.body, key).toBeUndefined();
    expect(operation.request.headers, key).toBeUndefined();
    expect(JSON.stringify(operation.request).includes("http://"), key).toBe(false);
    const entry = mapped.get(key);
    expect(entry, key).toBeDefined();
    expect(entry?.method, key).toBe(route.method);
    expect(entry?.path, key).toBe(route.path);
  }
});
