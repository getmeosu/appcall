import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import manifest from "../manifest.json";
import mapping from "../fixtures/composio-mapping.json";

const recipePath = join(import.meta.dir, "../../../../scripts/connector-gen/openconnector/recipes/faraday/recipe.json");
const operations = manifest.operations as Record<string, Record<string, unknown>>;

describe("faraday manifest", () => {
  it("keeps the connector identity and bumps the deepened version", () => {
    expect(manifest.key).toBe("faraday");
    expect(manifest.version).toBe("0.3.0");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.categories).toEqual(["crm"]);
  });

  it("still authenticates with a Faraday API key bearer token", () => {
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.http.auth.field).toBe("apiKey");
    expect(manifest.http.auth.name).toBe("Authorization");
    expect(manifest.http.auth.value).toBe("Bearer {{apiKey}}");
    expect(manifest.http.baseUrl).toBe("https://api.faraday.ai/v1");
    expect(manifest.network.allowedHosts).toEqual(["api.faraday.ai"]);
  });

  it("exposes every action as a real HTTP tool with title, description, and object inputSchema", () => {
    const keys = Object.keys(operations);
    expect(keys.length).toBe(121);
    expect(keys).toContain("healthcheck");
    expect(keys).toContain("accounts.current");
    expect(keys).toContain("datasets.archive");
    expect(keys).toContain("scopes.create");
    expect(keys).toContain("traits.csv");
    expect(keys).toContain("uploads.delete");
    for (const [key, operation] of Object.entries(operations)) {
      expect(operation.kind).toBe("action");
      expect(operation.sideEffect).toMatch(/^(read|write|destructive)$/);
      expect(typeof operation.title).toBe("string");
      expect(String(operation.title).length).toBeGreaterThan(0);
      expect(typeof operation.description).toBe("string");
      expect(String(operation.description).length).toBeGreaterThan(0);
      const inputSchema = operation.inputSchema as { type?: string };
      expect(inputSchema.type).toBe("object");
      expect(operation.request).toBeDefined();
      const request = operation.request as { method?: string; path?: string };
      expect(typeof request.method).toBe("string");
      expect(typeof request.path).toBe("string");
      expect(request.path.length).toBeGreaterThan(0);
    }
  });

  it("classifies mutating HTTP methods as write or destructive", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const method = String((operation.request as { method?: string }).method);
      if (method === "DELETE") expect(operation.sideEffect, key).toBe("destructive");
      else if (["POST", "PUT", "PATCH"].includes(method)) expect(operation.sideEffect, key).toBe("write");
      else expect(operation.sideEffect, key).toBe("read");
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

  it("accounts for every Composio Faraday tool", () => {
    expect(mapping.composio_tools).toBe(117);
    expect(mapping.mapped.length).toBe(117);
    expect(mapping.unmapped_composio).toEqual([]);
    const mappedOps = new Set(mapping.mapped.map((row: { operation: string }) => row.operation));
    for (const row of mapping.mapped as { composio: string; operation: string }[]) {
      expect(operations[row.operation], row.composio).toBeDefined();
      expect(mappedOps.has(row.operation)).toBe(true);
    }
  });
});
