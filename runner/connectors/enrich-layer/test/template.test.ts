import { expect, test } from "bun:test";
import manifest from "../manifest.json";

test("Enrich Layer operations keep strict JSON defaults on one body-less GET", () => {
  const operations = Object.entries(manifest.operations);
  expect(operations).toHaveLength(9);
  for (const [key, operation] of operations) {
    expect(operation.kind, key).toBe("action");
    expect(operation.sideEffect, key).toBe("read");
    expect(operation.responseFormat, key).toBe("json");
    expect(operation.validationMode, key).toBe("strict-generated");
    expect(operation.enforceOutputSchema, key).toBe(true);
    expect(operation.outputSchema.type, key).toBe("object");
    expect(operation.inputSchema.type, key).toBe("object");
    expect(operation.inputSchema.additionalProperties, key).toBe(false);
    expect(operation.request.method, key).toBe("GET");
    expect(operation.request.body, key).toBeUndefined();
    expect(operation.request.headers, key).toBeUndefined();
    expect(operation.request.baseUrl, key).toBeUndefined();
    expect(operation.request.success, key).toEqual([200]);
    expect(operation.timeoutMs, key).toBeGreaterThanOrEqual(1);
    expect(operation.timeoutMs, key).toBeLessThanOrEqual(300000);
    expect(operation.maxInputBytes, key).toBeLessThanOrEqual(26214400);
    expect(operation.maxResponseBytes, key).toBeGreaterThanOrEqual(operation.maxInputBytes);
    expect(JSON.stringify(operation.inputSchema), key).not.toContain("://");
    expect(operation.title.length, key).toBeGreaterThan(0);
    expect(operation.description.length, key).toBeGreaterThan(0);
  }
});
