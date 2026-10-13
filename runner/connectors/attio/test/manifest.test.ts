import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";

const operations = manifest.operations as Record<string, Record<string, unknown>>;

describe("attio manifest", () => {
  test("has bounded hosts and compiles", () => {
    expect(manifest.network.allowedHosts).toEqual(["api.attio.com"]);
    expect(manifest.version).toBe("0.4.1");
    expect(manifest.http.baseUrl).toBe("https://api.attio.com");
    expect(manifest.http.auth.value).toBe("Bearer {{accessToken}}");
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("keeps origin records.list as POST query", () => {
    expect((operations["records.list"]!.request as Record<string, unknown>).method).toBe("POST");
    expect((operations["records.list"]!.request as Record<string, unknown>).path).toBe("/v2/objects/{{object}}/records/query");
  });

  test("gives every action a real request, title, description, and object inputSchema", () => {
    expect(Object.keys(operations).length).toBe(111);
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
      else if (["POST", "PUT", "PATCH"].includes(method) && !String((operation.request as Record<string, unknown>).path).endsWith("/query") && !String((operation.request as Record<string, unknown>).path).endsWith("/search")) {
        expect(operation.sideEffect, key).toBe("write");
      }
    }
    expect(operations["records.list"]!.sideEffect).toBe("read");
    expect(operations["records.search"]!.sideEffect).toBe("read");
    expect(operations["entries.list"]!.sideEffect).toBe("read");
    expect(operations["records.delete"]!.sideEffect).toBe("destructive");
    expect(operations["webhooks.create"]!.kind).toBe("action");
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

  test("keeps origin recipe operations in the runner", async () => {
    const recipe = await Bun.file(new URL("../../../../scripts/connector-gen/openconnector/recipes/attio/recipe.json", import.meta.url)).json();
    for (const key of Object.keys(recipe.manifest.operations)) {
      expect(operations[key], key).toBeDefined();
    }
  });


  test("adds JSON meeting create and get on the existing host", () => {
    const created = operations["meetings.create"]!;
    const got = operations["meetings.get"]!;
    const createdRequest = created.request as Record<string, unknown>;
    const gotRequest = got.request as Record<string, unknown>;
    expect(createdRequest.method).toBe("POST");
    expect(createdRequest.path).toBe("/v2/meetings");
    expect(createdRequest.baseUrl).toBeUndefined();
    expect(createdRequest.headers).toEqual({ "Content-Type": "application/json" });
    expect(createdRequest.body).toBeDefined();
    expect(gotRequest.method).toBe("GET");
    expect(gotRequest.path).toBe("/v2/meetings/{{meeting_id}}");
    expect(gotRequest.baseUrl).toBeUndefined();
    expect(gotRequest.body).toBeUndefined();
    expect(gotRequest.headers).toBeUndefined();
    expect(JSON.stringify(gotRequest)).not.toMatch(/content-type/i);
    expect((created.outputSchema as { type?: string }).type).toBe("object");
    expect((got.outputSchema as { type?: string }).type).toBe("object");
    expect((created.inputSchema as { required?: string[] }).required).toEqual([
      "title",
      "description",
      "start",
      "end",
      "is_all_day",
      "participants",
    ]);
    expect((got.inputSchema as { required?: string[] }).required).toEqual(["meeting_id"]);
  });

  test("covers the 12 previously aliased Composio tools as distinct HTTP operations", () => {
    for (const key of [
      "records.find",
      "records.query",
      "records.postQuery",
      "records.post",
      "records.getById",
      "records.patch",
      "records.searchV2",
      "lists.entries.list",
      "entries.query",
      "lists.entries.create",
      "entries.patch",
      "workspace_members.listV2",
    ]) {
      expect(operations[key], key).toBeDefined();
      expect((operations[key]!.request as Record<string, unknown>).method, key).toEqual(expect.any(String));
      expect((operations[key]!.request as Record<string, unknown>).path, key).toEqual(expect.any(String));
    }
  });
});
