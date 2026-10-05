import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import envListFixture from "../fixtures/environment_variables.json";
import envFixture from "../fixtures/environment_variable.json";
import orgListFixture from "../fixtures/org_variables.json";
import orgFixture from "../fixtures/org_variable.json";
import repoOrgFixture from "../fixtures/repo_org_variables.json";
import {
  listEnvironmentVariables,
  getEnvironmentVariable,
  createEnvironmentVariable,
  updateEnvironmentVariable,
  deleteEnvironmentVariable,
  listRepoOrganizationVariables,
  listOrgVariables,
  getOrgVariable,
  createOrgVariable,
  updateOrgVariable,
  deleteOrgVariable,
} from "../src/actions";

const READS = [
  "actions.environment_variables.list",
  "actions.environment_variables.get",
  "actions.org_variables.list_for_repo",
  "actions.org_variables.list",
  "actions.org_variables.get",
] as const;

describe("github N8 environment and org action variables", () => {
  test("manifest stays on the base version and wires Idempotent reconcile like milestones.create", () => {
    expect(manifest.version).toBe("0.73.0");
    expect(Object.keys(manifest.operations).length).toBe(744);
    for (const key of READS) {
      const op = manifest.operations[key] as Record<string, unknown>;
      expect(op.kind).toBe("action");
      expect(op.sideEffect).toBe("read");
      expect(op.effectPolicy).toBeUndefined();
      expect(op.reconcile).toBeUndefined();
      expect(op.observe).toBeUndefined();
    }
    for (const [key, reconcile] of [
      ["actions.environment_variables.create", "actions.environment_variables.get"],
      ["actions.org_variables.create", "actions.org_variables.get"],
    ] as const) {
      const op = manifest.operations[key] as Record<string, unknown>;
      expect(op.sideEffect).toBe("write");
      expect(op.effectPolicy).toBe("Idempotent");
      expect(op.reconcile).toBe(reconcile);
      expect(op.observe).toBeUndefined();
    }
    for (const key of [
      "actions.environment_variables.delete",
      "actions.org_variables.delete",
    ] as const) {
      const op = manifest.operations[key] as Record<string, unknown>;
      expect(op.sideEffect).toBe("write");
      expect(op.effectPolicy).toBe("Idempotent");
      expect(op.reconcile).toBeUndefined();
      expect(op.observe).toBeUndefined();
      expect(String(op.description)).not.toContain("observes via");
    }
    const orgUpdate = manifest.operations["actions.org_variables.update"] as {
      description: string;
      inputSchema: { properties: Record<string, unknown> };
      outputSchema: { properties: Record<string, unknown> };
    };
    expect(orgUpdate.inputSchema.properties.current_name).toBeDefined();
    expect(orgUpdate.inputSchema.properties.rename).toBeUndefined();
    expect(orgUpdate.outputSchema.properties.rename).toBeUndefined();
    expect(orgUpdate.description).toContain("current_name");
    expect(orgUpdate.description).not.toContain("rename");
    expect(String((orgUpdate.inputSchema.properties.name as { description: string }).description)).toContain("after the PATCH");
    for (const [key, reconcile] of [
      ["actions.environment_variables.update", "actions.environment_variables.get"],
      ["actions.org_variables.update", "actions.org_variables.get"],
    ] as const) {
      const op = manifest.operations[key] as Record<string, unknown>;
      expect(op.sideEffect).toBe("write");
      expect(op.effectPolicy).toBe("Reconcile");
      expect(op.reconcile).toBe(reconcile);
      expect(op.observe).toBeUndefined();
    }
    expect(manifest.operations["actions.org_variables.list"].description).toContain("admin:org");
    expect(manifest.operations["actions.org_variables.selected_repositories.list"]).toBeUndefined();
    expect(manifest.auth.scopes).toContain("admin:org");
  });

  test("environment variables encode the environment name and skip POST when the name exists", async () => {
    const listed = await listEnvironmentVariables({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      environment_name: "prod/us",
      perPage: 10,
      page: 2,
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/environments/prod%2Fus/variables?per_page=10&page=2");
        return new Response(JSON.stringify(envListFixture), { status: 200 });
      },
    });
    expect(listed.totalCount).toBe(1);
    expect(listed.variables).toEqual([{ name: "REGION", value: "us-east-1", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-02T00:00:00Z" }]);

    const got = await getEnvironmentVariable({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      environment_name: "prod/us",
      name: "DEPLOY ENV",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/environments/prod%2Fus/variables/DEPLOY%20ENV");
        return new Response(JSON.stringify(envFixture), { status: 200 });
      },
    });
    expect(got.variable).toEqual({ name: "DEPLOY_ENV", value: "staging", createdAt: "2026-05-16T12:00:00Z", updatedAt: "2026-05-16T12:30:00Z" });

    const skipped: string[] = [];
    const existing = await createEnvironmentVariable({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      environment_name: "staging",
      name: "DEPLOY_ENV",
      value: "should-not-post",
      fetch: async (input, init) => {
        skipped.push(init?.method ?? "GET");
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/environments/staging/variables/DEPLOY_ENV");
        return new Response(JSON.stringify(envFixture), { status: 200 });
      },
    });
    expect(skipped).toEqual(["GET"]);
    expect(existing.created).toBe(false);
    expect(existing.id).toBe("DEPLOY_ENV");
    expect((existing.variable as { value: string }).value).toBe("staging");

    const createdCalls: { method: string; url: string; body: string }[] = [];
    const created = await createEnvironmentVariable({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      environment_name: "staging",
      name: "NEW_VAR",
      value: "1",
      fetch: async (input, init) => {
        createdCalls.push({ method: init?.method ?? "GET", url: String(input), body: String(init?.body ?? "") });
        if ((init?.method ?? "GET") === "GET") return new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });
        return new Response(JSON.stringify({ name: "NEW_VAR", value: "1", created_at: "2026-05-16T00:00:00Z", updated_at: "2026-05-16T00:00:00Z" }), { status: 201 });
      },
    });
    expect(createdCalls.map((call) => `${call.method} ${call.url}`)).toEqual([
      "GET https://api.github.com/repos/acme/app/environments/staging/variables/NEW_VAR",
      "POST https://api.github.com/repos/acme/app/environments/staging/variables",
    ]);
    expect(createdCalls[1].body).toBe(JSON.stringify({ name: "NEW_VAR", value: "1" }));
    expect(created.created).toBe(true);
    expect(created.id).toBe("NEW_VAR");

    const patched = await updateEnvironmentVariable({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      environment_name: "prod/us",
      name: "DEPLOY_ENV",
      value: "prod",
      fetch: async (input, init) => {
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/environments/prod%2Fus/variables/DEPLOY_ENV");
        expect(init?.method).toBe("PATCH");
        expect(JSON.parse(String(init?.body))).toEqual({ name: "DEPLOY_ENV", value: "prod" });
        return new Response("", { status: 204 });
      },
    });
    expect(patched.updated).toBe(true);
    expect(patched.name).toBe("DEPLOY_ENV");
    expect(patched.value).toBe("prod");

    const absentCalls: string[] = [];
    const absent = await deleteEnvironmentVariable({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      environment_name: "staging",
      name: "GONE",
      fetch: async (input, init) => {
        absentCalls.push(init?.method ?? "GET");
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/environments/staging/variables/GONE");
        return new Response("", { status: 404 });
      },
    });
    expect(absentCalls).toEqual(["GET"]);
    expect(absent.deleted).toBe(true);
    expect(absent.id).toBe("GONE");

    const removedCalls: string[] = [];
    const removed = await deleteEnvironmentVariable({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      environment_name: "staging",
      name: "DEPLOY_ENV",
      fetch: async (input, init) => {
        const method = init?.method ?? "GET";
        removedCalls.push(method);
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/environments/staging/variables/DEPLOY_ENV");
        if (method === "GET") return new Response(JSON.stringify(envFixture), { status: 200 });
        return new Response("", { status: 204 });
      },
    });
    expect(removedCalls).toEqual(["GET", "DELETE"]);
    expect(removed.deleted).toBe(true);

    await expect(deleteEnvironmentVariable({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      environment_name: "staging",
      name: "DEPLOY_ENV",
      fetch: async (_input, init) => {
        if ((init?.method ?? "GET") === "GET") return new Response(JSON.stringify(envFixture), { status: 200 });
        return new Response("", { status: 404 });
      },
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR", message: "Environment variable not found." });
  });

  test("org variables use the org list, not the repo organization-variables list", async () => {
    const shared = await listRepoOrganizationVariables({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/actions/organization-variables");
        return new Response(JSON.stringify(repoOrgFixture), { status: 200 });
      },
    });
    expect(shared.variables).toEqual([{ name: "SHARED", value: "1", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-02T00:00:00Z" }]);
    expect(shared.variables[0]).not.toHaveProperty("visibility");

    const listed = await listOrgVariables({
      accessToken: "t",
      org: "acme org",
      perPage: 5,
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/orgs/acme%20org/actions/variables?per_page=5");
        return new Response(JSON.stringify(orgListFixture), { status: 200 });
      },
    });
    expect(listed.variables).toEqual([{
      name: "ORG_REGION",
      value: "eu-west-1",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-02T00:00:00Z",
      visibility: "selected",
      selectedRepositoriesUrl: "https://api.github.com/orgs/acme/actions/variables/ORG_REGION/repositories",
    }]);
    expect(listed.variables[0]).not.toHaveProperty("selected_repository_ids");

    const got = await getOrgVariable({
      accessToken: "t",
      org: "acme",
      name: "ORG/REGION",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/orgs/acme/actions/variables/ORG%2FREGION");
        return new Response(JSON.stringify(orgFixture), { status: 200 });
      },
    });
    expect(got.variable).toMatchObject({ name: "ORG_REGION", value: "eu-west-1", visibility: "all" });

    const skipped: string[] = [];
    const existing = await createOrgVariable({
      accessToken: "t",
      org: "acme",
      name: "ORG_REGION",
      value: "nope",
      visibility: "all",
      fetch: async (_input, init) => {
        skipped.push(init?.method ?? "GET");
        return new Response(JSON.stringify(orgFixture), { status: 200 });
      },
    });
    expect(skipped).toEqual(["GET"]);
    expect(existing.created).toBe(false);
    expect(existing.id).toBe("ORG_REGION");

    const createdCalls: { method: string; body: string }[] = [];
    const created = await createOrgVariable({
      accessToken: "t",
      org: "acme",
      name: "NEW_ORG",
      value: "1",
      visibility: "selected",
      selected_repository_ids: [1296269],
      fetch: async (input, init) => {
        createdCalls.push({ method: init?.method ?? "GET", body: String(init?.body ?? "") });
        if ((init?.method ?? "GET") === "GET") {
          expect(String(input)).toBe("https://api.github.com/orgs/acme/actions/variables/NEW_ORG");
          return new Response("", { status: 404 });
        }
        expect(String(input)).toBe("https://api.github.com/orgs/acme/actions/variables");
        return new Response("", { status: 201 });
      },
    });
    expect(createdCalls.map((call) => call.method)).toEqual(["GET", "POST"]);
    expect(JSON.parse(createdCalls[1].body)).toEqual({
      name: "NEW_ORG",
      value: "1",
      visibility: "selected",
      selected_repository_ids: [1296269],
    });
    expect(created.created).toBe(true);
    expect(created.id).toBe("NEW_ORG");

    const privateCalls: { method: string; body: string }[] = [];
    await createOrgVariable({
      accessToken: "t",
      org: "acme",
      name: "PRIV",
      value: "1",
      visibility: "private",
      fetch: async (_input, init) => {
        privateCalls.push({ method: init?.method ?? "GET", body: String(init?.body ?? "") });
        if ((init?.method ?? "GET") === "GET") return new Response("", { status: 404 });
        return new Response(JSON.stringify({ name: "PRIV", value: "1", visibility: "private", created_at: "", updated_at: "" }), { status: 201 });
      },
    });
    expect(JSON.parse(privateCalls[1].body)).toEqual({ name: "PRIV", value: "1", visibility: "private" });
    expect(JSON.parse(privateCalls[1].body)).not.toHaveProperty("selected_repository_ids");

    expect(() => createOrgVariable({
      org: "acme",
      name: "X",
      value: "1",
      visibility: "all",
      selected_repository_ids: [1],
    })).toThrow(/selected_repository_ids is only allowed when visibility is selected/);
    expect(() => createOrgVariable({ org: "acme", name: "X", value: "1", visibility: "selected" })).toThrow(/selected_repository_ids is required/);

    const patched = await updateOrgVariable({
      accessToken: "t",
      org: "acme",
      name: "ORG_REGION_2",
      current_name: "ORG_REGION",
      value: "eu-central-1",
      visibility: "selected",
      selected_repository_ids: [7],
      fetch: async (input, init) => {
        expect(String(input)).toBe("https://api.github.com/orgs/acme/actions/variables/ORG_REGION");
        expect(init?.method).toBe("PATCH");
        expect(JSON.parse(String(init?.body))).toEqual({
          name: "ORG_REGION_2",
          value: "eu-central-1",
          visibility: "selected",
          selected_repository_ids: [7],
        });
        return new Response("", { status: 204 });
      },
    });
    expect(patched.name).toBe("ORG_REGION_2");
    expect(patched).not.toHaveProperty("rename");
    expect(patched.visibility).toBe("selected");

    const sameName = await updateOrgVariable({
      accessToken: "t",
      org: "acme",
      name: "ORG_REGION",
      value: "eu-west-1",
      visibility: "private",
      fetch: async (input, init) => {
        expect(String(input)).toBe("https://api.github.com/orgs/acme/actions/variables/ORG_REGION");
        expect(init?.method).toBe("PATCH");
        expect(JSON.parse(String(init?.body))).toEqual({ value: "eu-west-1", visibility: "private" });
        expect(JSON.parse(String(init?.body))).not.toHaveProperty("name");
        return new Response("", { status: 204 });
      },
    });
    expect(sameName.name).toBe("ORG_REGION");

    expect(() => updateOrgVariable({
      org: "acme",
      name: "ORG_REGION_2",
      current_name: "ORG_REGION",
      value: "1",
      visibility: "all",
      rename: "NOPE",
    })).toThrow(/rename is not a field/);

    const removedCalls: string[] = [];
    const removed = await deleteOrgVariable({
      accessToken: "t",
      org: "acme",
      name: "ORG_REGION",
      fetch: async (_input, init) => {
        removedCalls.push(init?.method ?? "GET");
        if ((init?.method ?? "GET") === "GET") return new Response(JSON.stringify(orgFixture), { status: 200 });
        return new Response("", { status: 204 });
      },
    });
    expect(removedCalls).toEqual(["GET", "DELETE"]);
    expect(removed.id).toBe("ORG_REGION");
    expect(removed.deleted).toBe(true);

    await expect(deleteOrgVariable({
      accessToken: "t",
      org: "acme",
      name: "MISSING",
      fetch: async (_input, init) => {
        if ((init?.method ?? "GET") === "GET") return new Response(JSON.stringify(orgFixture), { status: 200 });
        return new Response("", { status: 404 });
      },
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR", message: "Organization variable not found." });
  });
});
