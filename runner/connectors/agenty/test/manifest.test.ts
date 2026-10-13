import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import manifest from "../manifest.json";
import cover from "./composio-cover.json";

const recipePath = "scripts/connector-gen/openconnector/recipes/agenty/recipe.json";
const operations = manifest.operations as Record<string, Record<string, unknown>>;

describe("agenty manifest", () => {
  it("keeps connector identity, bun runtime, and api key auth", () => {
    expect(manifest.key).toBe("agenty");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.version).toBe("0.3.1");
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.http.baseUrl).toBe("https://api.agenty.com/v2");
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "X-Agenty-ApiKey",
      value: "{{apiKey}}",
    });
    expect(manifest.http.headers).toEqual({ Accept: "application/json" });
    expect(manifest.auth.setup.fields.map((field: { key: string }) => field.key)).toEqual(["apiKey"]);
    expect(manifest.network.allowedHosts).toEqual(["api.agenty.com", "browser.agenty.com"]);
  });

  it("keeps the unchanged 0.3.0 recipe with the three team operations as the only gap", () => {
    expect(existsSync(recipePath)).toBe(true);
    const recipe = JSON.parse(readFileSync(recipePath, "utf8")) as {
      selection: { operations: string[] };
      operationSources: Record<string, unknown>;
      manifest: { operations: Record<string, unknown>; version: string };
    };
    const runnerOps = Object.keys(operations).sort();
    const recipeOps = Object.keys(recipe.manifest.operations).sort();
    expect(recipe.manifest.version).toBe("0.3.0");
    expect(recipeOps).toHaveLength(81);
    expect([...recipe.selection.operations].sort()).toEqual(recipeOps);
    expect(Object.keys(recipe.operationSources).sort()).toEqual(recipeOps);
    const absentFromRecipe = runnerOps.filter((key) => !Object.hasOwn(recipe.operationSources, key));
    expect(absentFromRecipe).toEqual(["team.get", "team.list", "team.update"]);
    expect(runnerOps).toEqual([...recipeOps, "team.get", "team.list", "team.update"].sort());
    for (const key of recipeOps) {
      expect(operations[key], key).toEqual(recipe.manifest.operations[key]);
    }
  });

  it("declares title, description, object inputSchema, and a request for every action", () => {
    expect(Object.keys(operations).length).toBe(84);
    for (const [key, operation] of Object.entries(operations)) {
      expect(operation.kind, key).toBe("action");
      expect(String(operation.title ?? "").length, key).toBeGreaterThan(0);
      expect(String(operation.description ?? "").length, key).toBeGreaterThan(0);
      expect((operation.inputSchema as { type?: string }).type, key).toBe("object");
      expect((operation.inputSchema as { additionalProperties?: boolean }).additionalProperties, key).toBe(false);
      expect(operation.request, `${key} must declare a request block`).toBeDefined();
      expect(["read", "write", "destructive"]).toContain(operation.sideEffect);
      expect(operation.enforceOutputSchema).toBe(true);
      expect(["json", "text"]).toContain(operation.responseFormat);
      expect(operation.validationMode).toBe("strict-generated");
      const request = operation.request as { method?: string; path?: string };
      expect(typeof request.method, key).toBe("string");
      expect(typeof request.path, key).toBe("string");
      expect((operation.maxResponseBytes as number) >= (operation.maxInputBytes as number), key).toBe(true);
    }
  });

  it("adds team list, get, and update on https://api.agenty.com", () => {
    expect(operations["team.create"]).toBeUndefined();
    expect(operations["team.delete"]).toBeUndefined();

    const usersList = operations["users.list"] as { request: { path: string; baseUrl?: string; query?: Record<string, string> } };
    const usersGet = operations["users.get"] as { request: { path: string; baseUrl?: string; query?: Record<string, string> } };
    const usersUpdate = operations["users.update"] as { request: { path: string; baseUrl?: string; query?: Record<string, string> } };
    expect(usersList.request.path).toBe("/users");
    expect(usersGet.request.path).toBe("/users/{{user_id}}");
    expect(usersUpdate.request.path).toBe("/users/{{user_id}}");
    expect(usersList.request.baseUrl).toBeUndefined();
    expect(usersGet.request.baseUrl).toBeUndefined();
    expect(usersUpdate.request.baseUrl).toBeUndefined();
    expect(usersList.request.query ?? {}).not.toHaveProperty("apikey");
    expect(usersGet.request.query ?? {}).not.toHaveProperty("apikey");
    expect(usersUpdate.request.query ?? {}).not.toHaveProperty("apikey");

    const list = operations["team.list"] as {
      sideEffect: string;
      timeoutMs: number;
      maxInputBytes: number;
      maxResponseBytes: number;
      inputSchema: { type: string; additionalProperties: boolean; properties: Record<string, unknown>; required?: string[] };
      outputSchema: { type: string; required: string[]; properties: { data: { type: string; required: string[] } } };
      request: { method: string; path: string; baseUrl: string; success: number[]; query: Record<string, string>; headers?: Record<string, string>; body?: unknown };
    };
    expect(list.sideEffect).toBe("read");
    expect(list.timeoutMs).toBe(15000);
    expect(list.maxInputBytes).toBe(65536);
    expect(list.maxResponseBytes).toBe(5242880);
    expect(list.inputSchema.type).toBe("object");
    expect(list.inputSchema.additionalProperties).toBe(false);
    expect(list.inputSchema.properties).toEqual({});
    expect(list.inputSchema.required).toBeUndefined();
    expect(list.outputSchema.required).toEqual(["data"]);
    expect(list.outputSchema.properties.data.type).toBe("object");
    expect(list.outputSchema.properties.data.required).toEqual(["total", "result"]);
    expect(list.request).toEqual({
      method: "GET",
      path: "/v1/team",
      success: [200],
      baseUrl: "https://api.agenty.com",
      query: { apikey: "{{apiKey}}" },
    });

    const get = operations["team.get"] as {
      sideEffect: string;
      timeoutMs: number;
      maxInputBytes: number;
      maxResponseBytes: number;
      inputSchema: { type: string; additionalProperties: boolean; required: string[]; properties: Record<string, unknown> };
      request: { method: string; path: string; baseUrl: string; success: number[]; query: Record<string, string>; headers?: Record<string, string>; body?: unknown };
    };
    expect(get.sideEffect).toBe("read");
    expect(get.timeoutMs).toBe(15000);
    expect(get.maxInputBytes).toBe(65536);
    expect(get.maxResponseBytes).toBe(5242880);
    expect(get.inputSchema.additionalProperties).toBe(false);
    expect(get.inputSchema.required).toEqual(["member_id"]);
    expect(Object.keys(get.inputSchema.properties)).toEqual(["member_id"]);
    expect(get.request).toEqual({
      method: "GET",
      path: "/v1/team/{{member_id}}",
      success: [200],
      baseUrl: "https://api.agenty.com",
      query: { apikey: "{{apiKey}}" },
    });

    const update = operations["team.update"] as {
      sideEffect: string;
      timeoutMs: number;
      maxInputBytes: number;
      maxResponseBytes: number;
      inputSchema: { type: string; additionalProperties: boolean; required: string[]; properties: Record<string, unknown> };
      request: {
        method: string;
        path: string;
        baseUrl: string;
        success: number[];
        query: Record<string, string>;
        headers: Record<string, string>;
        body: Record<string, string>;
      };
    };
    expect(update.sideEffect).toBe("write");
    expect(update.timeoutMs).toBe(15000);
    expect(update.maxInputBytes).toBe(65536);
    expect(update.maxResponseBytes).toBe(5242880);
    expect(update.inputSchema.additionalProperties).toBe(false);
    expect(update.inputSchema.required).toEqual(["member_id", "user_id", "email", "name", "role_id", "status"]);
    expect(Object.keys(update.inputSchema.properties).sort()).toEqual(["email", "member_id", "name", "role_id", "status", "user_id"]);
    expect(update.request).toEqual({
      method: "PUT",
      path: "/v1/team/{{member_id}}",
      success: [200],
      baseUrl: "https://api.agenty.com",
      query: { apikey: "{{apiKey}}" },
      body: {
        user_id: "{{user_id}}",
        email: "{{email}}",
        name: "{{name}}",
        role_id: "{{role_id}}",
        status: "{{status}}",
      },
      headers: { "Content-Type": "application/json" },
    });
  });

  it("covers every Composio Agenty tool with a real operation", () => {
    expect(Object.keys(cover).length).toBe(79);
    expect(cover.AGENTY_GET_ALL_TEAM_MEMBERS).toBe("team.list");
    expect(cover.AGENTY_GET_USER_BY_ID).toBe("team.get");
    expect(cover.AGENTY_UPDATE_USER_BY_ID).toBe("team.update");
    for (const [slug, op] of Object.entries(cover as Record<string, string>)) {
      expect(operations[op], `${slug} -> ${op}`).toBeDefined();
    }
  });
});
