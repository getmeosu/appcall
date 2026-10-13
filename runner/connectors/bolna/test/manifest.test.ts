import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import manifest from "../manifest.json";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";

const recipePath = "scripts/connector-gen/openconnector/recipes/bolna/recipe.json";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const recipe = JSON.parse(readFileSync(recipePath, "utf8")) as {
  selection: { operations: string[] };
  operationSources: Record<string, { sourceRefs: string[] }>;
  source: { spans: Record<string, unknown> };
  manifest: { operations: Record<string, unknown>; version: string };
};

const ORIGIN_OPS = [
  "healthcheck",
  "agents.list",
  "agents.get",
  "executions.list",
  "executions.get",
] as const;

// ops the pinned recipe has real provenance for
const PINNED_OPS = [
  "agents.copy",
  "agents.create",
  "agents.create_template",
  "agents.delete",
  "agents.get",
  "agents.get_v1",
  "agents.import",
  "agents.list",
  "agents.list_paginated",
  "agents.patch_v1",
  "agents.stop_calls",
  "agents.update",
  "batches.create",
  "batches.delete",
  "batches.executions.list",
  "batches.get",
  "batches.list",
  "batches.schedule",
  "batches.stop",
  "calls.create",
  "executions.agent.get",
  "executions.get",
  "executions.list",
  "healthcheck",
  "inbound.setup",
  "knowledgebases.create",
  "knowledgebases.delete",
  "knowledgebases.get",
  "knowledgebases.list",
  "phone_numbers.list",
  "phone_numbers.search",
  "providers.add",
  "providers.list",
  "providers.remove",
  "users.me",
  "voices.list",
];

// ops this branch added from the provider's live API; no pinned action id exists
const DEEPENED_OPS = [
  "agents.patch",
  "calls.stop",
  "dispositions.bulk",
  "dispositions.create",
  "dispositions.delete",
  "dispositions.get",
  "dispositions.list",
  "dispositions.test",
  "dispositions.update",
  "executions.log",
  "extraction_categories.create",
  "extraction_categories.delete",
  "extraction_categories.list",
  "extraction_categories.update",
  "inbound.unlink",
  "phone_numbers.buy",
  "phone_numbers.delete",
  "sip_trunks.create",
  "sip_trunks.delete",
  "sip_trunks.get",
  "sip_trunks.list",
  "sip_trunks.numbers.add",
  "sip_trunks.numbers.list",
  "sip_trunks.numbers.remove",
  "sip_trunks.update",
  "sub_accounts.create",
  "sub_accounts.delete",
  "sub_accounts.list",
  "sub_accounts.update",
  "sub_accounts.usage.get",
  "sub_accounts.usage.list",
  "user.models.add",
  "user.models.delete",
  "user.models.list",
  "violations.list",
  "voices.providers.list",
  "workflow_campaigns.abort",
  "workflow_campaigns.create",
  "workflow_campaigns.entries.list",
  "workflow_campaigns.entries.upload",
  "workflow_campaigns.executions.list",
  "workflow_campaigns.get",
  "workflow_campaigns.list",
  "workflow_campaigns.pause",
  "workflow_campaigns.report",
  "workflow_campaigns.resume",
  "workflow_campaigns.start",
  "workflow_executions.cancel",
  "workflow_executions.get",
  "workflow_executions.webhook.resend",
  "workflow_node_types.list",
  "workflows.create",
  "workflows.draft.get",
  "workflows.draft.save",
  "workflows.get",
  "workflows.list",
  "workflows.publish",
  "workflows.run",
  "workflows.update",
  "workflows.validate",
  "workflows.version.get",
  "workflows.webhook.test",
];

