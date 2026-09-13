import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";

describe("attio manifest", () => {
  test("has only bounded read operations and fixed hosts", () => {
    expect(manifest.network.allowedHosts).toEqual(["api.attio.com"]);
    expect(Object.values(manifest.operations).every((op) => op.kind === "action" && op.sideEffect === "read")).toBe(true);
    expect(manifest.operations["records.list"].request.method).toBe("POST");
    expect(() => compileDeclarativeConnector(manifest)).not.toThrow();
  });
});
