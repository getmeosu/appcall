import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const casesDir = new URL("../fixtures/cases/", import.meta.url);
const caseFiles = readdirSync(casesDir).filter((name) => name.endsWith(".json")).sort();
const { actions } = compileDeclarativeConnector(manifest);

function loadJson(url: URL): any {
  return JSON.parse(readFileSync(url, "utf8"));
}

describe("Bika depth fixtures", () => {
  it("covers every action with one success fixture", () => {
    const cases = caseFiles.map((name) => loadJson(new URL(name, casesDir)));
    const positive = cases.filter((entry) => entry.expected.kind === "success").map((entry) => entry.operation);
    expect(positive.sort()).toEqual(Object.keys(manifest.operations).sort());
    expect(cases).toHaveLength(Object.keys(manifest.operations).length);
  });

  it("replays each success fixture through the compiler", async () => {
    for (const name of caseFiles) {
      const fixtureUrl = new URL(name, casesDir);
      const fixture = loadJson(fixtureUrl);
      const exchange = fixture.exchanges[0];
      const responseBody = loadJson(new URL(exchange.response.bodyFile, fixtureUrl));
      const expected = loadJson(new URL(fixture.expected.resultFile, fixtureUrl));
      const seen: { url: string; method: string; headers: Headers; body: string | undefined }[] = [];
      const result = await actions[fixture.operation]!({
        ...fixture.credentials,
        ...fixture.input,
        fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
          seen.push({
            url: String(input),
            method: init?.method ?? "GET",
            headers: new Headers(init?.headers),
            body: typeof init?.body === "string" ? init.body : undefined,
          });
          return new Response(JSON.stringify(responseBody), {
            status: exchange.response.status,
            headers: exchange.response.headers,
          });
        },
      });
      expect(seen, fixture.id).toHaveLength(1);
      expect(seen[0].method, fixture.id).toBe(exchange.request.method);
      expect(seen[0].url, fixture.id).toBe(exchange.request.url);
      for (const [key, value] of Object.entries(exchange.request.headers as Record<string, string>)) {
        expect(seen[0].headers.get(key), `${fixture.id} ${key}`).toBe(value);
      }
      expect(seen[0].headers.get("content-type"), fixture.id).toBe(exchange.request.headers["Content-Type"] ?? null);
      expect(seen[0].body, fixture.id).toBe(exchange.request.body ?? undefined);
      expect(result, fixture.id).toEqual(expected);
    }
  });
});
