import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";

type OwnerRepo = { owner: string; repo: string };
type SecretName = { secretName: string };
type EnvironmentSecret = OwnerRepo & { environmentName: string } & SecretName;

export type AddEmailsInput = { emails: string[] };
export type AddSocialAccountsInput = { accountUrls: string[] };
export type UsernameInput = { username: string };
export type AddCodespaceSecretRepositoryInput = SecretName & { repositoryId: number };
export type UpsertEnvironmentSecretInput = EnvironmentSecret & { encryptedValue: string; keyId: string };
export type UpsertCodespaceSecretInput = SecretName & {
  keyId: string;
  encryptedValue?: string;
  selectedRepositoryIds?: number[];
};
export type DeleteSocialAccountsInput = { accountUrls: string[] };
export type UnlockUserMigrationRepoInput = { migrationId: number; repoName: string };
export type DeleteCodespaceSecretInput = SecretName;
export type DeleteEnvironmentSecretInput = EnvironmentSecret;
export type UpdateAuthenticatedUserInput = {
  name?: string;
  email?: string;
  blog?: string;
  twitterUsername?: string | null;
  company?: string;
  location?: string;
  hireable?: boolean;
  bio?: string;
};

export function validateAddEmailsInput(input: unknown): AddEmailsInput {
  if (!isRecord(input)) throw new Error("user.emails.create input must be an object");
  return { emails: requireStringList(input.emails, "emails") };
}

export function validateAddSocialAccountsInput(input: unknown): AddSocialAccountsInput {
  if (!isRecord(input)) throw new Error("user.social_accounts.add input must be an object");
  return { accountUrls: requireStringList(input.accountUrls, "accountUrls") };
}

export function validateBlockUserInput(input: unknown): UsernameInput {
  if (!isRecord(input)) throw new Error("user.blocks.block input must be an object");
  return { username: requireSingleSegment(input.username, "username") };
}

export function validateAddCodespaceSecretRepositoryInput(input: unknown): AddCodespaceSecretRepositoryInput {
  if (!isRecord(input)) throw new Error("user.codespaces.secrets.repositories.add input must be an object");
  return {
    secretName: requireSingleSegment(input.secretName, "secretName"),
    repositoryId: requireId(input.repositoryId, "repositoryId"),
  };
}

export function validateUpsertEnvironmentSecretInput(input: unknown): UpsertEnvironmentSecretInput {
  if (!isRecord(input)) throw new Error("repos.environments.secrets.create_or_update input must be an object");
  return {
    ...ownerRepo(input),
    environmentName: requirePathText(input.environmentName, "environmentName"),
    secretName: requireSingleSegment(input.secretName, "secretName"),
    encryptedValue: requireString(input.encryptedValue, "encryptedValue"),
    keyId: requireString(input.keyId, "keyId"),
  };
}

export function validateUpsertCodespaceSecretInput(input: unknown): UpsertCodespaceSecretInput {
  if (!isRecord(input)) throw new Error("user.codespaces.secrets.create_or_update input must be an object");
  let selectedRepositoryIds: number[] | undefined;
  if (input.selectedRepositoryIds !== undefined) {
    if (!Array.isArray(input.selectedRepositoryIds)) throw new Error("selectedRepositoryIds must be an array");
    selectedRepositoryIds = input.selectedRepositoryIds.map((id) => requireId(id, "selectedRepositoryIds"));
  }
  return {
    secretName: requireSingleSegment(input.secretName, "secretName"),
    keyId: requireString(input.keyId, "keyId"),
    encryptedValue: optionalString(input.encryptedValue, "encryptedValue"),
    selectedRepositoryIds,
  };
}

export function validateDeleteSocialAccountsInput(input: unknown): DeleteSocialAccountsInput {
  if (!isRecord(input)) throw new Error("user.social_accounts.delete input must be an object");
  return { accountUrls: requireStringList(input.accountUrls, "accountUrls") };
}

export function validateUnblockUserInput(input: unknown): UsernameInput {
  if (!isRecord(input)) throw new Error("user.blocks.unblock input must be an object");
  return { username: requireSingleSegment(input.username, "username") };
}

export function validateUnlockUserMigrationRepoInput(input: unknown): UnlockUserMigrationRepoInput {
  if (!isRecord(input)) throw new Error("user.migrations.repos.unlock input must be an object");
  return {
    migrationId: requireId(input.migrationId, "migrationId"),
    repoName: requireSingleSegment(input.repoName, "repoName"),
  };
}

export function validateDeleteCodespaceSecretInput(input: unknown): DeleteCodespaceSecretInput {
  if (!isRecord(input)) throw new Error("user.codespaces.secrets.delete input must be an object");
  return { secretName: requireSingleSegment(input.secretName, "secretName") };
}

