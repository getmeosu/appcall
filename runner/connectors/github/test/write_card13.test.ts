import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import {
  addSubIssue,
  removeAllIssueLabels,
  addTeamRepo,
  assignOrgRoleToTeam,
  deleteOrgTeam,
  removeAllOrgRolesFromTeam,
  removeOrgRoleFromTeam,
  removeTeamRepo,
  updateOrgTeam,
} from "../src/actions";

const PATHS = {
  "issues.sub_issues.add": "POST /repos/{owner}/{repo}/issues/{issue_number}/sub_issues",
  "issues.labels.remove_all": "DELETE /repos/{owner}/{repo}/issues/{issue_number}/labels",
  "orgs.teams.repos.add": "PUT /orgs/{org}/teams/{team_slug}/repos/{owner}/{repo}",
  "orgs.organization_roles.teams.assign": "PUT /orgs/{org}/organization-roles/teams/{team_slug}/{role_id}",
  "orgs.teams.delete": "DELETE /orgs/{org}/teams/{team_slug}",
  "orgs.organization_roles.teams.remove_all": "DELETE /orgs/{org}/organization-roles/teams/{team_slug}",
  "orgs.organization_roles.teams.remove": "DELETE /orgs/{org}/organization-roles/teams/{team_slug}/{role_id}",
  "orgs.teams.repos.remove": "DELETE /orgs/{org}/teams/{team_slug}/repos/{owner}/{repo}",
  "orgs.teams.update": "PATCH /orgs/{org}/teams/{team_slug}",
} as const;

const OMIT = [
  "issues.sub_issues.add",
  "issues.labels.remove_all",
  "orgs.teams.repos.add",
  "orgs.organization_roles.teams.assign",
  "orgs.teams.delete",
  "orgs.organization_roles.teams.remove_all",
  "orgs.organization_roles.teams.remove",
  "orgs.teams.repos.remove",
] as const;

