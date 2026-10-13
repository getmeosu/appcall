import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest as never);
const casesDir = new URL("../fixtures/cases/", import.meta.url);

type FixtureCase = {
  id: string;
  operation: string;
  input: Record<string, unknown>;
  credentials: { apiKey: string };
  exchanges: Array<{
    request: { method: string; url: string; headers: Record<string, string>; body: string | null };
    response: { status: number; headers?: Record<string, string>; bodyFile: string };
  }>;
  expected: { kind: string; resultFile: string };
};

function loadCases(): FixtureCase[] {
  return readdirSync(casesDir)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map((file) => JSON.parse(readFileSync(new URL(file, casesDir), "utf8")) as FixtureCase);
}

const actionKeys = Object.entries(manifest.operations)
  .filter(([, operation]) => (operation as { kind?: string }).kind === "action")
  .map(([key]) => key);

describe("DocuPipe fixtures", () => {
  it("replays one authenticated success fixture for every action", async () => {
    const cases = loadCases();
    const positive = cases.filter((item) => item.expected.kind === "success");
    expect(positive.map((item) => item.operation).sort()).toEqual([...actionKeys].sort());
    expect(positive).toHaveLength(actionKeys.length);

    for (const item of positive) {
      const exchange = item.exchanges[0]!;
      const responseBody = readFileSync(new URL(exchange.response.bodyFile, new URL(`${item.id}.json`, casesDir)), "utf8");
      const expected = JSON.parse(readFileSync(new URL(item.expected.resultFile, new URL(`${item.id}.json`, casesDir)), "utf8"));
      const seen: { url: string; method: string; headers: Headers; body: string }[] = [];
      const result = await actions[item.operation]!({
        ...item.input,
        apiKey: item.credentials.apiKey,
        fetch: async (url: string | URL, init?: RequestInit) => {
          const request = new Request(url, init);
          seen.push({ url: request.url, method: request.method, headers: request.headers, body: await request.text() });
          return new Response(responseBody, { status: exchange.response.status, headers: exchange.response.headers });
        },
      });
      expect(seen, item.id).toHaveLength(1);
      expect(seen[0]!.method, item.id).toBe(exchange.request.method);
      expect(seen[0]!.url, item.id).toBe(exchange.request.url);
      expect(seen[0]!.headers.get("accept"), item.id).toBe("application/json");
      expect(seen[0]!.headers.get("x-api-key"), item.id).toBe(exchange.request.headers["X-API-Key"]);
      expect(seen[0]!.headers.get("authorization"), item.id).toBeNull();
      const sentBody = seen[0]!.body === "" ? null : seen[0]!.body;
      expect(sentBody, item.id).toBe(exchange.request.body);
      if (exchange.request.body === null) expect(seen[0]!.headers.get("content-type"), item.id).toBeNull();
      else expect(seen[0]!.headers.get("content-type"), item.id).toBe("application/json");
      expect(result, item.id).toEqual(expected);
    }
  });

  it("does not cover webhook operations", () => {
    const cases = loadCases();
    const positive = new Set(cases.filter((item) => item.expected.kind === "success").map((item) => item.operation));
    for (const key of Object.keys(manifest.operations)) {
      if (key.startsWith("webhook.")) expect(positive.has(key)).toBe(false);
    }
  });
});
