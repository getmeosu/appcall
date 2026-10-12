import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import manifest from "../manifest.json";
import * as actions from "../src/actions";
import { isDotSegment, rejectDotComponents, requireSingleSegment } from "../src/path_segment";

// FIX-SEGMENT: one shared path-segment validator (src/path_segment.ts, wrapping
// _shared/jobboard.ts assertSafePathSegment) replaces every local requireSingleSegment /
// segment copy. "." and ".." are rejected before any HTTP call; slash-allowed values
// (branch, environmentName, packageName) reject "."/".." components. Recorders only.

type Case = { family: string; fn: string; op: string; field: string; input: Record<string, unknown> };

// One representative op per call-site family (every src file that had a local copy).
const SINGLE: Case[] = [
  { family: "card10_reads", fn: "listOrgHooks", op: "orgs.hooks.list", field: "org", input: {"org": ".."} },
  { family: "card11_reads", fn: "listOrgRunnerDownloads", op: "orgs.actions.runners.downloads.list", field: "org", input: {"org": ".."} },
  { family: "card12_reads", fn: "checkGistStar", op: "gists.star.check", field: "gistId", input: {"gistId": ".."} },
  { family: "card13_reads", fn: "listIssueSubIssues", op: "issues.sub_issues.list", field: "owner", input: {"owner": "..", "repo": "x", "issueNumber": 1} },
  { family: "card14_reads", fn: "getLicense", op: "licenses.get", field: "license", input: {"license": ".."} },
  { family: "card16_reads", fn: "getRepoPagesBuild", op: "repos.pages.builds.get", field: "owner", input: {"owner": "..", "repo": "x", "buildId": 1} },
  { family: "card17_reads", fn: "listRepoComments", op: "repos.comments.list", field: "owner", input: {"owner": "..", "repo": "x"} },
  { family: "card18_reads", fn: "listRepoPullComments", op: "repos.pulls.comments.list", field: "owner", input: {"owner": "..", "repo": "x"} },
  { family: "card19_reads", fn: "getRepoDependencyGraphSbom", op: "repos.dependency_graph.sbom.get", field: "owner", input: {"owner": "..", "repo": "x"} },
  { family: "card3_reads", fn: "listOrgRoleUsers", op: "orgs.organization_roles.users.list", field: "org", input: {"org": "..", "role_id": 1} },
  { family: "card5_reads", fn: "listRepoEnvironmentSecrets", op: "repos.environments.secrets.list", field: "owner", input: {"owner": "..", "repo": "x", "environmentName": "x"} },
  { family: "card6_reads", fn: "getCodeOfConduct", op: "codes_of_conduct.get", field: "key", input: {"key": ".."} },
  { family: "card7_reads", fn: "listRepoForks", op: "repos.forks.list", field: "owner", input: {"owner": "..", "repo": "x"} },
  { family: "card8_reads", fn: "getApp", op: "apps.get", field: "appSlug", input: {"appSlug": ".."} },
  { family: "card9_reads", fn: "getUserPackageVersion", op: "users.packages.versions.get", field: "username", input: {"username": "..", "packageType": "x", "packageName": "x", "packageVersionId": 1} },
  { family: "gap_g1", fn: "checkAuthenticatedUserFollowing", op: "user.following.check", field: "username", input: {"username": ".."} },
  { family: "gap_g10", fn: "getRepoDependabotSecretsPublicKey", op: "dependabot.secrets.public_key.get", field: "owner", input: {"owner": "..", "repo": "x"} },
  { family: "gap_g2", fn: "listOrgPropertySchemas", op: "orgs.properties.schema.list", field: "org", input: {"org": ".."} },
  { family: "gap_g3", fn: "listOrgActionsCacheUsageByRepository", op: "orgs.actions.cache.usage_by_repository.list", field: "org", input: {"org": ".."} },
  { family: "gap_g4", fn: "getRepoActionsSecretsPublicKey", op: "actions.secrets.public_key.get", field: "owner", input: {"owner": "..", "repo": "x"} },
  { family: "gap_g5", fn: "getUserCodespace", op: "user.codespaces.get", field: "codespaceName", input: {"codespaceName": ".."} },
  { family: "gap_g6", fn: "addOrgRunnerLabels", op: "orgs.actions.runners.labels.add", field: "org", input: {"org": "..", "runnerId": 1, "labels": ["x"]} },
  { family: "gap_g7", fn: "setOrgOidcCustomizationSub", op: "orgs.actions.oidc.customization.sub.set", field: "org", input: {"org": "..", "includeClaimKeys": ["x"]} },
  { family: "gap_g8", fn: "deleteUserCodespace", op: "user.codespaces.delete", field: "codespaceName", input: {"codespaceName": ".."} },
  { family: "gap_g9", fn: "updatePagesSite", op: "repos.pages.update", field: "owner", input: {"owner": "..", "repo": "x"} },
  { family: "orgs_reads", fn: "checkOrgBlock", op: "orgs.blocks.check", field: "org", input: {"org": "..", "username": "x"} },
  { family: "repos_reads", fn: "getRepoAutolink", op: "repos.autolinks.get", field: "owner", input: {"owner": "..", "repo": "x", "autolink_id": 1} },
  { family: "traffic", fn: "listRepoStatsContributors", op: "repos.stats.contributors.list", field: "owner", input: {"owner": "..", "repo": "x"} },
  { family: "write_card1", fn: "assignOrgRoleToUser", op: "orgs.organization_roles.users.assign", field: "org", input: {"org": "..", "username": "x", "roleId": 1} },
  { family: "write_card10", fn: "createOrgHook", op: "orgs.hooks.create", field: "org", input: {"org": "..", "url": "x", "events": ["x"]} },
  { family: "write_card11", fn: "deletePullReviewCommentReaction", op: "pull_requests.review_comments.reactions.delete", field: "owner", input: {"owner": "..", "repo": "x", "commentId": 1, "reactionId": 1} },
  { family: "write_card12", fn: "unfollowUser", op: "user.following.unfollow", field: "username", input: {"username": ".."} },
  { family: "write_card13", fn: "addSubIssue", op: "issues.sub_issues.add", field: "owner", input: {"owner": "..", "repo": "x", "issueNumber": 1, "subIssueId": 1} },
  { family: "write_card14", fn: "addOrgVariableRepository", op: "actions.org_variables.repositories.add", field: "org", input: {"org": "..", "name": "x", "repositoryId": 1} },
  { family: "write_card15", fn: "createSecurityAdvisoryReport", op: "repos.security_advisories.reports.create", field: "owner", input: {"owner": "..", "repo": "x", "summary": "x", "description": "x"} },
  { family: "write_card16", fn: "deleteReleaseAsset", op: "releases.assets.delete", field: "owner", input: {"owner": "..", "repo": "x", "assetId": 1} },
  { family: "write_card17", fn: "createUserProjectField", op: "users.projects_v2.fields.create", field: "username", input: {"username": "..", "projectNumber": 1, "name": "x", "dataType": "text"} },
  { family: "write_card2", fn: "createRepoAutolink", op: "repos.autolinks.create", field: "owner", input: {"owner": "..", "repo": "x", "keyPrefix": "x", "urlTemplate": "x"} },
  { family: "write_card3", fn: "blockUser", op: "user.blocks.block", field: "username", input: {"username": ".."} },
  { family: "write_card4", fn: "removeCodespaceSecretRepository", op: "user.codespaces.secrets.repositories.remove", field: "secretName", input: {"secretName": "..", "repositoryId": 1} },
  { family: "write_card5", fn: "deleteEnvironmentDeploymentProtectionRule", op: "repos.environments.deployment_protection_rules.delete", field: "owner", input: {"owner": "..", "repo": "x", "environmentName": "x", "protectionRuleId": 1} },
  { family: "write_card6", fn: "deleteUserProjectItem", op: "users.projects_v2.items.delete", field: "username", input: {"username": "..", "projectNumber": 1, "itemId": 1} },
  { family: "write_card7", fn: "deleteMilestone", op: "milestones.delete", field: "owner", input: {"owner": "..", "repo": "x", "milestoneNumber": 1} },
  { family: "write_card8", fn: "deleteOrgPackageVersion", op: "orgs.packages.versions.delete", field: "org", input: {"org": "..", "packageType": "npm", "packageName": "x", "packageVersionId": 1} },
  { family: "write_card9", fn: "restoreOrgPackageVersion", op: "orgs.packages.versions.restore", field: "org", input: {"org": "..", "packageType": "npm", "packageName": "x", "packageVersionId": 1} },
];

