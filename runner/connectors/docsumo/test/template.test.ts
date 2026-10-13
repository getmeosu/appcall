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
  inputSchema?: { type?: string; properties?: Record<string, unknown> };
  outputSchema?: { type?: string };
  request?: { method?: string; path?: string; body?: unknown; headers?: Record<string, unknown> };
}>;

test("docsumo manifest is one JSON route per operation with strict defaults", () => {
  expect(manifest.network.allowedHosts).toEqual(["app.docsumo.com"]);
  expect(manifest.http.baseUrl).toBe("https://app.docsumo.com/api/v1");
  expect(manifest.http.auth).toEqual({
    field: "apiKey",
    in: "header",
    name: "apikey",
    value: "{{apiKey}}",
  });
  const keys = Object.keys(operations).sort();
  expect(keys).toEqual([
    "agents.cases.list",
    "agents.list",
    "analytics.mca",
    "document-types.list-enabled",
    "document-types.user",
    "documents.list",
    "folders.create",
    "tables.add-row",
    "tables.get",
  ]);
  for (const [key, operation] of Object.entries(operations)) {
    expect(operation.kind, key).toBe("action");
    expect(operation.responseFormat, key).toBe("json");
    expect(operation.validationMode, key).toBe("strict-generated");
    expect(operation.enforceOutputSchema, key).toBe(true);
    expect(operation.outputSchema?.type, key).toBe("object");
    expect(operation.inputSchema?.type, key).toBe("object");
    expect(operation.title, key).toEqual(expect.any(String));
    expect(operation.description, key).toEqual(expect.any(String));
    expect(operation.timeoutMs, key).toBeGreaterThanOrEqual(1);
    expect(operation.timeoutMs, key).toBeLessThanOrEqual(300000);
    expect(operation.maxInputBytes, key).toBeLessThanOrEqual(26214400);
    expect(operation.maxResponseBytes, key).toBeGreaterThanOrEqual(operation.maxInputBytes ?? 0);
    expect(operation.request?.path, key).toEqual(expect.stringMatching(/^\/[A-Za-z0-9{}/._-]+$/));
    expect(operation.inputSchema?.properties?.url, key).toBeUndefined();
    const method = operation.request?.method;
    expect(["GET", "POST"]).toContain(method);
    if (method === "GET" || key === "tables.add-row") {
      expect(operation.request?.body, key).toBeUndefined();
      expect(operation.request?.headers?.["Content-Type"], key).toBeUndefined();
    }
    if (method === "GET") {
      expect(operation.sideEffect, key).toBe("read");
    } else {
      expect(operation.sideEffect, key).toBe("write");
    }
    if (key === "folders.create" || key === "analytics.mca") {
      expect(operation.request?.body, key).toBeDefined();
      expect(operation.request?.headers?.["Content-Type"], key).toBe("application/json");
    }
  }
});
