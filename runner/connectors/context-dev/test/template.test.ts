import { expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

test("Context.dev manifest compiles every action with strict JSON defaults", () => {
  const compiled = compileDeclarativeConnector(manifest);
  const keys = Object.keys(manifest.operations).sort();
  expect(Object.keys(compiled.actions).sort()).toEqual(keys);
  expect(Object.keys(compiled.syncs)).toEqual([]);
  for (const [key, operation] of Object.entries(manifest.operations)) {
    expect(operation.kind, key).toBe("action");
    expect(operation.responseFormat, key).toBe("json");
    expect(operation.validationMode, key).toBe("strict-generated");
    expect(operation.enforceOutputSchema, key).toBe(true);
    expect(operation.inputSchema.type, key).toBe("object");
    expect(operation.outputSchema.type, key).toBe("object");
    expect(operation.title.length, key).toBeGreaterThan(0);
    expect(operation.description.length, key).toBeGreaterThan(0);
    expect(operation.request.method, key).toMatch(/^(GET|POST)$/);
    expect(operation.request.path.startsWith("/"), key).toBe(true);
    expect(operation.request.path.includes("{{"), key).toBe(false);
  }
});
