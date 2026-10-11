import { describe, expect, it } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import recipe from "../../../../scripts/connector-gen/openconnector/recipes/next_dns/recipe.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;

describe("next-dns manifest", () => {
  it("declares the connector identity the control plane keys on", () => {
    expect(manifest.key).toBe("next-dns");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.http.baseUrl).toBe("https://api.nextdns.io");
    expect(manifest.http.auth.field).toBe("apiKey");
    expect(manifest.http.auth.name).toBe("X-Api-Key");
    expect(manifest.network.allowedHosts).toEqual(["api.nextdns.io"]);
    expect(manifest.provenance).toEqual({
      source: { url: "https://github.com/oomol-lab/open-connector", revision: "33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a" },
    });
  });

  it("keeps recipe operations equal to runner operations", () => {
    expect(Object.keys(recipe.manifest.operations).sort()).toEqual(Object.keys(operations).sort());
    expect([...recipe.selection.operations].sort()).toEqual(Object.keys(operations).sort());
  });

  it("gives every action a real request, title, description, and object inputSchema", () => {
    expect(Object.keys(operations).length).toBe(69);
    for (const [key, operation] of Object.entries(operations)) {
      expect(operation.kind, key).toBe("action");
      expect(String(operation.title ?? "").length, key).toBeGreaterThan(0);
      expect(String(operation.description ?? "").length, key).toBeGreaterThan(0);
      expect((operation.inputSchema as { type?: string }).type, key).toBe("object");
      expect(operation.request, `${key} must declare a request block`).toBeDefined();
      expect((operation.request as { path?: string }).path, key).toBeDefined();
      expect(["read", "write", "destructive"]).toContain(operation.sideEffect as string);
    }
  });

  it("compiles every operation into a handler", () => {
    const compiled = compileDeclarativeConnector(manifest as never);
    expect(Object.keys(compiled.actions).sort()).toEqual(Object.keys(operations).sort());
  });
});
