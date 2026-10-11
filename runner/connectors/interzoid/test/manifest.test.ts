import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import manifest from "../manifest.json";
import mapping from "../fixtures/composio-mapping.json";

const recipePath = join(import.meta.dir, "../../../../scripts/connector-gen/openconnector/recipes/interzoid/recipe.json");
const operations = manifest.operations as Record<string, Record<string, unknown>>;

describe("interzoid manifest", () => {
  it("keeps the connector identity and bumps the deepened version", () => {
    expect(manifest.key).toBe("interzoid");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.categories).toEqual(["utility"]);
  });

  it("still authenticates with a license query parameter", () => {
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.http.auth.field).toBe("apiKey");
    expect(manifest.http.auth.in).toBe("query");
    expect(manifest.http.auth.name).toBe("license");
    expect(manifest.http.auth.value).toBe("{{apiKey}}");
    expect(manifest.http.baseUrl).toBe("https://api.interzoid.com");
    expect(manifest.network.allowedHosts).toEqual(["api.interzoid.com"]);
  });

  it("exposes every action as a real HTTP tool with title, description, and object inputSchema", () => {
    const keys = Object.keys(operations).sort();
    expect(keys.length).toBe(30);
    expect(keys).toContain("healthcheck");
    expect(keys).toContain("credits.get");
    expect(keys).toContain("address.parse");
    expect(keys).toContain("custom.data");
    expect(keys).toContain("page.global_load");
    expect(keys).toContain("translate.to_any");
    for (const [key, operation] of Object.entries(operations)) {
      expect(operation.kind, key).toBe("action");
      expect(operation.sideEffect, key).toBe("read");
      expect(typeof operation.title, key).toBe("string");
      expect(String(operation.title).length, key).toBeGreaterThan(0);
      expect(typeof operation.description, key).toBe("string");
      expect(String(operation.description).length, key).toBeGreaterThan(0);
      const inputSchema = operation.inputSchema as { type?: string };
      expect(inputSchema.type, key).toBe("object");
      expect(operation.request, key).toBeDefined();
      const request = operation.request as { method?: string; path?: string };
      expect(request.method, key).toBe("GET");
      expect(typeof request.path, key).toBe("string");
      expect(String(request.path).startsWith("/"), key).toBe(true);
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

  it("accounts for every documented Composio Interzoid HTTP tool", () => {
    expect(mapping.composio_tools).toBe(30);
    expect(mapping.mapped.length).toBe(29);
    expect(mapping.unmapped_composio).toEqual(["INTERZOID_GET_LICENSE"]);
    for (const row of mapping.mapped as { composio: string; operation: string }[]) {
      expect(operations[row.operation], row.composio).toBeDefined();
    }
  });
});