// Slash-allowed path values: branch (gap_g2 branchSegment, write_card4/5), environmentName
// (write_card3/5), packageName (write_card8/9/17).
const SLASHED: Case[] = [
  { family: "gap_g2", fn: "listBranchProtectionRestrictionApps", op: "branches.protection.restrictions.apps.list", field: "branch", input: {"owner": "x", "repo": "x", "branch": "a/../b"} },
  { family: "write_card17", fn: "deleteUserPackage", op: "users.packages.delete", field: "packageName", input: {"username": "x", "packageType": "npm", "packageName": "a/../b"} },
  { family: "write_card3", fn: "upsertEnvironmentSecret", op: "repos.environments.secrets.create_or_update", field: "environmentName", input: {"owner": "x", "repo": "x", "environmentName": "a/../b", "secretName": "x", "encryptedValue": "x", "keyId": "x"} },
  { family: "write_card4", fn: "addBranchProtectionRestrictionApps", op: "branches.protection.restrictions.apps.add", field: "branch", input: {"owner": "x", "repo": "x", "branch": "a/../b", "apps": ["x"]} },
  { family: "write_card5", fn: "deleteEnvironmentDeploymentProtectionRule", op: "repos.environments.deployment_protection_rules.delete", field: "environmentName", input: {"owner": "x", "repo": "x", "environmentName": "a/../b", "protectionRuleId": 1} },
  { family: "write_card8", fn: "deleteAuthenticatedPackageVersion", op: "user.packages.versions.delete", field: "packageName", input: {"packageType": "npm", "packageName": "a/../b", "packageVersionId": 1} },
  { family: "write_card9", fn: "restoreAuthenticatedPackageVersion", op: "user.packages.versions.restore", field: "packageName", input: {"packageType": "npm", "packageName": "a/../b", "packageVersionId": 1} },
];

