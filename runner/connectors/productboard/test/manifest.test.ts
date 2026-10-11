import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";

const existing = ["healthcheck", "entities.list", "entities.get", "notes.list", "notes.get", "members.list", "members.get"] as const;

describe("productboard manifest", () => {
  test("keeps existing keys at v0.2.0 and compiles", () => {
    expect(manifest.key).toBe("productboard");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.network.allowedHosts).toEqual(["api.productboard.com"]);
    for (const key of existing) {
      expect(manifest.operations[key].kind).toBe("action");
      expect(manifest.operations[key].sideEffect).toBe("read");
    }
    expect(Object.keys(manifest.operations).length).toBe(20);
    expect(() => compileDeclarativeConnector(manifest)).not.toThrow();
  });
});
