import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import manifest from "../manifest.json";
import recipe from "../../../../scripts/connector-gen/openconnector/recipes/altoviz/recipe.json";
import mapping from "../fixtures/composio-mapping.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const recipeOps = recipe.manifest.operations as Record<string, Record<string, unknown>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && Array.isArray(value) === false;
}

describe("altoviz manifest", () => {
  it("keeps origin identity and bumps the deepened version", () => {
    expect(manifest.key).toBe("altoviz");
    expect(manifest.name).toBe("Altoviz");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.http.baseUrl).toBe("https://api.altoviz.com");
    expect(manifest.network.allowedHosts).toEqual(["api.altoviz.com"]);
    expect(manifest.http.auth.name).toBe("x-api-key");
    expect(manifest.http.auth.value).toBe("{{apiKey}}");
  });

  it("keeps every origin operation", () => {
    for (const key of ["healthcheck", "customers.list", "customers.get", "customers.find"]) {
      expect(operations[key], key).toBeDefined();
      expect(isRecord(operations[key].request), key).toBe(true);
    }
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
    }
  });

  it("keeps webhook sideEffect at read when webhooks exist", () => {
    for (const [key, operation] of Object.entries(operations)) {
      if (operation.kind === "webhook") expect(operation.sideEffect, key).toBe("read");
    }
  });

  it("maps each current Composio tool onto a real operation or an explicit hole", () => {
    expect(Object.keys(mapping.tools).length + Object.keys(mapping.missing).length).toBe(67);
    for (const [slug, reason] of Object.entries(mapping.missing)) {
      expect(String(reason).length, slug).toBeGreaterThan(10);
    }
    for (const [slug, row] of Object.entries(mapping.tools as Record<string, { operation: string }>)) {
      const operation = operations[row.operation];
      expect(operation, slug).toBeDefined();
      expect(isRecord(operation.request), slug).toBe(true);
    }
  });

  it("keeps recipe operations identical to runner operations", () => {
    expect(manifest.version).toBe(recipe.manifest.version);
    expect(Object.keys(operations).sort()).toEqual(Object.keys(recipeOps).sort());
    expect([...recipe.selection.operations].sort()).toEqual(Object.keys(operations).sort());
  });
});

describe("altoviz fixture layout", () => {
  it("covers every action with a positive success case", () => {
    const caseDir = join(import.meta.dir, "../fixtures/cases");
    const covered = new Set<string>();
    for (const name of readdirSync(caseDir).filter((file) => file.endsWith(".json"))) {
      const fixture = JSON.parse(readFileSync(join(caseDir, name), "utf8")) as {
        operation: string;
        expected: { kind: string };
        exchanges: unknown[];
      };
      if (fixture.expected.kind === "success" && fixture.exchanges.length > 0) covered.add(fixture.operation);
    }
    expect([...covered].sort()).toEqual(Object.keys(operations).sort());
  });
});