export function validateDeleteEnvironmentSecretInput(input: unknown): DeleteEnvironmentSecretInput {
  if (!isRecord(input)) throw new Error("repos.environments.secrets.delete input must be an object");
  return {
    ...ownerRepo(input),
    environmentName: requirePathText(input.environmentName, "environmentName"),
    secretName: requireSingleSegment(input.secretName, "secretName"),
  };
}

export function validateUpdateAuthenticatedUserInput(input: unknown): UpdateAuthenticatedUserInput {
  if (!isRecord(input)) throw new Error("user.update input must be an object");
  if ("login" in input) throw new Error("user.update cannot change the user login");
  return {
    name: optionalString(input.name, "name"),
    email: optionalString(input.email, "email"),
    blog: optionalString(input.blog, "blog"),
    twitterUsername: optionalNullableString(input.twitterUsername, "twitterUsername"),
    company: optionalString(input.company, "company"),
    location: optionalString(input.location, "location"),
    hireable: optionalBoolean(input.hireable, "hireable"),
    bio: optionalString(input.bio, "bio"),
  };
}

export function createWriteCard3Client(options: { accessToken: string; fetch?: typeof fetch; githubClient?: GitHubClient }) {
  const base = options.githubClient;
  const clientFor = (operation: string) => base ?? createGitHubClient({
    accessToken: options.accessToken,
    fetch: options.fetch,
    operation,
  });

  return {
    async addEmails(input: unknown) {
      const payload = validateAddEmailsInput(input);
      const response = await clientFor("user.emails.create").fetchJSON("/user/emails", jsonInit("POST", { emails: payload.emails }));
      return jsonArray(response, 201, "emails", "Email addresses were not found.", "GitHub rejected the add email addresses request.");
    },
    async addSocialAccounts(input: unknown) {
      const payload = validateAddSocialAccountsInput(input);
      const response = await clientFor("user.social_accounts.add").fetchJSON(
        "/user/social_accounts",
        jsonInit("POST", { account_urls: payload.accountUrls }),
      );
      return jsonArray(response, 201, "accounts", "Social accounts were not found.", "GitHub rejected the add social accounts request.");
    },
    async blockUser(input: unknown) {
      const payload = validateBlockUserInput(input);
      const response = await clientFor("user.blocks.block").fetchJSON(
        `/user/blocks/${encodeURIComponent(payload.username)}`,
        { method: "PUT" },
      );
      return noContent(response, 204, { blocked: true, username: payload.username }, "User was not found.", "GitHub rejected the block user request.");
    },
    async addCodespaceSecretRepository(input: unknown) {
      const payload = validateAddCodespaceSecretRepositoryInput(input);
      const response = await clientFor("user.codespaces.secrets.repositories.add").fetchJSON(
        `/user/codespaces/secrets/${encodeURIComponent(payload.secretName)}/repositories/${payload.repositoryId}`,
        { method: "PUT" },
      );
      return noContent(
        response,
        204,
        { added: true, secretName: payload.secretName, repositoryId: payload.repositoryId },
        "Codespace secret repository was not found.",
        "GitHub rejected the add codespace secret repository request.",
      );
    },
    async upsertEnvironmentSecret(input: unknown) {
      const payload = validateUpsertEnvironmentSecretInput(input);
      const response = await clientFor("repos.environments.secrets.create_or_update").fetchJSON(
        `${repoPath(payload.owner, payload.repo)}/environments/${encodeURIComponent(payload.environmentName)}/secrets/${encodeURIComponent(payload.secretName)}`,
        jsonInit("PUT", { encrypted_value: payload.encryptedValue, key_id: payload.keyId }),
      );
      return emptyUpsert(
        response,
        { upserted: true, owner: payload.owner, repo: payload.repo, environmentName: payload.environmentName, secretName: payload.secretName },
        "Environment secret was not found.",
        "GitHub rejected the create or update environment secret request.",
      );
    },
    async upsertCodespaceSecret(input: unknown) {
      const payload = validateUpsertCodespaceSecretInput(input);
      const body: Record<string, unknown> = { key_id: payload.keyId };
      if (payload.encryptedValue !== undefined) body.encrypted_value = payload.encryptedValue;
      if (payload.selectedRepositoryIds !== undefined) body.selected_repository_ids = payload.selectedRepositoryIds;
      const response = await clientFor("user.codespaces.secrets.create_or_update").fetchJSON(
        `/user/codespaces/secrets/${encodeURIComponent(payload.secretName)}`,
        jsonInit("PUT", body),
      );
      return emptyUpsert(
        response,
        { upserted: true, secretName: payload.secretName },
        "Codespace secret was not found.",
        "GitHub rejected the create or update codespace secret request.",
      );
    },
    async deleteSocialAccounts(input: unknown) {
      const payload = validateDeleteSocialAccountsInput(input);
      const response = await clientFor("user.social_accounts.delete").fetchJSON(
        "/user/social_accounts",
        jsonInit("DELETE", { account_urls: payload.accountUrls }),
      );
      return noContent(response, 204, { deleted: true }, "Social accounts were not found.", "GitHub rejected the delete social accounts request.");
    },
    async unblockUser(input: unknown) {
      const payload = validateUnblockUserInput(input);
      const response = await clientFor("user.blocks.unblock").fetchJSON(
        `/user/blocks/${encodeURIComponent(payload.username)}`,
        { method: "DELETE" },
      );
      return noContent(response, 204, { unblocked: true, username: payload.username }, "Blocked user was not found.", "GitHub rejected the unblock user request.");
    },
    async unlockUserMigrationRepo(input: unknown) {
      const payload = validateUnlockUserMigrationRepoInput(input);
      const response = await clientFor("user.migrations.repos.unlock").fetchJSON(
        `/user/migrations/${payload.migrationId}/repos/${encodeURIComponent(payload.repoName)}/lock`,
        { method: "DELETE" },
      );
      return noContent(
        response,
        204,
        { unlocked: true, migrationId: payload.migrationId, repoName: payload.repoName },
        "Locked repository was not found.",
        "GitHub rejected the unlock user repository request.",
      );
    },
    async deleteCodespaceSecret(input: unknown) {
      const payload = validateDeleteCodespaceSecretInput(input);
      const response = await clientFor("user.codespaces.secrets.delete").fetchJSON(
        `/user/codespaces/secrets/${encodeURIComponent(payload.secretName)}`,
        { method: "DELETE" },
      );
      return noContent(
        response,
        204,
        { deleted: true, secretName: payload.secretName },
        "Codespace secret was not found.",
        "GitHub rejected the delete codespace secret request.",
      );
    },
    async deleteEnvironmentSecret(input: unknown) {
      const payload = validateDeleteEnvironmentSecretInput(input);
      const response = await clientFor("repos.environments.secrets.delete").fetchJSON(
        `${repoPath(payload.owner, payload.repo)}/environments/${encodeURIComponent(payload.environmentName)}/secrets/${encodeURIComponent(payload.secretName)}`,
        { method: "DELETE" },
      );
      return noContent(
        response,
        204,
        { deleted: true, owner: payload.owner, repo: payload.repo, environmentName: payload.environmentName, secretName: payload.secretName },
        "Environment secret was not found.",
        "GitHub rejected the delete environment secret request.",
      );
    },
    async updateAuthenticatedUser(input: unknown) {
      const payload = validateUpdateAuthenticatedUserInput(input);
      const body: Record<string, unknown> = {};
      if (payload.name !== undefined) body.name = payload.name;
      if (payload.email !== undefined) body.email = payload.email;
      if (payload.blog !== undefined) body.blog = payload.blog;
      if (payload.twitterUsername !== undefined) body.twitter_username = payload.twitterUsername;
      if (payload.company !== undefined) body.company = payload.company;
      if (payload.location !== undefined) body.location = payload.location;
      if (payload.hireable !== undefined) body.hireable = payload.hireable;
      if (payload.bio !== undefined) body.bio = payload.bio;
      const response = await clientFor("user.update").fetchJSON("/user", jsonInit("PATCH", body));
      return jsonBody(response, 200, "user", "Authenticated user was not found.", "GitHub rejected the update authenticated user request.");
    },
  };
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

function emptyUpsert(
  response: { status: number; headers: Record<string, string> },
  value: Record<string, unknown>,
  missing: string,
  rejected: string,
) {
  if (response.status === 201 || response.status === 204) {
    return { ok: true as const, ...value, created: response.status === 201, status: response.status };
  }
  if (response.status === 404) return upstream(missing);
  return mapRateOrUpstream(response, rejected);
}

function repoPath(owner: string, repo: string): string {
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

function ownerRepo(input: Record<string, unknown>): OwnerRepo {
  return {
    owner: requireSingleSegment(input.owner, "owner"),
    repo: requireSingleSegment(input.repo, "repo"),
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

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function requireStringList(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== "string" || item.length === 0)) {
    throw new Error(`${field} must be a non-empty array of strings`);
  }
  return value;
}

function requireId(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${field} must be a positive integer`);
  }
  return value;
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  return value;
}

function optionalNullableString(value: unknown, field: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") throw new Error(`${field} must be a string or null`);
  return value;
}

function optionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new Error(`${field} must be a boolean`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
