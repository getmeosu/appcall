import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const caseDir = join(dirname(new URL(import.meta.url).pathname), "../fixtures/cases");
const { actions } = compileDeclarativeConnector(manifest as never);

function readJson(path: string) {
  return JSON.parse(readFileSync(path, "utf8"));
}

describe("artificial-analysis fixtures", () => {
  test("replays one success fixture for every operation", async () => {
    const files = readdirSync(caseDir).filter((name) => name.endsWith(".json")).sort();
    const operations = Object.keys(manifest.operations).sort();
    expect(files.length).toBe(operations.length);
    const covered: string[] = [];
    for (const file of files) {
      const fixture = readJson(join(caseDir, file));
      expect(fixture.expected.kind).toBe("success");
      const exchange = fixture.exchanges[0];
      expect(exchange.request.body).toBeNull();
      const responseBody = readJson(join(caseDir, exchange.response.bodyFile));
      const expected = readJson(join(caseDir, fixture.expected.resultFile));
      const seen: { url: string; method: string | undefined; headers: unknown; body: unknown }[] = [];
      const result = await actions[fixture.operation]!({
        ...fixture.input,
        apiKey: fixture.credentials.apiKey,
        fetch: async (url: string | URL, init?: RequestInit) => {
          seen.push({
            url: String(url),
            method: init?.method,
            headers: init?.headers,
            body: init?.body ?? null,
          });
          return new Response(JSON.stringify(responseBody), {
            status: exchange.response.status,
            headers: exchange.response.headers,
          });
        },
      });
      expect(seen).toEqual([
        {
          url: exchange.request.url,
          method: exchange.request.method,
          headers: exchange.request.headers,
          body: null,
        },
      ]);
      expect(result).toEqual(expected);
      covered.push(fixture.operation);
    }
    expect(covered.sort()).toEqual(operations);
  });
});
