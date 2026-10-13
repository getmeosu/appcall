import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest);
const operations = manifest.operations as Record<string, { kind?: string }>;

function readJson(url: URL) {
  return JSON.parse(readFileSync(url, "utf8"));
}

describe("CrewAI success fixtures", () => {
  const caseDir = new URL("../fixtures/cases/", import.meta.url);
  const cases = readdirSync(caseDir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => ({ url: new URL(name, caseDir), body: readJson(new URL(name, caseDir)) }));

  test("covers every action once", () => {
    const actionKeys = Object.entries(operations)
      .filter(([, operation]) => operation.kind === "action")
      .map(([key]) => key)
      .sort();
    const covered = cases
      .map((entry) => entry.body)
      .filter((entry) => entry.expected?.kind === "success")
      .map((entry) => entry.operation)
      .sort();
    expect(covered).toEqual(actionKeys);
    expect(cases).toHaveLength(actionKeys.length);
  });

  test("replays the documented request and JSON body", async () => {
    for (const entry of cases) {
      const fixture = entry.body;
      const exchange = fixture.exchanges[0];
      const responseText = readFileSync(new URL(exchange.response.bodyFile, entry.url), "utf8");
      const expected = readJson(new URL(fixture.expected.resultFile, entry.url));
      const seen: { url?: string; method?: string; headers?: Headers; body?: string | null } = {};
      const result = await actions[fixture.operation]!({
        ...fixture.input,
        ...fixture.credentials,
        fetch: async (url: string | URL, init?: RequestInit) => {
          seen.url = String(url);
          seen.method = init?.method;
          seen.headers = new Headers(init?.headers);
          seen.body = init?.body == null ? null : String(init.body);
          return new Response(responseText, {
            status: exchange.response.status,
            headers: exchange.response.headers,
          });
        },
      });
      expect(seen.method, fixture.id).toBe(exchange.request.method);
      expect(seen.url, fixture.id).toBe(exchange.request.url);
      expect(seen.body, fixture.id).toBe(exchange.request.body);
      const expectedHeaders = new Headers(exchange.request.headers);
      for (const [key, value] of expectedHeaders) {
        expect(seen.headers?.get(key), `${fixture.id} ${key}`).toBe(value);
      }
      for (const [key] of seen.headers ?? []) {
        expect(expectedHeaders.has(key) || key === "content-length", `${fixture.id} ${key}`).toBe(true);
      }
      expect(result, fixture.id).toEqual(expected);
    }
  });
});
