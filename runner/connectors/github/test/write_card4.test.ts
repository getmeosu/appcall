import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import {
  removeCodespaceSecretRepository,
  setCodespaceSecretRepositories,
  addBranchProtectionRestrictionApps,
  addBranchProtectionStatusCheckContexts,
  addBranchProtectionRestrictionTeams,
  addBranchProtectionRestrictionUsers,
  createBranchProtectionRequiredSignatures,
  deleteBranchProtectionRestrictions,
  deleteBranchProtectionEnforceAdmins,
  deleteBranchProtection,
  deleteBranchProtectionRequiredSignatures,
  deleteBranchProtectionRequiredPullRequestReviews,
} from "../src/actions";

const NO_POLICY = [
  "user.codespaces.secrets.repositories.remove",
  "user.codespaces.secrets.repositories.set",
  "branches.protection.restrictions.apps.add",
  "branches.protection.required_status_checks.contexts.add",
  "branches.protection.restrictions.teams.add",
  "branches.protection.restrictions.users.add",
  "branches.protection.required_signatures.create",
  "branches.protection.restrictions.delete",
  "branches.protection.enforce_admins.delete",
  "branches.protection.delete",
  "branches.protection.required_signatures.delete",
  "branches.protection.required_pull_request_reviews.delete",
] as const;

function empty(status: number) {
  return new Response("", { status });
}

