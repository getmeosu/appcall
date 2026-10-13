import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import manifest from "../manifest.json";
import mapping from "../fixtures/composio-mapping.json";

const recipePath = "scripts/connector-gen/openconnector/recipes/algolia/recipe.json";
const operations = manifest.operations as Record<string, Record<string, unknown>>;
// ops the pinned recipe has real provenance for
const PINNED_OPS = [
  "abTests.add",
  "abTests.delete",
  "abTests.get",
  "abTests.list",
  "abTests.stop",
  "analytics.addToCartRate",
  "analytics.averageClickPosition",
  "analytics.clickPositions",
  "analytics.clickThroughRate",
  "analytics.conversionRate",
  "analytics.noClickRate",
  "analytics.noResultsRate",
  "analytics.noResultsSearches",
  "analytics.purchaseRate",
  "analytics.revenue",
  "analytics.searchesCount",
  "analytics.searchesNoClicks",
  "analytics.topCountries",
  "analytics.topFilterAttributes",
  "analytics.topFilterForAttribute",
  "analytics.topFiltersNoResults",
  "analytics.topHits",
  "analytics.topSearches",
  "analytics.usersCount",
  "apiKeys.create",
  "apiKeys.delete",
  "apiKeys.get",
  "apiKeys.list",
  "apiKeys.restore",
  "apiKeys.update",
  "app.task",
  "authentications.create",
  "authentications.delete",
  "authentications.get",
  "authentications.list",
  "authentications.search",
  "authentications.update",
  "batch.multiple",
  "destinations.create",
  "destinations.delete",
  "destinations.get",
  "destinations.list",
  "destinations.search",
  "destinations.update",
  "dictionaries.getLanguages",
  "dictionaries.getSettings",
  "dictionaries.search",
  "dictionaries.setSettings",
  "dictionaries.updateEntries",
  "healthcheck",
  "index.search",
  "indices.browse",
  "indices.clear",
  "indices.copy",
  "indices.delete",
  "indices.getSettings",
  "indices.list",
  "indices.setSettings",
  "indices.task",
  "insights.clickedObjectIDs",
  "insights.clickedObjectIDsAfterSearch",
  "insights.convertedObjectIDs",
  "insights.deleteUserToken",
  "logs.get",
  "personalization.computeUser",
  "personalization.deleteUserProfile",
  "personalization.getConfig",
  "personalization.getUsers",
  "personalization.setStrategy",
  "querySuggestions.create",
  "querySuggestions.delete",
  "querySuggestions.get",
  "querySuggestions.list",
  "querySuggestions.update",
  "recommend.rules.batch",
  "recommend.rules.delete",
  "recommend.rules.get",
  "recommend.rules.search",
  "records.create",
  "records.delete",
  "records.deleteBy",
  "records.deleteMany",
  "records.find",
  "records.get",
  "records.getMany",
  "records.getObjectPosition",
  "records.partialUpdate",
  "records.partialUpdateMany",
  "records.update",
  "rules.clear",
  "rules.delete",
  "rules.export",
  "rules.get",
  "rules.replaceAll",
  "rules.save",
  "rules.search",
  "runs.list",
  "search.facetValues",
  "search.multiple",
  "sources.create",
  "sources.delete",
  "sources.get",
  "sources.list",
  "sources.search",
  "sources.update",
  "sources.validate",
  "sources.validateBeforeUpdate",
  "synonyms.clear",
  "synonyms.delete",
  "synonyms.get",
  "synonyms.save",
  "synonyms.saveMany",
  "synonyms.search",
  "tasks.create",
  "tasks.disableV1",
  "tasks.enableV1",
  "tasks.getV1",
  "tasks.list",
  "tasks.push",
  "tasks.replace",
  "tasks.runV1",
  "tasks.searchV1",
  "tasks.update",
  "transformations.create",
  "transformations.delete",
  "transformations.get",
  "transformations.list",
  "transformations.search",
  "transformations.try",
  "transformations.tryBeforeUpdate",
  "transformations.update",
  "usage.get",
  "usage.getForIndex",
];
// ops this branch added from the provider's live API; no pinned action id exists
const DEEPENED_OPS = [
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
    for (const id of DEEPENED_OPS) expect(keys).toContain(id);
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

  it("recipe mirrors the deepened operations; provenance mappings stay pinned", () => {
    expect(existsSync(recipePath)).toBe(true);
    const recipe = JSON.parse(readFileSync(recipePath, "utf8")) as {
      selection: { operations: string[] };
      operationSources: Record<string, unknown>;
      manifest: { operations: Record<string, unknown>; version: string };
    };
    const runnerOps = Object.keys(operations).sort();
    const recipeOps = Object.keys(recipe.manifest.operations).sort();
    expect(recipe.manifest.version).toBe("0.3.0");
    expect(recipeOps).toHaveLength(140);
    expect(runnerOps).toEqual(recipeOps);
    expect([...recipe.selection.operations].sort()).toEqual(PINNED_OPS);
    expect(Object.keys(recipe.operationSources).sort()).toEqual(PINNED_OPS);
    expect(runnerOps.filter((key) => !Object.hasOwn(recipe.operationSources, key))).toEqual(DEEPENED_OPS);
    const routes: Record<string, { method: string; path: string }> = {
      "analytics.searchesNoClickRate": { method: "GET", path: "/2/searches/noClickRate" },
      "dictionaries.listLanguages": { method: "GET", path: "/1/dictionaries/*/languages" },
      "personalization.computeRealtime": { method: "POST", path: "/2/realtime/users/{{userToken}}/compute" },
      "personalization.deleteProfile": { method: "DELETE", path: "/1/profiles/{{userToken}}" },
      "recommend.task": { method: "GET", path: "/1/indexes/{{indexName}}/{{model}}/task/{{taskID}}" },
      "tasks.pushV2": { method: "POST", path: "/2/tasks/{{taskID}}/push" },
      "tasks.replaceV2": { method: "PUT", path: "/2/tasks/{{taskID}}" },
    };
    for (const id of DEEPENED_OPS) {
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
