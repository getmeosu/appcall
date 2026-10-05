import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";
import { normalizeAutolink } from "./repos_reads";
import { normalizeOrganizationRole } from "./orgs_reads";
import { normalizeRunnerLabel } from "./card10_reads";
import { normalizeActionsSecretName } from "./card5_reads";
import { normalizeGitHubNotification, type GitHubNotification } from "./notifications_social";
import { normalizeGitHubIssue, type GitHubIssue } from "./issues";

// G2: fifteen GitHub reads (option C). Classroom REST dropped (removed 2026-08-28);
// refill #1–6 are the former G3 organization reads. All omit effectPolicy/reconcile/effect.

type Page = { perPage?: number; page?: number };
type OrgScope = { org: string };
type RepoScope = { owner: string; repo: string };
type BranchScope = RepoScope & { branch: string };
type IssueScope = RepoScope & { issueNumber: number } & Page;
type ViewItems = OrgScope & {
  projectNumber: number;
  viewNumber: number;
  fields?: string;
  before?: string;
  after?: string;
  perPage?: number;
};

export type NormalizedCustomPropertySchema = {
  propertyName: string;
  valueType: string;
  required: boolean;
  description: string;
  defaultValue: string | string[] | null;
  allowedValues: string[];
};
export type NormalizedCustomPropertyValue = { propertyName: string; value: string | string[] | null };
export type NormalizedRepoCustomPropertyValues = {
  repositoryId: number;
  repositoryName: string;
  repositoryFullName: string;
  properties: NormalizedCustomPropertyValue[];
};
export type NormalizedPublicKey = { keyId: string; key: string };
export type NormalizedApp = { id: number; slug: string; nodeId: string; name: string };
export type NormalizedDeploymentProtectionRule = {
  id: number;
  nodeId: string;
  enabled: boolean;
  app: NormalizedApp;
};

// ─── validators ──────────────────────────────────────────────────────────────

export function validateListOrgPropertySchemasInput(input: unknown): OrgScope {
  if (!isRecord(input)) throw new Error("orgs.properties.schema.list input must be an object");
  return { org: segment(input.org, "org") };
}

export function validateListOrgPropertyValuesInput(input: unknown): OrgScope & Page & { repositoryQuery?: string } {
  if (!isRecord(input)) throw new Error("orgs.properties.values.list input must be an object");
  const repositoryQuery = optionalString(input.repositoryQuery, "repositoryQuery");
  return {
    org: segment(input.org, "org"),
    ...(repositoryQuery !== undefined ? { repositoryQuery } : {}),
    ...page(input),
  };
}

export function validateListOrganizationRolesInput(input: unknown): OrgScope {
  if (!isRecord(input)) throw new Error("orgs.organization_roles.list input must be an object");
  return { org: segment(input.org, "org") };
}

export function validateListOrgActionsRunnerLabelsInput(input: unknown): OrgScope & { runnerId: number } {
  if (!isRecord(input)) throw new Error("orgs.actions.runners.labels.list input must be an object");
  return { org: segment(input.org, "org"), runnerId: requireId(input.runnerId, "runnerId") };
}

export function validateListOrgCodespacesSecretsInput(input: unknown): OrgScope & Page {
  if (!isRecord(input)) throw new Error("orgs.codespaces.secrets.list input must be an object");
  return { org: segment(input.org, "org"), ...page(input) };
}

export function validateGetOrgDependabotSecretsPublicKeyInput(input: unknown): OrgScope {
  if (!isRecord(input)) throw new Error("orgs.dependabot.secrets.public_key.get input must be an object");
  return { org: segment(input.org, "org") };
}

export function validateListRepoAutolinksInput(input: unknown): RepoScope {
  if (!isRecord(input)) throw new Error("repos.autolinks.list input must be an object");
  return repo(input);
}

export function validateListBranchProtectionRestrictionAppsInput(input: unknown): BranchScope {
  if (!isRecord(input)) throw new Error("branches.protection.restrictions.apps.list input must be an object");
  return { ...repo(input), branch: branchSegment(input.branch, "branch") };
}

