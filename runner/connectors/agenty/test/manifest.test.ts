import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import manifest from "../manifest.json";
import cover from "./composio-cover.json";

const recipePath = join(import.meta.dir, "../../../../scripts/connector-gen/openconnector/recipes/agenty/recipe.json");
const operations = manifest.operations as Record<string, Record<string, unknown>>;

describe("agenty manifest", () => {
  it("keeps connector identity, bun runtime, and api key auth", () => {
    expect(manifest.key).toBe("agenty");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.version).toBe("0.3.0");
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.http.baseUrl).toBe("https://api.agenty.com/v2");
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "X-Agenty-ApiKey",
      value: "{{apiKey}}",
    });
    expect(manifest.network.allowedHosts).toEqual(["api.agenty.com", "browser.agenty.com"]);
  });

  it("keeps recipe operations equal to runner operations", () => {
    expect(existsSync(recipePath)).toBe(true);
    const recipe = JSON.parse(readFileSync(recipePath, "utf8"));
    expect(Object.keys(manifest.operations).sort()).toEqual(Object.keys(recipe.manifest.operations).sort());
    expect([...recipe.selection.operations].sort()).toEqual(Object.keys(manifest.operations).sort());
    expect(Object.keys(recipe.operationSources).sort()).toEqual(Object.keys(manifest.operations).sort());
    expect(recipe.manifest.version).toBe("0.3.0");
  });

  it("declares title, description, object inputSchema, and a request for every action", () => {
    expect(Object.keys(operations).length).toBe(81);
    for (const [key, operation] of Object.entries(operations)) {
      expect(operation.kind, key).toBe("action");
      expect(String(operation.title ?? "").length, key).toBeGreaterThan(0);
      expect(String(operation.description ?? "").length, key).toBeGreaterThan(0);
      expect((operation.inputSchema as { type?: string }).type, key).toBe("object");
      expect(operation.request, `${key} must declare a request block`).toBeDefined();
      expect(["read", "write", "destructive"]).toContain(operation.sideEffect);
      expect(operation.enforceOutputSchema).toBe(true);
      expect(["json", "text"]).toContain(operation.responseFormat);
      expect(operation.validationMode).toBe("strict-generated");
      const request = operation.request as { method?: string; path?: string };
      expect(typeof request.method, key).toBe("string");
      expect(typeof request.path, key).toBe("string");
    }
  });

  it("covers every Composio Agenty tool with a real operation", () => {
    expect(Object.keys(cover).length).toBe(79);
    for (const [slug, op] of Object.entries(cover as Record<string, string>)) {
      expect(operations[op], `${slug} -> ${op}`).toBeDefined();
    }
  });
});
