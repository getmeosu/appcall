import { expect, test } from "bun:test";
import manifest from "../manifest.json";

test("CheckFlow has no pinned template and every operation is one declarative JSON request", () => {
  expect(manifest.key).toBe("checkflow");
  expect(manifest.runtime).toBe("bun");
  const operations = Object.entries(manifest.operations);
  expect(operations).toHaveLength(10);
  for (const [key, operation] of operations) {
    expect(operation.kind, key).toBe("action");
    expect(operation.request?.method, key).toMatch(/^(GET|POST)$/);
    expect(operation.request?.path, key).toMatch(/^\/api\//);
    expect(operation.responseFormat, key).toBe("json");
    expect(operation.validationMode, key).toBe("strict-generated");
    expect(operation.enforceOutputSchema, key).toBe(true);
    expect(operation.inputSchema.type, key).toBe("object");
    expect(operation.outputSchema.type, key).toBe("object");
    expect(operation.handler, key).toBeUndefined();
  }
});
