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
  expected:
    | { kind: "success"; resultFile: string }
    | { kind: "error"; code: string; retryAfterSeconds?: number };
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

describe("beaconchain fixture cases", () => {
  const compiled = compileDeclarativeConnector(manifest as never);
  const cases = loadCases();
  const operations = Object.keys(manifest.operations);

  it("covers every operation with a positive success exchange", () => {
    const covered = new Set(
      cases.filter((item) => item.expected.kind === "success" && item.exchanges.length > 0).map((item) => item.operation),
    );
    expect([...covered].sort()).toEqual([...operations].sort());
  });

  it("replays every pinned fixture without network", async () => {
    expect(cases.length).toBeGreaterThan(operations.length);
    for (const item of cases) {
      let index = 0;
      const fetchStub: typeof fetch = async (input, init) => {
        const expected = item.exchanges[index++];
        if (!expected) throw new Error(`${item.id}: unexpected extra request`);
        const url = String(input);
        const method = String(init?.method ?? "GET").toUpperCase();
        if (method !== expected.request.method.toUpperCase() || !sameUrl(url, expected.request.url)) {
          throw new Error(
            `${item.id}: request method or URL mismatch ${method} ${url} != ${expected.request.method} ${expected.request.url}`,
          );
        }
        const body = init?.body == null ? null : String(init.body);
        if (body !== expected.request.body) {
          throw new Error(`${item.id}: request body mismatch ${body} != ${expected.request.body}`);
        }
        const gotHeaders = new Headers(init?.headers);
        const expectedHeaders = new Headers(expected.request.headers ?? {});
        for (const [key, value] of expectedHeaders) {
          if (gotHeaders.get(key) !== value) {
            throw new Error(`${item.id}: request header mismatch ${key}: ${gotHeaders.get(key)} != ${value}`);
          }
        }
        const bodyBytes = readFileSync(join(dirname(join(casesDir, "x")), expected.response.bodyFile));
        return new Response(bodyBytes, { status: expected.response.status, headers: expected.response.headers });
      };

      const action = compiled.actions[item.operation];
      expect(action).toBeDefined();
      const payload = { ...item.input, ...item.credentials, fetch: fetchStub };
      if (item.expected.kind === "error") {
        try {
          await action(payload);
          throw new Error(`${item.id}: expected rejection ${item.expected.code}`);
        } catch (error) {
          expect((error as { code?: string }).code).toBe(item.expected.code);
        }
        continue;
      }
      const result = await action(payload);
      const expected = JSON.parse(readFileSync(join(dirname(join(casesDir, "x")), item.expected.resultFile), "utf8"));
      expect(result).toEqual(expected);
      expect(index).toBe(item.exchanges.length);
    }
  });
});
