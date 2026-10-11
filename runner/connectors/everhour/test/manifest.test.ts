import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";

const operations = manifest.operations as Record<string, Record<string, unknown>>;

const ORIGIN = ["healthcheck", "projects.get", "projects.list", "time.list", "users.list"] as const;

const COMPOSIO: Record<string, string> = {
  EVERHOUR_CLIENT_CREATE: "clients.create",
  EVERHOUR_CLIENT_DELETE: "clients.delete",
  EVERHOUR_CLIENT_LIST: "clients.list",
  EVERHOUR_CLOCK_IN: "timecards.clockIn",
  EVERHOUR_CLOCK_OUT: "timecards.clockOut",
  EVERHOUR_CREATE_WEBHOOK: "webhooks.create",
  EVERHOUR_DELETE_HOOK: "webhooks.delete",
  EVERHOUR_DELETE_TIMECARD: "timecards.delete",
  EVERHOUR_DISCARD_TIMESHEET_APPROVAL: "timesheets.approval.discard",
  EVERHOUR_EXPENSES_LIST: "expenses.list",
  EVERHOUR_GET_CLIENT: "clients.get",
  EVERHOUR_GET_PROJECT: "projects.get",
  EVERHOUR_GET_SECTION: "sections.get",
  EVERHOUR_GET_TIMECARD: "timecards.get",
  EVERHOUR_GET_USER_PROFILE: "healthcheck",
  EVERHOUR_GET_WEBHOOK: "webhooks.get",
  EVERHOUR_LIST_EXPENSE_CATEGORIES: "expenseCategories.list",
  EVERHOUR_LIST_HOOKS: "webhooks.list",
  EVERHOUR_LIST_INVOICES: "invoices.list",
  EVERHOUR_LIST_PROJECTS: "projects.list",
  EVERHOUR_LIST_SECTIONS: "sections.list",
  EVERHOUR_LIST_TAGS: "tags.list",
  EVERHOUR_LIST_TEAM_MEMBERS: "users.list",
  EVERHOUR_LIST_TEAMS: "teams.get",
  EVERHOUR_LIST_TIMECARDS: "timecards.list",
  EVERHOUR_LIST_USER_TIMECARDS: "users.timecards.list",
  EVERHOUR_LIST_USER_TIMESHEETS: "users.timesheets.list",
  EVERHOUR_PROJECT_CREATE: "projects.create",
  EVERHOUR_PROJECT_DELETE: "projects.delete",
  EVERHOUR_REQUEST_TIMESHEET_APPROVAL: "timesheets.approval.request",
  EVERHOUR_SECTION_CREATE: "sections.create",
  EVERHOUR_SECTION_DELETE: "sections.delete",
  EVERHOUR_TASK_CREATE: "tasks.create",
  EVERHOUR_TIMER_START: "timers.start",
  EVERHOUR_UPDATE_CLIENT: "clients.update",
  EVERHOUR_UPDATE_PROJECT: "projects.update",
  EVERHOUR_UPDATE_TIMECARD: "timecards.update",
  EVERHOUR_UPDATE_WEBHOOK: "webhooks.update",
};

describe("everhour manifest", () => {
  test("keeps origin auth, provenance, and the five live ops", () => {
    expect(manifest.key).toBe("everhour");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.http.baseUrl).toBe("https://api.everhour.com");
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "X-Api-Key",
      value: "{{apiKey}}",
    });
    expect(manifest.network.allowedHosts).toEqual(["api.everhour.com"]);
    expect(manifest.provenance.source).toEqual({
      url: "https://github.com/oomol-lab/open-connector",
      revision: "33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a",
    });
    for (const key of ORIGIN) expect(operations[key], key).toBeTruthy();
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("maps all 38 Composio tools onto real HTTP operations", () => {
    expect(Object.keys(COMPOSIO)).toHaveLength(38);
    expect(Object.keys(operations)).toHaveLength(39);
    for (const [slug, key] of Object.entries(COMPOSIO)) {
      expect(operations[key], slug).toBeTruthy();
      expect(String((operations[key] as { description?: string }).description)).toContain(slug);
    }
    expect(operations["time.list"]).toBeTruthy();
  });

  test("every operation is a real HTTP tool with title, description, and object inputSchema", () => {
    for (const [key, operation] of Object.entries(operations)) {
      expect(operation.kind, key).toBe("action");
      expect(String(operation.title ?? "").length, key).toBeGreaterThan(0);
      expect(String(operation.description ?? "").length, key).toBeGreaterThan(10);
      expect((operation.inputSchema as { type?: string }).type, key).toBe("object");
      expect(operation.request, `${key} needs a request block`).toBeTruthy();
      const request = operation.request as Record<string, unknown>;
      expect(typeof request.method, key).toBe("string");
      expect(typeof request.path, key).toBe("string");
      if (operation.kind === "webhook") expect(operation.sideEffect).toBe("read");
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

  test("projects.list accepts the Composio status filter", () => {
    const op = operations["projects.list"] as { inputSchema: { properties: Record<string, unknown> }; request: { query: Record<string, string> } };
    expect(op.inputSchema.properties.status).toBeTruthy();
    expect(op.request.query.status).toBe("{{status}}");
  });

  test("recipe operations equal runner operations", async () => {
    const recipe = await Bun.file(new URL("../../../../scripts/connector-gen/openconnector/recipes/everhour/recipe.json", import.meta.url)).json();
    expect(Object.keys(recipe.manifest.operations).sort()).toEqual(Object.keys(operations).sort());
    expect([...recipe.selection.operations].sort()).toEqual(Object.keys(operations).sort());
  });
});
