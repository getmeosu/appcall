import { expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const operations = manifest.operations as Record<string, {
  kind?: string;
  sideEffect?: string;
  responseFormat?: string;
  validationMode?: string;
  request?: { method?: string; path?: string; body?: unknown; headers?: Record<string, string>; success?: number[] };
  inputSchema?: { type?: string; properties?: Record<string, unknown> };
  outputSchema?: { type?: string };
  maxInputBytes?: number;
  maxResponseBytes?: number;
  timeoutMs?: number;
  title?: string;
  description?: string;
}>;

test("FeedBear manifest compiles as one JSON route per action", () => {
  expect(manifest.key).toBe("feedbear");
  expect(manifest.network.allowedHosts).toEqual(["app.feedbear.com"]);
  expect(manifest.http.baseUrl).toBe("https://app.feedbear.com/api/v1");
  expect(manifest.http.auth).toEqual({
    field: "apiKey",
    in: "header",
    name: "Authorization",
    value: "Bearer {{apiKey}}",
  });
  expect(manifest.auth.setup.fields.map((field: { key: string }) => field.key)).toEqual(["apiKey"]);
  expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  expect(Object.keys(operations)).toHaveLength(9);
  for (const [key, operation] of Object.entries(operations)) {
    expect(operation.kind, key).toBe("action");
    expect(operation.responseFormat, key).toBe("json");
    expect(operation.validationMode, key).toBe("strict-generated");
    expect(operation.inputSchema?.type, key).toBe("object");
    expect(operation.outputSchema?.type, key).toBe("object");
    expect(operation.title, key).toBeString();
    expect(operation.description, key).toBeString();
    expect(operation.sideEffect === "read" || operation.sideEffect === "write", key).toBe(true);
    expect(operation.timeoutMs, key).toBeGreaterThanOrEqual(1);
    expect(operation.timeoutMs, key).toBeLessThanOrEqual(300000);
    expect(operation.maxInputBytes, key).toBeLessThanOrEqual(26214400);
    expect(operation.maxResponseBytes ?? 0, key).toBeGreaterThanOrEqual(operation.maxInputBytes ?? 0);
    const method = operation.request?.method;
    expect(["GET", "POST", "PATCH"].includes(String(method)), key).toBe(true);
    const path = String(operation.request?.path ?? "");
    expect(path.startsWith("/"), key).toBe(true);
    expect(path.includes("http"), key).toBe(false);
    expect(path.split("{{").length, key).toBeLessThanOrEqual(3);
    expect(operation.request?.success?.some((status) => status === 204), key).toBe(false);
    const properties = operation.inputSchema?.properties ?? {};
    for (const name of ["url", "baseUrl", "webhookUrl", "csvUrl", "image", "returnUrl"]) {
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
