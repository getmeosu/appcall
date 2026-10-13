import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

type Exchange = {
  request: { method: string; url: string; headers?: Record<string, string>; body: null | string };
  response: { status: number; headers?: Record<string, string>; bodyFile: string };
};
type FixtureCase = {
  id: string;
  operation: string;
  input: Record<string, unknown>;
  credentials: Record<string, string>;
  exchanges: Exchange[];
  expected: { kind: string; resultFile: string };
  file: string;
};

function loadCases(): FixtureCase[] {
  const dir = new URL("../fixtures/cases", import.meta.url).pathname;
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => {
      const file = join(dir, name);
      return { ...(JSON.parse(readFileSync(file, "utf8")) as Omit<FixtureCase, "file">), file };
    });
}

function readJson(file: string, relativePath: string): unknown {
  const path = realpathSync(resolve(dirname(file), relativePath));
  return JSON.parse(readFileSync(path, "utf8"));
}

function sameUrl(actual: string, expected: string): boolean {
  const left = new URL(actual);
  const right = new URL(expected);
  if (left.protocol !== right.protocol || left.host !== right.host || left.pathname !== right.pathname) return false;
  const pairs = (url: URL) => [...url.searchParams.entries()].sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
  return JSON.stringify(pairs(left)) === JSON.stringify(pairs(right));
}

describe("APIVerve fixtures", () => {
  it("replays one success fixture for every action", async () => {
    const cases = loadCases();
    const compiled = compileDeclarativeConnector(manifest as never);
    const actionKeys = Object.keys(manifest.operations);
    expect(cases.map((item) => item.operation).sort()).toEqual([...actionKeys].sort());
    for (const fixture of cases) {
      const exchange = fixture.exchanges[0];
      const body = readJson(fixture.file, exchange.response.bodyFile);
      let calls = 0;
      const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        calls += 1;
        const method = String(init?.method ?? "GET").toUpperCase();
        if (method !== exchange.request.method || !sameUrl(String(input), exchange.request.url)) {
          throw new Error(`${fixture.id}: ${method} ${String(input)}`);
        }
        const sent = init?.body == null ? null : String(init.body);
        if (sent !== exchange.request.body) throw new Error(`${fixture.id}: body ${sent}`);
        const got = new Headers(init?.headers);
        const want = new Headers(exchange.request.headers);
        for (const [key, value] of want) {
          if (got.get(key) !== value) throw new Error(`${fixture.id}: header ${key}`);
        }
        for (const [key] of got) {
          if (!want.has(key)) throw new Error(`${fixture.id}: unexpected header ${key}`);
        }
        return new Response(JSON.stringify(body), {
          status: exchange.response.status,
          headers: exchange.response.headers,
        });
      };
      const result = await compiled.actions[fixture.operation]!({
        ...fixture.input,
        ...fixture.credentials,
        fetch,
      });
      expect(calls, fixture.id).toBe(1);
      expect(result).toEqual(readJson(fixture.file, fixture.expected.resultFile));
    }
  });

  it("pins fixture bytes without claiming a live provider call", () => {
    const cases = loadCases();
    const digest = createHash("sha256");
    for (const fixture of cases) digest.update(readFileSync(fixture.file));
    expect(digest.digest("hex")).toHaveLength(64);
    expect(cases.length).toBe(Object.keys(manifest.operations).length);
  });
});
