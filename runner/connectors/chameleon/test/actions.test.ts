import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const root = join(import.meta.dir, "../fixtures");
const { actions } = compileDeclarativeConnector(manifest);

const actionKeys = Object.entries(manifest.operations)
  .filter(([, operation]) => operation.kind === "action")
  .map(([key]) => key);

describe("Chameleon depth fixtures", () => {
  const files = readdirSync(join(root, "cases")).filter((file) => file.endsWith(".json")).sort();

  it("replays authenticated fixture cases", async () => {
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const fixture = JSON.parse(readFileSync(join(root, "cases", file), "utf8"));
      const exchange = fixture.exchanges[0];
      const responseBody = JSON.parse(readFileSync(join(root, exchange.response.bodyFile.replace(/^\.\.\//, "")), "utf8"));
      const expected = JSON.parse(readFileSync(join(root, fixture.expected.resultFile.replace(/^\.\.\//, "")), "utf8"));
      expect(exchange.request.body === null || typeof exchange.request.body === "string").toBe(true);
      if (typeof exchange.request.body === "string") {
        expect(JSON.stringify(JSON.parse(exchange.request.body))).toBe(exchange.request.body);
      }
      const seen: { url: string; method: string; headers: Headers; body: string | null }[] = [];
      const result = await actions[fixture.operation]!({
        ...fixture.input,
        ...fixture.credentials,
        fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
          const request = new Request(input, init);
          seen.push({
            url: request.url,
            method: request.method,
            headers: request.headers,
            body: init?.body == null ? null : String(init.body),
          });
          return new Response(JSON.stringify(responseBody), {
            status: exchange.response.status,
            headers: exchange.response.headers,
          });
        },
      });
      expect(seen).toHaveLength(1);
      expect(seen[0].method).toBe(exchange.request.method);
      expect(seen[0].url).toBe(exchange.request.url);
      expect(seen[0].headers.get("accept")).toBe(exchange.request.headers.Accept);
      expect(seen[0].headers.get("x-account-secret")).toBe(exchange.request.headers["X-Account-Secret"]);
      expect(seen[0].headers.get("content-type")).toBe(exchange.request.headers["Content-Type"] ?? null);
      expect(seen[0].body).toBe(exchange.request.body);
      expect(result).toEqual(expected);
    }
  });

  it("covers every declared action with a positive fixture and skips EventOnly webhooks", () => {
    const operations = files.map((file) => JSON.parse(readFileSync(join(root, "cases", file), "utf8")).operation);
    expect([...operations].sort()).toEqual([...actionKeys].sort());
    for (const key of Object.keys(manifest.operations)) {
      expect(key.startsWith("webhook.")).toBe(false);
    }
  });
});
