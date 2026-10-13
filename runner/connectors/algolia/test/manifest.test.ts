import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import manifest from "../manifest.json";
import mapping from "../fixtures/composio-mapping.json";

const recipePath = "scripts/connector-gen/openconnector/recipes/algolia/recipe.json";
const operations = manifest.operations as Record<string, Record<string, unknown>>;
const added = [
  "analytics.searchesNoClickRate",
  "dictionaries.listLanguages",
  "personalization.computeRealtime",
  "personalization.deleteProfile",
  "recommend.task",
  "tasks.pushV2",
  "tasks.replaceV2",
];

describe("algolia manifest", () => {
  it("keeps the connector identity and bumps the deepened version", () => {
    expect(manifest.key).toBe("algolia");
    expect(manifest.version).toBe("0.3.1");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.categories).toEqual(["dev-tools"]);
  });

  it("still authenticates with the required application ID and API key headers", () => {
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.http.auth.field).toBe("apiKey");
    expect(manifest.http.auth.name).toBe("x-algolia-api-key");
    expect(manifest.http.headers["x-algolia-application-id"]).toBe("{{applicationId}}");
    expect(manifest.auth.setup.fields.map((field: { key: string }) => field.key)).toEqual([
      "apiKey",
      "applicationId",
    ]);
  });

  it("allows Algolia Search, Analytics, Insights, Ingestion, and related hosts", () => {
    expect(manifest.network.allowedHosts).toEqual(["*.algolia.net", "*.algolia.com", "*.algolia.io"]);
    expect(manifest.http.baseUrl).toBe("https://{{applicationId}}-dsn.algolia.net");
  });

  it("exposes every action as a real HTTP tool with title, description, and object inputSchema", () => {
    const keys = Object.keys(operations);
    expect(keys.length).toBe(140);
    expect(keys).toContain("healthcheck");
    expect(keys).toContain("indices.list");
    expect(keys).toContain("abTests.add");
    expect(keys).toContain("insights.clickedObjectIDs");
    expect(keys).toContain("authentications.list");
    expect(keys).toContain("querySuggestions.list");
    for (const id of added) expect(keys).toContain(id);
    for (const [key, operation] of Object.entries(operations)) {
      expect(operation.kind).toBe("action");
      expect(operation.sideEffect).toMatch(/^(read|write)$/);
      expect(typeof operation.title).toBe("string");
      expect(String(operation.title).length).toBeGreaterThan(0);
      expect(typeof operation.description).toBe("string");
      expect(String(operation.description).length).toBeGreaterThan(0);
      const inputSchema = operation.inputSchema as { type?: string };
      expect(inputSchema.type).toBe("object");
      const outputSchema = operation.outputSchema as { type?: string };
      expect(outputSchema.type).toBe("object");
      expect(operation.request).toBeDefined();
      const request = operation.request as { method?: string; path?: string };
      expect(typeof request.method).toBe("string");
      expect(typeof request.path).toBe("string");
      expect(request.path.length).toBeGreaterThan(0);
      if (key.includes("webhook") || operation.kind === "webhook") {
        expect(operation.sideEffect).toBe("read");
      }
    }
  });

  it("keeps the origin recipe and leaves added operations as a recipe gap", () => {
    expect(existsSync(recipePath)).toBe(true);
    const recipe = JSON.parse(readFileSync(recipePath, "utf8")) as {
      selection: { operations: string[] };
      operationSources: Record<string, unknown>;
      manifest: { operations: Record<string, unknown>; version: string };
    };
    const runnerOps = Object.keys(operations).sort();
    const recipeOps = Object.keys(recipe.manifest.operations).sort();
    expect(recipe.manifest.version).toBe("0.3.0");
    expect(recipeOps).toHaveLength(133);
    expect([...recipe.selection.operations].sort()).toEqual(recipeOps);
    expect(Object.keys(recipe.operationSources).sort()).toEqual(recipeOps);
    expect(runnerOps).toEqual([...recipeOps, ...added].sort());
    const routes: Record<string, { method: string; path: string }> = {
      "analytics.searchesNoClickRate": { method: "GET", path: "/2/searches/noClickRate" },
      "dictionaries.listLanguages": { method: "GET", path: "/1/dictionaries/*/languages" },
      "personalization.computeRealtime": { method: "POST", path: "/2/realtime/users/{{userToken}}/compute" },
      "personalization.deleteProfile": { method: "DELETE", path: "/1/profiles/{{userToken}}" },
      "recommend.task": { method: "GET", path: "/1/indexes/{{indexName}}/{{model}}/task/{{taskID}}" },
      "tasks.pushV2": { method: "POST", path: "/2/tasks/{{taskID}}/push" },
      "tasks.replaceV2": { method: "PUT", path: "/2/tasks/{{taskID}}" },
    };
    for (const id of added) {
      expect(recipe.operationSources[id]).toBeUndefined();
      const request = operations[id]?.request as { method?: string; path?: string; headers?: Record<string, string>; body?: unknown };
      expect(request.method).toBe(routes[id].method);
      expect(request.path).toBe(routes[id].path);
      if (request.method === "GET" || request.method === "DELETE" || id === "personalization.computeRealtime") {
        expect(request.headers).toBeUndefined();
        expect(request.body).toBeUndefined();
      }
    }
  });

  it("accounts for every Composio Algolia tool", () => {
    expect(mapping.composio_tools).toBe(133);
    expect(mapping.mapped.length + mapping.partial.length + mapping.missing.length).toBe(133);
    expect(mapping.missing.map((row: { tool: string }) => row.tool).sort()).toEqual([
      "ALGOLIA_INIT_INSIGHTS",
    ]);
    expect(mapping.mapped.some((row: { tool: string }) => row.tool === "ALGOLIA_GET_OBJECT_POSITION")).toBe(true);
    expect(operations["records.getObjectPosition"]).toBeDefined();
  });
});
