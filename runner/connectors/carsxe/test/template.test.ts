import { expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const operations = manifest.operations as Record<string, {
  kind?: string;
  responseFormat?: string;
  validationMode?: string;
  redactResponseKeys?: string[];
  request?: { method?: string; path?: string; body?: unknown; headers?: Record<string, string> };
  inputSchema?: { type?: string; properties?: Record<string, unknown> };
  outputSchema?: { type?: string };
  maxInputBytes?: number;
  maxResponseBytes?: number;
  timeoutMs?: number;
  title?: string;
  description?: string;
}>;

test("CarsXE manifest compiles with strict JSON defaults", () => {
  expect(manifest.key).toBe("carsxe");
  expect(manifest.network.allowedHosts).toEqual(["api.carsxe.com"]);
  expect(manifest.http.baseUrl).toBe("https://api.carsxe.com");
  expect(manifest.http.auth).toEqual({ field: "apiKey", in: "query", name: "key", value: "{{apiKey}}" });
  expect(manifest.auth.setup.fields.map((field: { key: string }) => field.key)).toEqual(["apiKey"]);
  expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  expect(Object.keys(operations)).toHaveLength(10);
  for (const [key, operation] of Object.entries(operations)) {
    expect(operation.kind, key).toBe("action");
    expect(operation.responseFormat, key).toBe("json");
    expect(operation.validationMode, key).toBe("strict-generated");
    expect(operation.inputSchema?.type, key).toBe("object");
    expect(operation.outputSchema?.type, key).toBe("object");
    expect(operation.title, key).toBeString();
    expect(operation.description, key).toBeString();
    expect(operation.timeoutMs, key).toBeGreaterThanOrEqual(1);
    expect(operation.timeoutMs, key).toBeLessThanOrEqual(300000);
    expect(operation.maxInputBytes, key).toBeLessThanOrEqual(26214400);
    expect(operation.maxResponseBytes ?? 0, key).toBeGreaterThanOrEqual(operation.maxInputBytes ?? 0);
    expect(operation.redactResponseKeys, key).toEqual(["key"]);
    const method = operation.request?.method;
    expect(method, key).toBeString();
    const path = String(operation.request?.path ?? "");
    expect(path.startsWith("/"), key).toBe(true);
    expect(path.includes("{{"), key).toBe(false);
    expect(path.includes("http"), key).toBe(false);
    const properties = operation.inputSchema?.properties ?? {};
    for (const name of ["url", "baseUrl", "webhookUrl", "csvUrl", "image"]) {
      expect(properties[name], key).toBeUndefined();
    }
    if (method === "GET" || method === "DELETE") {
      expect(operation.request?.body, key).toBeUndefined();
      expect(operation.request?.headers?.["Content-Type"], key).toBeUndefined();
    } else {
      expect(operation.request?.body, key).toBeDefined();
      expect(operation.request?.headers?.["Content-Type"], key).toBe("application/json");
    }
  }
});
