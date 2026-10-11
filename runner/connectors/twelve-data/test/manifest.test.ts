import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import manifest from "../manifest.json";
import mapping from "../fixtures/composio-mapping.json";

const recipePath = join(import.meta.dir, "../../recipes/twelve_data/recipe.json");
const operations = manifest.operations as Record<string, Record<string, unknown>>;

describe("twelve-data manifest", () => {
  it("keeps the connector identity and bumps the deepened version", () => {
    expect(manifest.key).toBe("twelve-data");
    expect(manifest.version).toBe("0.3.0");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.categories).toEqual(["banking-data"]);
  });

  it("still authenticates with Authorization apikey on api.twelvedata.com", () => {
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.http.auth.field).toBe("apiKey");
    expect(manifest.http.auth.name).toBe("Authorization");
    expect(manifest.http.auth.value).toBe("apikey {{apiKey}}");
    expect(manifest.http.baseUrl).toBe("https://api.twelvedata.com");
    expect(manifest.network.allowedHosts).toEqual(["api.twelvedata.com"]);
  });

  it("exposes every action as a real HTTP tool with title, description, and object inputSchema", () => {
    const keys = Object.keys(operations);
    expect(keys).toContain("healthcheck");
    expect(keys).toContain("quote.get");
    expect(keys).toContain("quote.batch");
    expect(keys).toContain("cash_flow.get");
    expect(keys).toContain("options.chain.get");
    expect(keys).toContain("technical_indicators.get");
    expect(keys.length).toBe(110);
    for (const [key, operation] of Object.entries(operations)) {
      expect(operation.kind).toBe("action");
      expect(operation.sideEffect).toBe("read");
      expect(typeof operation.title).toBe("string");
      expect(String(operation.title).length).toBeGreaterThan(0);
      expect(typeof operation.description).toBe("string");
      expect(String(operation.description).length).toBeGreaterThan(0);
      const inputSchema = operation.inputSchema as { type?: string };
      expect(inputSchema.type).toBe("object");
      expect(operation.request).toBeDefined();
      const request = operation.request as { method?: string; path?: string };
      expect(request.method).toBe("GET");
      expect(typeof request.path).toBe("string");
      expect(String(request.path).length).toBeGreaterThan(0);
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
    expect(recipe.manifest.version).toBe("0.3.0");
    expect(Object.keys(recipe.manifest.operations).sort()).toEqual(runnerOps);
    expect([...recipe.selection.operations].sort()).toEqual(runnerOps);
    expect(Object.keys(recipe.operationSources).sort()).toEqual(runnerOps);
  });

  it("accounts for every Composio Twelve Data tool", () => {
    expect(mapping.composio_tools).toBe(107);
    expect(mapping.mapped.length + mapping.partial.length + mapping.missing.length).toBe(107);
    expect(mapping.mapped.length).toBe(107);
    expect(mapping.missing).toEqual([]);
  });
});