describe("github write card 4 branch protection writes", () => {
  test("version is 0.60.0 at 623 ops with the write breakdown", () => {
    expect(manifest.version).toBe("0.60.0");
    const ops = manifest.operations as Record<string, Record<string, unknown>>;
    expect(Object.keys(ops)).toHaveLength(623);
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
    expect(kinds).toEqual({ action: 573, sync: 4, webhook: 46 });
    expect(side).toEqual({ read: 328, write: 230, absent: 15 });
    expect(String(ops["branches.protection.get"].description)).toContain("GET /repos/{owner}/{repo}/branches/{branch}/protection");
    expect(ops["branches.protection.get"].sideEffect).toBe("read");
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

  test("writes use the documented method and path and a 404 delete is upstream", async () => {
    const token = "not-a-token";
    const calls: string[] = [];
    const fetchOf = (status: number, body?: unknown) => async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${String(input)} ${String(init?.body ?? "")}`);
      if (body === undefined) return empty(status);
      return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    };
    const branch = { owner: "acme", repo: "app", branch: "main" };

    const removed = await removeCodespaceSecretRepository({
      accessToken: token, secretName: "BUILD", repositoryId: 42, fetch: fetchOf(204),
    });
    expect(calls.at(-1)).toBe("DELETE https://api.github.com/user/codespaces/secrets/BUILD/repositories/42 ");
    expect(removed.removed).toBe(true);
    await expect(removeCodespaceSecretRepository({
      accessToken: token, secretName: "BUILD", repositoryId: 42, fetch: fetchOf(404),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const set = await setCodespaceSecretRepositories({
      accessToken: token, secretName: "BUILD", selectedRepositoryIds: [42], fetch: fetchOf(204),
    });
    expect(calls.at(-1)).toContain("PUT https://api.github.com/user/codespaces/secrets/BUILD/repositories");
    expect(calls.at(-1)).toContain(JSON.stringify({ selected_repository_ids: [42] }));
    expect(set.set).toBe(true);
    await expect(setCodespaceSecretRepositories({
      accessToken: token, secretName: "BUILD", selectedRepositoryIds: [42], fetch: fetchOf(404),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const apps = await addBranchProtectionRestrictionApps({
      accessToken: token, ...branch, apps: ["octoapp"], fetch: fetchOf(200, [{ slug: "octoapp" }]),
    });
    expect(calls.at(-1)).toContain("POST https://api.github.com/repos/acme/app/branches/main/protection/restrictions/apps");
    expect(calls.at(-1)).toContain(JSON.stringify({ apps: ["octoapp"] }));
    expect(apps.apps).toHaveLength(1);

    const contexts = await addBranchProtectionStatusCheckContexts({
      accessToken: token, ...branch, contexts: ["ci/test"], fetch: fetchOf(200, ["ci/test"]),
    });
    expect(calls.at(-1)).toContain("POST https://api.github.com/repos/acme/app/branches/main/protection/required_status_checks/contexts");
    expect(calls.at(-1)).toContain(JSON.stringify({ contexts: ["ci/test"] }));
    expect(contexts.contexts).toEqual(["ci/test"]);

    const teams = await addBranchProtectionRestrictionTeams({
      accessToken: token, ...branch, teams: ["justice-league"], fetch: fetchOf(200, [{ slug: "justice-league" }]),
    });
    expect(calls.at(-1)).toContain("POST https://api.github.com/repos/acme/app/branches/main/protection/restrictions/teams");
    expect(calls.at(-1)).toContain(JSON.stringify({ teams: ["justice-league"] }));
    expect(teams.teams).toHaveLength(1);

    const users = await addBranchProtectionRestrictionUsers({
      accessToken: token, ...branch, users: ["octocat"], fetch: fetchOf(200, [{ login: "octocat" }]),
    });
    expect(calls.at(-1)).toContain("POST https://api.github.com/repos/acme/app/branches/main/protection/restrictions/users");
    expect(calls.at(-1)).toContain(JSON.stringify({ users: ["octocat"] }));
    expect(users.users).toHaveLength(1);

    const created = await createBranchProtectionRequiredSignatures({
      accessToken: token, ...branch, fetch: fetchOf(200, { url: "https://api.github.com/example", enabled: true }),
    });
    expect(calls.at(-1)).toBe("POST https://api.github.com/repos/acme/app/branches/main/protection/required_signatures ");
    expect(created.protection).toMatchObject({ enabled: true });
    await expect(createBranchProtectionRequiredSignatures({
      accessToken: token, ...branch, fetch: fetchOf(404),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const restrictions = await deleteBranchProtectionRestrictions({
      accessToken: token, ...branch, fetch: fetchOf(204),
    });
    expect(calls.at(-1)).toBe("DELETE https://api.github.com/repos/acme/app/branches/main/protection/restrictions ");
    expect(restrictions.deleted).toBe(true);
    await expect(deleteBranchProtectionRestrictions({
      accessToken: token, ...branch, fetch: fetchOf(404),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const admins = await deleteBranchProtectionEnforceAdmins({
      accessToken: token, ...branch, fetch: fetchOf(204),
    });
    expect(calls.at(-1)).toBe("DELETE https://api.github.com/repos/acme/app/branches/main/protection/enforce_admins ");
    expect(admins.deleted).toBe(true);
    await expect(deleteBranchProtectionEnforceAdmins({
      accessToken: token, ...branch, fetch: fetchOf(404),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const protection = await deleteBranchProtection({
      accessToken: token, ...branch, fetch: fetchOf(204),
    });
    expect(calls.at(-1)).toBe("DELETE https://api.github.com/repos/acme/app/branches/main/protection ");
    expect(protection.deleted).toBe(true);
    await expect(deleteBranchProtection({
      accessToken: token, ...branch, fetch: fetchOf(404),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const signatures = await deleteBranchProtectionRequiredSignatures({
      accessToken: token, ...branch, fetch: fetchOf(204),
    });
    expect(calls.at(-1)).toBe("DELETE https://api.github.com/repos/acme/app/branches/main/protection/required_signatures ");
    expect(signatures.deleted).toBe(true);
    await expect(deleteBranchProtectionRequiredSignatures({
      accessToken: token, ...branch, fetch: fetchOf(404),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const reviews = await deleteBranchProtectionRequiredPullRequestReviews({
      accessToken: token, ...branch, fetch: fetchOf(204),
    });
    expect(calls.at(-1)).toBe("DELETE https://api.github.com/repos/acme/app/branches/main/protection/required_pull_request_reviews ");
    expect(reviews.deleted).toBe(true);
    await expect(deleteBranchProtectionRequiredPullRequestReviews({
      accessToken: token, ...branch, fetch: fetchOf(404),
    })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});
