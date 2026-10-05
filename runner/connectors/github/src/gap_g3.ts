import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";
import { normalizeActionsSecretName } from "./card5_reads";

// G3: nine organization/actions reads + six writes. All omit effectPolicy/reconcile/effect.
// selected_actions.set omits Reconcile even though selected_actions.get ships in this card (lock).
// orgs.codespaces.access.selected_users.remove: OpenAPI deprecated with no removalDate — kept.

type Page = { perPage?: number; page?: number };
type OrgScope = { org: string };
type RepoScope = { owner: string; repo: string };

const PACKAGE_TYPES = ["npm", "maven", "rubygems", "docker", "nuget", "container"] as const;
const ISSUE_TYPE_COLORS = ["gray", "blue", "green", "yellow", "orange", "red", "pink", "purple"] as const;

export type NormalizedPublicKey = { keyId: string; key: string };
export type NormalizedSelectedActions = {
  githubOwnedAllowed: boolean;
  verifiedAllowed: boolean;
  patternsAllowed: string[];
};
export type NormalizedOrgSecret = {
  name: string;
  created_at: string;
  updated_at: string;
  visibility: string;
  selectedRepositoriesUrl: string;
};
export type NormalizedRepoCacheUsage = {
  fullName: string;
  activeCachesSizeInBytes: number;
  activeCachesCount: number;
};
export type NormalizedIssueType = {
  id: number;
  nodeId: string;
  name: string;
  description: string;
  color: string;
  createdAt: string;
  updatedAt: string;
  isEnabled: boolean;
};
export type NormalizedRepoSummary = {
  id: number;
  name: string;
  fullName: string;
  private: boolean;
};
export type NormalizedOidcSubject = {
  includeClaimKeys: string[];
  useImmutableSubject: boolean;
};

// ─── validators ──────────────────────────────────────────────────────────────

export function validateListOrgActionsCacheUsageByRepositoryInput(input: unknown): OrgScope & Page {
  if (!isRecord(input)) throw new Error("orgs.actions.cache.usage_by_repository.list input must be an object");
  return { org: segment(input.org, "org"), ...page(input) };
}

export function validateGetOrgSelectedActionsInput(input: unknown): OrgScope {
  if (!isRecord(input)) throw new Error("orgs.actions.permissions.selected_actions.get input must be an object");
  return { org: segment(input.org, "org") };
}

export function validateSetOrgSelectedActionsInput(input: unknown): OrgScope & NormalizedSelectedActions {
  if (!isRecord(input)) throw new Error("orgs.actions.permissions.selected_actions.set input must be an object");
  if (typeof input.githubOwnedAllowed !== "boolean") throw new Error("githubOwnedAllowed must be a boolean");
  if (typeof input.verifiedAllowed !== "boolean") throw new Error("verifiedAllowed must be a boolean");
  const patterns =
    input.patternsAllowed === undefined
      ? []
      : stringList(input.patternsAllowed, "patternsAllowed");
  return {
    org: segment(input.org, "org"),
    githubOwnedAllowed: input.githubOwnedAllowed,
    verifiedAllowed: input.verifiedAllowed,
    patternsAllowed: patterns,
  };
}

export function validateConvertOutsideCollaboratorInput(input: unknown): OrgScope & { username: string; async?: boolean } {
  if (!isRecord(input)) throw new Error("orgs.outside_collaborators.convert input must be an object");
  const out: OrgScope & { username: string; async?: boolean } = {
    org: segment(input.org, "org"),
    username: segment(input.username, "username"),
  };
  if (input.async !== undefined) {
    if (typeof input.async !== "boolean") throw new Error("async must be a boolean");
    out.async = input.async;
  }
  return out;
}

export function validateCreateOrgIssueTypeInput(input: unknown): OrgScope & {
  name: string;
  isEnabled: boolean;
  description?: string;
  color?: string;
} {
  if (!isRecord(input)) throw new Error("orgs.issue_types.create input must be an object");
  return { org: segment(input.org, "org"), ...issueTypeBody(input, "orgs.issue_types.create") };
}

