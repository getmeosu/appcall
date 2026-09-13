import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
describe("salesflare manifest", () => { test("is fixed-host read-only declarative connector", () => { expect(manifest.network.allowedHosts).toEqual(["api.salesflare.com"]); expect(Object.values(manifest.operations).every((op) => op.kind === "action" && op.sideEffect === "read")).toBe(true); expect(() => compileDeclarativeConnector(manifest)).not.toThrow(); }); });
