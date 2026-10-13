import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import manifest from "../manifest.json";
import mapping from "../fixtures/composio-mapping.json";

const recipePath = "scripts/connector-gen/openconnector/recipes/browser_use/recipe.json";
const operations = manifest.operations as Record<string, Record<string, unknown>>;
const addedOps = ["extensions.list", "extensions.get", "sessions.cost.get", "stripeLink.get", "workspaces.size.get", "runs.attachments.list"];

// ops the pinned recipe has real provenance for
const PINNED_OPS = [
  "billing.account.get",
  "browsers.create",
  "browsers.downloads.list",
  "browsers.get",
  "browsers.list",
  "browsers.stop",
  "healthcheck",
  "integrations.categories.list",
  "integrations.disconnect",
  "integrations.list",
  "integrations.status.get",
  "paymentMethods.list",
  "profiles.create",
  "profiles.delete",
  "profiles.get",
  "profiles.list",
  "profiles.update",
  "runs.cancel",
  "runs.create",
  "runs.events.list",
  "runs.get",
  "runs.list",
  "runs.status.get",
  "sessions.delete",
  "sessions.feedback.get",
  "sessions.feedback.set",
  "sessions.get",
  "sessions.list",
  "sessions.queue.cancel",
  "sessions.queue.create",
  "sessions.queue.get",
  "sessions.queue.list",
  "sessions.share.get",
  "sessions.share.set",
  "sessions.update",
  "workspaces.archive",
  "workspaces.create",
  "workspaces.files.delete",
  "workspaces.files.list",
  "workspaces.get",
  "workspaces.update",
];

// ops this branch added from the provider's live API; no pinned action id exists
const DEEPENED_OPS = [
  "extensions.get",
  "extensions.list",
  "runs.attachments.list",
  "sessions.cost.get",
  "stripeLink.get",
  "workspaces.size.get",
];
const expectedOps = ["healthcheck", "billing.account.get", "sessions.list", "sessions.get", "sessions.update", "sessions.delete", "sessions.feedback.get", "sessions.feedback.set", "sessions.share.get", "sessions.share.set", "sessions.queue.create", "sessions.queue.list", "sessions.queue.get", "sessions.queue.cancel", "runs.create", "runs.list", "runs.get", "runs.status.get", "runs.cancel", "runs.events.list", "browsers.create", "browsers.list", "browsers.get", "browsers.stop", "browsers.downloads.list", "profiles.create", "profiles.list", "profiles.get", "profiles.update", "profiles.delete", "workspaces.create", "workspaces.get", "workspaces.update", "workspaces.archive", "workspaces.files.list", "workspaces.files.delete", "integrations.list", "integrations.categories.list", "integrations.status.get", "integrations.disconnect", "paymentMethods.list", ...addedOps];

