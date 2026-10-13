import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest);

type Fixture = {
  id: string;
  operation: string;
  input: Record<string, unknown>;
  credentials: { apiKey: string };
  exchanges: Array<{
    request: { method: string; url: string; headers: Record<string, string>; body: string | null };
    response: { status: number; headers: Record<string, string>; bodyFile: string };
  }>;
  expected: { kind: string; resultFile: string };
};

const caseDir = new URL("../fixtures/cases/", import.meta.url);

function load(url: URL): unknown {
  return JSON.parse(readFileSync(url, "utf8"));
}

describe("Are.na success fixtures", () => {
  test("replays one success fixture for every action", async () => {
    const names = readdirSync(caseDir).filter((name) => name.endsWith(".json")).sort();
    const operations = Object.keys(manifest.operations).sort();
    expect(names).toHaveLength(operations.length);
    const covered: string[] = [];
    for (const name of names) {
      const fixture = load(new URL(name, caseDir)) as Fixture;
      expect(fixture.expected.kind).toBe("success");
      const exchange = fixture.exchanges[0];
      const responseBody = readFileSync(new URL(exchange.response.bodyFile, new URL(name, caseDir)), "utf8");
      const expected = load(new URL(fixture.expected.resultFile, new URL(name, caseDir)));
      const seen: Array<{ url: string; init: RequestInit }> = [];
      const result = await actions[fixture.operation]!({
        ...fixture.input,
        apiKey: fixture.credentials.apiKey,
        fetch: async (url, init) => {
          seen.push({ url: String(url), init });
          return new Response(responseBody, { status: exchange.response.status, headers: exchange.response.headers });
        },
      });
      expect(seen).toHaveLength(1);
      expect(seen[0].url).toBe(exchange.request.url);
      expect(seen[0].init.method).toBe(exchange.request.method);
      expect(seen[0].init.body ?? null).toBe(exchange.request.body);
      const headers = new Headers(seen[0].init.headers);
      for (const [key, value] of Object.entries(exchange.request.headers)) {
        expect(headers.get(key)).toBe(value);
      }
      if (exchange.request.body === null) {
        expect(headers.get("content-type")).toBeNull();
      }
      expect(result).toEqual(expected);
      covered.push(fixture.operation);
    }
    expect(covered.sort()).toEqual(operations);
  });
});
