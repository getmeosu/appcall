import { expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const operations = manifest.operations as Record<string, {
  kind?: string;
  sideEffect?: string;
  responseFormat?: string;
  validationMode?: string;
  enforceOutputSchema?: boolean;
  request?: {
    method?: string;
    path?: string;
    body?: unknown;
    headers?: Record<string, string>;
    success?: number[];
  };
  inputSchema?: { type?: string; properties?: Record<string, unknown>; additionalProperties?: boolean };
  outputSchema?: { type?: string };
  maxInputBytes?: number;
  maxResponseBytes?: number;
  timeoutMs?: number;
  title?: string;
  description?: string;
}>;

const routes: Record<string, { method: string; path: string }> = {
  "schemas.list": { method: "GET", path: "/schemas/" },
  "schemas.get": { method: "GET", path: "/schemas/{{id}}/" },
  "schemas.create": { method: "POST", path: "/schemas/" },
  "schemas.update": { method: "PUT", path: "/schemas/{{id}}/" },
  "uploads.list": { method: "GET", path: "/uploads/" },
  "headless-imports.create": { method: "POST", path: "/headless/imports/" },
};

test("Dromo manifest compiles with strict JSON defaults", () => {
  expect(manifest.key).toBe("dromo");
  expect(manifest.version).toBe("0.1.0");
  expect(manifest.network.allowedHosts).toEqual(["app.dromo.io"]);
  expect(manifest.http.baseUrl).toBe("https://app.dromo.io/api/v1");
  expect(manifest.http.auth).toEqual({
    field: "apiKey",
    in: "header",
    name: "X-Dromo-License-Key",
    value: "{{apiKey}}",
  });
  expect(manifest.http.headers).toEqual({ Accept: "application/json" });
  expect(manifest.auth.setup.fields.map((field: { key: string }) => field.key)).toEqual(["apiKey"]);
  expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  expect(Object.keys(operations).sort()).toEqual(Object.keys(routes).sort());
  for (const [key, operation] of Object.entries(operations)) {
    const route = routes[key];
    expect(operation.kind, key).toBe("action");
    expect(operation.responseFormat, key).toBe("json");
    expect(operation.validationMode, key).toBe("strict-generated");
    expect(operation.enforceOutputSchema, key).toBe(true);
    expect(operation.inputSchema?.type, key).toBe("object");
    expect(operation.inputSchema?.additionalProperties, key).toBe(false);
    expect(operation.outputSchema?.type, key).toBe("object");
    expect(operation.title, key).toBeString();
    expect(operation.description, key).toBeString();
    expect(operation.timeoutMs, key).toBeGreaterThanOrEqual(1);
    expect(operation.timeoutMs, key).toBeLessThanOrEqual(300000);
    expect(operation.maxInputBytes, key).toBeLessThanOrEqual(26214400);
    expect(operation.maxResponseBytes ?? 0, key).toBeGreaterThanOrEqual(operation.maxInputBytes ?? 0);
    expect(operation.request?.method, key).toBe(route.method);
    expect(operation.request?.path, key).toBe(route.path);
    expect(operation.request?.success?.includes(204), key).toBe(false);
    const properties = operation.inputSchema?.properties ?? {};
    for (const name of ["url", "upload_url", "baseUrl", "webhookUrl", "file"]) {
      expect(properties[name], key).toBeUndefined();
    }
    if (route.method === "GET" || route.method === "DELETE") {
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
