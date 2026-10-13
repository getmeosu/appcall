import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const compiled = compileDeclarativeConnector(manifest as never);
const caseDir = join(import.meta.dir, "../fixtures/cases");
const files = readdirSync(caseDir).filter((name) => name.endsWith(".json")).sort();

function sameUrl(a: string, b: string): boolean {
  const x = new URL(a);
  const y = new URL(b);
  if (x.protocol !== y.protocol || x.host !== y.host || x.pathname !== y.pathname) return false;
  const query = (url: URL) => [...url.searchParams.entries()].sort((left, right) => left[0].localeCompare(right[0]) || left[1].localeCompare(right[1]));
  return JSON.stringify(query(x)) === JSON.stringify(query(y));
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, index) => deepEqual(value, b[index]));
  }
  if (a && b && typeof a === "object") {
    const left = Object.keys(a as object);
    const right = Object.keys(b as object);
    return left.length === right.length && left.every((key) => Object.hasOwn(b as object, key) && deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
  }
  return false;
}

type FixtureCase = {
  id: string;
  operation: string;
  input: Record<string, unknown>;
  credentials: Record<string, string>;
  exchanges: Array<{
    request: { method: string; url: string; headers?: Record<string, string>; body: string | null };
    response: { status: number; headers?: Record<string, string>; bodyFile: string };
  }>;
  expected: { kind: "success"; resultFile: string } | { kind: "error"; code: string };
};

function loadCase(file: string): FixtureCase {
  return JSON.parse(readFileSync(join(caseDir, file), "utf8")) as FixtureCase;
}

describe("heyy fixtures", () => {
  for (const file of files) {
    test(file, async () => {
      const raw = loadCase(file);
      const action = compiled.actions[raw.operation];
      expect(action, raw.id).toBeTypeOf("function");
      let index = 0;
      let assertion: string | undefined;
      const fetchStub = async (input: RequestInfo | URL, init?: RequestInit) => {
        const expected = raw.exchanges[index++];
        if (!expected) {
          assertion = `${raw.id}: extra request`;
          throw new Error(assertion);
        }
        const url = String(input);
        const method = String(init?.method ?? "GET").toUpperCase();
        if (method !== expected.request.method.toUpperCase() || !sameUrl(url, expected.request.url)) {
          assertion = `${raw.id}: ${method} ${url} != ${expected.request.method} ${expected.request.url}`;
          throw new Error(assertion);
        }
        const body = init?.body == null ? null : String(init.body);
        if (body !== expected.request.body) {
          assertion = `${raw.id}: body ${body} != ${expected.request.body}`;
          throw new Error(assertion);
        }
        const got = new Headers(init?.headers);
        const wanted = new Headers(expected.request.headers ?? {});
        for (const [header, value] of wanted) {
          if (got.get(header) !== value) {
            assertion = `${raw.id}: header ${header}=${got.get(header)} != ${value}`;
            throw new Error(assertion);
          }
        }
        for (const [header] of got) {
          if (!wanted.has(header) && header !== "content-length") {
            assertion = `${raw.id}: unexpected header ${header}`;
            throw new Error(assertion);
          }
        }
        const bytes = readFileSync(join(dirname(join(caseDir, file)), expected.response.bodyFile));
        return new Response(bytes, { status: expected.response.status, headers: expected.response.headers });
      };
      let result: unknown;
      let rejected: { code?: string } | undefined;
      try {
        result = await action!({ ...raw.input, ...raw.credentials, fetch: fetchStub });
      } catch (error) {
        rejected = error as { code?: string };
      }
      if (assertion) throw new Error(assertion);
      expect(index, raw.id).toBe(raw.exchanges.length);
      if (raw.expected.kind === "error") {
        expect(rejected?.code, raw.id).toBe(raw.expected.code);
        return;
      }
      expect(rejected, raw.id).toBeUndefined();
      const expected = JSON.parse(readFileSync(join(dirname(join(caseDir, file)), raw.expected.resultFile), "utf8"));
      expect(deepEqual(result, expected), `${raw.id} ${JSON.stringify(result)}`).toBe(true);
    });
  }

  test("covers every action with one success fixture", () => {
    const positive = new Set(files.map(loadCase).filter((item) => item.expected.kind === "success").map((item) => item.operation));
    const actions = Object.entries(manifest.operations)
      .filter(([, operation]) => (operation as { kind?: string }).kind === "action")
      .map(([key]) => key);
    expect([...positive].sort()).toEqual([...actions].sort());
    const v2Success = [...positive].filter((key) => key.startsWith("v2."));
    expect(v2Success).toHaveLength(13);
  });
});
