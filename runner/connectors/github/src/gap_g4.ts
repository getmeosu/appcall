import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";

// G4: repo Actions secrets + org secret writes + 3 leftovers (11 ops).
// All omit effectPolicy/reconcile/effect. Secret PUTs are upserts; secret GETs are not observes.
// repositories.set/add omit (no exact observe on id). Creates omit. Deletes omit (404 → CONNECTOR_UPSTREAM_ERROR).

type RepoScope = { owner: string; repo: string };
type OrgScope = { org: string };
type SecretName = { secretName: string };

const VISIBILITIES = ["all", "private", "selected"] as const;
type Visibility = (typeof VISIBILITIES)[number];

export type NormalizedPublicKey = { keyId: string; key: string };
export type NormalizedRepoSecret = {
  name: string;
  created_at: string;
  updated_at: string;
};
export type NormalizedProtectionRule = {
  id: number;
  nodeId: string;
  enabled: boolean;
  appId: number;
  appSlug: string;
  appName: string;
};

// ─── validators ──────────────────────────────────────────────────────────────

export function validateGetRepoActionsSecretsPublicKeyInput(input: unknown): RepoScope {
  if (!isRecord(input)) throw new Error("actions.secrets.public_key.get input must be an object");
  return repo(input);
}

export function validateGetRepoActionsSecretInput(input: unknown): RepoScope & SecretName {
  if (!isRecord(input)) throw new Error("actions.secrets.get input must be an object");
  return { ...repo(input), secretName: segment(input.secretName ?? input.secret_name, "secretName") };
}

export function validateUpsertRepoActionsSecretInput(input: unknown): RepoScope & SecretName & {
  encryptedValue: string;
  keyId: string;
} {
  if (!isRecord(input)) throw new Error("actions.secrets.create_or_update input must be an object");
  return {
    ...repo(input),
    secretName: segment(input.secretName ?? input.secret_name, "secretName"),
    encryptedValue: requireString(input.encryptedValue ?? input.encrypted_value, "encryptedValue"),
    keyId: requireString(input.keyId ?? input.key_id, "keyId"),
  };
}

export function validateDeleteRepoActionsSecretInput(input: unknown): RepoScope & SecretName {
  if (!isRecord(input)) throw new Error("actions.secrets.delete input must be an object");
  return { ...repo(input), secretName: segment(input.secretName ?? input.secret_name, "secretName") };
}

export function validateUpsertOrgActionsSecretInput(input: unknown): OrgScope & SecretName & {
  encryptedValue: string;
  keyId: string;
  visibility: Visibility;
  selectedRepositoryIds?: number[];
} {
  if (!isRecord(input)) throw new Error("actions.org_secrets.create_or_update input must be an object");
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
    encryptedValue: requireString(input.encryptedValue ?? input.encrypted_value, "encryptedValue"),
    keyId: requireString(input.keyId ?? input.key_id, "keyId"),
    visibility: visibility as Visibility,
    ...(selectedRepositoryIds !== undefined ? { selectedRepositoryIds } : {}),
  };
}

export function validateDeleteOrgActionsSecretInput(input: unknown): OrgScope & SecretName {
  if (!isRecord(input)) throw new Error("actions.org_secrets.delete input must be an object");
  return {
    org: segment(input.org, "org"),
    secretName: segment(input.secretName ?? input.secret_name, "secretName"),
  };
}

export function validateSetOrgActionsSecretRepositoriesInput(input: unknown): OrgScope & SecretName & {
  selectedRepositoryIds: number[];
} {
  if (!isRecord(input)) throw new Error("actions.org_secrets.repositories.set input must be an object");
  return {
    org: segment(input.org, "org"),
    secretName: segment(input.secretName ?? input.secret_name, "secretName"),
    selectedRepositoryIds: requireIdList(
      input.selectedRepositoryIds ?? input.selected_repository_ids,
      "selectedRepositoryIds",
    ),
  };
}

export function validateAddOrgActionsSecretRepositoryInput(input: unknown): OrgScope & SecretName & {
  repositoryId: number;
} {
  if (!isRecord(input)) throw new Error("actions.org_secrets.repositories.add input must be an object");
  return {
    org: segment(input.org, "org"),
    secretName: segment(input.secretName ?? input.secret_name, "secretName"),
    repositoryId: requireId(input.repositoryId ?? input.repository_id, "repositoryId"),
  };
}

export function validateCreateDeploymentProtectionRuleInput(input: unknown): RepoScope & {
  environmentName: string;
  integrationId: number;
} {
  if (!isRecord(input)) {
    throw new Error("repos.environments.deployment_protection_rules.create input must be an object");
  }
  return {
    ...repo(input),
    environmentName: requirePathText(input.environmentName ?? input.environment_name, "environmentName"),
    integrationId: requireId(input.integrationId ?? input.integration_id, "integrationId"),
  };
}