export function validateUpdateOrgIssueTypeInput(input: unknown): OrgScope & {
  issueTypeId: number;
  name: string;
  isEnabled: boolean;
  description?: string;
  color?: string;
} {
  if (!isRecord(input)) throw new Error("orgs.issue_types.update input must be an object");
  return {
    org: segment(input.org, "org"),
    issueTypeId: requireId(input.issueTypeId ?? input.issue_type_id, "issueTypeId"),
    ...issueTypeBody(input, "orgs.issue_types.update"),
  };
}

export function validateDeleteOrgPackageInput(input: unknown): OrgScope & { packageType: string; packageName: string } {
  if (!isRecord(input)) throw new Error("orgs.packages.delete input must be an object");
  return {
    org: segment(input.org, "org"),
    packageType: packageType(input.packageType ?? input.package_type),
    packageName: requirePackageName(input.packageName ?? input.package_name),
  };
}

export function validateRemoveOrgCodespacesAccessSelectedUsersInput(input: unknown): OrgScope & { selectedUsernames: string[] } {
  if (!isRecord(input)) throw new Error("orgs.codespaces.access.selected_users.remove input must be an object");
  return {
    org: segment(input.org, "org"),
    selectedUsernames: stringList(input.selectedUsernames ?? input.selected_usernames, "selectedUsernames"),
  };
}

export function validateGetPrivateVulnerabilityReportingInput(input: unknown): RepoScope {
  if (!isRecord(input)) throw new Error("repos.private_vulnerability_reporting.get input must be an object");
  return repo(input);
}

export function validateListOrgActionsSecretsInput(input: unknown): OrgScope & Page {
  if (!isRecord(input)) throw new Error("actions.org_secrets.list input must be an object");
  return { org: segment(input.org, "org"), ...page(input) };
}

export function validateGetOrgActionsSecretsPublicKeyInput(input: unknown): OrgScope {
  if (!isRecord(input)) throw new Error("actions.org_secrets.public_key.get input must be an object");
  return { org: segment(input.org, "org") };
}

export function validateGetOrgActionsSecretInput(input: unknown): OrgScope & { secretName: string } {
  if (!isRecord(input)) throw new Error("actions.org_secrets.get input must be an object");
  return { org: segment(input.org, "org"), secretName: segment(input.secretName ?? input.secret_name, "secretName") };
}

export function validateListOrgActionsSecretRepositoriesInput(input: unknown): OrgScope & { secretName: string } & Page {
  if (!isRecord(input)) throw new Error("actions.org_secrets.repositories.list input must be an object");
  return {
    org: segment(input.org, "org"),
    secretName: segment(input.secretName ?? input.secret_name, "secretName"),
    ...page(input),
  };
}

export function validateListOrgActionsPermissionsRepositoriesInput(input: unknown): OrgScope & Page {
  if (!isRecord(input)) throw new Error("orgs.actions.permissions.repositories.list input must be an object");
  return { org: segment(input.org, "org"), ...page(input) };
}

export function validateGetOrgOidcCustomizationSubInput(input: unknown): OrgScope {
  if (!isRecord(input)) throw new Error("orgs.actions.oidc.customization.sub.get input must be an object");
  return { org: segment(input.org, "org") };
}

// ─── client ──────────────────────────────────────────────────────────────────

