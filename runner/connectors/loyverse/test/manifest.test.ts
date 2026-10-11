import { describe, expect, it } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import recipe from "../../../../scripts/connector-gen/openconnector/recipes/loyverse/recipe.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;

describe("loyverse manifest", () => {
  it("declares the connector identity the control plane keys on", () => {
    expect(manifest.key).toBe("loyverse");
    expect(manifest.version).toBe("0.3.0");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.http.baseUrl).toBe("https://api.loyverse.com/v1.0");
    expect(manifest.http.auth.field).toBe("apiKey");
    expect(manifest.http.auth.value).toBe("Bearer {{apiKey}}");
    expect(manifest.network.allowedHosts).toEqual(["api.loyverse.com"]);
  });

  it("keeps recipe operations equal to runner operations", () => {
    expect(Object.keys(recipe.manifest.operations).sort()).toEqual(Object.keys(operations).sort());
    expect([...recipe.selection.operations].sort()).toEqual(Object.keys(operations).sort());
  });

  it("gives every action a real request, title, description, and object inputSchema", () => {
    expect(Object.keys(operations).length).toBe(58);
    for (const [key, operation] of Object.entries(operations)) {
      expect(operation.kind, key).toBe("action");
      expect(String(operation.title ?? "").length, key).toBeGreaterThan(0);
      expect(String(operation.description ?? "").length, key).toBeGreaterThan(0);
      expect((operation.inputSchema as { type?: string }).type, key).toBe("object");
      expect(operation.request, `${key} must declare a request block`).toBeDefined();
      expect((operation.request as { path?: string }).path, key).toBeDefined();
      expect(["read", "write", "destructive"]).toContain(operation.sideEffect as string);
      if (operation.kind === "webhook") {
        expect(operation.sideEffect).toBe("read");
      }
    }
  });

  it("compiles every operation into a handler", () => {
    const compiled = compileDeclarativeConnector(manifest as never);
    expect(Object.keys(compiled.actions).sort()).toEqual(Object.keys(operations).sort());
  });
});