export function validateListRequiredStatusCheckContextsInput(input: unknown): BranchScope {
  if (!isRecord(input)) throw new Error("branches.protection.required_status_checks.contexts.list input must be an object");
  return { ...repo(input), branch: branchSegment(input.branch, "branch") };
}

export function validateListRepoPropertyValuesInput(input: unknown): RepoScope {
  if (!isRecord(input)) throw new Error("repos.properties.values.list input must be an object");
  return repo(input);
}

export function validateListIssueDependenciesBlockedByInput(input: unknown): IssueScope {
  if (!isRecord(input)) throw new Error("issues.dependencies.blocked_by.list input must be an object");
  return { ...repo(input), issueNumber: requireId(input.issueNumber, "issueNumber"), ...page(input) };
}

export function validateListIssueDependenciesBlockingInput(input: unknown): IssueScope {
  if (!isRecord(input)) throw new Error("issues.dependencies.blocking.list input must be an object");
  return { ...repo(input), issueNumber: requireId(input.issueNumber, "issueNumber"), ...page(input) };
}

export function validateListRepoNotificationsInput(input: unknown): RepoScope & Page & {
  all?: boolean;
  participating?: boolean;
  since?: string;
  before?: string;
} {
  if (!isRecord(input)) throw new Error("repos.notifications.list input must be an object");
  if (input.all !== undefined && typeof input.all !== "boolean") throw new Error("all must be a boolean");
  if (input.participating !== undefined && typeof input.participating !== "boolean") throw new Error("participating must be a boolean");
  const since = optionalString(input.since, "since");
  const before = optionalString(input.before, "before");
  return {
    ...repo(input),
    ...(input.all !== undefined ? { all: input.all as boolean } : {}),
    ...(input.participating !== undefined ? { participating: input.participating as boolean } : {}),
    ...(since !== undefined ? { since } : {}),
    ...(before !== undefined ? { before } : {}),
    ...page(input),
  };
}

export function validateListOrgProjectViewItemsInput(input: unknown): ViewItems {
  if (!isRecord(input)) throw new Error("orgs.projects_v2.views.items.list input must be an object");
  const fields = optionalString(input.fields, "fields");
  const before = optionalString(input.before, "before");
  const after = optionalString(input.after, "after");
  const perPage = optionalPage(input.perPage, "perPage");
  return {
    org: segment(input.org, "org"),
    projectNumber: requireId(input.projectNumber, "projectNumber"),
    viewNumber: requireId(input.viewNumber, "viewNumber"),
    ...(fields !== undefined ? { fields } : {}),
    ...(before !== undefined ? { before } : {}),
    ...(after !== undefined ? { after } : {}),
    ...(perPage !== undefined ? { perPage } : {}),
  };
}

export function validateListEnvironmentDeploymentProtectionRulesInput(input: unknown): RepoScope & { environmentName: string } {
  if (!isRecord(input)) throw new Error("repos.environments.deployment_protection_rules.list input must be an object");
  return { ...repo(input), environmentName: segment(input.environmentName, "environmentName") };
}

// ─── client ──────────────────────────────────────────────────────────────────

