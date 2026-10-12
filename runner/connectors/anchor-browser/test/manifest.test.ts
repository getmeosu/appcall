import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import manifest from "../manifest.json";
import mapping from "../fixtures/composio-mapping.json";

const recipeCandidates = [
  join(import.meta.dir, "../../../../scripts/connector-gen/openconnector/recipes/anchor_browser/recipe.json"),
  "../../../../scripts/connector-gen/openconnector/recipes/anchor_browser/recipe.json",
];
const recipePath = recipeCandidates.find((path) => existsSync(path));
const operations = manifest.operations as Record<string, Record<string, unknown>>;
const handwritten = new Set([
  "extensions.upload",
  "sessions.agent.files.upload",
  "sessions.uploads.create",
]);

describe("anchor-browser manifest", () => {
  it("keeps the connector identity and bumps the deepened version", () => {
    expect(manifest.key).toBe("anchor-browser");
    expect(manifest.version).toBe("0.2.1");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.categories).toEqual(["dev-tools"]);
  });

  it("still authenticates with the Anchor Browser API key header", () => {
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.http.auth.field).toBe("apiKey");
    expect(manifest.http.auth.name).toBe("anchor-api-key");
    expect(manifest.http.auth.value).toBe("{{apiKey}}");
    expect(manifest.http.baseUrl).toBe("https://api.anchorbrowser.io");
    expect(manifest.network.allowedHosts).toEqual(["api.anchorbrowser.io"]);
  });

  it("exposes every action as a real HTTP tool with title, description, and object inputSchema", () => {
    const keys = Object.keys(operations);
    expect(keys.length).toBe(67);
    expect(keys).toContain("healthcheck");
    expect(keys).toContain("billing.get");
    expect(keys).toContain("projects.metadata.get");
    expect(keys).toContain("sessions.create");
    expect(keys).toContain("tools.perform_web_task");
    expect(keys).toContain("extensions.upload");
    for (const [key, operation] of Object.entries(operations)) {
      expect(operation.kind).toBe("action");
      expect(operation.sideEffect).toMatch(/^(read|write|destructive)$/);
      expect(typeof operation.title).toBe("string");
      expect(String(operation.title).length).toBeGreaterThan(0);
      expect(typeof operation.description).toBe("string");
      expect(String(operation.description).length).toBeGreaterThan(0);
      const inputSchema = operation.inputSchema as { type?: string };
      expect(inputSchema.type).toBe("object");
      if (handwritten.has(key)) {
        expect(operation.request).toBeUndefined();
        continue;
      }
      expect(operation.request).toBeDefined();
      const request = operation.request as { method?: string; path?: string };
      expect(typeof request.method).toBe("string");
      expect(typeof request.path).toBe("string");
      expect(request.path.length).toBeGreaterThan(0);
    }
  });

  it("classifies mutating HTTP methods as write or destructive", () => {
    for (const [key, operation] of Object.entries(operations)) {
      if (handwritten.has(key)) {
        expect(operation.sideEffect, key).toBe("write");
        continue;
      }
      const method = String((operation.request as { method?: string }).method);
      if (method === "DELETE") expect(operation.sideEffect, key).toBe("destructive");
      else if (["POST", "PUT", "PATCH"].includes(method)) expect(operation.sideEffect, key).toBe("write");
      else expect(operation.sideEffect, key).toBe("read");
    }
  });

  it("only interpolates path placeholders the schema requires", () => {
    for (const [key, operation] of Object.entries(operations)) {
      if (handwritten.has(key)) continue;
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

  it("keeps recipe operations equal to runner operations", () => {
    expect(recipePath).toBeDefined();
    const recipe = JSON.parse(readFileSync(recipePath!, "utf8")) as {
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

  it("accounts for every Composio Anchor Browser tool", () => {
    expect(mapping.composio_tools).toBe(64);
    expect(mapping.mapped.length).toBe(64);
    expect(mapping.unmapped_composio).toEqual([]);
    for (const row of mapping.mapped as { composio: string; operation: string }[]) {
      expect(operations[row.operation], row.composio).toBeDefined();
    }
  });
});
