import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const root = join(import.meta.dir, "../fixtures");
const { actions } = compileDeclarativeConnector(manifest);

describe("bulkpublish success fixtures", () => {
  const files = readdirSync(join(root, "cases")).filter((file) => file.endsWith(".json")).sort();
  for (const file of files) {
    test(file, async () => {
      const fixture = JSON.parse(readFileSync(join(root, "cases", file), "utf8"));
      const exchange = fixture.exchanges[0];
      const responseBody = JSON.parse(readFileSync(join(root, "cases", exchange.response.bodyFile), "utf8"));
      const expected = JSON.parse(readFileSync(join(root, "cases", fixture.expected.resultFile), "utf8"));
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
      expect(seen[0].headers.get("authorization")).toBe(exchange.request.headers.Authorization);
      expect(seen[0].headers.get("content-type")).toBeNull();
      expect(seen[0].body).toBeNull();
      expect(result).toEqual(expected);
    });
  }
});
