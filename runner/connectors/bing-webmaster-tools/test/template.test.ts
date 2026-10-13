import { expect, test } from "bun:test";
import manifest from "../manifest.json";

const operations = Object.entries(manifest.operations) as Array<[string, {
  kind?: string;
  title?: string;
  description?: string;
  sideEffect?: string;
  timeoutMs?: number;
  maxInputBytes?: number;
  maxResponseBytes?: number;
  responseFormat?: string;
  validationMode?: string;
  enforceOutputSchema?: boolean;
  inputSchema?: { type?: string };
  outputSchema?: { type?: string };
  request?: { method?: string; path?: string; body?: unknown; headers?: Record<string, string>; baseUrl?: string };
}]>;

test("Bing Webmaster Tools manifest is one JSON route per operation", () => {
  expect(manifest.network.allowedHosts).toEqual(["ssl.bing.com"]);
  expect(manifest.http.baseUrl).toBe("https://ssl.bing.com/webmaster/api.svc/json");
  expect(manifest.http.auth).toEqual({
    field: "apiKey",
    in: "query",
    name: "apikey",
    value: "{{apiKey}}",
  });
  expect(operations.length).toBe(5);
  for (const [key, operation] of operations) {
    expect(operation.kind, key).toBe("action");
    expect(operation.title, key).toBeTypeOf("string");
    expect(operation.description, key).toBeTypeOf("string");
    expect(operation.inputSchema?.type, key).toBe("object");
    expect(operation.outputSchema?.type, key).toBe("object");
    expect(operation.responseFormat, key).toBe("json");
    expect(operation.validationMode, key).toBe("strict-generated");
    expect(operation.enforceOutputSchema, key).toBe(true);
    expect(operation.request?.baseUrl, key).toBeUndefined();
    expect(["GET", "POST"]).toContain(operation.request?.method);
    expect(operation.request?.path, key).toMatch(/^\/[A-Za-z]+$/);
    expect(operation.timeoutMs, key).toBeGreaterThanOrEqual(1);
    expect(operation.timeoutMs, key).toBeLessThanOrEqual(300000);
    expect(operation.maxInputBytes, key).toBeLessThanOrEqual(26214400);
    expect(operation.maxResponseBytes ?? 0, key).toBeGreaterThanOrEqual(operation.maxInputBytes ?? 0);
    const method = operation.request?.method;
    const hasBody = operation.request?.body !== undefined;
    if (method === "GET" || method === "DELETE") {
      expect(hasBody, key).toBe(false);
      expect(operation.request?.headers?.["Content-Type"], key).toBeUndefined();
    }
    if (hasBody) {
      expect(operation.request?.headers?.["Content-Type"], key).toBe("application/json");
    }
  }
});
