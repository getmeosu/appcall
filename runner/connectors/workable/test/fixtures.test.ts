import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import { executeWorkableAction } from "../src/actions";

const root = new URL("../fixtures/", import.meta.url);
const cases = readdirSync(new URL("cases/", root))
  .filter((file) => file.endsWith(".json"))
  .sort()
  .map((file) => JSON.parse(readFileSync(new URL(`cases/${file}`, root), "utf8")) as {
    id: string;
    operation: string;
    input: Record<string, unknown>;
    credentials: { account: string; accessToken: string };
    exchanges: { request: { method: string; url: string; body: string | null } }[];
    expected: { kind: string; resultFile: string };
  });

function stubFetch(expectedBody: string | null) {
  const calls: Request[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push(new Request(input, init));
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return { calls, impl, expectedBody };
}

describe("Workable fixture coverage", () => {
  test("every operation has one positive success fixture", () => {
    const covered = new Set(cases.filter((item) => item.expected.kind === "success" && item.exchanges.length > 0).map((item) => item.operation));
    expect([...covered].sort()).toEqual(Object.keys(manifest.operations).sort());
    for (const item of cases) {
      const body = item.exchanges[0]?.request.body;
      expect(body === null || (typeof body === "string" && body === JSON.stringify(JSON.parse(body)))).toBe(true);
    }
  });

  test("fixtures replay through the runnable handler", async () => {
    const compiled = compileDeclarativeConnector(manifest);
    for (const item of cases) {
      const operation = manifest.operations[item.operation as keyof typeof manifest.operations];
      const { calls, impl } = stubFetch(item.exchanges[0].request.body);
      const payload = { ...item.credentials, ...item.input, fetch: impl };
      const expected = JSON.parse(readFileSync(new URL(item.expected.resultFile, new URL(`cases/${item.id}.json`, root)), "utf8"));
      const result = operation.kind === "action"
        ? await compiled.actions[item.operation]!(payload)
        : await executeWorkableAction(item.operation, payload);
      expect(calls, item.operation).toHaveLength(1);
      expect(calls[0].method, item.operation).toBe(item.exchanges[0].request.method);
      expect(calls[0].url, item.operation).toBe(item.exchanges[0].request.url);
      const actualBody = calls[0].body ? await calls[0].text() : null;
      expect(actualBody, item.operation).toBe(item.exchanges[0].request.body);
      expect(result, item.operation).toEqual(expected);
      if (operation.kind === "action" && item.operation !== "healthcheck") {
        const handwritten = stubFetch(item.exchanges[0].request.body);
        await executeWorkableAction(item.operation, { ...payload, fetch: handwritten.impl });
        expect(handwritten.calls[0].url, item.operation).toBe(item.exchanges[0].request.url);
        const handwrittenBody = handwritten.calls[0].body ? await handwritten.calls[0].text() : null;
        expect(handwrittenBody, item.operation).toBe(item.exchanges[0].request.body);
      }
    }
  });
});
