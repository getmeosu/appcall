import { expect, test } from "bun:test";
import manifest from "../manifest.json";

test("every Black Forest Labs operation is one strict JSON action", () => {
  const operations = manifest.operations as Record<string, Record<string, any>>;
  expect(Object.keys(operations).length).toBeGreaterThan(0);
  for (const [key, operation] of Object.entries(operations)) {
    expect(operation.kind, key).toBe("action");
    expect(operation.responseFormat, key).toBe("json");
    expect(operation.validationMode, key).toBe("strict-generated");
    expect(operation.enforceOutputSchema, key).toBe(true);
    expect(operation.outputSchema.type, key).toBe("object");
    expect(operation.inputSchema.type, key).toBe("object");
    expect(operation.inputSchema.additionalProperties, key).toBe(false);
    expect(typeof operation.title, key).toBe("string");
    expect(operation.title.length, key).toBeGreaterThan(0);
    expect(typeof operation.description, key).toBe("string");
    expect(operation.description.length, key).toBeGreaterThan(0);
    expect(operation.request.bodyEncoding, key).toBeUndefined();
    expect(["GET", "POST"]).toContain(operation.request.method);
    expect(String(operation.request.path).startsWith("/v1/"), key).toBe(true);
  }
});
