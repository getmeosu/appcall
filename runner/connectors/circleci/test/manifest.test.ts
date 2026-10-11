import { describe, expect, it } from "bun:test";
import manifest from "../manifest.json";

const expected = [
  "contexts.create",
  "contexts.create_graphql",
  "contexts.delete_graphql",
  "contexts.env_vars.delete_graphql",
  "contexts.env_vars.list",
  "contexts.env_vars.store_graphql",
  "contexts.env_vars.upsert",
  "contexts.get",
  "contexts.query",
  "contexts.restrictions.create",
  "contexts.restrictions.delete",
  "healthcheck",
  "insights.branches.list",
  "insights.flaky_tests.get",
  "insights.pages.summary.get",
  "insights.summary.list",
  "insights.workflows.jobs.list",
  "insights.workflows.list",
  "insights.workflows.summary.get",
  "insights.workflows.test_metrics.list",
  "jobs.artifacts.list",
  "jobs.get",
  "jobs.tests.get",
  "namespaces.aliases.delete",
  "namespaces.delete",
  "namespaces.exists",
  "namespaces.orbs.list",
  "namespaces.rename",
  "orbs.categories.list",
  "orbs.categories.query",
  "orbs.config.validate",
  "orbs.exists",
  "orbs.get",
  "orbs.id.get",
  "orbs.latest_version.get",
  "orbs.list",
  "orbs.source.get",
  "orbs.versions.get",
  "organizations.get",
  "organizations.groups.create",
  "organizations.groups.delete",
  "organizations.groups.get",
  "organizations.groups.list",
  "organizations.orb_allowlist.create",
  "organizations.orb_allowlist.delete",
  "organizations.plan_metrics.query",
  "organizations.projects.create",
  "organizations.usage_export.create",
  "organizations.usage_export.get",
  "pipeline_definitions.get",
  "pipeline_definitions.list",
  "pipelines.config.get",
  "pipelines.get",
  "pipelines.list",
  "pipelines.list_org",
  "pipelines.trigger",
  "projects.delete",
  "projects.env_vars.create",
  "projects.env_vars.delete",
  "projects.env_vars.list",
  "projects.get",
  "projects.schedules.list",
  "runners.list",
  "users.collaborations.list",
  "users.get",
  "workflows.list"
] as string[];

describe("circleci manifest", () => {
  it("has bounded public Circle-Token contract and Composio coverage", () => {
    expect(manifest.key).toBe("circleci");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.visibility).toBe("public");
    expect(manifest.http.auth.field).toBe("apiKey");
    expect(manifest.http.auth.name).toBe("Circle-Token");
    expect(manifest.network.allowedHosts).toEqual(["circleci.com", "runner.circleci.com"]);
    expect(Object.keys(manifest.operations).sort()).toEqual(expected);
    expect(expected).toHaveLength(66);
  });

  it("declares a real HTTP request, title, description, and object inputSchema on every action", () => {
    for (const [key, op] of Object.entries(manifest.operations) as Array<[string, any]>) {
      expect(op.kind).toBe("action");
      expect(["read", "write", "destructive"]).toContain(op.sideEffect);
      expect(typeof op.title).toBe("string");
      expect(op.title.length).toBeGreaterThan(0);
      expect(typeof op.description).toBe("string");
      expect(op.description.length).toBeGreaterThan(0);
      expect(op.inputSchema.type).toBe("object");
      expect(op.request).toBeDefined();
      expect(["GET", "POST", "PUT", "PATCH", "DELETE"]).toContain(op.request.method);
      expect(typeof op.request.path).toBe("string");
    }
  });
});
