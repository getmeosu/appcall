import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";

const operations = manifest.operations as Record<string, Record<string, unknown>>;

describe("miro manifest", () => {
  test("has bounded hosts and compiles", () => {
    expect(manifest.network.allowedHosts).toEqual(["api.miro.com", "miro.com"]);
    expect(manifest.version).toBe("0.3.0");
    expect(manifest.http.baseUrl).toBe("https://api.miro.com/v2");
    expect(manifest.http.auth.value).toBe("Bearer {{accessToken}}");
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("gives every action a real request, title, description, and object inputSchema", () => {
    expect(Object.keys(operations).length).toBeGreaterThan(70);
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
      if (method === "DELETE") expect(operation.sideEffect, key).toBe("destructive");
      else if (["POST", "PUT", "PATCH"].includes(method)) expect(operation.sideEffect, key).toBe("write");
      else expect(operation.sideEffect, key).toBe("read");
    }
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

  test("keeps origin board and item reads", () => {
    expect((operations["boards.list"]!.request as Record<string, unknown>).path).toBe("/boards");
    expect((operations["boards.get"]!.request as Record<string, unknown>).path).toBe("/boards/{{boardId}}");
    expect((operations["items.list"]!.request as Record<string, unknown>).path).toBe("/boards/{{boardId}}/items");
    expect((operations["items.get"]!.request as Record<string, unknown>).path).toBe("/boards/{{boardId}}/items/{{itemId}}");
    expect((operations["stickyNotes.create"]!.request as Record<string, unknown>).path).toBe("/boards/{{boardId}}/sticky_notes");
  });
});
