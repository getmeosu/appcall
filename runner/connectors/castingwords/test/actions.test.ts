import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest);

function readJson(url: URL) {
  return JSON.parse(readFileSync(url, "utf8"));
}

describe("CastingWords depth fixtures", () => {
  const caseDir = new URL("../fixtures/cases/", import.meta.url);
  const cases = readdirSync(caseDir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => {
      const url = new URL(name, caseDir);
      return { url, body: readJson(url) };
    });

  it("covers every declared action with a positive fixture and skips webhooks", () => {
    const actionKeys = Object.entries(manifest.operations)
      .filter(([, operation]) => (operation as { kind?: string }).kind === "action")
      .map(([key]) => key);
    const positive = cases
      .map((entry) => entry.body)
      .filter((entry) => entry.expected?.kind === "success")
      .map((entry) => entry.operation);
    expect(positive.sort()).toEqual([...actionKeys].sort());
    for (const key of Object.keys(manifest.operations)) {
      if (key.startsWith("webhook.")) {
        expect(positive).not.toContain(key);
      }
    }
  });

  it("replays authenticated fixture cases", async () => {
    for (const entry of cases) {
      const fixture = entry.body;
      const exchange = fixture.exchanges[0];
      const responseBody = readFileSync(new URL(exchange.response.bodyFile, entry.url), "utf8");
      const expected = readJson(new URL(fixture.expected.resultFile, entry.url));
      let seen: { url: string; method: string; headers: Headers; body: string | null } | undefined;
      const result = await actions[fixture.operation]!({
        ...fixture.input,
        ...fixture.credentials,
        fetch: async (input: string | URL, init?: RequestInit) => {
          seen = {
            url: String(input),
            method: String(init?.method ?? "GET"),
            headers: new Headers(init?.headers),
            body: init?.body == null ? null : String(init.body),
          };
          return new Response(responseBody, {
            status: exchange.response.status,
            headers: exchange.response.headers,
          });
        },
      });
      expect(seen?.method, fixture.id).toBe(exchange.request.method);
      expect(seen?.url, fixture.id).toBe(exchange.request.url);
      expect(seen?.body, fixture.id).toBe(exchange.request.body);
      const expectedHeaders = new Headers(exchange.request.headers ?? {});
      for (const [key, value] of expectedHeaders) {
        expect(seen?.headers.get(key), fixture.id).toBe(value);
      }
      for (const [key] of seen!.headers) {
        if (key === "content-length") continue;
        expect(expectedHeaders.has(key), `${fixture.id} unexpected header ${key}`).toBe(true);
      }
      expect(result, fixture.id).toEqual(expected);
    }
  });
});
