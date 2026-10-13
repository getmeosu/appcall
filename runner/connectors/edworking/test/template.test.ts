import { expect, test } from "bun:test";
import manifest from "../manifest.json";

const limits = { maxInputBytes: 26214400, timeoutMs: 300000 };

test("edworking operations keep strict json defaults", () => {
  expect(manifest.runtime).toBe("bun");
  expect(manifest.visibility).toBe("public");
  expect(manifest.network.allowedHosts).toEqual(["gateway.edworking.com"]);
  expect(manifest.http.baseUrl).toBe("https://gateway.edworking.com");
  expect(manifest.http.auth).toEqual({
    field: "apiKey",
    in: "header",
    name: "Authorization",
    value: "Bearer {{apiKey}}",
  });
  expect(manifest.http.headers["Content-Type"]).toBe("application/json");
  expect(Object.keys(manifest.operations)).toHaveLength(8);
  for (const [key, operation] of Object.entries(manifest.operations)) {
    expect(operation.kind, key).toBe("action");
    expect(operation.title.length, key).toBeGreaterThan(0);
    expect(operation.description.length, key).toBeGreaterThan(0);
    expect(operation.responseFormat, key).toBe("json");
    expect(operation.validationMode, key).toBe("strict-generated");
    expect(operation.enforceOutputSchema, key).toBe(true);
    expect(operation.inputSchema.type, key).toBe("object");
    expect(operation.outputSchema.type, key).toBe("object");
    expect(operation.request.method, key).toBe("POST");
    expect(operation.request.path, key).toBe("/");
    expect(operation.request.baseUrl, key).toBeUndefined();
    expect(operation.request.success, key).toEqual([200]);
    expect(typeof operation.request.body.query, key).toBe("string");
    expect(operation.request.body.query.includes("{{"), key).toBe(false);
    expect(operation.request.body.query.includes("http://") || operation.request.body.query.includes("https://"), key).toBe(false);
    expect(operation.maxResponseBytes, key).toBeGreaterThanOrEqual(operation.maxInputBytes);
    expect(operation.maxInputBytes, key).toBeLessThanOrEqual(limits.maxInputBytes);
    expect(operation.timeoutMs, key).toBeGreaterThanOrEqual(1);
    expect(operation.timeoutMs, key).toBeLessThanOrEqual(limits.timeoutMs);
    const names = Object.keys(operation.inputSchema.properties ?? {});
    expect(names.some((name) => /url/i.test(name)), key).toBe(false);
  }
});
