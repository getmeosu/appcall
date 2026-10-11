import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const actionOps = Object.fromEntries(
  Object.entries(operations).filter(([, operation]) => operation.kind === "action"),
) as Record<string, Record<string, unknown>>;
const webhookOps = Object.fromEntries(
  Object.entries(operations).filter(([, operation]) => operation.kind === "webhook"),
) as Record<string, Record<string, unknown>>;

describe("wrike manifest", () => {
  test("declares connector identity and bearer auth", () => {
    expect(manifest.key).toBe("wrike");
    expect(manifest.version).toBe("0.4.0");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.http.auth.value).toBe("Bearer {{apiKey}}");
    expect(manifest.http.baseUrl).toBe("https://www.wrike.com/api/v4");
    expect(manifest.network.allowedHosts).toEqual(["www.wrike.com"]);
    expect(manifest.provenance.source.revision).toBe("33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a");
  });

  test("gives every action a request block, title, description, and object inputSchema", () => {
    for (const [key, operation] of Object.entries(actionOps)) {
      expect(operation.title, key).toBeTruthy();
      expect(operation.description, key).toBeTruthy();
      expect((operation.inputSchema as Record<string, unknown>).type, key).toBe("object");
      expect(operation.request, `${key} must declare a request block`).toBeDefined();
      expect(["read", "write"]).toContain(operation.sideEffect);
    }
  });

  test("keeps EventOnly webhooks as read side effects without HTTP requests", () => {
    expect(Object.keys(webhookOps).sort()).toEqual([
      "webhook.attachment_added",
      "webhook.attachment_deleted",
      "webhook.blueprint_completed",
      "webhook.comment_added",
      "webhook.comment_deleted",
      "webhook.folder_created",
      "webhook.folder_custom_field_changed",
      "webhook.folder_deleted",
      "webhook.folder_description_changed",
      "webhook.folder_parents_added",
      "webhook.folder_parents_removed",
      "webhook.folder_shareds_added",
      "webhook.folder_shareds_removed",
      "webhook.folder_title_changed",
      "webhook.task_created",
      "webhook.task_custom_field_changed",
      "webhook.task_dates_changed",
      "webhook.task_deleted",
      "webhook.task_description_changed",
      "webhook.task_importance_changed",
      "webhook.task_parents_added",
      "webhook.task_parents_removed",
      "webhook.task_responsibles_added",
      "webhook.task_responsibles_removed",
      "webhook.task_shareds_added",
      "webhook.task_shareds_removed",
      "webhook.task_status_changed",
      "webhook.task_title_changed",
      "webhook.timelog_changed"
]);
    for (const [key, operation] of Object.entries(webhookOps)) {
      expect(operation.kind, key).toBe("webhook");
      expect(operation.sideEffect, key).toBe("read");
      expect(operation.request, key).toBeUndefined();
    }
  });

  test("recipe operations equal runner operations", async () => {
    const recipe = await Bun.file(new URL("../../../../scripts/connector-gen/openconnector/recipes/wrike/recipe.json", import.meta.url)).json() as {
      source: { revision: string };
      selection: { operations: string[]; upstreamSha: string };
      manifest: { operations: Record<string, { kind?: string; sideEffect?: string }>; auth: { type: string; scopes: unknown; setup: unknown } };
      auth?: unknown;
    };
    const runnerKeys = Object.keys(manifest.operations).sort();
    expect(recipe.source.revision).toBe("33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a");
    expect(recipe.selection.upstreamSha).toBe("33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a");
    expect(Object.keys(recipe.manifest.operations).sort()).toEqual(runnerKeys);
    expect([...recipe.selection.operations].sort()).toEqual(runnerKeys);
    expect(Object.keys(recipe.manifest.auth).sort()).toEqual(["scopes", "setup", "type"]);
    for (const [key, operation] of Object.entries(recipe.manifest.operations)) {
      if (operation.kind === "webhook") expect(operation.sideEffect, key).toBe("read");
    }
  });
});