const COMPOSIO_TOOLS: Record<string, string> = {
  BOLNA_ADD_PROVIDER: "providers.add",
  BOLNA_COPY_AGENT: "agents.copy",
  BOLNA_CREATE_AGENT: "agents.create",
  BOLNA_CREATE_BATCH: "batches.create",
  BOLNA_CREATE_KNOWLEDGEBASE: "knowledgebases.create",
  BOLNA_CREATE_TEMPLATE_AGENT: "agents.create_template",
  BOLNA_DELETE_AGENT_BY_ID: "agents.delete",
  BOLNA_DELETE_BATCH_BY_ID: "batches.delete",
  BOLNA_DELETE_KNOWLEDGEBASE: "knowledgebases.delete",
  BOLNA_FETCH_ALL_BATCHES_BY_AGENT_ID: "batches.list",
  BOLNA_GET_AGENT_V1: "agents.get_v1",
  BOLNA_GET_ALL_AGENTS: "agents.list",
  BOLNA_GET_EXECUTION_BY_ID: "executions.get",
  BOLNA_GET_KNOWLEDGEBASE: "knowledgebases.get",
  BOLNA_GET_USER_INFO: "users.me",
  BOLNA_IMPORT_AGENT: "agents.import",
  BOLNA_LIST_AGENTS_PAGINATED: "agents.list_paginated",
  BOLNA_LIST_KNOWLEDGEBASES: "knowledgebases.list",
  BOLNA_LIST_PHONE_NUMBERS: "phone_numbers.list",
  BOLNA_LIST_PROVIDERS: "providers.list",
  BOLNA_LIST_VOICES: "voices.list",
  BOLNA_MAKE_A_PHONE_CALL_FROM_AGENT: "calls.create",
  BOLNA_PATCH_AGENT_V1: "agents.patch_v1",
  BOLNA_REMOVE_PROVIDER: "providers.remove",
  BOLNA_RETRIEVE_AGENT_BY_ID: "agents.get",
  BOLNA_RETRIEVE_AGENT_EXECUTION_DETAILS: "executions.agent.get",
  BOLNA_RETRIEVE_AGENT_EXECUTION_STATUS: "executions.list",
  BOLNA_RETRIEVE_BATCH_DETAILS_BY_ID: "batches.get",
  BOLNA_RETRIEVE_BATCH_EXECUTION_LIST: "batches.executions.list",
  BOLNA_SCHEDULE_BATCH_BY_ID: "batches.schedule",
  BOLNA_SEARCH_PHONE_NUMBERS: "phone_numbers.search",
  BOLNA_SETUP_INBOUND_CALL_FOR_AGENT: "inbound.setup",
  BOLNA_STOP_AGENT_CALLS: "agents.stop_calls",
  BOLNA_STOP_BATCH_BY_ID: "batches.stop",
  BOLNA_UPDATE_AGENT: "agents.update",
};

const HANDWRITTEN = new Set(["batches.create", "knowledgebases.create"]);
const compiled = compileDeclarativeConnector(manifest as never);

function requestOf(key: string): Record<string, unknown> {
  return operations[key]!.request as Record<string, unknown>;
}

