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

describe("fly actions", () => {
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
      return new Response(body, { status: exchange.response.status, headers: { "content-type": "application/json" } });
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
    expect(gotHeaders.authorization).toBe(`Bearer ${fixture.credentials.apiKey}`);
    expect(gotHeaders.accept).toBe("application/json");
    const rawBody = calls[0]!.init?.body == null ? null : String(calls[0]!.init?.body);
    if (exchange.request.body == null) {
      expect(rawBody).toBe(null);
    } else if (typeof exchange.request.body === "string") {
      expect(rawBody).toBe(exchange.request.body);
    } else {
      expect(JSON.parse(rawBody!)).toEqual(exchange.request.body);
      expect(gotHeaders["content-type"]).toBe("application/json");
    }
  });

  it.each(errors)("rejects $id before or at dispatch", async (fixture: any) => {
    let called = false;
    const fetchFn = async (_url: RequestInfo | URL, _init?: RequestInit) => {
      called = true;
      if (!fixture.exchanges[0]) return new Response("{}", { status: 200 });
      const exchange = fixture.exchanges[0];
      const bodyFile = join(fixtureRoot, "cases", exchange.response.bodyFile);
      const body = readFileSync(bodyFile);
      return new Response(body, { status: exchange.response.status });
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

  it("rejects GraphQL errors on HTTP 200", async () => {
    await expect(
      actions["viewer.get"]!({
        apiKey: "fly_fixture",
        fetch: async () => new Response(JSON.stringify({ data: null, errors: [{ message: "Unauthenticated" }] }), { status: 200 }),
      }),
    ).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});
