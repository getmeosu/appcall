import { expect, test } from "bun:test";
import manifest from "../manifest.json";

test("every BulkPublish operation is one strict JSON GET", () => {
  const operations = manifest.operations;
  expect(Object.keys(operations)).toHaveLength(10);
  for (const [key, operation] of Object.entries(operations)) {
    expect(operation.responseFormat, key).toBe("json");
    expect(operation.validationMode, key).toBe("strict-generated");
    expect(operation.enforceOutputSchema, key).toBe(true);
    expect(operation.request.method, key).toBe("GET");
    expect(operation.request.body, key).toBeUndefined();
    expect(operation.outputSchema.type, key).toBe("object");
  }
});
