import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const original = ["healthcheck", "leads.list", "contacts.list", "pipelines.list", "users.list"] as const;

const COMPOSIO_TOOLS: Record<string, string> = {
  KOMMO_GET_ACCOUNT: "healthcheck",
  KOMMO_LIST_LEADS: "leads.list",
  KOMMO_LIST_CONTACTS: "contacts.list",
  KOMMO_LIST_LEADS_PIPELINES: "pipelines.list",
  KOMMO_LIST_USERS: "users.list",
  KOMMO_ADD_AI_SOURCE_FILE: "ai.sources.file.add",
  KOMMO_CREATE_COMPANY: "companies.create",
  KOMMO_CREATE_CONTACT: "contacts.create",
  KOMMO_CREATE_LEAD: "leads.create",
  KOMMO_CREATE_TASK: "tasks.create",
  KOMMO_DELETE_FILES: "files.delete",
  KOMMO_GET_COMPANY: "companies.get",
  KOMMO_GET_CONTACT: "contacts.get",
  KOMMO_GET_CUSTOM_FIELD: "custom_fields.get",
  KOMMO_GET_EVENT: "events.get",
  KOMMO_GET_FIELD_GROUP: "field_groups.get",
  KOMMO_GET_FILE_LINKS: "files.links.get",
  KOMMO_GET_INCOMING_LEADS_SUMMARY: "incoming_leads.summary",
  KOMMO_GET_LEAD: "leads.get",
  KOMMO_GET_LOSS_REASON: "loss_reasons.get",
  KOMMO_GET_PIPELINE: "pipelines.get",
  KOMMO_GET_PIPELINE_STATUS: "pipeline_statuses.get",
  KOMMO_GET_TASK: "tasks.get",
  KOMMO_GET_USER: "users.get",
  KOMMO_GET_WIDGET: "widgets.get",
  KOMMO_IMPORT_PRODUCTS_TO_AI: "ai.products.import",
  KOMMO_LIST_CATALOGS: "catalogs.list",
  KOMMO_LIST_COMPANIES: "companies.list",
  KOMMO_LIST_CONVERSATIONS: "conversations.list",
  KOMMO_LIST_CUSTOM_FIELDS: "custom_fields.list",
  KOMMO_LIST_ENTITY_FILES: "entity_files.list",
  KOMMO_LIST_ENTITY_LINKS: "entity_links.list",
  KOMMO_LIST_ENTITY_NOTES: "entity_notes.list",
  KOMMO_LIST_ENTITY_TAGS: "entity_tags.list",
  KOMMO_LIST_EVENTS: "events.list",
  KOMMO_LIST_EVENT_TYPES: "event_types.list",
  KOMMO_LIST_FIELD_GROUPS: "field_groups.list",
  KOMMO_LIST_FILES: "files.list",
  KOMMO_LIST_INCOMING_LEADS: "incoming_leads.list",
  KOMMO_LIST_LOSS_REASONS: "loss_reasons.list",
  KOMMO_LIST_NOTES_BY_ENTITY: "notes.list",
  KOMMO_LIST_PIPELINE_STAGES: "pipeline_stages.list",
  KOMMO_LIST_ROLES: "roles.list",
  KOMMO_LIST_SOURCES: "sources.list",
  KOMMO_LIST_TASKS: "tasks.list",
  KOMMO_LIST_TEMPLATES: "templates.list",
  KOMMO_LIST_WEBHOOKS: "webhooks.list",
  KOMMO_LIST_WEBSITE_BUTTONS: "website_buttons.list",
  KOMMO_LIST_WIDGETS: "widgets.list",
  KOMMO_UPDATE_COMPANY: "companies.update",
  KOMMO_UPDATE_CONTACT: "contacts.update",
  KOMMO_UPDATE_LEAD: "leads.update",
  KOMMO_UPDATE_TASK: "tasks.update",
};

describe("kommo manifest", () => {
  test("keeps origin auth, provenance, and the five live ops", () => {
    expect(manifest.key).toBe("kommo");
    expect(manifest.version).toBe("0.2.1");
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.http.baseUrl).toBe("https://{{subdomain}}.kommo.com");
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "Authorization",
      value: "Bearer {{apiKey}}",
    });
    expect(manifest.network.allowedHosts).toEqual(["*.kommo.com"]);
    expect(manifest.provenance.source).toEqual({
      url: "https://github.com/oomol-lab/open-connector",
      revision: "33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a",
    });
    for (const key of original) expect(operations[key], key).toBeTruthy();
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("covers every Composio KOMMO tool with a real HTTP request", () => {
    expect(Object.keys(COMPOSIO_TOOLS)).toHaveLength(53);
    expect(Object.keys(operations).length).toBe(53);
    for (const [slug, key] of Object.entries(COMPOSIO_TOOLS)) {
      expect(operations[key], slug).toBeDefined();
      expect((operations[key] as { request?: unknown }).request, slug).toBeTruthy();
    }
  });

  test("every operation is a real HTTP tool with title, description, and object inputSchema", () => {
    for (const [key, operation] of Object.entries(operations)) {
      expect(operation.kind, key).toBe("action");
      expect(String(operation.title ?? "").length, key).toBeGreaterThan(0);
      expect(String(operation.description ?? "").length, key).toBeGreaterThan(0);
      expect((operation.inputSchema as { type?: string }).type, key).toBe("object");
      expect(operation.request, `${key} needs a request block`).toBeTruthy();
      const request = operation.request as Record<string, unknown>;
      expect(typeof request.method, key).toBe("string");
      expect(typeof request.path, key).toBe("string");
    }
  });

  test("classifies mutating HTTP methods as write or destructive", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as Record<string, unknown>;
      const method = String(request.method);
      if (method === "DELETE") expect(operation.sideEffect, key).toBe("destructive");
      else if (["POST", "PUT", "PATCH"].includes(method)) expect(operation.sideEffect, key).toBe("write");
      else expect(operation.sideEffect, key).toBe("read");
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
    const recipe = await Bun.file(new URL("../../../../scripts/connector-gen/openconnector/recipes/kommo/recipe.json", import.meta.url)).json();
    expect(Object.keys(recipe.manifest.operations).sort()).toEqual(Object.keys(operations).sort());
    expect([...recipe.selection.operations].sort()).toEqual(Object.keys(operations).sort());
  });
});
