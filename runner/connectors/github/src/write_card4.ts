import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";

type OwnerRepo = { owner: string; repo: string };
type BranchScope = OwnerRepo & { branch: string };
type SecretName = { secretName: string };

export type RemoveCodespaceSecretRepositoryInput = SecretName & { repositoryId: number };
export type SetCodespaceSecretRepositoriesInput = SecretName & { selectedRepositoryIds: number[] };
export type AddRestrictionAppsInput = BranchScope & { apps: string[] };
export type AddStatusCheckContextsInput = BranchScope & { contexts: string[] };
export type AddRestrictionTeamsInput = BranchScope & { teams: string[] };
export type AddRestrictionUsersInput = BranchScope & { users: string[] };
export type BranchProtectionInput = BranchScope;

export function validateRemoveCodespaceSecretRepositoryInput(input: unknown): RemoveCodespaceSecretRepositoryInput {
  if (!isRecord(input)) throw new Error("user.codespaces.secrets.repositories.remove input must be an object");
  return {
    secretName: requireSingleSegment(input.secretName, "secretName"),
    repositoryId: requireId(input.repositoryId, "repositoryId"),
  };
}

export function validateSetCodespaceSecretRepositoriesInput(input: unknown): SetCodespaceSecretRepositoriesInput {
  if (!isRecord(input)) throw new Error("user.codespaces.secrets.repositories.set input must be an object");
  return {
    secretName: requireSingleSegment(input.secretName, "secretName"),
    selectedRepositoryIds: requireIdList(input.selectedRepositoryIds, "selectedRepositoryIds"),
  };
}

export function validateAddRestrictionAppsInput(input: unknown): AddRestrictionAppsInput {
  if (!isRecord(input)) throw new Error("branches.protection.restrictions.apps.add input must be an object");
  return { ...branchScope(input), apps: requireSlugList(input.apps, "apps") };
}

export function validateAddStatusCheckContextsInput(input: unknown): AddStatusCheckContextsInput {
  if (!isRecord(input)) throw new Error("branches.protection.required_status_checks.contexts.add input must be an object");
  return { ...branchScope(input), contexts: requireStringList(input.contexts, "contexts") };
}

export function validateAddRestrictionTeamsInput(input: unknown): AddRestrictionTeamsInput {
  if (!isRecord(input)) throw new Error("branches.protection.restrictions.teams.add input must be an object");
  return { ...branchScope(input), teams: requireSlugList(input.teams, "teams") };
}

export function validateAddRestrictionUsersInput(input: unknown): AddRestrictionUsersInput {
  if (!isRecord(input)) throw new Error("branches.protection.restrictions.users.add input must be an object");
  return { ...branchScope(input), users: requireSlugList(input.users, "users") };
}

export function validateCreateRequiredSignaturesInput(input: unknown): BranchProtectionInput {
  if (!isRecord(input)) throw new Error("branches.protection.required_signatures.create input must be an object");
  return branchScope(input);
}

export function validateDeleteRestrictionsInput(input: unknown): BranchProtectionInput {
  if (!isRecord(input)) throw new Error("branches.protection.restrictions.delete input must be an object");
  return branchScope(input);
}

export function validateDeleteEnforceAdminsInput(input: unknown): BranchProtectionInput {
  if (!isRecord(input)) throw new Error("branches.protection.enforce_admins.delete input must be an object");
  return branchScope(input);
}

export function validateDeleteBranchProtectionInput(input: unknown): BranchProtectionInput {
  if (!isRecord(input)) throw new Error("branches.protection.delete input must be an object");
  return branchScope(input);
}

export function validateDeleteRequiredSignaturesInput(input: unknown): BranchProtectionInput {
  if (!isRecord(input)) throw new Error("branches.protection.required_signatures.delete input must be an object");
  return branchScope(input);
}

export function validateDeleteRequiredPullRequestReviewsInput(input: unknown): BranchProtectionInput {
  if (!isRecord(input)) throw new Error("branches.protection.required_pull_request_reviews.delete input must be an object");
  return branchScope(input);
}

