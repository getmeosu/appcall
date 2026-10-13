import { expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

test("Extracta.ai operations keep strict JSON defaults", () => {
  expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  for (const [key, operation] of Object.entries(manifest.operations)) {
    expect(operation.kind, key).toBe("action");
    expect(operation.responseFormat, key).toBe("json");
    expect(operation.validationMode, key).toBe("strict-generated");
    expect(operation.enforceOutputSchema, key).toBe(true);
    expect(operation.outputSchema.type, key).toBe("object");
    expect(operation.inputSchema.type, key).toBe("object");
    expect(operation.title.length, key).toBeGreaterThan(0);
    expect(operation.description.length, key).toBeGreaterThan(0);
    expect(operation.timeoutMs, key).toBeGreaterThanOrEqual(1);
    expect(operation.timeoutMs, key).toBeLessThanOrEqual(300000);
    expect(operation.maxInputBytes, key).toBeLessThanOrEqual(26214400);
    expect(operation.maxResponseBytes, key).toBeGreaterThanOrEqual(operation.maxInputBytes);
    expect(key.startsWith("webhook."), key).toBe(false);
  }
});
