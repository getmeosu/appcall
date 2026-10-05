import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";

// G9: Pages update, private vuln reporting, SARIF upload, attestations, org issues/packages,
// public members conceal, user interaction/starred/packages. 12 ops.
// Reconcile: pages.update → pages.get; private_vuln enable/disable → tip G3 get;
// public_members.remove → public_members.check. Rest omit.

type Page = { perPage?: number; page?: number };
type OrgScope = { org: string };
type RepoScope = { owner: string; repo: string };

const BUILD_TYPES = ["legacy", "workflow"] as const;
const SOURCE_PATHS = ["/", "/docs"] as const;
const PACKAGE_TYPES = new Set(["npm", "maven", "rubygems", "docker", "nuget", "container"]);
const PACKAGE_STATES = ["active", "deleted"] as const;

export type NormalizedPagesUpdate = {
  cname?: string | null;
  httpsEnforced?: boolean;
  buildType?: string;
  source?: { branch: string; path: "/" | "/docs" };
};
export type NormalizedSarifUpload = { id: string; url: string };
export type NormalizedAttestation = { repositoryId: number; bundleUrl: string; bundle: Record<string, unknown> };
export type NormalizedPackageVersion = { id: number; name: string; createdAt: string };
export type NormalizedIssueSummary = {
  id: number;
  number: number;
  title: string;
  state: string;
  htmlUrl: string;
};

// ─── validators ──────────────────────────────────────────────────────────────

export function validateUpdatePagesSiteInput(input: unknown): RepoScope & NormalizedPagesUpdate {
  if (!isRecord(input)) throw new Error("repos.pages.update input must be an object");
  const out: RepoScope & NormalizedPagesUpdate = { ...repo(input) };
  if ("cname" in input) {
    if (input.cname !== null && typeof input.cname !== "string") throw new Error("cname must be a string or null");
    out.cname = input.cname as string | null;
  }
  if (input.httpsEnforced !== undefined || input.https_enforced !== undefined) {
    const value = input.httpsEnforced ?? input.https_enforced;
    if (typeof value !== "boolean") throw new Error("httpsEnforced must be a boolean");
    out.httpsEnforced = value;
  }
  if (input.buildType !== undefined || input.build_type !== undefined) {
    const buildType = input.buildType ?? input.build_type;
    if (typeof buildType !== "string" || !(BUILD_TYPES as readonly string[]).includes(buildType)) {
      throw new Error("buildType must be legacy or workflow");
    }
    out.buildType = buildType;
  }
  if (input.source !== undefined) {
    if (!isRecord(input.source)) throw new Error("source must be an object");
    const branch = requireNonEmpty(input.source.branch, "source.branch");
    const pathValue = input.source.path === undefined ? "/" : input.source.path;
    if (typeof pathValue !== "string" || !(SOURCE_PATHS as readonly string[]).includes(pathValue)) {
      throw new Error("source.path must be / or /docs");
    }
    out.source = { branch, path: pathValue as "/" | "/docs" };
  }
  return out;
}

export function validateEnablePrivateVulnerabilityReportingInput(input: unknown): RepoScope {
  if (!isRecord(input)) throw new Error("repos.private_vulnerability_reporting.enable input must be an object");
  return repo(input);
}

export function validateDisablePrivateVulnerabilityReportingInput(input: unknown): RepoScope {
  if (!isRecord(input)) throw new Error("repos.private_vulnerability_reporting.disable input must be an object");
  return repo(input);
}

