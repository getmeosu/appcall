import { expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

test("BotMape manifest compiles with strict JSON defaults", () => {
  const { actions } = compileDeclarativeConnector(manifest as never);
  const operations = manifest.operations as Record<string, Record<string, unknown>>;
  expect(Object.keys(operations).sort()).toEqual(Object.keys(actions).sort());
  expect(Object.keys(operations)).toHaveLength(8);
  for (const [key, operation] of Object.entries(operations)) {
    expect(operation.kind, key).toBe("action");
    expect(operation.responseFormat, key).toBe("json");
    expect(operation.validationMode, key).toBe("strict-generated");
    expect(operation.enforceOutputSchema, key).toBe(true);
    const output = operation.outputSchema as { type?: string };
    expect(output.type, key).toBe("object");
    const request = operation.request as { method?: string; path?: string };
    expect(typeof request.method, key).toBe("string");
    expect(typeof request.path, key).toBe("string");
  }
});
