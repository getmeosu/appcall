import { describe, expect, it } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest as never);
const fixtureRoot = join(import.meta.dir, "../fixtures");

function loadCases() {
  const dir = join(fixtureRoot, "cases");
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => JSON.parse(readFileSync(join(dir, name), "utf8")));
}

describe("contentful actions", () => {
  const cases = loadCases().filter((c: { expected: { kind: string } }) => c.expected.kind === "success");

  it("has a positive fixture for every operation", () => {
    const covered = new Set(cases.map((c: { operation: string }) => c.operation));
    expect([...covered].sort()).toEqual(Object.keys(manifest.operations).sort());
  });

  it.each(cases)("executes $id against the documented endpoint", async (fixture: any) => {
    const exchange = fixture.exchanges[0];
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchFn = async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      const bodyFile = join(fixtureRoot, "cases", exchange.response.bodyFile);
      const body = readFileSync(bodyFile);
      return new Response(exchange.response.status === 204 ? null : body, {
        status: exchange.response.status,
        headers: exchange.response.headers ?? {},
      });
    };
    const result = await actions[fixture.operation]!({
      ...fixture.input,
      ...fixture.credentials,
      fetch: fetchFn,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.init?.method ?? "GET").toBe(exchange.request.method);
    expect(calls[0]!.url).toBe(exchange.request.url);
    const expected = JSON.parse(readFileSync(join(fixtureRoot, "cases", fixture.expected.resultFile), "utf8"));
    expect(result).toEqual(expected);
    const gotHeaders = new Headers(calls[0]!.init?.headers);
    expect(gotHeaders.get("authorization")).toBe("Bearer fixture-token");
    const body = calls[0]!.init?.body == null ? null : String(calls[0]!.init?.body);
    expect(body).toBe(exchange.request.body);
  });
});
