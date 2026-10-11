import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";

// G10: Dependabot secrets (repo + org + selected repos) + repo Codespaces secrets public key/list/upsert.
// 15 ops. All omit effectPolicy/reconcile/effect. No G11.

type Page = { perPage?: number; page?: number };
type OrgScope = { org: string };
type RepoScope = { owner: string; repo: string };
type SecretName = { secretName: string };

const VISIBILITIES = ["all", "private", "selected"] as const;
type Visibility = (typeof VISIBILITIES)[number];

export type NormalizedPublicKey = { keyId: string; key: string };
export type NormalizedRepoSecret = { name: string; createdAt: string; updatedAt: string };
export type NormalizedOrgSecret = NormalizedRepoSecret & {
  visibility: string;
  selectedRepositoriesUrl: string;
};
export type NormalizedRepoSummary = { id: number; name: string; fullName: string; private: boolean };

// ─── validators ──────────────────────────────────────────────────────────────

export function validateGetRepoDependabotSecretsPublicKeyInput(input: unknown): RepoScope {
  if (!isRecord(input)) throw new Error("dependabot.secrets.public_key.get input must be an object");
  return repo(input);
}

export function validateListRepoDependabotSecretsInput(input: unknown): RepoScope & Page {
  if (!isRecord(input)) throw new Error("dependabot.secrets.list input must be an object");
  return { ...repo(input), ...page(input) };
}

export function validateGetRepoDependabotSecretInput(input: unknown): RepoScope & SecretName {
  if (!isRecord(input)) throw new Error("dependabot.secrets.get input must be an object");
  return { ...repo(input), secretName: segment(input.secretName ?? input.secret_name, "secretName") };
}

export function validateUpsertRepoDependabotSecretInput(input: unknown): RepoScope & SecretName & {
  encryptedValue: string;
  keyId: string;
} {
  if (!isRecord(input)) throw new Error("dependabot.secrets.create_or_update input must be an object");
  return {
    ...repo(input),
    secretName: segment(input.secretName ?? input.secret_name, "secretName"),
    encryptedValue: requireNonEmpty(input.encryptedValue ?? input.encrypted_value, "encryptedValue"),
    keyId: requireNonEmpty(input.keyId ?? input.key_id, "keyId"),
  };
}

export function validateListOrgDependabotSecretsInput(input: unknown): OrgScope & Page {
  if (!isRecord(input)) throw new Error("orgs.dependabot.secrets.list input must be an object");
  return { org: segment(input.org, "org"), ...page(input) };
}

export function validateGetOrgDependabotSecretInput(input: unknown): OrgScope & SecretName {
  if (!isRecord(input)) throw new Error("orgs.dependabot.secrets.get input must be an object");
  return { org: segment(input.org, "org"), secretName: segment(input.secretName ?? input.secret_name, "secretName") };
}

export function validateUpsertOrgDependabotSecretInput(input: unknown): OrgScope & SecretName & {
  encryptedValue: string;
  keyId: string;
  visibility: Visibility;
  selectedRepositoryIds?: number[];
} {
  if (!isRecord(input)) throw new Error("orgs.dependabot.secrets.create_or_update input must be an object");
  const visibility = input.visibility;
  if (typeof visibility !== "string" || !(VISIBILITIES as readonly string[]).includes(visibility)) {
    throw new Error("visibility must be all, private, or selected");
  }
  const selectedRaw = input.selectedRepositoryIds ?? input.selected_repository_ids;
  let selectedRepositoryIds: number[] | undefined;
  if (visibility === "selected") {
    selectedRepositoryIds = requireIdList(selectedRaw, "selectedRepositoryIds");
  } else if (selectedRaw !== undefined) {
    throw new Error("selectedRepositoryIds is only allowed when visibility is selected");
  }
  return {
    org: segment(input.org, "org"),
    secretName: segment(input.secretName ?? input.secret_name, "secretName"),
    encryptedValue: requireNonEmpty(input.encryptedValue ?? input.encrypted_value, "encryptedValue"),
    keyId: requireNonEmpty(input.keyId ?? input.key_id, "keyId"),
    visibility: visibility as Visibility,
    ...(selectedRepositoryIds !== undefined ? { selectedRepositoryIds } : {}),
  };
}

export function validateDeleteOrgDependabotSecretInput(input: unknown): OrgScope & SecretName {
  if (!isRecord(input)) throw new Error("orgs.dependabot.secrets.delete input must be an object");
  return { org: segment(input.org, "org"), secretName: segment(input.secretName ?? input.secret_name, "secretName") };
}

