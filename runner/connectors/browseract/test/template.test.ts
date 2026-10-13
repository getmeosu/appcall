import { expect, test } from "bun:test";
import manifest from "../manifest.json";

test("BrowserAct manifest operations use strict JSON defaults", () => {
  expect(manifest.key).toBe("browseract");
  expect(Object.keys(manifest.operations).length).toBeGreaterThan(0);
  for (const [key, operation] of Object.entries(manifest.operations)) {
    expect(operation.kind, key).toBe("action");
    expect(operation.responseFormat, key).toBe("json");
    expect(operation.validationMode, key).toBe("strict-generated");
    expect(operation.enforceOutputSchema, key).toBe(true);
    expect(operation.outputSchema.type, key).toBe("object");
    expect(typeof operation.request.method, key).toBe("string");
    expect(typeof operation.request.path, key).toBe("string");
    expect(operation.request.path.startsWith("/v3/"), key).toBe(true);
    expect(operation.handler, key).toBeUndefined();
  }
});
