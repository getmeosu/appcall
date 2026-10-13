import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest);

describe("ApexVerify fixtures", () => {
  test("replays every success fixture against the compiled actions", async () => {
    const caseDir = join(import.meta.dir, "../fixtures/cases");
    const files = readdirSync(caseDir).filter((name) => name.endsWith(".json")).sort();
    expect(files.length).toBe(9);
    const covered = new Set<string>();
    for (const file of files) {
      const fixture = JSON.parse(readFileSync(join(caseDir, file), "utf8"));
      expect(fixture.expected.kind).toBe("success");
      expect(fixture.exchanges).toHaveLength(1);
      const exchange = fixture.exchanges[0];
      expect(exchange.request.body === null || typeof exchange.request.body === "string").toBe(true);
      const responseBody = readFileSync(join(caseDir, exchange.response.bodyFile), "utf8");
      const expected = JSON.parse(readFileSync(join(caseDir, fixture.expected.resultFile), "utf8"));
      const seen: { method: string; url: string; headers: Headers; body: string }[] = [];
      const action = actions[fixture.operation];
      expect(action, fixture.operation).toBeTypeOf("function");
      const result = await action!({
        ...fixture.input,
        apiKey: fixture.credentials.apiKey,
        fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
          const request = new Request(input, init);
          seen.push({
            method: request.method,
            url: request.url,
            headers: request.headers,
            body: await request.text(),
          });
          return new Response(responseBody, {
            status: exchange.response.status,
            headers: exchange.response.headers,
          });
        },
      });
      expect(seen, fixture.id).toHaveLength(1);
      expect(seen[0].method, fixture.id).toBe(exchange.request.method);
      expect(seen[0].url, fixture.id).toBe(exchange.request.url);
      for (const [key, value] of Object.entries(exchange.request.headers)) {
        expect(seen[0].headers.get(key), `${fixture.id} ${key}`).toBe(value);
      }
      expect(seen[0].headers.get("authorization"), fixture.id).toBeNull();
      if (exchange.request.body === null) {
        expect(seen[0].body, fixture.id).toBe("");
        expect(seen[0].headers.get("content-type"), fixture.id).toBeNull();
      } else {
        expect(seen[0].body, fixture.id).toBe(exchange.request.body);
        expect(seen[0].headers.get("content-type"), fixture.id).toBe("application/json");
      }
      expect(result, fixture.id).toEqual(expected);
      covered.add(fixture.operation);
    }
    expect([...covered].sort()).toEqual(Object.keys(manifest.operations).sort());
  });
});
