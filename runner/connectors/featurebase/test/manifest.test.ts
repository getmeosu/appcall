import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
describe("featurebase manifest", () => {
  test("is fixed-host read-only and compiles", () => {
    expect(manifest.network.allowedHosts).toEqual(["do.featurebase.app"]);
    expect(Object.values(manifest.operations).every((op) => op.sideEffect === "read")).toBe(true);
    expect(() => compileDeclarativeConnector(manifest)).not.toThrow();
  });
});
