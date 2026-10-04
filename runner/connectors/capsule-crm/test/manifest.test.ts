import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";

describe("capsule crm manifest", () => {
  test("keeps existing keys and compiles deepened HTTP actions", () => {
    expect(manifest.network.allowedHosts).toEqual(["api.capsulecrm.com"]);
    expect(manifest.version).toBe("0.2.0");
    expect(Object.keys(manifest.operations)).toContain("healthcheck");
    expect(Object.keys(manifest.operations)).toContain("parties.list");
    expect(Object.keys(manifest.operations)).toContain("opportunities.list");
    const actions = Object.entries(manifest.operations).filter(([, op]) => op.kind === "action");
    expect(actions.length).toBeGreaterThanOrEqual(18);
    expect(actions.every(([, op]) => op.request?.method && op.request?.path)).toBe(true);
    expect(() => compileDeclarativeConnector(manifest)).not.toThrow();
    expect(Object.keys(compileDeclarativeConnector(manifest).actions).length).toBe(actions.length);
  });
});
