import { describe, expect, it } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import manifest from "../manifest.json";
import mapping from "../fixtures/composio-mapping.json";

const recipePath = join(import.meta.dir, "../../../../scripts/connector-gen/openconnector/recipes/bigml/recipe.json");
const operations = manifest.operations as Record<string, Record<string, unknown>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

describe("bigml manifest", () => {
  it("keeps the origin identity and bumps the deepened version", () => {
    expect(manifest.key).toBe("bigml");
    expect(manifest.name).toBe("BigML");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.http.baseUrl).toBe("https://bigml.io/andromeda");
    expect(manifest.network.allowedHosts).toEqual(["bigml.io"]);
    expect(manifest.http.auth.field).toBe("apiKey");
    expect(manifest.http.auth.in).toBe("query");
    expect(manifest.http.auth.name).toBe("api_key");
    expect(manifest.http.query.username).toBe("{{username}}");
    expect(manifest.provenance.source.revision).toBe("33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a");
  });

  it("keeps every origin operation and adds the missing Composio tools as real HTTP actions", () => {
    const origin = ["healthcheck", "models.get", "models.list", "predictions.get", "predictions.list"];
    for (const key of origin) {
      expect(operations[key], key).toBeDefined();
    }
    expect(operations["models.list"].request).toEqual({
      method: "GET",
      path: "/model",
      query: {
        limit: "{{limit}}",
        name__icontains: "{{nameContains}}",
        offset: "{{offset}}",
        order_by: "{{orderBy}}",
        project: "{{project}}",
      },
      success: [200],
    });
    expect(Object.keys(operations).length).toBe(48);
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
      expect(operation.responseFormat, key).toBe("json");
      expect(operation.validationMode, key).toBe("strict-generated");
    }
  });

  it("classifies mutating HTTP methods as write or destructive", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const method = String((operation.request as { method?: string }).method);
      if (method === "DELETE") expect(operation.sideEffect, key).toBe("destructive");
      else if (["POST", "PUT", "PATCH"].includes(method)) expect(operation.sideEffect, key).toBe("write");
      else expect(operation.sideEffect, key).toBe("read");
    }
  });

  it("keeps webhook sideEffect at read when webhooks exist", () => {
    for (const [key, operation] of Object.entries(operations)) {
      if (operation.kind === "webhook") {
        expect(operation.sideEffect, key).toBe("read");
      }
    }
  });

  it("maps each current Composio tool onto a real operation", () => {
    expect(mapping.composio_tools).toBe(45);
    expect(mapping.mapped.length).toBe(45);
    expect(mapping.unmapped_composio).toEqual([]);
    const slugs = new Set(mapping.mapped.map((row: { composio: string }) => row.composio));
    expect(slugs.size).toBe(45);
    for (const row of mapping.mapped as { composio: string; operation: string }[]) {
      const operation = operations[row.operation];
      expect(operation, row.composio).toBeDefined();
      expect(isRecord(operation.request), row.composio).toBe(true);
    }
  });

  it("keeps recipe operations identical to runner operations", () => {
    expect(existsSync(recipePath)).toBe(true);
    const recipe = JSON.parse(readFileSync(recipePath, "utf8")) as {
      selection: { operations: string[] };
      operationSources: Record<string, unknown>;
      manifest: { operations: Record<string, unknown>; version: string };
    };
    const runnerOps = Object.keys(operations).sort();
    expect(recipe.manifest.version).toBe("0.2.0");
    expect(Object.keys(recipe.manifest.operations).sort()).toEqual(runnerOps);
    expect([...recipe.selection.operations].sort()).toEqual(runnerOps);
    expect(Object.keys(recipe.operationSources).sort()).toEqual(runnerOps);
  });
});

describe("bigml fixture layout", () => {
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
