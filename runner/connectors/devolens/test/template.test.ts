import { expect, test } from "bun:test";
import manifest from "../manifest.json";

const operations = manifest.operations as Record<string, {
  kind?: string;
  responseFormat?: string;
  validationMode?: string;
  enforceOutputSchema?: boolean;
  timeoutMs?: number;
  maxInputBytes?: number;
  maxResponseBytes?: number;
  title?: string;
  description?: string;
  sideEffect?: string;
  inputSchema?: { type?: string; properties?: Record<string, unknown>; additionalProperties?: boolean };
  outputSchema?: { type?: string };
  request?: { method?: string; path?: string; body?: unknown; headers?: Record<string, unknown>; success?: number[] };
}>;

test("devolens manifest is one JSON GET per live tool with strict defaults", () => {
  expect(manifest.key).toBe("devolens");
  expect(manifest.network.allowedHosts).toEqual(["api.cryptolens.io"]);
  expect(manifest.http.baseUrl).toBe("https://api.cryptolens.io/api");
  expect(manifest.http.auth).toEqual({
    field: "token",
    in: "query",
    name: "token",
  });
  expect(manifest.http.headers).toEqual({ Accept: "application/json" });
  expect(Object.keys(operations).sort()).toEqual([
    "customers.list",
    "license-key.get",
    "license-keys.list",
    "license-templates.list",
    "license-users.list",
    "messages.list",
    "products.list",
    "resellers.list",
    "usage.daily-aggregates.list",
    "web-api-logs.list",
  ]);
  for (const [key, operation] of Object.entries(operations)) {
    expect(operation.kind, key).toBe("action");
    expect(operation.sideEffect, key).toBe("read");
    expect(operation.responseFormat, key).toBe("json");
    expect(operation.validationMode, key).toBe("strict-generated");
    expect(operation.enforceOutputSchema, key).toBe(true);
    expect(operation.outputSchema?.type, key).toBe("object");
    expect(operation.inputSchema?.type, key).toBe("object");
    expect(operation.inputSchema?.additionalProperties, key).toBe(false);
    expect(operation.inputSchema?.properties?.url, key).toBeUndefined();
    expect(operation.title, key).toEqual(expect.any(String));
    expect(operation.description, key).toEqual(expect.any(String));
    expect(operation.timeoutMs, key).toBeGreaterThanOrEqual(1);
    expect(operation.timeoutMs, key).toBeLessThanOrEqual(300000);
    expect(operation.maxInputBytes, key).toBeLessThanOrEqual(26214400);
    expect(operation.maxResponseBytes, key).toBeGreaterThanOrEqual(operation.maxInputBytes ?? 0);
    expect(operation.request?.method, key).toBe("GET");
    expect(operation.request?.body, key).toBeUndefined();
    expect(operation.request?.headers?.["Content-Type"], key).toBeUndefined();
    expect(operation.request?.path, key).toEqual(expect.stringMatching(/^\/[A-Za-z0-9{}/._-]+$/));
    expect(operation.request?.success, key).toEqual([200]);
  }
});