function empty(status: number) {
  return new Response("", { status });
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("github write card 13 sub-issues labels teams writes", () => {
  test("version is 0.62.0 at 639 ops with the write breakdown", () => {
    expect(manifest.version).toBe("0.62.0");
    const ops = manifest.operations as Record<string, Record<string, unknown>>;
    expect(Object.keys(ops)).toHaveLength(639);
    const kinds = { action: 0, sync: 0, webhook: 0 };
    const side = { read: 0, write: 0, absent: 0 };
    for (const op of Object.values(ops)) {
      kinds[op.kind as keyof typeof kinds] += 1;
      if (op.kind === "action") {
        if (op.sideEffect === "read") side.read += 1;
        else if (op.sideEffect === "write") side.write += 1;
        else side.absent += 1;
      }
    }
    expect(kinds).toEqual({ action: 589, sync: 4, webhook: 46 });
    expect(side).toEqual({ read: 328, write: 246, absent: 15 });
    for (const [key, path] of Object.entries(PATHS)) {
      const op = ops[key];
      expect(String(op.description)).toContain(path);
      expect(op.kind).toBe("action");
      expect(op.sideEffect).toBe("write");
    }
    for (const key of OMIT) {
      const op = ops[key];
      expect(op.effectPolicy).toBeUndefined();
      expect(op.reconcile).toBeUndefined();
      expect(op.effect).toBeUndefined();
    }
    expect(ops["orgs.teams.update"].effectPolicy).toBe("Reconcile");
    expect(ops["orgs.teams.update"].reconcile).toBe("orgs.teams.get");
    expect(ops["orgs.teams.update"].effect).toBeUndefined();
    expect(String(ops["orgs.teams.get"].description)).toContain("GET /orgs/{org}/teams/{team_slug}");
    expect(ops["classroom"]).toBeUndefined();
  });

  test("writes use the documented method and path and a 404 is upstream", async () => {
    const token = "not-a-token";
    const calls: string[] = [];
    const fetchOf = (status: number, body?: unknown) => async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${String(input)} ${String(init?.body ?? "")}`);
      if (body === undefined) return empty(status);
      return json(status, body);
    };

    const issue = { id: 99, number: 2 };
    const added = await addSubIssue({
      accessToken: token, owner: "acme", repo: "app", issueNumber: 1, subIssueId: 99, fetch: fetchOf(201, issue),
    });
    expect(added.issue).toEqual(issue);
    expect(calls.at(-1)).toContain("POST https://api.github.com/repos/acme/app/issues/1/sub_issues");
    expect(calls.at(-1)).toContain(JSON.stringify({ sub_issue_id: 99 }));

    const cleared = await removeAllIssueLabels({
      accessToken: token, owner: "acme", repo: "app", issueNumber: 1, fetch: fetchOf(204),
    });
    expect(cleared).toMatchObject({ action: "issues.labels.remove_all", deleted: true });
    expect(calls.at(-1)).toContain("DELETE https://api.github.com/repos/acme/app/issues/1/labels");

    const repoAdd = await addTeamRepo({
      accessToken: token, org: "acme", teamSlug: "core", owner: "acme", repo: "app", permission: "push", fetch: fetchOf(204),
    });
    expect(repoAdd).toMatchObject({ action: "orgs.teams.repos.add", added: true, permission: "push" });
    expect(calls.at(-1)).toContain("PUT https://api.github.com/orgs/acme/teams/core/repos/acme/app");

    const assigned = await assignOrgRoleToTeam({
      accessToken: token, org: "acme", teamSlug: "core", roleId: 7, fetch: fetchOf(204),
    });
    expect(assigned).toMatchObject({ action: "orgs.organization_roles.teams.assign", assigned: true, roleId: 7 });
    expect(calls.at(-1)).toContain("PUT https://api.github.com/orgs/acme/organization-roles/teams/core/7");

    const deleted = await deleteOrgTeam({
      accessToken: token, org: "acme", teamSlug: "core", fetch: fetchOf(204),
    });
    expect(deleted).toMatchObject({ action: "orgs.teams.delete", deleted: true });
    expect(calls.at(-1)).toContain("DELETE https://api.github.com/orgs/acme/teams/core");

    const removedAll = await removeAllOrgRolesFromTeam({
      accessToken: token, org: "acme", teamSlug: "core", fetch: fetchOf(204),
    });
    expect(removedAll).toMatchObject({ action: "orgs.organization_roles.teams.remove_all", removed: true });
    expect(calls.at(-1)).toContain("DELETE https://api.github.com/orgs/acme/organization-roles/teams/core");

    const removedRole = await removeOrgRoleFromTeam({
      accessToken: token, org: "acme", teamSlug: "core", roleId: 7, fetch: fetchOf(204),
    });
    expect(removedRole).toMatchObject({ action: "orgs.organization_roles.teams.remove", removed: true, roleId: 7 });
    expect(calls.at(-1)).toContain("DELETE https://api.github.com/orgs/acme/organization-roles/teams/core/7");

    const removedRepo = await removeTeamRepo({
      accessToken: token, org: "acme", teamSlug: "core", owner: "acme", repo: "app", fetch: fetchOf(204),
    });
    expect(removedRepo).toMatchObject({ action: "orgs.teams.repos.remove", removed: true });
    expect(calls.at(-1)).toContain("DELETE https://api.github.com/orgs/acme/teams/core/repos/acme/app");

    const team = { id: 1, name: "Core", slug: "core" };
    const updated = await updateOrgTeam({
      accessToken: token, org: "acme", teamSlug: "core", name: "Core", privacy: "closed", fetch: fetchOf(200, team),
    });
    expect(updated.team).toEqual(team);
    expect(calls.at(-1)).toContain("PATCH https://api.github.com/orgs/acme/teams/core");

    await expect(removeAllIssueLabels({
      accessToken: token, owner: "acme", repo: "app", issueNumber: 1, fetch: fetchOf(404),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(deleteOrgTeam({
      accessToken: token, org: "acme", teamSlug: "missing", fetch: fetchOf(404),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(removeTeamRepo({
      accessToken: token, org: "acme", teamSlug: "core", owner: "acme", repo: "missing", fetch: fetchOf(404),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("validation rejects bad input without a token", () => {
    expect(() => addSubIssue({ owner: "acme", repo: "app", issueNumber: 1 } as never)).toThrow();
    expect(() => addTeamRepo({ org: "acme", teamSlug: "core", owner: "acme", repo: "app", permission: "write" } as never)).toThrow();
    expect(() => updateOrgTeam({ org: "acme", teamSlug: "core", privacy: "public" } as never)).toThrow();
    expect(deleteOrgTeam({ org: "acme", teamSlug: "core" })).toMatchObject({
      action: "orgs.teams.delete", validated: { org: "acme", teamSlug: "core" },
    });
  });
});
