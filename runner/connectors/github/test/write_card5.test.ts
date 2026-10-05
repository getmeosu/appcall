import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import {
  deleteEnvironmentDeploymentProtectionRule,
  removeBranchProtectionRestrictionApps,
  removeBranchProtectionStatusCheckContexts,
  deleteBranchProtectionRequiredStatusChecks,
  removeBranchProtectionRestrictionTeams,
  removeBranchProtectionRestrictionUsers,
  createBranchProtectionEnforceAdmins,
  setBranchProtectionRestrictionApps,
  setBranchProtectionStatusCheckContexts,
  setBranchProtectionRestrictionTeams,
  setBranchProtectionRestrictionUsers,
  updateBranchProtection,
  updateBranchProtectionRequiredPullRequestReviews,
  updateBranchProtectionRequiredStatusChecks,
} from "../src/actions";

const NO_POLICY = [
  "repos.environments.deployment_protection_rules.delete",
  "branches.protection.restrictions.apps.delete",
  "branches.protection.required_status_checks.contexts.delete",
  "branches.protection.required_status_checks.delete",
  "branches.protection.restrictions.teams.delete",
  "branches.protection.restrictions.users.delete",
  "branches.protection.enforce_admins.create",
  "branches.protection.restrictions.apps.set",
  "branches.protection.required_status_checks.contexts.set",
  "branches.protection.restrictions.teams.set",
  "branches.protection.restrictions.users.set",
  "branches.protection.required_pull_request_reviews.update",
  "branches.protection.required_status_checks.update",
] as const;

function empty(status: number) {
  return new Response("", { status });
}

