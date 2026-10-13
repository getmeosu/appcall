import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const fixturesRoot = join(import.meta.dir, "../fixtures");
const casesDir = join(fixturesRoot, "cases");

type Exchange = {
  request: { method: string; url: string; headers?: Record<string, string>; body: string | null };
  response: { status: number; headers?: Record<string, string>; bodyFile: string };
};

type FixtureCase = {
  id: string;
  operation: string;
  input: Record<string, unknown>;
  credentials: Record<string, string>;
  exchanges: Exchange[];
  expected: { kind: "success"; resultFile: string };
};

function loadCases(): FixtureCase[] {
  return readdirSync(casesDir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => JSON.parse(readFileSync(join(casesDir, name), "utf8")) as FixtureCase);
}

function sameUrl(left: string, right: string): boolean {
  const a = new URL(left);
  const b = new URL(right);
  if (a.protocol !== b.protocol || a.host !== b.host || a.pathname !== b.pathname) return false;
  const query = (url: URL) =>
    [...url.searchParams.entries()].sort((x, y) => x[0].localeCompare(y[0]) || x[1].localeCompare(y[1]));
  return JSON.stringify(query(a)) === JSON.stringify(query(b));
}

describe("BlueFox Email fixtures", () => {
  const compiled = compileDeclarativeConnector(manifest as never);
  const cases = loadCases();
  const operations = Object.keys(manifest.operations);

  it("covers every action with one success fixture", () => {
    const covered = cases.filter((item) => item.expected.kind === "success").map((item) => item.operation);
    expect([...covered].sort()).toEqual([...operations].sort());
    expect(new Set(covered).size).toBe(covered.length);
  });

  it("replays pinned JSON fixtures without a live provider call", async () => {
    expect(cases.length).toBe(operations.length);
    for (const item of cases) {
      let index = 0;
      const fetchStub: typeof fetch = async (input, init) => {
        const expected = item.exchanges[index++];
        if (!expected) throw new Error(`${item.id}: unexpected extra request`);
        const url = String(input);
        const method = String(init?.method ?? "GET").toUpperCase();
        if (method !== expected.request.method.toUpperCase() || !sameUrl(url, expected.request.url)) {
          throw new Error(`${item.id}: ${method} ${url} != ${expected.request.method} ${expected.request.url}`);
        }
        const body = init?.body == null ? null : String(init.body);
        if (body !== expected.request.body) throw new Error(`${item.id}: body ${body} != ${expected.request.body}`);
        const gotHeaders = new Headers(init?.headers);
        const expectedHeaders = new Headers(expected.request.headers ?? {});
        for (const [key, value] of expectedHeaders) {
          if (gotHeaders.get(key) !== value) throw new Error(`${item.id}: header ${key} ${gotHeaders.get(key)} != ${value}`);
        }
        for (const [key] of gotHeaders) {
          if (!expectedHeaders.has(key)) throw new Error(`${item.id}: unexpected header ${key}`);
        }
        const payload = readFileSync(join(dirname(join(casesDir, "x")), expected.response.bodyFile));
        return new Response(payload, { status: expected.response.status, headers: expected.response.headers });
      };
      const action = compiled.actions[item.operation];
      expect(action, item.operation).toBeDefined();
      const result = await action!({ ...item.input, ...item.credentials, fetch: fetchStub });
      const expected = JSON.parse(readFileSync(join(dirname(join(casesDir, "x")), item.expected.resultFile), "utf8"));
      expect(result).toEqual(expected);
      expect(index).toBe(item.exchanges.length);
    }
  });
});
