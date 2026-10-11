import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import manifest from "../manifest.json";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const recipe = JSON.parse(
  readFileSync(join(import.meta.dir, "../../../../scripts/connector-gen/openconnector/recipes/callpage/recipe.json"), "utf8"),
) as {
  selection: { operations: string[] };
  operationSources: Record<string, { sourceRefs: string[] }>;
  source: { spans: Record<string, unknown> };
  manifest: { operations: Record<string, unknown>; version: string };
};

const ORIGIN_OPS = [
  "healthcheck",
  "users.list",
  "widgets.list",
  "widgets.get",
  "calls.get",
] as const;

const COMPOSIO_TOOLS: Record<string, string> = {
  CALLPAGE_ADD_USERS_TO_WIDGET: "widgets.add_users",
  CALLPAGE_CREATE_SMS_MESSAGE: "sms.create",
  CALLPAGE_CREATE_USER: "users.create",
  CALLPAGE_DELETE_MANAGER: "managers.delete",
  CALLPAGE_DELETE_USER: "users.delete",
  CALLPAGE_GET_ALL_MANAGERS: "managers.list",
  CALLPAGE_GET_ALL_SMS_MESSAGES: "sms.list",
  CALLPAGE_GET_ALL_USERS: "users.list",
  CALLPAGE_GET_ALL_VOICE_MESSAGES: "voice.list",
  CALLPAGE_GET_ALL_WIDGETS: "widgets.list",
  CALLPAGE_GET_API_ROOT: "healthcheck",
  CALLPAGE_GET_CALLS_HISTORY: "calls.history",
  CALLPAGE_GET_MANAGER: "managers.get",
  CALLPAGE_GET_MANAGER_STATUS_STATISTICS: "managers.status_statistics",
  CALLPAGE_GET_WIDGET: "widgets.get",
  CALLPAGE_POST_CREATE_MANAGER: "managers.create",
  CALLPAGE_POST_CREATE_VOICE_MESSAGE: "voice.create",
  CALLPAGE_POST_CREATE_WIDGET: "widgets.create",
  CALLPAGE_POST_DELETE_WIDGET: "widgets.delete",
  CALLPAGE_POST_RESET_SMS: "sms.reset",
  CALLPAGE_POST_RESET_VOICE_MESSAGE: "voice.reset",
  CALLPAGE_POST_UPDATE_MANAGER: "managers.update",
  CALLPAGE_POST_UPDATE_SMS: "sms.update",
  CALLPAGE_POST_UPDATE_USER: "users.update",
  CALLPAGE_POST_UPDATE_WIDGET: "widgets.update",
  CALLPAGE_POST_WIDGET_CALL_OR_SCHEDULE: "widgets.call_or_schedule",
};

const compiled = compileDeclarativeConnector(manifest as never);

function requestOf(key: string): Record<string, unknown> {
  return operations[key]!.request as Record<string, unknown>;
}

