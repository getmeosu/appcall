import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import mapping from "../fixtures/mapping.json";

const recipePath = "scripts/connector-gen/openconnector/recipes/bamboohr/recipe.json";
const operations = manifest.operations as Record<string, Record<string, unknown>>;
const ORIGIN = ["healthcheck", "fields.list", "employees.list", "employees.get"] as const;

// ops the pinned recipe has real provenance for
const PINNED_OPS = [
  "ats.create_candidate",
  "ats.create_job_opening",
  "ats.get_applications",
  "ats.get_hiring_leads",
  "ats.get_job_summaries",
  "ats.get_statuses",
  "benefit.get_coverages",
  "benefit.get_member_events",
  "company.get_eins",
  "datasets.list",
  "dependents.create",
  "dependents.get_all",
  "employees.changed",
  "employees.create",
  "employees.custom_fields",
  "employees.directory",
  "employees.files.create_category",
  "employees.get",
  "employees.list",
  "employees.photo",
  "employees.update",
  "fields.list",
  "files.create_category",
  "files.list",
  "files.upload",
  "healthcheck",
  "lists.list",
  "meta.countries",
  "meta.departments",
  "meta.divisions",
  "meta.employment_statuses",
  "meta.job_titles",
  "meta.locations",
  "reports.custom",
  "reports.get",
  "reports.list",
  "tables.list",
  "timeOff.balances",
  "timeOff.changeStatus",
  "timeOff.policies",
  "timeOff.request",
  "timeOff.requests",
  "timeOff.types",
  "users.list",
];
// ops this branch added from the provider's live API; no pinned action id exists
const DEEPENED_OPS = ["meta.countries.options", "reports.custom.list"];

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

  it("recipe mirrors the deepened operations; provenance mappings stay pinned", () => {
    expect(existsSync(recipePath)).toBe(true);
    const recipe = JSON.parse(readFileSync(recipePath, "utf8")) as {
      selection: { operations: string[] };
      operationSources: Record<string, unknown>;
      manifest: { operations: Record<string, unknown>; version: string };
    };
    const runnerOps = Object.keys(operations).sort();
    const recipeOps = Object.keys(recipe.manifest.operations).sort();
    expect(recipe.manifest.version).toBe("0.2.0");
    expect(recipeOps).toHaveLength(46);
    expect(runnerOps).toEqual(recipeOps);
    expect([...recipe.selection.operations].sort()).toEqual(PINNED_OPS);
    expect(Object.keys(recipe.operationSources).sort()).toEqual(PINNED_OPS);
    expect(runnerOps.filter((key) => !Object.hasOwn(recipe.operationSources, key))).toEqual(DEEPENED_OPS);
    for (const key of recipeOps) {
      expect(operations[key], key).toEqual(recipe.manifest.operations[key]);
    }
  });

  it("covers all 42 Composio tools plus origin extras and the two new routes", () => {
    expect(Object.keys(operations)).toHaveLength(46);
    expect(Object.keys(mapping)).toHaveLength(42);
    for (const [slug, key] of Object.entries(mapping as Record<string, string>)) {
      expect(operations[key], slug).toBeDefined();
      expect((operations[key] as { request?: unknown }).request, slug).toBeDefined();
    }
  });

  it("adds body-less GETs for saved custom reports and country options", () => {
    const sibling = operations["reports.list"]!;
    const customList = operations["reports.custom.list"]!;
    const countries = operations["meta.countries.options"]!;
    expect((operations["reports.list"]!.request as { method: string; path: string }).path).toBe("/api/v1/meta/reports");
    expect((operations["reports.custom"]!.request as { method: string; path: string })).toMatchObject({
      method: "POST",
      path: "/api/v1/reports/custom",
    });
    expect((operations["meta.countries"]!.request as { path: string }).path).toBe("/api/v1/meta/lists");
    expect((operations["company.get_eins"]!.request as { method: string; path: string })).toMatchObject({
      method: "GET",
      path: "/api/v1/company/eins",
    });
    expect((customList.request as { method: string; path: string; success: number[]; body?: unknown; headers?: unknown })).toEqual({
      method: "GET",
      path: "/api/v1/custom-reports",
      success: [200],
      query: { page: "{{page}}", page_size: "{{page_size}}" },
    });
    expect((countries.request as { method: string; path: string; success: number[]; query?: unknown; body?: unknown; headers?: unknown })).toEqual({
      method: "GET",
      path: "/api/v1/meta/countries/options",
      success: [200],
    });
    for (const operation of [customList, countries]) {
      expect(operation.timeoutMs).toBe(sibling.timeoutMs);
      expect(operation.maxInputBytes).toBe(sibling.maxInputBytes);
      expect(operation.maxResponseBytes).toBe(sibling.maxResponseBytes);
      expect(operation.responseFormat).toBe("json");
      expect(operation.validationMode).toBe("strict-generated");
      expect(operation.enforceOutputSchema).toBe(true);
      expect(operation.sideEffect).toBe("read");
    }
    const countryData = (countries.outputSchema as { properties: { data: { type: string; items: { type: string; additionalProperties: boolean } } } }).properties.data;
    expect(countryData.type).toBe("array");
    expect(countryData.items.type).toBe("object");
    expect(countryData.items.additionalProperties).toBe(true);
    expect((countries.outputSchema as { type: string }).type).toBe("object");
    expect((customList.outputSchema as { type: string }).type).toBe("object");
    const page = (customList.inputSchema as { properties: Record<string, { type: string; minimum?: number; maximum?: number }>; required?: string[] }).properties.page;
    const pageSize = (customList.inputSchema as { properties: Record<string, { type: string; minimum?: number; maximum?: number }>; required?: string[] }).properties.page_size;
    expect(page).toEqual({ type: "integer", minimum: 1 });
    expect(pageSize).toEqual({ type: "integer", minimum: 1, maximum: 1000 });
    expect((customList.inputSchema as { required?: string[] }).required ?? []).not.toContain("page");
    expect((customList.inputSchema as { required?: string[] }).required ?? []).not.toContain("page_size");
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
