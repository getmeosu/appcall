import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import manifest from "../manifest.json";
import recipe from "../../../../scripts/connector-gen/openconnector/recipes/affinda/recipe.json";
import mapping from "../fixtures/composio-mapping.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const recipeOps = recipe.manifest.operations as Record<string, Record<string, unknown>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

const origin = [
  "healthcheck",
  "organizations.list",
  "organizations.get",
  "workspaces.list",
  "workspaces.get",
  "workspaces.create",
  "workspaces.update",
  "workspaces.delete",
  "document-types.list",
  "document-types.get",
  "documents.list",
  "documents.get",
  "documents.update",
  "documents.delete",
  "tags.list",
  "tags.get",
  "tags.create",
  "usage.get",
  "resthooks.list",
  "resthooks.get",
] as const;

// ops the pinned recipe has real provenance for
const PINNED_OPS = [
  "annotations.batchCreate",
  "annotations.batchDelete",
  "annotations.batchUpdate",
  "annotations.list",
  "annotations.update",
  "api-users.create",
  "api-users.list",
  "collections.create",
  "collections.createDataField",
  "collections.delete",
  "collections.get",
  "collections.getField",
  "collections.list",
  "collections.update",
  "collections.updateField",
  "collections.usage",
  "data-point-choices.create",
  "data-point-choices.get",
  "data-point-choices.list",
  "data-point-choices.replace",
  "data-point-choices.update",
  "data-points.create",
  "data-points.delete",
  "data-points.get",
  "data-points.list",
  "data-points.update",
  "data-sources.create",
  "data-sources.createValue",
  "data-sources.delete",
  "data-sources.deleteValue",
  "data-sources.get",
  "data-sources.getValue",
  "data-sources.list",
  "data-sources.listValues",
  "data-sources.replaceValues",
  "data-sources.updateValue",
  "document-splitters.get",
  "document-splitters.list",
  "document-types.create",
  "document-types.delete",
  "document-types.get",
  "document-types.jsonSchema",
  "document-types.list",
  "document-types.pydanticModels",
  "document-types.update",
  "documents.addTag",
  "documents.create",
  "documents.createFromData",
  "documents.delete",
  "documents.get",
  "documents.list",
  "documents.redacted",
  "documents.removeTag",
  "documents.split",
  "documents.update",
  "documents.updateData",
  "extractors.create",
  "extractors.delete",
  "extractors.get",
  "extractors.list",
  "extractors.update",
  "healthcheck",
  "indexes.create",
  "indexes.delete",
  "indexes.list",
  "indexes.listDocuments",
  "indexes.update",
  "invitations.create",
  "invitations.delete",
  "invitations.get",
  "invitations.list",
  "invitations.update",
  "job-description-search.create",
  "job-description-search.embed",
  "job-description-search.getConfig",
  "job-description-search.updateConfig",
  "mappings.create",
  "mappings.delete",
  "mappings.get",
  "mappings.list",
  "mappings.update",
  "occupation-groups.list",
  "organization-memberships.get",
  "organization-memberships.list",
  "organization-memberships.update",
  "organizations.create",
  "organizations.delete",
  "organizations.get",
  "organizations.list",
  "organizations.update",
  "resthooks.create",
  "resthooks.delete",
  "resthooks.get",
  "resthooks.list",
  "resthooks.update",
  "resume-search.create",
  "resume-search.embed",
  "resume-search.getConfig",
  "resume-search.suggestJobTitles",
  "resume-search.suggestSkills",
  "resume-search.updateConfig",
  "tags.create",
  "tags.delete",
  "tags.get",
  "tags.list",
  "tags.update",
  "usage.get",
  "validation-results.batchCreate",
  "validation-results.batchDelete",
  "validation-results.create",
  "validation-results.list",
  "workspace-memberships.create",
  "workspace-memberships.delete",
  "workspace-memberships.get",
  "workspace-memberships.list",
  "workspaces.create",
  "workspaces.delete",
  "workspaces.get",
  "workspaces.list",
  "workspaces.update",
];
// ops this branch added from the provider's live API; no pinned action id exists
const DEEPENED_OPS = ["AFFINDA_GET_USAGE_BY_WORKSPACE"];

