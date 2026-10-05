import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import subIssuesFixture from "../fixtures/sub_issues.json";
import teamFixture from "../fixtures/team.json";
import teamsFixture from "../fixtures/card13_teams.json";
import invitationsFixture from "../fixtures/team_invitations.json";
import permissionFixture from "../fixtures/team_repo_permission.json";
import roleTeamsFixture from "../fixtures/org_role_teams.json";
import orgWorkflowPermissionsFixture from "../fixtures/org_workflow_permissions.json";
import orgActionsPermissionsFixture from "../fixtures/org_actions_permissions.json";
import orgCacheFixture from "../fixtures/org_cache_usage.json";
import repoCacheFixture from "../fixtures/repo_cache_usage.json";
import runTimingFixture from "../fixtures/run_timing.json";
import workflowTimingFixture from "../fixtures/workflow_timing.json";
import {
  listIssueSubIssues,
  getOrgTeamRepoPermission,
  getOrgTeam,
  listOrgChildTeams,
  listOrgTeamInvitations,
  listRepoTeams,
  listAuthenticatedUserTeams,
  listOrgRoleTeams,
  getOrgActionsWorkflowPermissions,
  getOrgActionsCacheUsage,
  getRepoActionsCacheUsage,
  getOrgActionsPermissions,
  getActionsRunTiming,
  getActionsWorkflowTiming,
} from "../src/actions";
import {
  validateListSubIssuesInput,
  validateGetTeamRepoPermissionInput,
  validateListUserTeamsInput,
  validateListOrgRoleTeamsInput,
  validateGetWorkflowTimingInput,
} from "../src/card13_reads";

const READS = [
  "issues.sub_issues.list",
  "orgs.teams.repos.permission.get",
  "orgs.teams.get",
  "orgs.teams.child.list",
  "orgs.teams.invitations.list",
  "repos.teams.list",
  "user.teams.list",
  "orgs.organization_roles.teams.list",
  "orgs.actions.permissions.workflow.get",
  "orgs.actions.cache.usage.get",
  "repos.actions.cache.usage.get",
  "orgs.actions.permissions.get",
  "actions.runs.timing.get",
  "actions.workflows.timing.get",
] as const;

