import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import {
  getOrgDependabotSecretsPublicKey,
  listBranchProtectionRestrictionApps,
  listEnvironmentDeploymentProtectionRules,
  listIssueDependenciesBlockedBy,
  listIssueDependenciesBlocking,
  listOrgActionsRunnerLabels,
  listOrgCodespacesSecrets,
  listOrgProjectViewItems,
  listOrgPropertySchemas,
  listOrgPropertyValues,
  listOrganizationRoles,
  listRequiredStatusCheckContexts,
  listRepoAutolinks,
  listRepoNotifications,
  listRepoPropertyValues,
} from "../src/actions";
import {
  validateListIssueDependenciesBlockedByInput,
  validateListOrgActionsRunnerLabelsInput,
  validateListOrgProjectViewItemsInput,
  validateListOrgPropertyValuesInput,
  validateListRepoNotificationsInput,
} from "../src/gap_g2";

const PATHS: Record<string, string> = {
  "orgs.properties.schema.list": "GET /orgs/{org}/properties/schema",
  "orgs.properties.values.list": "GET /orgs/{org}/properties/values",
  "orgs.organization_roles.list": "GET /orgs/{org}/organization-roles",
  "orgs.actions.runners.labels.list": "GET /orgs/{org}/actions/runners/{runner_id}/labels",
  "orgs.codespaces.secrets.list": "GET /orgs/{org}/codespaces/secrets",
  "orgs.dependabot.secrets.public_key.get": "GET /orgs/{org}/dependabot/secrets/public-key",
  "repos.autolinks.list": "GET /repos/{owner}/{repo}/autolinks",
  "branches.protection.restrictions.apps.list": "GET /repos/{owner}/{repo}/branches/{branch}/protection/restrictions/apps",
  "branches.protection.required_status_checks.contexts.list": "GET /repos/{owner}/{repo}/branches/{branch}/protection/required_status_checks/contexts",
  "repos.properties.values.list": "GET /repos/{owner}/{repo}/properties/values",
  "issues.dependencies.blocked_by.list": "GET /repos/{owner}/{repo}/issues/{issue_number}/dependencies/blocked_by",
  "issues.dependencies.blocking.list": "GET /repos/{owner}/{repo}/issues/{issue_number}/dependencies/blocking",
  "repos.notifications.list": "GET /repos/{owner}/{repo}/notifications",
  "orgs.projects_v2.views.items.list": "GET /orgs/{org}/projectsV2/{project_number}/views/{view_number}/items",
  "repos.environments.deployment_protection_rules.list": "GET /repos/{owner}/{repo}/environments/{environment_name}/deployment_protection_rules",
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

describe("github gap G2 organization and repository reads", () => {
  test("version is 0.75.0 at 770 ops with the read/write breakdown", () => {
    expect(manifest.version).toBe("0.75.0");
    const ops = manifest.operations as Record<string, Record<string, unknown>>;
    expect(Object.keys(ops)).toHaveLength(770);
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
    expect(kinds).toEqual({ action: 720, sync: 4, webhook: 46 });
    expect(side).toEqual({ read: 383, write: 322, absent: 15 });
  });

  test("the fifteen G2 ops are present, omit all three effect keys, and document their paths", () => {
    const ops = manifest.operations as Record<string, Record<string, unknown>>;
    expect(Object.keys(PATHS)).toHaveLength(15);
    for (const [key, path] of Object.entries(PATHS)) {
      const op = ops[key];
      expect(op).toBeDefined();
      expect(op.kind).toBe("action");
      expect(op.sideEffect).toBe("read");
      expect(op.effectPolicy).toBeUndefined();
      expect(op.reconcile).toBeUndefined();
      expect(op.effect).toBeUndefined();
      expect(String(op.description)).toContain(path.split(" ")[1]);
    }
    expect(ops["classroom.list"]).toBeUndefined();
    expect(ops["classroom.get"]).toBeUndefined();
    const schema = (key: string) => (ops[key].inputSchema as { properties: Record<string, { type: string }>; required?: string[] });
    expect(schema("orgs.actions.runners.labels.list").properties.runnerId.type).toBe("integer");
    expect(schema("issues.dependencies.blocked_by.list").properties.issueNumber.type).toBe("integer");
    expect(schema("issues.dependencies.blocked_by.list").properties.perPage.type).toBe("number");
    expect(schema("issues.dependencies.blocked_by.list").properties.page.type).toBe("number");
    expect(schema("orgs.projects_v2.views.items.list").properties.projectNumber.type).toBe("integer");
    expect(schema("orgs.projects_v2.views.items.list").properties.viewNumber.type).toBe("integer");
    expect(schema("orgs.projects_v2.views.items.list").properties.perPage.type).toBe("number");
    expect(schema("orgs.projects_v2.views.items.list").properties.page).toBeUndefined();
    expect(schema("orgs.projects_v2.views.items.list").properties.fields.type).toBe("string");
    expect(schema("orgs.properties.values.list").properties.perPage.type).toBe("number");
    expect(schema("repos.autolinks.list").properties.perPage).toBeUndefined();
    expect(schema("branches.protection.restrictions.apps.list").properties.perPage).toBeUndefined();
    expect(schema("repos.environments.deployment_protection_rules.list").properties.perPage).toBeUndefined();
  });

  test("validators enforce integer ids and notification booleans", () => {
    expect(validateListOrgActionsRunnerLabelsInput({ org: "octo", runnerId: 7 })).toEqual({ org: "octo", runnerId: 7 });
    expect(() => validateListOrgActionsRunnerLabelsInput({ org: "octo", runnerId: "7" })).toThrow(/runnerId/);
    expect(validateListIssueDependenciesBlockedByInput({ owner: "o", repo: "r", issueNumber: 12, perPage: 5 }))
      .toEqual({ owner: "o", repo: "r", issueNumber: 12, perPage: 5 });
    expect(() => validateListIssueDependenciesBlockedByInput({ owner: "o", repo: "r", issueNumber: 1.5 })).toThrow(/issueNumber/);
    expect(validateListOrgProjectViewItemsInput({ org: "octo", projectNumber: 1, viewNumber: 2, fields: "title", before: "b", after: "a", perPage: 10 }))
      .toEqual({ org: "octo", projectNumber: 1, viewNumber: 2, fields: "title", before: "b", after: "a", perPage: 10 });
    expect(() => validateListOrgProjectViewItemsInput({ org: "octo", projectNumber: 1, viewNumber: "2" })).toThrow(/viewNumber/);
    expect(() => validateListRepoNotificationsInput({ owner: "o", repo: "r", all: "yes" })).toThrow(/all/);
    expect(validateListOrgPropertyValuesInput({ org: "octo", repositoryQuery: "props.has:environment", perPage: 20, page: 2 }))
      .toEqual({ org: "octo", repositoryQuery: "props.has:environment", perPage: 20, page: 2 });
    expect(listOrgPropertySchemas({ org: "octo" })).toMatchObject({ action: "orgs.properties.schema.list", validated: { org: "octo" } });
  });

  test("org property schema/values and organization roles list", async () => {
    const schemas = recorder([json([{ property_name: "environment", value_type: "single_select", required: true, description: "env", default_value: "prod", allowed_values: ["prod", "dev"] }])]);
    const schemaResult = await listOrgPropertySchemas({ accessToken: "t", org: "octo", fetch: schemas.fetch });
    expect(schemas.seen[0]).toMatchObject({ url: "https://api.github.com/orgs/octo/properties/schema", method: "GET", auth: "Bearer t" });
    expect(schemaResult.properties).toEqual([{ propertyName: "environment", valueType: "single_select", required: true, description: "env", defaultValue: "prod", allowedValues: ["prod", "dev"] }]);

    const values = recorder([json([{ repository_id: 1, repository_name: "r", repository_full_name: "octo/r", properties: [{ property_name: "environment", value: "prod" }] }])]);
    const valueResult = await listOrgPropertyValues({ accessToken: "t", org: "octo", repositoryQuery: "props.has:environment", perPage: 10, page: 1, fetch: values.fetch });
    expect(values.seen[0].url).toBe("https://api.github.com/orgs/octo/properties/values?repository_query=props.has%3Aenvironment&per_page=10&page=1");
    expect(valueResult.values).toEqual([{ repositoryId: 1, repositoryName: "r", repositoryFullName: "octo/r", properties: [{ propertyName: "environment", value: "prod" }] }]);

    const roles = recorder([json({ total_count: 1, roles: [{ id: 9, name: "security", description: "sec", permissions: ["read"], source: "custom", base_role: "member", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-02T00:00:00Z" }] })]);
    const roleResult = await listOrganizationRoles({ accessToken: "t", org: "octo", fetch: roles.fetch });
    expect(roles.seen[0].url).toBe("https://api.github.com/orgs/octo/organization-roles");
    expect(roleResult).toMatchObject({ totalCount: 1, roles: [{ id: 9, name: "security", baseRole: "member" }] });
  });

  test("org runner labels, codespaces secrets, and dependabot public key", async () => {
    const labels = recorder([json({ total_count: 1, labels: [{ id: 1, name: "self-hosted", type: "read-only" }] })]);
    const labelResult = await listOrgActionsRunnerLabels({ accessToken: "t", org: "octo", runnerId: 42, fetch: labels.fetch });
    expect(labels.seen[0].url).toBe("https://api.github.com/orgs/octo/actions/runners/42/labels");
    expect(labelResult).toEqual({ connector: "github", action: "orgs.actions.runners.labels.list", source: "connector", totalCount: 1, labels: [{ id: 1, name: "self-hosted", type: "read-only" }] });

    const secrets = recorder([json({ total_count: 1, secrets: [{ name: "NPM_TOKEN", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-02T00:00:00Z", visibility: "private" }] })]);
    const secretResult = await listOrgCodespacesSecrets({ accessToken: "t", org: "octo", perPage: 5, page: 2, fetch: secrets.fetch });
    expect(secrets.seen[0].url).toBe("https://api.github.com/orgs/octo/codespaces/secrets?per_page=5&page=2");
    expect(secretResult.secrets).toEqual([{ name: "NPM_TOKEN", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-02T00:00:00Z" }]);

    const key = recorder([json({ key_id: "123", key: "abc=" })]);
    const keyResult = await getOrgDependabotSecretsPublicKey({ accessToken: "t", org: "octo", fetch: key.fetch });
    expect(key.seen[0].url).toBe("https://api.github.com/orgs/octo/dependabot/secrets/public-key");
    expect(keyResult.publicKey).toEqual({ keyId: "123", key: "abc=" });
  });

  test("autolinks, restriction apps, status contexts, and repo property values", async () => {
    const autolinks = recorder([json([{ id: 3, key_prefix: "TICKET-", url_template: "https://example.com/<num>", is_alphanumeric: true }])]);
    const a = await listRepoAutolinks({ accessToken: "t", owner: "o", repo: "r", fetch: autolinks.fetch });
    expect(autolinks.seen[0].url).toBe("https://api.github.com/repos/o/r/autolinks");
    expect(a.autolinks).toEqual([{ id: 3, keyPrefix: "TICKET-", urlTemplate: "https://example.com/<num>", isAlphanumeric: true }]);

    const apps = recorder([json([{ id: 1, slug: "my-app", node_id: "A", name: "My App" }])]);
    const appResult = await listBranchProtectionRestrictionApps({ accessToken: "t", owner: "o", repo: "r", branch: "main", fetch: apps.fetch });
    expect(apps.seen[0].url).toBe("https://api.github.com/repos/o/r/branches/main/protection/restrictions/apps");
    expect(appResult.apps).toEqual([{ id: 1, slug: "my-app", nodeId: "A", name: "My App" }]);

    const contexts = recorder([json(["ci/test", "ci/build"])]);
    const contextResult = await listRequiredStatusCheckContexts({ accessToken: "t", owner: "o", repo: "r", branch: "feature/x", fetch: contexts.fetch });
    expect(contexts.seen[0].url).toBe("https://api.github.com/repos/o/r/branches/feature%2Fx/protection/required_status_checks/contexts");
    expect(contextResult.contexts).toEqual(["ci/test", "ci/build"]);

    const props = recorder([json([{ property_name: "environment", value: "prod" }])]);
    const propResult = await listRepoPropertyValues({ accessToken: "t", owner: "o", repo: "r", fetch: props.fetch });
    expect(props.seen[0].url).toBe("https://api.github.com/repos/o/r/properties/values");
    expect(propResult.properties).toEqual([{ propertyName: "environment", value: "prod" }]);
  });

  test("issue dependencies blocked_by and blocking", async () => {
    const issue = { id: 55, number: 7, title: "Blocker", state: "open", html_url: "https://github.com/o/r/issues/7", repository_url: "https://api.github.com/repos/o/r", labels: [], user: { login: "octocat" } };
    const blocked = recorder([json([issue])]);
    const blockedResult = await listIssueDependenciesBlockedBy({ accessToken: "t", owner: "o", repo: "r", issueNumber: 12, perPage: 10, page: 1, fetch: blocked.fetch });
    expect(blocked.seen[0].url).toBe("https://api.github.com/repos/o/r/issues/12/dependencies/blocked_by?per_page=10&page=1");
    expect((blockedResult.issues as Record<string, unknown>[])[0]).toMatchObject({ number: 7, title: "Blocker", author: "octocat" });

    const blocking = recorder([json([issue])]);
    const blockingResult = await listIssueDependenciesBlocking({ accessToken: "t", owner: "o", repo: "r", issueNumber: 12, fetch: blocking.fetch });
    expect(blocking.seen[0].url).toBe("https://api.github.com/repos/o/r/issues/12/dependencies/blocking");
    expect((blockingResult.issues as Record<string, unknown>[])[0]).toMatchObject({ providerIssueId: 55 });
  });

  test("repo notifications, org project view items, and deployment protection rules", async () => {
    const notes = recorder([json([{
      id: "1", unread: true, reason: "mention", updated_at: "2026-10-05T00:00:00Z", last_read_at: null, url: "https://api.github.com/notifications/threads/1",
      subject: { title: "Hello", type: "Issue", url: "https://api.github.com/repos/o/r/issues/1" },
      repository: { full_name: "o/r" },
    }])]);
    const noteResult = await listRepoNotifications({ accessToken: "t", owner: "o", repo: "r", all: true, participating: false, since: "2026-01-01T00:00:00Z", before: "2026-12-01T00:00:00Z", perPage: 5, page: 2, fetch: notes.fetch });
    expect(notes.seen[0].url).toBe("https://api.github.com/repos/o/r/notifications?all=true&participating=false&since=2026-01-01T00%3A00%3A00Z&before=2026-12-01T00%3A00%3A00Z&per_page=5&page=2");
    expect((noteResult.notifications as Record<string, unknown>[])[0]).toMatchObject({ threadId: "1", unread: true, title: "Hello", repository: "o/r" });

    const items = recorder([json([{ id: 9, content_type: "Issue", content: { title: "Ship" } }])]);
    const itemResult = await listOrgProjectViewItems({ accessToken: "t", org: "octo", projectNumber: 3, viewNumber: 1, fields: "title,assignees", before: "b1", after: "a1", perPage: 20, fetch: items.fetch });
    expect(items.seen[0].url).toBe("https://api.github.com/orgs/octo/projectsV2/3/views/1/items?fields=title%2Cassignees&before=b1&after=a1&per_page=20");
    expect(itemResult.items).toEqual([{ id: 9, content_type: "Issue", content: { title: "Ship" } }]);

    const rules = recorder([json({ total_count: 1, custom_deployment_protection_rules: [{ id: 8, node_id: "PR_8", enabled: true, app: { id: 2, slug: "gate", node_id: "A2", name: "Gate" } }] })]);
    const ruleResult = await listEnvironmentDeploymentProtectionRules({ accessToken: "t", owner: "o", repo: "r", environmentName: "prod", fetch: rules.fetch });
    expect(rules.seen[0].url).toBe("https://api.github.com/repos/o/r/environments/prod/deployment_protection_rules");
    expect(ruleResult).toMatchObject({ totalCount: 1, rules: [{ id: 8, nodeId: "PR_8", enabled: true, app: { id: 2, slug: "gate", nodeId: "A2", name: "Gate" } }] });
  });

  test("404 and rate limits map to connector errors", async () => {
    await expect(listRepoAutolinks({ accessToken: "t", owner: "o", repo: "r", fetch: recorder([json({}, 404)]).fetch }))
      .rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR", message: "GitHub repository autolinks were not found." });
    const fetch = recorder(() => new Response("{}", { status: 429, headers: { "retry-after": "12" } })).fetch;
    await expect(listOrganizationRoles({ accessToken: "t", org: "octo", fetch })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 12 });
  });
});
