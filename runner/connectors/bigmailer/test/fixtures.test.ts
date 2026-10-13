import { expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import { createSuppressionList } from "../src/actions";
import manifest from "../manifest.json";

const casesDir = resolve(import.meta.dir, "../fixtures/cases");
const operations = manifest.operations as Record<string, { kind?: string; sideEffect?: string }>;

type FixtureCase = {
  id: string;
  operation: string;
  input: Record<string, unknown>;
  credentials: Record<string, string>;
  exchanges: Array<{
    request: { method: string; url: string; headers: Record<string, string>; body: string | null };
    response: { status: number; bodyFile: string };
  }>;
  expected: { kind: string; resultFile?: string; code?: string };
};

const cases = readdirSync(casesDir)
  .filter((name) => name.endsWith(".json"))
  .sort()
  .map((name) => JSON.parse(readFileSync(resolve(casesDir, name), "utf8")) as FixtureCase);

function headerMap(headers: HeadersInit | undefined): Record<string, string> {
  return Object.fromEntries(new Headers(headers).entries());
}

function sameJson(actual: unknown, expected: unknown): boolean {
  if (actual === expected) return true;
  if (Array.isArray(actual) || Array.isArray(expected)) {
    if (!Array.isArray(actual) || !Array.isArray(expected) || actual.length !== expected.length) return false;
    return actual.every((item, index) => sameJson(item, expected[index]));
  }
  if (isRecord(actual) && isRecord(expected)) {
    const actualKeys = Object.keys(actual);
    const expectedKeys = Object.keys(expected);
    if (actualKeys.length !== expectedKeys.length) return false;
    return actualKeys.every((key) => sameJson(actual[key], expected[key]));
  }
  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sameBody(actual: string | null, expected: string | null): boolean {
  if (actual === null || expected === null) return actual === expected;
  return sameJson(JSON.parse(actual), JSON.parse(expected));
}

test("every non-webhook operation has one success fixture", () => {
  const successOps = new Set(cases.filter((fixture) => fixture.expected.kind === "success").map((fixture) => fixture.operation));
  for (const [key, operation] of Object.entries(operations)) {
    if (operation.kind === "webhook") {
      expect(operation.sideEffect, key).toBe("read");
      continue;
    }
    expect(successOps.has(key), key).toBe(true);
  }
});

test("fixture requests stay on api.bigmailer.io with a null or compact JSON body", () => {
  for (const fixture of cases) {
    if (fixture.expected.kind === "error" && fixture.exchanges.length === 0) {
      expect(fixture.expected.code, fixture.id).toBe("INVALID_ACTION_INPUT");
      continue;
    }
    expect(fixture.exchanges.length, fixture.id).toBeGreaterThan(0);
    for (const exchange of fixture.exchanges) {
      const request = exchange.request;
      expect(request.url.startsWith("https://api.bigmailer.io/"), fixture.id).toBe(true);
      expect(request.body === null || typeof request.body === "string", fixture.id).toBe(true);
      if (request.method === "GET" || request.method === "DELETE") expect(request.body, fixture.id).toBeNull();
      if (typeof request.body === "string") {
        expect(request.body, fixture.id).toBe(JSON.stringify(JSON.parse(request.body)));
        expect(request.headers["content-type"], fixture.id).toBe("application/json");
      } else {
        expect(request.headers["content-type"], fixture.id).toBeUndefined();
      }
      expect(existsSync(resolve(casesDir, exchange.response.bodyFile)), fixture.id).toBe(true);
    }
    if (fixture.expected.kind === "success") {
      expect(existsSync(resolve(casesDir, fixture.expected.resultFile!)), fixture.id).toBe(true);
    }
  }
});

test("success fixtures replay through the compiled actions", async () => {
  const { actions: compiled } = compileDeclarativeConnector(manifest as never);
  const actions: Record<string, (input: unknown) => unknown> = {
    ...compiled,
    "suppressionLists.create": createSuppressionList,
  };
  for (const fixture of cases) {
    if (fixture.expected.kind !== "success") continue;
    const exchange = fixture.exchanges[0]!;
    const responseBody = readFileSync(resolve(casesDir, exchange.response.bodyFile), "utf8");
    const expected = JSON.parse(readFileSync(resolve(casesDir, fixture.expected.resultFile!), "utf8"));
    let captured: { method: string; url: string; headers: Record<string, string>; body: string | null } | undefined;
    const result = await actions[fixture.operation]!({
      ...fixture.credentials,
      ...fixture.input,
      fetch: async (url: string, init?: RequestInit) => {
        captured = {
          method: init?.method ?? "GET",
          url: String(url),
          headers: headerMap(init?.headers),
          body: typeof init?.body === "string" ? init.body : null,
        };
        return new Response(responseBody, {
          status: exchange.response.status,
          headers: { "content-type": "application/json" },
        });
      },
    });
    expect(captured?.method, fixture.id).toBe(exchange.request.method);
    expect(captured?.url, fixture.id).toBe(exchange.request.url);
    expect(headerMap(captured?.headers), fixture.id).toEqual(headerMap(exchange.request.headers));
    expect(sameBody(captured?.body ?? null, exchange.request.body), fixture.id).toBe(true);
    expect(result, fixture.id).toEqual(expected);
  }
});