export function createGapG3Client(options: { accessToken: string; fetch?: typeof fetch; githubClient?: GitHubClient }) {
  const base = options.githubClient;
  const clientFor = (operation: string) =>
    base ?? createGitHubClient({ accessToken: options.accessToken, fetch: options.fetch, operation });

  return {
    async listOrgActionsCacheUsageByRepository(input: unknown) {
      const payload = validateListOrgActionsCacheUsageByRepositoryInput(input);
      const result = await read(
        clientFor("orgs.actions.cache.usage_by_repository.list"),
        `/orgs/${enc(payload.org)}/actions/cache/usage-by-repository${qs(pageParams(payload))}`,
        "orgs.actions.cache.usage_by_repository.list",
        "GitHub organization Actions cache usage by repository was not found.",
      );
      if (!result.ok) return result;
      if (!isRecord(result.body) || !Array.isArray(result.body.repository_cache_usages)) {
        return upstream("GitHub rejected the orgs.actions.cache.usage_by_repository.list request.");
      }
      const usages = result.body.repository_cache_usages.filter(isRecord).map(normalizeRepoCacheUsage);
      return {
        ok: true as const,
        totalCount: typeof result.body.total_count === "number" ? result.body.total_count : usages.length,
        repositoryCacheUsages: usages,
      };
    },

    async getOrgSelectedActions(input: unknown) {
      const payload = validateGetOrgSelectedActionsInput(input);
      const result = await read(
        clientFor("orgs.actions.permissions.selected_actions.get"),
        `/orgs/${enc(payload.org)}/actions/permissions/selected-actions`,
        "orgs.actions.permissions.selected_actions.get",
        "GitHub organization selected actions were not found.",
      );
      if (!result.ok) return result;
      if (!isRecord(result.body)) return upstream("GitHub rejected the orgs.actions.permissions.selected_actions.get request.");
      return { ok: true as const, selectedActions: normalizeSelectedActions(result.body) };
    },

    async setOrgSelectedActions(input: unknown) {
      const payload = validateSetOrgSelectedActionsInput(input);
      const response = await clientFor("orgs.actions.permissions.selected_actions.set").fetchJSON(
        `/orgs/${enc(payload.org)}/actions/permissions/selected-actions`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            github_owned_allowed: payload.githubOwnedAllowed,
            verified_allowed: payload.verifiedAllowed,
            patterns_allowed: payload.patternsAllowed,
          }),
        },
      );
      const limited = rate(response.status, response.headers);
      if (limited) return limited;
      if (response.status === 204) {
        return {
          ok: true as const,
          selectedActions: {
            githubOwnedAllowed: payload.githubOwnedAllowed,
            verifiedAllowed: payload.verifiedAllowed,
            patternsAllowed: payload.patternsAllowed,
          },
        };
      }
      if (response.status === 404) return upstream("GitHub organization selected actions were not found.");
      return upstream("GitHub rejected the orgs.actions.permissions.selected_actions.set request.");
    },

    async convertOutsideCollaborator(input: unknown) {
      const payload = validateConvertOutsideCollaboratorInput(input);
      const body: Record<string, boolean> = {};
      if (payload.async !== undefined) body.async = payload.async;
      const response = await clientFor("orgs.outside_collaborators.convert").fetchJSON(
        `/orgs/${enc(payload.org)}/outside_collaborators/${enc(payload.username)}`,
        {
          method: "PUT",
          ...(Object.keys(body).length > 0
            ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
            : {}),
        },
      );
      const limited = rate(response.status, response.headers);
      if (limited) return limited;
      if (response.status === 204) {
        return { ok: true as const, converted: true, pending: false, org: payload.org, username: payload.username };
      }
      if (response.status === 202) {
        return { ok: true as const, converted: true, pending: true, org: payload.org, username: payload.username };
      }
      if (response.status === 404) return upstream("Organization member or outside collaborator was not found.");
      return upstream("GitHub rejected the orgs.outside_collaborators.convert request.");
    },

    async createOrgIssueType(input: unknown) {
      const payload = validateCreateOrgIssueTypeInput(input);
      const response = await clientFor("orgs.issue_types.create").fetchJSON(`/orgs/${enc(payload.org)}/issue-types`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(issueTypeUpstreamBody(payload)),
      });
      const limited = rate(response.status, response.headers);
      if (limited) return limited;
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, issueType: normalizeIssueType(response.body) };
      }
      if (response.status === 404) return upstream("Organization was not found.");
      return upstream("GitHub rejected the orgs.issue_types.create request.");
    },

    async updateOrgIssueType(input: unknown) {
      const payload = validateUpdateOrgIssueTypeInput(input);
      const response = await clientFor("orgs.issue_types.update").fetchJSON(
        `/orgs/${enc(payload.org)}/issue-types/${payload.issueTypeId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(issueTypeUpstreamBody(payload)),
        },
      );
      const limited = rate(response.status, response.headers);
      if (limited) return limited;
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, issueType: normalizeIssueType(response.body) };
      }
      if (response.status === 404) return upstream("Organization issue type was not found.");
      return upstream("GitHub rejected the orgs.issue_types.update request.");
    },

    async deleteOrgPackage(input: unknown) {
      const payload = validateDeleteOrgPackageInput(input);
      const response = await clientFor("orgs.packages.delete").fetchJSON(
        `/orgs/${enc(payload.org)}/packages/${enc(payload.packageType)}/${encodeURIComponent(payload.packageName)}`,
        { method: "DELETE" },
      );
      const limited = rate(response.status, response.headers);
      if (limited) return limited;
      if (response.status === 204) {
        return {
          ok: true as const,
          deleted: true,
          org: payload.org,
          packageType: payload.packageType,
          packageName: payload.packageName,
        };
      }
      if (response.status === 404) return upstream("Organization package was not found.");
      return upstream("GitHub rejected the orgs.packages.delete request.");
    },

    async removeOrgCodespacesAccessSelectedUsers(input: unknown) {
      const payload = validateRemoveOrgCodespacesAccessSelectedUsersInput(input);
      const response = await clientFor("orgs.codespaces.access.selected_users.remove").fetchJSON(
        `/orgs/${enc(payload.org)}/codespaces/access/selected_users`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ selected_usernames: payload.selectedUsernames }),
        },
      );
      const limited = rate(response.status, response.headers);
      if (limited) return limited;
      if (response.status === 204) {
        return {
          ok: true as const,
          removed: true,
          org: payload.org,
          selectedUsernames: payload.selectedUsernames,
        };
      }
      if (response.status === 404) return upstream("Organization was not found.");
      return upstream("GitHub rejected the orgs.codespaces.access.selected_users.remove request.");
    },

    async getPrivateVulnerabilityReporting(input: unknown) {
      const payload = validateGetPrivateVulnerabilityReportingInput(input);
      const result = await read(
        clientFor("repos.private_vulnerability_reporting.get"),
        `${repoPath(payload)}/private-vulnerability-reporting`,
        "repos.private_vulnerability_reporting.get",
        "GitHub private vulnerability reporting status was not found.",
      );
      if (!result.ok) return result;
      if (!isRecord(result.body)) return upstream("GitHub rejected the repos.private_vulnerability_reporting.get request.");
      return { ok: true as const, enabled: result.body.enabled === true };
    },

    async listOrgActionsSecrets(input: unknown) {
      const payload = validateListOrgActionsSecretsInput(input);
      const result = await read(
        clientFor("actions.org_secrets.list"),
        `/orgs/${enc(payload.org)}/actions/secrets${qs(pageParams(payload))}`,
        "actions.org_secrets.list",
        "GitHub organization Actions secrets were not found.",
      );
      if (!result.ok) return result;
      if (!isRecord(result.body) || !Array.isArray(result.body.secrets)) {
        return upstream("GitHub rejected the actions.org_secrets.list request.");
      }
      const secrets = result.body.secrets.filter(isRecord).map(normalizeActionsSecretName);
      return {
        ok: true as const,
        totalCount: typeof result.body.total_count === "number" ? result.body.total_count : secrets.length,
        secrets,
      };
    },

    async getOrgActionsSecretsPublicKey(input: unknown) {
      const payload = validateGetOrgActionsSecretsPublicKeyInput(input);
      const result = await read(
        clientFor("actions.org_secrets.public_key.get"),
        `/orgs/${enc(payload.org)}/actions/secrets/public-key`,
        "actions.org_secrets.public_key.get",
        "GitHub organization Actions public key was not found.",
      );
      if (!result.ok) return result;
      if (!isRecord(result.body)) return upstream("GitHub rejected the actions.org_secrets.public_key.get request.");
      return { ok: true as const, publicKey: normalizePublicKey(result.body) };
    },

    async getOrgActionsSecret(input: unknown) {
      const payload = validateGetOrgActionsSecretInput(input);
      const result = await read(
        clientFor("actions.org_secrets.get"),
        `/orgs/${enc(payload.org)}/actions/secrets/${enc(payload.secretName)}`,
        "actions.org_secrets.get",
        "GitHub organization Actions secret was not found.",
      );
      if (!result.ok) return result;
      if (!isRecord(result.body)) return upstream("GitHub rejected the actions.org_secrets.get request.");
      return { ok: true as const, secret: normalizeOrgSecret(result.body) };
    },

    async listOrgActionsSecretRepositories(input: unknown) {
      const payload = validateListOrgActionsSecretRepositoriesInput(input);
      const result = await read(
        clientFor("actions.org_secrets.repositories.list"),
        `/orgs/${enc(payload.org)}/actions/secrets/${enc(payload.secretName)}/repositories${qs(pageParams(payload))}`,
        "actions.org_secrets.repositories.list",
        "GitHub organization Actions secret repositories were not found.",
      );
      if (!result.ok) return result;
      if (!isRecord(result.body) || !Array.isArray(result.body.repositories)) {
        return upstream("GitHub rejected the actions.org_secrets.repositories.list request.");
      }
      const repositories = result.body.repositories.filter(isRecord).map(normalizeRepoSummary);
      return {
        ok: true as const,
        totalCount: typeof result.body.total_count === "number" ? result.body.total_count : repositories.length,
        repositories,
      };
    },

    async listOrgActionsPermissionsRepositories(input: unknown) {
      const payload = validateListOrgActionsPermissionsRepositoriesInput(input);
      const result = await read(
        clientFor("orgs.actions.permissions.repositories.list"),
        `/orgs/${enc(payload.org)}/actions/permissions/repositories${qs(pageParams(payload))}`,
        "orgs.actions.permissions.repositories.list",
        "GitHub organization Actions-enabled repositories were not found.",
      );
      if (!result.ok) return result;
      if (!isRecord(result.body) || !Array.isArray(result.body.repositories)) {
        return upstream("GitHub rejected the orgs.actions.permissions.repositories.list request.");
      }
      const repositories = result.body.repositories.filter(isRecord).map(normalizeRepoSummary);
      return {
        ok: true as const,
        totalCount: typeof result.body.total_count === "number" ? result.body.total_count : repositories.length,
        repositories,
      };
    },

    async getOrgOidcCustomizationSub(input: unknown) {
      const payload = validateGetOrgOidcCustomizationSubInput(input);
      const result = await read(
        clientFor("orgs.actions.oidc.customization.sub.get"),
        `/orgs/${enc(payload.org)}/actions/oidc/customization/sub`,
        "orgs.actions.oidc.customization.sub.get",
        "GitHub organization OIDC subject claim template was not found.",
      );
      if (!result.ok) return result;
      if (!isRecord(result.body)) return upstream("GitHub rejected the orgs.actions.oidc.customization.sub.get request.");
      return { ok: true as const, subject: normalizeOidcSubject(result.body) };
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

function normalizeSelectedActions(item: Record<string, unknown>): NormalizedSelectedActions {
  return {
    githubOwnedAllowed: item.github_owned_allowed === true,
    verifiedAllowed: item.verified_allowed === true,
    patternsAllowed: Array.isArray(item.patterns_allowed)
      ? item.patterns_allowed.filter((entry): entry is string => typeof entry === "string")
      : [],
  };
}

function normalizeOrgSecret(item: Record<string, unknown>): NormalizedOrgSecret {
  return {
    name: typeof item.name === "string" ? item.name : "",
    created_at: typeof item.created_at === "string" ? item.created_at : "",
    updated_at: typeof item.updated_at === "string" ? item.updated_at : "",
    visibility: typeof item.visibility === "string" ? item.visibility : "",
    selectedRepositoriesUrl: typeof item.selected_repositories_url === "string" ? item.selected_repositories_url : "",
  };
}

function normalizeRepoCacheUsage(item: Record<string, unknown>): NormalizedRepoCacheUsage {
  return {
    fullName: typeof item.full_name === "string" ? item.full_name : "",
    activeCachesSizeInBytes: typeof item.active_caches_size_in_bytes === "number" ? item.active_caches_size_in_bytes : 0,
    activeCachesCount: typeof item.active_caches_count === "number" ? item.active_caches_count : 0,
  };
}

function normalizeIssueType(item: Record<string, unknown>): NormalizedIssueType {
  return {
    id: typeof item.id === "number" ? item.id : 0,
    nodeId: typeof item.node_id === "string" ? item.node_id : "",
    name: typeof item.name === "string" ? item.name : "",
    description: typeof item.description === "string" ? item.description : "",
    color: typeof item.color === "string" ? item.color : "",
    createdAt: typeof item.created_at === "string" ? item.created_at : "",
    updatedAt: typeof item.updated_at === "string" ? item.updated_at : "",
    isEnabled: item.is_enabled === true,
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

function normalizeOidcSubject(item: Record<string, unknown>): NormalizedOidcSubject {
  return {
    includeClaimKeys: Array.isArray(item.include_claim_keys)
      ? item.include_claim_keys.filter((entry): entry is string => typeof entry === "string")
      : [],
    useImmutableSubject: item.use_immutable_subject === true,
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

function issueTypeBody(input: Record<string, unknown>, operation: string): {
  name: string;
  isEnabled: boolean;
  description?: string;
  color?: string;
} {
  const name = requireNonEmpty(input.name, "name");
  if (typeof input.isEnabled !== "boolean" && typeof input.is_enabled !== "boolean") {
    throw new Error(`${operation} requires isEnabled boolean`);
  }
  const isEnabled = (input.isEnabled ?? input.is_enabled) === true;
  const out: { name: string; isEnabled: boolean; description?: string; color?: string } = { name, isEnabled };
  if (input.description !== undefined) {
    if (typeof input.description !== "string") throw new Error("description must be a string");
    out.description = input.description;
  }
  if (input.color !== undefined) {
    if (typeof input.color !== "string" || !(ISSUE_TYPE_COLORS as readonly string[]).includes(input.color)) {
      throw new Error("color must be gray, blue, green, yellow, orange, red, pink, or purple");
    }
    out.color = input.color;
  }
  return out;
}

function issueTypeUpstreamBody(payload: {
  name: string;
  isEnabled: boolean;
  description?: string;
  color?: string;
}): Record<string, unknown> {
  const body: Record<string, unknown> = { name: payload.name, is_enabled: payload.isEnabled };
  if (payload.description !== undefined) body.description = payload.description;
  if (payload.color !== undefined) body.color = payload.color;
  return body;
}

function packageType(value: unknown): string {
  if (typeof value !== "string" || !(PACKAGE_TYPES as readonly string[]).includes(value)) {
    throw new Error("packageType must be npm, maven, rubygems, docker, nuget, or container");
  }
  return value;
}

function requirePackageName(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) throw new Error("packageName is required");
  return value;
}

function requireNonEmpty(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function stringList(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.some((entry) => typeof entry !== "string" || entry.length === 0)) {
    throw new Error(`${field} must be a non-empty array of non-empty strings`);
  }
  return value as string[];
}

function optionalPage(value: unknown, field: string, max = 100): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > max) {
    throw new Error(`${field} must be an integer between 1 and ${max}`);
  }
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

function enc(value: string): string {
  return encodeURIComponent(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
