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

  it("keeps pinned recipe operations and records the workspace usage recipe gap", () => {
    expect(recipe.manifest.version).toBe("0.3.0");
    const recipeKeys = Object.keys(recipeOps).sort();
    const runnerKeys = Object.keys(operations).sort();
    expect(recipeKeys).toHaveLength(120);
    expect([...recipe.selection.operations].sort()).toEqual(recipeKeys);
    expect(Object.keys(recipe.operationSources).sort()).toEqual(recipeKeys);
    expect(runnerKeys).toEqual([...recipeKeys, "AFFINDA_GET_USAGE_BY_WORKSPACE"].sort());
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
