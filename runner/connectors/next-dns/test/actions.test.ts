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

function headerRecord(init?: RequestInit): Record<string, string> {
  const headers = new Headers(init?.headers);
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key.toLowerCase()] = value;
  });
  return out;
}

describe("next-dns actions", () => {
  const cases = loadCases();
  const success = cases.filter((c: { expected: { kind: string } }) => c.expected.kind === "success");
  const errors = cases.filter((c: { expected: { kind: string } }) => c.expected.kind === "error");

  it("has a positive fixture for every operation", () => {
    const covered = new Set(success.map((c: { operation: string }) => c.operation));
    expect([...covered].sort()).toEqual(Object.keys(manifest.operations).sort());
  });

  it.each(success)("executes $id against the documented endpoint", async (fixture: any) => {
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
    const gotHeaders = headerRecord(calls[0]!.init);
    expect(gotHeaders["x-api-key"]).toBe("fixture-key");
    expect(gotHeaders["accept"]).toBe("application/json");
    if (exchange.request.body != null) {
      expect(gotHeaders["content-type"]).toBe("application/json");
    }
    const body = calls[0]!.init?.body == null ? null : String(calls[0]!.init?.body);
    expect(body).toBe(exchange.request.body);
  });

  it.each(errors)("rejects $id before or at dispatch", async (fixture: any) => {
    let called = false;
    const fetchFn = async (url: RequestInfo | URL, init?: RequestInit) => {
      called = true;
      if (!fixture.exchanges[0]) return new Response("{}", { status: 200 });
      const exchange = fixture.exchanges[0];
      const bodyFile = join(fixtureRoot, "cases", exchange.response.bodyFile);
      const body = readFileSync(bodyFile);
      return new Response(body, { status: exchange.response.status, headers: exchange.response.headers ?? {} });
    };
    await expect(
      actions[fixture.operation]!({
        ...fixture.input,
        ...fixture.credentials,
        fetch: fetchFn,
      }),
    ).rejects.toMatchObject({ code: fixture.expected.code });
    if (fixture.exchanges.length === 0) expect(called).toBe(false);
  });
});
