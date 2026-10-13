import { expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

test("Docnify manifest compiles with strict JSON defaults", () => {
  const compiled = compileDeclarativeConnector(manifest as never);
  expect(manifest.version).toBe("0.1.0");
  for (const [key, operation] of Object.entries(manifest.operations)) {
    expect(operation.responseFormat, key).toBe("json");
    expect(operation.validationMode, key).toBe("strict-generated");
    expect(operation.enforceOutputSchema, key).toBe(true);
    expect(operation.outputSchema.type, key).toBe("object");
    expect(operation.request.baseUrl, key).toBeUndefined();
    expect(typeof compiled.actions[key], key).toBe("function");
  }
});
