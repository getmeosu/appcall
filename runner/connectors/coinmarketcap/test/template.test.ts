import { expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

test("coinmarketcap manifest compiles with strict JSON defaults", () => {
  const { actions } = compileDeclarativeConnector(manifest as never);
  const operations = manifest.operations as Record<string, Record<string, any>>;
  expect(Object.keys(actions).sort()).toEqual(Object.keys(operations).sort());
  for (const [key, operation] of Object.entries(operations)) {
    expect(operation.kind, key).toBe("action");
    expect(operation.responseFormat, key).toBe("json");
    expect(operation.validationMode, key).toBe("strict-generated");
    expect(operation.enforceOutputSchema, key).toBe(true);
    expect(operation.outputSchema.type, key).toBe("object");
    expect(operation.request.method, key).toBe("GET");
    expect(operation.request.path, key).toMatch(/^\/v[123]\//);
    expect(operation.request.body, key).toBeUndefined();
    expect(actions[key], key).toBeTypeOf("function");
  }
});
