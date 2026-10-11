import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

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
  expected: { kind: "success"; resultFile: string } | { kind: "error"; code: string };
};

const { actions } = compileDeclarativeConnector(manifest as never);
const casesDir = join(import.meta.dir, "../fixtures/cases");

function loadCases(): FixtureCase[] {
  return readdirSync(casesDir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => JSON.parse(readFileSync(join(casesDir, name), "utf8")) as FixtureCase);
}

function sameUrl(a: string, b: string): boolean {
  const x = new URL(a);
  const y = new URL(b);
  if (x.protocol !== y.protocol || x.host !== y.host || x.pathname !== y.pathname) return false;
  const q = (u: URL) => [...u.searchParams.entries()].sort((l, r) => l[0].localeCompare(r[0]) || l[1].localeCompare(r[1]));
  return JSON.stringify(q(x)) === JSON.stringify(q(y));
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ak = Object.keys(a as object);
    const bk = Object.keys(b as object);
    return ak.length === bk.length && ak.every((k) => Object.hasOwn(b as object, k) && deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  return false;
}

describe("bookingmood compiled actions", () => {
  it("compiles one handler per action", () => {
    const actionKeys = Object.entries(manifest.operations)
      .filter(([, operation]) => (operation as { kind?: string }).kind !== "webhook")
      .map(([key]) => key)
      .sort();
    expect(Object.keys(actions).sort()).toEqual(actionKeys);
  });
});

describe("bookingmood fixture replay", () => {
  const cases = loadCases();
  it("has a fixture for every action", () => {
    const actionKeys = Object.entries(manifest.operations)
      .filter(([, operation]) => (operation as { kind?: string }).kind !== "webhook")
      .map(([key]) => key);
    expect(new Set(cases.map((fixture) => fixture.operation))).toEqual(new Set(actionKeys));
  });

  it("replays every fixture case", async () => {
    for (const fixture of cases) {
      const action = actions[fixture.operation];
      expect(action, fixture.id).toBeDefined();
      let index = 0;
      const fetchStub = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const expected = fixture.exchanges[index++];
        if (!expected) throw new Error(`${fixture.id}: unexpected extra request`);
        const url = String(input);
        const method = String(init?.method ?? "GET").toUpperCase();
        if (method !== expected.request.method.toUpperCase() || !sameUrl(url, expected.request.url)) {
          throw new Error(`${fixture.id}: request mismatch ${method} ${url} vs ${expected.request.method} ${expected.request.url}`);
        }
        const body = init?.body == null ? null : String(init.body);
        if (body !== expected.request.body) {
          throw new Error(`${fixture.id}: body mismatch ${body} vs ${expected.request.body}`);
        }
        const gotHeaders = new Headers(init?.headers);
        const expectedHeaders = new Headers(expected.request.headers ?? {});
        for (const [key, value] of expectedHeaders) {
          if (gotHeaders.get(key) !== value) throw new Error(`${fixture.id}: header mismatch ${key}`);
        }
        for (const [key] of gotHeaders) {
          if (!expectedHeaders.has(key) && key !== "content-length") {
            throw new Error(`${fixture.id}: unexpected header ${key}`);
          }
        }
        const bodyBytes = readFileSync(join(dirname(join(casesDir, `${fixture.id}.json`)), expected.response.bodyFile));
        return new Response(bodyBytes, { status: expected.response.status, headers: expected.response.headers });
      };
      const payload = { ...fixture.input, ...fixture.credentials, fetch: fetchStub };
      if (fixture.expected.kind === "error") {
        try {
          await action!(payload);
          throw new Error(`${fixture.id}: expected ${fixture.expected.code}`);
        } catch (error) {
          expect((error as { code?: string }).code, fixture.id).toBe(fixture.expected.code);
        }
        continue;
      }
      const result = await action!(payload);
      const expected = JSON.parse(readFileSync(join(casesDir, fixture.expected.resultFile), "utf8"));
      if (!deepEqual(result, expected)) {
        throw new Error(`${fixture.id}: result mismatch ${JSON.stringify(result)} vs ${JSON.stringify(expected)}`);
      }
      expect(index).toBe(fixture.exchanges.length);
    }
  });
});
