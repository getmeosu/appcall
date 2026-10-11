import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import mapping from "../fixtures/composio-mapping.json";

const recipePath = join(import.meta.dir, "../../../../scripts/connector-gen/openconnector/recipes/polygon_io/recipe.json");
const operations = manifest.operations as Record<string, Record<string, unknown>>;

describe("polygon-io manifest", () => {
  it("keeps the connector identity and bumps the deepened version", () => {
    expect(manifest.key).toBe("polygon-io");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.name).toBe("Massive (Polygon.io)");
    expect(manifest.categories).toEqual(["banking-data"]);
  });

  it("still authenticates with an apiKey query parameter on api.massive.com", () => {
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.http.auth.field).toBe("apiKey");
    expect(manifest.http.auth.in).toBe("query");
    expect(manifest.http.auth.name).toBe("apiKey");
    expect(manifest.http.auth.value).toBe("{{apiKey}}");
    expect(manifest.http.baseUrl).toBe("https://api.massive.com");
    expect(manifest.network.allowedHosts).toEqual(["api.massive.com"]);
  });

  it("exposes every action as a real HTTP tool with title, description, and object inputSchema", () => {
    const keys = Object.keys(operations);
    expect(keys.length).toBe(79);
    expect(keys).toContain("healthcheck");
    expect(keys).toContain("tickers.list");
    expect(keys).toContain("aggs.range");
    expect(keys).toContain("crypto.aggs.range");
    expect(keys).toContain("filings.list");
    for (const [key, operation] of Object.entries(operations)) {
      expect(operation.kind, key).toBe("action");
      expect(String(operation.title ?? "").length, key).toBeGreaterThan(0);
      expect(String(operation.description ?? "").length, key).toBeGreaterThan(0);
      expect((operation.inputSchema as { type?: string }).type, key).toBe("object");
      expect(operation.request, `${key} must declare a request block`).toBeDefined();
      expect((operation.request as { path?: string }).path, key).toBeDefined();
      expect(["read", "write", "destructive"]).toContain(operation.sideEffect as string);
      if (operation.kind === "webhook") {
        expect(operation.sideEffect).toBe("read");
      }
    }
  });

  it("classifies every GET as read", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const method = String((operation.request as { method?: string }).method);
      expect(method, key).toBe("GET");
      expect(operation.sideEffect, key).toBe("read");
    }
  });

  it("only interpolates path placeholders the schema requires", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as { path?: string };
      const schema = operation.inputSchema as { required?: string[] };
      const placeholders = [...String(request.path ?? "").matchAll(/\{\{\s*([A-Za-z0-9_.$-]+)\s*\}\}/g)].map(
        (match) => match[1],
      );
      for (const placeholder of placeholders) {
        expect(schema.required ?? [], `${key} path uses {{${placeholder}}}`).toContain(placeholder);
      }
    }
  });

  it("compiles every operation into a handler", () => {
    const compiled = compileDeclarativeConnector(manifest as never);
    expect(Object.keys(compiled.actions).sort()).toEqual(Object.keys(operations).sort());
  });

  it("keeps recipe operations equal to runner operations", () => {
    expect(existsSync(recipePath)).toBe(true);
    const recipe = JSON.parse(readFileSync(recipePath, "utf8")) as {
      selection: { operations: string[] };
      operationSources: Record<string, unknown>;
      manifest: { operations: Record<string, unknown>; version: string };
    };
    const runnerOps = Object.keys(operations).sort();
    expect(recipe.manifest.version).toBe("0.2.0");
    expect(Object.keys(recipe.manifest.operations).sort()).toEqual(runnerOps);
    expect([...recipe.selection.operations].sort()).toEqual(runnerOps);
    expect(Object.keys(recipe.operationSources).sort()).toEqual(runnerOps);
  });

  it("accounts for every Composio Polygon tool that still has a Massive HTTP endpoint", () => {
    expect(mapping.composio_tools).toBe(90);
    expect(mapping.mapped.length).toBe(87);
    expect(mapping.unmapped_composio.map((row: { composio: string }) => row.composio).sort()).toEqual([
      "POLYGON_GET_CRYPTO_TICKER_BOOK",
      "POLYGON_GET_FOREX_LOCALES",
      "POLYGON_GET_REFERENCE_MARKETS",
    ]);
    for (const row of mapping.mapped as { composio: string; operation: string }[]) {
      expect(operations[row.operation], row.composio).toBeDefined();
    }
  });
});
