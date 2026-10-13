import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest);
const casesDir = new URL("../fixtures/cases/", import.meta.url);

type FixtureCase = {
  id: string;
  operation: string;
  input: Record<string, unknown>;
  credentials: Record<string, string>;
  url: URL;
  exchanges: Array<{
    request: { method: string; url: string; body: string | null };
    response: { status: number; headers?: Record<string, string>; bodyFile: string };
  }>;
  expected: { kind: string; resultFile: string };
};

const cases = readdirSync(casesDir)
  .filter((file) => file.endsWith(".json"))
  .map((file) => {
    const url = new URL(file, casesDir);
    return { ...(JSON.parse(readFileSync(url, "utf8")) as FixtureCase), url };
  });

describe("Adyntel fixture replay", () => {
  test("covers every action with one success fixture", () => {
    const positive = cases.filter((item) => item.expected.kind === "success").map((item) => item.operation);
    expect([...new Set(positive)].sort()).toEqual(Object.keys(manifest.operations).sort());
  });

  test("replays pinned JSON fixtures without a live provider call", async () => {
    expect(cases.length).toBeGreaterThan(0);
    for (const item of cases) {
      const exchange = item.exchanges[0];
      const responseBody = readFileSync(new URL(exchange.response.bodyFile, item.url), "utf8");
      const expected = JSON.parse(readFileSync(new URL(item.expected.resultFile, item.url), "utf8"));
      const seen: Request[] = [];
      const result = await actions[item.operation]!({
        ...item.input,
        ...item.credentials,
        fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
          seen.push(new Request(input, init));
          return new Response(responseBody, { status: exchange.response.status, headers: exchange.response.headers });
        },
      });
      expect(seen, item.id).toHaveLength(1);
      expect(seen[0].method, item.id).toBe(exchange.request.method);
      expect(seen[0].url, item.id).toBe(exchange.request.url);
      expect(seen[0].headers.get("authorization"), item.id).toBeNull();
      expect(seen[0].headers.get("accept"), item.id).toBe("application/json");
      expect(seen[0].headers.get("content-type"), item.id).toBe("application/json");
      expect(await seen[0].text(), item.id).toBe(exchange.request.body);
      expect(result, item.id).toEqual(expected);
    }
  });
});
