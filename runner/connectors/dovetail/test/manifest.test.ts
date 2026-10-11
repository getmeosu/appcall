import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import manifest from "../manifest.json";
import cover from "./composio-cover.json";

const recipe = JSON.parse(readFileSync(join(import.meta.dir, "../../../../scripts/connector-gen/openconnector/recipes/dovetail/recipe.json"), "utf8"));
const operations = manifest.operations as Record<string, Record<string, unknown>>;
const EXISTING = ["healthcheck", "projects.list", "data.list", "data.get"];

describe("dovetail manifest", () => {
  it("keeps connector identity, bun runtime, and api key auth", () => {
    expect(manifest.key).toBe("dovetail");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.http.baseUrl).toBe("https://dovetail.com/api");
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "Authorization",
      value: "Bearer {{apiKey}}",
    });
    expect(manifest.network.allowedHosts).toEqual(["dovetail.com"]);
  });

  it("keeps recipe operations equal to runner operations", () => {
    expect(Object.keys(manifest.operations).sort()).toEqual(Object.keys(recipe.manifest.operations).sort());
    expect([...recipe.selection.operations].sort()).toEqual(Object.keys(manifest.operations).sort());
    expect(Object.keys(recipe.operationSources).sort()).toEqual(Object.keys(manifest.operations).sort());
  });

  it("declares title, description, object inputSchema, and a request for every action", () => {
    expect(Object.keys(operations)).toHaveLength(51);
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
      const request = operation.request as { method?: string; path?: string };
      expect(request.method, key).toMatch(/^(GET|POST|PUT|PATCH|DELETE)$/);
      expect(String(request.path ?? "").length, key).toBeGreaterThan(0);
    }
  });

  it("keeps origin/main operations on their original paths", () => {
    for (const key of EXISTING) expect(operations[key]).toBeDefined();
    expect((operations.healthcheck.request as { path: string }).path).toBe("/v1/token/info");
    expect((operations["projects.list"].request as { path: string }).path).toBe("/v1/projects");
    expect((operations["data.list"].request as { path: string }).path).toBe("/v1/data");
    expect((operations["data.get"].request as { path: string }).path).toBe("/v1/data/{{dataId}}");
    expect(operations.healthcheck.sideEffect).toBe("read");
  });

  it("covers every Composio Dovetail tool with a real operation", () => {
    expect(Object.keys(cover).length).toBe(51);
    for (const [slug, op] of Object.entries(cover as Record<string, string>)) {
      expect(operations[op], `${slug} -> ${op}`).toBeDefined();
    }
  });
});
