import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import manifest from "../manifest.json";
import mapping from "../fixtures/composio-mapping.json";

const recipeCandidates = [
  join(import.meta.dir, "../../../../scripts/connector-gen/openconnector/recipes/browser_use/recipe.json"),
  "../../../../scripts/connector-gen/openconnector/recipes/browser_use/recipe.json",
];
const recipePath = recipeCandidates.find((path) => existsSync(path));
const operations = manifest.operations as Record<string, Record<string, unknown>>;
const expectedOps = ["healthcheck", "billing.account.get", "sessions.list", "sessions.get", "sessions.update", "sessions.delete", "sessions.feedback.get", "sessions.feedback.set", "sessions.share.get", "sessions.share.set", "sessions.queue.create", "sessions.queue.list", "sessions.queue.get", "sessions.queue.cancel", "runs.create", "runs.list", "runs.get", "runs.status.get", "runs.cancel", "runs.events.list", "browsers.create", "browsers.list", "browsers.get", "browsers.stop", "browsers.downloads.list", "profiles.create", "profiles.list", "profiles.get", "profiles.update", "profiles.delete", "workspaces.create", "workspaces.get", "workspaces.update", "workspaces.archive", "workspaces.files.list", "workspaces.files.delete", "integrations.list", "integrations.categories.list", "integrations.status.get", "integrations.disconnect", "paymentMethods.list"];

describe("browser-use manifest", () => {
  it("keeps connector identity and bumps the deepened version", () => {
    expect(manifest.key).toBe("browser-use");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.visibility).toBe("public");
    expect(manifest.categories).toEqual(["dev-tools"]);
  });

  it("still authenticates with X-Browser-Use-API-Key and pins api.browser-use.com", () => {
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.http.auth.field).toBe("apiKey");
    expect(manifest.http.auth.name).toBe("X-Browser-Use-API-Key");
    expect(manifest.http.auth.value).toBe("{{apiKey}}");
    expect(manifest.http.baseUrl).toBe("https://api.browser-use.com/api/v4");
    expect(manifest.network.allowedHosts).toEqual(["api.browser-use.com"]);
    expect((operations.healthcheck.request as { baseUrl?: string }).baseUrl).toBe("https://api.browser-use.com/api/v3");
    expect((operations["billing.account.get"].request as { baseUrl?: string }).baseUrl).toBe("https://api.browser-use.com/api/v3");
  });

  it("exposes every action as a real HTTP tool with title, description, and object inputSchema", () => {
    expect(Object.keys(operations)).toEqual(expectedOps);
    expect(Object.keys(operations).length).toBe(41);
    for (const [key, operation] of Object.entries(operations)) {
      expect(operation.kind, key).toBe("action");
      expect(["read", "write", "destructive"]).toContain(operation.sideEffect);
      expect(String(operation.title ?? "").length, key).toBeGreaterThan(0);
      expect(String(operation.description ?? "").length, key).toBeGreaterThan(0);
      expect((operation.inputSchema as { type?: string }).type, key).toBe("object");
      expect(operation.request, `${key} must declare a request block`).toBeDefined();
      expect(operation.enforceOutputSchema).toBe(true);
      expect(operation.responseFormat).toBe("json");
      expect(operation.validationMode).toBe("strict-generated");
      const request = operation.request as { method?: string; path?: string };
      expect(typeof request.method, key).toBe("string");
      expect(String(request.path ?? "").length, key).toBeGreaterThan(0);
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

  it("keeps recipe operations equal to runner operations", () => {
    expect(recipePath).toBeDefined();
    const recipe = JSON.parse(readFileSync(recipePath!, "utf8")) as {
      selection: { operations: string[] };
      operationSources: Record<string, unknown>;
      manifest: { operations: Record<string, unknown>; version: string };
      source: { revision: string };
    };
    const runnerOps = Object.keys(operations);
    expect(recipe.manifest.version).toBe("0.2.0");
    expect(Object.keys(recipe.manifest.operations)).toEqual(runnerOps);
    expect(recipe.selection.operations).toEqual(runnerOps);
    expect(Object.keys(recipe.operationSources)).toEqual(runnerOps);
    expect(recipe.source.revision).toBe("33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a");
  });

  it("accounts for every documented Composio BROWSER_USE tool", () => {
    expect(mapping.mapped.length).toBe(39);
    expect(mapping.missing).toEqual([]);
    const mappedOps = mapping.mapped.map((row: { operation: string }) => row.operation);
    expect(mappedOps).toEqual(["workspaces.archive", "sessions.queue.cancel", "runs.cancel", "browsers.create", "profiles.create", "workspaces.create", "profiles.delete", "sessions.delete", "workspaces.files.delete", "integrations.disconnect", "browsers.get", "integrations.status.get", "profiles.get", "sessions.queue.get", "runs.get", "runs.status.get", "sessions.get", "sessions.feedback.get", "sessions.share.get", "workspaces.get", "browsers.downloads.list", "browsers.list", "integrations.categories.list", "integrations.list", "paymentMethods.list", "profiles.list", "runs.events.list", "runs.list", "sessions.queue.list", "sessions.list", "workspaces.files.list", "sessions.queue.create", "sessions.feedback.set", "sessions.share.set", "runs.create", "browsers.stop", "profiles.update", "sessions.update", "workspaces.update"]);
    for (const row of mapping.mapped as Array<{ tool: string; operation: string }>) {
      expect(operations[row.operation], `${row.tool} -> ${row.operation}`).toBeDefined();
    }
  });
});
