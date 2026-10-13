import { describe, expect, it } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

type FixtureCase = {
  id: string;
  operation: string;
  input: Record<string, unknown>;
  credentials: Record<string, string>;
  exchanges: Array<{
    request: { method: string; url: string; headers?: Record<string, string>; body: string | null };
    response: { status: number; headers?: Record<string, string>; bodyFile: string };
  }>;
  expected: { kind: string; resultFile?: string };
};

const caseDir = fileURLToPath(new URL("../fixtures/cases", import.meta.url));

function loadCases(): FixtureCase[] {
  return readdirSync(caseDir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => JSON.parse(readFileSync(join(caseDir, name), "utf8")) as FixtureCase);
}

function sameUrl(actual: string, expected: string): boolean {
  const left = new URL(actual);
  const right = new URL(expected);
  if (left.protocol !== right.protocol || left.host !== right.host || left.pathname !== right.pathname) return false;
  const query = (url: URL) => [...url.searchParams.entries()].sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
  return JSON.stringify(query(left)) === JSON.stringify(query(right));
}

function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => deepEqual(value, right[index]));
  }
  if (left && right && typeof left === "object" && typeof right === "object") {
    const leftKeys = Object.keys(left);
    const rightRecord = right as Record<string, unknown>;
    return leftKeys.length === Object.keys(rightRecord).length && leftKeys.every((key) => Object.hasOwn(rightRecord, key) && deepEqual((left as Record<string, unknown>)[key], rightRecord[key]));
  }
  return false;
}

describe("Donately depth fixtures", () => {
  it("replays authenticated fixture cases", async () => {
    const cases = loadCases();
    const { actions } = compileDeclarativeConnector(manifest);
    expect(cases.length).toBeGreaterThan(0);
    for (const fixture of cases) {
      let index = 0;
      const action = actions[fixture.operation];
      if (!action) throw new Error(`${fixture.id}: unknown operation`);
      const result = await action({
        ...fixture.input,
        ...fixture.credentials,
        fetch: async (input: unknown, init: { method?: string; headers?: HeadersInit; body?: unknown }) => {
          const expected = fixture.exchanges[index];
          index += 1;
          if (!expected) throw new Error(`${fixture.id}: unexpected extra request`);
          const method = String(init?.method ?? "GET").toUpperCase();
          if (method !== expected.request.method.toUpperCase() || !sameUrl(String(input), expected.request.url)) {
            throw new Error(`${fixture.id}: request method or URL mismatch (${method} ${String(input)})`);
          }
          const body = init?.body == null ? null : String(init.body);
          if (body !== expected.request.body) throw new Error(`${fixture.id}: request body mismatch (${body})`);
          const got = new Headers(init?.headers);
          const wanted = new Headers(expected.request.headers ?? {});
          for (const [name, value] of wanted) {
            if (got.get(name) !== value) throw new Error(`${fixture.id}: request header mismatch: ${name}`);
          }
          for (const [name] of got) {
            if (!wanted.has(name) && name !== "content-length") throw new Error(`${fixture.id}: unexpected request header: ${name}`);
          }
          const file = join(dirname(join(caseDir, `${fixture.id}.json`)), expected.response.bodyFile);
          return new Response(readFileSync(file), { status: expected.response.status, headers: expected.response.headers });
        },
      });
      if (index !== fixture.exchanges.length) throw new Error(`${fixture.id}: unconsumed exchange`);
      const expected = JSON.parse(readFileSync(join(dirname(join(caseDir, `${fixture.id}.json`)), fixture.expected.resultFile!), "utf8"));
      if (!deepEqual(result, expected)) throw new Error(`${fixture.id}: result mismatch ${JSON.stringify(result)}`);
    }
  });

  it("covers every declared action with one success fixture", () => {
    const cases = loadCases();
    const actionKeys = Object.entries(manifest.operations)
      .filter(([, operation]) => (operation as { kind?: string }).kind === "action")
      .map(([key]) => key);
    const positive = [...new Set(cases.filter((fixture) => fixture.expected.kind === "success").map((fixture) => fixture.operation))];
    expect(positive.sort()).toEqual([...actionKeys].sort());
    const ids = cases.map((fixture) => fixture.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
