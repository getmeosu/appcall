import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";
import { normalizeGitHubTeam, type GitHubTeam } from "./notifications_social";
import { normalizeGitHubUser, type GitHubUser } from "./users";

type Page = { perPage?: number; page?: number };
type Repo = { owner: string; repo: string };
type RepoPage = Repo & Page;
type Branch = Repo & { branch: string };
type BranchPage = Branch & Page;
type Environment = Repo & { environmentName: string };
type EnvironmentPage = Environment & Page;

export type NormalizedActionsSecret = { name: string; created_at: string; updated_at: string };

const SECRET_LISTS = [
  "repos.environments.secrets.list",
  "actions.organization_secrets.list",
  "user.codespaces.secrets.list",
] as const;

export function validateListRepoEnvironmentSecretsInput(input: unknown): EnvironmentPage {
  return environmentPage(input, "repos.environments.secrets.list");
}

export function validateListRepoOrganizationSecretsInput(input: unknown): RepoPage {
  return repoPage(input, "actions.organization_secrets.list");
}

export function validateListUserCodespacesSecretsInput(input: unknown): Page {
  if (input === undefined || input === null) return {};
  if (!isRecord(input)) throw new Error("user.codespaces.secrets.list input must be an object");
  return pageOf(input);
}

export function validateListUserCodespacesSecretRepositoriesInput(input: unknown): { secretName: string } & Page {
  if (!isRecord(input)) throw new Error("user.codespaces.secrets.repositories.list input must be an object");
  return { secretName: segment(input.secretName, "secretName"), ...pageOf(input) };
}

export function validateGetBranchProtectionRestrictionsInput(input: unknown): Branch {
  return branchOf(input, "branches.protection.restrictions.get");
}

export function validateGetBranchProtectionEnforceAdminsInput(input: unknown): Branch {
  return branchOf(input, "branches.protection.enforce_admins.get");
}

export function validateGetBranchProtectionRequiredSignaturesInput(input: unknown): Branch {
  return branchOf(input, "branches.protection.required_signatures.get");
}

export function validateGetDeploymentProtectionRuleInput(input: unknown): Environment & { protectionRuleId: number } {
  if (!isRecord(input)) throw new Error("environments.deployment_protection_rules.get input must be an object");
  return {
    ...environmentOf(input),
    protectionRuleId: positiveInt(input.protectionRuleId, "protectionRuleId"),
  };
}

export function validateGetRequiredPullRequestReviewsInput(input: unknown): Branch {
  return branchOf(input, "branches.protection.required_pull_request_reviews.get");
}

export function validateGetRequiredStatusChecksInput(input: unknown): Branch {
  return branchOf(input, "branches.protection.required_status_checks.get");
}

export function validateListBranchProtectionTeamsInput(input: unknown): BranchPage {
  return branchPage(input, "branches.protection.restrictions.teams.list");
}

export function validateListBranchProtectionUsersInput(input: unknown): BranchPage {
  return branchPage(input, "branches.protection.restrictions.users.list");
}

export function validateListUserProjectFieldsInput(input: unknown): { username: string; projectNumber: number } & Page {
  if (!isRecord(input)) throw new Error("users.projects_v2.fields.list input must be an object");
  return {
    username: segment(input.username, "username"),
    projectNumber: positiveInt(input.projectNumber, "projectNumber"),
    ...pageOf(input),
  };
}

export function normalizeActionsSecretName(item: Record<string, unknown>): NormalizedActionsSecret {
  return {
    name: typeof item.name === "string" ? item.name : "",
    created_at: typeof item.created_at === "string" ? item.created_at : "",
    updated_at: typeof item.updated_at === "string" ? item.updated_at : "",
  };
}

