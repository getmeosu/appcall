import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest as never);
const casesDir = new URL("../fixtures/cases/", import.meta.url);
const casesPath = fileURLToPath(casesDir);

function loadCase(name: string) {
  return Bun.file(new URL(name, casesDir)).json();
}

function responseFromExchange(exchange: { response: { bodyFile: string; status: number; headers?: Record<string, string> } }) {
  const abs = join(casesPath, exchange.response.bodyFile);
  return async () => {
    const body = await Bun.file(abs).text();
    return new Response(body, {
      status: exchange.response.status,
      headers: exchange.response.headers ?? { "content-type": "application/json" },
    });
  };
}

describe("mistral-ai fixtures", () => {
  const files = readdirSync(casesPath).filter((name) => name.endsWith(".json"));

  test("covers origin plus deepened operations", () => {
    expect(files.length).toBeGreaterThan(80);
  });

  for (const name of files) {
    test(name, async () => {
      const fixture = await loadCase(name);
      const handler = actions[fixture.operation as string];
      expect(handler, fixture.operation).toBeDefined();
      if (fixture.expected?.kind === "error") {
        const exchange = fixture.exchanges?.[0];
        const fetchFn = exchange ? async (url: RequestInfo | URL, init?: RequestInit) => {
          void url;
          void init;
          return (await responseFromExchange(exchange)()) ;
        } : undefined;
        await expect(
          handler!({ ...fixture.input, apiKey: fixture.credentials.apiKey, ...(fetchFn ? { fetch: fetchFn } : {}) }),
        ).rejects.toMatchObject({ code: fixture.expected.code });
        return;
      }
      const exchange = fixture.exchanges[0];
      const calls: { url: string; init?: RequestInit }[] = [];
      const fetchFn = async (url: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(url), init });
        return responseFromExchange(exchange)();
      };
      const result = await handler!({ ...fixture.input, apiKey: fixture.credentials.apiKey, fetch: fetchFn });
      const expected = await Bun.file(join(casesPath, fixture.expected.resultFile)).json();
      expect(calls[0]?.url).toBe(exchange.request.url);
      expect(calls[0]?.init?.method ?? "GET").toBe(exchange.request.method);
      expect(result).toMatchObject(expected);
    });
  }
});
