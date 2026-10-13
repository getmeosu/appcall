import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";

const operations = manifest.operations as Record<string, Record<string, unknown>>;

// ops the pinned recipe has real provenance for
const PINNED_OPS = [
  "agents.aliases.list",
  "agents.aliases.upsert",
  "agents.complete",
  "agents.create",
  "agents.delete",
  "agents.get",
  "agents.list",
  "agents.update",
  "agents.version.update",
  "agents.versions.get",
  "agents.versions.list",
  "audio.speech.create",
  "audio.transcriptions.create",
  "audio.voices.get",
  "audio.voices.list",
  "audio.voices.sample.get",
  "batch.jobs.create",
  "batch.jobs.get",
  "batch.jobs.list",
  "chat.complete",
  "chat.moderations.create",
  "connectors.authentication_methods.get",
  "connectors.get",
  "connectors.list",
  "connectors.tools.list",
  "conversations.append",
  "conversations.delete",
  "conversations.get",
  "conversations.history.get",
  "conversations.list",
  "conversations.messages.get",
  "conversations.restart",
  "conversations.start",
  "embeddings.create",
  "files.delete",
  "files.download",
  "files.get",
  "files.list",
  "files.signed_url.get",
  "files.upload",
  "fim.complete",
  "fine_tuning.jobs.list",
  "healthcheck",
  "libraries.create",
  "libraries.delete",
  "libraries.documents.delete",
  "libraries.documents.extracted_text_url.get",
  "libraries.documents.get",
  "libraries.documents.list",
  "libraries.documents.reprocess",
  "libraries.documents.signed_url.get",
  "libraries.documents.status.get",
  "libraries.documents.text_content.get",
  "libraries.documents.update",
  "libraries.documents.upload",
  "libraries.get",
  "libraries.list",
  "libraries.shares.create",
  "libraries.shares.delete",
  "libraries.shares.list",
  "libraries.update",
  "models.archive",
  "models.get",
  "models.list",
  "models.unarchive",
  "models.update",
  "moderations.create",
  "observability.campaigns.get",
  "observability.campaigns.list",
  "observability.campaigns.selected_events.list",
  "observability.campaigns.status",
  "observability.chat_completion_events.get",
  "observability.chat_completion_events.judge",
  "observability.chat_completion_events.search",
  "observability.chat_completion_events.similar",
  "observability.chat_completion_fields.count",
  "observability.chat_completion_fields.list",
  "observability.chat_completion_fields.options",
  "observability.dataset_imports.get",
  "observability.dataset_imports.list",
  "observability.dataset_records.get",
  "observability.dataset_records.judge",
  "observability.dataset_records.list",
  "observability.datasets.get",
  "observability.datasets.list",
  "observability.judges.get",
  "observability.judges.judge_conversation",
  "observability.judges.list",
  "ocr.create",
  "workflows.deployments.get",
  "workflows.deployments.list",
  "workflows.events.list",
  "workflows.executions.get",
  "workflows.executions.history.get",
  "workflows.executions.query",
  "workflows.executions.trace.events.get",
  "workflows.executions.trace.otel.get",
  "workflows.executions.trace.summary.get",
  "workflows.get",
  "workflows.metrics.get",
  "workflows.registrations.get",
  "workflows.registrations.list",
  "workflows.runs.get",
  "workflows.runs.history.get",
  "workflows.runs.list",
  "workflows.schedules.list"
];
// ops this branch added from the provider's live API; no pinned action id exists
const DEEPENED_OPS = [
  "libraries.documents.patch",
  "libraries.patch",
  "observability.dataset_tasks.get",
  "observability.dataset_tasks.list"
];

describe("mistral-ai manifest", () => {
  test("has bounded hosts and compiles", () => {
    expect(manifest.network.allowedHosts).toEqual(["api.mistral.ai"]);
    expect(manifest.version).toBe("0.3.1");
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

  test("mirrors the deepened calls in the recipe and keeps provenance mappings pinned", async () => {
    // Archived origin recipe. Deepened calls are mirrored without an upstreamActionId.
    const recipe = await Bun.file(new URL("../../../../scripts/connector-gen/openconnector/recipes/mistral_ai/recipe.json", import.meta.url)).json();
    const runnerOps = Object.keys(operations).sort();
    const recipeOps = Object.keys(recipe.manifest.operations).sort();
    expect(recipe.manifest.version).toBe("0.3.0");
    expect(runnerOps).toEqual(recipeOps);
    expect(runnerOps).toHaveLength(110);
    expect([...recipe.selection.operations].sort()).toEqual(PINNED_OPS);
    expect(Object.keys(recipe.operationSources).sort()).toEqual(PINNED_OPS);
    expect(runnerOps.filter((key) => !Object.hasOwn(recipe.operationSources, key))).toEqual(DEEPENED_OPS);
    for (const key of recipeOps) {
      expect(operations[key], key).toEqual(recipe.manifest.operations[key]);
    }
    for (const key of DEEPENED_OPS) {
      expect(recipe.operationSources?.[key]?.upstreamActionId).toBeUndefined();
    }
  });
});