export function validateRenderMarkdownRawInput(input: unknown): { text: string } {
  if (!isRecord(input)) throw new Error("markdown.render_raw input must be an object");
  return { text: requireString(input.text, "text") };
}

export function validateDeleteRepoCodespaceSecretInput(input: unknown): RepoScope & SecretName {
  if (!isRecord(input)) throw new Error("repos.codespaces.secrets.delete input must be an object");
  return { ...repo(input), secretName: segment(input.secretName ?? input.secret_name, "secretName") };
}

// ─── client ──────────────────────────────────────────────────────────────────

export function createGapG4Client(options: { accessToken: string; fetch?: typeof fetch; githubClient?: GitHubClient }) {
  const base = options.githubClient;
  const clientFor = (operation: string) =>
    base ?? createGitHubClient({ accessToken: options.accessToken, fetch: options.fetch, operation });

  return {
    async getRepoActionsSecretsPublicKey(input: unknown) {
      const payload = validateGetRepoActionsSecretsPublicKeyInput(input);
      const result = await read(
        clientFor("actions.secrets.public_key.get"),
        `${repoPath(payload)}/actions/secrets/public-key`,
        "actions.secrets.public_key.get",
        "GitHub repository Actions secrets public key was not found.",
      );
      if (!result.ok) return result;
      if (!isRecord(result.body)) return upstream("GitHub rejected the actions.secrets.public_key.get request.");
      return { ok: true as const, publicKey: normalizePublicKey(result.body) };
    },

    async getRepoActionsSecret(input: unknown) {
      const payload = validateGetRepoActionsSecretInput(input);
      const result = await read(
        clientFor("actions.secrets.get"),
        `${repoPath(payload)}/actions/secrets/${enc(payload.secretName)}`,
        "actions.secrets.get",
        "GitHub repository Actions secret was not found.",
      );
      if (!result.ok) return result;
      if (!isRecord(result.body)) return upstream("GitHub rejected the actions.secrets.get request.");
      return { ok: true as const, secret: normalizeRepoSecret(result.body) };
    },

    async upsertRepoActionsSecret(input: unknown) {
      const payload = validateUpsertRepoActionsSecretInput(input);
      const response = await clientFor("actions.secrets.create_or_update").fetchJSON(
        `${repoPath(payload)}/actions/secrets/${enc(payload.secretName)}`,
        jsonInit("PUT", { encrypted_value: payload.encryptedValue, key_id: payload.keyId }),
      );
      return emptyUpsert(
        response,
        {
          upserted: true,
          owner: payload.owner,
          repo: payload.repo,
          secretName: payload.secretName,
        },
        "GitHub repository Actions secret was not found.",
        "GitHub rejected the actions.secrets.create_or_update request.",
      );
    },

    async deleteRepoActionsSecret(input: unknown) {
      const payload = validateDeleteRepoActionsSecretInput(input);
      const response = await clientFor("actions.secrets.delete").fetchJSON(
        `${repoPath(payload)}/actions/secrets/${enc(payload.secretName)}`,
        { method: "DELETE" },
      );
      return noContent(
        response,
        204,
        { deleted: true, owner: payload.owner, repo: payload.repo, secretName: payload.secretName },
        "GitHub repository Actions secret was not found.",
        "GitHub rejected the actions.secrets.delete request.",
      );
    },

    async upsertOrgActionsSecret(input: unknown) {
      const payload = validateUpsertOrgActionsSecretInput(input);
      const body: Record<string, unknown> = {
        encrypted_value: payload.encryptedValue,
        key_id: payload.keyId,
        visibility: payload.visibility,
      };
      if (payload.selectedRepositoryIds !== undefined) {
        body.selected_repository_ids = payload.selectedRepositoryIds;
      }
      const response = await clientFor("actions.org_secrets.create_or_update").fetchJSON(
        `/orgs/${enc(payload.org)}/actions/secrets/${enc(payload.secretName)}`,
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
        "GitHub organization Actions secret was not found.",
        "GitHub rejected the actions.org_secrets.create_or_update request.",
      );
    },

    async deleteOrgActionsSecret(input: unknown) {
      const payload = validateDeleteOrgActionsSecretInput(input);
      const response = await clientFor("actions.org_secrets.delete").fetchJSON(
        `/orgs/${enc(payload.org)}/actions/secrets/${enc(payload.secretName)}`,
        { method: "DELETE" },
      );
      return noContent(
        response,
        204,
        { deleted: true, org: payload.org, secretName: payload.secretName },
        "GitHub organization Actions secret was not found.",
        "GitHub rejected the actions.org_secrets.delete request.",
      );
    },

    async setOrgActionsSecretRepositories(input: unknown) {
      const payload = validateSetOrgActionsSecretRepositoriesInput(input);
      const response = await clientFor("actions.org_secrets.repositories.set").fetchJSON(
        `/orgs/${enc(payload.org)}/actions/secrets/${enc(payload.secretName)}/repositories`,
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
        "GitHub organization Actions secret was not found.",
        "GitHub rejected the actions.org_secrets.repositories.set request.",
      );
    },

    async addOrgActionsSecretRepository(input: unknown) {
      const payload = validateAddOrgActionsSecretRepositoryInput(input);
      const response = await clientFor("actions.org_secrets.repositories.add").fetchJSON(
        `/orgs/${enc(payload.org)}/actions/secrets/${enc(payload.secretName)}/repositories/${payload.repositoryId}`,
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
        "GitHub organization Actions secret or repository was not found.",
        "GitHub rejected the actions.org_secrets.repositories.add request.",
      );
    },

    async createDeploymentProtectionRule(input: unknown) {
      const payload = validateCreateDeploymentProtectionRuleInput(input);
      const response = await clientFor("repos.environments.deployment_protection_rules.create").fetchJSON(
        `${repoPath(payload)}/environments/${enc(payload.environmentName)}/deployment_protection_rules`,
        jsonInit("POST", { integration_id: payload.integrationId }),
      );
      const limited = rate(response.status, response.headers);
      if (limited) return limited;
      if (response.status === 201 && isRecord(response.body)) {
        return { ok: true as const, rule: normalizeProtectionRule(response.body) };
      }
      if (response.status === 404) return upstream("GitHub environment was not found.");
      return upstream("GitHub rejected the repos.environments.deployment_protection_rules.create request.");
    },

    async renderMarkdownRaw(input: unknown) {
      const payload = validateRenderMarkdownRawInput(input);
      const response = await clientFor("markdown.render_raw").fetchJSON("/markdown/raw", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: payload.text,
      });
      const limited = rate(response.status, response.headers);
      if (limited) return limited;
      if (response.status === 200 && typeof response.body === "string") {
        return { ok: true as const, html: response.body };
      }
      if (response.status === 200 && isRecord(response.body) && typeof response.body.html === "string") {
        return { ok: true as const, html: response.body.html };
      }
      if (response.status === 404) return upstream("Markdown raw render endpoint was not found.");
      return upstream("GitHub rejected the markdown.render_raw request.");
    },

    async deleteRepoCodespaceSecret(input: unknown) {
      const payload = validateDeleteRepoCodespaceSecretInput(input);
      const response = await clientFor("repos.codespaces.secrets.delete").fetchJSON(
        `${repoPath(payload)}/codespaces/secrets/${enc(payload.secretName)}`,
        { method: "DELETE" },
      );
      return noContent(
        response,
        204,
        { deleted: true, owner: payload.owner, repo: payload.repo, secretName: payload.secretName },
        "GitHub repository Codespaces secret was not found.",
        "GitHub rejected the repos.codespaces.secrets.delete request.",
      );
    },
  };
}

