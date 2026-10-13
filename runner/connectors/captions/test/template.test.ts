import { expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

test("Captions manifest compiles as the source of truth without a template overlay", () => {
  const { actions } = compileDeclarativeConnector(manifest);
  expect(manifest.key).toBe("captions");
  expect(manifest.version).toBe("0.1.0");
  expect(Object.keys(actions).sort()).toEqual(Object.keys(manifest.operations).sort());
  expect(Object.values(manifest.operations).every((operation) => operation.request?.method && operation.request?.path)).toBe(true);
});
