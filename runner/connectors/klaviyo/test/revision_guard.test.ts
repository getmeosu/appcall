import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { ALLOWLIST, scanSource } from "./revision_guard";

// Hardened revision guard: no YYYY-MM-DD date in any klaviyo src file except src/revision.ts,
// whatever the pattern. Allowlisted literals must match an ALLOWLIST entry by value AND position.

const SRC = join(import.meta.dir, "../src");
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx|js|mjs|cjs)$/.test(name) ? [p] : [];
  });
}

describe("klaviyo revision guard: src", () => {
  const all = files(SRC);
  it("scans every src file (recursively), exempting only revision.ts", () => {
    const rel = all.map((p) => relative(SRC, p)).sort();
    expect(rel).toContain("revision.ts");
    expect(rel.length).toBeGreaterThan(10);
  });
  it("no date literal outside revision.ts unless allowlisted", () => {
    const offenders = all
      .filter((p) => relative(SRC, p) !== "revision.ts")
      .flatMap((p) => scanSource(relative(SRC, p), readFileSync(p, "utf8")))
      .filter((h) => !h.allowedBy);
    expect(offenders).toEqual([]);
  });
  it("allowlist is exactly modelVersion 2026-05-16, with a reason", () => {
    expect(ALLOWLIST.map((a) => [a.id, a.value])).toEqual([["modelVersion", "2026-05-16"]]);
    for (const a of ALLOWLIST) expect(a.reason.length).toBeGreaterThan(40);
  });
  it("revision.ts itself would be caught if it were not exempt (the exemption is real)", () => {
    const text = readFileSync(join(SRC, "revision.ts"), "utf8");
    expect(scanSource("revision.ts", text).filter((h) => !h.allowedBy).map((h) => h.text)).toEqual(["2026-07-15"]);
  });
});

describe("klaviyo revision guard: negative fixtures (each must be caught)", () => {
  const D = "2026-07-15";
  const CASES: [string, string][] = [
    ["headers.set single quotes", `headers.set('revision', '${D}');`],
    ["headers.set double quotes", `h.set("revision", "${D}");`],
    ["headers.append", `h.append("revision", "${D}");`],
    ["object literal key", `const init = { headers: { revision: '${D}' } };`],
    ["quoted header-map key", `const headers = { "revision": "${D}", accept: "application/json" };`],
    ["computed header key", `const k = "revision"; const headers = { [k]: "${D}" };`],
    ["Headers tuple list", `new Headers([["revision", "${D}"]]);`],
    ["plain assignment", `let revision; revision = "${D}";`],
    ["const named anything", `const PIN = "${D}"; export default PIN;`],
    ["no-substitution template", "const r = `" + D + "`;"],
    ["template with substitution", "const r = `v=${x} " + D + "`;"],
    ["date split around a substitution", "const s = `2026-07${sep}-15`;"],
    ["template head before substitution", "fetch(url, { headers: { revision: `" + D + "${''}` } });"],
    ["string concatenation", `const r = "2026-" + "07-15";`],
    ["parenthesized concatenation", `const r = ("2026-07" + ("-" + "15"));`],
    ["literal type", `type Rev = "${D}";`],
    ["return value", `function rev() { return "${D}"; }`],
    ["function default param", `function f(revision = "${D}") { return revision; }`],
    ["array of revisions", `const revs = ["${D}"];`],
    ["regex literal", `const re = /${D}/;`],
    ["modelVersion with a different date", `const o = { modelVersion: "${D}" };`],
    ["2026-05-16 in a revision position", `h.set("revision", "2026-05-16");`],
    ["2026-05-16 under a non-modelVersion key", `const o = { revision: "2026-05-16" };`],
    ["2026-05-16 as a bare const", `const MV = "2026-05-16"; const o = { modelVersion: MV };`],
    ["escaped in a string", `const r = "rev\\u0069sion: ${D}";`],
  ];
  for (const [name, code] of CASES) {
    it(`catches: ${name}`, () => {
      const hits = scanSource("fixture.ts", code).filter((h) => !h.allowedBy);
      expect(hits.length, code).toBeGreaterThan(0);
    });
  }
  it("a fixture that is not date-shaped is not caught (the cases above are not vacuous)", () => {
    expect(scanSource("fixture.ts", `h.set("revision", REVISION); const o = { revision: rev };`)).toEqual([]);
  });
});

describe("klaviyo revision guard: allowed (not revisions)", () => {
  it("modelVersion: '2026-05-16' in an object literal and in a type is allowlisted", () => {
    const hits = scanSource("fixture.ts", `type T = { modelVersion: "2026-05-16" }; const o: T = { modelVersion: "2026-05-16" };`);
    expect(hits.map((h) => h.allowedBy)).toEqual(["modelVersion", "modelVersion"]);
  });
  it("dates in comments are not literals", () => {
    expect(scanSource("fixture.ts", `// revision 2026-07-15\n/* 2024-10-15 */ const x = 1;`)).toEqual([]);
  });
  it("non-date strings and ISO timestamps from data flow are not flagged unless literal", () => {
    expect(scanSource("fixture.ts", `const t = input.sendTime; const s = "2026"; const v = "07-15";`)).toEqual([]);
  });
});
