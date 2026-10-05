import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import {
  convertOutsideCollaborator,
  createOrgIssueType,
  deleteOrgPackage,
  getOrgActionsSecret,
  getOrgActionsSecretsPublicKey,
  getOrgOidcCustomizationSub,
  getOrgSelectedActions,
  getPrivateVulnerabilityReporting,
  listOrgActionsCacheUsageByRepository,
  listOrgActionsPermissionsRepositories,
  listOrgActionsSecretRepositories,
  listOrgActionsSecrets,
  removeOrgCodespacesAccessSelectedUsers,
  setOrgSelectedActions,
  updateOrgIssueType,
} from "../src/actions";
import {
  validateConvertOutsideCollaboratorInput,
  validateCreateOrgIssueTypeInput,
  validateDeleteOrgPackageInput,
  validateSetOrgSelectedActionsInput,
  validateUpdateOrgIssueTypeInput,
} from "../src/gap_g3";

const PATHS: Record<string, { methodPath: string; sideEffect: "read" | "write" }> = {
  "orgs.actions.cache.usage_by_repository.list": { methodPath: "GET /orgs/{org}/actions/cache/usage-by-repository", sideEffect: "read" },
  "orgs.actions.permissions.selected_actions.get": { methodPath: "GET /orgs/{org}/actions/permissions/selected-actions", sideEffect: "read" },
  "orgs.actions.permissions.selected_actions.set": { methodPath: "PUT /orgs/{org}/actions/permissions/selected-actions", sideEffect: "write" },
  "orgs.outside_collaborators.convert": { methodPath: "PUT /orgs/{org}/outside_collaborators/{username}", sideEffect: "write" },
  "orgs.issue_types.create": { methodPath: "POST /orgs/{org}/issue-types", sideEffect: "write" },
  "orgs.issue_types.update": { methodPath: "PUT /orgs/{org}/issue-types/{issue_type_id}", sideEffect: "write" },
  "orgs.packages.delete": { methodPath: "DELETE /orgs/{org}/packages/{package_type}/{package_name}", sideEffect: "write" },
  "orgs.codespaces.access.selected_users.remove": { methodPath: "DELETE /orgs/{org}/codespaces/access/selected_users", sideEffect: "write" },
  "repos.private_vulnerability_reporting.get": { methodPath: "GET /repos/{owner}/{repo}/private-vulnerability-reporting", sideEffect: "read" },
  "actions.org_secrets.list": { methodPath: "GET /orgs/{org}/actions/secrets", sideEffect: "read" },
  "actions.org_secrets.public_key.get": { methodPath: "GET /orgs/{org}/actions/secrets/public-key", sideEffect: "read" },
  "actions.org_secrets.get": { methodPath: "GET /orgs/{org}/actions/secrets/{secret_name}", sideEffect: "read" },
  "actions.org_secrets.repositories.list": { methodPath: "GET /orgs/{org}/actions/secrets/{secret_name}/repositories", sideEffect: "read" },
  "orgs.actions.permissions.repositories.list": { methodPath: "GET /orgs/{org}/actions/permissions/repositories", sideEffect: "read" },
  "orgs.actions.oidc.customization.sub.get": { methodPath: "GET /orgs/{org}/actions/oidc/customization/sub", sideEffect: "read" },
};

type Seen = { url: string; method: string; body?: string; auth?: string };

function recorder(responses: Response[] | (() => Response)) {
  const seen: Seen[] = [];
  let i = 0;
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    seen.push({ url: String(input), method: init?.method ?? "GET", body: init?.body as string | undefined, auth: headers.Authorization });
    if (typeof responses === "function") return responses();
    return responses[i++];
  };
  return { seen, fetch };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function empty(status: number) {
  return new Response(null, { status });
}

