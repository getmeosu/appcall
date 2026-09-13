import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
describe("capsule crm manifest", () => { test("contains only source-backed fixed-host read operations", () => { expect(manifest.network.allowedHosts).toEqual(["api.capsulecrm.com"]); expect(Object.keys(manifest.operations)).toEqual(["healthcheck", "parties.list", "opportunities.list"]); expect(Object.values(manifest.operations).every((op) => op.kind === "action" && op.sideEffect === "read")).toBe(true); expect(() => compileDeclarativeConnector(manifest)).not.toThrow(); }); });
