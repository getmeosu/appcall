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
  inputSchema?: { type?: string };
  outputSchema?: { type?: string };
  request?: { method?: string; path?: string; body?: unknown; headers?: Record<string, string>; success?: number[] };
}>;

test("Evenium manifest is strict JSON on the organizer host", () => {
  expect(manifest.key).toBe("evenium");
  expect(manifest.network.allowedHosts).toEqual(["evenium.com"]);
  expect(manifest.http.baseUrl).toBe("https://evenium.com/api/1");
  expect(manifest.http.auth).toEqual({
    field: "apiKey",
    in: "header",
    name: "X-Evenium-Token",
    value: "{{apiKey}}",
  });
  expect(Object.keys(operations).sort()).toEqual([
    "contacts.create",
    "contacts.events.list",
    "contacts.events.listByCustomId",
    "contacts.get",
    "contacts.getByCustomId",
    "contacts.import",
    "contacts.list",
    "contacts.update",
    "contacts.updateByCustomId",
    "events.list",
  ]);
  for (const [key, operation] of Object.entries(operations)) {
    expect(operation.kind, key).toBe("action");
    expect(operation.handler, key).toBeUndefined();
    expect(operation.responseFormat, key).toBe("json");
    expect(operation.validationMode, key).toBe("strict-generated");
    expect(operation.enforceOutputSchema, key).toBe(true);
    expect(operation.inputSchema?.type, key).toBe("object");
    expect(operation.outputSchema?.type, key).toBe("object");
    expect(operation.title, key).toEqual(expect.any(String));
    expect(operation.description, key).toEqual(expect.any(String));
    expect(operation.timeoutMs, key).toBeGreaterThanOrEqual(1);
    expect(operation.timeoutMs, key).toBeLessThanOrEqual(300000);
    expect(operation.maxInputBytes, key).toBeLessThanOrEqual(26214400);
    expect(operation.maxResponseBytes, key).toBeGreaterThanOrEqual(operation.maxInputBytes ?? 0);
    const request = operation.request;
    expect(request?.method, key).toEqual(expect.any(String));
    expect(request?.path, key).toMatch(/^\//);
    expect(request?.success, key).not.toContain(204);
    if (request?.method === "GET" || request?.method === "DELETE") {
      expect(request.body, key).toBeUndefined();
      expect(request.headers?.["Content-Type"], key).toBeUndefined();
    } else {
      expect(request?.body, key).toBeDefined();
      expect(request?.headers?.["Content-Type"], key).toBe("application/json");
    }
  }
});
