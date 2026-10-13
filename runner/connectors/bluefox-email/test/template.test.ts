import { expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

test("BlueFox Email manifest uses strict JSON defaults on every action", () => {
  expect(manifest.key).toBe("bluefox-email");
  expect(manifest.version).toBe("0.1.0");
  const operations = Object.entries(manifest.operations);
  expect(operations).toHaveLength(11);
  for (const [key, operation] of operations) {
    expect(operation.kind, key).toBe("action");
    expect(operation.responseFormat, key).toBe("json");
    expect(operation.validationMode, key).toBe("strict-generated");
    expect(operation.enforceOutputSchema, key).toBe(true);
    expect(operation.outputSchema.type, key).toBe("object");
    expect(operation.request.method, key).toBeString();
    expect(operation.request.path.startsWith("/"), key).toBe(true);
    expect(operation.request.baseUrl, key).toBeUndefined();
  }
  expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
});
