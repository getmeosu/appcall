import { describe, expect, it } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { handwrittenActions } from "../src/actions";
import manifest from "../manifest.json";

const compiled = compileDeclarativeConnector(manifest as never);
const actions = { ...compiled.actions, ...handwrittenActions };
const fixtureRoot = join(import.meta.dir, "../fixtures");

function loadCases() {
  const dir = join(fixtureRoot, "cases");
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => JSON.parse(readFileSync(join(dir, name), "utf8")));
}

describe("brex actions", () => {
  const all = loadCases();
  const success = all.filter((c: { expected: { kind: string } }) => c.expected.kind === "success");
  const errors = all.filter((c: { expected: { kind: string } }) => c.expected.kind === "error");

  it("has a positive fixture for every operation", () => {
    const covered = new Set(success.map((c: { operation: string }) => c.operation));
    expect([...covered].sort()).toEqual(Object.keys(manifest.operations).sort());
  });

  it.each(success)("executes $id against the documented endpoint", async (fixture: any) => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    let index = 0;
    const fetchFn = async (url: RequestInfo | URL, init?: RequestInit) => {
      const exchange = fixture.exchanges[index++];
      calls.push({ url: String(url), init });
      const bodyFile = join(fixtureRoot, "cases", exchange.response.bodyFile);
      const body = readFileSync(bodyFile);
      return new Response(exchange.response.status === 204 ? null : body, {
        status: exchange.response.status,
        headers: exchange.response.headers ?? { "content-type": "application/json" },
      });
    };
    const result = await actions[fixture.operation]!({
      ...fixture.input,
      ...fixture.credentials,
      fetch: fetchFn,
    });
    expect(calls).toHaveLength(fixture.exchanges.length);
    for (const [i, exchange] of fixture.exchanges.entries()) {
      expect(calls[i]!.init?.method ?? "GET").toBe(exchange.request.method);
      expect(calls[i]!.url).toBe(exchange.request.url);
      const gotHeaders = new Headers(calls[i]!.init?.headers);
      expect(gotHeaders.get("authorization")).toBe(`Bearer ${fixture.credentials.apiKey}`);
      const body = calls[i]!.init?.body == null ? null : String(calls[i]!.init?.body);
      expect(body).toBe(exchange.request.body);
    }
    const expected = JSON.parse(readFileSync(join(fixtureRoot, "cases", fixture.expected.resultFile), "utf8"));
    expect(result).toEqual(expected);
  });

  it.each(errors)("rejects $id", async (fixture: any) => {
    let index = 0;
    const fetchFn = async (url: RequestInfo | URL, init?: RequestInit) => {
      const exchange = fixture.exchanges[index++];
      if (!exchange) throw new Error(`unexpected fetch ${String(url)} ${init?.method ?? "GET"}`);
      const bodyFile = join(fixtureRoot, "cases", exchange.response.bodyFile);
      const body = readFileSync(bodyFile);
      return new Response(body, { status: exchange.response.status, headers: exchange.response.headers ?? {} });
    };
    try {
      await actions[fixture.operation]!({
        ...fixture.input,
        ...fixture.credentials,
        fetch: fetchFn,
      });
      throw new Error("expected failure");
    } catch (error) {
      expect((error as { code?: string }).code).toBe(fixture.expected.code);
    }
  });
});
