import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import permissionFixture from "../fixtures/collaborator_permission.json";
import protectionFixture from "../fixtures/branch_protection.json";
import rulesetsFixture from "../fixtures/rulesets_list.json";
import branchRulesFixture from "../fixtures/branch_rules.json";
import hooksFixture from "../fixtures/hooks_list.json";
import membershipFixture from "../fixtures/team_membership.json";
import invitationsFixture from "../fixtures/invitations_list.json";
import repoFixture from "../fixtures/get_repo.json";
import teamsFixture from "../fixtures/teams_list.json";
import {
  getCollaboratorPermission,
  getBranchProtection,
  listRepoRulesets,
  getRulesForBranch,
  listRepoHooks,
  getTeamMembership,
  listTeamRepos,
  listRepoInvitations,
  createOrgRepo,
  createTeam,
  createRepoHook,
  removeTeamMembership,
  dispatchRepo,
} from "../src/actions";
import {
  normalizeGitHubHook,
  normalizeGitHubRuleset,
  normalizeGitHubInvitation,
  validateCreateOrgRepoInput,
  validateCreateTeamInput,
  validateCreateRepoHookInput,
  validateDispatchRepoInput,
} from "../src/governance";
import { validateGetRepoInput } from "../src/repos";

const N3_READS = [
  "repos.collaborators.permission.get",
  "branches.protection.get",
  "repos.rulesets.list",
  "repos.rules.for_branch",
  "repos.hooks.list",
  "teams.membership.get",
  "teams.repos.list",
  "repos.invitations.list",
] as const;

