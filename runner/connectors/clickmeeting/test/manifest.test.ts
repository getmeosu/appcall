import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import cover from "./composio-cover.json";

const recipe = JSON.parse(readFileSync(join(import.meta.dir, "../../../../scripts/connector-gen/openconnector/recipes/clickmeeting/recipe.json"), "utf8"));
const operations = manifest.operations as Record<string, Record<string, unknown>>;

describe("clickmeeting manifest", () => {
  it("keeps connector identity, bun runtime, and API key auth", () => {
    expect(manifest.key).toBe("clickmeeting");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.http.baseUrl).toBe("https://api.clickmeeting.com/v1");
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "X-Api-Key",
      value: "{{apiKey}}",
    });
    expect(manifest.network.allowedHosts).toEqual(["api.clickmeeting.com"]);
  });

  it("keeps recipe operations equal to runner operations", () => {
    expect(Object.keys(manifest.operations).sort()).toEqual(Object.keys(recipe.manifest.operations).sort());
    expect([...recipe.selection.operations].sort()).toEqual(Object.keys(manifest.operations).sort());
    expect(Object.keys(recipe.operationSources).sort()).toEqual(Object.keys(manifest.operations).sort());
  });

  it("covers all 39 Composio tools plus origin recordings.list", () => {
    expect(Object.keys(cover)).toHaveLength(39);
    expect(Object.keys(operations)).toHaveLength(40);
    expect(operations.healthcheck).toBeDefined();
    expect(operations["recordings.list"]).toBeDefined();
    for (const [slug, op] of Object.entries(cover as Record<string, string>)) {
      expect(operations[op], `${slug} -> ${op}`).toBeDefined();
    }
  });

  it("gives every action a title, description, object inputSchema, and request block", () => {
    for (const [key, operation] of Object.entries(operations)) {
      expect(operation.kind, key).toBe("action");
      expect(String(operation.title ?? "").length, key).toBeGreaterThan(0);
      expect(String(operation.description ?? "").length, key).toBeGreaterThan(0);
      expect((operation.inputSchema as { type?: string }).type, key).toBe("object");
      expect(operation.request, `${key} must declare a request block`).toBeDefined();
      expect(["read", "write"]).toContain(operation.sideEffect);
      expect(operation.enforceOutputSchema).toBe(true);
      expect(operation.responseFormat).toBe("json");
      expect(operation.validationMode).toBe("strict-generated");
    }
  });

  it("only interpolates path placeholders declared on the operation schema", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as Record<string, unknown>;
      const schema = operation.inputSchema as { properties?: Record<string, unknown>; required?: string[] };
      const placeholders = [...String(request.path ?? "").matchAll(/\{\{\s*([A-Za-z0-9_.$-]+)\s*\}\}/g)].map((match) => match[1]!);
      for (const placeholder of placeholders) {
        expect(schema.properties ?? {}, `${key} path uses {{${placeholder}}}`).toHaveProperty(placeholder);
      }
    }
  });

  it("keeps every request on api.clickmeeting.com", () => {
    for (const operation of Object.values(operations)) {
      const request = operation.request as Record<string, unknown>;
      const baseUrl = String(request.baseUrl ?? manifest.http.baseUrl);
      expect(new URL(baseUrl).hostname).toBe("api.clickmeeting.com");
    }
  });

  it("compiles every operation into a handler", () => {
    const compiled = compileDeclarativeConnector(manifest as never);
    expect(Object.keys(compiled.actions).sort()).toEqual(Object.keys(operations).sort());
  });
});