export function validateListOrgDependabotSecretRepositoriesInput(input: unknown): OrgScope & SecretName & Page {
  if (!isRecord(input)) throw new Error("orgs.dependabot.secrets.repositories.list input must be an object");
  return {
    org: segment(input.org, "org"),
    secretName: segment(input.secretName ?? input.secret_name, "secretName"),
    ...page(input),
  };
}

export function validateSetOrgDependabotSecretRepositoriesInput(input: unknown): OrgScope & SecretName & {
  selectedRepositoryIds: number[];
} {
  if (!isRecord(input)) throw new Error("orgs.dependabot.secrets.repositories.set input must be an object");
  return {
    org: segment(input.org, "org"),
    secretName: segment(input.secretName ?? input.secret_name, "secretName"),
    selectedRepositoryIds: requireIdList(
      input.selectedRepositoryIds ?? input.selected_repository_ids,
      "selectedRepositoryIds",
    ),
  };
}

export function validateAddOrgDependabotSecretRepositoryInput(input: unknown): OrgScope & SecretName & {
  repositoryId: number;
} {
  if (!isRecord(input)) throw new Error("orgs.dependabot.secrets.repositories.add input must be an object");
  return {
    org: segment(input.org, "org"),
    secretName: segment(input.secretName ?? input.secret_name, "secretName"),
    repositoryId: requireId(input.repositoryId ?? input.repository_id, "repositoryId"),
  };
}

export function validateRemoveOrgDependabotSecretRepositoryInput(input: unknown): OrgScope & SecretName & {
  repositoryId: number;
} {
  if (!isRecord(input)) throw new Error("orgs.dependabot.secrets.repositories.remove input must be an object");
  return {
    org: segment(input.org, "org"),
    secretName: segment(input.secretName ?? input.secret_name, "secretName"),
    repositoryId: requireId(input.repositoryId ?? input.repository_id, "repositoryId"),
  };
}

export function validateGetRepoCodespacesSecretsPublicKeyInput(input: unknown): RepoScope {
  if (!isRecord(input)) throw new Error("repos.codespaces.secrets.public_key.get input must be an object");
  return repo(input);
}

export function validateListRepoCodespacesSecretsInput(input: unknown): RepoScope & Page {
  if (!isRecord(input)) throw new Error("repos.codespaces.secrets.list input must be an object");
  return { ...repo(input), ...page(input) };
}

export function validateUpsertRepoCodespacesSecretInput(input: unknown): RepoScope & SecretName & {
  encryptedValue: string;
  keyId: string;
} {
  if (!isRecord(input)) throw new Error("repos.codespaces.secrets.create_or_update input must be an object");
  return {
    ...repo(input),
    secretName: segment(input.secretName ?? input.secret_name, "secretName"),
    encryptedValue: requireNonEmpty(input.encryptedValue ?? input.encrypted_value, "encryptedValue"),
    keyId: requireNonEmpty(input.keyId ?? input.key_id, "keyId"),
  };
}

// ─── client ──────────────────────────────────────────────────────────────────

