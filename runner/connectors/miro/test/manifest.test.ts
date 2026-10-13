import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";

const operations = manifest.operations as Record<string, Record<string, unknown>>;

describe("miro manifest", () => {
  test("has bounded hosts and compiles", () => {
    expect(manifest.network.allowedHosts).toEqual(["api.miro.com", "miro.com"]);
    expect(manifest.version).toBe("0.3.1");
    expect(manifest.http.baseUrl).toBe("https://api.miro.com/v2");
    expect(manifest.http.auth.value).toBe("Bearer {{accessToken}}");
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("gives every action a real request, title, description, and object inputSchema", () => {
    expect(Object.keys(operations).length).toBe(86);
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
    expect((operations["documents.create"]!.request as Record<string, unknown>).path).toBe("/boards/{{boardId}}/documents");
    expect((operations["documents.get"]!.request as Record<string, unknown>).path).toBe("/boards/{{boardId}}/documents/{{itemId}}");
  });

  test("adds JSON doc format create and get beside file documents", () => {
    const created = operations["docs.create"]!;
    const read = operations["docs.get"]!;
    expect(created.sideEffect).toBe("write");
    expect(read.sideEffect).toBe("read");
    expect(created.timeoutMs).toBe(operations["documents.create"]!.timeoutMs);
    expect(created.maxInputBytes).toBe(operations["documents.create"]!.maxInputBytes);
    expect(created.maxResponseBytes).toBe(operations["documents.create"]!.maxResponseBytes);
    expect(read.timeoutMs).toBe(operations["documents.get"]!.timeoutMs);
    expect(read.maxInputBytes).toBe(operations["documents.get"]!.maxInputBytes);
    expect(read.maxResponseBytes).toBe(operations["documents.get"]!.maxResponseBytes);
    expect(created.maxResponseBytes as number).toBeGreaterThanOrEqual(created.maxInputBytes as number);
    expect(read.maxResponseBytes as number).toBeGreaterThanOrEqual(read.maxInputBytes as number);
    expect(String(created.title).length).toBeGreaterThan(0);
    expect(String(created.description).length).toBeGreaterThan(0);
    expect(String(read.title).length).toBeGreaterThan(0);
    expect(String(read.description).length).toBeGreaterThan(0);

    const createRequest = created.request as Record<string, unknown>;
    const readRequest = read.request as Record<string, unknown>;
    expect(createRequest).toMatchObject({
      method: "POST",
      path: "/boards/{{boardId}}/docs",
      success: [201],
      body: { data: "{{data}}", position: "{{position}}", parent: "{{parent}}" },
    });
    expect(createRequest.baseUrl).toBeUndefined();
    expect(readRequest).toMatchObject({
      method: "GET",
      path: "/boards/{{boardId}}/docs/{{itemId}}",
      success: [200],
      query: { textContentType: "{{textContentType}}" },
    });
    expect(readRequest.baseUrl).toBeUndefined();
    expect(readRequest.body).toBeUndefined();
    expect(readRequest.headers).toBeUndefined();

    const createSchema = created.inputSchema as {
      type: string;
      additionalProperties: boolean;
      required: string[];
      properties: Record<string, { type?: string; additionalProperties?: boolean; required?: string[]; properties?: Record<string, { enum?: string[] }> }>;
    };
    expect(createSchema.type).toBe("object");
    expect(createSchema.additionalProperties).toBe(false);
    expect(createSchema.required).toEqual(["boardId", "data"]);
    expect(Object.keys(createSchema.properties).sort()).toEqual(["boardId", "data", "parent", "position"]);
    expect(createSchema.properties.data!.additionalProperties).toBe(false);
    expect(createSchema.properties.data!.required).toEqual(["contentType", "content"]);
    expect(Object.keys(createSchema.properties.data!.properties ?? {}).sort()).toEqual(["content", "contentType", "contentVersion"]);
    expect(createSchema.properties.data!.properties!.contentType!.enum).toEqual(["markdown"]);
    expect(createSchema.properties.position!.additionalProperties).toBe(false);
    expect(Object.keys(createSchema.properties.position!.properties ?? {}).sort()).toEqual(["origin", "x", "y"]);
    expect(createSchema.properties.position!.properties!.origin!.enum).toEqual(["center"]);
    expect(createSchema.properties.parent!.additionalProperties).toBe(false);
    expect(Object.keys(createSchema.properties.parent!.properties ?? {})).toEqual(["id"]);

    const readSchema = read.inputSchema as {
      type: string;
      additionalProperties: boolean;
      required: string[];
      properties: Record<string, { enum?: string[] }>;
    };
    expect(readSchema.type).toBe("object");
    expect(readSchema.additionalProperties).toBe(false);
    expect(readSchema.required).toEqual(["boardId", "itemId"]);
    expect(Object.keys(readSchema.properties).sort()).toEqual(["boardId", "itemId", "textContentType"]);
    expect(readSchema.properties.textContentType!.enum).toEqual(["html", "markdown"]);
  });
});
