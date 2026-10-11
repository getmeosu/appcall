import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import manifest from "../manifest.json";
import mapping from "../fixtures/composio-mapping.json";

const recipe = JSON.parse(
  readFileSync(join(import.meta.dir, "../../../../scripts/connector-gen/openconnector/recipes/bugsnag/recipe.json"), "utf8"),
) as {
  selection: { operations: string[] };
  manifest: { operations: Record<string, unknown> };
};

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const ORIGIN = ["healthcheck", "organizations.list", "projects.list", "errors.list", "errors.get"];

describe("bugsnag manifest", () => {
  it("keeps the public token contract and pinned provenance", () => {
    expect(manifest.key).toBe("bugsnag");
    expect(manifest.visibility).toBe("public");
    expect(manifest.version).toBe("0.3.0");
    expect(manifest.http.auth.field).toBe("apiKey");
    expect(manifest.http.auth.value).toBe("token {{apiKey}}");
    expect(manifest.network.allowedHosts).toEqual(["api.bugsnag.com"]);
    expect(manifest.http.baseUrl).toBe("https://api.bugsnag.com");
    expect(manifest.provenance.source.revision).toBe("33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a");
    expect(manifest.evidence.live.status).toBe("unverified");
  });

  it("keeps origin/main operations and expands to Composio coverage", () => {
    for (const key of ORIGIN) expect(operations[key]).toBeDefined();
    expect(operations.healthcheck.request.path).toBe("/user");
    expect(operations["organizations.list"].request.path).toBe("/user/organizations");
    expect(operations["projects.list"].request.path).toBe("/organizations/{{organization_id}}/projects");
    expect(operations["errors.list"].request.path).toBe("/projects/{{project_id}}/errors");
    expect(operations["errors.get"].request.path).toBe("/projects/{{project_id}}/errors/{{error_id}}");
    expect(Object.keys(operations)).toHaveLength(62);
  });

  it("exposes every action as a real HTTP tool with title, description, and object inputSchema", () => {
    for (const [, operation] of Object.entries(operations)) {
      expect(operation.kind).toBe("action");
      expect(["read", "write", "destructive"]).toContain(operation.sideEffect);
      expect(typeof operation.title).toBe("string");
      expect(String(operation.title).length).toBeGreaterThan(0);
      expect(typeof operation.description).toBe("string");
      expect(String(operation.description).length).toBeGreaterThan(0);
      expect((operation.inputSchema as { type?: string })?.type).toBe("object");
      const request = operation.request as { method?: string; path?: string };
      expect(request?.method).toMatch(/^(GET|POST|PATCH|PUT|DELETE)$/);
      expect(typeof request?.path).toBe("string");
      expect(String(request.path).length).toBeGreaterThan(0);
    }
  });

  it("maps every Composio BUGSNAG tool onto a runner operation", () => {
    expect(mapping.composio_tools).toBe(60);
    expect(Object.keys(mapping.aligned).length).toBe(60);
    expect(mapping.aligned.BUGSNAG_LIST_ORGANIZATIONS).toBe("organizations.list");
    expect(mapping.aligned.BUGSNAG_CREATE_ORGANIZATION_PROJECT).toBe("projects.create");
    expect(mapping.aligned.BUGSNAG_BULK_UPDATE_ERRORS).toBe("errors.bulk-update");
    expect(Object.keys(mapping.skipped)).toEqual([]);
  });

  it("keeps recipe operations equal to runner operations", () => {
    expect(Object.keys(recipe.manifest.operations).sort()).toEqual(Object.keys(operations).sort());
    expect([...recipe.selection.operations].sort()).toEqual(Object.keys(operations).sort());
  });
});
