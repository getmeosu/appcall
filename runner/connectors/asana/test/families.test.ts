import { describe, expect, it } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import responseFixture from "../fixtures/deepened_response.json";
import listResponseFixture from "../fixtures/deepened_list_response.json";

const { actions } = compileDeclarativeConnector(manifest as never);

export const ADDED_ACTIONS = [
  "portfolios.list",
  "portfolios.create",
  "portfolios.get",
  "portfolios.update",
  "portfolios.delete",
  "portfolios.listItems",
  "portfolios.addItem",
  "portfolios.removeItem",
  "portfolios.addMembers",
  "portfolios.removeMembers",
  "portfolioMemberships.list",
  "portfolioMemberships.get",
  "portfolioMemberships.listForPortfolio",
  "goals.list",
  "goals.create",
  "goals.get",
  "goals.update",
  "goals.delete",
  "goals.setMetric",
  "goals.setMetricCurrentValue",
  "goals.addFollowers",
  "goals.removeFollowers",
  "goals.addSupportingRelationship",
  "goals.removeSupportingRelationship",
  "goalRelationships.list",
  "goalRelationships.get",
  "goalRelationships.update",
  "auditLogs.list",
  "events.list",
  "jobs.get",
  "accessRequests.list",
  "accessRequests.create",
  "accessRequests.approve",
  "accessRequests.reject",
  "workspaces.get",
  "workspaces.addUser",
  "workspaces.removeUser",
  "workspaceMemberships.get",
  "workspaceMemberships.listForWorkspace",
  "workspaceMemberships.listForUser",
  "webhooks.list",
  "webhooks.create",
  "webhooks.get",
  "webhooks.update",
  "webhooks.delete",
  "users.listFavorites",
  "workspaces.typeahead",
  "customTypes.list",
  "reactions.list",
  "projectTemplates.list",
  "projectTemplates.listForTeam",
  "projectTemplates.get",
  "projectTemplates.instantiate",
  "projectTemplates.delete",
  "taskTemplates.list",
  "taskTemplates.get",
  "taskTemplates.instantiate",
  "taskTemplates.delete",
  "projects.duplicate",
  "tasks.duplicate",
  "batch.submit",
  "customFields.create",
  "customFields.update",
  "customFields.delete",
  "customFields.createEnumOption",
  "customFields.insertEnumOption",
  "enumOptions.update",
  "projects.addCustomFieldSetting",
  "projects.removeCustomFieldSetting",
  "allocations.list",
  "allocations.create",
  "allocations.get",
  "allocations.update",
  "allocations.delete",
  "timePeriods.list",
  "timePeriods.get",
  "timeTrackingEntries.list",
  "timeTrackingEntries.listForTask",
  "timeTrackingEntries.createForTask",
  "timeTrackingEntries.get",
  "timeTrackingEntries.update",
  "timeTrackingEntries.delete",
  "rates.list",
  "rates.create",
  "rates.get",
  "rates.update",
  "rates.delete",
  "budgets.list",
  "budgets.create",
  "budgets.get",
  "budgets.update",
  "budgets.delete",
  "tasks.addFollowers",
  "tasks.removeFollowers",
  "tasks.addTag",
  "tasks.removeTag",
  "tasks.createSubtask",
  "projects.update",
  "projects.delete",
  "projects.createForTeam",
  "projects.createForWorkspace",
  "projects.listForTask",
  "projects.getTaskCounts",
  "projectBriefs.create",
  "projectBriefs.get",
  "projectBriefs.update",
  "projectBriefs.delete",
  "projectStatuses.list",
  "projectStatuses.create",
  "projectStatuses.get",
  "projectStatuses.delete",
  "projectMemberships.get",
  "projectMemberships.listForProject",
  "stories.update",
  "stories.delete",
  "tags.listForWorkspace",
  "teamMemberships.get",
  "teamMemberships.list",
  "teamMemberships.listForTeam",
  "teamMemberships.listForUser",
  "userTaskLists.get",
  "userTaskLists.getForUser",
  "users.listForTeam",
  "users.listForWorkspace",
  "users.getForWorkspace",
  "users.update",
  "users.updateForWorkspace",
] as const;

