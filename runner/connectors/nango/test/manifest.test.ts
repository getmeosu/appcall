import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import cover from "./composio-cover.json";

const recipe = JSON.parse(
  readFileSync(join(import.meta.dir, "../../../../scripts/connector-gen/openconnector/recipes/nango/recipe.json"), "utf8"),
);
const operations = manifest.operations as Record<string, Record<string, unknown>>;

describe("nango manifest", () => {
  it("keeps connector identity, bun runtime, and api key auth", () => {
    expect(manifest.key).toBe("nango");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.http.baseUrl).toBe("https://api.nango.dev");
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "Authorization",
      value: "Bearer {{apiKey}}",
    });
    expect(manifest.network.allowedHosts).toEqual(["api.nango.dev"]);
  });

  it("keeps recipe operations equal to runner operations", () => {
    expect(Object.keys(manifest.operations).sort()).toEqual(Object.keys(recipe.manifest.operations).sort());
    expect([...recipe.selection.operations].sort()).toEqual(Object.keys(manifest.operations).sort());
    expect(Object.keys(recipe.operationSources).sort()).toEqual(Object.keys(manifest.operations).sort());
  });

  it("covers all 24 Composio tools plus healthcheck", () => {
    expect(Object.keys(operations)).toHaveLength(24);
    expect(Object.keys(cover)).toHaveLength(24);
    expect(operations.healthcheck).toBeDefined();
    for (const [slug, op] of Object.entries(cover as Record<string, string>)) {
      expect(operations[op], `${slug} -> ${op}`).toBeDefined();
    }
  });

  it("gives every action title, description, object inputSchema, and a request", () => {
    for (const [key, operation] of Object.entries(operations)) {
      expect(operation.kind, key).toBe("action");
      expect(operation.timeoutMs as number).toBeGreaterThan(0);
      expect(operation.maxInputBytes as number).toBeGreaterThan(0);
      expect(operation.maxResponseBytes as number).toBeGreaterThan(0);
      expect(String(operation.title ?? "").length, key).toBeGreaterThan(0);
      expect(String(operation.description ?? "").length, key).toBeGreaterThan(0);
      expect((operation.inputSchema as { type?: string }).type, key).toBe("object");
      expect(["read", "write"]).toContain(operation.sideEffect as string);
      expect(operation.request, `${key} must declare a request block`).toBeDefined();
      expect(operation.enforceOutputSchema).toBe(true);
      expect(operation.responseFormat).toBe("json");
      expect(operation.validationMode).toBe("strict-generated");
    }
  });

  it("only interpolates path placeholders declared by the schema", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as Record<string, unknown>;
      const schema = operation.inputSchema as { properties?: Record<string, unknown>; required?: string[] };
      const placeholders = [...String(request.path ?? "").matchAll(/\{\{\s*([A-Za-z0-9_.$-]+)\s*\}\}/g)].map(
        (match) => match[1]!,
      );
      for (const placeholder of placeholders) {
        expect(schema.properties ?? {}, `${key} path uses {{${placeholder}}}`).toHaveProperty(placeholder);
        expect(schema.required ?? [], `${key} path uses {{${placeholder}}}`).toContain(placeholder);
      }
    }
  });

  it("keeps every request on api.nango.dev", () => {
    for (const operation of Object.values(operations)) {
      const request = operation.request as Record<string, unknown>;
      const baseUrl = String(request.baseUrl ?? manifest.http.baseUrl);
      expect(new URL(baseUrl).hostname).toBe("api.nango.dev");
    }
  });

  it("compiles every operation into a handler", () => {
    const compiled = compileDeclarativeConnector(manifest as never);
    expect(Object.keys(compiled.actions).sort()).toEqual(Object.keys(operations).sort());
  });
});
