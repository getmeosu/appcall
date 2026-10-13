import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest);
const caseDir = new URL("../fixtures/cases/", import.meta.url);
const caseFiles = readdirSync(caseDir).filter((file) => file.endsWith(".json")).sort();

const load = (url: URL) => JSON.parse(readFileSync(url, "utf8"));

describe("Airtop fixtures", () => {
  test("covers every non-webhook operation once", () => {
    const operations = Object.entries(manifest.operations)
      .filter(([, operation]) => operation.kind !== "webhook")
      .map(([name]) => name);
    const covered = caseFiles.map((file) => load(new URL(file, caseDir)).operation);
    expect(covered.sort()).toEqual(operations.sort());
  });

  for (const file of caseFiles) {
    test(file, async () => {
      const fixture = load(new URL(file, caseDir));
      const exchange = fixture.exchanges[0];
      const responseBody = readFileSync(new URL(exchange.response.bodyFile, new URL(file, caseDir)), "utf8");
      const expected = load(new URL(fixture.expected.resultFile, new URL(file, caseDir)));
      const seen: Request[] = [];
      const result = await actions[fixture.operation]!({
        ...fixture.input,
        ...fixture.credentials,
        fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
          seen.push(new Request(input, init));
          return new Response(responseBody, { status: exchange.response.status, headers: exchange.response.headers });
        },
      });
      expect(seen).toHaveLength(1);
      expect(seen[0].method).toBe(exchange.request.method);
      expect(seen[0].url).toBe(exchange.request.url);
      const body = await seen[0].text();
      expect(body === "" ? null : body).toBe(exchange.request.body);
      for (const [key, value] of Object.entries(exchange.request.headers)) {
        expect(seen[0].headers.get(key)).toBe(value);
      }
      expect(result).toEqual(expected);
    });
  }
});
