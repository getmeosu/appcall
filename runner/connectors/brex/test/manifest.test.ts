import { describe, expect, it } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import { handwrittenActions } from "../src/actions";
import manifest from "../manifest.json";
import recipe from "../../../../scripts/connector-gen/openconnector/recipes/brex/recipe.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const handwritten = new Set(Object.keys(handwrittenActions));

describe("brex manifest", () => {
  it("declares the connector identity the control plane keys on", () => {
    expect(manifest.key).toBe("brex");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.http.baseUrl).toBe("https://api.brex.com");
    expect(manifest.http.auth.field).toBe("apiKey");
    expect(manifest.http.auth.value).toBe("Bearer {{apiKey}}");
    expect(manifest.network.allowedHosts).toEqual(["api.brex.com"]);
  });

  it("keeps recipe operations equal to runner operations", () => {
    expect(Object.keys(recipe.manifest.operations).sort()).toEqual(Object.keys(operations).sort());
    expect([...recipe.selection.operations].sort()).toEqual(Object.keys(operations).sort());
  });

  it("gives every action a title, description, object inputSchema, and request or handwritten handler", () => {
    expect(Object.keys(operations).length).toBe(85);
    for (const [key, operation] of Object.entries(operations)) {
      expect(operation.kind, key).toBe("action");
      expect(String(operation.title ?? "").length, key).toBeGreaterThan(0);
      expect(String(operation.description ?? "").length, key).toBeGreaterThan(0);
      expect((operation.inputSchema as { type?: string }).type, key).toBe("object");
      expect(["read", "write", "destructive"]).toContain(operation.sideEffect as string);
      if (operation.kind === "webhook") expect(operation.sideEffect).toBe("read");
      if (!handwritten.has(key)) {
        expect(operation.request, `${key} must declare a request block`).toBeDefined();
        expect((operation.request as { path?: string }).path, key).toBeDefined();
      }
    }
  });

  it("compiles declarative operations and overlays handwritten handlers", () => {
    const compiled = compileDeclarativeConnector(manifest as never);
    const merged = { ...compiled.actions, ...handwrittenActions };
    expect(Object.keys(merged).sort()).toEqual(Object.keys(operations).sort());
  });
});