describe("github write card 5 branch protection writes", () => {
  test("version is 0.78.0 at 812 ops with the write breakdown", () => {
    expect(manifest.version).toBe("0.78.0");
    const ops = manifest.operations as Record<string, Record<string, unknown>>;
    expect(Object.keys(ops)).toHaveLength(812);
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
    expect(kinds).toEqual({ action: 762, sync: 4, webhook: 46 });
    expect(side).toEqual({ read: 411, write: 336, absent: 15 });
    expect(String(ops["branches.protection.get"].description)).toContain("GET /repos/{owner}/{repo}/branches/{branch}/protection");
    expect(ops["branches.protection.get"].sideEffect).toBe("read");
    const update = ops["branches.protection.update"];
    expect(update.kind).toBe("action");
    expect(update.sideEffect).toBe("write");
    expect(update.effectPolicy).toBe("Reconcile");
    expect(update.reconcile).toBe("branches.protection.get");
    expect(update.effect).toBeUndefined();
    for (const key of NO_POLICY) {
      const op = ops[key];
      expect(op.kind).toBe("action");
      expect(op.sideEffect).toBe("write");
      expect(op.effectPolicy).toBeUndefined();
      expect(op.reconcile).toBeUndefined();
      expect(op.effect).toBeUndefined();
    }
    expect(ops["classroom"]).toBeUndefined();
  });

  test("writes use the documented method and path and a 404 is upstream", async () => {
    const token = "not-a-token";
    const calls: string[] = [];
    const fetchOf = (status: number, body?: unknown) => async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${String(input)} ${String(init?.body ?? "")}`);
      if (body === undefined) return empty(status);
      return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    };
    const branch = { owner: "acme", repo: "app", branch: "main" };
    const base = "https://api.github.com/repos/acme/app/branches/main/protection";

    const rule = await deleteEnvironmentDeploymentProtectionRule({
      accessToken: token, owner: "acme", repo: "app", environmentName: "prod", protectionRuleId: 7, fetch: fetchOf(204),
    });
    expect(calls.at(-1)).toBe("DELETE https://api.github.com/repos/acme/app/environments/prod/deployment_protection_rules/7 ");
    expect(rule.deleted).toBe(true);
    await expect(deleteEnvironmentDeploymentProtectionRule({
      accessToken: token, owner: "acme", repo: "app", environmentName: "prod", protectionRuleId: 7, fetch: fetchOf(404),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const appsRemoved = await removeBranchProtectionRestrictionApps({
      accessToken: token, ...branch, apps: ["octoapp"], fetch: fetchOf(200, []),
    });
    expect(calls.at(-1)).toBe(`DELETE ${base}/restrictions/apps ${JSON.stringify({ apps: ["octoapp"] })}`);
    expect(appsRemoved.apps).toEqual([]);
    await expect(removeBranchProtectionRestrictionApps({
      accessToken: token, ...branch, apps: ["octoapp"], fetch: fetchOf(404),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const contextsRemoved = await removeBranchProtectionStatusCheckContexts({
      accessToken: token, ...branch, contexts: ["ci/test"], fetch: fetchOf(200, ["ci/lint"]),
    });
    expect(calls.at(-1)).toBe(`DELETE ${base}/required_status_checks/contexts ${JSON.stringify({ contexts: ["ci/test"] })}`);
    expect(contextsRemoved.contexts).toEqual(["ci/lint"]);
    await expect(removeBranchProtectionStatusCheckContexts({
      accessToken: token, ...branch, contexts: ["ci/test"], fetch: fetchOf(404),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const checksRemoved = await deleteBranchProtectionRequiredStatusChecks({
      accessToken: token, ...branch, fetch: fetchOf(204),
    });
    expect(calls.at(-1)).toBe(`DELETE ${base}/required_status_checks `);
    expect(checksRemoved.deleted).toBe(true);
    await expect(deleteBranchProtectionRequiredStatusChecks({
      accessToken: token, ...branch, fetch: fetchOf(404),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const teamsRemoved = await removeBranchProtectionRestrictionTeams({
      accessToken: token, ...branch, teams: ["octocats"], fetch: fetchOf(200, []),
    });
    expect(calls.at(-1)).toBe(`DELETE ${base}/restrictions/teams ${JSON.stringify({ teams: ["octocats"] })}`);
    expect(teamsRemoved.teams).toEqual([]);
    await expect(removeBranchProtectionRestrictionTeams({
      accessToken: token, ...branch, teams: ["octocats"], fetch: fetchOf(404),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const usersRemoved = await removeBranchProtectionRestrictionUsers({
      accessToken: token, ...branch, users: ["octocat"], fetch: fetchOf(200, []),
    });
    expect(calls.at(-1)).toBe(`DELETE ${base}/restrictions/users ${JSON.stringify({ users: ["octocat"] })}`);
    expect(usersRemoved.users).toEqual([]);
    await expect(removeBranchProtectionRestrictionUsers({
      accessToken: token, ...branch, users: ["octocat"], fetch: fetchOf(404),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const admins = await createBranchProtectionEnforceAdmins({
      accessToken: token, ...branch, fetch: fetchOf(200, { url: "https://api.github.com/example", enabled: true }),
    });
    expect(calls.at(-1)).toBe(`POST ${base}/enforce_admins `);
    expect(admins.protection).toMatchObject({ enabled: true });

    const appsSet = await setBranchProtectionRestrictionApps({
      accessToken: token, ...branch, apps: ["octoapp"], fetch: fetchOf(200, [{ slug: "octoapp" }]),
    });
    expect(calls.at(-1)).toBe(`PUT ${base}/restrictions/apps ${JSON.stringify({ apps: ["octoapp"] })}`);
    expect(appsSet.apps).toHaveLength(1);

    const contextsSet = await setBranchProtectionStatusCheckContexts({
      accessToken: token, ...branch, contexts: ["ci/test"], fetch: fetchOf(200, ["ci/test"]),
    });
    expect(calls.at(-1)).toBe(`PUT ${base}/required_status_checks/contexts ${JSON.stringify({ contexts: ["ci/test"] })}`);
    expect(contextsSet.contexts).toEqual(["ci/test"]);

    const teamsSet = await setBranchProtectionRestrictionTeams({
      accessToken: token, ...branch, teams: ["justice-league"], fetch: fetchOf(200, [{ slug: "justice-league" }]),
    });
    expect(calls.at(-1)).toBe(`PUT ${base}/restrictions/teams ${JSON.stringify({ teams: ["justice-league"] })}`);
    expect(teamsSet.teams).toHaveLength(1);

    const usersSet = await setBranchProtectionRestrictionUsers({
      accessToken: token, ...branch, users: ["octocat"], fetch: fetchOf(200, [{ login: "octocat" }]),
    });
    expect(calls.at(-1)).toBe(`PUT ${base}/restrictions/users ${JSON.stringify({ users: ["octocat"] })}`);
    expect(usersSet.users).toHaveLength(1);

    const updated = await updateBranchProtection({
      accessToken: token, ...branch,
      requiredStatusChecks: { strict: true, contexts: ["ci/test"] },
      enforceAdmins: true,
      requiredPullRequestReviews: { requiredApprovingReviewCount: 2, dismissStaleReviews: true },
      restrictions: null,
      requiredLinearHistory: true,
      fetch: fetchOf(200, { url: "https://api.github.com/example" }),
    });
    expect(calls.at(-1)).toBe(`PUT ${base} ${JSON.stringify({
      required_status_checks: { strict: true, contexts: ["ci/test"] },
      enforce_admins: true,
      required_pull_request_reviews: { dismiss_stale_reviews: true, required_approving_review_count: 2 },
      restrictions: null,
      required_linear_history: true,
    })}`);
    expect(updated.protection).toMatchObject({ url: "https://api.github.com/example" });
    await expect(updateBranchProtection({
      accessToken: token, ...branch, requiredStatusChecks: null, enforceAdmins: null, requiredPullRequestReviews: null, restrictions: null,
      fetch: fetchOf(404),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    expect(() => updateBranchProtection({ ...branch, enforceAdmins: true, requiredPullRequestReviews: null, restrictions: null })).toThrow();

    const reviews = await updateBranchProtectionRequiredPullRequestReviews({
      accessToken: token, ...branch, requireCodeOwnerReviews: true, bypassPullRequestAllowances: { users: ["octocat"] },
      fetch: fetchOf(200, { url: "https://api.github.com/example", require_code_owner_reviews: true }),
    });
    expect(calls.at(-1)).toBe(`PATCH ${base}/required_pull_request_reviews ${JSON.stringify({
      require_code_owner_reviews: true,
      bypass_pull_request_allowances: { users: ["octocat"] },
    })}`);
    expect(reviews.protection).toMatchObject({ require_code_owner_reviews: true });

    const checks = await updateBranchProtectionRequiredStatusChecks({
      accessToken: token, ...branch, strict: true, checks: [{ context: "ci/test", appId: -1 }],
      fetch: fetchOf(200, { url: "https://api.github.com/example", strict: true }),
    });
    expect(calls.at(-1)).toBe(`PATCH ${base}/required_status_checks ${JSON.stringify({
      strict: true,
      checks: [{ context: "ci/test", app_id: -1 }],
    })}`);
    expect(checks.protection).toMatchObject({ strict: true });
    await expect(updateBranchProtectionRequiredStatusChecks({
      accessToken: token, ...branch, strict: true, fetch: fetchOf(404),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});
