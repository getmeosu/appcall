import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";

const operations = manifest.operations as Record<string, Record<string, unknown>>;
const original = ["healthcheck", "teams.list", "projects.list", "projects.get", "tasks.list"] as const;
const composioMapped = [
  {
    "tool": "NOZBE_TEAMS_CREATE_ATTACHMENT",
    "operation": "attachments.create"
  },
  {
    "tool": "NOZBE_TEAMS_CREATE_COMMENT",
    "operation": "comments.create"
  },
  {
    "tool": "NOZBE_TEAMS_CREATE_PROJECT_SECTION",
    "operation": "project_sections.create"
  },
  {
    "tool": "NOZBE_TEAMS_CREATE_REMINDER",
    "operation": "reminders.create"
  },
  {
    "tool": "NOZBE_TEAMS_CREATE_TAG_ASSIGNMENT",
    "operation": "tag_assignments.create"
  },
  {
    "tool": "NOZBE_TEAMS_CREATE_TASK",
    "operation": "tasks.create"
  },
  {
    "tool": "NOZBE_TEAMS_CREATE_TEAM_MEMBER",
    "operation": "team_members.create"
  },
  {
    "tool": "NOZBE_TEAMS_CREATE_USER",
    "operation": "users.create"
  },
  {
    "tool": "NOZBE_TEAMS_DELETE_COMMENT",
    "operation": "comments.delete"
  },
  {
    "tool": "NOZBE_TEAMS_DELETE_PROJECT",
    "operation": "projects.delete"
  },
  {
    "tool": "NOZBE_TEAMS_DELETE_REMINDER",
    "operation": "reminders.delete"
  },
  {
    "tool": "NOZBE_TEAMS_DELETE_TAG_ASSIGNMENT",
    "operation": "tag_assignments.delete"
  },
  {
    "tool": "NOZBE_TEAMS_DELETE_TASK",
    "operation": "tasks.delete"
  },
  {
    "tool": "NOZBE_TEAMS_GET_ATTACHMENT",
    "operation": "attachments.get"
  },
  {
    "tool": "NOZBE_TEAMS_GET_COMMENT",
    "operation": "comments.get"
  },
  {
    "tool": "NOZBE_TEAMS_GET_PROJECT",
    "operation": "projects.get"
  },
  {
    "tool": "NOZBE_TEAMS_GET_PROJECT_ACCESS",
    "operation": "project_accesses.get"
  },
  {
    "tool": "NOZBE_TEAMS_GET_PROJECT_SECTION",
    "operation": "project_sections.get"
  },
  {
    "tool": "NOZBE_TEAMS_GET_REMINDER",
    "operation": "reminders.get"
  },
  {
    "tool": "NOZBE_TEAMS_GET_TAG",
    "operation": "tags.get"
  },
  {
    "tool": "NOZBE_TEAMS_GET_TAG_ASSIGNMENT",
    "operation": "tag_assignments.get"
  },
  {
    "tool": "NOZBE_TEAMS_GET_TASK",
    "operation": "tasks.get"
  },
  {
    "tool": "NOZBE_TEAMS_GET_TASK_EVENT",
    "operation": "task_events.get"
  },
  {
    "tool": "NOZBE_TEAMS_GET_TEAM",
    "operation": "teams.get"
  },
  {
    "tool": "NOZBE_TEAMS_GET_TEAM_MEMBER",
    "operation": "team_members.get"
  },
  {
    "tool": "NOZBE_TEAMS_GET_USER",
    "operation": "users.get"
  },
  {
    "tool": "NOZBE_TEAMS_LIST_ATTACHMENTS",
    "operation": "attachments.list"
  },
  {
    "tool": "NOZBE_TEAMS_LIST_COMMENTS",
    "operation": "comments.list"
  },
  {
    "tool": "NOZBE_TEAMS_LIST_GROUP_ASSIGNMENTS",
    "operation": "group_assignments.list"
  },
  {
    "tool": "NOZBE_TEAMS_LIST_PROJECT_ACCESSES",
    "operation": "project_accesses.list"
  },
  {
    "tool": "NOZBE_TEAMS_LIST_PROJECT_GROUPS",
    "operation": "project_groups.list"
  },
  {
    "tool": "NOZBE_TEAMS_LIST_PROJECTS",
    "operation": "projects.list"
  },
  {
    "tool": "NOZBE_TEAMS_LIST_PROJECT_SECTIONS",
    "operation": "project_sections.list"
  },
  {
    "tool": "NOZBE_TEAMS_LIST_REMINDERS",
    "operation": "reminders.list"
  },
  {
    "tool": "NOZBE_TEAMS_LIST_TAG_ASSIGNMENTS",
    "operation": "tag_assignments.list"
  },
  {
    "tool": "NOZBE_TEAMS_LIST_TAGS",
    "operation": "tags.list"
  },
  {
    "tool": "NOZBE_TEAMS_LIST_TASK_EVENTS",
    "operation": "task_events.list"
  },
  {
    "tool": "NOZBE_TEAMS_LIST_TASKS",
    "operation": "tasks.list"
  },
  {
    "tool": "NOZBE_TEAMS_LIST_USERS",
    "operation": "users.list"
  },
  {
    "tool": "NOZBE_TEAMS_POLL_NEW_TASKS",
    "operation": "tasks.poll_new"
  },
  {
    "tool": "NOZBE_TEAMS_POLL_UPDATED_TASKS",
    "operation": "tasks.poll_updated"
  },
  {
    "tool": "NOZBE_TEAMS_UPDATE_COMMENT",
    "operation": "comments.update"
  },
  {
    "tool": "NOZBE_TEAMS_UPDATE_PROJECT",
    "operation": "projects.update"
  },
  {
    "tool": "NOZBE_TEAMS_UPDATE_PROJECT_ACCESS",
    "operation": "project_accesses.update"
  },
  {
    "tool": "NOZBE_TEAMS_UPDATE_TASK",
    "operation": "tasks.update"
  },
  {
    "tool": "NOZBE_TEAMS_UPDATE_TEAM",
    "operation": "teams.update"
  },
  {
    "tool": "NOZBE_TEAMS_UPDATE_TEAM_MEMBER",
    "operation": "team_members.update"
  },
  {
    "tool": "NOZBE_TEAMS_UPDATE_USER",
    "operation": "users.update"
  }
];

