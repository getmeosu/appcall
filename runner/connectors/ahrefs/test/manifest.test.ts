import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import mapping from "../fixtures/composio-mapping.json";

const recipePath = join(import.meta.dir, "../../../../scripts/connector-gen/openconnector/recipes/ahrefs/recipe.json");
const operations = manifest.operations as Record<string, Record<string, unknown>>;

describe("ahrefs manifest", () => {
  it("keeps the connector identity and bumps the deepened version", () => {
    expect(manifest.key).toBe("ahrefs");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.categories).toEqual(["utility"]);
  });

  it("still authenticates with Bearer tokens on api.ahrefs.com/v3", () => {
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.http.auth.field).toBe("apiKey");
    expect(manifest.http.auth.name).toBe("Authorization");
    expect(manifest.http.auth.value).toBe("Bearer {{apiKey}}");
    expect(manifest.http.baseUrl).toBe("https://api.ahrefs.com/v3");
    expect(manifest.http.query.output).toBe("json");
    expect(manifest.network.allowedHosts).toEqual(["api.ahrefs.com"]);
  });

  it("keeps the origin four operations and covers every Composio tool", () => {
    const keys = Object.keys(operations);
    expect(keys).toContain("healthcheck");
    expect(keys).toContain("keywords-explorer.overview");
    expect(keys).toContain("site-explorer.metrics");
    expect(keys).toContain("site-explorer.metrics-by-country");
    expect(keys).toHaveLength(46);
    expect(mapping.mapped).toHaveLength(46);
    expect(mapping.missing).toEqual([]);
    expect(new Set(mapping.mapped.map((row: { operation: string }) => row.operation)).size).toBe(46);
  });

  it("exposes every action as a real HTTP tool with title, description, and object inputSchema", () => {
    for (const [key, operation] of Object.entries(operations)) {
      expect(operation.kind, key).toBe("action");
      expect(operation.sideEffect, key).toBe("read");
      expect(String(operation.title ?? "").length, key).toBeGreaterThan(0);
      expect(String(operation.description ?? "").length, key).toBeGreaterThan(0);
      expect((operation.inputSchema as { type?: string }).type, key).toBe("object");
      expect(operation.request, `${key} must declare a request block`).toBeDefined();
      const request = operation.request as { method?: string; path?: string };
      expect(["GET", "POST"]).toContain(request.method);
      expect(String(request.path ?? "").startsWith("/"), key).toBe(true);
    }
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

  it("only interpolates query placeholders that the operation schema declares", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as { query?: Record<string, string>; body?: Record<string, string>; path?: string };
      const schema = operation.inputSchema as { properties?: Record<string, unknown> };
      const templates = [
        ...Object.values(request.query ?? {}),
        ...Object.values(request.body ?? {}),
        String(request.path ?? ""),
      ];
      for (const template of templates) {
        for (const match of String(template).matchAll(/\{\{\s*([A-Za-z0-9_.$-]+)\s*\}\}/g)) {
          expect(schema.properties ?? {}, `${key} uses {{${match[1]}}}`).toHaveProperty(match[1]!);
        }
      }
    }
  });

  it("keeps every request on api.ahrefs.com", () => {
    for (const operation of Object.values(operations)) {
      const request = operation.request as Record<string, unknown>;
      const baseUrl = String(request.baseUrl ?? manifest.http.baseUrl);
      expect(new URL(baseUrl).hostname).toBe("api.ahrefs.com");
    }
  });

  it("compiles every operation into a handler", () => {
    const compiled = compileDeclarativeConnector(manifest as never);
    expect(Object.keys(compiled.actions).sort()).toEqual(Object.keys(operations).sort());
  });
});