describe("affinda manifest", () => {
  it("keeps the origin identity and bumps the deepened version", () => {
    expect(manifest.key).toBe("affinda");
    expect(manifest.name).toBe("Affinda");
    expect(manifest.version).toBe("0.3.1");
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.http.baseUrl).toBe("https://{{region}}.affinda.com");
    expect(manifest.http.auth.value).toBe("Bearer {{apiKey}}");
    expect(manifest.network.allowedHosts).toEqual([
      "api.affinda.com",
      "api.us1.affinda.com",
      "api.eu1.affinda.com",
    ]);
    expect(manifest.evidence).toEqual({ fixture: { status: "supplied" }, live: { status: "unverified" } });
    expect(manifest.provenance.source).toEqual({
      url: "https://github.com/oomol-lab/open-connector",
      revision: "33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a",
    });
  });

  it("keeps every origin operation and adds the missing Composio tools as real HTTP actions", () => {
    for (const key of origin) {
      expect(operations[key], key).toBeDefined();
    }
    expect(mapping.origin_ops.sort()).toEqual([...origin].sort());
    expect(Object.keys(operations).length).toBe(121);
    expect(mapping.added.length).toBe(100);
    expect(Object.keys(mapping.tools).length).toBe(119);
  });

  it("gives every action a request block, title, description, and object inputSchema", () => {
    for (const [key, operation] of Object.entries(operations)) {
      expect(operation.kind, key).toBe("action");
      expect(typeof operation.title, key).toBe("string");
      expect(String(operation.title).length, key).toBeGreaterThan(0);
      expect(typeof operation.description, key).toBe("string");
      expect(String(operation.description).length, key).toBeGreaterThan(0);
      expect(isRecord(operation.inputSchema), key).toBe(true);
      expect((operation.inputSchema as Record<string, unknown>).type, key).toBe("object");
      expect(isRecord(operation.request), `${key} request`).toBe(true);
      const request = operation.request as Record<string, unknown>;
      expect(typeof request.method, key).toBe("string");
      expect(typeof request.path, key).toBe("string");
      expect(operation.enforceOutputSchema, key).toBe(true);
      expect(operation.validationMode, key).toBe("strict-generated");
      if (operation.kind === "webhook") expect(operation.sideEffect).toBe("read");
    }
  });

  it("maps each current Composio tool onto a real operation", () => {
    for (const [slug, row] of Object.entries(mapping.tools)) {
      const operation = operations[row.operation];
      expect(operation, slug).toBeDefined();
      expect(isRecord(operation.request), slug).toBe(true);
    }
  });

  it("recipe mirrors the deepened operations; provenance mappings stay pinned", () => {
    expect(recipe.manifest.version).toBe("0.3.0");
    const recipeKeys = Object.keys(recipeOps).sort();
    const runnerKeys = Object.keys(operations).sort();
    expect(recipeKeys).toHaveLength(121);
    expect(runnerKeys).toEqual(recipeKeys);
    expect([...recipe.selection.operations].sort()).toEqual(PINNED_OPS);
    expect(Object.keys(recipe.operationSources).sort()).toEqual(PINNED_OPS);
    expect(runnerKeys.filter((key) => !Object.hasOwn(recipe.operationSources, key))).toEqual(DEEPENED_OPS);
    for (const key of recipeKeys) {
      expect(operations[key], key).toEqual(recipeOps[key]);
    }
    expect(recipe.operationSources["AFFINDA_GET_USAGE_BY_WORKSPACE"]).toBeUndefined();
    expect(recipe.selection.operations).not.toContain("AFFINDA_GET_USAGE_BY_WORKSPACE");
    expect(manifest.auth).toEqual(recipe.manifest.auth);
    expect(manifest.http).toEqual(recipe.manifest.http);
    expect(manifest.network).toEqual(recipe.manifest.network);
  });

  it("adds monthly workspace usage as a body-less JSON read", () => {
    const operation = operations["AFFINDA_GET_USAGE_BY_WORKSPACE"];
    expect(operation, "AFFINDA_GET_USAGE_BY_WORKSPACE").toBeDefined();
    expect(operation?.sideEffect).toBe("read");
    expect(operation?.responseFormat).toBe("json");
    const outputSchema = operation?.outputSchema as { type?: string };
    expect(outputSchema.type).toBe("object");
    const inputSchema = operation?.inputSchema as { additionalProperties?: boolean; required?: string[] };
    expect(inputSchema.additionalProperties).toBe(false);
    expect(inputSchema.required).toEqual(["identifier"]);
    const request = operation?.request as {
      method?: string;
      path?: string;
      baseUrl?: string;
      body?: unknown;
      headers?: unknown;
      query?: Record<string, string>;
      success?: number[];
    };
    expect(request.method).toBe("GET");
    expect(request.path).toBe("/v3/workspaces/{{identifier}}/usage");
    expect(request.baseUrl).toBeUndefined();
    expect(request.body).toBeUndefined();
    expect(request.headers).toBeUndefined();
    expect(request.query).toEqual({ start: "{{start}}", end: "{{end}}" });
    expect(request.success).toEqual([200]);
    expect(JSON.stringify(request)).not.toMatch(/content-type/i);
  });
});

describe("affinda fixture layout", () => {
  it("covers every action with a positive success case", () => {
    const caseDir = join(import.meta.dir, "../fixtures/cases");
    const covered = new Set<string>();
    for (const name of readdirSync(caseDir).filter((file) => file.endsWith(".json"))) {
      const fixture = JSON.parse(readFileSync(join(caseDir, name), "utf8")) as {
        operation: string;
        expected: { kind: string };
        exchanges: unknown[];
      };
      if (fixture.expected.kind === "success" && fixture.exchanges.length > 0) {
        covered.add(fixture.operation);
      }
    }
    expect([...covered].sort()).toEqual(Object.keys(operations).sort());
  });
});
