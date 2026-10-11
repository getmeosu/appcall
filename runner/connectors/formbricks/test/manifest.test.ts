import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import manifest from "../manifest.json";
import cover from "./composio-cover.json";

const recipe = JSON.parse(
  readFileSync(join(import.meta.dir, "../../recipes/formbricks/recipe.json"), "utf8"),
) as {
  selection: { operations: string[] };
  manifest: { operations: Record<string, unknown> };
  operationSources: Record<string, unknown>;
};

const operations = manifest.operations as Record<string, Record<string, unknown>>;

describe("formbricks manifest", () => {
  it("keeps connector identity, bun runtime, and api key auth", () => {
    expect(manifest.key).toBe("formbricks");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.http.baseUrl).toBe("https://app.formbricks.com/api/v2");
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "x-api-key",
      value: "{{apiKey}}",
    });
    expect(manifest.network.allowedHosts).toEqual(["app.formbricks.com"]);
  });

  it("keeps recipe operations equal to runner operations", () => {
    expect(Object.keys(manifest.operations).sort()).toEqual(Object.keys(recipe.manifest.operations).sort());
    expect([...recipe.selection.operations].sort()).toEqual(Object.keys(manifest.operations).sort());
    expect(Object.keys(recipe.operationSources).sort()).toEqual(Object.keys(manifest.operations).sort());
  });

  it("declares title, description, object inputSchema, and a request for every action", () => {
    expect(Object.keys(operations).length).toBe(45);
    for (const [key, operation] of Object.entries(operations)) {
      expect(operation.kind, key).toBe("action");
      expect(String(operation.title ?? "").length, key).toBeGreaterThan(0);
      expect(String(operation.description ?? "").length, key).toBeGreaterThan(0);
      expect((operation.inputSchema as { type?: string }).type, key).toBe("object");
      expect(operation.request, `${key} must declare a request block`).toBeDefined();
      expect(["read", "write", "destructive"]).toContain(operation.sideEffect);
      expect(operation.enforceOutputSchema).toBe(true);
      expect(operation.responseFormat).toBe("json");
      expect(operation.validationMode).toBe("strict-generated");
    }
  });

  it("covers every Composio Formbricks tool with a real operation", () => {
    expect(Object.keys(cover).length).toBe(45);
    for (const [slug, op] of Object.entries(cover as Record<string, string>)) {
      expect(operations[op], `${slug} -> ${op}`).toBeDefined();
      expect((operations[op] as { request?: unknown }).request, slug).toBeDefined();
    }
  });
});
