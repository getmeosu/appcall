import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";

// G8: Codespaces (repo/user/org-member/org-secrets) + Dependabot repo secret delete + 2 Codespaces reads.
// 14 ops. All omit effectPolicy/reconcile/effect.

type Page = { perPage?: number; page?: number };
type OrgScope = { org: string };
type RepoScope = { owner: string; repo: string };
type SecretName = { secretName: string };

const VISIBILITIES = ["all", "private", "selected"] as const;
type Visibility = (typeof VISIBILITIES)[number];

export type NormalizedCodespace = { id: number; name: string; state: string };
export type NormalizedDevcontainer = { path: string; name: string; displayName: string };
export type NormalizedPermissionsCheck = { accepted: boolean };
export type NormalizedOrgCodespaceSecret = {
  name: string;
  createdAt: string;
  updatedAt: string;
  visibility: string;
  selectedRepositoriesUrl: string;
};
export type NormalizedRepoCodespaceSecret = { name: string; createdAt: string; updatedAt: string };
export type NormalizedPublicKey = { keyId: string; key: string };
export type NormalizedRepoSummary = { id: number; name: string; fullName: string; private: boolean };

// ─── validators ──────────────────────────────────────────────────────────────

export function validateDeleteUserCodespaceInput(input: unknown): { codespaceName: string } {
  if (!isRecord(input)) throw new Error("user.codespaces.delete input must be an object");
  return { codespaceName: segment(input.codespaceName ?? input.codespace_name, "codespaceName") };
}

export function validateDeleteOrgMemberCodespaceInput(input: unknown): OrgScope & {
  username: string;
  codespaceName: string;
} {
  if (!isRecord(input)) throw new Error("orgs.members.codespaces.delete input must be an object");
  return {
    org: segment(input.org, "org"),
    username: segment(input.username, "username"),
    codespaceName: segment(input.codespaceName ?? input.codespace_name, "codespaceName"),
  };
}

export function validateListRepoCodespacesInput(input: unknown): RepoScope & Page {
  if (!isRecord(input)) throw new Error("repos.codespaces.list input must be an object");
  return { ...repo(input), ...page(input) };
}

export function validateListRepoDevcontainersInput(input: unknown): RepoScope & Page {
  if (!isRecord(input)) throw new Error("repos.codespaces.devcontainers.list input must be an object");
  return { ...repo(input), ...page(input) };
}

export function validateGetRepoCodespacesPermissionsCheckInput(input: unknown): RepoScope & {
  ref: string;
  devcontainerPath: string;
} {
  if (!isRecord(input)) throw new Error("repos.codespaces.permissions_check.get input must be an object");
  return {
    ...repo(input),
    ref: requireNonEmpty(input.ref, "ref"),
    devcontainerPath: requireNonEmpty(input.devcontainerPath ?? input.devcontainer_path, "devcontainerPath"),
  };
}

export function validateGetOrgCodespacesSecretInput(input: unknown): OrgScope & SecretName {
  if (!isRecord(input)) throw new Error("orgs.codespaces.secrets.get input must be an object");
  return { org: segment(input.org, "org"), secretName: segment(input.secretName ?? input.secret_name, "secretName") };
}

