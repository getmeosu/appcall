import { describe, expect, it } from "bun:test";
import { importedNames, generateStubSource } from "../resolver";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("importedNames", () => {
  it("finds named imports", () => {
    expect(importedNames(`import { a, b } from 'dayjs';`, "dayjs").sort()).toEqual(["a", "b"]);
  });

  it("finds a default import", () => {
    expect(importedNames(`import dayjs from 'dayjs';`, "dayjs")).toEqual(["default"]);
  });

  it("finds a mixed default and named import", () => {
    expect(importedNames(`import dayjs, { Dayjs } from 'dayjs';`, "dayjs").sort()).toEqual(["Dayjs", "default"]);
  });

  it("uses the local alias of a renamed import", () => {
    expect(importedNames(`import { a as b } from 'x';`, "x")).toEqual(["b"]);
  });

  it("finds names across several import statements", () => {
    const source = `import { a } from 'x';\nimport { b } from 'x';\nimport { c } from 'y';`;
    expect(importedNames(source, "x").sort()).toEqual(["a", "b"]);
  });

  it("covers re-exports", () => {
    expect(importedNames(`export { a } from 'x';`, "x")).toEqual(["a"]);
  });

  it("ignores a different specifier", () => {
    expect(importedNames(`import { a } from 'other';`, "x")).toEqual([]);
  });

  it("escapes regex characters in a scoped package name", () => {
    expect(importedNames(`import { z } from '@scope/pkg.name';`, "@scope/pkg.name")).toEqual(["z"]);
  });
});

describe("generateStubSource", () => {
  it("exports a default plus every requested name", async () => {
    const source = generateStubSource(["default", "alpha", "beta"]);
    expect(source).toContain("export default stub;");
    expect(source).toContain("export const alpha = stub;");
    expect(source).toContain("export const beta = stub;");
  });

  it("produces a module whose exports absorb calls, construction, and property access", async () => {
    const source = generateStubSource(["default", "helper"]);
    const path = join(mkdtempSync(join(tmpdir(), "ap-stub-")), "stub.js");
    writeFileSync(path, source);
    const module = await import(path);
    expect(typeof module.default).toBe("function");
    expect(() => module.helper().deeply.nested("x")).not.toThrow();
    expect(() => new module.default()).not.toThrow();
    expect(module.default.then).toBeUndefined();
  });
});
