import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import manifest from "../manifest.json";
import mapping from "../fixtures/composio-mapping.json";

const recipe = JSON.parse(
  readFileSync(join(import.meta.dir, "../../../../scripts/connector-gen/openconnector/recipes/stannp/recipe.json"), "utf8"),
) as {
  selection: { operations: string[] };
  manifest: { operations: Record<string, unknown> };
};

const operations = manifest.operations as Record<string, Record<string, unknown>>;

describe("stannp manifest", () => {
  it("keeps the public api-key contract and pinned provenance", () => {
    expect(manifest.key).toBe("stannp");
    expect(manifest.visibility).toBe("public");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.http.auth.field).toBe("apiKey");
    expect(manifest.http.auth.basic).toEqual({ username: "{{apiKey}}", password: "" });
    expect(manifest.http.baseUrl).toBe("https://api-{{region}}1.stannp.com");
    expect(manifest.network.allowedHosts).toEqual(["api-eu1.stannp.com", "api-us1.stannp.com"]);
    expect(manifest.provenance).toEqual({
      source: { url: "https://github.com/oomol-lab/open-connector", revision: "33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a" },
    });
  });

  it("exposes every action as a real HTTP tool with title, description, and object inputSchema", () => {
    const actions = Object.entries(operations);
    expect(actions.length).toBe(34);
    expect(Object.keys(operations)).toContain("healthcheck");
    expect(Object.keys(operations)).toContain("groups.list");
    expect(Object.keys(operations)).toContain("letters.create");
    expect(Object.keys(operations)).toContain("postcards.create");
    expect(Object.keys(operations)).toContain("pdfs.merge");
    expect(Object.keys(operations)).toContain("accounts.balance.get");
    for (const [, operation] of actions) {
      expect(operation.kind).toBe("action");
      expect(["read", "write", "destructive"]).toContain(operation.sideEffect);
      expect(typeof operation.title).toBe("string");
      expect(String(operation.title).length).toBeGreaterThan(0);
      expect(typeof operation.description).toBe("string");
      expect(String(operation.description).length).toBeGreaterThan(0);
      const inputSchema = operation.inputSchema as { type?: string };
      expect(inputSchema?.type).toBe("object");
      const request = operation.request as { method?: string; path?: string } | undefined;
      expect(request?.method).toMatch(/^(GET|POST|PATCH|PUT|DELETE)$/);
      expect(typeof request?.path).toBe("string");
      expect(String(request?.path).length).toBeGreaterThan(0);
    }
  });

  it("maps every Composio Stannp tool onto a runner operation", () => {
    expect(mapping.composio_tools).toBe(32);
    expect(Object.keys(mapping.aligned).length).toBe(32);
    expect(mapping.skipped).toEqual({});
  });

  it("keeps recipe operations equal to runner operations", () => {
    expect(Object.keys(recipe.manifest.operations).sort()).toEqual(Object.keys(operations).sort());
    expect([...recipe.selection.operations].sort()).toEqual(Object.keys(operations).sort());
  });
});
