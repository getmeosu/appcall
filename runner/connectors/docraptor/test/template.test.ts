import { expect, test } from "bun:test";
import manifest from "../manifest.json";

test("DocRaptor manifest operations use strict JSON defaults", () => {
  expect(manifest.key).toBe("docraptor");
  expect(Object.keys(manifest.operations).length).toBeGreaterThan(0);
  for (const [key, operation] of Object.entries(manifest.operations)) {
    expect(operation.kind, key).toBe("action");
    expect(operation.responseFormat, key).toBe("json");
    expect(operation.validationMode, key).toBe("strict-generated");
    expect(operation.request?.method, key).toBeString();
    expect(operation.request?.path, key).toBeString();
  }
});