describe("github N3 orgs teams hooks", () => {
  test("manifest is v0.75.0 with 715 ops and the N3 effect policies", () => {
    expect(manifest.version).toBe("0.75.0");
    expect(Object.keys(manifest.operations).length).toBe(770);
    for (const key of N3_READS) {
      const op = manifest.operations[key] as Record<string, unknown>;
      expect(op.kind).toBe("action");
      expect(op.sideEffect).toBe("read");
      expect(op.effectPolicy).toBeUndefined();
      expect(op.reconcile).toBeUndefined();
    }
    for (const [key, reconcile] of [
      ["orgs.repos.create", "repos.get"],
      ["teams.create", "orgs.teams.list"],
      ["repos.hooks.create", "repos.hooks.list"],
    ] as const) {
      const op = manifest.operations[key] as Record<string, unknown>;
      expect(op.sideEffect).toBe("write");
      expect(op.effectPolicy).toBe("Reconcile");
      expect(op.reconcile).toBe(reconcile);
    }
    const remove = manifest.operations["teams.membership.remove"] as Record<string, unknown>;
    expect(remove.sideEffect).toBe("write");
    expect(remove.effectPolicy).toBe("Idempotent");
    expect(remove.reconcile).toBeUndefined();
    const dispatch = manifest.operations["repos.dispatch"] as Record<string, unknown>;
    expect(dispatch.sideEffect).toBe("write");
    expect(dispatch.effectPolicy).toBeUndefined();
    expect(dispatch.reconcile).toBeUndefined();
    expect(manifest.operations["contents.put"]).toBeUndefined();
    expect(manifest.operations["contents.delete"]).toBeUndefined();
    expect(manifest.operations["contents.push_files"]).toBeUndefined();
    expect(manifest.operations["repos.delete"]).toBeDefined();
    expect(manifest.operations["branches.protection.update"]).toBeDefined();
    expect(manifest.operations["repos.contents.put"].effectPolicy).toBe("Reconcile");
    expect(manifest.operations["repos.contents.delete"].effectPolicy).toBe("Idempotent");
    expect(manifest.operations["repos.contents.push_files"].reconcile).toBe("commits.get");
    expect(manifest.operations["orgs.teams.list"].sideEffect).toBe("read");
  });

  test("normalizes hook, ruleset, and invitation fixtures", () => {
    const hook = normalizeGitHubHook(hooksFixture[0] as never);
    expect(hook.id).toBe("gh-hook:7");
    expect(hook.configUrl).toBe("https://example.com/hook");
    const ruleset = normalizeGitHubRuleset(rulesetsFixture[0] as never);
    expect(ruleset.id).toBe("gh-ruleset:21");
    expect(ruleset.enforcement).toBe("active");
    const invitation = normalizeGitHubInvitation(invitationsFixture[0] as never);
    expect(invitation.id).toBe("gh-invitation:3");
    expect(invitation.invitee).toBe("hubot");
  });

  test("validates writes and repos.get reconcile aliases", () => {
    expect(validateCreateOrgRepoInput({ org: "acme", name: "app", visibility: "private" }).name).toBe("app");
    expect(() => validateCreateOrgRepoInput({ org: "acme", name: "app", visibility: "hidden" })).toThrow();
    expect(validateCreateTeamInput({ org: "acme", name: "Platform", privacy: "closed" }).privacy).toBe("closed");
    expect(() => validateCreateTeamInput({ org: "acme", name: "Platform", privacy: "open" })).toThrow();
    expect(validateCreateRepoHookInput({ owner: "acme", repo: "app", url: "https://example.com/h", events: ["push"] }).events).toEqual(["push"]);
    expect(() => validateCreateRepoHookInput({ owner: "acme", repo: "app", url: "https://example.com/h", events: [] })).toThrow();
    expect(validateDispatchRepoInput({ owner: "acme", repo: "app", eventType: "deploy" }).eventType).toBe("deploy");
    expect(() => validateDispatchRepoInput({ owner: "acme", repo: "app", eventType: "deploy", clientPayload: [] })).toThrow();
    expect(validateGetRepoInput({ org: "acme", name: "app" })).toEqual({ owner: "acme", repo: "app" });
    expect(validateGetRepoInput({ owner: "kept", org: "acme", repo: "old", name: "renamed" })).toEqual({ owner: "kept", repo: "renamed" });
  });

  test("reads hit the GitHub REST paths", async () => {
    const permission = await getCollaboratorPermission({
      accessToken: "t",
      owner: "acme?x",
      repo: "app",
      username: "octo cat",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/repos/acme%3Fx/app/collaborators/octo%20cat/permission");
        return new Response(JSON.stringify(permissionFixture), { status: 200 });
      },
    });
    expect(permission.permission).toBe("admin");

    const protection = await getBranchProtection({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      branch: "feature/board",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/branches/feature%2Fboard/protection");
        return new Response(JSON.stringify(protectionFixture), { status: 200 });
      },
    });
    expect((protection.protection as { url: string }).url).toContain("/protection");

    const rulesets = await listRepoRulesets({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      perPage: 10,
      page: 2,
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/rulesets?per_page=10&page=2");
        return new Response(JSON.stringify(rulesetsFixture), { status: 200 });
      },
    });
    expect((rulesets.rulesets as unknown[]).length).toBe(1);

    const rules = await getRulesForBranch({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      branch: "main",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/rules/branches/main");
        return new Response(JSON.stringify(branchRulesFixture), { status: 200 });
      },
    });
    expect((rules.rules as Array<{ type: string }>)[0].type).toBe("pull_request");

    const hooks = await listRepoHooks({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/hooks");
        return new Response(JSON.stringify(hooksFixture), { status: 200 });
      },
    });
    expect((hooks.hooks as Array<{ hookId: number }>)[0].hookId).toBe(7);

    const membership = await getTeamMembership({
      accessToken: "t",
      org: "acme",
      teamSlug: "platform",
      username: "octocat",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/orgs/acme/teams/platform/memberships/octocat");
        return new Response(JSON.stringify(membershipFixture), { status: 200 });
      },
    });
    expect(membership.state).toBe("active");

    const repos = await listTeamRepos({
      accessToken: "t",
      org: "acme",
      teamSlug: "platform",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/orgs/acme/teams/platform/repos");
        return new Response(JSON.stringify([repoFixture]), { status: 200 });
      },
    });
    expect((repos.repositories as unknown[]).length).toBe(1);

    const invitations = await listRepoInvitations({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      fetch: async (input) => {
        expect(String(input)).toBe("https://api.github.com/repos/acme/app/invitations");
        return new Response(JSON.stringify(invitationsFixture), { status: 200 });
      },
    });
    expect((invitations.invitations as Array<{ invitee: string }>)[0].invitee).toBe("hubot");
  });

  test("writes post or delete the documented paths and dispatch is 204", async () => {
    const createdRepoReqs: Request[] = [];
    const createdRepo = await createOrgRepo({
      accessToken: "t",
      org: "acme",
      name: "app",
      private: true,
      fetch: async (input, init) => {
        createdRepoReqs.push(new Request(input, init));
        return new Response(JSON.stringify(repoFixture), { status: 201 });
      },
    });
    expect(createdRepoReqs[0].method).toBe("POST");
    expect(createdRepoReqs[0].url).toBe("https://api.github.com/orgs/acme/repos");
    expect(JSON.parse(await createdRepoReqs[0].text()).name).toBe("app");
    expect((createdRepo.repo as { fullName?: string }).fullName ?? (createdRepo.repo as { name?: string }).name).toBeTruthy();

    const teamReqs: Request[] = [];
    const team = await createTeam({
      accessToken: "t",
      org: "acme",
      name: "Platform",
      privacy: "closed",
      fetch: async (input, init) => {
        teamReqs.push(new Request(input, init));
        return new Response(JSON.stringify(teamsFixture[0]), { status: 201 });
      },
    });
    expect(teamReqs[0].method).toBe("POST");
    expect(teamReqs[0].url).toBe("https://api.github.com/orgs/acme/teams");
    expect((team.team as { slug: string }).slug).toBe("platform");

    const hookReqs: Request[] = [];
    const hook = await createRepoHook({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      url: "https://example.com/hook",
      events: ["push"],
      contentType: "json",
      fetch: async (input, init) => {
        hookReqs.push(new Request(input, init));
        return new Response(JSON.stringify(hooksFixture[0]), { status: 201 });
      },
    });
    expect(hookReqs[0].method).toBe("POST");
    expect(hookReqs[0].url).toBe("https://api.github.com/repos/acme/app/hooks");
    expect(JSON.parse(await hookReqs[0].text()).events).toEqual(["push"]);
    expect((hook.hook as { hookId: number }).hookId).toBe(7);

    const removeReqs: Request[] = [];
    const removed = await removeTeamMembership({
      accessToken: "t",
      org: "acme",
      teamSlug: "platform",
      username: "octocat",
      fetch: async (input, init) => {
        removeReqs.push(new Request(input, init));
        return new Response("", { status: 204 });
      },
    });
    expect(removeReqs[0].method).toBe("DELETE");
    expect(removeReqs[0].url).toBe("https://api.github.com/orgs/acme/teams/platform/memberships/octocat");
    expect(removed.removed).toBe(true);

    await expect(removeTeamMembership({
      accessToken: "t",
      org: "acme",
      teamSlug: "platform",
      username: "octocat",
      fetch: async () => new Response(JSON.stringify({ message: "Not Found" }), { status: 404 }),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const dispatchReqs: Request[] = [];
    const dispatched = await dispatchRepo({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      eventType: "deploy",
      clientPayload: { env: "prod" },
      fetch: async (input, init) => {
        dispatchReqs.push(new Request(input, init));
        return new Response("", { status: 204 });
      },
    });
    expect(dispatchReqs[0].method).toBe("POST");
    expect(dispatchReqs[0].url).toBe("https://api.github.com/repos/acme/app/dispatches");
    expect(JSON.parse(await dispatchReqs[0].text())).toEqual({ event_type: "deploy", client_payload: { env: "prod" } });
    expect(dispatched.dispatched).toBe(true);
    expect(dispatched.action).toBe("repos.dispatch");

    const dry = dispatchRepo({ owner: "acme", repo: "app", eventType: "deploy" });
    expect(dry.action).toBe("repos.dispatch");
    expect(dry.validated).toEqual({ owner: "acme", repo: "app", eventType: "deploy", clientPayload: undefined });

    await expect(dispatchRepo({
      accessToken: "t",
      owner: "acme",
      repo: "app",
      eventType: "deploy",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "9" } }),
    })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED" });
  });
});
