import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import {
  getBranchProtectionEnforceAdmins,
  getBranchProtectionRequiredSignatures,
  getBranchProtectionRestrictions,
  getEnvironmentDeploymentProtectionRule,
  getRequiredPullRequestReviews,
  getRequiredStatusChecks,
  listBranchProtectionRestrictionTeams,
  listBranchProtectionRestrictionUsers,
  listRepoEnvironmentSecrets,
  listRepoOrganizationSecrets,
  listUserCodespacesSecretRepositories,
  listUserCodespacesSecrets,
  listUserProjectFields,
} from "../src/actions";
import { validateListRepoEnvironmentSecretsInput } from "../src/card5_reads";

const READS = [
  "repos.environments.secrets.list",
  "actions.organization_secrets.list",
  "user.codespaces.secrets.list",
  "user.codespaces.secrets.repositories.list",
  "branches.protection.restrictions.get",
  "branches.protection.enforce_admins.get",
  "branches.protection.required_signatures.get",
  "environments.deployment_protection_rules.get",
  "branches.protection.required_pull_request_reviews.get",
  "branches.protection.required_status_checks.get",
  "branches.protection.restrictions.teams.list",
  "branches.protection.restrictions.users.list",
  "users.projects_v2.fields.list",
] as const;

const SECRET_LISTS = [
  "repos.environments.secrets.list",
  "actions.organization_secrets.list",
  "user.codespaces.secrets.list",
] as const;

const secret = { name: "DEPLOY", created_at: "2020-01-01T00:00:00Z", updated_at: "2020-02-01T00:00:00Z", value: "nope", visibility: "selected" };
const user = { id: 1, login: "octocat", html_url: "https://github.com/octocat", type: "User" };
const team = { id: 2, name: "owners", slug: "owners", html_url: "https://github.com/orgs/acme/teams/owners" };

