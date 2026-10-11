import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import cases from "../fixtures/deepen_cases.json";
import item from "../fixtures/item.json";

const { actions } = compileDeclarativeConnector(manifest as never);

function renderPath(path: string, input: Record<string, unknown>): string {
  return path.replace(/\{\{\s*([A-Za-z0-9_.$-]+)\s*\}\}/g, (_m, name: string) => encodeURIComponent(String(input[name])));
}

describe("kommo Composio tools compile to real Kommo HTTP calls", () => {
  test("every case has a compiled handler", () => {
    expect(cases.length).toBe(53);
    for (const entry of cases as Array<{ key: string }>) {
      expect(actions[entry.key], entry.key).toBeTypeOf("function");
    }
  });

  for (const entry of cases as Array<{
    key: string;
    method: string;
    path: string;
    input: Record<string, unknown>;
    host: string;
    origin?: boolean;
  }>) {
    test(`${entry.key} ${entry.method} ${entry.path}`, async () => {
      const seen: Request[] = [];
      const result = await actions[entry.key]!({
        apiKey: "secret",
        subdomain: "acme",
        ...entry.input,
        fetch: async (input, init) => {
          seen.push(new Request(input, init));
          const status = entry.method === "POST" ? 201 : 200;
          return new Response(JSON.stringify(item), { status });
        },
      });
      expect(seen).toHaveLength(1);
      const url = new URL(seen[0]!.url);
      expect(url.hostname).toBe(entry.host);
      expect(url.pathname).toBe(renderPath(entry.path, entry.input));
      expect(seen[0]!.method).toBe(entry.method);
      expect(seen[0]!.headers.get("authorization")).toBe("Bearer secret");
      expect(result).toBeTruthy();
      expect((result as { connector: string }).connector).toBe("kommo");
    });
  }
});