describe("callpage manifest", () => {
  test("keeps origin identity, auth, and version 0.2.0", () => {
    expect(manifest.key).toBe("callpage");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.network.allowedHosts).toEqual(["core.callpage.io"]);
    expect(manifest.http.baseUrl).toBe("https://core.callpage.io");
    expect(manifest.http.auth).toMatchObject({
      field: "apiKey",
      in: "header",
      name: "Authorization",
      value: "{{apiKey}}",
    });
    expect(manifest.http.headers).toEqual({ Accept: "application/json" });
    expect(manifest.http.errors.bodyErrorPaths).toEqual(["hasError"]);
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("keeps the origin five operations and paths", () => {
    for (const key of ORIGIN_OPS) {
      expect(operations[key], key).toBeDefined();
      expect(requestOf(key), key).toBeDefined();
    }
    expect(requestOf("healthcheck")).toMatchObject({ method: "GET", path: "/api/v1/external" });
    expect(requestOf("users.list")).toMatchObject({ method: "GET", path: "/api/v1/external/users/all" });
    expect(requestOf("widgets.list")).toMatchObject({ method: "GET", path: "/api/v1/external/widgets/all" });
    expect(requestOf("widgets.get")).toMatchObject({ method: "GET", path: "/api/v1/external/widgets/get" });
    expect(requestOf("calls.get")).toMatchObject({ method: "GET", path: "/api/v3/external/calls/{{callId}}" });
    expect((operations["widgets.get"]!.inputSchema as { required: string[] }).required).toEqual(["widgetId"]);
    expect((operations["calls.get"]!.inputSchema as { required: string[] }).required).toEqual(["callId"]);
  });

  test("covers every Composio CallPage tool with a real HTTP operation", () => {
    expect(Object.keys(COMPOSIO_TOOLS)).toHaveLength(26);
    expect(Object.keys(operations)).toHaveLength(27);
    for (const [slug, key] of Object.entries(COMPOSIO_TOOLS)) {
      expect(operations[key], slug).toBeDefined();
      expect(requestOf(key), slug).toBeDefined();
      expect(compiled.actions[key], slug).toBeTypeOf("function");
    }
    expect(operations["calls.get"]).toBeDefined();
  });

  test("gives every action a title, description, object inputSchema, and request block", () => {
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
      expect(String(request.path).startsWith("/"), key).toBe(true);
      expect(operation.enforceOutputSchema, key).toBe(true);
      expect(operation.responseFormat, key).toBe("json");
      expect(operation.validationMode, key).toBe("strict-generated");
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

  test("maps documented CallPage family paths", () => {
    expect(requestOf("calls.history")).toMatchObject({ method: "GET", path: "/api/v3/external/calls/history" });
    expect(requestOf("users.create")).toMatchObject({ method: "POST", path: "/api/v1/external/users/create" });
    expect(requestOf("users.update")).toMatchObject({ method: "POST", path: "/api/v1/external/users/update" });
    expect(requestOf("users.delete")).toMatchObject({ method: "POST", path: "/api/v1/external/users/delete" });
    expect(requestOf("widgets.create")).toMatchObject({ method: "POST", path: "/api/v1/external/widgets/create" });
    expect(requestOf("widgets.update")).toMatchObject({ method: "POST", path: "/api/v1/external/widgets/update" });
    expect(requestOf("widgets.delete")).toMatchObject({ method: "POST", path: "/api/v1/external/widgets/delete" });
    expect(requestOf("widgets.add_users")).toMatchObject({ method: "POST", path: "/api/v1/external/widgets/add-users" });
    expect(requestOf("widgets.call_or_schedule")).toMatchObject({
      method: "POST",
      path: "/api/v1/external/widgets/call-or-schedule",
    });
    expect(requestOf("managers.list")).toMatchObject({ method: "GET", path: "/api/v1/external/managers/all" });
    expect(requestOf("managers.get")).toMatchObject({ method: "GET", path: "/api/v1/external/managers/get" });
    expect(requestOf("managers.create")).toMatchObject({ method: "POST", path: "/api/v1/external/managers/create" });
    expect(requestOf("managers.update")).toMatchObject({ method: "POST", path: "/api/v1/external/managers/update" });
    expect(requestOf("managers.delete")).toMatchObject({ method: "POST", path: "/api/v1/external/managers/delete" });
    expect(requestOf("managers.status_statistics")).toMatchObject({
      method: "GET",
      path: "/api/v1/external/managers/all",
    });
    expect(requestOf("sms.list")).toMatchObject({ method: "GET", path: "/api/v1/external/sms/all" });
    expect(requestOf("sms.create")).toMatchObject({ method: "POST", path: "/api/v1/external/sms/create" });
    expect(requestOf("sms.update")).toMatchObject({ method: "POST", path: "/api/v1/external/sms/update" });
    expect(requestOf("sms.reset")).toMatchObject({ method: "POST", path: "/api/v1/external/sms/reset" });
    expect(requestOf("voice.list")).toMatchObject({ method: "GET", path: "/api/v1/external/voice/all" });
    expect(requestOf("voice.create")).toMatchObject({ method: "POST", path: "/api/v1/external/voice/create" });
    expect(requestOf("voice.reset")).toMatchObject({ method: "POST", path: "/api/v1/external/voice/reset" });
  });

  test("only interpolates path placeholders the schema requires", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as Record<string, unknown>;
      const schema = operation.inputSchema as { required?: string[] };
      const placeholders = [...String(request.path ?? "").matchAll(/\{\{\s*([A-Za-z0-9_.$-]+)\s*\}\}/g)].map(
        (match) => match[1],
      );
      for (const placeholder of placeholders) {
        expect(schema.required ?? [], `${key} path uses {{${placeholder}}}`).toContain(placeholder);
      }
    }
  });

  test("puts Content-Type only on JSON bodies", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as Record<string, unknown>;
      const method = String(request.method);
      const headers = (request.headers as Record<string, string> | undefined) ?? {};
      if (request.body !== undefined) {
        expect(headers["Content-Type"], key).toBe("application/json");
      } else {
        expect(headers["Content-Type"], key).toBeUndefined();
      }
      if (method === "GET") expect(request.body, key).toBeUndefined();
    }
  });

  test("recipe operations match the runner manifest and reuse existing spans", () => {
    expect(recipe.manifest.version).toBe("0.2.0");
    const runnerOps = Object.keys(operations).sort();
    expect(Object.keys(recipe.manifest.operations).sort()).toEqual(runnerOps);
    expect([...recipe.selection.operations].sort()).toEqual(runnerOps);
    expect(Object.keys(recipe.operationSources).sort()).toEqual(runnerOps);
    for (const [opKey, mapping] of Object.entries(recipe.operationSources)) {
      expect(mapping.sourceRefs.length, opKey).toBeGreaterThan(0);
      for (const ref of mapping.sourceRefs) {
        expect(recipe.source.spans[ref], `${opKey} sourceRef ${ref}`).toBeDefined();
      }
    }
  });
});