function noFetch() {
  let calls = 0;
  const fetch = async () => {
    calls++;
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  };
  return { fetch, calls: () => calls };
}

async function run(fn: string, input: Record<string, unknown>) {
  const nf = noFetch();
  const error = await Promise.resolve()
    .then(() => (actions as unknown as Record<string, (i: unknown) => unknown>)[fn]!({ ...input, accessToken: "tok", fetch: nf.fetch }))
    .then(() => null, (e: unknown) => e);
  return { error: error as Error | null, calls: nf.calls() };
}

describe("github FIX-SEGMENT: manifest", () => {
  test("PRUNE-3 bump to 0.84.0 at 867 ops", () => {
    expect(manifest.version).toBe("0.84.0");
    expect(Object.keys(manifest.operations)).toHaveLength(867);
  });
});

describe("github FIX-SEGMENT: shared helper", () => {
  test("requireSingleSegment keeps the old messages and accepts ordinary segments", () => {
    expect(requireSingleSegment("octo-cat_1.x", "owner")).toBe("octo-cat_1.x");
    expect(requireSingleSegment("label with spaces", "name")).toBe("label with spaces");
    expect(requireSingleSegment(".github", "repo")).toBe(".github");
    expect(requireSingleSegment("a..b", "repo")).toBe("a..b");
    expect(() => requireSingleSegment("", "owner")).toThrow("owner is required");
    expect(() => requireSingleSegment(undefined, "owner")).toThrow("owner is required");
    expect(() => requireSingleSegment(7, "owner")).toThrow("owner is required");
    for (const bad of ["a/b", "a?b", "a#b", "a\\b"]) expect(() => requireSingleSegment(bad, "repo")).toThrow("repo must be a single path segment");
  });

  test("requireSingleSegment rejects dot segments, including percent-encoded forms", () => {
    for (const bad of [".", "..", "...", "%2e", "%2E%2e", ".%2e", "%2e."]) {
      expect(isDotSegment(bad)).toBe(true);
      expect(() => requireSingleSegment(bad, "owner")).toThrow("owner must not be a dot segment");
    }
    expect(isDotSegment(".a")).toBe(false);
  });

  test("rejectDotComponents: slash-separated values keep slashes and empty components, reject dot components", () => {
    expect(rejectDotComponents("feature/x.y", "branch")).toBe("feature/x.y");
    expect(rejectDotComponents("a//b", "branch")).toBe("a//b");
    expect(rejectDotComponents("release/v1..2", "branch")).toBe("release/v1..2");
    for (const bad of ["..", ".", "a/../b", "a/./b", "../x", "x/..", "a/%2e%2e/b"]) {
      expect(() => rejectDotComponents(bad, "branch")).toThrow('branch must not contain "." or ".." path segments');
    }
    expect(() => rejectDotComponents("a\\..", "branch")).toThrow("branch must not contain a backslash");
  });
});

