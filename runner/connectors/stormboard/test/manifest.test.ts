import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import cover from "./composio-cover.json";

const recipe = JSON.parse(
  readFileSync(join(import.meta.dir, "../../../../scripts/connector-gen/openconnector/recipes/stormboard/recipe.json"), "utf8"),
);
const operations = manifest.operations as Record<string, Record<string, unknown>>;

describe("stormboard manifest", () => {
  it("declares the connector identity the control plane keys on", () => {
    expect(manifest.key).toBe("stormboard");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.categories).toEqual(["productivity"]);
  });

  it("collects the API key under the field the request template reads", () => {
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.http.auth.field).toBe("apiKey");
    expect(manifest.http.auth.name).toBe("X-API-Key");
    expect(manifest.http.auth.value).toBe("{{apiKey}}");
    expect(manifest.http.baseUrl).toBe("https://api.stormboard.com");
    expect(manifest.network.allowedHosts).toContain("api.stormboard.com");
  });

  it("keeps recipe operations equal to runner operations", () => {
    expect(Object.keys(recipe.manifest.operations).sort()).toEqual(Object.keys(operations).sort());
    expect([...recipe.selection.operations].sort()).toEqual(Object.keys(operations).sort());
    expect(Object.keys(recipe.operationSources).sort()).toEqual(Object.keys(operations).sort());
  });

  it("covers all 41 Composio tools plus origin template ops and healthcheck", () => {
    expect(Object.keys(cover)).toHaveLength(41);
    expect(Object.keys(operations)).toHaveLength(43);
    for (const [slug, op] of Object.entries(cover as Record<string, string>)) {
      expect(operations[op], `${slug} -> ${op}`).toBeDefined();
    }
    expect(operations.healthcheck).toBeDefined();
    expect(operations["templates.list"]).toBeDefined();
    expect(operations["templates.categories.list"]).toBeDefined();
  });

  it("gives every action the limits and tool schema the MCP gateway requires", () => {
    for (const [key, operation] of Object.entries(operations)) {
      expect(operation.kind, key).toBe("action");
      expect(operation.timeoutMs as number).toBeGreaterThan(0);
      expect(operation.maxInputBytes as number).toBeGreaterThan(0);
      expect(operation.maxResponseBytes as number).toBeGreaterThan(0);
      expect(String(operation.title ?? "").length, key).toBeGreaterThan(0);
      expect(String(operation.description ?? "").length, key).toBeGreaterThan(0);
      expect((operation.inputSchema as Record<string, unknown>).type, key).toBe("object");
      expect(["read", "write"]).toContain(operation.sideEffect as string);
      expect(operation.request, `${key} must declare a request block`).toBeDefined();
    }
  });

  it("only interpolates path placeholders that the operation schema declares", () => {
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

  it("compiles as a declarative connector", () => {
    const compiled = compileDeclarativeConnector(manifest as never);
    expect(compiled.key).toBe("stormboard");
    expect(Object.keys(compiled.actions).sort()).toEqual(Object.keys(operations).sort());
  });
});
