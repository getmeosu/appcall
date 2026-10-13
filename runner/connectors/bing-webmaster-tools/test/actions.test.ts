import { describe, expect, it } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const caseDir = new URL("../fixtures/cases", import.meta.url).pathname;
const fixtureRoot = new URL("../fixtures", import.meta.url).pathname;

const actionKeys = Object.entries(manifest.operations)
  .filter(([, operation]) => (operation as { kind?: string }).kind === "action")
  .map(([key]) => key);

type SuccessCase = {
  id: string;
  operation: string;
  input: Record<string, unknown>;
  credentials: Record<string, string>;
  exchanges: Array<{
    request: { method: string; url: string; headers?: Record<string, string>; body: null | string };
    response: { status: number; headers?: Record<string, string>; bodyFile: string };
  }>;
  expected: { kind: string; resultFile: string };
  file: string;
};

function loadCases(): SuccessCase[] {
  return readdirSync(caseDir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => {
      const file = join(caseDir, name);
      const parsed = JSON.parse(readFileSync(file, "utf8")) as SuccessCase;
      return { ...parsed, file };
    });
}

function readFixture(fromFile: string, relativePath: string): unknown {
  const path = join(dirname(fromFile), relativePath);
  if (!path.startsWith(fixtureRoot)) {
    throw new Error(`fixture path escapes fixtures: ${relativePath}`);
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

describe("Bing Webmaster Tools depth fixtures", () => {
  it("replays authenticated fixture cases", async () => {
    const { actions } = compileDeclarativeConnector(manifest);
    const cases = loadCases();
    expect(cases.length).toBeGreaterThan(0);
    for (const fixture of cases) {
      let index = 0;
      const action = actions[fixture.operation];
      expect(action, fixture.id).toBeTypeOf("function");
      const result = await action!({
        ...fixture.input,
        ...fixture.credentials,
        fetch: async (input: unknown, init?: { method?: string; headers?: HeadersInit; body?: unknown }) => {
          const exchange = fixture.exchanges[index];
          index += 1;
          expect(exchange, fixture.id).toBeDefined();
          expect(String(init?.method ?? "GET").toUpperCase(), fixture.id).toBe(exchange.request.method.toUpperCase());
          expect(String(input), fixture.id).toBe(exchange.request.url);
          const body = init?.body == null ? null : String(init.body);
          expect(body, fixture.id).toBe(exchange.request.body);
          const got = new Headers(init?.headers);
          const expectedHeaders = new Headers(exchange.request.headers ?? {});
          for (const [key, value] of expectedHeaders) {
            expect(got.get(key), `${fixture.id} ${key}`).toBe(value);
          }
          for (const [key] of got) {
            if (key === "content-length") continue;
            expect(expectedHeaders.has(key), `${fixture.id} unexpected header ${key}`).toBe(true);
          }
          const payload = readFixture(fixture.file, exchange.response.bodyFile);
          return new Response(JSON.stringify(payload), {
            status: exchange.response.status,
            headers: exchange.response.headers,
          });
        },
      });
      expect(index, fixture.id).toBe(fixture.exchanges.length);
      expect(result, fixture.id).toEqual(readFixture(fixture.file, fixture.expected.resultFile));
    }
  });

  it("covers every declared action with one success fixture", () => {
    const cases = loadCases();
    const positive = new Set(cases.filter((fixture) => fixture.expected.kind === "success").map((fixture) => fixture.operation));
    expect([...positive].sort()).toEqual([...actionKeys].sort());
  });
});