export function createGapG2Client(options: { accessToken: string; fetch?: typeof fetch; githubClient?: GitHubClient }) {
  const base = options.githubClient;
  const clientFor = (operation: string) =>
    base ?? createGitHubClient({ accessToken: options.accessToken, fetch: options.fetch, operation });

  return {
    async listOrgPropertySchemas(input: unknown) {
      const payload = validateListOrgPropertySchemasInput(input);
      const result = await read(clientFor("orgs.properties.schema.list"), `/orgs/${enc(payload.org)}/properties/schema`, "orgs.properties.schema.list", "GitHub organization property schemas were not found.");
      if (!result.ok) return result;
      if (!Array.isArray(result.body)) return upstream("GitHub rejected the orgs.properties.schema.list request.");
      return { ok: true as const, properties: result.body.filter(isRecord).map(normalizeCustomPropertySchema) };
    },

    async listOrgPropertyValues(input: unknown) {
      const payload = validateListOrgPropertyValuesInput(input);
      const params = new URLSearchParams();
      if (payload.repositoryQuery !== undefined) params.set("repository_query", payload.repositoryQuery);
      appendPage(params, payload);
      const result = await read(clientFor("orgs.properties.values.list"), `/orgs/${enc(payload.org)}/properties/values${qs(params)}`, "orgs.properties.values.list", "GitHub organization property values were not found.");
      if (!result.ok) return result;
      if (!Array.isArray(result.body)) return upstream("GitHub rejected the orgs.properties.values.list request.");
      return { ok: true as const, values: result.body.filter(isRecord).map(normalizeRepoCustomPropertyValues) };
    },

    async listOrganizationRoles(input: unknown) {
      const payload = validateListOrganizationRolesInput(input);
      const result = await read(clientFor("orgs.organization_roles.list"), `/orgs/${enc(payload.org)}/organization-roles`, "orgs.organization_roles.list", "GitHub organization roles were not found.");
      if (!result.ok) return result;
      if (!isRecord(result.body) || !Array.isArray(result.body.roles)) return upstream("GitHub rejected the orgs.organization_roles.list request.");
      const roles = result.body.roles.filter(isRecord).map(normalizeOrganizationRole);
      return {
        ok: true as const,
        totalCount: typeof result.body.total_count === "number" ? result.body.total_count : roles.length,
        roles,
      };
    },

    async listOrgActionsRunnerLabels(input: unknown) {
      const payload = validateListOrgActionsRunnerLabelsInput(input);
      const path = `/orgs/${enc(payload.org)}/actions/runners/${payload.runnerId}/labels`;
      const result = await read(clientFor("orgs.actions.runners.labels.list"), path, "orgs.actions.runners.labels.list", "GitHub organization runner labels were not found.");
      if (!result.ok) return result;
      if (!isRecord(result.body) || !Array.isArray(result.body.labels)) return upstream("GitHub rejected the orgs.actions.runners.labels.list request.");
      const labels = result.body.labels.filter(isRecord).map(normalizeRunnerLabel);
      return {
        ok: true as const,
        totalCount: typeof result.body.total_count === "number" ? result.body.total_count : labels.length,
        labels,
      };
    },

    async listOrgCodespacesSecrets(input: unknown) {
      const payload = validateListOrgCodespacesSecretsInput(input);
      const result = await read(clientFor("orgs.codespaces.secrets.list"), `/orgs/${enc(payload.org)}/codespaces/secrets${qs(pageParams(payload))}`, "orgs.codespaces.secrets.list", "GitHub organization codespaces secrets were not found.");
      if (!result.ok) return result;
      if (!isRecord(result.body) || !Array.isArray(result.body.secrets)) return upstream("GitHub rejected the orgs.codespaces.secrets.list request.");
      const secrets = result.body.secrets.filter(isRecord).map(normalizeActionsSecretName);
      return {
        ok: true as const,
        totalCount: typeof result.body.total_count === "number" ? result.body.total_count : secrets.length,
        secrets,
      };
    },

    async getOrgDependabotSecretsPublicKey(input: unknown) {
      const payload = validateGetOrgDependabotSecretsPublicKeyInput(input);
      const result = await read(clientFor("orgs.dependabot.secrets.public_key.get"), `/orgs/${enc(payload.org)}/dependabot/secrets/public-key`, "orgs.dependabot.secrets.public_key.get", "GitHub organization Dependabot public key was not found.");
      if (!result.ok) return result;
      if (!isRecord(result.body)) return upstream("GitHub rejected the orgs.dependabot.secrets.public_key.get request.");
      return { ok: true as const, publicKey: normalizePublicKey(result.body) };
    },

    async listRepoAutolinks(input: unknown) {
      const payload = validateListRepoAutolinksInput(input);
      const result = await read(clientFor("repos.autolinks.list"), `${repoPath(payload)}/autolinks`, "repos.autolinks.list", "GitHub repository autolinks were not found.");
      if (!result.ok) return result;
      if (!Array.isArray(result.body)) return upstream("GitHub rejected the repos.autolinks.list request.");
      return { ok: true as const, autolinks: result.body.filter(isRecord).map(normalizeAutolink) };
    },

    async listBranchProtectionRestrictionApps(input: unknown) {
      const payload = validateListBranchProtectionRestrictionAppsInput(input);
      const path = `${protection(payload)}/restrictions/apps`;
      const result = await read(clientFor("branches.protection.restrictions.apps.list"), path, "branches.protection.restrictions.apps.list", "GitHub branch protection restriction apps were not found.");
      if (!result.ok) return result;
      if (!Array.isArray(result.body)) return upstream("GitHub rejected the branches.protection.restrictions.apps.list request.");
      return { ok: true as const, apps: result.body.filter(isRecord).map(normalizeApp) };
    },

    async listRequiredStatusCheckContexts(input: unknown) {
      const payload = validateListRequiredStatusCheckContextsInput(input);
      const path = `${protection(payload)}/required_status_checks/contexts`;
      const result = await read(clientFor("branches.protection.required_status_checks.contexts.list"), path, "branches.protection.required_status_checks.contexts.list", "GitHub required status check contexts were not found.");
      if (!result.ok) return result;
      if (!Array.isArray(result.body)) return upstream("GitHub rejected the branches.protection.required_status_checks.contexts.list request.");
      return { ok: true as const, contexts: result.body.filter((entry): entry is string => typeof entry === "string") };
    },

    async listRepoPropertyValues(input: unknown) {
      const payload = validateListRepoPropertyValuesInput(input);
      const result = await read(clientFor("repos.properties.values.list"), `${repoPath(payload)}/properties/values`, "repos.properties.values.list", "GitHub repository property values were not found.");
      if (!result.ok) return result;
      if (!Array.isArray(result.body)) return upstream("GitHub rejected the repos.properties.values.list request.");
      return { ok: true as const, properties: result.body.filter(isRecord).map(normalizeCustomPropertyValue) };
    },

    async listIssueDependenciesBlockedBy(input: unknown) {
      const payload = validateListIssueDependenciesBlockedByInput(input);
      const path = `${repoPath(payload)}/issues/${payload.issueNumber}/dependencies/blocked_by${qs(pageParams(payload))}`;
      const result = await read(clientFor("issues.dependencies.blocked_by.list"), path, "issues.dependencies.blocked_by.list", "GitHub issue blocked-by dependencies were not found.");
      if (!result.ok) return result;
      if (!Array.isArray(result.body)) return upstream("GitHub rejected the issues.dependencies.blocked_by.list request.");
      return { ok: true as const, issues: result.body.filter(isRecord).map((item) => normalizeGitHubIssue(item as GitHubIssue)) };
    },

    async listIssueDependenciesBlocking(input: unknown) {
      const payload = validateListIssueDependenciesBlockingInput(input);
      const path = `${repoPath(payload)}/issues/${payload.issueNumber}/dependencies/blocking${qs(pageParams(payload))}`;
      const result = await read(clientFor("issues.dependencies.blocking.list"), path, "issues.dependencies.blocking.list", "GitHub issue blocking dependencies were not found.");
      if (!result.ok) return result;
      if (!Array.isArray(result.body)) return upstream("GitHub rejected the issues.dependencies.blocking.list request.");
      return { ok: true as const, issues: result.body.filter(isRecord).map((item) => normalizeGitHubIssue(item as GitHubIssue)) };
    },

    async listRepoNotifications(input: unknown) {
      const payload = validateListRepoNotificationsInput(input);
      const params = new URLSearchParams();
      if (payload.all !== undefined) params.set("all", String(payload.all));
      if (payload.participating !== undefined) params.set("participating", String(payload.participating));
      if (payload.since !== undefined) params.set("since", payload.since);
      if (payload.before !== undefined) params.set("before", payload.before);
      appendPage(params, payload);
      const result = await read(clientFor("repos.notifications.list"), `${repoPath(payload)}/notifications${qs(params)}`, "repos.notifications.list", "GitHub repository notifications were not found.");
      if (!result.ok) return result;
      if (!Array.isArray(result.body)) return upstream("GitHub rejected the repos.notifications.list request.");
      return {
        ok: true as const,
        notifications: (result.body as GitHubNotification[]).map(normalizeGitHubNotification),
      };
    },

    async listOrgProjectViewItems(input: unknown) {
      const payload = validateListOrgProjectViewItemsInput(input);
      const params = new URLSearchParams();
      if (payload.fields !== undefined) params.set("fields", payload.fields);
      if (payload.before !== undefined) params.set("before", payload.before);
      if (payload.after !== undefined) params.set("after", payload.after);
      if (payload.perPage !== undefined) params.set("per_page", String(payload.perPage));
      const path = `/orgs/${enc(payload.org)}/projectsV2/${payload.projectNumber}/views/${payload.viewNumber}/items${qs(params)}`;
      const result = await read(clientFor("orgs.projects_v2.views.items.list"), path, "orgs.projects_v2.views.items.list", "GitHub organization project view items were not found.");
      if (!result.ok) return result;
      // Tip sibling users.projects_v2.views.items.list returns the upstream array as items.
      if (Array.isArray(result.body)) return { ok: true as const, items: result.body.filter(isRecord) };
      if (isRecord(result.body) && Array.isArray(result.body.items)) {
        return { ok: true as const, items: result.body.items.filter(isRecord) };
      }
      return upstream("GitHub rejected the orgs.projects_v2.views.items.list request.");
    },

    async listEnvironmentDeploymentProtectionRules(input: unknown) {
      const payload = validateListEnvironmentDeploymentProtectionRulesInput(input);
      const path = `${repoPath(payload)}/environments/${enc(payload.environmentName)}/deployment_protection_rules`;
      const result = await read(clientFor("repos.environments.deployment_protection_rules.list"), path, "repos.environments.deployment_protection_rules.list", "GitHub environment deployment protection rules were not found.");
      if (!result.ok) return result;
      if (!isRecord(result.body)) return upstream("GitHub rejected the repos.environments.deployment_protection_rules.list request.");
      const raw = Array.isArray(result.body.custom_deployment_protection_rules)
        ? result.body.custom_deployment_protection_rules
        : Array.isArray(result.body.rules)
          ? result.body.rules
          : null;
      if (!raw) return upstream("GitHub rejected the repos.environments.deployment_protection_rules.list request.");
      const rules = raw.filter(isRecord).map(normalizeDeploymentProtectionRule);
      return {
        ok: true as const,
        totalCount: typeof result.body.total_count === "number" ? result.body.total_count : rules.length,
        rules,
      };
    },
  };
}

