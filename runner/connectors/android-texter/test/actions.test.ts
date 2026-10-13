import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest);
const casesDir = new URL("../fixtures/cases/", import.meta.url);

describe("Android Texter fixtures", () => {
  test("replays one success fixture per operation", async () => {
    const files = readdirSync(casesDir).filter((file) => file.endsWith(".json")).sort();
    const operations = Object.keys(manifest.operations).sort();
    expect(files.length).toBe(operations.length);
    const covered: string[] = [];
    for (const file of files) {
      const caseUrl = new URL(file, casesDir);
      const fixture = JSON.parse(readFileSync(caseUrl, "utf8"));
      covered.push(fixture.operation);
      const exchange = fixture.exchanges[0];
      const upstream = readFileSync(new URL(exchange.response.bodyFile, caseUrl), "utf8");
      const expected = JSON.parse(readFileSync(new URL(fixture.expected.resultFile, caseUrl), "utf8"));
      const seen: { method: string; url: string; contentType: string | null; apiKey: string | null; body: string | null }[] = [];
      const result = await actions[fixture.operation]!({
        ...fixture.input,
        apiKey: fixture.credentials.apiKey,
        fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
          const request = new Request(input, init);
          seen.push({
            method: request.method,
            url: request.url,
            contentType: request.headers.get("content-type"),
            apiKey: request.headers.get("x-api-key"),
            body: init?.body == null ? null : String(init.body),
          });
          return new Response(upstream, { status: exchange.response.status, headers: exchange.response.headers });
        },
      });
      expect(seen, fixture.id).toEqual([
        {
          method: exchange.request.method,
          url: exchange.request.url,
          contentType: exchange.request.headers["Content-Type"] ?? null,
          apiKey: exchange.request.headers["X-API-Key"],
          body: exchange.request.body,
        },
      ]);
      expect(result, fixture.id).toEqual(expected);
    }
    expect(covered.sort()).toEqual(operations);
  });
});