// ─── normalizers / helpers ───────────────────────────────────────────────────

function normalizePublicKey(item: Record<string, unknown>): NormalizedPublicKey {
  return {
    keyId: typeof item.key_id === "string" ? item.key_id : "",
    key: typeof item.key === "string" ? item.key : "",
  };
}

function normalizeRepoSecret(item: Record<string, unknown>): NormalizedRepoSecret {
  return {
    name: typeof item.name === "string" ? item.name : "",
    created_at: typeof item.created_at === "string" ? item.created_at : "",
    updated_at: typeof item.updated_at === "string" ? item.updated_at : "",
  };
}

function normalizeProtectionRule(item: Record<string, unknown>): NormalizedProtectionRule {
  const app = isRecord(item.app) ? item.app : {};
  return {
    id: typeof item.id === "number" ? item.id : 0,
    nodeId: typeof item.node_id === "string" ? item.node_id : "",
    enabled: item.enabled === true,
    appId: typeof app.id === "number" ? app.id : 0,
    appSlug: typeof app.slug === "string" ? app.slug : "",
    appName: typeof app.name === "string" ? app.name : "",
  };
}

async function read(client: GitHubClient, path: string, operation: string, missing: string) {
  const response = await client.fetchJSON(path);
  const limited = rate(response.status, response.headers);
  if (limited) return limited;
  if (response.status === 404) return upstream(missing);
  if (response.status === 401) return upstream(`GitHub rejected the ${operation} request.`);
  if (response.status === 200) return { ok: true as const, body: response.body };
  return upstream(`GitHub rejected the ${operation} request.`);
}

function jsonInit(method: string, body: Record<string, unknown>): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
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

function repo(input: Record<string, unknown>): RepoScope {
  return { owner: segment(input.owner, "owner"), repo: segment(input.repo, "repo") };
}

function repoPath(payload: RepoScope): string {
  return `/repos/${enc(payload.owner)}/${enc(payload.repo)}`;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function requirePathText(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
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
