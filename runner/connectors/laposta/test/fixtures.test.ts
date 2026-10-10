import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import { handwritten } from "../src/actions";
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

describe("laposta fixture cases", () => {
  const compiled = compileDeclarativeConnector(manifest as never);
  const actions = { ...compiled.actions, ...handwritten };
  const cases = loadCases();
  const operationKeys = Object.keys(manifest.operations).sort();

  it("covers every HTTP action with a positive success exchange", () => {
    const covered = new Set(
      cases.filter((item) => item.expected.kind === "success" && item.exchanges.length > 0).map((item) => item.operation),
    );
    expect([...covered].sort()).toEqual(operationKeys);
  });

  it("replays every pinned fixture without network", async () => {
    expect(cases.length).toBeGreaterThanOrEqual(operationKeys.length);
    for (const item of cases) {
      let index = 0;
      const fetchStub: typeof fetch = async (input, init) => {
        const expectedExchange = item.exchanges[index++];
        if (!expectedExchange) throw new Error(`${item.id}: unexpected extra request`);
        const url = String(input);
        const method = String(init?.method ?? "GET").toUpperCase();
        if (method !== expectedExchange.request.method.toUpperCase() || !sameUrl(url, expectedExchange.request.url)) {
          throw new Error(
            `${item.id}: request method or URL mismatch ${method} ${url} != ${expectedExchange.request.method} ${expectedExchange.request.url}`,
          );
        }
        const body = init?.body == null ? null : String(init.body);
        if (body !== expectedExchange.request.body) {
          throw new Error(`${item.id}: request body mismatch ${body} != ${expectedExchange.request.body}`);
        }
        const gotHeaders = new Headers(init?.headers);
        const expectedHeaders = new Headers(expectedExchange.request.headers ?? {});
        for (const [key, value] of expectedHeaders) {
          if (gotHeaders.get(key) !== value) {
            throw new Error(`${item.id}: request header mismatch ${key}: ${gotHeaders.get(key)} != ${value}`);
          }
        }
        for (const [key] of gotHeaders) {
          if (!expectedHeaders.has(key) && key !== "content-length") {
            throw new Error(`${item.id}: unexpected request header ${key}`);
          }
        }
        const bodyBytes = readFileSync(join(dirname(join(casesDir, "x")), expectedExchange.response.bodyFile));
        return new Response(bodyBytes, {
          status: expectedExchange.response.status,
          headers: expectedExchange.response.headers,
        });
      };

      const action = actions[item.operation];
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
