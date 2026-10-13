import { describe, expect, it } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
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
  expected: { kind: string; resultFile?: string };
  _file: string;
};

function loadCases(): FixtureCase[] {
  const dir = new URL("../fixtures/cases", import.meta.url).pathname;
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => {
      const file = join(dir, name);
      return { ...JSON.parse(readFileSync(file, "utf8")), _file: file };
    });
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

describe("Blocknative depth fixtures", () => {
  it("replays authenticated fixture cases", async () => {
    const cases = loadCases();
    const { actions } = compileDeclarativeConnector(manifest as never);
    expect(cases.length).toBeGreaterThan(0);
    for (const fixture of cases) {
      let index = 0;
      const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
        const exchange = fixture.exchanges[index++];
        if (!exchange) throw new Error(`${fixture.id}: unexpected extra request`);
        const url = String(input);
        const method = String(init?.method ?? "GET").toUpperCase();
        if (method !== exchange.request.method.toUpperCase() || !sameUrl(url, exchange.request.url)) {
          throw new Error(`${fixture.id}: request mismatch ${method} ${url}`);
        }
        const body = init?.body == null ? null : String(init.body);
        if (body !== exchange.request.body) throw new Error(`${fixture.id}: body mismatch`);
        const got = new Headers(init?.headers);
        const expected = new Headers(exchange.request.headers ?? {});
        for (const [key, value] of expected) {
          if (got.get(key) !== value) throw new Error(`${fixture.id}: header mismatch ${key}`);
        }
        for (const [key] of got) {
          if (!expected.has(key) && key !== "content-length") throw new Error(`${fixture.id}: unexpected header ${key}`);
        }
        const payload = readFileSync(join(dirname(fixture._file), exchange.response.bodyFile));
        return new Response(payload, { status: exchange.response.status, headers: exchange.response.headers });
      };
      const action = actions[fixture.operation];
      if (!action) throw new Error(`${fixture.id}: unknown operation`);
      const result = await action({ ...fixture.input, ...fixture.credentials, fetch: fetchImpl });
      if (index !== fixture.exchanges.length) throw new Error(`${fixture.id}: unconsumed exchange`);
      const expected = JSON.parse(readFileSync(join(dirname(fixture._file), fixture.expected.resultFile!), "utf8"));
      if (!deepEqual(result, expected)) throw new Error(`${fixture.id}: result mismatch ${JSON.stringify(result)}`);
    }
  });

  it("covers every declared action with a positive fixture and skips EventOnly webhooks", () => {
    const cases = loadCases();
    const positive = new Set(cases.filter((c) => c.expected.kind === "success").map((c) => c.operation));
    expect([...positive].sort()).toEqual([...actionKeys].sort());
    for (const key of Object.keys(manifest.operations)) {
      if (key.startsWith("webhook.")) expect(positive.has(key)).toBe(false);
    }
  });
});
