import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest);
const casesDir = new URL("../fixtures/cases/", import.meta.url);

type Exchange = {
  request: { method: string; url: string; headers: Record<string, string>; body: string | null };
  response: { status: number; headers?: Record<string, string>; bodyFile: string };
};

type FixtureCase = {
  id: string;
  operation: string;
  input: Record<string, unknown>;
  credentials: Record<string, string>;
  exchanges: Exchange[];
  expected: { kind: string; resultFile: string };
};

describe("Amazing Marvin success fixtures", () => {
  const files = readdirSync(casesDir).filter((name) => name.endsWith(".json")).sort();

  test("covers every non-webhook operation once", () => {
    const operations = Object.entries(manifest.operations)
      .filter(([, operation]) => (operation as { kind?: string }).kind !== "webhook")
      .map(([key]) => key)
      .sort();
    const covered = files.map((name) => {
      const fixture = JSON.parse(readFileSync(new URL(name, casesDir), "utf8")) as FixtureCase;
      return fixture.operation;
    }).sort();
    expect(covered).toEqual(operations);
    expect(new Set(covered).size).toBe(covered.length);
  });

  for (const file of files) {
    test(file, async () => {
      const fixture = JSON.parse(readFileSync(new URL(file, casesDir), "utf8")) as FixtureCase;
      const exchange = fixture.exchanges[0];
      expect(exchange, fixture.id).toBeDefined();
      const responseBody = readFileSync(new URL(exchange.response.bodyFile, new URL(file, casesDir)), "utf8");
      const expected = JSON.parse(readFileSync(new URL(fixture.expected.resultFile, new URL(file, casesDir)), "utf8"));
      const seen: Array<{ url: string; init: RequestInit }> = [];
      const action = actions[fixture.operation];
      expect(action, fixture.operation).toBeDefined();
      const result = await action!({
        ...fixture.credentials,
        ...fixture.input,
        fetch: async (url, init) => {
          seen.push({ url: String(url), init: init ?? {} });
          return new Response(responseBody, { status: exchange.response.status, headers: exchange.response.headers });
        },
      });
      expect(seen).toHaveLength(1);
      expect(seen[0].url).toBe(exchange.request.url);
      expect(seen[0].init.method).toBe(exchange.request.method);
      expect(seen[0].init.headers).toEqual(exchange.request.headers);
      expect(seen[0].init.body ?? null).toBe(exchange.request.body);
      expect(result).toEqual(expected);
    });
  }
});