describe("browser-use manifest", () => {
  it("keeps connector identity and bumps the deepened version", () => {
    expect(manifest.key).toBe("browser-use");
    expect(manifest.version).toBe("0.2.1");
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
    expect(Object.keys(operations).length).toBe(47);
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

  it("recipe mirrors the deepened operations; provenance mappings stay pinned", () => {
    expect(existsSync(recipePath)).toBe(true);
    const recipe = JSON.parse(readFileSync(recipePath, "utf8")) as {
      selection: { operations: string[] };
      operationSources: Record<string, unknown>;
      manifest: { operations: Record<string, unknown>; version: string };
    };
    const runnerOps = Object.keys(operations).sort();
    const recipeOps = Object.keys(recipe.manifest.operations).sort();
    expect(recipe.manifest.version).toBe("0.2.0");
    expect(recipeOps).toHaveLength(47);
    expect(runnerOps).toEqual(recipeOps);
    expect(runnerOps.filter((key) => !Object.hasOwn(recipe.operationSources, key))).toEqual(DEEPENED_OPS);
    expect(Object.keys(recipe.operationSources).sort()).toEqual(PINNED_OPS);
    expect([...recipe.selection.operations].sort()).toEqual(PINNED_OPS);
    for (const key of recipeOps) {
      expect(operations[key], key).toEqual(recipe.manifest.operations[key]);
    }
  });

  it("adds body-less v4 JSON reads without a base URL override", () => {
    const sibling = operations["sessions.get"]!;
    const paths: Record<string, string> = {
      "extensions.list": "/extensions",
      "extensions.get": "/extensions/{{extensionId}}",
      "sessions.cost.get": "/sessions/{{sessionId}}/cost",
      "stripeLink.get": "/stripe-link",
      "workspaces.size.get": "/workspaces/{{workspaceId}}/size",
      "runs.attachments.list": "/runs/{{runId}}/attachments",
    };
    for (const key of addedOps) {
      const operation = operations[key]!;
      const request = operation.request as {
        method?: string;
        path?: string;
        success?: number[];
        baseUrl?: string;
        body?: unknown;
        headers?: Record<string, string>;
      };
      expect(operation.sideEffect, key).toBe("read");
      expect(operation.timeoutMs, key).toBe(sibling.timeoutMs);
      expect(operation.maxInputBytes, key).toBe(sibling.maxInputBytes);
      expect(operation.maxResponseBytes, key).toBe(sibling.maxResponseBytes);
      expect(operation.responseFormat, key).toBe("json");
      expect(operation.validationMode, key).toBe("strict-generated");
      expect(operation.enforceOutputSchema, key).toBe(true);
      expect((operation.outputSchema as { type?: string }).type, key).toBe("object");
      expect(request).toMatchObject({ method: "GET", path: paths[key], success: [200] });
      expect(request.baseUrl, key).toBeUndefined();
      expect(request.body, key).toBeUndefined();
      expect(request.headers, key).toBeUndefined();
      expect((operation.request as { query?: unknown }).query, key).toEqual(key === "extensions.list" ? { pageSize: "{{pageSize}}", pageNumber: "{{pageNumber}}" } : undefined);
    }
    const listInput = operations["extensions.list"]!.inputSchema as {
      required?: string[];
      properties: {
        pageSize: { type: string; minimum: number; maximum: number };
        pageNumber: { type: string; minimum: number };
      };
    };
    expect(listInput.required).toBeUndefined();
    expect(listInput.properties.pageSize).toEqual({ type: "integer", minimum: 1, maximum: 100 });
    expect(listInput.properties.pageNumber).toEqual({ type: "integer", minimum: 1 });
    const dataOf = (key: string) =>
      (operations[key]!.outputSchema as { properties: { data: { type: string; additionalProperties: boolean; required: string[]; properties: Record<string, unknown> } } }).properties.data;
    const extension = dataOf("extensions.get");
    expect(extension.type).toBe("object");
    expect(extension.additionalProperties).toBe(false);
    expect(extension.required).toEqual(["id", "name", "version", "createdAt"]);
    expect(Object.keys(extension.properties).sort()).toEqual(["createdAt", "id", "name", "version"]);
    expect(dataOf("extensions.list").required).toEqual(["items", "totalItems", "pageNumber", "pageSize"]);
    expect(dataOf("sessions.cost.get").required).toEqual(["sessionId", "numRuns", "llmCostUsd", "searchCostUsd", "browserCostUsd", "proxyCostUsd", "proxyUsedMb", "totalCostUsd"]);
    const stripe = dataOf("stripeLink.get");
    expect(stripe.required).toEqual(["isConnected"]);
    expect(stripe.properties.isConnected).toEqual({ type: "boolean" });
    expect(stripe.properties.connectionId).toEqual({ type: ["string", "null"] });
    expect(stripe.properties.linkEmail).toEqual({ type: ["string", "null"] });
    expect(stripe.properties.mode).toEqual({ type: ["string", "null"], enum: ["test", "live", null] });
    expect(dataOf("workspaces.size.get").required).toEqual(["usedBytes", "maxBytes"]);
    expect(dataOf("workspaces.size.get").properties.usedBytes).toEqual({ type: "integer", minimum: 0 });
    expect(dataOf("workspaces.size.get").properties.maxBytes).toEqual({ type: "integer", minimum: 1 });
    const attachment = (dataOf("runs.attachments.list").properties.attachments as { items: { required: string[]; properties: { status: { enum: string[] } } } }).items;
    expect(dataOf("runs.attachments.list").required).toEqual(["attachments"]);
    expect(attachment.required).toEqual(["id", "name", "contentType", "sizeBytes", "status"]);
    expect(attachment.properties.status.enum).toEqual(["pending", "uploaded"]);
    expect(operations["sessions.get"]!.request).toEqual({ method: "GET", path: "/sessions/{{sessionId}}", success: [200] });
    expect(operations["workspaces.files.list"]!.request).toMatchObject({ method: "GET", path: "/workspaces/{{workspaceId}}/files" });
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
