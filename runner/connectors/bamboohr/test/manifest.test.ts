import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import mapping from "../fixtures/mapping.json";

const recipe = JSON.parse(
  readFileSync(join(import.meta.dir, "../../../../scripts/connector-gen/openconnector/recipes/bamboohr/recipe.json"), "utf8"),
);
const operations = manifest.operations as Record<string, Record<string, unknown>>;
const ORIGIN = ["healthcheck", "fields.list", "employees.list", "employees.get"] as const;

describe("bamboohr manifest", () => {
  it("keeps connector identity, bun runtime, and Basic apiKey:x auth", () => {
    expect(manifest.key).toBe("bamboohr");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.version).toBe("0.2.1");
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.http.baseUrl).toBe("https://{{companyDomain}}.bamboohr.com");
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "Authorization",
      basic: { username: "{{apiKey}}", password: "x" },
    });
    expect(manifest.network.allowedHosts).toEqual(["*.bamboohr.com"]);
    expect(manifest.provenance.source).toEqual({
      url: "https://github.com/oomol-lab/open-connector",
      revision: "33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a",
    });
  });

  it("keeps the origin four operations", () => {
    for (const key of ORIGIN) expect(operations[key], key).toBeDefined();
    expect((operations.healthcheck.request as { path: string }).path).toBe("/api/v1/company_information");
    expect((operations["employees.get"].request as { path: string }).path).toBe("/api/v1/employees/{{employeeId}}");
  });

  it("keeps recipe operations equal to runner operations", () => {
    expect(Object.keys(recipe.manifest.operations).sort()).toEqual(Object.keys(operations).sort());
    expect([...recipe.selection.operations].sort()).toEqual(Object.keys(operations).sort());
    expect(Object.keys(recipe.operationSources).sort()).toEqual(Object.keys(operations).sort());
  });

  it("covers all 42 Composio tools plus origin extras", () => {
    expect(Object.keys(operations)).toHaveLength(44);
    expect(Object.keys(mapping)).toHaveLength(42);
    for (const [slug, key] of Object.entries(mapping as Record<string, string>)) {
      expect(operations[key], slug).toBeDefined();
      expect((operations[key] as { request?: unknown }).request, slug).toBeDefined();
    }
  });

  it("gives every action title, description, object inputSchema, and a request", () => {
    for (const [key, operation] of Object.entries(operations)) {
      expect(operation.kind, key).toBe("action");
      expect(String(operation.title ?? "").length, key).toBeGreaterThan(0);
      expect(String(operation.description ?? "").length, key).toBeGreaterThan(0);
      expect((operation.inputSchema as { type?: string }).type, key).toBe("object");
      expect(operation.request, `${key} must declare a request block`).toBeDefined();
      expect(["read", "write"]).toContain(operation.sideEffect as string);
      expect(operation.enforceOutputSchema).toBe(true);
      expect(operation.responseFormat).toBe("json");
      expect(operation.validationMode).toBe("strict-generated");
    }
  });

  it("only interpolates path placeholders declared as required schema properties", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as Record<string, unknown>;
      const schema = operation.inputSchema as { properties?: Record<string, unknown>; required?: string[] };
      const placeholders = [...String(request.path ?? "").matchAll(/\{\{\s*([A-Za-z0-9_.$-]+)\s*\}\}/g)].map((match) => match[1]!);
      for (const placeholder of placeholders) {
        expect(schema.properties ?? {}, `${key} path uses {{${placeholder}}}`).toHaveProperty(placeholder);
        expect(schema.required ?? [], `${key} path uses {{${placeholder}}}`).toContain(placeholder);
      }
    }
  });

  it("compiles every operation into a handler", () => {
    const compiled = compileDeclarativeConnector(manifest as never);
    expect(Object.keys(compiled.actions).sort()).toEqual(Object.keys(operations).sort());
  });
});