export function createGapG10Client(options: { accessToken: string; fetch?: typeof fetch; githubClient?: GitHubClient }) {
  const base = options.githubClient;
  const clientFor = (operation: string) =>
    base ?? createGitHubClient({ accessToken: options.accessToken, fetch: options.fetch, operation });

  return {
    async getRepoDependabotSecretsPublicKey(input: unknown) {
      const payload = validateGetRepoDependabotSecretsPublicKeyInput(input);
      const result = await read(
        clientFor("dependabot.secrets.public_key.get"),
        `${repoPath(payload)}/dependabot/secrets/public-key`,
        "dependabot.secrets.public_key.get",
        "GitHub repository Dependabot public key was not found.",
      );
      if (!result.ok) return result;
      if (!isRecord(result.body)) return upstream("GitHub rejected the dependabot.secrets.public_key.get request.");
      return { ok: true as const, publicKey: normalizePublicKey(result.body) };
    },

    async listRepoDependabotSecrets(input: unknown) {
      const payload = validateListRepoDependabotSecretsInput(input);
      const result = await read(
        clientFor("dependabot.secrets.list"),
        `${repoPath(payload)}/dependabot/secrets${qs(pageParams(payload))}`,
        "dependabot.secrets.list",
        "GitHub repository Dependabot secrets were not found.",
      );
      if (!result.ok) return result;
      if (!isRecord(result.body) || !Array.isArray(result.body.secrets)) {
        return upstream("GitHub rejected the dependabot.secrets.list request.");
      }
      const secrets = result.body.secrets.filter(isRecord).map(normalizeRepoSecret);
      return {
        ok: true as const,
        totalCount: typeof result.body.total_count === "number" ? result.body.total_count : secrets.length,
        secrets,
      };
    },

    async getRepoDependabotSecret(input: unknown) {
      const payload = validateGetRepoDependabotSecretInput(input);
      const result = await read(
        clientFor("dependabot.secrets.get"),
        `${repoPath(payload)}/dependabot/secrets/${enc(payload.secretName)}`,
        "dependabot.secrets.get",
        "GitHub repository Dependabot secret was not found.",
      );
      if (!result.ok) return result;
      if (!isRecord(result.body)) return upstream("GitHub rejected the dependabot.secrets.get request.");
      return { ok: true as const, secret: normalizeRepoSecret(result.body) };
    },

    async upsertRepoDependabotSecret(input: unknown) {
      const payload = validateUpsertRepoDependabotSecretInput(input);
      const response = await clientFor("dependabot.secrets.create_or_update").fetchJSON(
        `${repoPath(payload)}/dependabot/secrets/${enc(payload.secretName)}`,
        jsonInit("PUT", { encrypted_value: payload.encryptedValue, key_id: payload.keyId }),
      );
      return emptyUpsert(
        response,
        { upserted: true, owner: payload.owner, repo: payload.repo, secretName: payload.secretName },
        "GitHub repository Dependabot secret was not found.",
        "GitHub rejected the dependabot.secrets.create_or_update request.",
      );
    },

    async listOrgDependabotSecrets(input: unknown) {
      const payload = validateListOrgDependabotSecretsInput(input);
      const result = await read(
        clientFor("orgs.dependabot.secrets.list"),
        `/orgs/${enc(payload.org)}/dependabot/secrets${qs(pageParams(payload))}`,
        "orgs.dependabot.secrets.list",
        "GitHub organization Dependabot secrets were not found.",
      );
      if (!result.ok) return result;
      if (!isRecord(result.body) || !Array.isArray(result.body.secrets)) {
        return upstream("GitHub rejected the orgs.dependabot.secrets.list request.");
      }
      const secrets = result.body.secrets.filter(isRecord).map(normalizeOrgSecret);
      return {
        ok: true as const,
        totalCount: typeof result.body.total_count === "number" ? result.body.total_count : secrets.length,
        secrets,
      };
    },

    async getOrgDependabotSecret(input: unknown) {
      const payload = validateGetOrgDependabotSecretInput(input);
      const result = await read(
        clientFor("orgs.dependabot.secrets.get"),
        `/orgs/${enc(payload.org)}/dependabot/secrets/${enc(payload.secretName)}`,
        "orgs.dependabot.secrets.get",
        "GitHub organization Dependabot secret was not found.",
      );
      if (!result.ok) return result;
      if (!isRecord(result.body)) return upstream("GitHub rejected the orgs.dependabot.secrets.get request.");
      return { ok: true as const, secret: normalizeOrgSecret(result.body) };
    },

    async upsertOrgDependabotSecret(input: unknown) {
      const payload = validateUpsertOrgDependabotSecretInput(input);
      const body: Record<string, unknown> = {
        encrypted_value: payload.encryptedValue,
        key_id: payload.keyId,
        visibility: payload.visibility,
      };
      if (payload.selectedRepositoryIds !== undefined) {
        body.selected_repository_ids = payload.selectedRepositoryIds;
      }
      const response = await clientFor("orgs.dependabot.secrets.create_or_update").fetchJSON(
        `/orgs/${enc(payload.org)}/dependabot/secrets/${enc(payload.secretName)}`,
        jsonInit("PUT", body),
      );
      return emptyUpsert(
        response,
        {
          upserted: true,
          org: payload.org,
          secretName: payload.secretName,
          visibility: payload.visibility,
        },
        "GitHub organization Dependabot secret was not found.",
        "GitHub rejected the orgs.dependabot.secrets.create_or_update request.",
      );
    },

    async deleteOrgDependabotSecret(input: unknown) {
      const payload = validateDeleteOrgDependabotSecretInput(input);
      const response = await clientFor("orgs.dependabot.secrets.delete").fetchJSON(
        `/orgs/${enc(payload.org)}/dependabot/secrets/${enc(payload.secretName)}`,
        { method: "DELETE" },
      );
      return noContent(
        response,
        204,
        { deleted: true, org: payload.org, secretName: payload.secretName },
        "GitHub organization Dependabot secret was not found.",
        "GitHub rejected the orgs.dependabot.secrets.delete request.",
      );
    },

    async listOrgDependabotSecretRepositories(input: unknown) {
      const payload = validateListOrgDependabotSecretRepositoriesInput(input);
      const result = await read(
        clientFor("orgs.dependabot.secrets.repositories.list"),
        `/orgs/${enc(payload.org)}/dependabot/secrets/${enc(payload.secretName)}/repositories${qs(pageParams(payload))}`,
        "orgs.dependabot.secrets.repositories.list",
        "GitHub organization Dependabot secret repositories were not found.",
      );
      if (!result.ok) return result;
      if (!isRecord(result.body) || !Array.isArray(result.body.repositories)) {
        return upstream("GitHub rejected the orgs.dependabot.secrets.repositories.list request.");
      }
      const repositories = result.body.repositories.filter(isRecord).map(normalizeRepoSummary);
      return {
        ok: true as const,
        totalCount: typeof result.body.total_count === "number" ? result.body.total_count : repositories.length,
        repositories,
      };
    },

    async setOrgDependabotSecretRepositories(input: unknown) {
      const payload = validateSetOrgDependabotSecretRepositoriesInput(input);
      const response = await clientFor("orgs.dependabot.secrets.repositories.set").fetchJSON(
        `/orgs/${enc(payload.org)}/dependabot/secrets/${enc(payload.secretName)}/repositories`,
        jsonInit("PUT", { selected_repository_ids: payload.selectedRepositoryIds }),
      );
      return noContent(
        response,
        204,
        {
          set: true,
          org: payload.org,
          secretName: payload.secretName,
          selectedRepositoryIds: payload.selectedRepositoryIds,
        },
        "GitHub organization Dependabot secret repositories were not found.",
        "GitHub rejected the orgs.dependabot.secrets.repositories.set request.",
      );
    },

    async addOrgDependabotSecretRepository(input: unknown) {
      const payload = validateAddOrgDependabotSecretRepositoryInput(input);
      const response = await clientFor("orgs.dependabot.secrets.repositories.add").fetchJSON(
        `/orgs/${enc(payload.org)}/dependabot/secrets/${enc(payload.secretName)}/repositories/${payload.repositoryId}`,
        { method: "PUT" },
      );
      return noContent(
        response,
        204,
        {
          added: true,
          org: payload.org,
          secretName: payload.secretName,
          repositoryId: payload.repositoryId,
        },
        "GitHub organization Dependabot secret repository was not found.",
        "GitHub rejected the orgs.dependabot.secrets.repositories.add request.",
      );
    },

    async removeOrgDependabotSecretRepository(input: unknown) {
      const payload = validateRemoveOrgDependabotSecretRepositoryInput(input);
      const response = await clientFor("orgs.dependabot.secrets.repositories.remove").fetchJSON(
        `/orgs/${enc(payload.org)}/dependabot/secrets/${enc(payload.secretName)}/repositories/${payload.repositoryId}`,
        { method: "DELETE" },
      );
      return noContent(
        response,
        204,
        {
          removed: true,
          org: payload.org,
          secretName: payload.secretName,
          repositoryId: payload.repositoryId,
        },
        "GitHub organization Dependabot secret repository was not found.",
        "GitHub rejected the orgs.dependabot.secrets.repositories.remove request.",
      );
    },

    async getRepoCodespacesSecretsPublicKey(input: unknown) {
      const payload = validateGetRepoCodespacesSecretsPublicKeyInput(input);
      const result = await read(
        clientFor("repos.codespaces.secrets.public_key.get"),
        `${repoPath(payload)}/codespaces/secrets/public-key`,
        "repos.codespaces.secrets.public_key.get",
        "GitHub repository codespaces public key was not found.",
      );
      if (!result.ok) return result;
      if (!isRecord(result.body)) {
        return upstream("GitHub rejected the repos.codespaces.secrets.public_key.get request.");
      }
      return { ok: true as const, publicKey: normalizePublicKey(result.body) };
    },

    async listRepoCodespacesSecrets(input: unknown) {
      const payload = validateListRepoCodespacesSecretsInput(input);
      const result = await read(
        clientFor("repos.codespaces.secrets.list"),
        `${repoPath(payload)}/codespaces/secrets${qs(pageParams(payload))}`,
        "repos.codespaces.secrets.list",
        "GitHub repository codespaces secrets were not found.",
      );
      if (!result.ok) return result;
      if (!isRecord(result.body) || !Array.isArray(result.body.secrets)) {
        return upstream("GitHub rejected the repos.codespaces.secrets.list request.");
      }
      const secrets = result.body.secrets.filter(isRecord).map(normalizeRepoSecret);
      return {
        ok: true as const,
        totalCount: typeof result.body.total_count === "number" ? result.body.total_count : secrets.length,
        secrets,
      };
    },

    async upsertRepoCodespacesSecret(input: unknown) {
      const payload = validateUpsertRepoCodespacesSecretInput(input);
      const response = await clientFor("repos.codespaces.secrets.create_or_update").fetchJSON(
        `${repoPath(payload)}/codespaces/secrets/${enc(payload.secretName)}`,
        jsonInit("PUT", { encrypted_value: payload.encryptedValue, key_id: payload.keyId }),
      );
      return emptyUpsert(
        response,
        { upserted: true, owner: payload.owner, repo: payload.repo, secretName: payload.secretName },
        "GitHub repository codespaces secret was not found.",
        "GitHub rejected the repos.codespaces.secrets.create_or_update request.",
      );
    },
  };
}