describe("github gap G3 organization actions reads and writes", () => {
  test("version is 0.73.0 at 744 ops with the read/write breakdown", () => {
    expect(manifest.version).toBe("0.73.0");
    const ops = manifest.operations as Record<string, Record<string, unknown>>;
    expect(Object.keys(ops)).toHaveLength(744);
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
    expect(kinds).toEqual({ action: 694, sync: 4, webhook: 46 });
    expect(side).toEqual({ read: 373, write: 306, absent: 15 });
  });

  test("the fifteen G3 ops are present, omit all three effect keys, and document their paths", () => {
    const ops = manifest.operations as Record<string, Record<string, unknown>>;
    expect(Object.keys(PATHS)).toHaveLength(15);
    let reads = 0;
    let writes = 0;
    for (const [key, meta] of Object.entries(PATHS)) {
      const op = ops[key];
      expect(op).toBeDefined();
      expect(op.kind).toBe("action");
      expect(op.sideEffect).toBe(meta.sideEffect);
      expect(op.effectPolicy).toBeUndefined();
      expect(op.reconcile).toBeUndefined();
      expect(op.effect).toBeUndefined();
      expect(String(op.description)).toContain(meta.methodPath.split(" ")[1]);
      if (meta.sideEffect === "read") reads += 1;
      else writes += 1;
    }
    expect(reads).toBe(9);
    expect(writes).toBe(6);
    const schema = (key: string) => (ops[key].inputSchema as { properties: Record<string, { type: string }>; required?: string[] });
    expect(schema("orgs.issue_types.update").properties.issueTypeId.type).toBe("integer");
    expect(schema("orgs.actions.cache.usage_by_repository.list").properties.perPage.type).toBe("number");
    expect(schema("orgs.actions.cache.usage_by_repository.list").properties.page.type).toBe("number");
    expect(schema("actions.org_secrets.get").properties.secretName.type).toBe("string");
    expect(schema("orgs.actions.permissions.selected_actions.set").properties.githubOwnedAllowed.type).toBe("boolean");
    expect(schema("orgs.packages.delete").properties.packageType.type).toBe("string");
  });

  test("validators enforce integers, booleans, and package enums", () => {
    expect(validateSetOrgSelectedActionsInput({ org: "octo", githubOwnedAllowed: true, verifiedAllowed: false, patternsAllowed: ["a/b@*"] }))
      .toEqual({ org: "octo", githubOwnedAllowed: true, verifiedAllowed: false, patternsAllowed: ["a/b@*"] });
    expect(() => validateSetOrgSelectedActionsInput({ org: "octo", githubOwnedAllowed: "yes", verifiedAllowed: false })).toThrow(/githubOwnedAllowed/);
    expect(validateConvertOutsideCollaboratorInput({ org: "octo", username: "mona", async: true }))
      .toEqual({ org: "octo", username: "mona", async: true });
    expect(() => validateConvertOutsideCollaboratorInput({ org: "octo", username: "mona", async: "yes" })).toThrow(/async/);
    expect(validateCreateOrgIssueTypeInput({ org: "octo", name: "bug", isEnabled: true, color: "red" }))
      .toEqual({ org: "octo", name: "bug", isEnabled: true, color: "red" });
    expect(() => validateCreateOrgIssueTypeInput({ org: "octo", name: "bug", isEnabled: true, color: "neon" })).toThrow(/color/);
    expect(validateUpdateOrgIssueTypeInput({ org: "octo", issueTypeId: 9, name: "bug", isEnabled: false }))
      .toEqual({ org: "octo", issueTypeId: 9, name: "bug", isEnabled: false });
    expect(() => validateUpdateOrgIssueTypeInput({ org: "octo", issueTypeId: "9", name: "bug", isEnabled: false })).toThrow(/issueTypeId/);
    expect(validateDeleteOrgPackageInput({ org: "octo", packageType: "npm", packageName: "app" }))
      .toEqual({ org: "octo", packageType: "npm", packageName: "app" });
    expect(() => validateDeleteOrgPackageInput({ org: "octo", packageType: "rpm", packageName: "app" })).toThrow(/packageType/);
    expect(listOrgActionsSecrets({ org: "octo" })).toMatchObject({ action: "actions.org_secrets.list", validated: { org: "octo" } });
  });

  test("cache usage by repository, selected actions get/set, and private vulnerability reporting", async () => {
    const usage = recorder([json({ total_count: 1, repository_cache_usages: [{ full_name: "octo/r", active_caches_size_in_bytes: 10, active_caches_count: 2 }] })]);
    const usageResult = await listOrgActionsCacheUsageByRepository({ accessToken: "t", org: "octo", perPage: 10, page: 1, fetch: usage.fetch });
    expect(usage.seen[0]).toMatchObject({ url: "https://api.github.com/orgs/octo/actions/cache/usage-by-repository?per_page=10&page=1", method: "GET", auth: "Bearer t" });
    expect(usageResult.repositoryCacheUsages).toEqual([{ fullName: "octo/r", activeCachesSizeInBytes: 10, activeCachesCount: 2 }]);

    const getSel = recorder([json({ github_owned_allowed: true, verified_allowed: false, patterns_allowed: ["a/b@*"] })]);
    const getSelResult = await getOrgSelectedActions({ accessToken: "t", org: "octo", fetch: getSel.fetch });
    expect(getSel.seen[0].url).toBe("https://api.github.com/orgs/octo/actions/permissions/selected-actions");
    expect(getSelResult.selectedActions).toEqual({ githubOwnedAllowed: true, verifiedAllowed: false, patternsAllowed: ["a/b@*"] });

    const setSel = recorder([empty(204)]);
    const setSelResult = await setOrgSelectedActions({ accessToken: "t", org: "octo", githubOwnedAllowed: false, verifiedAllowed: true, patternsAllowed: ["x/y@*"], fetch: setSel.fetch });
    expect(setSel.seen[0]).toMatchObject({ url: "https://api.github.com/orgs/octo/actions/permissions/selected-actions", method: "PUT" });
    expect(JSON.parse(setSel.seen[0].body!)).toEqual({ github_owned_allowed: false, verified_allowed: true, patterns_allowed: ["x/y@*"] });
    expect(setSelResult.selectedActions).toEqual({ githubOwnedAllowed: false, verifiedAllowed: true, patternsAllowed: ["x/y@*"] });

    const pvr = recorder([json({ enabled: true })]);
    const pvrResult = await getPrivateVulnerabilityReporting({ accessToken: "t", owner: "o", repo: "r", fetch: pvr.fetch });
    expect(pvr.seen[0].url).toBe("https://api.github.com/repos/o/r/private-vulnerability-reporting");
    expect(pvrResult.enabled).toBe(true);
  });

  test("outside collaborator convert, issue types, packages delete, and codespaces access remove", async () => {
    const convert = recorder([empty(204)]);
    const convertResult = await convertOutsideCollaborator({ accessToken: "t", org: "octo", username: "mona", fetch: convert.fetch });
    expect(convert.seen[0]).toMatchObject({ url: "https://api.github.com/orgs/octo/outside_collaborators/mona", method: "PUT" });
    expect(convertResult).toMatchObject({ converted: true, pending: false, org: "octo", username: "mona" });

    const convertAsync = recorder([empty(202)]);
    const convertAsyncResult = await convertOutsideCollaborator({ accessToken: "t", org: "octo", username: "mona", async: true, fetch: convertAsync.fetch });
    expect(JSON.parse(convertAsync.seen[0].body!)).toEqual({ async: true });
    expect(convertAsyncResult).toMatchObject({ converted: true, pending: true });

    const created = recorder([json({ id: 3, node_id: "IT_3", name: "bug", description: "bugs", color: "red", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-02T00:00:00Z", is_enabled: true })]);
    const createResult = await createOrgIssueType({ accessToken: "t", org: "octo", name: "bug", isEnabled: true, description: "bugs", color: "red", fetch: created.fetch });
    expect(created.seen[0]).toMatchObject({ url: "https://api.github.com/orgs/octo/issue-types", method: "POST" });
    expect(JSON.parse(created.seen[0].body!)).toEqual({ name: "bug", is_enabled: true, description: "bugs", color: "red" });
    expect(createResult.issueType).toMatchObject({ id: 3, name: "bug", isEnabled: true, color: "red" });

    const updated = recorder([json({ id: 3, node_id: "IT_3", name: "defect", description: "", color: "orange", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-03T00:00:00Z", is_enabled: false })]);
    const updateResult = await updateOrgIssueType({ accessToken: "t", org: "octo", issueTypeId: 3, name: "defect", isEnabled: false, color: "orange", fetch: updated.fetch });
    expect(updated.seen[0].url).toBe("https://api.github.com/orgs/octo/issue-types/3");
    expect(updateResult.issueType).toMatchObject({ name: "defect", isEnabled: false, color: "orange" });

    const deleted = recorder([empty(204)]);
    const deleteResult = await deleteOrgPackage({ accessToken: "t", org: "octo", packageType: "npm", packageName: "@acme/app", fetch: deleted.fetch });
    expect(deleted.seen[0]).toMatchObject({ url: "https://api.github.com/orgs/octo/packages/npm/%40acme%2Fapp", method: "DELETE" });
    expect(deleteResult).toMatchObject({ deleted: true, org: "octo", packageType: "npm", packageName: "@acme/app" });

    const missing = recorder([empty(404)]);
    await expect(deleteOrgPackage({ accessToken: "t", org: "octo", packageType: "npm", packageName: "missing", fetch: missing.fetch }))
      .rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });

    const removed = recorder([empty(204)]);
    const removeResult = await removeOrgCodespacesAccessSelectedUsers({ accessToken: "t", org: "octo", selectedUsernames: ["mona", "hubot"], fetch: removed.fetch });
    expect(removed.seen[0]).toMatchObject({ url: "https://api.github.com/orgs/octo/codespaces/access/selected_users", method: "DELETE" });
    expect(JSON.parse(removed.seen[0].body!)).toEqual({ selected_usernames: ["mona", "hubot"] });
    expect(removeResult).toMatchObject({ removed: true, selectedUsernames: ["mona", "hubot"] });
  });

  test("organization Actions secrets and OIDC subject template", async () => {
    const list = recorder([json({ total_count: 1, secrets: [{ name: "NPM_TOKEN", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-02T00:00:00Z", visibility: "private" }] })]);
    const listResult = await listOrgActionsSecrets({ accessToken: "t", org: "octo", perPage: 5, page: 2, fetch: list.fetch });
    expect(list.seen[0].url).toBe("https://api.github.com/orgs/octo/actions/secrets?per_page=5&page=2");
    expect(listResult.secrets).toEqual([{ name: "NPM_TOKEN", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-02T00:00:00Z" }]);

    const key = recorder([json({ key_id: "123", key: "abc=" })]);
    const keyResult = await getOrgActionsSecretsPublicKey({ accessToken: "t", org: "octo", fetch: key.fetch });
    expect(key.seen[0].url).toBe("https://api.github.com/orgs/octo/actions/secrets/public-key");
    expect(keyResult.publicKey).toEqual({ keyId: "123", key: "abc=" });

    const one = recorder([json({ name: "NPM_TOKEN", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-02T00:00:00Z", visibility: "selected", selected_repositories_url: "https://api.github.com/orgs/octo/actions/secrets/NPM_TOKEN/repositories" })]);
    const oneResult = await getOrgActionsSecret({ accessToken: "t", org: "octo", secretName: "NPM_TOKEN", fetch: one.fetch });
    expect(one.seen[0].url).toBe("https://api.github.com/orgs/octo/actions/secrets/NPM_TOKEN");
    expect(oneResult.secret).toEqual({
      name: "NPM_TOKEN",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-02T00:00:00Z",
      visibility: "selected",
      selectedRepositoriesUrl: "https://api.github.com/orgs/octo/actions/secrets/NPM_TOKEN/repositories",
    });

    const repos = recorder([json({ total_count: 1, repositories: [{ id: 1, name: "r", full_name: "octo/r", private: true }] })]);
    const reposResult = await listOrgActionsSecretRepositories({ accessToken: "t", org: "octo", secretName: "NPM_TOKEN", fetch: repos.fetch });
    expect(repos.seen[0].url).toBe("https://api.github.com/orgs/octo/actions/secrets/NPM_TOKEN/repositories");
    expect(reposResult.repositories).toEqual([{ id: 1, name: "r", fullName: "octo/r", private: true }]);

    const enabled = recorder([json({ total_count: 1, repositories: [{ id: 2, name: "app", full_name: "octo/app", private: false }] })]);
    const enabledResult = await listOrgActionsPermissionsRepositories({ accessToken: "t", org: "octo", perPage: 10, fetch: enabled.fetch });
    expect(enabled.seen[0].url).toBe("https://api.github.com/orgs/octo/actions/permissions/repositories?per_page=10");
    expect(enabledResult.repositories).toEqual([{ id: 2, name: "app", fullName: "octo/app", private: false }]);

    const oidc = recorder([json({ include_claim_keys: ["repo", "context"], use_immutable_subject: true })]);
    const oidcResult = await getOrgOidcCustomizationSub({ accessToken: "t", org: "octo", fetch: oidc.fetch });
    expect(oidc.seen[0].url).toBe("https://api.github.com/orgs/octo/actions/oidc/customization/sub");
    expect(oidcResult.subject).toEqual({ includeClaimKeys: ["repo", "context"], useImmutableSubject: true });
  });
});