export function validateUploadCodeScanningSarifInput(input: unknown): RepoScope & {
  commitSha: string;
  ref: string;
  sarif: string;
  checkoutUri?: string;
  startedAt?: string;
  toolName?: string;
  validate?: boolean;
} {
  if (!isRecord(input)) throw new Error("code_scanning.sarifs.upload input must be an object");
  const out: RepoScope & {
    commitSha: string;
    ref: string;
    sarif: string;
    checkoutUri?: string;
    startedAt?: string;
    toolName?: string;
    validate?: boolean;
  } = {
    ...repo(input),
    commitSha: requireNonEmpty(input.commitSha ?? input.commit_sha, "commitSha"),
    ref: requireNonEmpty(input.ref, "ref"),
    sarif: requireNonEmpty(input.sarif, "sarif"),
  };
  if (input.checkoutUri !== undefined || input.checkout_uri !== undefined) {
    out.checkoutUri = requireNonEmpty(input.checkoutUri ?? input.checkout_uri, "checkoutUri");
  }
  if (input.startedAt !== undefined || input.started_at !== undefined) {
    out.startedAt = requireNonEmpty(input.startedAt ?? input.started_at, "startedAt");
  }
  if (input.toolName !== undefined || input.tool_name !== undefined) {
    out.toolName = requireNonEmpty(input.toolName ?? input.tool_name, "toolName");
  }
  if (input.validate !== undefined) {
    if (typeof input.validate !== "boolean") throw new Error("validate must be a boolean");
    out.validate = input.validate;
  }
  return out;
}

export function validateListRepoAttestationsInput(input: unknown): RepoScope & {
  subjectDigest: string;
  predicateType?: string;
  perPage?: number;
  before?: string;
  after?: string;
} {
  if (!isRecord(input)) throw new Error("repos.attestations.list input must be an object");
  const out: RepoScope & {
    subjectDigest: string;
    predicateType?: string;
    perPage?: number;
    before?: string;
    after?: string;
  } = {
    ...repo(input),
    subjectDigest: segment(input.subjectDigest ?? input.subject_digest, "subjectDigest"),
  };
  if (input.predicateType !== undefined || input.predicate_type !== undefined) {
    out.predicateType = requireNonEmpty(input.predicateType ?? input.predicate_type, "predicateType");
  }
  Object.assign(out, page(input));
  if (input.before !== undefined) out.before = requireNonEmpty(input.before, "before");
  if (input.after !== undefined) out.after = requireNonEmpty(input.after, "after");
  return out;
}

export function validateListOrgIssuesInput(input: unknown): OrgScope & Page & {
  filter?: string;
  state?: string;
  labels?: string;
  type?: string;
  sort?: string;
  direction?: string;
  since?: string;
} {
  if (!isRecord(input)) throw new Error("orgs.issues.list input must be an object");
  const out: OrgScope & Page & Record<string, string | number | undefined> = {
    org: segment(input.org, "org"),
    ...page(input),
  };
  for (const [camel, snake] of [
    ["filter", "filter"],
    ["state", "state"],
    ["labels", "labels"],
    ["type", "type"],
    ["sort", "sort"],
    ["direction", "direction"],
    ["since", "since"],
  ] as const) {
    if (input[camel] !== undefined || input[snake] !== undefined) {
      out[camel] = requireNonEmpty(input[camel] ?? input[snake], camel);
    }
  }
  return out as OrgScope & Page & {
    filter?: string;
    state?: string;
    labels?: string;
    type?: string;
    sort?: string;
    direction?: string;
    since?: string;
  };
}

export function validateListOrgPackageVersionsInput(input: unknown): OrgScope & {
  packageType: string;
  packageName: string;
  state?: string;
} & Page {
  if (!isRecord(input)) throw new Error("orgs.packages.versions.list input must be an object");
  return {
    org: segment(input.org, "org"),
    ...packageRef(input),
    ...page(input),
    ...optionalState(input),
  };
}

export function validateRemoveOrgPublicMemberInput(input: unknown): OrgScope & { username: string } {
  if (!isRecord(input)) throw new Error("orgs.public_members.remove input must be an object");
  return { org: segment(input.org, "org"), username: segment(input.username, "username") };
}

export function validateDeleteUserInteractionLimitsInput(input: unknown): Record<string, never> {
  if (input === undefined || input === null) return {};
  if (!isRecord(input)) throw new Error("user.interaction_limits.delete input must be an object");
  return {};
}

export function validateCheckUserStarredInput(input: unknown): RepoScope {
  if (!isRecord(input)) throw new Error("user.starred.check input must be an object");
  return repo(input);
}

export function validateDeleteUserPackageInput(input: unknown): { packageType: string; packageName: string } {
  if (!isRecord(input)) throw new Error("user.packages.delete input must be an object");
  return packageRef(input);
}

