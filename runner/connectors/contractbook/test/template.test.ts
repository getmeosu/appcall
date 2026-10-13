import { expect, test } from "bun:test";
import manifest from "../manifest.json";

const operations = manifest.operations as Record<string, {
  kind?: string;
  handler?: unknown;
  responseFormat?: string;
  validationMode?: string;
  enforceOutputSchema?: boolean;
  timeoutMs?: number;
  maxInputBytes?: number;
  maxResponseBytes?: number;
  title?: string;
  description?: string;
  sideEffect?: string;
  inputSchema?: { type?: string };
  outputSchema?: { type?: string };
  request?: { method?: string; path?: string; baseUrl?: string; body?: unknown; headers?: Record<string, string> };
}>;

test("Contractbook manifest is strict JSON on the production host", () => {
  expect(manifest.key).toBe("contractbook");
  expect(manifest.network.allowedHosts).toEqual(["api.contractbook.com"]);
  expect(manifest.http.baseUrl).toBe("https://api.contractbook.com/v3");
  expect(manifest.http.auth).toEqual({
    field: "apiKey",
    in: "header",
    name: "Authorization",
    value: "Bearer {{apiKey}}",
  });
  expect(Object.keys(operations).length).toBe(7);
  for (const [key, operation] of Object.entries(operations)) {
    expect(operation.kind, key).toBe("action");
    expect(operation.handler, key).toBeUndefined();
    expect(operation.responseFormat, key).toBe("json");
    expect(operation.validationMode, key).toBe("strict-generated");
    expect(operation.enforceOutputSchema, key).toBe(true);
    expect(operation.title, key).toBeTypeOf("string");
    expect(operation.description, key).toBeTypeOf("string");
    expect(operation.inputSchema?.type, key).toBe("object");
    expect(operation.outputSchema?.type, key).toBe("object");
    expect(operation.request?.baseUrl, key).toBeUndefined();
    expect(operation.request?.method, key).toMatch(/^(GET|POST|PATCH)$/);
    expect(operation.request?.path, key).toMatch(/^\//);
    expect(operation.timeoutMs, key).toBeGreaterThanOrEqual(1);
    expect(operation.timeoutMs, key).toBeLessThanOrEqual(300000);
    expect(operation.maxInputBytes, key).toBeGreaterThan(0);
    expect(operation.maxInputBytes, key).toBeLessThanOrEqual(26214400);
    expect(operation.maxResponseBytes, key).toBeGreaterThanOrEqual(operation.maxInputBytes!);
    const method = operation.request?.method;
    if (method === "GET" || method === "DELETE") {
      expect(operation.request?.body, key).toBeUndefined();
      expect(operation.request?.headers?.["Content-Type"], key).toBeUndefined();
    } else {
      expect(operation.request?.headers?.["Content-Type"], key).toBe("application/json");
      expect(operation.request?.body, key).toBeTypeOf("object");
    }
  }
});
