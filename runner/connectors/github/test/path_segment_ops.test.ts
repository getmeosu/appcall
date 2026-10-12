import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import listedOps from "./fixtures/seg_dotdot_ops.json";
import { defaultConnectorRegistry } from "../../../bun/src/registry";
import { assertSafeRequestPath, requireRefComponents, requireSingleSegment } from "../src/path_segment";

// FIX-SEGMENT amend: a generator over every manifest action whose request path carries a
// top-level input field. Each such field gets "..", "%2e%2e", "\", "" and whitespace (plus
// "a/../b" and "a/%2e%2e/b" where "/" is accepted) and must fail before any fetch. The
// 265 ops of the recount (fixtures/seg_dotdot_ops.json) must all be covered. Recorders only.

type Seen = { method: string; url: string };
const ops = manifest.operations as Record<string, any>;

function recorder() {
  const seen: Seen[] = [];
  const fetch = (async (url: unknown, init?: RequestInit) => {
    seen.push({ method: init?.method ?? "GET", url: String(url) });
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { seen, fetch };
}

let counter = 0;
function gen(schema: any, sentinels: Record<string, string>, path: string): any {
  if (!schema) return "x";
  if (schema.enum) return schema.enum[0];
  if (schema.const !== undefined) return schema.const;
  if (schema.oneOf || schema.anyOf) return gen((schema.oneOf || schema.anyOf)[0], sentinels, path);
  const t = Array.isArray(schema.type) ? schema.type.find((x: string) => x !== "null") : schema.type;
  if (t === "string") {
    if (schema.format === "date-time") return "2026-01-01T00:00:00Z";
    if (schema.format === "date") return "2026-01-01";
    if (schema.format === "uri" || schema.format === "url") return "https://example.com/x";
    if (schema.format === "email") return "a@example.com";
    if (schema.pattern) return null;
    const s = `zq${(counter++).toString(36)}x`;
    sentinels[path] = s;
    return s;
  }
  if (t === "integer" || t === "number") {
    const v = Math.max(schema.minimum ?? 7, 7);
    return v <= (schema.maximum ?? 1e9) ? v : schema.minimum;
  }
  if (t === "boolean") return true;
  if (t === "array") {
    const item = gen(schema.items, sentinels, `${path}[0]`);
    return item === null ? [] : Array.from({ length: Math.max(1, schema.minItems ?? 1) }, () => item);
  }
  if (t === "object" || schema.properties) {
    const o: Record<string, unknown> = {};
    for (const k of schema.required ?? []) {
      const v = gen(schema.properties?.[k], sentinels, path ? `${path}.${k}` : k);
      if (v !== null) o[k] = v;
    }
    return o;
  }
  return "x";
}

async function call(op: string, input: Record<string, unknown>) {
  const r = recorder();
  let failed = false;
  try {
    const result: any = defaultConnectorRegistry.executeAction("github", op, { ...input, accessToken: "tok", fetch: r.fetch });
    const settled = await Promise.resolve(result);
    if (!settled || settled.ok === false) failed = true;
    else await Promise.resolve(settled.output);
  } catch {
    failed = true;
  }
  return { seen: r.seen, failed };
}

type Target = { op: string; input: Record<string, unknown>; fields: string[]; url: string };

async function discover(): Promise<Target[]> {
  const targets: Target[] = [];
  for (const [op, spec] of Object.entries(ops)) {
    if (spec.kind !== "action") continue;
    counter = 0;
    const sentinels: Record<string, string> = {};
    const input = gen(spec.inputSchema ?? { type: "object" }, sentinels, "") as Record<string, unknown>;
    const base = await call(op, input);
    const first = base.seen[0];
    if (!first) continue;
    const pathname = new URL(first.url).pathname;
    const fields = Object.entries(sentinels)
      .filter(([p, s]) => pathname.includes(s) && !p.includes("[0]") && !p.includes("."))
      .map(([p]) => p);
    if (fields.length > 0) targets.push({ op, input, fields, url: first.url });
  }
  return targets;
}

const BAD = ["..", "%2e%2e", "%2E.", ".", "\\", "a\\b", "", " ", " \t"];
const SLASH_BAD = ["a/../b", "a/%2e%2e/b", "../a", "a/."];
const GOOD = ["v1.2", "foo.bar", "a-b_c.d"];

describe("FIX-SEGMENT amend: every path param of every op is guarded (generator)", () => {
  let targets: Target[] = [];

  test("generator finds the path-param ops and covers all 265 recount ops", async () => {
    targets = await discover();
    const covered = new Set(targets.map((t) => t.op));
    expect(targets.length).toBeGreaterThanOrEqual(664); // PRUNE-2 (0.83.0): exactly 664 path-param targets after the P2 removals (no P2 op is in the 265 recount list)
    expect((listedOps as string[]).length).toBe(265);
    expect((listedOps as string[]).filter((op) => !covered.has(op))).toEqual([]);
  }, 120000);

  test("bad values in any path param: validation error and 0 fetches", async () => {
    const leaks: string[] = [];
    for (const t of targets) {
      for (const field of t.fields) {
        const slashAccepted = (await call(t.op, { ...t.input, [field]: "feature/x" })).seen.length > 0;
        for (const value of [...BAD, ...(slashAccepted ? SLASH_BAD : [])]) {
          const c = await call(t.op, { ...t.input, [field]: value });
          if (c.seen.length > 0 || !c.failed) leaks.push(`${t.op}.${field}=${JSON.stringify(value)} -> ${c.seen[0]?.url ?? "no error"}`);
        }
      }
    }
    expect(leaks).toEqual([]);
  }, 300000);

  test("dotted but valid values still reach GitHub unchanged", async () => {
    const rejected: string[] = [];
    for (const t of targets) {
      for (const field of t.fields) {
        for (const value of GOOD) {
          const c = await call(t.op, { ...t.input, [field]: value });
          if (c.seen.length === 0) rejected.push(`${t.op}.${field}=${value}`);
          else if (!c.seen[0]!.url.includes(value)) rejected.push(`${t.op}.${field}=${value} -> ${c.seen[0]!.url}`);
        }
      }
    }
    expect(rejected).toEqual([]);
  }, 300000);

  test("recount examples: issues.get owner '..', repos.get repo '..', branches.delete branch '..'", async () => {
    for (const [op, input] of [
      ["issues.get", { owner: "..", repo: "r", issueNumber: 7 }],
      ["repos.get", { owner: "o", repo: ".." }],
      ["branches.delete", { owner: "o", repo: "r", branch: ".." }],
      ["branches.delete", { owner: "o", repo: "r", branch: "a/../b" }],
      ["issues.labels.remove", { owner: "o", repo: "r", issueNumber: 7, labels: [".."] }],
      ["repos.compare", { owner: "o", repo: "r", base: "..", head: "main" }],
    ] as const) {
      const c = await call(op, input as Record<string, unknown>);
      expect({ op, fetches: c.seen.length, failed: c.failed }).toEqual({ op, fetches: 0, failed: true });
    }
    const ok = await call("branches.get", { owner: "o", repo: "r", branch: "feature/v1.2" });
    expect(ok.seen.map((s) => s.url)).toEqual(["https://api.github.com/repos/o/r/branches/feature%2Fv1.2"]);
  });
});

describe("assertSafeRequestPath (the fetch choke point)", () => {
  test("valid paths are returned unchanged", () => {
    for (const p of ["/", "/repos/o/r", "/repos/o/r/branches/feature%2Fx?per_page=1", "/repos/o/r/compare/v1.2...main", "/user", "https://uploads.github.com/repos/o/r/releases/1/assets?name=a..b"]) {
      expect(assertSafeRequestPath(p)).toBe(p);
    }
  });
  test("dot, %2e, blank, empty and backslash segments throw", () => {
    for (const p of ["/repos/../r", "/repos/./r", "/repos/.../r", "/repos/%2e%2e/r", "/repos/%2E./r", "/repos/o/r/", "/repos//r", "/repos/%20/r", "/repos/%20%09/r", "/repos/a\\b/r", "/repos/a%5Cb/r", "/repos/o/r/branches/a%2F..%2Fb", "/repos/o/r/branches/a%2F%252e%252e%2Fb", "https://api.github.com/repos/../x"]) {
      expect(() => assertSafeRequestPath(p)).toThrow(/GitHub request path/);
    }
  });
  test("single-segment and ref helpers reject blank values", () => {
    for (const v of ["", " ", " \t"]) {
      expect(() => requireSingleSegment(v, "owner")).toThrow("owner is required");
      expect(() => requireRefComponents(v, "base")).toThrow("base is required");
    }
    expect(requireRefComponents("feature/v1.2", "base")).toBe("feature/v1.2");
    expect(() => requireRefComponents("a/%2e%2e/b", "base")).toThrow(/"\."/);
  });
});
