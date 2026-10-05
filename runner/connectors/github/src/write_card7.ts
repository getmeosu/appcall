import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";

type MilestoneRef = { owner: string; repo: string; milestoneNumber: number };
type OrgRef = { org: string };
type RepoRef = { owner: string; repo: string };
type InstallationRepository = { installationId: number; repositoryId: number };

export function validateDeleteMilestoneInput(input: unknown): MilestoneRef {
  if (!isRecord(input)) throw new Error("milestones.delete input must be an object");
  return {
    owner: requireSingleSegment(input.owner, "owner"),
    repo: requireSingleSegment(input.repo, "repo"),
    milestoneNumber: requireId(input.milestoneNumber, "milestoneNumber"),
  };
}

export function validateCreateOrgRunnerRegistrationTokenInput(input: unknown): OrgRef {
  if (!isRecord(input)) throw new Error("orgs.actions.runners.registration_token.create input must be an object");
  return { org: requireSingleSegment(input.org, "org") };
}

export function validateCreateRepoRunnerRegistrationTokenInput(input: unknown): RepoRef {
  if (!isRecord(input)) throw new Error("repos.actions.runners.registration_token.create input must be an object");
  return {
    owner: requireSingleSegment(input.owner, "owner"),
    repo: requireSingleSegment(input.repo, "repo"),
  };
}

export function validateCreateOrgRunnerRemoveTokenInput(input: unknown): OrgRef {
  if (!isRecord(input)) throw new Error("orgs.actions.runners.remove_token.create input must be an object");
  return { org: requireSingleSegment(input.org, "org") };
}

export function validateCreateRepoRunnerRemoveTokenInput(input: unknown): RepoRef {
  if (!isRecord(input)) throw new Error("repos.actions.runners.remove_token.create input must be an object");
  return {
    owner: requireSingleSegment(input.owner, "owner"),
    repo: requireSingleSegment(input.repo, "repo"),
  };
}

export function validateAddInstallationRepositoryInput(input: unknown): InstallationRepository {
  if (!isRecord(input)) throw new Error("user.installations.repositories.add input must be an object");
  return {
    installationId: requireId(input.installationId, "installationId"),
    repositoryId: requireId(input.repositoryId, "repositoryId"),
  };
}

export function validateRemoveInstallationRepositoryInput(input: unknown): InstallationRepository {
  if (!isRecord(input)) throw new Error("user.installations.repositories.remove input must be an object");
  return {
    installationId: requireId(input.installationId, "installationId"),
    repositoryId: requireId(input.repositoryId, "repositoryId"),
  };
}

export function createWriteCard7Client(options: { accessToken: string; fetch?: typeof fetch; githubClient?: GitHubClient }) {
  const base = options.githubClient;
  const clientFor = (operation: string) => base ?? createGitHubClient({
    accessToken: options.accessToken,
    fetch: options.fetch,
    operation,
  });

  async function runnerToken(operation: string, path: string, missing: string, rejected: string) {
    const response = await clientFor(operation).fetchJSON(path, { method: "POST" });
    // Pass the upstream body ({token, expires_at}) through untouched. Never log or echo it.
    if (response.status === 201 && isRecord(response.body)) {
      return { ok: true as const, body: response.body };
    }
    if (response.status === 404) return upstream(missing);
    return mapRateOrUpstream(response, rejected);
  }

  return {
    async deleteMilestone(input: unknown) {
      const payload = validateDeleteMilestoneInput(input);
      const response = await clientFor("milestones.delete").fetchJSON(
        `/repos/${encodeURIComponent(payload.owner)}/${encodeURIComponent(payload.repo)}/milestones/${payload.milestoneNumber}`,
        { method: "DELETE" },
      );
      return noContent(
        response,
        204,
        { deleted: true, owner: payload.owner, repo: payload.repo, milestoneNumber: payload.milestoneNumber },
        "Milestone was not found.",
        "GitHub rejected the delete milestone request.",
      );
    },
    async createOrgRunnerRegistrationToken(input: unknown) {
      const payload = validateCreateOrgRunnerRegistrationTokenInput(input);
      return runnerToken(
        "orgs.actions.runners.registration_token.create",
        `/orgs/${encodeURIComponent(payload.org)}/actions/runners/registration-token`,
        "Organization was not found.",
        "GitHub rejected the create organization runner registration token request.",
      );
    },
    async createRepoRunnerRegistrationToken(input: unknown) {
      const payload = validateCreateRepoRunnerRegistrationTokenInput(input);
      return runnerToken(
        "repos.actions.runners.registration_token.create",
        `/repos/${encodeURIComponent(payload.owner)}/${encodeURIComponent(payload.repo)}/actions/runners/registration-token`,
        "Repository was not found.",
        "GitHub rejected the create repository runner registration token request.",
      );
    },
    async createOrgRunnerRemoveToken(input: unknown) {
      const payload = validateCreateOrgRunnerRemoveTokenInput(input);
      return runnerToken(
        "orgs.actions.runners.remove_token.create",
        `/orgs/${encodeURIComponent(payload.org)}/actions/runners/remove-token`,
        "Organization was not found.",
        "GitHub rejected the create organization runner remove token request.",
      );
    },
    async createRepoRunnerRemoveToken(input: unknown) {
      const payload = validateCreateRepoRunnerRemoveTokenInput(input);
      return runnerToken(
        "repos.actions.runners.remove_token.create",
        `/repos/${encodeURIComponent(payload.owner)}/${encodeURIComponent(payload.repo)}/actions/runners/remove-token`,
        "Repository was not found.",
        "GitHub rejected the create repository runner remove token request.",
      );
    },
    async addInstallationRepository(input: unknown) {
      const payload = validateAddInstallationRepositoryInput(input);
      const response = await clientFor("user.installations.repositories.add").fetchJSON(
        `/user/installations/${payload.installationId}/repositories/${payload.repositoryId}`,
        { method: "PUT" },
      );
      return noContent(
        response,
        204,
        { added: true, installationId: payload.installationId, repositoryId: payload.repositoryId },
        "Installation or repository was not found. GitHub requires a classic personal access token with repo scope.",
        "GitHub rejected the add installation repository request. GitHub requires a classic personal access token with repo scope.",
      );
    },
    async removeInstallationRepository(input: unknown) {
      const payload = validateRemoveInstallationRepositoryInput(input);
      const response = await clientFor("user.installations.repositories.remove").fetchJSON(
        `/user/installations/${payload.installationId}/repositories/${payload.repositoryId}`,
        { method: "DELETE" },
      );
      return noContent(
        response,
        204,
        { removed: true, installationId: payload.installationId, repositoryId: payload.repositoryId },
        "Installation or repository was not found. GitHub requires a classic personal access token with repo scope.",
        "GitHub rejected the remove installation repository request. GitHub requires a classic personal access token with repo scope.",
      );
    },
  };
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

function requireId(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${field} must be a positive integer`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
