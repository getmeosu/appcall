import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const actionKeys = Object.entries(manifest.operations)
  .filter(([, operation]) => (operation as { kind?: string }).kind === "action")
  .map(([key]) => key);

const caseDir = new URL("../fixtures/cases", import.meta.url).pathname;
const { actions } = compileDeclarativeConnector(manifest);

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

function loadFixtureCases(dir: string): FixtureCase[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => JSON.parse(readFileSync(resolve(dir, name), "utf8")) as FixtureCase);
}

function sameUrl(actual: string, expected: string): boolean {
  const left = new URL(actual);
  const right = new URL(expected);
  if (left.protocol !== right.protocol || left.host !== right.host || left.pathname !== right.pathname) return false;
  const query = (url: URL) => [...url.searchParams.entries()].sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
  return JSON.stringify(query(left)) === JSON.stringify(query(right));
}

describe("BoxHero depth fixtures", () => {
  it("replays authenticated fixture cases", async () => {
    const cases = loadFixtureCases(caseDir);
    expect(cases.length).toBeGreaterThan(0);
    for (const fixture of cases) {
      let index = 0;
      const fetchStub = async (input: RequestInfo | URL, init?: RequestInit) => {
        const exchange = fixture.exchanges[index++];
        expect(exchange, `${fixture.id} extra request`).toBeTruthy();
        const method = String(init?.method ?? "GET").toUpperCase();
        expect(method, fixture.id).toBe(exchange.request.method.toUpperCase());
        expect(sameUrl(String(input), exchange.request.url), `${fixture.id} ${String(input)}`).toBe(true);
        const body = init?.body == null ? null : String(init.body);
        expect(body, fixture.id).toBe(exchange.request.body);
        const got = new Headers(init?.headers);
        const want = new Headers(exchange.request.headers ?? {});
        for (const [key, value] of want) expect(got.get(key), `${fixture.id} header ${key}`).toBe(value);
        for (const [key] of got) {
          if (key === "content-length") continue;
          expect(want.has(key), `${fixture.id} unexpected header ${key}`).toBe(true);
        }
        const raw = readFileSync(resolve(caseDir, exchange.response.bodyFile));
        return new Response(raw, { status: exchange.response.status, headers: exchange.response.headers });
      };
      const action = actions[fixture.operation];
      expect(action, fixture.operation).toBeTypeOf("function");
      let rejected: { code?: string } | undefined;
      let result: unknown;
      try {
        result = await action!({ ...fixture.input, ...fixture.credentials, fetch: fetchStub });
      } catch (error) {
        rejected = error as { code?: string };
      }
      expect(index, fixture.id).toBe(fixture.exchanges.length);
      if (fixture.expected.kind === "error") {
        expect(rejected?.code, fixture.id).toBe(fixture.expected.code);
        continue;
      }
      expect(rejected, fixture.id).toBeUndefined();
      const expected = JSON.parse(readFileSync(resolve(caseDir, fixture.expected.resultFile), "utf8"));
      expect(result, fixture.id).toEqual(expected);
    }
  });

  it("covers every declared action with a positive fixture and skips EventOnly webhooks", () => {
    const cases = loadFixtureCases(caseDir);
    const positive = new Set(cases.filter((c) => c.expected.kind === "success").map((c) => c.operation));
    expect([...positive].sort()).toEqual([...actionKeys].sort());
    for (const key of Object.keys(manifest.operations)) {
      if (key.startsWith("webhook.")) {
        expect(positive.has(key)).toBe(false);
      }
    }
  });
});
