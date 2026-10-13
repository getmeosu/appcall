import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest as never);
const operations = manifest.operations as Record<string, Record<string, any>>;

function readJson(url: URL) {
  return JSON.parse(readFileSync(url, "utf8"));
}

describe("PlanetScale fixture coverage", () => {
  const caseDir = new URL("../fixtures/cases/", import.meta.url);
  const cases = readdirSync(caseDir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => ({ name, url: new URL(name, caseDir), body: readJson(new URL(name, caseDir)) }));

  test("every action has a success fixture and every case names a declared action", () => {
    const actionKeys = Object.entries(operations)
      .filter(([, operation]) => operation.kind === "action")
      .map(([key]) => key)
      .sort();
    const covered = [
      ...new Set(cases.filter((entry) => entry.body.expected?.kind === "success").map((entry) => entry.body.operation)),
    ].sort();
    expect(covered).toEqual(actionKeys);
    const ids = cases.map((entry) => entry.body.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of cases) {
      expect(typeof operations[entry.body.operation], entry.name).toBe("object");
    }
  });

  test("replays every documented request and response", async () => {
    for (const entry of cases) {
      const fixture = entry.body;
      const exchanges = fixture.exchanges as Array<{
        request: { method: string; url: string; headers?: Record<string, string>; body: string | null };
        response: { status: number; headers?: Record<string, string>; bodyFile: string };
      }>;
      let index = 0;
      const seen: Array<{ method: string; url: string; headers: Headers; body: string | null }> = [];
      const settled = await actions[fixture.operation]!({
        ...fixture.input,
        ...fixture.credentials,
        fetch: async (url: string | URL, init?: RequestInit) => {
          const exchange = exchanges[index];
          index += 1;
          expect(exchange, `${fixture.id} unexpected request`).toBeDefined();
          seen.push({
            method: String(init?.method ?? "GET").toUpperCase(),
            url: String(url),
            headers: new Headers(init?.headers),
            body: init?.body == null ? null : String(init.body),
          });
          const responseText = readFileSync(new URL(exchange.response.bodyFile, entry.url), "utf8");
          return new Response(responseText, { status: exchange.response.status, headers: exchange.response.headers });
        },
      }).then(
        (value: unknown) => ({ ok: true as const, value }),
        (error: unknown) => ({ ok: false as const, error }),
      );
      expect(index, fixture.id).toBe(exchanges.length);
      for (let i = 0; i < exchanges.length; i += 1) {
        const exchange = exchanges[i];
        expect(seen[i].method, fixture.id).toBe(exchange.request.method);
        expect(seen[i].url, fixture.id).toBe(exchange.request.url);
        expect(seen[i].body ?? null, fixture.id).toBe(exchange.request.body);
        const expectedHeaders = new Headers(exchange.request.headers ?? {});
        for (const [key, value] of expectedHeaders) {
          expect(seen[i].headers.get(key), `${fixture.id} ${key}`).toBe(value);
        }
        for (const key of seen[i].headers.keys()) {
          if (key !== "content-length") {
            expect(expectedHeaders.has(key), `${fixture.id} unexpected header ${key}`).toBe(true);
          }
        }
      }
      if (fixture.expected.kind === "error") {
        expect(settled.ok, fixture.id).toBe(false);
        if (!settled.ok) expect((settled.error as { code?: string }).code, fixture.id).toBe(fixture.expected.code);
      } else {
        expect(settled.ok, fixture.id).toBe(true);
        if (settled.ok) {
          const expected = readJson(new URL(fixture.expected.resultFile, entry.url));
          expect(settled.value, fixture.id).toEqual(expected);
        }
      }
    }
  });
});