export function validateUpsertOrgCodespacesSecretInput(input: unknown): OrgScope & SecretName & {
  encryptedValue: string;
  keyId: string;
  visibility: Visibility;
  selectedRepositoryIds?: number[];
} {
  if (!isRecord(input)) throw new Error("orgs.codespaces.secrets.create_or_update input must be an object");
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

export function validateDeleteOrgCodespacesSecretInput(input: unknown): OrgScope & SecretName {
  if (!isRecord(input)) throw new Error("orgs.codespaces.secrets.delete input must be an object");
  return { org: segment(input.org, "org"), secretName: segment(input.secretName ?? input.secret_name, "secretName") };
}

export function validateSetOrgCodespacesSecretRepositoriesInput(input: unknown): OrgScope & SecretName & {
  selectedRepositoryIds: number[];
} {
  if (!isRecord(input)) throw new Error("orgs.codespaces.secrets.repositories.set input must be an object");
  return {
    org: segment(input.org, "org"),
    secretName: segment(input.secretName ?? input.secret_name, "secretName"),
    selectedRepositoryIds: requireIdList(
      input.selectedRepositoryIds ?? input.selected_repository_ids,
      "selectedRepositoryIds",
    ),
  };
}

export function validateRemoveOrgCodespacesSecretRepositoryInput(input: unknown): OrgScope & SecretName & {
  repositoryId: number;
} {
  if (!isRecord(input)) throw new Error("orgs.codespaces.secrets.repositories.remove input must be an object");
  return {
    org: segment(input.org, "org"),
    secretName: segment(input.secretName ?? input.secret_name, "secretName"),
    repositoryId: requireId(input.repositoryId ?? input.repository_id, "repositoryId"),
  };
}

export function validateGetRepoCodespacesSecretInput(input: unknown): RepoScope & SecretName {
  if (!isRecord(input)) throw new Error("repos.codespaces.secrets.get input must be an object");
  return { ...repo(input), secretName: segment(input.secretName ?? input.secret_name, "secretName") };
}

export function validateDeleteDependabotSecretInput(input: unknown): RepoScope & SecretName {
  if (!isRecord(input)) throw new Error("dependabot.secrets.delete input must be an object");
  return { ...repo(input), secretName: segment(input.secretName ?? input.secret_name, "secretName") };
}

export function validateGetOrgCodespacesSecretsPublicKeyInput(input: unknown): OrgScope {
  if (!isRecord(input)) throw new Error("orgs.codespaces.secrets.public_key.get input must be an object");
  return { org: segment(input.org, "org") };
}

export function validateListOrgCodespacesSecretRepositoriesInput(input: unknown): OrgScope & SecretName & Page {
  if (!isRecord(input)) throw new Error("orgs.codespaces.secrets.repositories.list input must be an object");
  return {
    org: segment(input.org, "org"),
    secretName: segment(input.secretName ?? input.secret_name, "secretName"),
    ...page(input),
  };
}

// ─── client ──────────────────────────────────────────────────────────────────

export function createGapG8Client(options: { accessToken: string; fetch?: typeof fetch; githubClient?: GitHubClient }) {
  const base = options.githubClient;
  const clientFor = (operation: string) =>
    base ?? createGitHubClient({ accessToken: options.accessToken, fetch: options.fetch, operation });

  return {
    async deleteUserCodespace(input: unknown) {
      const payload = validateDeleteUserCodespaceInput(input);
      const response = await clientFor("user.codespaces.delete").fetchJSON(
        `/user/codespaces/${enc(payload.codespaceName)}`,
        { method: "DELETE" },
      );
      return accepted(
        response,
        202,
        { deleted: true, codespaceName: payload.codespaceName },
        "GitHub codespace was not found.",
        "GitHub rejected the user.codespaces.delete request.",
      );
    },

    async deleteOrgMemberCodespace(input: unknown) {
      const payload = validateDeleteOrgMemberCodespaceInput(input);
      const response = await clientFor("orgs.members.codespaces.delete").fetchJSON(
        `/orgs/${enc(payload.org)}/members/${enc(payload.username)}/codespaces/${enc(payload.codespaceName)}`,
        { method: "DELETE" },
      );
      return accepted(
        response,
        202,
        {
          deleted: true,
          org: payload.org,
          username: payload.username,
          codespaceName: payload.codespaceName,
        },
        "GitHub organization member codespace was not found.",
        "GitHub rejected the orgs.members.codespaces.delete request.",
      );
    },

    async listRepoCodespaces(input: unknown) {
      const payload = validateListRepoCodespacesInput(input);
      const result = await read(
        clientFor("repos.codespaces.list"),
        `${repoPath(payload)}/codespaces${qs(pageParams(payload))}`,
        "repos.codespaces.list",
        "GitHub repository codespaces were not found.",
      );
      if (!result.ok) return result;
      if (!isRecord(result.body) || !Array.isArray(result.body.codespaces)) {
        return upstream("GitHub rejected the repos.codespaces.list request.");
      }
      const codespaces = result.body.codespaces.filter(isRecord).map(normalizeCodespace);
      return {
        ok: true as const,
        totalCount: typeof result.body.total_count === "number" ? result.body.total_count : codespaces.length,
        codespaces,
      };
    },

    async listRepoDevcontainers(input: unknown) {
      const payload = validateListRepoDevcontainersInput(input);
      const result = await read(
        clientFor("repos.codespaces.devcontainers.list"),
        `${repoPath(payload)}/codespaces/devcontainers${qs(pageParams(payload))}`,
        "repos.codespaces.devcontainers.list",
        "GitHub repository devcontainer configs were not found.",
      );
      if (!result.ok) return result;
      if (!isRecord(result.body) || !Array.isArray(result.body.devcontainers)) {
        return upstream("GitHub rejected the repos.codespaces.devcontainers.list request.");
      }
      const devcontainers = result.body.devcontainers.filter(isRecord).map(normalizeDevcontainer);
      return {
        ok: true as const,
        totalCount: typeof result.body.total_count === "number" ? result.body.total_count : devcontainers.length,
        devcontainers,
      };
    },

    async getRepoCodespacesPermissionsCheck(input: unknown) {
      const payload = validateGetRepoCodespacesPermissionsCheckInput(input);
      const params = {
        ref: payload.ref,
        devcontainer_path: payload.devcontainerPath,
      };
      const result = await read(
        clientFor("repos.codespaces.permissions_check.get"),
        `${repoPath(payload)}/codespaces/permissions_check${qs(params)}`,
        "repos.codespaces.permissions_check.get",
        "GitHub codespaces permissions check was not found.",
      );
      if (!result.ok) return result;
      if (!isRecord(result.body)) {
        return upstream("GitHub rejected the repos.codespaces.permissions_check.get request.");
      }
      return { ok: true as const, check: normalizePermissionsCheck(result.body) };
    },

    async getOrgCodespacesSecret(input: unknown) {
      const payload = validateGetOrgCodespacesSecretInput(input);
      const result = await read(
        clientFor("orgs.codespaces.secrets.get"),
        `/orgs/${enc(payload.org)}/codespaces/secrets/${enc(payload.secretName)}`,
        "orgs.codespaces.secrets.get",
        "GitHub organization codespaces secret was not found.",
      );
      if (!result.ok) return result;
      if (!isRecord(result.body)) return upstream("GitHub rejected the orgs.codespaces.secrets.get request.");
      return { ok: true as const, secret: normalizeOrgCodespaceSecret(result.body) };
    },

    async upsertOrgCodespacesSecret(input: unknown) {
      const payload = validateUpsertOrgCodespacesSecretInput(input);
      const body: Record<string, unknown> = {
        encrypted_value: payload.encryptedValue,
        key_id: payload.keyId,
        visibility: payload.visibility,
      };
      if (payload.selectedRepositoryIds !== undefined) {
        body.selected_repository_ids = payload.selectedRepositoryIds;
      }
      const response = await clientFor("orgs.codespaces.secrets.create_or_update").fetchJSON(
        `/orgs/${enc(payload.org)}/codespaces/secrets/${enc(payload.secretName)}`,
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
        "GitHub organization codespaces secret was not found.",
        "GitHub rejected the orgs.codespaces.secrets.create_or_update request.",
      );
    },

    async deleteOrgCodespacesSecret(input: unknown) {
      const payload = validateDeleteOrgCodespacesSecretInput(input);
      const response = await clientFor("orgs.codespaces.secrets.delete").fetchJSON(
        `/orgs/${enc(payload.org)}/codespaces/secrets/${enc(payload.secretName)}`,
        { method: "DELETE" },
      );
      return noContent(
        response,
        204,
        { deleted: true, org: payload.org, secretName: payload.secretName },
        "GitHub organization codespaces secret was not found.",
        "GitHub rejected the orgs.codespaces.secrets.delete request.",
      );
    },

    async setOrgCodespacesSecretRepositories(input: unknown) {
      const payload = validateSetOrgCodespacesSecretRepositoriesInput(input);
      const response = await clientFor("orgs.codespaces.secrets.repositories.set").fetchJSON(
        `/orgs/${enc(payload.org)}/codespaces/secrets/${enc(payload.secretName)}/repositories`,
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
        "GitHub organization codespaces secret repositories were not found.",
        "GitHub rejected the orgs.codespaces.secrets.repositories.set request.",
      );
    },

    async removeOrgCodespacesSecretRepository(input: unknown) {
      const payload = validateRemoveOrgCodespacesSecretRepositoryInput(input);
      const response = await clientFor("orgs.codespaces.secrets.repositories.remove").fetchJSON(
        `/orgs/${enc(payload.org)}/codespaces/secrets/${enc(payload.secretName)}/repositories/${payload.repositoryId}`,
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
        "GitHub organization codespaces secret repository was not found.",
        "GitHub rejected the orgs.codespaces.secrets.repositories.remove request.",
      );
    },

    async getRepoCodespacesSecret(input: unknown) {
      const payload = validateGetRepoCodespacesSecretInput(input);
      const result = await read(
        clientFor("repos.codespaces.secrets.get"),
        `${repoPath(payload)}/codespaces/secrets/${enc(payload.secretName)}`,
        "repos.codespaces.secrets.get",
        "GitHub repository codespaces secret was not found.",
      );
      if (!result.ok) return result;
      if (!isRecord(result.body)) return upstream("GitHub rejected the repos.codespaces.secrets.get request.");
      return { ok: true as const, secret: normalizeRepoCodespaceSecret(result.body) };
    },

    async deleteDependabotSecret(input: unknown) {
      const payload = validateDeleteDependabotSecretInput(input);
      const response = await clientFor("dependabot.secrets.delete").fetchJSON(
        `${repoPath(payload)}/dependabot/secrets/${enc(payload.secretName)}`,
        { method: "DELETE" },
      );
      return noContent(
        response,
        204,
        { deleted: true, owner: payload.owner, repo: payload.repo, secretName: payload.secretName },
        "GitHub Dependabot secret was not found.",
        "GitHub rejected the dependabot.secrets.delete request.",
      );
    },

    async getOrgCodespacesSecretsPublicKey(input: unknown) {
      const payload = validateGetOrgCodespacesSecretsPublicKeyInput(input);
      const result = await read(
        clientFor("orgs.codespaces.secrets.public_key.get"),
        `/orgs/${enc(payload.org)}/codespaces/secrets/public-key`,
        "orgs.codespaces.secrets.public_key.get",
        "GitHub organization codespaces public key was not found.",
      );
      if (!result.ok) return result;
      if (!isRecord(result.body)) {
        return upstream("GitHub rejected the orgs.codespaces.secrets.public_key.get request.");
      }
      return { ok: true as const, publicKey: normalizePublicKey(result.body) };
    },

    async listOrgCodespacesSecretRepositories(input: unknown) {
      const payload = validateListOrgCodespacesSecretRepositoriesInput(input);
      const result = await read(
        clientFor("orgs.codespaces.secrets.repositories.list"),
        `/orgs/${enc(payload.org)}/codespaces/secrets/${enc(payload.secretName)}/repositories${qs(pageParams(payload))}`,
        "orgs.codespaces.secrets.repositories.list",
        "GitHub organization codespaces secret repositories were not found.",
      );
      if (!result.ok) return result;
      if (!isRecord(result.body) || !Array.isArray(result.body.repositories)) {
        return upstream("GitHub rejected the orgs.codespaces.secrets.repositories.list request.");
      }
      const repositories = result.body.repositories.filter(isRecord).map(normalizeRepoSummary);
      return {
        ok: true as const,
        totalCount: typeof result.body.total_count === "number" ? result.body.total_count : repositories.length,
        repositories,
      };
    },
  };
}

// ─── normalizers ─────────────────────────────────────────────────────────────

function normalizeCodespace(item: Record<string, unknown>): NormalizedCodespace {
  return {
    id: typeof item.id === "number" ? item.id : 0,
    name: typeof item.name === "string" ? item.name : "",
    state: typeof item.state === "string" ? item.state : "",
  };
}

function normalizeDevcontainer(item: Record<string, unknown>): NormalizedDevcontainer {
  return {
    path: typeof item.path === "string" ? item.path : "",
    name: typeof item.name === "string" ? item.name : "",
    displayName: typeof item.display_name === "string" ? item.display_name : "",
  };
}

function normalizePermissionsCheck(item: Record<string, unknown>): NormalizedPermissionsCheck {
  return { accepted: item.accepted === true };
}

function normalizeOrgCodespaceSecret(item: Record<string, unknown>): NormalizedOrgCodespaceSecret {
  return {
    name: typeof item.name === "string" ? item.name : "",
    createdAt: typeof item.created_at === "string" ? item.created_at : "",
    updatedAt: typeof item.updated_at === "string" ? item.updated_at : "",
    visibility: typeof item.visibility === "string" ? item.visibility : "",
    selectedRepositoriesUrl: typeof item.selected_repositories_url === "string" ? item.selected_repositories_url : "",
  };
}

function normalizeRepoCodespaceSecret(item: Record<string, unknown>): NormalizedRepoCodespaceSecret {
  return {
    name: typeof item.name === "string" ? item.name : "",
    createdAt: typeof item.created_at === "string" ? item.created_at : "",
    updatedAt: typeof item.updated_at === "string" ? item.updated_at : "",
  };
}

function normalizePublicKey(item: Record<string, unknown>): NormalizedPublicKey {
  return {
    keyId: typeof item.key_id === "string" ? item.key_id : "",
    key: typeof item.key === "string" ? item.key : "",
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

function accepted(
  response: { status: number; headers: Record<string, string> },
  success: number,
  value: Record<string, unknown>,
  missing: string,
  rejected: string,
) {
  return noContent(response, success, value, missing, rejected);
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