export function validateListUserPackageVersionsInput(input: unknown): {
  packageType: string;
  packageName: string;
  state?: string;
} & Page {
  if (!isRecord(input)) throw new Error("user.packages.versions.list input must be an object");
  return { ...packageRef(input), ...page(input), ...optionalState(input) };
}

// ─── client ──────────────────────────────────────────────────────────────────

export function createGapG9Client(options: { accessToken: string; fetch?: typeof fetch; githubClient?: GitHubClient }) {
  const base = options.githubClient;
  const clientFor = (operation: string) =>
    base ?? createGitHubClient({ accessToken: options.accessToken, fetch: options.fetch, operation });

  return {
    async updatePagesSite(input: unknown) {
      const payload = validateUpdatePagesSiteInput(input);
      const body: Record<string, unknown> = {};
      if ("cname" in payload) body.cname = payload.cname;
      if (payload.httpsEnforced !== undefined) body.https_enforced = payload.httpsEnforced;
      if (payload.buildType !== undefined) body.build_type = payload.buildType;
      if (payload.source !== undefined) body.source = payload.source;
      const response = await clientFor("repos.pages.update").fetchJSON(
        `${repoPath(payload)}/pages`,
        jsonInit("PUT", body),
      );
      return noContent(
        response,
        204,
        { updated: true, owner: payload.owner, repo: payload.repo, ...pickPages(payload) },
        "GitHub Pages site was not found.",
        "GitHub rejected the repos.pages.update request.",
      );
    },

    async enablePrivateVulnerabilityReporting(input: unknown) {
      const payload = validateEnablePrivateVulnerabilityReportingInput(input);
      const response = await clientFor("repos.private_vulnerability_reporting.enable").fetchJSON(
        `${repoPath(payload)}/private-vulnerability-reporting`,
        { method: "PUT" },
      );
      return noContent(
        response,
        204,
        { enabled: true, owner: payload.owner, repo: payload.repo },
        "GitHub private vulnerability reporting settings were not found.",
        "GitHub rejected the repos.private_vulnerability_reporting.enable request.",
      );
    },

    async disablePrivateVulnerabilityReporting(input: unknown) {
      const payload = validateDisablePrivateVulnerabilityReportingInput(input);
      const response = await clientFor("repos.private_vulnerability_reporting.disable").fetchJSON(
        `${repoPath(payload)}/private-vulnerability-reporting`,
        { method: "DELETE" },
      );
      return noContent(
        response,
        204,
        { enabled: false, owner: payload.owner, repo: payload.repo },
        "GitHub private vulnerability reporting settings were not found.",
        "GitHub rejected the repos.private_vulnerability_reporting.disable request.",
      );
    },

    async uploadCodeScanningSarif(input: unknown) {
      const payload = validateUploadCodeScanningSarifInput(input);
      const body: Record<string, unknown> = {
        commit_sha: payload.commitSha,
        ref: payload.ref,
        sarif: payload.sarif,
      };
      if (payload.checkoutUri !== undefined) body.checkout_uri = payload.checkoutUri;
      if (payload.startedAt !== undefined) body.started_at = payload.startedAt;
      if (payload.toolName !== undefined) body.tool_name = payload.toolName;
      if (payload.validate !== undefined) body.validate = payload.validate;
      const response = await clientFor("code_scanning.sarifs.upload").fetchJSON(
        `${repoPath(payload)}/code-scanning/sarifs`,
        jsonInit("POST", body),
      );
      const limited = rate(response.status, response.headers);
      if (limited) return limited;
      if (response.status === 202 && isRecord(response.body)) {
        return {
          ok: true as const,
          upload: {
            id: typeof response.body.id === "string" ? response.body.id : "",
            url: typeof response.body.url === "string" ? response.body.url : "",
          },
        };
      }
      if (response.status === 404) return upstream("GitHub code scanning SARIF upload endpoint was not found.");
      return upstream("GitHub rejected the code_scanning.sarifs.upload request.");
    },

    async listRepoAttestations(input: unknown) {
      const payload = validateListRepoAttestationsInput(input);
      const params: Record<string, string> = {};
      if (payload.perPage !== undefined) params.per_page = String(payload.perPage);
      if (payload.before !== undefined) params.before = payload.before;
      if (payload.after !== undefined) params.after = payload.after;
      if (payload.predicateType !== undefined) params.predicate_type = payload.predicateType;
      const result = await read(
        clientFor("repos.attestations.list"),
        `${repoPath(payload)}/attestations/${enc(payload.subjectDigest)}${qs(params)}`,
        "repos.attestations.list",
        "GitHub repository attestations were not found.",
      );
      if (!result.ok) return result;
      if (!isRecord(result.body)) return upstream("GitHub rejected the repos.attestations.list request.");
      const raw = Array.isArray(result.body.attestations) ? result.body.attestations : [];
      return { ok: true as const, attestations: raw.filter(isRecord).map(normalizeAttestation) };
    },

    async listOrgIssues(input: unknown) {
      const payload = validateListOrgIssuesInput(input);
      const params: Record<string, string> = {};
      if (payload.perPage !== undefined) params.per_page = String(payload.perPage);
      if (payload.page !== undefined) params.page = String(payload.page);
      for (const key of ["filter", "state", "labels", "type", "sort", "direction", "since"] as const) {
        if (payload[key] !== undefined) params[key] = payload[key] as string;
      }
      const result = await read(
        clientFor("orgs.issues.list"),
        `/orgs/${enc(payload.org)}/issues${qs(params)}`,
        "orgs.issues.list",
        "GitHub organization issues were not found.",
      );
      if (!result.ok) return result;
      if (!Array.isArray(result.body)) return upstream("GitHub rejected the orgs.issues.list request.");
      return { ok: true as const, issues: result.body.filter(isRecord).map(normalizeIssue) };
    },

    async listOrgPackageVersions(input: unknown) {
      const payload = validateListOrgPackageVersionsInput(input);
      const params: Record<string, string> = {};
      if (payload.perPage !== undefined) params.per_page = String(payload.perPage);
      if (payload.page !== undefined) params.page = String(payload.page);
      if (payload.state !== undefined) params.state = payload.state;
      const result = await read(
        clientFor("orgs.packages.versions.list"),
        `/orgs/${enc(payload.org)}/packages/${enc(payload.packageType)}/${enc(payload.packageName)}/versions${qs(params)}`,
        "orgs.packages.versions.list",
        "GitHub organization package versions were not found.",
      );
      if (!result.ok) return result;
      if (!Array.isArray(result.body)) return upstream("GitHub rejected the orgs.packages.versions.list request.");
      return { ok: true as const, versions: result.body.filter(isRecord).map(normalizePackageVersion) };
    },

    async removeOrgPublicMember(input: unknown) {
      const payload = validateRemoveOrgPublicMemberInput(input);
      const response = await clientFor("orgs.public_members.remove").fetchJSON(
        `/orgs/${enc(payload.org)}/public_members/${enc(payload.username)}`,
        { method: "DELETE" },
      );
      return noContent(
        response,
        204,
        { removed: true, org: payload.org, username: payload.username },
        "GitHub public organization membership was not found.",
        "GitHub rejected the orgs.public_members.remove request.",
      );
    },

    async deleteUserInteractionLimits(input: unknown) {
      validateDeleteUserInteractionLimitsInput(input);
      const response = await clientFor("user.interaction_limits.delete").fetchJSON(
        "/user/interaction-limits",
        { method: "DELETE" },
      );
      return noContent(
        response,
        204,
        { deleted: true },
        "GitHub user interaction limits were not found.",
        "GitHub rejected the user.interaction_limits.delete request.",
      );
    },

    async checkUserStarred(input: unknown) {
      const payload = validateCheckUserStarredInput(input);
      const response = await clientFor("user.starred.check").fetchJSON(
        `/user/starred/${enc(payload.owner)}/${enc(payload.repo)}`,
      );
      const limited = rate(response.status, response.headers);
      if (limited) return limited;
      if (response.status === 204) {
        return { ok: true as const, starred: true, owner: payload.owner, repo: payload.repo };
      }
      if (response.status === 404) {
        return { ok: true as const, starred: false, owner: payload.owner, repo: payload.repo };
      }
      return upstream("GitHub rejected the user.starred.check request.");
    },

    async deleteUserPackage(input: unknown) {
      const payload = validateDeleteUserPackageInput(input);
      const response = await clientFor("user.packages.delete").fetchJSON(
        `/user/packages/${enc(payload.packageType)}/${enc(payload.packageName)}`,
        { method: "DELETE" },
      );
      return noContent(
        response,
        204,
        { deleted: true, packageType: payload.packageType, packageName: payload.packageName },
        "GitHub package was not found.",
        "GitHub rejected the user.packages.delete request.",
      );
    },

    async listUserPackageVersions(input: unknown) {
      const payload = validateListUserPackageVersionsInput(input);
      const params: Record<string, string> = {};
      if (payload.perPage !== undefined) params.per_page = String(payload.perPage);
      if (payload.page !== undefined) params.page = String(payload.page);
      if (payload.state !== undefined) params.state = payload.state;
      const result = await read(
        clientFor("user.packages.versions.list"),
        `/user/packages/${enc(payload.packageType)}/${enc(payload.packageName)}/versions${qs(params)}`,
        "user.packages.versions.list",
        "GitHub package versions were not found.",
      );
      if (!result.ok) return result;
      if (!Array.isArray(result.body)) return upstream("GitHub rejected the user.packages.versions.list request.");
      return { ok: true as const, versions: result.body.filter(isRecord).map(normalizePackageVersion) };
    },
  };
}