describe("bolna manifest", () => {
  test("keeps origin identity and auth and bumps version to 0.2.1", () => {
    expect(manifest.key).toBe("bolna");
    expect(manifest.version).toBe("0.2.1");
    expect(manifest.network.allowedHosts).toEqual(["api.bolna.ai"]);
    expect(manifest.http.baseUrl).toBe("https://api.bolna.ai");
    expect(manifest.http.auth).toMatchObject({
      field: "apiKey",
      in: "header",
      name: "Authorization",
      value: "Bearer {{apiKey}}",
    });
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("keeps the origin five operations and paths", () => {
    for (const key of ORIGIN_OPS) {
      expect(operations[key], key).toBeDefined();
      expect(requestOf(key), key).toBeDefined();
    }
    expect(requestOf("healthcheck")).toMatchObject({ method: "GET", path: "/user/me" });
    expect(requestOf("agents.list")).toMatchObject({ method: "GET", path: "/v2/agent/all" });
    expect(requestOf("agents.get")).toMatchObject({ method: "GET", path: "/v2/agent/{{agent_id}}" });
    expect(requestOf("executions.get")).toMatchObject({ method: "GET", path: "/executions/{{execution_id}}" });
    expect(requestOf("executions.list")).toMatchObject({
      method: "GET",
      path: "/v2/agent/{{agent_id}}/executions",
    });
    expect((operations["executions.list"]!.inputSchema as { required: string[] }).required).toEqual(["agent_id"]);
  });

  test("covers every Composio Bolna tool with a real HTTP operation", () => {
    expect(Object.keys(COMPOSIO_TOOLS)).toHaveLength(35);
    expect(Object.keys(operations)).toHaveLength(98);
    for (const [slug, key] of Object.entries(COMPOSIO_TOOLS)) {
      expect(operations[key], slug).toBeDefined();
      if (HANDWRITTEN.has(key)) {
        expect(operations[key]!.request, slug).toBeUndefined();
        expect(compiled.actions[key], slug).toBeUndefined();
      } else {
        expect(requestOf(key), slug).toBeDefined();
        expect(compiled.actions[key], slug).toBeTypeOf("function");
      }
    }
    expect(operations["healthcheck"]).toBeDefined();
    expect(compiled.actions["healthcheck"]).toBeTypeOf("function");
  });

  test("gives every action a title, description, object inputSchema, and request or handwritten handler", () => {
    for (const [key, operation] of Object.entries(operations)) {
      expect(operation.kind, key).toBe("action");
      expect(["read", "write", "destructive"], key).toContain(operation.sideEffect);
      expect(String(operation.title ?? "").length, key).toBeGreaterThan(0);
      expect(String(operation.description ?? "").length, key).toBeGreaterThan(0);
      expect((operation.inputSchema as { type?: string }).type, key).toBe("object");
      if (HANDWRITTEN.has(key)) {
        expect(operation.request, key).toBeUndefined();
      } else {
        expect(operation.request, `${key} must declare a request block`).toBeDefined();
        const request = operation.request as Record<string, unknown>;
        expect(typeof request.method, key).toBe("string");
        expect(typeof request.path, key).toBe("string");
        expect(String(request.path).startsWith("/"), key).toBe(true);
      }
    }
  });

  test("classifies mutating HTTP methods as write or destructive", () => {
    for (const [key, operation] of Object.entries(operations)) {
      if (HANDWRITTEN.has(key)) {
        expect(operation.sideEffect, key).toBe("write");
        continue;
      }
      const method = String((operation.request as Record<string, unknown>).method);
      if (method === "DELETE") expect(operation.sideEffect, key).toBe("destructive");
      else if (["POST", "PUT", "PATCH"].includes(method)) expect(operation.sideEffect, key).toBe("write");
      else expect(operation.sideEffect, key).toBe("read");
    }
  });

  test("maps documented Bolna family paths", () => {
    expect(requestOf("users.me")).toMatchObject({ method: "GET", path: "/user/me" });
    expect(requestOf("agents.create")).toMatchObject({ method: "POST", path: "/v2/agent" });
    expect(requestOf("agents.update")).toMatchObject({ method: "PUT", path: "/v2/agent/{{agent_id}}" });
    expect(requestOf("agents.delete")).toMatchObject({ method: "DELETE", path: "/v2/agent/{{agent_id}}" });
    expect(requestOf("agents.stop_calls")).toMatchObject({ method: "POST", path: "/v2/agent/{{agent_id}}/stop" });
    expect(requestOf("agents.get_v1")).toMatchObject({ method: "GET", path: "/agent/{{agent_uuid}}" });
    expect(requestOf("agents.patch_v1")).toMatchObject({ method: "PATCH", path: "/agent/{{agent_uuid}}" });
    expect(requestOf("agents.list_paginated")).toMatchObject({ method: "GET", path: "/agent/all" });
    expect(requestOf("calls.create")).toMatchObject({ method: "POST", path: "/call" });
    expect(requestOf("batches.list").path).toBe("/batches/{{agent_id}}/all");
    expect(requestOf("batches.get").path).toBe("/batches/{{batch_id}}");
    expect(requestOf("batches.executions.list").path).toBe("/v2/batches/{{batch_id}}/executions");
    expect(requestOf("batches.schedule")).toMatchObject({
      method: "POST",
      path: "/batches/{{batch_id}}/schedule",
      bodyEncoding: "form",
    });
    expect(requestOf("knowledgebases.get").path).toBe("/knowledgebase/{{rag_id}}");
    expect(requestOf("providers.add")).toMatchObject({ method: "POST", path: "/providers" });
    expect(requestOf("providers.remove").path).toBe("/providers/{{provider_key_name}}");
    expect(requestOf("phone_numbers.search")).toMatchObject({
      method: "GET",
      path: "/phone-numbers/search",
    });
    expect(requestOf("inbound.setup")).toMatchObject({ method: "POST", path: "/inbound/setup" });
    expect(requestOf("voices.list")).toMatchObject({
      method: "GET",
      path: "/api/v1/voice-config/tts/voices",
    });
    expect(requestOf("executions.agent.get").path).toBe("/agent/{{agent_id}}/execution/{{execution_id}}");
    expect((operations["voices.list"]!.inputSchema as { required: string[] }).required).toEqual(
      expect.arrayContaining(["provider_id", "model_id"]),
    );
  });

  test("only interpolates path placeholders the schema requires", () => {
    for (const [key, operation] of Object.entries(operations)) {
      if (HANDWRITTEN.has(key)) continue;
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
      if (HANDWRITTEN.has(key)) continue;
      const request = operation.request as Record<string, unknown>;
      const method = String(request.method);
      const headers = (request.headers as Record<string, string> | undefined) ?? {};
      if (request.bodyEncoding === "form") {
        expect(headers["Content-Type"], key).toBe("application/x-www-form-urlencoded");
      } else if (request.body !== undefined) {
        expect(headers["Content-Type"], key).toBe("application/json");
      } else {
        expect(headers["Content-Type"], key).toBeUndefined();
      }
      if (method === "GET") expect(request.body, key).toBeUndefined();
    }
  });

  test("recipe mirrors the deepened operations; provenance mappings stay pinned", () => {
    expect(existsSync(recipePath)).toBe(true);
    expect(recipe.manifest.version).toBe("0.2.0");
    const runnerOps = Object.keys(operations).sort();
    const recipeOps = Object.keys(recipe.manifest.operations).sort();
    expect(recipeOps).toHaveLength(98);
    expect(runnerOps).toEqual(recipeOps);
    expect(runnerOps.filter((key) => !Object.hasOwn(recipe.operationSources, key))).toEqual(DEEPENED_OPS);
    expect(Object.keys(recipe.operationSources).sort()).toEqual(PINNED_OPS);
    expect([...recipe.selection.operations].sort()).toEqual(PINNED_OPS);
    for (const [opKey, mapping] of Object.entries(recipe.operationSources)) {
      expect(mapping.sourceRefs.length, opKey).toBeGreaterThan(0);
      for (const ref of mapping.sourceRefs) {
        expect(recipe.source.spans[ref], `${opKey} sourceRef ${ref}`).toBeDefined();
      }
    }
    for (const key of recipeOps) {
      const runner = operations[key]!;
      const recipeOp = recipe.manifest.operations[key] as Record<string, unknown>;
      if (key === "batches.create" || key === "knowledgebases.create") {
        expect(runner.maxResponseBytes).toBe(key === "batches.create" ? 6291456 : 8388608);
        expect(recipeOp.maxResponseBytes).toBe(5242880);
        const { maxResponseBytes: _runnerLimit, ...runnerRest } = runner;
        const { maxResponseBytes: _recipeLimit, ...recipeRest } = recipeOp;
        expect(runnerRest).toEqual(recipeRest);
        continue;
      }
      expect(runner, key).toEqual(recipeOp);
    }
  });

  test("adds documented JSON routes with sibling limits and no host change", () => {
    const sibling = operations["users.me"]!;
    expect(DEEPENED_OPS).toHaveLength(62);
    for (const key of DEEPENED_OPS) {
      const operation = operations[key]!;
      const request = operation.request as {
        method: string;
        path: string;
        success: number[];
        baseUrl?: string;
        body?: unknown;
        headers?: Record<string, string>;
      };
      expect(operation.timeoutMs, key).toBe(sibling.timeoutMs);
      expect(operation.maxInputBytes, key).toBe(sibling.maxInputBytes);
      expect(operation.maxResponseBytes, key).toBe(sibling.maxResponseBytes);
      expect(operation.responseFormat, key).toBe("json");
      expect(operation.validationMode, key).toBe("strict-generated");
      expect(operation.enforceOutputSchema, key).toBe(true);
      expect((operation.outputSchema as { type?: string }).type, key).toBe("object");
      expect(request.baseUrl, key).toBeUndefined();
      expect(request.success.length, key).toBeGreaterThan(0);
      expect(request.path.startsWith("/"), key).toBe(true);
      if (request.method === "GET" || request.method === "DELETE") {
        expect(request.body, key).toBeUndefined();
        expect(request.headers?.["Content-Type"], key).toBeUndefined();
      } else if (request.body !== undefined) {
        expect(request.headers?.["Content-Type"], key).toBe("application/json");
      } else {
        expect(request.headers?.["Content-Type"], key).toBeUndefined();
      }
    }
    expect(manifest.http.baseUrl).toBe("https://api.bolna.ai");
    expect(manifest.network.allowedHosts).toEqual(["api.bolna.ai"]);
    expect(manifest.http.auth).toMatchObject({
      field: "apiKey",
      in: "header",
      name: "Authorization",
      value: "Bearer {{apiKey}}",
    });
  });
});