export function createWriteCard4Client(options: { accessToken: string; fetch?: typeof fetch; githubClient?: GitHubClient }) {
  const base = options.githubClient;
  const clientFor = (operation: string) => base ?? createGitHubClient({
    accessToken: options.accessToken,
    fetch: options.fetch,
    operation,
  });

  return {
    async removeCodespaceSecretRepository(input: unknown) {
      const payload = validateRemoveCodespaceSecretRepositoryInput(input);
      const response = await clientFor("user.codespaces.secrets.repositories.remove").fetchJSON(
        `/user/codespaces/secrets/${encodeURIComponent(payload.secretName)}/repositories/${payload.repositoryId}`,
        { method: "DELETE" },
      );
      return noContent(
        response,
        204,
        { removed: true, secretName: payload.secretName, repositoryId: payload.repositoryId },
        "Codespace secret repository was not found.",
        "GitHub rejected the remove codespace secret repository request.",
      );
    },
    async setCodespaceSecretRepositories(input: unknown) {
      const payload = validateSetCodespaceSecretRepositoriesInput(input);
      const response = await clientFor("user.codespaces.secrets.repositories.set").fetchJSON(
        `/user/codespaces/secrets/${encodeURIComponent(payload.secretName)}/repositories`,
        jsonInit("PUT", { selected_repository_ids: payload.selectedRepositoryIds }),
      );
      return noContent(
        response,
        204,
        { set: true, secretName: payload.secretName, selectedRepositoryIds: payload.selectedRepositoryIds },
        "Codespace secret was not found.",
        "GitHub rejected the set codespace secret repositories request.",
      );
    },
    async addRestrictionApps(input: unknown) {
      const payload = validateAddRestrictionAppsInput(input);
      const response = await clientFor("branches.protection.restrictions.apps.add").fetchJSON(
        protectionPath(payload, "/restrictions/apps"),
        jsonInit("POST", { apps: payload.apps }),
      );
      return jsonArray(response, 200, "apps", "Branch protection was not found.", "GitHub rejected the add app access restrictions request.");
    },
    async addStatusCheckContexts(input: unknown) {
      const payload = validateAddStatusCheckContextsInput(input);
      const response = await clientFor("branches.protection.required_status_checks.contexts.add").fetchJSON(
        protectionPath(payload, "/required_status_checks/contexts"),
        jsonInit("POST", { contexts: payload.contexts }),
      );
      return jsonArray(response, 200, "contexts", "Branch protection was not found.", "GitHub rejected the add status check contexts request.");
    },
    async addRestrictionTeams(input: unknown) {
      const payload = validateAddRestrictionTeamsInput(input);
      const response = await clientFor("branches.protection.restrictions.teams.add").fetchJSON(
        protectionPath(payload, "/restrictions/teams"),
        jsonInit("POST", { teams: payload.teams }),
      );
      return jsonArray(response, 200, "teams", "Branch protection was not found.", "GitHub rejected the add team access restrictions request.");
    },
    async addRestrictionUsers(input: unknown) {
      const payload = validateAddRestrictionUsersInput(input);
      const response = await clientFor("branches.protection.restrictions.users.add").fetchJSON(
        protectionPath(payload, "/restrictions/users"),
        jsonInit("POST", { users: payload.users }),
      );
      return jsonArray(response, 200, "users", "Branch protection was not found.", "GitHub rejected the add user access restrictions request.");
    },
    async createRequiredSignatures(input: unknown) {
      const payload = validateCreateRequiredSignaturesInput(input);
      const response = await clientFor("branches.protection.required_signatures.create").fetchJSON(
        protectionPath(payload, "/required_signatures"),
        { method: "POST" },
      );
      return jsonBody(response, 200, "protection", "Branch protection was not found.", "GitHub rejected the create commit signature protection request.");
    },
    async deleteRestrictions(input: unknown) {
      const payload = validateDeleteRestrictionsInput(input);
      const response = await clientFor("branches.protection.restrictions.delete").fetchJSON(
        protectionPath(payload, "/restrictions"),
        { method: "DELETE" },
      );
      return noContent(response, 204, deleted(payload), "Access restrictions were not found.", "GitHub rejected the delete access restrictions request.");
    },
    async deleteEnforceAdmins(input: unknown) {
      const payload = validateDeleteEnforceAdminsInput(input);
      const response = await clientFor("branches.protection.enforce_admins.delete").fetchJSON(
        protectionPath(payload, "/enforce_admins"),
        { method: "DELETE" },
      );
      return noContent(response, 204, deleted(payload), "Admin branch protection was not found.", "GitHub rejected the delete admin branch protection request.");
    },
    async deleteBranchProtection(input: unknown) {
      const payload = validateDeleteBranchProtectionInput(input);
      const response = await clientFor("branches.protection.delete").fetchJSON(
        protectionPath(payload, ""),
        { method: "DELETE" },
      );
      return noContent(response, 204, deleted(payload), "Branch protection was not found.", "GitHub rejected the delete branch protection request.");
    },
    async deleteRequiredSignatures(input: unknown) {
      const payload = validateDeleteRequiredSignaturesInput(input);
      const response = await clientFor("branches.protection.required_signatures.delete").fetchJSON(
        protectionPath(payload, "/required_signatures"),
        { method: "DELETE" },
      );
      return noContent(response, 204, deleted(payload), "Commit signature protection was not found.", "GitHub rejected the delete commit signature protection request.");
    },
    async deleteRequiredPullRequestReviews(input: unknown) {
      const payload = validateDeleteRequiredPullRequestReviewsInput(input);
      const response = await clientFor("branches.protection.required_pull_request_reviews.delete").fetchJSON(
        protectionPath(payload, "/required_pull_request_reviews"),
        { method: "DELETE" },
      );
      return noContent(response, 204, deleted(payload), "Pull request review protection was not found.", "GitHub rejected the delete pull request review protection request.");
    },
  };
}

