import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import mapping from "../fixtures/composio-mapping.json";
import manifest from "../manifest.json";

const recipePath = join(import.meta.dir, "../../../../scripts/connector-gen/openconnector/recipes/semantic_scholar/recipe.json");
const operations = manifest.operations as Record<string, Record<string, unknown>>;
const expected = [
  "authors.batch",
  "authors.get",
  "authors.papers.list",
  "authors.search",
  "datasets.diffs",
  "datasets.get",
  "datasets.release.get",
  "datasets.releases.list",
  "healthcheck",
  "papers.authors.list",
  "papers.autocomplete",
  "papers.batch",
  "papers.citations.list",
  "papers.get",
  "papers.recommendations",
  "papers.recommendations.for_paper",
  "papers.references.list",
  "papers.search",
  "papers.search.bulk",
  "papers.search.match",
  "papers.search.relevance",
  "snippets.search",
] as string[];

describe("semantic-scholar manifest", () => {
  it("keeps the connector identity and bumps the deepened version", () => {
    expect(manifest.key).toBe("semantic-scholar");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.visibility).toBe("public");
    expect(manifest.name).toBe("Semantic Scholar");
    expect(manifest.categories).toEqual(["utility"]);
  });

  it("still authenticates with x-api-key on api.semanticscholar.org", () => {
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.http.auth.field).toBe("apiKey");
    expect(manifest.http.auth.in).toBe("header");
    expect(manifest.http.auth.name).toBe("x-api-key");
    expect(manifest.http.auth.value).toBe("{{apiKey}}");
    expect(manifest.http.baseUrl).toBe("https://api.semanticscholar.org");
    expect(manifest.network.allowedHosts).toEqual(["api.semanticscholar.org"]);
  });

  it("exposes every action as a real HTTP tool with title, description, and object inputSchema", () => {
    expect(Object.keys(operations).sort()).toEqual(expected);
    expect(expected).toHaveLength(22);
    for (const [key, operation] of Object.entries(operations)) {
      expect(operation.kind, key).toBe("action");
      expect(operation.sideEffect, key).toBe("read");
      expect(String(operation.title ?? "").length, key).toBeGreaterThan(0);
      expect(String(operation.description ?? "").length, key).toBeGreaterThan(10);
      expect((operation.inputSchema as { type?: string }).type, key).toBe("object");
      expect(operation.request, `${key} must declare a request block`).toBeDefined();
      const request = operation.request as { method?: string; path?: string };
      expect(["GET", "POST"]).toContain(String(request.method));
      expect(String(request.path ?? "").length, key).toBeGreaterThan(0);
    }
  });

  it("keeps origin Graph request shapes", () => {
    const healthcheck = operations.healthcheck as { request: { method: string; path: string } };
    expect(healthcheck.request.method).toBe("GET");
    expect(healthcheck.request.path).toBe("/graph/v1/paper/649def34f8be52c8b66281af98ae884c09aef38b");
    const paper = operations["papers.get"] as { request: { path: string } };
    expect(paper.request.path).toBe("/graph/v1/paper/{{paperId}}");
    const authors = operations["papers.authors.list"] as {
      request: { path: string };
      inputSchema: { properties: { limit: { maximum: number } } };
    };
    expect(authors.request.path).toBe("/graph/v1/paper/{{paperId}}/authors");
    expect(authors.inputSchema.properties.limit.maximum).toBe(100);
  });

  it("only interpolates path placeholders the schema requires", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as { path?: string };
      const schema = operation.inputSchema as { required?: string[] };
      const placeholders = [...String(request.path ?? "").matchAll(/\{\{\s*([A-Za-z0-9_.$-]+)\s*\}\}/g)].map(
        (match) => match[1],
      );
      for (const placeholder of placeholders) {
        expect(schema.required ?? [], `${key} path uses {{${placeholder}}}`).toContain(placeholder);
      }
    }
  });

  it("compiles every operation into a handler", () => {
    const compiled = compileDeclarativeConnector(manifest as never);
    expect(Object.keys(compiled.actions).sort()).toEqual(Object.keys(operations).sort());
  });

  it("keeps recipe operations equal to runner operations", () => {
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

  it("accounts for every Composio SEMANTICSCHOLAR tool", () => {
    expect(mapping.composio_tools).toBe(21);
    expect(mapping.mapped.length).toBe(21);
    expect(mapping.missing).toEqual([]);
    for (const row of mapping.mapped as { tool: string; operation: string }[]) {
      expect(operations[row.operation], row.tool).toBeDefined();
    }
  });
});