export function createCard5ReadsClient(options: { accessToken: string; fetch?: typeof fetch; githubClient?: GitHubClient }) {
  const client = options.githubClient ?? createGitHubClient({
    accessToken: options.accessToken,
    fetch: options.fetch,
    operation: "repos.environments.secrets.list",
  });

  return {
    async listRepoEnvironmentSecrets(input: unknown) {
      const payload = validateListRepoEnvironmentSecretsInput(input);
      const path = `${repoPath(payload)}/environments/${encodeURIComponent(payload.environmentName)}/secrets${pageQuery(payload)}`;
      return secretList(client, path, "repos.environments.secrets.list", "GitHub environment secrets were not found.");
    },
    async listRepoOrganizationSecrets(input: unknown) {
      const payload = validateListRepoOrganizationSecretsInput(input);
      return secretList(client, `${repoPath(payload)}/actions/organization-secrets${pageQuery(payload)}`, "actions.organization_secrets.list", "GitHub organization secrets for the repository were not found.");
    },
    async listUserCodespacesSecrets(input: unknown) {
      const payload = validateListUserCodespacesSecretsInput(input);
      return secretList(client, `/user/codespaces/secrets${pageQuery(payload)}`, "user.codespaces.secrets.list", "GitHub codespaces secrets were not found.");
    },
    async listUserCodespacesSecretRepositories(input: unknown) {
      const payload = validateListUserCodespacesSecretRepositoriesInput(input);
      const result = await read(client, `/user/codespaces/secrets/${encodeURIComponent(payload.secretName)}/repositories${pageQuery(payload)}`, "user.codespaces.secrets.repositories.list", "GitHub codespaces secret repositories were not found.");
      if (!result.ok) return result;
      if (!isRecord(result.body) || !Array.isArray(result.body.repositories)) {
        return upstream("GitHub rejected the user.codespaces.secrets.repositories.list request.");
      }
      const repositories = result.body.repositories.filter(isRecord).map(repositoryIdentity);
      return {
        ok: true as const,
        total_count: typeof result.body.total_count === "number" ? result.body.total_count : repositories.length,
        repositories,
      };
    },
    async getBranchProtectionRestrictions(input: unknown) {
      const payload = validateGetBranchProtectionRestrictionsInput(input);
      const result = await read(client, `${protection(payload)}/restrictions`, "branches.protection.restrictions.get", "GitHub branch protection restrictions were not found.");
      if (!result.ok) return result;
      if (!isRecord(result.body)) return upstream("GitHub rejected the branches.protection.restrictions.get request.");
      const users = arrayOf(result.body.users).map((user) => normalizeGitHubUser(user as GitHubUser));
      const teams = arrayOf(result.body.teams).map((team) => normalizeGitHubTeam(team as GitHubTeam));
      const apps = arrayOf(result.body.apps).map(appIdentity);
      return { ok: true as const, users, teams, apps };
    },
    async getBranchProtectionEnforceAdmins(input: unknown) {
      const payload = validateGetBranchProtectionEnforceAdminsInput(input);
      return enabled(client, `${protection(payload)}/enforce_admins`, "branches.protection.enforce_admins.get", "GitHub enforce-admins protection was not found.");
    },
    async getBranchProtectionRequiredSignatures(input: unknown) {
      const payload = validateGetBranchProtectionRequiredSignaturesInput(input);
      return enabled(client, `${protection(payload)}/required_signatures`, "branches.protection.required_signatures.get", "GitHub required-signatures protection was not found.");
    },
    async getDeploymentProtectionRule(input: unknown) {
      const payload = validateGetDeploymentProtectionRuleInput(input);
      const path = `${repoPath(payload)}/environments/${encodeURIComponent(payload.environmentName)}/deployment_protection_rules/${payload.protectionRuleId}`;
      const result = await read(client, path, "environments.deployment_protection_rules.get", "GitHub deployment protection rule was not found.");
      if (!result.ok) return result;
      if (!isRecord(result.body)) return upstream("GitHub rejected the environments.deployment_protection_rules.get request.");
      const app = isRecord(result.body.app) ? appIdentity(result.body.app) : { id: 0, slug: "", node_id: "", integration_url: "" };
      return {
        ok: true as const,
        rule: {
          id: typeof result.body.id === "number" ? result.body.id : 0,
          node_id: typeof result.body.node_id === "string" ? result.body.node_id : "",
          enabled: result.body.enabled === true,
          app,
        },
      };
    },
    async getRequiredPullRequestReviews(input: unknown) {
      const payload = validateGetRequiredPullRequestReviewsInput(input);
      const result = await read(client, `${protection(payload)}/required_pull_request_reviews`, "branches.protection.required_pull_request_reviews.get", "GitHub pull request review protection was not found.");
      if (!result.ok) return result;
      if (!isRecord(result.body)) return upstream("GitHub rejected the branches.protection.required_pull_request_reviews.get request.");
      const body = result.body;
      return {
        ok: true as const,
        reviews: {
          url: typeof body.url === "string" ? body.url : "",
          dismiss_stale_reviews: body.dismiss_stale_reviews === true,
          require_code_owner_reviews: body.require_code_owner_reviews === true,
          required_approving_review_count: typeof body.required_approving_review_count === "number" ? body.required_approving_review_count : 0,
          require_last_push_approval: body.require_last_push_approval === true,
        },
      };
    },
    async getRequiredStatusChecks(input: unknown) {
      const payload = validateGetRequiredStatusChecksInput(input);
      const result = await read(client, `${protection(payload)}/required_status_checks`, "branches.protection.required_status_checks.get", "GitHub required status checks were not found.");
      if (!result.ok) return result;
      if (!isRecord(result.body)) return upstream("GitHub rejected the branches.protection.required_status_checks.get request.");
      const contexts = Array.isArray(result.body.contexts) ? result.body.contexts.filter((item): item is string => typeof item === "string") : [];
      const checks = arrayOf(result.body.checks).map((item) => ({
        context: typeof item.context === "string" ? item.context : "",
        app_id: typeof item.app_id === "number" ? item.app_id : null,
      }));
      return {
        ok: true as const,
        checks: {
          url: typeof result.body.url === "string" ? result.body.url : "",
          strict: result.body.strict === true,
          contexts,
          checks,
        },
      };
    },
    async listBranchProtectionTeams(input: unknown) {
      const payload = validateListBranchProtectionTeamsInput(input);
      const result = await read(client, `${protection(payload)}/restrictions/teams${pageQuery(payload)}`, "branches.protection.restrictions.teams.list", "GitHub branch restriction teams were not found.");
      if (!result.ok) return result;
      if (!Array.isArray(result.body)) return upstream("GitHub rejected the branches.protection.restrictions.teams.list request.");
      return { ok: true as const, teams: result.body.filter(isRecord).map((team) => normalizeGitHubTeam(team as GitHubTeam)) };
    },
    async listBranchProtectionUsers(input: unknown) {
      const payload = validateListBranchProtectionUsersInput(input);
      const result = await read(client, `${protection(payload)}/restrictions/users${pageQuery(payload)}`, "branches.protection.restrictions.users.list", "GitHub branch restriction users were not found.");
      if (!result.ok) return result;
      if (!Array.isArray(result.body)) return upstream("GitHub rejected the branches.protection.restrictions.users.list request.");
      return { ok: true as const, users: result.body.filter(isRecord).map((user) => normalizeGitHubUser(user as GitHubUser)) };
    },
    async listUserProjectFields(input: unknown) {
      const payload = validateListUserProjectFieldsInput(input);
      const path = `/users/${encodeURIComponent(payload.username)}/projectsV2/${payload.projectNumber}/fields${pageQuery(payload)}`;
      const result = await read(client, path, "users.projects_v2.fields.list", "GitHub project fields were not found.");
      if (!result.ok) return result;
      if (!Array.isArray(result.body)) return upstream("GitHub rejected the users.projects_v2.fields.list request.");
      const fields = result.body.filter(isRecord).map((item) => ({
        id: typeof item.id === "number" ? item.id : 0,
        node_id: typeof item.node_id === "string" ? item.node_id : "",
        name: typeof item.name === "string" ? item.name : "",
        data_type: typeof item.data_type === "string" ? item.data_type : "",
        project_url: typeof item.project_url === "string" ? item.project_url : "",
      }));
      return { ok: true as const, fields };
    },
  };
}