describe("github FIX-SEGMENT: every call-site family rejects dot segments before HTTP", () => {
  test("covers all 45 families", () => {
    // PRUNE-3 (0.84.0) deleted src/gap_g12.ts (its last ops, Classroom and team discussions, are gone): 46 -> 45.
    expect(new Set(SINGLE.map((c) => c.family)).size).toBe(SINGLE.length);
    expect(SINGLE.length).toBe(45);
  });
  for (const c of SINGLE) {
    for (const bad of ["..", "."]) {
      test(`${c.family}: ${c.op} ${c.field}=${JSON.stringify(bad)} -> validation error, zero fetches`, async () => {
        const { error, calls } = await run(c.fn, { ...c.input, [c.field]: bad });
        expect(calls).toBe(0);
        expect(error).toBeInstanceOf(Error);
        expect(error!.message).toMatch(/^\w+ must not be a dot segment$/);
      });
    }
  }
});

describe("github FIX-SEGMENT: slash-allowed branch / environment / package values", () => {
  for (const c of SLASHED) {
    for (const bad of ["..", ".", "a/../b"]) {
      test(`${c.family}: ${c.op} ${c.field}=${JSON.stringify(bad)} -> validation error, zero fetches`, async () => {
        const { error, calls } = await run(c.fn, { ...c.input, [c.field]: bad });
        expect(calls).toBe(0);
        expect(error).toBeInstanceOf(Error);
        expect(error!.message).toContain(`${c.field} must not contain "." or ".." path segments`);
      });
    }
  }

  test("branch names with slashes still reach HTTP encoded (gap_g2 branchSegment unchanged for valid names)", async () => {
    const seen: string[] = [];
    const fetch = async (url: string | URL | Request) => {
      seen.push(String(url));
      return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
    };
    const c = SLASHED.find((x) => x.family === "gap_g2")!;
    await Promise.resolve((actions as unknown as Record<string, (i: unknown) => unknown>)[c.fn]!({ ...c.input, branch: "feature/a.b", accessToken: "tok", fetch })).catch(() => null);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[0]).toContain("/branches/feature%2Fa.b/");
  });
});

describe("github FIX-SEGMENT: guard", () => {
  test("no local requireSingleSegment / segment copy reappears in github src", () => {
    const dir = join(import.meta.dir, "..", "src");
    const offenders: string[] = [];
    for (const name of readdirSync(dir)) {
      if (!name.endsWith(".ts") || name === "path_segment.ts") continue;
      const text = readFileSync(join(dir, name), "utf8");
      if (/(?:^|\n)\s*(?:export\s+)?(?:function\s+(?:requireSingleSegment|segment)\s*\(|const\s+(?:requireSingleSegment|segment)\s*=)/.test(text)) offenders.push(name);
    }
    expect(offenders).toEqual([]);
  });

  test("path_segment.ts wraps the shared assertSafePathSegment", () => {
    const text = readFileSync(join(import.meta.dir, "..", "src", "path_segment.ts"), "utf8");
    expect(text).toContain('import { assertSafePathSegment } from "../../_shared/jobboard";');
  });
});
