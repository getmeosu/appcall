import { expect, test } from "bun:test";
import manifest from "../manifest.json";

test("bika operations keep strict json defaults", () => {
  expect(manifest.runtime).toBe("bun");
  expect(manifest.visibility).toBe("public");
  for (const [key, operation] of Object.entries(manifest.operations)) {
    expect(operation.kind, key).toBe("action");
    expect(operation.responseFormat, key).toBe("json");
    expect(operation.validationMode, key).toBe("strict-generated");
    expect(operation.enforceOutputSchema, key).toBe(true);
    expect(operation.outputSchema.type, key).toBe("object");
    expect(operation.request.method, key).toMatch(/^(GET|POST|PUT|DELETE)$/);
    expect(operation.request.path.startsWith("/"), key).toBe(true);
    expect(operation.request.success, key).toEqual([200]);
  }
});
