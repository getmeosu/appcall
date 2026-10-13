import { describe, expect, it } from "bun:test";
import { loadFixtureCases, runCandidateFixtures } from "./recipe-fixtures";
import manifest from "../manifest.json";
import recipe from "../../../../scripts/connector-gen/openconnector/recipes/instatus/recipe.json";

const operations = manifest.operations as Record<string, Record<string, any>>;

const actionKeys = Object.entries(manifest.operations)
  .filter(([, operation]) => (operation as { kind?: string }).kind === "action")
  .map(([key]) => key);

const ADDED = ["components.updateV2", "maintenanceUpdates.create", "maintenances.listV2"];

// recipe keys the pinned recipe has real provenance for (its pinned selection plus EventOnly webhooks); unchanged by this branch
const PINNED_OPS = [
  "components.create",
  "components.delete",
  "components.get",
  "components.list",
  "components.update",
  "healthcheck",
  "incidentUpdates.create",
  "incidents.create",
  "incidents.delete",
  "incidents.get",
  "incidents.list",
  "incidents.update",
  "maintenances.create",
  "maintenances.delete",
  "maintenances.get",
  "maintenances.list",
  "maintenances.update",
  "metrics.list",
  "pages.list",
  "subscribers.create",
  "subscribers.delete",
  "subscribers.list",
  "teammates.list",
  "templates.list",
  "webhook.component_updated",
  "webhook.incident_updated",
  "webhook.maintenance_updated",
];

// ops the pinned recipe selection pins for install; unchanged by this branch
const PINNED_SELECTION = [
  "components.create",
  "components.delete",
  "components.get",
  "components.list",
  "components.update",
  "healthcheck",
  "incidentUpdates.create",
  "incidents.create",
  "incidents.delete",
  "incidents.get",
  "incidents.list",
  "incidents.update",
  "maintenances.create",
  "maintenances.delete",
  "maintenances.get",
  "maintenances.list",
  "maintenances.update",
  "metrics.list",
  "pages.list",
  "subscribers.create",
  "subscribers.delete",
  "subscribers.list",
  "teammates.list",
  "templates.list",
];

// ops this branch added from the provider's live API; no pinned action id or source mapping exists
const DEEPENED_OPS = ["components.updateV2", "maintenanceUpdates.create", "maintenances.listV2"];

describe("Instatus depth fixtures", () => {
  it("recipe mirrors the deepened operations; provenance mappings stay pinned", () => {
    expect(manifest.version).toBe("0.2.1");
    expect(Object.keys(manifest.operations)).toHaveLength(27);
    const runnerOps = Object.keys(manifest.operations).sort();
    const recipeOps = Object.keys(recipe.manifest.operations).sort();
    expect(recipe.manifest.version).toBe("0.2.0");
    expect(runnerOps).toEqual(recipeOps);
    expect([...recipe.selection.operations].sort()).toEqual(PINNED_SELECTION);
    expect(Object.keys(recipe.operationSources).sort()).toEqual(PINNED_OPS);
    expect(runnerOps.filter((key) => !Object.hasOwn(recipe.operationSources, key))).toEqual(DEEPENED_OPS);
    // incidents.update and maintenances.update stay richer than the origin recipe.
    const aheadOfRecipe = new Set(["incidents.update", "maintenances.update"]);
    for (const key of recipeOps) {
      if (aheadOfRecipe.has(key)) {
        expect(operations[key]).not.toEqual(recipe.manifest.operations[key]);
        continue;
      }
      expect(operations[key], key).toEqual(recipe.manifest.operations[key]);
    }
    for (const key of ADDED) {
      expect(recipe.operationSources[key]).toBeUndefined();
    }
  });

  it("maps component IDs and statuses when updating incidents", () => {
    const operation = operations["incidents.update"]!;
    expect(operation.inputSchema.properties.components.type).toBe("array");
    expect(operation.inputSchema.properties.statuses.type).toBe("array");
    expect(operation.request.body.components).toBe("{{components}}");
    expect(operation.request.body.statuses).toBe("{{statuses}}");
  });

  it("requires provider fields for maintenance updates", () => {
    const operation = operations["maintenances.update"]!;
    for (const key of ["components", "statuses", "duration"]) {
      expect(operation.inputSchema.required).toContain(key);
      expect(operation.request.body[key]).toBe(`{{${key}}}`);
    }
  });

  it("replays authenticated fixture cases", async () => {
    const cases = loadFixtureCases(new URL("../fixtures/cases", import.meta.url).pathname);
    const runs = await runCandidateFixtures(JSON.stringify(manifest), cases);
    expect(runs.length).toBeGreaterThan(0);
    for (const run of runs) {
      if (run.status !== "passed") {
        throw new Error(`${run.caseId}: ${run.error}`);
      }
    }
  });

  it("covers every declared action with a positive fixture and skips EventOnly webhooks", () => {
    const cases = loadFixtureCases(new URL("../fixtures/cases", import.meta.url).pathname);
    const positive = new Set(cases.filter((c) => c.expected.kind === "success").map((c) => c.operation));
    expect([...positive].sort()).toEqual([...actionKeys].sort());
    for (const key of Object.keys(manifest.operations)) {
      if (key.startsWith("webhook.")) {
        expect(positive.has(key)).toBe(false);
      }
    }
  });
});