export const CARD5_SECRET_LISTS = SECRET_LISTS;

async function secretList(client: GitHubClient, path: string, operation: string, missing: string) {
  const result = await read(client, path, operation, missing);
  if (!result.ok) return result;
  if (!isRecord(result.body) || !Array.isArray(result.body.secrets)) return upstream(`GitHub rejected the ${operation} request.`);
  const secrets = result.body.secrets.filter(isRecord).map(normalizeActionsSecretName);
  return {
    ok: true as const,
    total_count: typeof result.body.total_count === "number" ? result.body.total_count : secrets.length,
    secrets,
  };
}

async function enabled(client: GitHubClient, path: string, operation: string, missing: string) {
  const result = await read(client, path, operation, missing);
  if (!result.ok) return result;
  if (!isRecord(result.body)) return upstream(`GitHub rejected the ${operation} request.`);
  return {
    ok: true as const,
    url: typeof result.body.url === "string" ? result.body.url : "",
    enabled: result.body.enabled === true,
  };
}

async function read(client: GitHubClient, path: string, operation: string, missing: string) {
  const response = await client.fetchJSON(path);
  const limited = rate(response.status, response.headers);
  if (limited) return limited;
  if (response.status === 404) return upstream(missing);
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
  return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message } };
}

function repositoryIdentity(item: Record<string, unknown>) {
  return {
    id: typeof item.id === "number" ? item.id : 0,
    name: typeof item.name === "string" ? item.name : "",
    full_name: typeof item.full_name === "string" ? item.full_name : "",
    private: item.private === true,
    html_url: typeof item.html_url === "string" ? item.html_url : "",
  };
}

