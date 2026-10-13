import { expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

test("DocuPipe request templates stay on one allowlisted JSON route", () => {
  expect(compileDeclarativeConnector(manifest as never).key).toBe("docupipe");
  for (const [key, operation] of Object.entries(manifest.operations)) {
    const request = operation.request as {
      method?: string;
      path?: string;
      baseUrl?: string;
      body?: unknown;
      query?: Record<string, unknown>;
    };
    expect(request.baseUrl, key).toBeUndefined();
    expect(["GET", "POST", "DELETE"], key).toContain(request.method);
    expect(request.path, key).toMatch(/^\/[A-Za-z0-9_{}.\/-]+$/);
    const properties = (operation.inputSchema as { properties?: Record<string, { type?: string }> }).properties ?? {};
    for (const [name, schema] of Object.entries(properties)) {
      expect(name.toLowerCase(), key).not.toBe("url");
      expect(schema.type, `${key}.${name}`).not.toBe("null");
    }
    const serialized = JSON.stringify({ body: request.body ?? null, query: request.query ?? null, path: request.path });
    expect(serialized, key).not.toContain("http://");
    expect(serialized, key).not.toContain("https://");
    expect(serialized, key).not.toContain("{{response");
    for (const match of serialized.matchAll(/\{\{\s*([A-Za-z0-9_.$-]+)\s*\}\}/g)) {
      const root = (match[1] ?? "").split(".")[0] ?? "";
      expect(Object.hasOwn(properties, root), `${key} {{${root}}}`).toBe(true);
    }
  }
});
