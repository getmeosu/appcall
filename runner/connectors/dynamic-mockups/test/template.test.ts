import { expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const operations = manifest.operations as Record<string, {
  kind?: string;
  sideEffect?: string;
  responseFormat?: string;
  validationMode?: string;
  request?: { method?: string; path?: string; body?: unknown; headers?: Record<string, string>; success?: number[] };
  inputSchema?: { type?: string; properties?: Record<string, unknown>; additionalProperties?: boolean };
  outputSchema?: { type?: string };
  maxInputBytes?: number;
  maxResponseBytes?: number;
  timeoutMs?: number;
  title?: string;
  description?: string;
}>;

const forbidden = new Set(["url", "baseUrl", "webhookUrl", "csvUrl", "image", "image_file", "file"]);

function walkProperties(schema: unknown, key: string): void {
  if (!schema || typeof schema !== "object") return;
  const record = schema as { properties?: Record<string, unknown>; items?: unknown; anyOf?: unknown[]; oneOf?: unknown[]; allOf?: unknown[] };
  for (const name of Object.keys(record.properties ?? {})) {
    expect(forbidden.has(name), `${key}.${name}`).toBe(false);
    walkProperties(record.properties?.[name], key);
  }
  if (record.items) walkProperties(record.items, key);
  for (const branch of [...(record.anyOf ?? []), ...(record.oneOf ?? []), ...(record.allOf ?? [])]) walkProperties(branch, key);
}

test("Dynamic Mockups manifest compiles with one JSON route per operation", () => {
  expect(manifest.key).toBe("dynamic-mockups");
  expect(manifest.network.allowedHosts).toEqual(["app.dynamicmockups.com"]);
  expect(manifest.http.baseUrl).toBe("https://app.dynamicmockups.com/api/v1");
  expect(manifest.http.auth).toEqual({ field: "apiKey", in: "header", name: "x-api-key", value: "{{apiKey}}" });
  expect(manifest.auth.setup.fields.map((field: { key: string }) => field.key)).toEqual(["apiKey"]);
  expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  expect(Object.keys(operations)).toHaveLength(7);
  const paths = new Set<string>();
  for (const [key, operation] of Object.entries(operations)) {
    expect(operation.kind, key).toBe("action");
    expect(operation.responseFormat, key).toBe("json");
    expect(operation.validationMode, key).toBe("strict-generated");
    expect(operation.inputSchema?.type, key).toBe("object");
    expect(operation.inputSchema?.additionalProperties, key).toBe(false);
    expect(operation.outputSchema?.type, key).toBe("object");
    expect(operation.title, key).toBeString();
    expect(operation.description, key).toBeString();
    expect(operation.timeoutMs, key).toBeGreaterThanOrEqual(1);
    expect(operation.timeoutMs, key).toBeLessThanOrEqual(300000);
    expect(operation.maxInputBytes, key).toBeLessThanOrEqual(26214400);
    expect(operation.maxResponseBytes ?? 0, key).toBeGreaterThanOrEqual(operation.maxInputBytes ?? 0);
    const method = operation.request?.method;
    expect(["GET", "POST"].includes(String(method)), key).toBe(true);
    const path = String(operation.request?.path ?? "");
    expect(path.startsWith("/"), key).toBe(true);
    expect(path.includes("http"), key).toBe(false);
    expect(path.includes("?"), key).toBe(false);
    expect(paths.has(`${method} ${path}`), key).toBe(false);
    paths.add(`${method} ${path}`);
    expect(operation.request?.success, key).toEqual([200]);
    walkProperties(operation.inputSchema, key);
    if (method === "GET" || method === "DELETE") {
      expect(operation.request?.body, key).toBeUndefined();
      expect(operation.request?.headers?.["Content-Type"], key).toBeUndefined();
      expect(operation.sideEffect, key).toBe("read");
    } else {
      expect(operation.request?.body, key).toBeDefined();
      expect(operation.request?.headers?.["Content-Type"], key).toBe("application/json");
      expect(operation.sideEffect, key).toBe("write");
    }
  }
});
