import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import recipe from "../../../../scripts/connector-gen/openconnector/recipes/griptape/recipe.json";
import mapping from "../fixtures/composio-mapping.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const recipeOps = recipe.manifest.operations as Record<string, Record<string, unknown>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

describe("griptape manifest", () => {
  it("keeps the origin identity and bumps the deepened version", () => {
    expect(manifest.key).toBe("griptape");
    expect(manifest.name).toBe("Griptape");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.version).toBe("0.4.0");
    expect(manifest.http.baseUrl).toBe("https://cloud.griptape.ai/api");
    expect(manifest.network.allowedHosts).toEqual(["cloud.griptape.ai"]);
    expect(manifest.http.auth.value).toBe("Bearer {{apiKey}}");
    expect(manifest.evidence).toEqual({ fixture: { status: "supplied" }, live: { status: "unverified" } });
  });

  it("keeps every origin operation and adds the missing Composio tools as real HTTP actions", () => {
    const origin = [
      "assistant-runs.get",
      "assistants.get",
      "assistants.list",
      "healthcheck",
      "organizations.get",
      "assistants.create",
      "assistants.update",
      "assistants.delete",
      "assistants.run",
      "assistant-runs.list",
      "structures.list",
      "structures.get",
      "structures.run",
      "structure-runs.get",
      "threads.list",
      "threads.get",
      "threads.create",
      "threads.messages.list",
      "buckets.list",
      "knowledge-bases.list",
      "rulesets.list",
    ];
    for (const key of origin) {
      expect(operations[key], key).toBeDefined();
    }
    const mapped = new Set(Object.values(mapping.tools).map((row) => row.operation));
    for (const key of mapped) {
      expect(operations[key], key).toBeDefined();
    }
    expect(Object.keys(operations).length).toBeGreaterThanOrEqual(origin.length + 180);
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

  it("keeps GET/DELETE body-less and JSON Content-Type only when a body is set", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as Record<string, unknown>;
      const method = String(request.method).toUpperCase();
      const headers = isRecord(request.headers) ? request.headers : {};
      const contentType = Object.entries(headers).find(([name]) => name.toLowerCase() === "content-type")?.[1];
      if (method === "GET" || method === "DELETE") {
        expect(request.body, key).toBeUndefined();
        expect(contentType, key).toBeUndefined();
      } else if (request.body !== undefined) {
        expect(contentType, key).toBe("application/json");
      } else {
        expect(contentType, key).toBeUndefined();
      }
    }
  });

  it("keeps webhook sideEffect at read when webhooks exist", () => {
    for (const [key, operation] of Object.entries(operations)) {
      if (operation.kind === "webhook") {
        expect(operation.sideEffect, key).toBe("read");
      }
    }
  });

  it("maps each current Composio tool onto a real operation or an explicit hole", () => {
    const tools = Object.keys(mapping.tools);
    const missing = Object.keys(mapping.missing);
    expect(tools.length + missing.length).toBe(143);
    expect(missing).toEqual([
      "GRIPTAPE_ASSISTANT_RUN_RETRY",
      "GRIPTAPE_LIST_EMBEDDING_DRIVERS",
    ]);
    for (const slug of missing) {
      expect(mapping.missing[slug as keyof typeof mapping.missing].length).toBeGreaterThan(10);
    }
    for (const [slug, row] of Object.entries(mapping.tools)) {
      const operation = operations[row.operation];
      expect(operation, slug).toBeDefined();
      expect(isRecord(operation.request), slug).toBe(true);
    }
  });

  it("gives every recipe operation a pinned extractActions upstreamActionId", () => {
    const native = new Set([
      "list_organizations",
      "get_organization",
      "list_assistants",
      "create_assistant",
      "get_assistant",
      "update_assistant",
      "delete_assistant",
      "list_assistant_runs",
      "create_assistant_run",
      "get_assistant_run",
      "cancel_assistant_run",
      "list_assistant_events",
    ]);
    const sources = recipe.operationSources as Record<string, { upstreamActionId: string; sourceRefs: string[] }>;
    expect(Object.keys(sources).sort()).toEqual(Object.keys(operations).sort());
    for (const [key, source] of Object.entries(sources)) {
      expect(native.has(source.upstreamActionId), `${key}:${source.upstreamActionId}`).toBe(true);
      expect(source.sourceRefs.length, key).toBeGreaterThan(0);
    }
  });

  it("keeps recipe operations identical to runner operations", () => {
    expect(manifest.version).toBe(recipe.manifest.version);
    expect(Object.keys(operations).sort()).toEqual(Object.keys(recipeOps).sort());
    expect([...recipe.selection.operations].sort()).toEqual(Object.keys(operations).sort());
  });

  it("compiles as a declarative connector", () => {
    const compiled = compileDeclarativeConnector(manifest as never);
    expect(Object.keys(compiled.actions).sort()).toEqual(Object.keys(operations).sort());
  });
});

describe("griptape fixture layout", () => {
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
    const actionKeys = Object.entries(operations)
      .filter(([, operation]) => operation.kind !== "webhook")
      .map(([key]) => key)
      .sort();
    expect([...covered].sort()).toEqual(actionKeys);
  });
});