function appIdentity(item: Record<string, unknown>) {
  return {
    id: typeof item.id === "number" ? item.id : 0,
    slug: typeof item.slug === "string" ? item.slug : "",
    node_id: typeof item.node_id === "string" ? item.node_id : "",
    name: typeof item.name === "string" ? item.name : "",
    integration_url: typeof item.integration_url === "string" ? item.integration_url : "",
  };
}

function arrayOf(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function repoPath(payload: Repo): string {
  return `/repos/${encodeURIComponent(payload.owner)}/${encodeURIComponent(payload.repo)}`;
}

function protection(payload: Branch): string {
  return `${repoPath(payload)}/branches/${encodeURIComponent(payload.branch)}/protection`;
}

function pageQuery(payload: Page): string {
  const params = new URLSearchParams();
  if (payload.perPage) params.set("per_page", String(payload.perPage));
  if (payload.page) params.set("page", String(payload.page));
  const text = params.toString();
  return text ? `?${text}` : "";
}

function repoPage(input: unknown, operation: string): RepoPage {
  if (!isRecord(input)) throw new Error(`${operation} input must be an object`);
  return { ...repoOf(input), ...pageOf(input) };
}

function environmentPage(input: unknown, operation: string): EnvironmentPage {
  if (!isRecord(input)) throw new Error(`${operation} input must be an object`);
  return { ...environmentOf(input), ...pageOf(input) };
}

function branchPage(input: unknown, operation: string): BranchPage {
  if (!isRecord(input)) throw new Error(`${operation} input must be an object`);
  return { ...branchFields(input), ...pageOf(input) };
}

function branchOf(input: unknown, operation: string): Branch {
  if (!isRecord(input)) throw new Error(`${operation} input must be an object`);
  return branchFields(input);
}

function repoOf(input: Record<string, unknown>): Repo {
  return { owner: segment(input.owner, "owner"), repo: segment(input.repo, "repo") };
}

function environmentOf(input: Record<string, unknown>): Environment {
  return { ...repoOf(input), environmentName: requiredText(input.environmentName, "environmentName") };
}

function branchFields(input: Record<string, unknown>): Branch {
  return { ...repoOf(input), branch: requiredText(input.branch, "branch") };
}

function pageOf(input: Record<string, unknown>): Page {
  return {
    perPage: optionalPage(input.perPage, "perPage"),
    page: optionalPage(input.page, "page", 1_000_000),
  };
}

function segment(value: unknown, field: string): string {
  const text = requiredText(value, field);
  if (text.includes("/") || text.includes("?") || text.includes("#")) {
    throw new Error(`${field} must be a single path segment`);
  }
  return text;
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function positiveInt(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new Error(`${field} must be a positive integer`);
  }
  return value;
}

function optionalPage(value: unknown, field: string, max = 100): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > max) {
    throw new Error(`${field} must be an integer between 1 and ${max}`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