describe("github card5 secret, protection, and project field reads", () => {
  test("version is 0.45.0 and the 13 reads omit effect fields", () => {
    expect(manifest.version).toBe("0.45.0");
    expect(manifest.version).not.toBe("0.32.0");
    expect(READS).toHaveLength(13);
    expect(Object.keys(manifest.operations)).toHaveLength(443);
    for (const key of READS) {
      const op = manifest.operations[key] as Record<string, unknown>;
      expect(op.kind).toBe("action");
      expect(op.sideEffect).toBe("read");
      expect(op.effectPolicy).toBeUndefined();
      expect(op.reconcile).toBeUndefined();
      expect(op.observe).toBeUndefined();
    }
    for (const key of SECRET_LISTS) {
      const op = manifest.operations[key] as { outputSchema: { properties: { secrets: { items: { properties: Record<string, unknown> } } } } };
      const props = op.outputSchema.properties.secrets.items.properties;
      expect(Object.keys(props).sort()).toEqual(["created_at", "name", "updated_at"]);
      expect(props.value).toBeUndefined();
      expect(props.encrypted_value).toBeUndefined();
      expect(props.visibility).toBeUndefined();
    }
    const repos = manifest.operations["user.codespaces.secrets.repositories.list"] as {
      outputSchema: { properties: { repositories: { items: { properties: Record<string, unknown> } } } };
    };
    expect(repos.outputSchema.properties.repositories.items.properties.value).toBeUndefined();
  });

  test("validates environment names that contain slashes and page bounds", () => {
    expect(validateListRepoEnvironmentSecretsInput({ owner: "acme", repo: "app", environmentName: "prod/us", perPage: 30, page: 2 })).toEqual({
      owner: "acme", repo: "app", environmentName: "prod/us", perPage: 30, page: 2,
    });
    expect(() => validateListRepoEnvironmentSecretsInput({ owner: "ac/me", repo: "app", environmentName: "prod" })).toThrow(/single path segment/);
    expect(() => validateListRepoEnvironmentSecretsInput({ owner: "acme", repo: "app", environmentName: "prod", perPage: 101 })).toThrow(/perPage/);
  });

  test("reads the documented paths and keeps secret items to name and timestamps", async () => {
    const seen: string[] = [];
    const fetch = async (input: string | URL) => {
      const url = String(input);
      seen.push(url);
      if (url.includes("/environments/prod%2Fus/secrets")) return json({ total_count: 1, secrets: [secret] });
      if (url.includes("/actions/organization-secrets")) return json({ total_count: 1, secrets: [secret] });
      if (url.endsWith("/user/codespaces/secrets?per_page=10")) return json({ total_count: 1, secrets: [secret] });
      if (url.includes("/user/codespaces/secrets/DEPLOY/repositories")) {
        return json({ total_count: 1, repositories: [{ id: 9, name: "app", full_name: "acme/app", private: true, html_url: "https://github.com/acme/app", value: "nope" }] });
      }
      if (url.endsWith("/protection/restrictions")) {
        return json({ users: [user], teams: [team], apps: [{ id: 3, slug: "ci", node_id: "A", name: "CI" }] });
      }
      if (url.endsWith("/protection/enforce_admins")) return json({ url: "https://api.github.com/enforce", enabled: true });
      if (url.endsWith("/protection/required_signatures")) return json({ url: "https://api.github.com/sign", enabled: false });
      if (url.includes("/deployment_protection_rules/7")) {
        return json({ id: 7, node_id: "R", enabled: true, app: { id: 3, slug: "ci", node_id: "A", integration_url: "https://api.github.com/apps/ci" } });
      }
      if (url.endsWith("/protection/required_pull_request_reviews")) {
        return json({ url: "https://api.github.com/reviews", dismiss_stale_reviews: true, require_code_owner_reviews: false, required_approving_review_count: 2, require_last_push_approval: true });
      }
      if (url.endsWith("/protection/required_status_checks")) {
        return json({ url: "https://api.github.com/checks", strict: true, contexts: ["ci"], checks: [{ context: "ci", app_id: 3 }] });
      }
      if (url.includes("/restrictions/teams")) return json([team]);
      if (url.includes("/restrictions/users")) return json([user]);
      if (url.includes("/projectsV2/4/fields")) {
        return json([{ id: 8, node_id: "F", name: "Status", data_type: "single_select", project_url: "https://github.com/users/octocat/projects/4" }]);
      }
      return new Response("{}", { status: 500 });
    };
    const token = { accessToken: "t", fetch };
    const envSecrets = await listRepoEnvironmentSecrets({ ...token, owner: "acme", repo: "app", environmentName: "prod/us", page: 1 });
    expect(envSecrets.secrets).toEqual([{ name: "DEPLOY", created_at: "2020-01-01T00:00:00Z", updated_at: "2020-02-01T00:00:00Z" }]);
    expect(JSON.stringify(envSecrets.secrets)).not.toContain("nope");
    const orgSecrets = await listRepoOrganizationSecrets({ ...token, owner: "acme", repo: "app" });
    expect(orgSecrets.total_count).toBe(1);
    expect((orgSecrets.secrets as Array<Record<string, unknown>>)[0].value).toBeUndefined();
    const codes = await listUserCodespacesSecrets({ ...token, perPage: 10 });
    expect((codes.secrets as Array<Record<string, unknown>>)[0].visibility).toBeUndefined();
    const selected = await listUserCodespacesSecretRepositories({ ...token, secretName: "DEPLOY" });
    expect(selected.repositories).toEqual([{ id: 9, name: "app", full_name: "acme/app", private: true, html_url: "https://github.com/acme/app" }]);
    const restrictions = await getBranchProtectionRestrictions({ ...token, owner: "acme", repo: "app", branch: "main", perPage: 5, page: 1 });
    expect(restrictions.users[0].login).toBe("octocat");
    expect(restrictions.teams[0].slug).toBe("owners");
    expect(restrictions.apps[0].slug).toBe("ci");
    expect((await getBranchProtectionEnforceAdmins({ ...token, owner: "acme", repo: "app", branch: "main" })).enabled).toBe(true);
    expect((await getBranchProtectionRequiredSignatures({ ...token, owner: "acme", repo: "app", branch: "main" })).enabled).toBe(false);
    const rule = await getEnvironmentDeploymentProtectionRule({ ...token, owner: "acme", repo: "app", environmentName: "prod/us", protectionRuleId: 7 });
    expect(rule.rule.app.slug).toBe("ci");
    expect((await getRequiredPullRequestReviews({ ...token, owner: "acme", repo: "app", branch: "main" })).reviews.required_approving_review_count).toBe(2);
    expect((await getRequiredStatusChecks({ ...token, owner: "acme", repo: "app", branch: "main" })).checks.contexts).toEqual(["ci"]);
    expect((await listBranchProtectionRestrictionTeams({ ...token, owner: "acme", repo: "app", branch: "main" })).teams).toHaveLength(1);
    expect((await listBranchProtectionRestrictionUsers({ ...token, owner: "acme", repo: "app", branch: "main" })).users).toHaveLength(1);
    const fields = await listUserProjectFields({ ...token, username: "octo cat", projectNumber: 4, page: 2 });
    expect(fields.fields[0].data_type).toBe("single_select");
    expect(seen).toEqual([
      "https://api.github.com/repos/acme/app/environments/prod%2Fus/secrets?page=1",
      "https://api.github.com/repos/acme/app/actions/organization-secrets",
      "https://api.github.com/user/codespaces/secrets?per_page=10",
      "https://api.github.com/user/codespaces/secrets/DEPLOY/repositories",
      "https://api.github.com/repos/acme/app/branches/main/protection/restrictions",
      "https://api.github.com/repos/acme/app/branches/main/protection/enforce_admins",
      "https://api.github.com/repos/acme/app/branches/main/protection/required_signatures",
      "https://api.github.com/repos/acme/app/environments/prod%2Fus/deployment_protection_rules/7",
      "https://api.github.com/repos/acme/app/branches/main/protection/required_pull_request_reviews",
      "https://api.github.com/repos/acme/app/branches/main/protection/required_status_checks",
      "https://api.github.com/repos/acme/app/branches/main/protection/restrictions/teams",
      "https://api.github.com/repos/acme/app/branches/main/protection/restrictions/users",
      "https://api.github.com/users/octo%20cat/projectsV2/4/fields?page=2",
    ]);
  });

  test("404 is CONNECTOR_UPSTREAM_ERROR and not an empty success", async () => {
    const fetch = async () => new Response("{}", { status: 404 });
    await expect(listRepoEnvironmentSecrets({ accessToken: "t", owner: "acme", repo: "app", environmentName: "prod", fetch })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(listUserProjectFields({ accessToken: "t", username: "octocat", projectNumber: 1, fetch })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(getRequiredStatusChecks({ accessToken: "t", owner: "acme", repo: "app", branch: "main", fetch })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("a 202 is not an empty success", async () => {
    const fetch = async () => new Response("", { status: 202 });
    await expect(listUserCodespacesSecrets({ accessToken: "t", fetch })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("redirects are not followed", async () => {
    let calls = 0;
    const fetch = async (_input: string | URL, init?: RequestInit) => {
      calls += 1;
      expect(init?.redirect).toBe("manual");
      return new Response(JSON.stringify({ secrets: [{ name: "LEAKED", created_at: "x", updated_at: "y", value: "secret" }] }), {
        status: 302,
        headers: { Location: "https://api.github.com/user/codespaces/secrets" },
      });
    };
    await expect(listUserCodespacesSecrets({ accessToken: "t", fetch })).rejects.toMatchObject({ code: "OUTBOUND_REDIRECT_BLOCKED" });
    expect(calls).toBe(1);
  });

  test("validation-only path does not fetch", () => {
    const validated = listRepoOrganizationSecrets({ owner: "acme", repo: "app", perPage: 20 });
    expect(validated.validated).toEqual({ owner: "acme", repo: "app", perPage: 20 });
  });
});

function json(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}