// ─── normalizers ─────────────────────────────────────────────────────────────

function normalizeAttestation(item: Record<string, unknown>): NormalizedAttestation {
  const bundle = isRecord(item.bundle) ? item.bundle : {};
  return {
    repositoryId: typeof item.repository_id === "number" ? item.repository_id : 0,
    bundleUrl: typeof item.bundle_url === "string" ? item.bundle_url : "",
    bundle,
  };
}

function normalizePackageVersion(item: Record<string, unknown>): NormalizedPackageVersion {
  return {
    id: typeof item.id === "number" ? item.id : 0,
    name: typeof item.name === "string" ? item.name : "",
    createdAt: typeof item.created_at === "string" ? item.created_at : "",
  };
}

function normalizeIssue(item: Record<string, unknown>): NormalizedIssueSummary {
  return {
    id: typeof item.id === "number" ? item.id : 0,
    number: typeof item.number === "number" ? item.number : 0,
    title: typeof item.title === "string" ? item.title : "",
    state: typeof item.state === "string" ? item.state : "",
    htmlUrl: typeof item.html_url === "string" ? item.html_url : "",
  };
}

function pickPages(payload: NormalizedPagesUpdate): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if ("cname" in payload) out.cname = payload.cname;
  if (payload.httpsEnforced !== undefined) out.httpsEnforced = payload.httpsEnforced;
  if (payload.buildType !== undefined) out.buildType = payload.buildType;
  if (payload.source !== undefined) out.source = payload.source;
  return out;
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

function packageRef(input: Record<string, unknown>): { packageType: string; packageName: string } {
  const packageType = segment(input.packageType ?? input.package_type, "packageType");
  if (!PACKAGE_TYPES.has(packageType)) throw new Error("packageType must be a GitHub package type");
  const packageName = input.packageName ?? input.package_name;
  if (typeof packageName !== "string" || packageName.length === 0) throw new Error("packageName is required");
  if (packageName.includes("?") || packageName.includes("#")) {
    throw new Error("packageName must not include a query or fragment");
  }
  return { packageType, packageName };
}

function optionalState(input: Record<string, unknown>): { state?: string } {
  if (input.state === undefined) return {};
  if (typeof input.state !== "string" || !(PACKAGE_STATES as readonly string[]).includes(input.state)) {
    throw new Error("state must be active or deleted");
  }
  return { state: input.state };
}

function page(input: Record<string, unknown>): Page {
  const out: Page = {};
  if (input.perPage !== undefined || input.per_page !== undefined) {
    out.perPage = requireId(input.perPage ?? input.per_page, "perPage");
  }
  if (input.page !== undefined) out.page = requireId(input.page, "page");
  return out;
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