// ─── normalizers ─────────────────────────────────────────────────────────────

function normalizeCustomPropertySchema(item: Record<string, unknown>): NormalizedCustomPropertySchema {
  const allowed = Array.isArray(item.allowed_values)
    ? item.allowed_values.filter((value): value is string => typeof value === "string")
    : [];
  let defaultValue: string | string[] | null = null;
  if (typeof item.default_value === "string") defaultValue = item.default_value;
  else if (Array.isArray(item.default_value)) {
    defaultValue = item.default_value.filter((value): value is string => typeof value === "string");
  }
  return {
    propertyName: typeof item.property_name === "string" ? item.property_name : "",
    valueType: typeof item.value_type === "string" ? item.value_type : "",
    required: item.required === true,
    description: typeof item.description === "string" ? item.description : "",
    defaultValue,
    allowedValues: allowed,
  };
}

function normalizeCustomPropertyValue(item: Record<string, unknown>): NormalizedCustomPropertyValue {
  let value: string | string[] | null = null;
  if (typeof item.value === "string") value = item.value;
  else if (Array.isArray(item.value)) value = item.value.filter((entry): entry is string => typeof entry === "string");
  return {
    propertyName: typeof item.property_name === "string" ? item.property_name : "",
    value,
  };
}

function normalizeRepoCustomPropertyValues(item: Record<string, unknown>): NormalizedRepoCustomPropertyValues {
  const properties = Array.isArray(item.properties) ? item.properties.filter(isRecord).map(normalizeCustomPropertyValue) : [];
  return {
    repositoryId: typeof item.repository_id === "number" ? item.repository_id : 0,
    repositoryName: typeof item.repository_name === "string" ? item.repository_name : "",
    repositoryFullName: typeof item.repository_full_name === "string" ? item.repository_full_name : "",
    properties,
  };
}

