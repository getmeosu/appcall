import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const original = ["healthcheck", "workspaces.list", "projects.list", "tasks.list"] as const;

describe("clockify manifest", () => {
  test("keeps origin auth, provenance, and the four live ops", () => {
    expect(manifest.key).toBe("clockify");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.http.baseUrl).toBe("https://api.clockify.me/api/v1");
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "X-Api-Key",
      value: "{{apiKey}}",
    });
    expect(manifest.network.allowedHosts).toEqual(["api.clockify.me", "reports.api.clockify.me"]);
    expect(manifest.provenance.source).toEqual({
      url: "https://github.com/oomol-lab/open-connector",
      revision: "33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a",
    });
    for (const key of original) expect(operations[key], key).toBeTruthy();
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("every operation is a real HTTP tool with title, description, and object inputSchema", () => {
    expect(Object.keys(operations).length).toBe(76);
    for (const [key, operation] of Object.entries(operations)) {
      expect(operation.kind, key).toBe("action");
      expect(String(operation.title ?? "").length, key).toBeGreaterThan(0);
      expect(String(operation.description ?? "").length, key).toBeGreaterThan(0);
      expect((operation.inputSchema as { type?: string }).type, key).toBe("object");
      expect(operation.request, `${key} needs a request block`).toBeTruthy();
      const request = operation.request as Record<string, unknown>;
      expect(typeof request.method, key).toBe("string");
      expect(typeof request.path, key).toBe("string");
      if (operation.kind === "webhook") expect(operation.sideEffect).toBe("read");
    }
  });

  test("classifies mutating HTTP methods as write or destructive; reports stay read", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as Record<string, unknown>;
      const method = String(request.method);
      if (method === "DELETE") expect(operation.sideEffect, key).toBe("destructive");
      else if (key.startsWith("reports.") || key === "users.filter" || key === "webhooks.logs.list") {
        expect(operation.sideEffect, key).toBe("read");
      } else if (["POST", "PUT", "PATCH"].includes(method)) {
        expect(operation.sideEffect, key).toBe("write");
      } else {
        expect(operation.sideEffect, key).toBe("read");
      }
    }
  });

  test("path placeholders are declared required on inputSchema", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as Record<string, unknown>;
      const schema = operation.inputSchema as { required?: string[] };
      const placeholders = [...String(request.path ?? "").matchAll(/\{\{\s*([A-Za-z0-9_.$-]+)\s*\}\}/g)].map((m) => m[1]);
      for (const placeholder of placeholders) {
        expect(schema.required ?? [], `${key} path uses {{${placeholder}}}`).toContain(placeholder);
      }
    }
  });

  test("recipe operations equal runner operations", async () => {
    const recipe = await Bun.file(new URL("../../../../scripts/connector-gen/openconnector/recipes/clockify/recipe.json", import.meta.url)).json();
    expect(Object.keys(recipe.manifest.operations).sort()).toEqual(Object.keys(operations).sort());
    expect([...recipe.selection.operations].sort()).toEqual(Object.keys(operations).sort());
  });
});
