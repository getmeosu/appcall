import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";

describe("salesflare manifest", () => {
  test("is a fixed-host declarative connector with mixed read and write ops", () => {
    expect(manifest.network.allowedHosts).toEqual(["api.salesflare.com"]);
    expect(manifest.version).toBe("0.2.0");
    const operations = Object.values(manifest.operations);
    expect(operations.every((op) => op.kind === "action")).toBe(true);
    expect(operations.some((op) => op.sideEffect === "write")).toBe(true);
    expect(operations.some((op) => op.sideEffect === "destructive")).toBe(true);
    expect(() => compileDeclarativeConnector(manifest)).not.toThrow();
  });
});