function normalizePublicKey(item: Record<string, unknown>): NormalizedPublicKey {
  return {
    keyId: typeof item.key_id === "string" ? item.key_id : "",
    key: typeof item.key === "string" ? item.key : "",
  };
}

function normalizeApp(item: Record<string, unknown>): NormalizedApp {
  return {
    id: typeof item.id === "number" ? item.id : 0,
    slug: typeof item.slug === "string" ? item.slug : "",
    nodeId: typeof item.node_id === "string" ? item.node_id : "",
    name: typeof item.name === "string" ? item.name : "",
  };
}

function normalizeDeploymentProtectionRule(item: Record<string, unknown>): NormalizedDeploymentProtectionRule {
  const app = isRecord(item.app) ? normalizeApp(item.app) : { id: 0, slug: "", nodeId: "", name: "" };
  return {
    id: typeof item.id === "number" ? item.id : 0,
    nodeId: typeof item.node_id === "string" ? item.node_id : "",
    enabled: item.enabled === true,
    app,
  };
}

// ─── helpers ─────────────────────────────────────────────────────────────────

async function read(client: GitHubClient, path: string, operation: string, missing: string) {
  const response = await client.fetchJSON(path);
  const limited = rate(response.status, response.headers);
  if (limited) return limited;
  if (response.status === 404) return upstream(missing);
  if (response.status === 401) return upstream(`GitHub rejected the ${operation} request.`);
  if (response.status === 200) return { ok: true as const, body: response.body };
  return upstream(`GitHub rejected the ${operation} request.`);
}