describe("github card-13 reads", () => {
  test("manifest stays v0.71.0 at 726 ops and these reads omit effect policy", () => {
    expect(manifest.version).toBe("0.71.0");
    expect(Object.keys(manifest.operations).length).toBe(726);
    for (const key of READS) {
      const op = manifest.operations[key] as Record<string, unknown>;
      expect(op.kind).toBe("action");
      expect(op.sideEffect).toBe("read");
      expect(op.effectPolicy).toBeUndefined();
      expect(op.reconcile).toBeUndefined();
    }
    expect(manifest.operations["issues.get"]).toBeDefined();
    expect(manifest.operations["teams.repos.list"]).toBeDefined();
    expect(manifest.operations["teams.members.list"]).toBeDefined();
    expect(manifest.operations["teams.membership.get"]).toBeDefined();
    expect(manifest.operations["actions.permissions.workflow.get"].sideEffect).toBe("read");
    expect(manifest.operations["actions.permissions.get"].sideEffect).toBe("read");
    expect(manifest.operations["orgs.teams.list"]).toBeDefined();
  });

  test("validates required path fields and documented pagination only", () => {
    expect(validateListSubIssuesInput({
      owner: "octocat",
      repo: "Hello-World",
      issueNumber: 4,
      perPage: 30,
      page: 2,
    })).toEqual({ owner: "octocat", repo: "Hello-World", issueNumber: 4, perPage: 30, page: 2 });
    expect(() => validateListSubIssuesInput({ owner: "octo/cat", repo: "Hello-World", issueNumber: 4 })).toThrow(/owner/);
    expect(() => validateListSubIssuesInput({ owner: "octocat", repo: "Hello-World", issueNumber: 0 })).toThrow(/issueNumber/);
    expect(validateGetTeamRepoPermissionInput({
      org: "octocat",
      teamSlug: "justice-league",
      owner: "octocat",
      repo: "Hello-World",
    })).toEqual({ org: "octocat", teamSlug: "justice-league", owner: "octocat", repo: "Hello-World" });
    expect(() => validateGetTeamRepoPermissionInput({ org: "octocat", teamSlug: "a/b", owner: "octocat", repo: "Hello-World" })).toThrow(/teamSlug/);
    expect(validateListUserTeamsInput({ perPage: 10, page: 2 })).toEqual({ perPage: 10, page: 2 });
    expect(() => validateListUserTeamsInput({ perPage: 101 })).toThrow(/perPage/);
    expect(validateListOrgRoleTeamsInput({ org: "octocat", roleId: 5, page: 1 }).roleId).toBe(5);
    expect(() => validateListOrgRoleTeamsInput({ org: "octocat" })).toThrow(/roleId/);
    expect(validateGetWorkflowTimingInput({ owner: "octocat", repo: "Hello-World", workflowId: "ci.yml" }).workflowId).toBe("ci.yml");
    expect(validateGetWorkflowTimingInput({ owner: "octocat", repo: "Hello-World", workflowId: 42 }).workflowId).toBe("42");
    expect(() => validateGetWorkflowTimingInput({ owner: "octocat", repo: "Hello-World", workflowId: "a/b.yml" })).toThrow(/workflowId/);
  });

  test("lists sub-issues on the child route", async () => {
    const result = await listIssueSubIssues({
      accessToken: "t",
      owner: "octo cat",
      repo: "Hello World",
      issueNumber: 4,
      perPage: 30,
      page: 2,
      fetch: async (input, init) => {
        expect(String(input)).toBe("https://api.github.com/repos/octo%20cat/Hello%20World/issues/4/sub_issues?per_page=30&page=2");
        expect(new Headers(init?.headers).get("accept")).toBe("application/vnd.github+json");
        expect(init?.method ?? "GET").toBe("GET");
        return new Response(JSON.stringify(subIssuesFixture), { status: 200 });
      },
    });
    expect(result.action).toBe("issues.sub_issues.list");
    expect((result.subIssues as { number: number; title: string }[])[0]).toMatchObject({ number: 2, title: "Child issue" });
  });

  test("gets a team repository permission body and does not treat 204 as success", async () => {
    const ok = await getOrgTeamRepoPermission({
      accessToken: "t",
      org: "octo cat",
      teamSlug: "justice league",
      owner: "octo cat",
      repo: "Hello World",
      fetch: async (input, init) => {
        const url = String(input);
        expect(url).toBe("https://api.github.com/orgs/octo%20cat/teams/justice%20league/repos/octo%20cat/Hello%20World");
        expect(url).not.toMatch(/\/teams\/[^/]+\/repos$/);
        expect(new Headers(init?.headers).get("accept")).toBe("application/vnd.github+json");
        expect(init?.method ?? "GET").toBe("GET");
        return new Response(JSON.stringify(permissionFixture), { status: 200 });
      },
    });
    expect(ok.action).toBe("orgs.teams.repos.permission.get");
    expect(ok.permission).toMatchObject({
      name: "Hello-World",
      fullName: "octocat/Hello-World",
      roleName: "write",
      permissions: { push: true, admin: false },
    });
    await expect(getOrgTeamRepoPermission({
      accessToken: "t",
      org: "octocat",
      teamSlug: "justice-league",
      owner: "octocat",
      repo: "Hello-World",
      fetch: async () => new Response(null, { status: 204 }),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(getOrgTeamRepoPermission({
      accessToken: "t",
      org: "octocat",
      teamSlug: "justice-league",
      owner: "octocat",
      repo: "Hello-World",
      fetch: async () => new Response("{}", { status: 404 }),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("gets a team and lists child teams, invitations, repo teams, and user teams", async () => {
    const team = await getOrgTeam({
      accessToken: "t",
      org: "octo cat",
      teamSlug: "justice-league",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/orgs/octo%20cat/teams/justice-league");
        return new Response(JSON.stringify(teamFixture), { status: 200 });
      },
    });
    expect(team.action).toBe("orgs.teams.get");
    expect(team.team).toMatchObject({ id: 1, slug: "justice-league", permission: "pull" });

    const seen: string[] = [];
    const fetch = async (input: string | URL | Request) => {
      seen.push(String(input));
      const url = String(input);
      if (url.endsWith("/invitations")) return new Response(JSON.stringify(invitationsFixture), { status: 200 });
      return new Response(JSON.stringify(teamsFixture), { status: 200 });
    };
    const children = await listOrgChildTeams({ accessToken: "t", org: "octocat", teamSlug: "justice-league", perPage: 10, page: 2, fetch });
    const invites = await listOrgTeamInvitations({ accessToken: "t", org: "octocat", teamSlug: "justice-league", fetch });
    const repoTeams = await listRepoTeams({ accessToken: "t", owner: "octo cat", repo: "Hello World", fetch });
    const userTeams = await listAuthenticatedUserTeams({ accessToken: "t", perPage: 5, page: 1, fetch });
    expect(seen).toEqual([
      "https://api.github.com/orgs/octocat/teams/justice-league/teams?per_page=10&page=2",
      "https://api.github.com/orgs/octocat/teams/justice-league/invitations",
      "https://api.github.com/repos/octo%20cat/Hello%20World/teams",
      "https://api.github.com/user/teams?per_page=5&page=1",
    ]);
    expect(children.action).toBe("orgs.teams.child.list");
    expect((children.teams as { slug: string }[])[0].slug).toBe("justice-league");
    expect(invites.action).toBe("orgs.teams.invitations.list");
    expect((invites.invitations as { login: string; role: string }[])[0]).toMatchObject({ login: "octocat", role: "direct_member" });
    expect(repoTeams.action).toBe("repos.teams.list");
    expect(userTeams.action).toBe("user.teams.list");
    expect(String(seen[1])).not.toContain("/members");
    expect(String(seen[2])).not.toContain("/orgs/");
  });

  test("lists organization role teams", async () => {
    const result = await listOrgRoleTeams({
      accessToken: "t",
      org: "octo cat",
      roleId: 8,
      perPage: 20,
      page: 3,
      fetch: async (input, init) => {
        expect(String(input)).toBe("https://api.github.com/orgs/octo%20cat/organization-roles/8/teams?per_page=20&page=3");
        expect(String(input)).not.toContain("/users");
        expect(init?.method ?? "GET").toBe("GET");
        return new Response(JSON.stringify(roleTeamsFixture), { status: 200 });
      },
    });
    expect(result.action).toBe("orgs.organization_roles.teams.list");
    expect((result.teams as { assignment: string; slug: string }[])[0]).toMatchObject({ assignment: "direct", slug: "justice-league" });
  });

  test("reads organization permissions, workflow permissions, and cache usage", async () => {
    const workflow = await getOrgActionsWorkflowPermissions({
      accessToken: "t",
      org: "octo cat",
      fetch: async (input, init) => {
        expect(String(input)).toBe("https://api.github.com/orgs/octo%20cat/actions/permissions/workflow");
        expect(String(input)).not.toContain("/repos/");
        expect(new Headers(init?.headers).get("accept")).toBe("application/vnd.github+json");
        return new Response(JSON.stringify(orgWorkflowPermissionsFixture), { status: 200 });
      },
    });
    expect(workflow.action).toBe("orgs.actions.permissions.workflow.get");
    expect(workflow.permissions).toMatchObject({ defaultWorkflowPermissions: "read", canApprovePullRequestReviews: false });

    const permissions = await getOrgActionsPermissions({
      accessToken: "t",
      org: "octocat",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/orgs/octocat/actions/permissions");
        expect(String(input)).not.toContain("/workflow");
        return new Response(JSON.stringify(orgActionsPermissionsFixture), { status: 200 });
      },
    });
    expect(permissions.action).toBe("orgs.actions.permissions.get");
    expect(permissions.permissions).toMatchObject({ enabledRepositories: "all", allowedActions: "selected", shaPinningRequired: false });

    const orgCache = await getOrgActionsCacheUsage({
      accessToken: "t",
      org: "octocat",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/orgs/octocat/actions/cache/usage");
        expect(String(input)).not.toContain("/caches");
        return new Response(JSON.stringify(orgCacheFixture), { status: 200 });
      },
    });
    expect(orgCache.usage).toMatchObject({ totalActiveCachesCount: 2, totalActiveCachesSizeInBytes: 100 });

    const repoCache = await getRepoActionsCacheUsage({
      accessToken: "t",
      owner: "octo cat",
      repo: "Hello World",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/repos/octo%20cat/Hello%20World/actions/cache/usage");
        return new Response(JSON.stringify(repoCacheFixture), { status: 200 });
      },
    });
    expect(repoCache.action).toBe("repos.actions.cache.usage.get");
    expect(repoCache.usage).toMatchObject({ fullName: "octocat/Hello-World", activeCachesCount: 1 });
  });

  test("gets workflow run timing and workflow timing, not the parent gets", async () => {
    const run = await getActionsRunTiming({
      accessToken: "t",
      owner: "octocat",
      repo: "Hello-World",
      runId: 9,
      fetch: async (input, init) => {
        expect(String(input)).toBe("https://api.github.com/repos/octocat/Hello-World/actions/runs/9/timing");
        expect(init?.method ?? "GET").toBe("GET");
        return new Response(JSON.stringify(runTimingFixture), { status: 200 });
      },
    });
    expect(run.action).toBe("actions.runs.timing.get");
    expect(run.timing).toMatchObject({ runDurationMs: 1000, billable: { ubuntu: { totalMs: 1000, jobs: 1 } } });

    const workflow = await getActionsWorkflowTiming({
      accessToken: "t",
      owner: "octo cat",
      repo: "Hello World",
      workflowId: "ci.yml",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/repos/octo%20cat/Hello%20World/actions/workflows/ci.yml/timing");
        return new Response(JSON.stringify(workflowTimingFixture), { status: 200 });
      },
    });
    expect(workflow.action).toBe("actions.workflows.timing.get");
    expect(workflow.timing).toMatchObject({ billable: { ubuntu: { totalMs: 2000 } } });
  });

  test("maps 429 and keeps 404 as CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(listIssueSubIssues({
      accessToken: "t",
      owner: "octocat",
      repo: "Hello-World",
      issueNumber: 1,
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "9" } }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 9 });

    const missing = () => new Response("{}", { status: 404 });
    await expect(listIssueSubIssues({ accessToken: "t", owner: "octocat", repo: "Hello-World", issueNumber: 1, fetch: async () => missing() })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(getOrgTeam({ accessToken: "t", org: "octocat", teamSlug: "missing", fetch: async () => missing() })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(listOrgChildTeams({ accessToken: "t", org: "octocat", teamSlug: "missing", fetch: async () => missing() })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(listOrgTeamInvitations({ accessToken: "t", org: "octocat", teamSlug: "missing", fetch: async () => missing() })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(listRepoTeams({ accessToken: "t", owner: "octocat", repo: "Hello-World", fetch: async () => missing() })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(listAuthenticatedUserTeams({ accessToken: "t", fetch: async () => missing() })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(listOrgRoleTeams({ accessToken: "t", org: "octocat", roleId: 1, fetch: async () => missing() })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(getOrgActionsWorkflowPermissions({ accessToken: "t", org: "octocat", fetch: async () => missing() })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(getOrgActionsCacheUsage({ accessToken: "t", org: "octocat", fetch: async () => missing() })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(getRepoActionsCacheUsage({ accessToken: "t", owner: "octocat", repo: "Hello-World", fetch: async () => missing() })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(getOrgActionsPermissions({ accessToken: "t", org: "octocat", fetch: async () => missing() })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(getActionsRunTiming({ accessToken: "t", owner: "octocat", repo: "Hello-World", runId: 1, fetch: async () => missing() })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(getActionsWorkflowTiming({ accessToken: "t", owner: "octocat", repo: "Hello-World", workflowId: "ci.yml", fetch: async () => missing() })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("validation-only path does not fetch", () => {
    const result = listIssueSubIssues({ owner: "octocat", repo: "Hello-World", issueNumber: 4 });
    expect(result.action).toBe("issues.sub_issues.list");
    expect(result.validated).toEqual({
      owner: "octocat",
      repo: "Hello-World",
      issueNumber: 4,
      perPage: undefined,
      page: undefined,
    });
  });
});
