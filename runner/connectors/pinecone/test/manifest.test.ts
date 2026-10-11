import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import { pineconeActions } from "../src/actions";
import mapping from "../composio-mapping.json";
import manifest from "../manifest.json";
import recipe from "../../../../scripts/connector-gen/openconnector/recipes/pinecone/recipe.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const ORIGIN_OPS = ["healthcheck", "indexes.list", "indexes.get"] as const;

function requestOf(key: string): Record<string, unknown> {
  return operations[key]!.request as Record<string, unknown>;
}

describe("pinecone manifest", () => {
  test("keeps origin identity, auth, and bounded hosts", () => {
    expect(manifest.key).toBe("pinecone");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.http.baseUrl).toBe("https://api.pinecone.io");
    expect(manifest.http.auth).toMatchObject({ field: "apiKey", name: "Api-Key", value: "{{apiKey}}" });
    expect(manifest.http.headers["X-Pinecone-Api-Version"]).toBe("2026-04");
    expect(manifest.network.allowedHosts).toEqual(["api.pinecone.io", "*.pinecone.io"]);
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("keeps the origin three operations", () => {
    expect(requestOf("healthcheck")).toMatchObject({ method: "GET", path: "/indexes" });
    expect(requestOf("indexes.list")).toMatchObject({ method: "GET", path: "/indexes" });
    expect(requestOf("indexes.get")).toMatchObject({ method: "GET", path: "/indexes/{{name}}" });
    expect((operations["indexes.get"]!.inputSchema as { required: string[] }).required).toEqual(["name"]);
  });

  test("covers every Composio PINECONE tool with a real request", () => {
    expect(Object.keys(mapping)).toHaveLength(48);
    expect(Object.keys(operations).length).toBe(50);
    for (const [slug, key] of Object.entries(mapping)) {
      expect(operations[key], slug).toBeDefined();
      expect(requestOf(key), slug).toBeDefined();
    }
    for (const key of ORIGIN_OPS) expect(operations[key], key).toBeDefined();
  });

  test("gives every action a real request, title, description, and object inputSchema", () => {
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
    const readPosts = new Set([
      "indexes.stats",
      "vectors.query",
      "inference.embed",
      "inference.rerank",
      "assistants.chat",
      "assistants.chat.completions",
      "assistants.context",
      "namespaces.records.search",
    ]);
    for (const [key, operation] of Object.entries(operations)) {
      const method = String((operation.request as Record<string, unknown>).method);
      if (method === "DELETE") expect(operation.sideEffect, key).toBe("destructive");
      else if (key === "vectors.delete") expect(operation.sideEffect, key).toBe("destructive");
      else if (readPosts.has(key) || method === "GET") expect(operation.sideEffect, key).toBe("read");
      else if (["POST", "PUT", "PATCH"].includes(method)) expect(operation.sideEffect, key).toBe("write");
    }
  });

  test("only interpolates path placeholders the schema requires, except optional assistant_host discovery", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as Record<string, unknown>;
      const schema = operation.inputSchema as { required?: string[]; properties?: Record<string, unknown> };
      const placeholders = [...String(request.path ?? "").matchAll(/\{\{\s*([A-Za-z0-9_.$-]+)\s*\}\}/g)].map(
        (match) => match[1],
      );
      for (const placeholder of placeholders) {
        expect(schema.properties ?? {}, `${key} path uses {{${placeholder}}}`).toHaveProperty(placeholder);
        if (placeholder !== "assistant_host") {
          expect(schema.required ?? [], `${key} path uses {{${placeholder}}}`).toContain(placeholder);
        }
      }
    }
  });

  test("maps Composio describe-index onto index_name and keeps origin name", () => {
    expect(mapping.PINECONE_DESCRIBE_INDEX).toBe("indexes.describe");
    expect(mapping.PINECONE_LIST_INDEXES).toBe("indexes.list");
    expect(requestOf("indexes.describe").path).toBe("/indexes/{{index_name}}");
    expect(requestOf("assistants.list").path).toBe("/assistant/assistants");
    expect(requestOf("inference.embed")).toMatchObject({ method: "POST", path: "/embed" });
    expect(requestOf("namespaces.records.upsert")).toMatchObject({
      method: "POST",
      path: "/records/namespaces/{{namespace}}/upsert",
      headers: { "Content-Type": "application/x-ndjson" },
    });
    expect(requestOf("imports.cancel")).toMatchObject({ method: "DELETE", path: "/bulk/imports/{{id}}" });
  });

  test("recipe operations equal runner operations", () => {
    expect(Object.keys(recipe.manifest.operations).sort()).toEqual(Object.keys(operations).sort());
    expect(recipe.selection.operations.sort()).toEqual(Object.keys(operations).sort());
    expect(recipe.manifest.version).toBe("0.2.0");
  });

  test("overlays handwritten hosted handlers on compiled actions", () => {
    const compiled = compileDeclarativeConnector(manifest as never);
    const actions = pineconeActions(compiled.actions);
    expect(Object.keys(actions).sort()).toEqual(Object.keys(operations).sort());
    for (const key of Object.keys(operations)) {
      expect(actions[key], key).toBeTypeOf("function");
    }
  });
});
