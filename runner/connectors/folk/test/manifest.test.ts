import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";

describe("folk manifest", () => {
  test("has only bounded read operations and fixed hosts", () => {
    expect(manifest.network.allowedHosts).toEqual(["api.folk.app"]);
    expect(Object.values(manifest.operations).every((op) => op.kind === "action" && op.sideEffect === "read")).toBe(true);
    expect(() => compileDeclarativeConnector(manifest)).not.toThrow();
  });
});
