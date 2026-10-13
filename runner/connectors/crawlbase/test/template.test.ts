import { expect, test } from "bun:test";
import manifest from "../manifest.json";

test("Crawlbase manifest stays on one JSON host with strict defaults", () => {
  expect(manifest.network.allowedHosts).toEqual(["api.crawlbase.com"]);
  expect(manifest.http.baseUrl).toBe("https://api.crawlbase.com");
  expect(manifest.http.auth).toEqual({
    field: "apiKey",
    in: "query",
    name: "token",
    value: "{{apiKey}}",
  });
  for (const [key, operation] of Object.entries(manifest.operations)) {
    expect(operation.responseFormat, key).toBe("json");
    expect(operation.validationMode, key).toBe("strict-generated");
    expect(operation.enforceOutputSchema, key).toBe(true);
    expect(operation.outputSchema.type, key).toBe("object");
    expect(operation.request.method, key).toMatch(/^(GET|POST)$/);
    expect(operation.request.path, key).toMatch(/^\//);
    expect(operation.request.baseUrl, key).toBeUndefined();
    expect(operation.maxResponseBytes, key).toBeGreaterThanOrEqual(operation.maxInputBytes);
    expect(operation.maxInputBytes, key).toBeLessThanOrEqual(26214400);
    expect(operation.timeoutMs, key).toBeGreaterThanOrEqual(1);
    expect(operation.timeoutMs, key).toBeLessThanOrEqual(300000);
    if (operation.request.method === "GET" || operation.request.method === "DELETE") {
      expect(operation.request.body, key).toBeUndefined();
      expect(operation.request.headers?.["Content-Type"], key).toBeUndefined();
    } else {
      expect(operation.request.headers?.["Content-Type"], key).toBe("application/json");
    }
  }
});
