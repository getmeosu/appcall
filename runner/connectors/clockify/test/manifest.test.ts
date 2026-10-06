import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const existing = ["healthcheck", "workspaces.list", "projects.list", "tasks.list"] as const;

describe("clockify manifest", () => {
  test("keeps existing keys at v0.2.0 and compiles", () => {
    expect(manifest.key).toBe("clockify");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.http.auth.name).toBe("X-Api-Key");
    for (const key of existing) expect(manifest.operations[key].kind).toBe("action");
    expect(Object.keys(manifest.operations).length).toBe(20);
    expect(() => compileDeclarativeConnector(manifest)).not.toThrow();
  });
});