// ─── normalizers ─────────────────────────────────────────────────────────────

function normalizePublicKey(item: Record<string, unknown>): NormalizedPublicKey {
  return {
    keyId: typeof item.key_id === "string" ? item.key_id : "",
    key: typeof item.key === "string" ? item.key : "",
  };
}

function normalizeRepoSecret(item: Record<string, unknown>): NormalizedRepoSecret {
  return {
    name: typeof item.name === "string" ? item.name : "",
    createdAt: typeof item.created_at === "string" ? item.created_at : "",
    updatedAt: typeof item.updated_at === "string" ? item.updated_at : "",
  };
}

function normalizeOrgSecret(item: Record<string, unknown>): NormalizedOrgSecret {
  return {
    ...normalizeRepoSecret(item),
    visibility: typeof item.visibility === "string" ? item.visibility : "",
    selectedRepositoriesUrl: typeof item.selected_repositories_url === "string" ? item.selected_repositories_url : "",
  };
}

function normalizeRepoSummary(item: Record<string, unknown>): NormalizedRepoSummary {
  return {
    id: typeof item.id === "number" ? item.id : 0,
    name: typeof item.name === "string" ? item.name : "",
    fullName: typeof item.full_name === "string" ? item.full_name : "",
    private: item.private === true,
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

function emptyUpsert(
  response: { status: number; headers: Record<string, string> },
  value: Record<string, unknown>,
  missing: string,
  rejected: string,
) {
  const limited = rate(response.status, response.headers);
  if (limited) return limited;
  if (response.status === 201 || response.status === 204) {
    return { ok: true as const, ...value, created: response.status === 201, status: response.status };
  }
  if (response.status === 404) return upstream(missing);
  return upstream(rejected);
}

function noContent(
  response: { status: number; headers: Record<string, string> },
  success: number,
  value: Record<string, unknown>,
  missing: string,
  rejected: string,
) {
  const limited = rate(response.status, response.headers);
  if (limited) return limited;
  if (response.status === success) return { ok: true as const, ...value };
  if (response.status === 404) return upstream(missing);
  return upstream(rejected);
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

function jsonInit(method: string, body: Record<string, unknown>): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

function page(input: Record<string, unknown>): Page {
  const out: Page = {};
  if (input.perPage !== undefined || input.per_page !== undefined) {
    out.perPage = requireId(input.perPage ?? input.per_page, "perPage");
  }
  if (input.page !== undefined) out.page = requireId(input.page, "page");
  return out;
}

function pageParams(payload: Page): Record<string, string> {
  const params: Record<string, string> = {};
  if (payload.perPage !== undefined) params.per_page = String(payload.perPage);
  if (payload.page !== undefined) params.page = String(payload.page);
  return params;
}

function qs(params: Record<string, string>): string {
  const entries = Object.entries(params);
  if (entries.length === 0) return "";
  return `?${entries.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join("&")}`;
}

function repo(input: Record<string, unknown>): RepoScope {
  return { owner: segment(input.owner, "owner"), repo: segment(input.repo, "repo") };
}

function repoPath(payload: RepoScope): string {
  return `/repos/${enc(payload.owner)}/${enc(payload.repo)}`;
}

function requireId(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new Error(`${field} must be a positive integer`);
  }
  return value;
}

function requireIdList(value: unknown, field: string): number[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${field} must be a non-empty array of positive integers`);
  }
  return value.map((entry, index) => {
    if (typeof entry !== "number" || !Number.isInteger(entry) || entry < 1) {
      throw new Error(`${field}[${index}] must be a positive integer`);
    }
    return entry;
  });
}

function requireNonEmpty(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function segment(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  if (value.includes("/") || value.includes("?") || value.includes("#")) {
    throw new Error(`${field} must be a single path segment`);
  }
  return value;
}

function enc(value: string): string {
  return encodeURIComponent(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
