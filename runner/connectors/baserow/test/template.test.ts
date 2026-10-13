import { expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

test("Baserow manifest uses strict JSON defaults and compiles every action", () => {
  const { actions } = compileDeclarativeConnector(manifest as never);
  const keys = Object.keys(manifest.operations);
  expect(keys.sort()).toEqual(Object.keys(actions).sort());
  for (const [key, operation] of Object.entries(manifest.operations)) {
    const op = operation as {
      kind?: string;
      responseFormat?: string;
      validationMode?: string;
      enforceOutputSchema?: boolean;
      request?: { method?: string; path?: string };
    };
    expect(op.kind, key).toBe("action");
    expect(op.responseFormat, key).toBe("json");
    expect(op.validationMode, key).toBe("strict-generated");
    expect(op.enforceOutputSchema, key).toBe(true);
    expect(op.request?.method, key).toBeString();
    expect(String(op.request?.path ?? "").startsWith("/"), key).toBe(true);
  }
});