function rate(status: number, headers: Record<string, string>) {
  const parsed = parseGitHubRateLimit(status, headers);
  if (!parsed.limited) return null;
  return {
    ok: false as const,
    error: {
      code: "CONNECTOR_RATE_LIMITED" as const,
      message: "GitHub rate limit exceeded.",
      retryAfterSeconds: parsed.retryAfterSeconds,
    },
  };
}

function upstream(message: string) {
  return {
    ok: false as const,
    error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message, retryAfterSeconds: undefined as number | undefined },
  };
}

function repo(input: Record<string, unknown>): RepoScope {
  return { owner: segment(input.owner, "owner"), repo: segment(input.repo, "repo") };
}

function repoPath(payload: RepoScope): string {
  return `/repos/${enc(payload.owner)}/${enc(payload.repo)}`;
}

function protection(payload: BranchScope): string {
  return `${repoPath(payload)}/branches/${enc(payload.branch)}/protection`;
}

function page(input: Record<string, unknown>): Page {
  const perPage = optionalPage(input.perPage, "perPage");
  const pageNumber = optionalPage(input.page, "page", 1_000_000);
  return { ...(perPage !== undefined ? { perPage } : {}), ...(pageNumber !== undefined ? { page: pageNumber } : {}) };
}

function pageParams(payload: Page): URLSearchParams {
  const params = new URLSearchParams();
  appendPage(params, payload);
  return params;
}

function appendPage(params: URLSearchParams, payload: Page) {
  if (payload.perPage) params.set("per_page", String(payload.perPage));
  if (payload.page) params.set("page", String(payload.page));
}

function qs(params: URLSearchParams): string {
  const value = params.toString();
  return value ? `?${value}` : "";
}

function optionalPage(value: unknown, field: string, max = 100): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > max) {
    throw new Error(`${field} must be an integer between 1 and ${max}`);
  }
  return value;
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} must be a non-empty string`);
  return value;
}

function requireId(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new Error(`${field} must be a positive integer`);
  }
  return value;
}

function segment(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  if (value.includes("/") || value.includes("?") || value.includes("#")) {
    throw new Error(`${field} must be a single path segment`);
  }
  return value;
}

function branchSegment(value: unknown, field: string): string {
  // Branch names may contain slashes; encodeURIComponent handles them in the path.
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  if (value.includes("?") || value.includes("#")) throw new Error(`${field} must not contain ? or #`);
  return value;
}

function enc(value: string): string {
  return encodeURIComponent(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
