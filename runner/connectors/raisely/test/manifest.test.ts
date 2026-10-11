import { describe, expect, it } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import recipe from "../../../../scripts/connector-gen/openconnector/recipes/raisely/recipe.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const HANDWRITTEN = new Set(["campaigns.media.upload"]);

describe("raisely manifest", () => {
  it("declares the connector identity the control plane keys on", () => {
    expect(manifest.key).toBe("raisely");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.http.baseUrl).toBe("https://api.raisely.com/v3");
    expect(manifest.http.auth.field).toBe("apiKey");
    expect(manifest.http.auth.value).toBe("Bearer {{apiKey}}");
    expect(manifest.network.allowedHosts).toEqual(["api.raisely.com"]);
  });

  it("keeps recipe operations equal to runner operations", () => {
    expect(Object.keys(recipe.manifest.operations).sort()).toEqual(Object.keys(operations).sort());
    expect(recipe.selection.operations.sort()).toEqual(Object.keys(operations).sort());
  });

  it("maps every Composio RAISELY tool onto a real operation", () => {
    expect(Object.keys(operations).length).toBe(62);
    expect(operations["healthcheck"]).toBeDefined();
    expect(operations["campaigns.list"]).toBeDefined();
    expect(operations["campaigns.media.upload"]).toBeDefined();
    expect(operations["events.available"]).toBeDefined();
  });

  it("gives every action a title, description, object inputSchema, and request or handwritten handler", () => {
    for (const [key, operation] of Object.entries(operations)) {
      expect(operation.kind, key).toBe("action");
      expect(String(operation.title ?? "").length, key).toBeGreaterThan(0);
      expect(String(operation.description ?? "").length, key).toBeGreaterThan(0);
      expect((operation.inputSchema as { type?: string }).type, key).toBe("object");
      expect(["read", "write", "destructive"]).toContain(operation.sideEffect as string);
      if (!HANDWRITTEN.has(key)) {
        expect(operation.request, `${key} must declare a request block`).toBeDefined();
        expect((operation.request as { path?: string }).path, key).toBeDefined();
      }
    }
  });

  it("compiles every declarative operation into a handler", () => {
    const compiled = compileDeclarativeConnector(manifest as never);
    const expected = Object.keys(operations).filter((key) => !HANDWRITTEN.has(key)).sort();
    expect(Object.keys(compiled.actions).sort()).toEqual(expected);
  });
});
