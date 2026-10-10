import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import cover from "./composio-cover.json";

const recipe = JSON.parse(
  readFileSync(join(import.meta.dir, "../../../../scripts/connector-gen/openconnector/recipes/amara/recipe.json"), "utf8"),
);
const operations = manifest.operations as Record<string, Record<string, unknown>>;
const ORIGIN = ["healthcheck", "languages.list", "teams.list", "videos.get", "videos.list"];

describe("amara manifest", () => {
  it("keeps connector identity, bun runtime, and api key auth", () => {
    expect(manifest.key).toBe("amara");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.http.baseUrl).toBe("https://amara.org/api");
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "x-api-key",
      value: "{{apiKey}}",
    });
    expect(manifest.network.allowedHosts).toEqual(["amara.org"]);
    expect(manifest.provenance.source.revision).toBe("33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a");
  });

  it("keeps origin/main operations and compiles every action", () => {
    for (const key of ORIGIN) expect(operations[key]).toBeDefined();
    expect((operations.healthcheck.request as { path: string }).path).toBe("/users/me/");
    expect((operations["videos.get"].request as { path: string }).path).toBe("/videos/{{videoId}}/");
    expect((operations["languages.list"].request as { path: string }).path).toBe("/languages/");
    expect((operations["teams.list"].request as { path: string }).path).toBe("/teams/");
    expect(Object.keys(operations)).toHaveLength(31);
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

  it("covers every Composio AMARA tool with a real operation", () => {
    expect(Object.keys(cover).length).toBe(30);
    for (const [slug, op] of Object.entries(cover as Record<string, string>)) {
      expect(operations[op], `${slug} -> ${op}`).toBeDefined();
      expect((operations[op] as { request?: unknown }).request, slug).toBeDefined();
    }
  });
});
