import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";

const operations = manifest.operations as Record<string, Record<string, unknown>>;

describe("mistral-ai manifest", () => {
  test("has bounded hosts and compiles", () => {
    expect(manifest.network.allowedHosts).toEqual(["api.mistral.ai"]);
    expect(manifest.version).toBe("0.3.0");
    expect(manifest.key).toBe("mistral-ai");
    expect(manifest.http.baseUrl).toBe("https://api.mistral.ai");
    expect(manifest.http.auth.value).toBe("Bearer {{apiKey}}");
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("gives every action a real request, title, description, and object inputSchema", () => {
    expect(Object.keys(operations).length).toBeGreaterThan(100);
    for (const [key, operation] of Object.entries(operations)) {
      expect(operation.kind, key).toBe("action");
      expect(["read", "write", "destructive"], key).toContain(operation.sideEffect);
      expect(String(operation.title ?? "").length, key).toBeGreaterThan(0);
      expect(String(operation.description ?? "").length, key).toBeGreaterThan(0);
      expect((operation.inputSchema as { type?: string }).type, key).toBe("object");
      expect(operation.request, `${key} must declare a request block`).toBeDefined();
      const request = operation.request as Record<string, unknown>;
      expect(typeof request.method, key).toBe("string");
      expect(typeof request.path, key).toBe("string");
    }
  });

  test("classifies mutating HTTP methods as write or destructive", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const method = String((operation.request as Record<string, unknown>).method);
      const path = String((operation.request as Record<string, unknown>).path);
      if (method === "DELETE" && !path.endsWith("/archive")) expect(operation.sideEffect, key).toBe("destructive");
      if (method === "GET") expect(operation.sideEffect, key).toBe("read");
    }
    expect(operations["files.delete"]!.sideEffect).toBe("destructive");
    expect(operations["observability.chat_completion_events.search"]!.sideEffect).toBe("read");
    expect(operations["workflows.executions.query"]!.sideEffect).toBe("read");
  });

  test("only interpolates path placeholders the schema requires", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as Record<string, unknown>;
      const schema = operation.inputSchema as { required?: string[] };
      const placeholders = [...String(request.path ?? "").matchAll(/\{\{\s*([A-Za-z0-9_.$-]+)\s*\}\}/g)].map((match) => match[1]);
      for (const placeholder of placeholders) {
        expect(schema.required ?? [], `${key} path uses {{${placeholder}}}`).toContain(placeholder);
      }
    }
  });

  test("recipe operations equal runner operations", async () => {
    const recipe = await Bun.file(new URL("../../../../scripts/connector-gen/openconnector/recipes/mistral_ai/recipe.json", import.meta.url)).json();
    expect(Object.keys(recipe.manifest.operations).sort()).toEqual(Object.keys(operations).sort());
    expect(recipe.selection.operations.sort()).toEqual(Object.keys(operations).sort());
  });
});
