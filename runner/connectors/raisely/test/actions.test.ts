import { describe, expect, it } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest as never);
const fixtureRoot = join(import.meta.dir, "../fixtures");
const HANDWRITTEN = new Set(["campaigns.media.upload"]);

function loadCases() {
  const dir = join(fixtureRoot, "cases");
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => JSON.parse(readFileSync(join(dir, name), "utf8")));
}

describe("raisely actions", () => {
  const all = loadCases();
  const success = all.filter((c: { expected: { kind: string }; handwritten?: boolean; operation: string }) =>
    c.expected.kind === "success" && !c.handwritten && !HANDWRITTEN.has(c.operation),
  );
  const errors = all.filter((c: { expected: { kind: string } }) => c.expected.kind === "error");

  it("has a positive fixture for every operation", () => {
    const covered = new Set(all.filter((c: { expected: { kind: string } }) => c.expected.kind === "success").map((c: { operation: string }) => c.operation));
    expect([...covered].sort()).toEqual(Object.keys(manifest.operations).sort());
  });

  it.each(success)("executes $id against the documented endpoint", async (fixture: any) => {
    const exchange = fixture.exchanges[0];
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchFn = async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      const bodyFile = join(fixtureRoot, "cases", exchange.response.bodyFile);
      const body = readFileSync(bodyFile);
      return new Response(body, {
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
    expect(gotHeaders.get("authorization")).toBe(`Bearer ${fixture.credentials.apiKey}`);
    const body = calls[0]!.init?.body == null ? null : String(calls[0]!.init?.body);
    expect(body).toBe(exchange.request.body);
  });

  it.each(errors)("$id fails without a provider call when expected", async (fixture: any) => {
    const calls: unknown[] = [];
    const fetchFn = async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      if (!fixture.exchanges[0]) {
        return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
      }
      const exchange = fixture.exchanges[0];
      const body = readFileSync(join(fixtureRoot, "cases", exchange.response.bodyFile));
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
    if (fixture.exchanges.length === 0) {
      expect(calls).toHaveLength(0);
    }
  });
});