export const ADDED_WEBHOOKS = [
  "webhook.attachment.added",
  "webhook.task.moved",
  "webhook.tag.added",
] as const;

function sampleInput(key: string): Record<string, unknown> {
  const operation = manifest.operations[key] as {
    inputSchema: {
      properties?: Record<string, { type?: string }>;
      required?: string[];
    };
  };
  const input: Record<string, unknown> = {};
  const properties = operation.inputSchema.properties ?? {};
  for (const name of operation.inputSchema.required ?? []) {
    const type = properties[name]?.type;
    if (type === "integer") input[name] = 25;
    else if (type === "number") input[name] = 8;
    else if (type === "boolean") input[name] = true;
    else if (type === "array") input[name] = name === "actions" ? [{ method: "get", relative_path: "/users/me" }] : ["sample"];
    else if (type === "object") input[name] = { type: "hours", value: 8 };
    else input[name] = "sample";
  }
  if ("limit" in properties && input.limit === undefined) input.limit = 25;
  return input;
}

describe("asana remaining Composio families", () => {
  it("declares every added family action with a real request block", () => {
    for (const key of ADDED_ACTIONS) {
      const operation = manifest.operations[key] as Record<string, unknown> | undefined;
      expect(operation, key).toBeDefined();
      expect(operation?.kind, key).toBe("action");
      expect(operation?.request, `${key} must declare a request block`).toBeDefined();
      expect(actions[key], `${key} must compile`).toBeDefined();
    }
  });

  it("adds the three remaining Composio webhook event contracts as read side effects", () => {
    for (const key of ADDED_WEBHOOKS) {
      const operation = manifest.operations[key] as Record<string, unknown> | undefined;
      expect(operation, key).toBeDefined();
      expect(operation?.kind, key).toBe("webhook");
      expect(operation?.sideEffect, key).toBe("read");
      expect(operation?.request, key).toBeUndefined();
      expect(actions[key]).toBeUndefined();
    }
  });

  it.each(ADDED_ACTIONS)("executes %s against its documented endpoint", async (key) => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchFn = async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      const operation = manifest.operations[key] as { request: { result?: Record<string, unknown> } };
      const paginated = Object.prototype.hasOwnProperty.call(operation.request.result ?? {}, "nextOffset");
      const fixture = paginated || key === "events.list" || key === "workspaces.typeahead" || key === "accessRequests.list" || key === "budgets.list"
        ? { ...listResponseFixture, sync: "sync-token" }
        : responseFixture;
      return new Response(JSON.stringify(fixture), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    const result = await actions[key]!({ apiToken: "tok", ...sampleInput(key), fetch: fetchFn }) as Record<string, unknown>;
    expect(calls).toHaveLength(1);
    const url = new URL(calls[0]!.url);
    const operation = manifest.operations[key] as {
      request: {
        method: string;
        path: string;
        query?: Record<string, string>;
        body?: { data: Record<string, string> };
        result?: Record<string, unknown>;
      };
    };
    expect(calls[0]!.init?.method ?? "GET").toBe(operation.request.method);
    expect(url.pathname).toBe(`/api/1.0${operation.request.path.replace(/\{\{[^}]+\}\}/g, "sample")}`);
    expect((calls[0]!.init?.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    if (Object.prototype.hasOwnProperty.call(operation.request.result ?? {}, "nextOffset")) {
      expect(result).toMatchObject({ items: [], nextOffset: "next-page-token" });
    }
    const input = sampleInput(key);
    for (const [queryKey, template] of Object.entries(operation.request.query ?? {})) {
      const inputKey = template.match(/\{\{([A-Za-z0-9_]+)\}\}/)?.[1];
      if (inputKey && inputKey in input) {
        expect(url.searchParams.get(queryKey)).toBe(String(input[inputKey]));
      }
    }
    if (operation.request.body) {
      const sent = JSON.parse(String(calls[0]!.init?.body)) as { data: Record<string, unknown> };
      expect(Object.keys(sent)).toEqual(["data"]);
      for (const [bodyKey, template] of Object.entries(operation.request.body.data)) {
        const inputKey = String(template).match(/\{\{([A-Za-z0-9_]+)\}\}/)?.[1];
        if (inputKey && inputKey in input) {
          expect(sent.data[bodyKey]).toEqual(input[inputKey]);
        }
      }
    }
  });
});

describe("asana family request contracts", () => {
  it("lists portfolios in a workspace via GET /portfolios", () => {
    const request = (manifest.operations["portfolios.list"] as { request: Record<string, unknown> }).request;
    expect(request.method).toBe("GET");
    expect(request.path).toBe("/portfolios");
    expect((request.query as Record<string, string>).workspace).toBe("{{workspace}}");
    const schema = (manifest.operations["portfolios.list"] as { inputSchema: { required?: string[] } }).inputSchema;
    expect(schema.required).toEqual(expect.arrayContaining(["workspace", "limit"]));
  });

  it("adds a portfolio item through POST /portfolios/{portfolioGid}/addItem", () => {
    const request = (manifest.operations["portfolios.addItem"] as { request: Record<string, unknown> }).request;
    expect(request.method).toBe("POST");
    expect(request.path).toBe("/portfolios/{{portfolioGid}}/addItem");
    expect((request.body as { data: Record<string, string> }).data.item).toBe("{{item}}");
  });

  it("adds a supporting goal relationship through the native addSupportingRelationship endpoint", () => {
    const request = (manifest.operations["goals.addSupportingRelationship"] as { request: Record<string, unknown> }).request;
    expect(request.path).toBe("/goals/{{goalGid}}/addSupportingRelationship");
    expect((request.body as { data: Record<string, string> }).data.supporting_resource).toBe("{{supportingResource}}");
  });

  it("reads audit log events from GET /workspaces/{workspaceGid}/audit_log_events", () => {
    const request = (manifest.operations["auditLogs.list"] as { request: Record<string, unknown> }).request;
    expect(request.method).toBe("GET");
    expect(request.path).toBe("/workspaces/{{workspaceGid}}/audit_log_events");
  });

  it("syncs resource events with the sync token instead of next_page.offset", () => {
    const request = (manifest.operations["events.list"] as { request: { query: Record<string, string>; result: Record<string, string> } }).request;
    expect(request.query.resource).toBe("{{resource}}");
    expect(request.query.sync).toBe("{{sync}}");
    expect(request.result.sync).toBe("{{response.sync}}");
    expect(request.result.nextOffset).toBeUndefined();
  });

  it("submits the Asana batch API as a data.actions envelope", () => {
    const request = (manifest.operations["batch.submit"] as { request: { method: string; path: string; body: { data: Record<string, string> } } }).request;
    expect(request.method).toBe("POST");
    expect(request.path).toBe("/batch");
    expect(Object.keys(request.body)).toEqual(["data"]);
    expect(request.body.data.actions).toBe("{{actions}}");
  });

  it("creates custom fields with workspace, name, and resource_subtype", () => {
    const request = (manifest.operations["customFields.create"] as { request: { body: { data: Record<string, string> } } }).request;
    expect(request.body.data.workspace).toBe("{{workspace}}");
    expect(request.body.data.name).toBe("{{name}}");
    expect(request.body.data.resource_subtype).toBe("{{resourceSubtype}}");
  });

  it("creates allocations with Asana start_date/end_date fields", () => {
    const request = (manifest.operations["allocations.create"] as { request: { body: { data: Record<string, string> } } }).request;
    expect(request.body.data.start_date).toBe("{{startDate}}");
    expect(request.body.data.end_date).toBe("{{endDate}}");
    expect(request.body.data.assignee).toBe("{{assignee}}");
    expect(request.body.data.parent).toBe("{{parent}}");
  });

  it("instantiates a project template as a job via instantiateProject", () => {
    const request = (manifest.operations["projectTemplates.instantiate"] as { request: Record<string, unknown> }).request;
    expect(request.method).toBe("POST");
    expect(request.path).toBe("/project_templates/{{projectTemplateGid}}/instantiateProject");
    expect((request.body as { data: Record<string, string> }).data.name).toBe("{{name}}");
  });
});
