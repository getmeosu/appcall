import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import COMPOSIO_TOOLS from "./composio-cover.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const ORIGIN_OPS = ["healthcheck", "users.me", "shots.list", "shots.get", "shots.update", "shots.delete"] as const;

const compiled = compileDeclarativeConnector(manifest as never);
const actions = compiled.actions;

function requestOf(key: string): Record<string, unknown> {
  return operations[key]!.request as Record<string, unknown>;
}

describe("dribbble manifest", () => {
  test("has bounded host, origin auth, version, and compiles", () => {
    expect(manifest.key).toBe("dribbble");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.categories).toEqual(["social"]);
    expect(manifest.network.allowedHosts).toEqual(["api.dribbble.com"]);
    expect(manifest.http.baseUrl).toBe("https://api.dribbble.com/v2");
    expect(manifest.auth.type).toBe("bearer");
    expect(manifest.auth.setup.mode).toBe("api_key");
    expect(manifest.auth.setup.fields.find((field: { secret?: boolean }) => field.secret)?.key).toBe(manifest.http.auth.field);
    expect(manifest.http.auth.value).toBe("Bearer {{accessToken}}");
    expect(manifest.http.errors.retryAfterHeader).toBe("x-ratelimit-reset");
    expect(manifest.http.errors.retryAfterKind).toBe("unix");
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("keeps the origin six operations", () => {
    for (const key of ORIGIN_OPS) {
      expect(operations[key], key).toBeDefined();
      expect(requestOf(key), key).toBeDefined();
    }
    expect(requestOf("healthcheck")).toMatchObject({ method: "GET", path: "/user" });
    expect(requestOf("users.me").path).toBe("/user");
    expect(requestOf("shots.list").path).toBe("/user/shots");
    expect(requestOf("shots.get").path).toBe("/shots/{{id}}");
    expect(requestOf("shots.update").path).toBe("/shots/{{id}}");
    expect(requestOf("shots.delete").path).toBe("/shots/{{id}}");
    expect((operations["shots.get"]!.inputSchema as { required: string[] }).required).toEqual(["id"]);
  });

  test("covers every remaining Composio Dribbble tool with a compiled request", () => {
    expect(Object.keys(COMPOSIO_TOOLS)).toHaveLength(10);
    expect(Object.keys(operations).length).toBe(15);
    expect(operations["shots.create"]).toBeUndefined();
    expect(operations["attachments.create"]).toBeUndefined();
    for (const [slug, key] of Object.entries(COMPOSIO_TOOLS)) {
      expect(operations[key], slug).toBeDefined();
      expect(actions[key as keyof typeof actions], slug).toBeTypeOf("function");
      expect(requestOf(key), slug).toBeDefined();
      expect(compiled.actions[key], slug).toBeTypeOf("function");
    }
    expect(operations.healthcheck).toBeDefined();
  });

  test("gives every action a title, description, object inputSchema, and request", () => {
    for (const [key, operation] of Object.entries(operations)) {
      expect(operation.kind, key).toBe("action");
      expect(["read", "write", "destructive"], key).toContain(operation.sideEffect);
      expect(String(operation.title ?? "").length, key).toBeGreaterThan(0);
      expect(String(operation.description ?? "").length, key).toBeGreaterThan(10);
      expect((operation.inputSchema as { type?: string }).type, key).toBe("object");
      expect(operation.request, `${key} must declare a request block`).toBeDefined();
      const request = operation.request as Record<string, unknown>;
      expect(typeof request.method, key).toBe("string");
      expect(typeof request.path, key).toBe("string");
      expect(String(request.path).startsWith("/"), key).toBe(true);
    }
  });

  test("maps documented Dribbble paths", () => {
    expect(requestOf("projects.list").path).toBe("/user/projects");
    expect(requestOf("projects.create").path).toBe("/projects");
    expect(requestOf("projects.update").path).toBe("/projects/{{id}}");
    expect(requestOf("projects.delete").path).toBe("/projects/{{id}}");
    expect(requestOf("attachments.delete").path).toBe("/shots/{{shotId}}/attachments/{{id}}");
    expect((requestOf("projects.list").query as Record<string, string>).per_page).toBe("{{perPage}}");
    expect((requestOf("projects.create").body as Record<string, string>).name).toBe("{{name}}");
    expect((requestOf("shots.update").body as Record<string, string>).low_profile).toBe("{{lowProfile}}");
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
    const recipe = await Bun.file(new URL("../../../../scripts/connector-gen/openconnector/recipes/dribbble/recipe.json", import.meta.url)).json();
    expect(Object.keys(recipe.manifest.operations).sort()).toEqual(Object.keys(operations).sort());
    expect([...recipe.selection.operations].sort()).toEqual(Object.keys(operations).sort());
    expect(recipe.manifest.version).toBe("0.2.0");
  });
});
