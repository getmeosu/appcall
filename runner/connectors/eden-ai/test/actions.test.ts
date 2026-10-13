import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const actionKeys = Object.entries(manifest.operations)
  .filter(([, operation]) => (operation as { kind?: string }).kind === "action")
  .map(([key]) => key);

type FixtureCase = {
  id: string;
  operation: string;
  input: Record<string, unknown>;
  credentials: Record<string, string>;
  exchanges: Array<{
    request: { method: string; url: string; headers?: Record<string, string>; body: null | string };
    response: { status: number; headers?: Record<string, string>; bodyFile: string };
  }>;
  expected: { kind: string; resultFile: string };
  _file: string;
};

function loadCases(dir: string): FixtureCase[] {
  return readdirSync(dir).filter((file) => file.endsWith(".json")).sort().map((file) => {
    const path = join(dir, file);
    return { ...JSON.parse(readFileSync(path, "utf8")), _file: path };
  });
}

function sameUrl(actual: string, expected: string): boolean {
  const left = new URL(actual);
  const right = new URL(expected);
  if (left.protocol !== right.protocol || left.host !== right.host || left.pathname !== right.pathname) return false;
  const query = (url: URL) => [...url.searchParams.entries()].sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
  return JSON.stringify(query(left)) === JSON.stringify(query(right));
}

describe("Eden AI depth fixtures", () => {
  it("replays authenticated fixture cases", async () => {
    const cases = loadCases(new URL("../fixtures/cases", import.meta.url).pathname);
    const compiled = compileDeclarativeConnector(JSON.parse(JSON.stringify(manifest)) as never);
    expect(cases.length).toBeGreaterThan(0);
    for (const fixture of cases) {
      let index = 0;
      const fetchStub = async (input: RequestInfo, init?: RequestInit) => {
        const expected = fixture.exchanges[index++];
        if (!expected) throw new Error(`${fixture.id}: unexpected extra request`);
        const url = String(input);
        const method = String(init?.method ?? "GET").toUpperCase();
        if (method !== expected.request.method.toUpperCase() || !sameUrl(url, expected.request.url)) {
          throw new Error(`${fixture.id}: request mismatch got ${method} ${url} expected ${expected.request.method} ${expected.request.url}`);
        }
        const body = init?.body == null ? null : String(init.body);
        if (body !== expected.request.body) {
          throw new Error(`${fixture.id}: body mismatch got ${body} expected ${expected.request.body}`);
        }
        const got = new Headers(init?.headers);
        const want = new Headers(expected.request.headers ?? {});
        for (const [key, value] of want) {
          if (got.get(key) !== value) throw new Error(`${fixture.id}: header ${key} got ${got.get(key)} expected ${value}`);
        }
        for (const [key] of got) {
          if (!want.has(key) && key !== "content-length") throw new Error(`${fixture.id}: unexpected header ${key}`);
        }
        const bytes = readFileSync(join(dirname(fixture._file), expected.response.bodyFile));
        return new Response(bytes, { status: expected.response.status, headers: expected.response.headers });
      };
      const action = compiled.actions[fixture.operation];
      if (!action) throw new Error(`${fixture.id}: unknown operation`);
      const result = await action({ ...fixture.input, ...fixture.credentials, fetch: fetchStub });
      if (index !== fixture.exchanges.length) throw new Error(`${fixture.id}: unconsumed exchange`);
      const expected = JSON.parse(readFileSync(join(dirname(fixture._file), fixture.expected.resultFile), "utf8"));
      expect(result, fixture.id).toEqual(expected);
    }
  });

  it("covers every declared action with a positive fixture and skips EventOnly webhooks", () => {
    const cases = loadCases(new URL("../fixtures/cases", import.meta.url).pathname);
    const positive = new Set(cases.filter((entry) => entry.expected.kind === "success").map((entry) => entry.operation));
    expect([...positive].sort()).toEqual([...actionKeys].sort());
    for (const key of Object.keys(manifest.operations)) {
      if (key.startsWith("webhook.")) expect(positive.has(key)).toBe(false);
    }
  });
});