function deleted(payload: BranchProtectionInput): Record<string, unknown> {
  return { deleted: true, owner: payload.owner, repo: payload.repo, branch: payload.branch };
}

function protectionPath(payload: BranchProtectionInput, suffix: string): string {
  return `/repos/${encodeURIComponent(payload.owner)}/${encodeURIComponent(payload.repo)}/branches/${encodeURIComponent(payload.branch)}/protection${suffix}`;
}

function jsonInit(method: string, body: Record<string, unknown>): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

function jsonBody(
  response: { status: number; headers: Record<string, string>; body: unknown },
  success: number,
  field: string,
  missing: string,
  rejected: string,
) {
  if (response.status === success && isRecord(response.body)) {
    return { ok: true as const, [field]: response.body };
  }
  if (response.status === 404) return upstream(missing);
  return mapRateOrUpstream(response, rejected);
}

function jsonArray(
  response: { status: number; headers: Record<string, string>; body: unknown },
  success: number,
  field: string,
  missing: string,
  rejected: string,
) {
  if (response.status === success && Array.isArray(response.body)) {
    return { ok: true as const, [field]: response.body };
  }
  if (response.status === 404) return upstream(missing);
  return mapRateOrUpstream(response, rejected);
}

function noContent(
  response: { status: number; headers: Record<string, string> },
  success: number,
  value: Record<string, unknown>,
  missing: string,
  rejected: string,
) {
  if (response.status === success) return { ok: true as const, ...value };
  if (response.status === 404) return upstream(missing);
  return mapRateOrUpstream(response, rejected);
}

function branchScope(input: Record<string, unknown>): BranchProtectionInput {
  return {
    owner: requireSingleSegment(input.owner, "owner"),
    repo: requireSingleSegment(input.repo, "repo"),
    branch: requirePathText(input.branch, "branch"),
  };
}

function upstream(message: string) {
  return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message } };
}

function mapRateOrUpstream(response: { status: number; headers: Record<string, string> }, message: string) {
  if (response.status === 429 || (response.status === 403 && parseGitHubRateLimit(response.status, response.headers).limited)) {
    const rateLimit = parseGitHubRateLimit(response.status, response.headers);
    return {
      ok: false as const,
      error: {
        code: "CONNECTOR_RATE_LIMITED" as const,
        message: "GitHub rate limit exceeded.",
        retryAfterSeconds: rateLimit.limited ? rateLimit.retryAfterSeconds : undefined,
      },
    };
  }
  return upstream(message);
}

function requireSingleSegment(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  if (value.includes("/") || value.includes("?") || value.includes("#")) {
    throw new Error(`${field} must be a single path segment`);
  }
  return value;
}

function requirePathText(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  if (value.includes("?") || value.includes("#")) throw new Error(`${field} must not include a query or fragment`);
  return value;
}

function requireStringList(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== "string" || item.length === 0)) {
    throw new Error(`${field} must be a non-empty array of strings`);
  }
  return value;
}

function requireSlugList(value: unknown, field: string): string[] {
  const items = requireStringList(value, field);
  for (const item of items) requireSingleSegment(item, field);
  return items;
}

function requireId(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${field} must be a positive integer`);
  }
  return value;
}

function requireIdList(value: unknown, field: string): number[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${field} must be a non-empty array of integers`);
  return value.map((id) => requireId(id, field));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