describe("nozbe-teams manifest", () => {
  test("keeps origin auth, provenance, and the five live ops", () => {
    expect(manifest.key).toBe("nozbe-teams");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.http.baseUrl).toBe("https://api4.nozbe.com/v1/api");
    expect(manifest.http.auth).toEqual({
      field: "apiKey",
      in: "header",
      name: "Authorization",
      value: "apikey {{apiKey}}",
    });
    expect(manifest.network.allowedHosts).toEqual(["api4.nozbe.com"]);
    expect(manifest.provenance.source).toEqual({
      url: "https://github.com/oomol-lab/open-connector",
      revision: "33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a",
    });
    for (const key of original) expect(operations[key], key).toBeTruthy();
    expect(() => compileDeclarativeConnector(manifest as never)).not.toThrow();
  });

  test("every operation is a real HTTP tool with title, description, and object inputSchema", () => {
    expect(Object.keys(operations).length).toBe(50);
    for (const [key, operation] of Object.entries(operations)) {
      expect(operation.kind, key).toBe("action");
      expect(String(operation.title ?? "").length, key).toBeGreaterThan(0);
      expect(String(operation.description ?? "").length, key).toBeGreaterThan(0);
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

  test("maps every documented Composio NOZBE_TEAMS tool onto a request-backed operation", () => {
    expect(composioMapped).toHaveLength(48);
    const seen = new Set<string>();
    for (const row of composioMapped as Array<{ tool: string; operation: string }>) {
      expect(operations[row.operation], row.tool).toBeTruthy();
      expect((operations[row.operation].request as { path?: string }).path, row.tool).toBeTruthy();
      seen.add(row.tool);
    }
    expect(seen.size).toBe(48);
  });

  test("recipe operations equal runner operations", async () => {
    const recipe = await Bun.file(new URL("../../../../scripts/connector-gen/openconnector/recipes/nozbe_teams/recipe.json", import.meta.url)).json();
    expect(Object.keys(recipe.manifest.operations).sort()).toEqual(Object.keys(operations).sort());
    expect([...recipe.selection.operations].sort()).toEqual(Object.keys(operations).sort());
  });
});
