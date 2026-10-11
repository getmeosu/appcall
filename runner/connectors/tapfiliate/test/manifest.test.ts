import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import cover from "./composio-cover.json";

const recipe = JSON.parse(
  readFileSync(join(import.meta.dir, "../../../../scripts/connector-gen/openconnector/recipes/tapfiliate/recipe.json"), "utf8"),
);
const operations = manifest.operations as Record<string, Record<string, unknown>>;

describe("tapfiliate manifest", () => {
  it("keeps connector identity, bun runtime, and api key auth", () => {
    expect(manifest.key).toBe("tapfiliate");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.http.baseUrl).toBe("https://api.tapfiliate.com/1.6");
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "X-Api-Key",
      value: "{{apiKey}}",
    });
    expect(manifest.network.allowedHosts).toEqual(["api.tapfiliate.com"]);
  });

  it("is a fixed-host declarative connector with mixed read and write ops", () => {
    const ops = Object.values(operations);
    expect(ops.every((op) => op.kind === "action")).toBe(true);
    expect(ops.some((op) => op.sideEffect === "write")).toBe(true);
    expect(ops.some((op) => op.sideEffect === "destructive")).toBe(true);
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  it("keeps recipe operations equal to runner operations", () => {
    expect(Object.keys(manifest.operations).sort()).toEqual(Object.keys(recipe.manifest.operations).sort());
    expect(recipe.selection.operations.sort()).toEqual(Object.keys(manifest.operations).sort());
    expect(Object.keys(recipe.operationSources).sort()).toEqual(Object.keys(manifest.operations).sort());
  });

  it("declares title, description, object inputSchema, and a request for every action", () => {
    for (const [key, operation] of Object.entries(operations)) {
      expect(operation.kind, key).toBe("action");
      expect(String(operation.title ?? "").length, key).toBeGreaterThan(0);
      expect(String(operation.description ?? "").length, key).toBeGreaterThan(0);
      expect((operation.inputSchema as { type?: string }).type, key).toBe("object");
      expect(operation.request, `${key} must declare a request block`).toBeDefined();
      expect(["read", "write", "destructive"]).toContain(operation.sideEffect);
      expect(operation.enforceOutputSchema).toBe(true);
    }
  });

  it("covers every Composio Tapfiliate tool with a real operation", () => {
    expect(Object.keys(cover).length).toBe(40);
    for (const [slug, op] of Object.entries(cover as Record<string, string>)) {
      expect(operations[op], `${slug} -> ${op}`).toBeDefined();
      expect((operations[op] as { request?: unknown }).request, slug).toBeDefined();
    }
  });
});
