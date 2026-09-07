// runner/sena-e2e/test/config.test.ts
import { test, expect } from "bun:test";
import { loadConfig } from "../config";

test("MAX_LEADS is parsed when a valid number", () => {
  expect(loadConfig({ MAX_LEADS: "5" } as any, []).maxLeads).toBe(5);
});

test("MAX_LEADS defaults to 1 when unset", () => {
  expect(loadConfig({} as any, []).maxLeads).toBe(1);
});

test("MAX_LEADS that is not a number throws", () => {
  expect(() => loadConfig({ MAX_LEADS: "abc" } as any, [])).toThrow();
});
