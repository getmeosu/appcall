import { expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const operations = manifest.operations as Record<string, {
  kind?: string;
  sideEffect?: string;
  responseFormat?: string;
  validationMode?: string;
  request?: { method?: string; path?: string; body?: unknown; headers?: Record<string, string> };
  inputSchema?: { type?: string };
  outputSchema?: { type?: string };
  maxInputBytes?: number;
  maxResponseBytes?: number;
  timeoutMs?: number;
  title?: string;
  description?: string;
}>;

test("BuiltWith manifest compiles with strict JSON defaults", () => {
  expect(manifest.key).toBe("builtwith");
  expect(manifest.network.allowedHosts).toEqual(["api.builtwith.com"]);
  expect(manifest.http.baseUrl).toBe("https://api.builtwith.com");
  expect(manifest.http.auth).toEqual({
    field: "apiKey",
    in: "query",
    name: "KEY",
    value: "{{apiKey}}",
  });
  expect(manifest.auth.setup.fields.map((field: { key: string }) => field.key)).toEqual(["apiKey"]);
  expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  expect(Object.keys(operations)).toHaveLength(10);
  for (const [key, operation] of Object.entries(operations)) {
    expect(operation.kind, key).toBe("action");
    expect(operation.sideEffect, key).toBe("read");
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
    expect(operation.request?.method, key).toBe("GET");
    expect(String(operation.request?.path ?? "").startsWith("/"), key).toBe(true);
    expect(operation.request?.body, key).toBeUndefined();
    expect(operation.request?.headers?.["Content-Type"], key).toBeUndefined();
    expect(JSON.stringify(manifest.http.headers)).not.toContain("Content-Type");
  }
});
