import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest as never);
const fixtureRoot = new URL("../fixtures", import.meta.url).pathname;
const caseDir = join(fixtureRoot, "cases");

type SuccessCase = {
  id: string;
  operation: string;
  input: Record<string, unknown>;
  credentials: Record<string, string>;
  exchanges: Array<{
    request: { method: string; url: string; headers?: Record<string, string>; body: null | string };
    response: { status: number; headers?: Record<string, string>; bodyFile: string };
  }>;
  expected: { kind: string; resultFile: string };
};

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function loadCases(): SuccessCase[] {
  return readdirSync(caseDir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => readJson(join(caseDir, name)) as SuccessCase);
}

describe("EmailListVerify fixtures", () => {
  it("replays one success fixture for every action", async () => {
    const cases = loadCases();
    const actionKeys = Object.entries(manifest.operations)
      .filter(([, operation]) => (operation as { kind?: string }).kind === "action")
      .map(([key]) => key);
    expect(cases.map((item) => item.operation).sort()).toEqual([...actionKeys].sort());
    for (const item of cases) {
      expect(item.expected.kind).toBe("success");
      const exchange = item.exchanges[0];
      if (!exchange) throw new Error(`${item.id}: missing exchange`);
      const seen: Array<{ method: string; url: string; body: string | null; headers: Headers }> = [];
      const action = actions[item.operation];
      if (!action) throw new Error(`${item.id}: unknown operation`);
      const result = await action({
        ...item.input,
        ...item.credentials,
        fetch: async (input: string | URL, init?: RequestInit) => {
          seen.push({
            method: String(init?.method ?? "GET"),
            url: String(input),
            body: init?.body == null ? null : String(init.body),
            headers: new Headers(init?.headers),
          });
          const body = readFileSync(join(dirname(caseDir), exchange.response.bodyFile.replace("../", "")), "utf8");
          return new Response(body, { status: exchange.response.status, headers: exchange.response.headers });
        },
      });
      expect(seen, item.id).toHaveLength(1);
      expect(seen[0].method, item.id).toBe(exchange.request.method);
      expect(seen[0].url, item.id).toBe(exchange.request.url);
      expect(seen[0].body, item.id).toBe(exchange.request.body);
      const expectedHeaders = new Headers(exchange.request.headers ?? {});
      for (const [name, value] of expectedHeaders.entries()) {
        expect(seen[0].headers.get(name), `${item.id} ${name}`).toBe(value);
      }
      for (const [name] of seen[0].headers.entries()) {
        if (name === "content-length") continue;
        expect(expectedHeaders.has(name), `${item.id} unexpected header ${name}`).toBe(true);
      }
      expect(result).toEqual(readJson(join(dirname(caseDir), item.expected.resultFile.replace("../", ""))));
    }
  });
});
