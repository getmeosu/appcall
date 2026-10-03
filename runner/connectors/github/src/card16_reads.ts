import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";

type Page = { perPage?: number; page?: number };

export type GetPagesBuildInput = { owner: string; repo: string; buildId: number };
export type GetLatestPagesBuildInput = { owner: string; repo: string };
export type GetPagesDeploymentInput = { owner: string; repo: string; pagesDeploymentId: string };
export type ListPagesBuildsInput = { owner: string; repo: string } & Page;
export type GetSarifUploadInput = { owner: string; repo: string; sarifId: string };
export type ListCodeqlDatabasesInput = { owner: string; repo: string };
export type ListOrgCodeScanningAlertsInput = {
  org: string;
  toolName?: string;
  toolGuid?: string;
  before?: string;
  after?: string;
  direction?: string;
  state?: string;
  sort?: string;
  severity?: string;
  assignees?: string;
} & Page;
export type GetGlobalAdvisoryInput = { ghsaId: string };
export type ListGlobalAdvisoriesInput = {
  ghsaId?: string;
  advisoryType?: string;
  cveId?: string;
  ecosystem?: string;
  severity?: string;
  cwes?: string;
  isWithdrawn?: boolean;
  affects?: string;
  published?: string;
  updated?: string;
  modified?: string;
  epssPercentage?: string;
  epssPercentile?: string;
  before?: string;
  after?: string;
  direction?: string;
  perPage?: number;
  sort?: string;
};

export type NormalizedPagesBuild = {
  url: string;
  status: string;
  errorMessage: string;
  commit: string;
  duration: number;
  createdAt: string;
  updatedAt: string;
};

export type NormalizedPagesDeployment = { status: string };

export type NormalizedSarifUpload = {
  processingStatus: string;
  analysesUrl: string;
};

export type NormalizedCodeqlDatabase = {
  id: number;
  name: string;
  language: string;
  size: number;
  createdAt: string;
  updatedAt: string;
  url: string;
  commitOid: string;
};

export type NormalizedOrgCodeScanningAlert = {
  number: number;
  state: string;
  htmlUrl: string;
  ruleId: string;
  repository: string;
};

export type NormalizedGlobalAdvisory = {
  ghsaId: string;
  cveId: string;
  summary: string;
  description: string;
  severity: string;
  htmlUrl: string;
  publishedAt: string;
  updatedAt: string;
  withdrawnAt: string;
};

const ORG_ALERT_STATE = new Set(["open", "closed", "dismissed", "fixed"]);
const ORG_ALERT_SORT = new Set(["created", "updated"]);
const ORG_ALERT_SEVERITY = new Set(["critical", "high", "medium", "low", "warning", "note", "error"]);
const ADVISORY_TYPE = new Set(["reviewed", "malware", "unreviewed"]);
const ADVISORY_SEVERITY = new Set(["unknown", "low", "medium", "high", "critical"]);
const ADVISORY_SORT = new Set(["updated", "published", "epss_percentage", "epss_percentile"]);
const DIRECTION = new Set(["asc", "desc"]);

export function validateGetPagesBuildInput(input: unknown): GetPagesBuildInput {
  if (!isRecord(input)) throw new Error("repos.pages.builds.get input must be an object");
  return { ...repoScope(input), buildId: requireId(input.buildId, "buildId") };
}

export function validateGetLatestPagesBuildInput(input: unknown): GetLatestPagesBuildInput {
  if (!isRecord(input)) throw new Error("repos.pages.builds.latest.get input must be an object");
  return repoScope(input);
}

export function validateGetPagesDeploymentInput(input: unknown): GetPagesDeploymentInput {
  if (!isRecord(input)) throw new Error("repos.pages.deployments.get input must be an object");
  return { ...repoScope(input), pagesDeploymentId: requireDeploymentId(input.pagesDeploymentId) };
}

export function validateListPagesBuildsInput(input: unknown): ListPagesBuildsInput {
  if (!isRecord(input)) throw new Error("repos.pages.builds.list input must be an object");
  return { ...repoScope(input), ...pageInput(input) };
}

export function validateGetSarifUploadInput(input: unknown): GetSarifUploadInput {
  if (!isRecord(input)) throw new Error("code_scanning.sarifs.get input must be an object");
  return { ...repoScope(input), sarifId: requireSingleSegment(input.sarifId, "sarifId") };
}

export function validateListCodeqlDatabasesInput(input: unknown): ListCodeqlDatabasesInput {
  if (!isRecord(input)) throw new Error("code_scanning.codeql.databases.list input must be an object");
  return repoScope(input);
}

export function validateListOrgCodeScanningAlertsInput(input: unknown): ListOrgCodeScanningAlertsInput {
  if (!isRecord(input)) throw new Error("orgs.code_scanning.alerts.list input must be an object");
  const toolName = optionalQueryString(input.toolName, "toolName");
  const toolGuid = optionalQueryString(input.toolGuid, "toolGuid");
  if (toolName !== undefined && toolGuid !== undefined) {
    throw new Error("toolName and toolGuid cannot both be set");
  }
  return {
    org: requireSingleSegment(input.org, "org"),
    toolName,
    toolGuid,
    before: optionalQueryString(input.before, "before"),
    after: optionalQueryString(input.after, "after"),
    direction: optionalEnum(input.direction, "direction", DIRECTION),
    state: optionalEnum(input.state, "state", ORG_ALERT_STATE),
    sort: optionalEnum(input.sort, "sort", ORG_ALERT_SORT),
    severity: optionalEnum(input.severity, "severity", ORG_ALERT_SEVERITY),
    assignees: optionalQueryString(input.assignees, "assignees"),
    ...pageInput(input),
  };
}

export function validateGetGlobalAdvisoryInput(input: unknown): GetGlobalAdvisoryInput {
  if (!isRecord(input)) throw new Error("advisories.get input must be an object");
  return { ghsaId: requireGhsaId(input.ghsaId, "ghsaId") };
}

export function validateListGlobalAdvisoriesInput(input: unknown): ListGlobalAdvisoriesInput {
  if (!isRecord(input)) throw new Error("advisories.list input must be an object");
  return {
    ghsaId: input.ghsaId === undefined ? undefined : requireGhsaId(input.ghsaId, "ghsaId"),
    advisoryType: optionalEnum(input.advisoryType, "advisoryType", ADVISORY_TYPE),
    cveId: optionalQueryString(input.cveId, "cveId"),
    ecosystem: optionalQueryString(input.ecosystem, "ecosystem"),
    severity: optionalEnum(input.severity, "severity", ADVISORY_SEVERITY),
    cwes: optionalQueryString(input.cwes, "cwes"),
    isWithdrawn: optionalBoolean(input.isWithdrawn, "isWithdrawn"),
    affects: optionalQueryString(input.affects, "affects"),
    published: optionalQueryString(input.published, "published"),
    updated: optionalQueryString(input.updated, "updated"),
    modified: optionalQueryString(input.modified, "modified"),
    epssPercentage: optionalQueryString(input.epssPercentage, "epssPercentage"),
    epssPercentile: optionalQueryString(input.epssPercentile, "epssPercentile"),
    before: optionalQueryString(input.before, "before"),
    after: optionalQueryString(input.after, "after"),
    direction: optionalEnum(input.direction, "direction", DIRECTION),
    perPage: optionalPage(input.perPage, "perPage", 100),
    sort: optionalEnum(input.sort, "sort", ADVISORY_SORT),
  };
}

export function normalizePagesBuild(item: Record<string, unknown>): NormalizedPagesBuild {
  const error = isRecord(item.error) ? item.error : {};
  return {
    url: typeof item.url === "string" ? item.url : "",
    status: typeof item.status === "string" ? item.status : "",
    errorMessage: typeof error.message === "string" ? error.message : "",
    commit: typeof item.commit === "string" ? item.commit : "",
    duration: typeof item.duration === "number" ? item.duration : 0,
    createdAt: typeof item.created_at === "string" ? item.created_at : "",
    updatedAt: typeof item.updated_at === "string" ? item.updated_at : "",
  };
}

export function normalizePagesDeployment(item: Record<string, unknown>): NormalizedPagesDeployment {
  return { status: typeof item.status === "string" ? item.status : "" };
}

export function normalizeSarifUpload(item: Record<string, unknown>): NormalizedSarifUpload {
  return {
    processingStatus: typeof item.processing_status === "string" ? item.processing_status : "",
    analysesUrl: typeof item.analyses_url === "string" ? item.analyses_url : "",
  };
}

export function normalizeCodeqlDatabase(item: Record<string, unknown>): NormalizedCodeqlDatabase {
  return {
    id: typeof item.id === "number" ? item.id : 0,
    name: typeof item.name === "string" ? item.name : "",
    language: typeof item.language === "string" ? item.language : "",
    size: typeof item.size === "number" ? item.size : 0,
    createdAt: typeof item.created_at === "string" ? item.created_at : "",
    updatedAt: typeof item.updated_at === "string" ? item.updated_at : "",
    url: typeof item.url === "string" ? item.url : "",
    commitOid: typeof item.commit_oid === "string" ? item.commit_oid : "",
  };
}

export function normalizeOrgCodeScanningAlert(item: Record<string, unknown>): NormalizedOrgCodeScanningAlert {
  const rule = isRecord(item.rule) ? item.rule : {};
  const repository = isRecord(item.repository) ? item.repository : {};
  return {
    number: typeof item.number === "number" ? item.number : 0,
    state: typeof item.state === "string" ? item.state : "",
    htmlUrl: typeof item.html_url === "string" ? item.html_url : "",
    ruleId: typeof rule.id === "string" ? rule.id : "",
    repository: typeof repository.full_name === "string" ? repository.full_name : "",
  };
}

export function normalizeGlobalAdvisory(item: Record<string, unknown>): NormalizedGlobalAdvisory {
  return {
    ghsaId: typeof item.ghsa_id === "string" ? item.ghsa_id : "",
    cveId: typeof item.cve_id === "string" ? item.cve_id : "",
    summary: typeof item.summary === "string" ? item.summary : "",
    description: typeof item.description === "string" ? item.description : "",
    severity: typeof item.severity === "string" ? item.severity : "",
    htmlUrl: typeof item.html_url === "string" ? item.html_url : "",
    publishedAt: typeof item.published_at === "string" ? item.published_at : "",
    updatedAt: typeof item.updated_at === "string" ? item.updated_at : "",
    withdrawnAt: typeof item.withdrawn_at === "string" ? item.withdrawn_at : "",
  };
}

export function createCard16ReadsClient(options: { accessToken: string; fetch?: typeof fetch; githubClient?: GitHubClient }) {
  const client = options.githubClient ?? createGitHubClient({
    accessToken: options.accessToken,
    fetch: options.fetch,
    operation: "repos.pages.builds.get",
  });

  return {
    async getPagesBuild(input: unknown) {
      const payload = validateGetPagesBuildInput(input);
      const response = await client.fetchJSON(`${repoPath(payload.owner, payload.repo)}/pages/builds/${payload.buildId}`);
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, build: normalizePagesBuild(response.body) };
      }
      if (response.status === 404) return upstream("Pages build not found.");
      return mapRateOrUpstream(response, "GitHub rejected the Pages build request.");
    },

    async getLatestPagesBuild(input: unknown) {
      const payload = validateGetLatestPagesBuildInput(input);
      const response = await client.fetchJSON(`${repoPath(payload.owner, payload.repo)}/pages/builds/latest`);
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, build: normalizePagesBuild(response.body) };
      }
      if (response.status === 404) return upstream("Latest Pages build not found.");
      return mapRateOrUpstream(response, "GitHub rejected the latest Pages build request.");
    },

    async getPagesDeployment(input: unknown) {
      const payload = validateGetPagesDeploymentInput(input);
      const response = await client.fetchJSON(`${repoPath(payload.owner, payload.repo)}/pages/deployments/${encodeURIComponent(payload.pagesDeploymentId)}`);
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, deployment: normalizePagesDeployment(response.body) };
      }
      if (response.status === 404) return upstream("Pages deployment not found.");
      return mapRateOrUpstream(response, "GitHub rejected the Pages deployment request.");
    },

    async listPagesBuilds(input: unknown) {
      const payload = validateListPagesBuildsInput(input);
      const response = await client.fetchJSON(`${repoPath(payload.owner, payload.repo)}/pages/builds${query(pageQuery(payload))}`);
      if (response.status === 200 && Array.isArray(response.body)) {
        return { ok: true as const, builds: response.body.filter(isRecord).map(normalizePagesBuild) };
      }
      if (response.status === 404) return upstream("Pages builds not found.");
      return mapRateOrUpstream(response, "GitHub rejected the list Pages builds request.");
    },

    async getSarifUpload(input: unknown) {
      const payload = validateGetSarifUploadInput(input);
      const response = await client.fetchJSON(`${repoPath(payload.owner, payload.repo)}/code-scanning/sarifs/${encodeURIComponent(payload.sarifId)}`);
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, sarif: normalizeSarifUpload(response.body) };
      }
      if (response.status === 404) return upstream("SARIF upload not found.");
      return mapRateOrUpstream(response, "GitHub rejected the SARIF upload request.");
    },

    async listCodeqlDatabases(input: unknown) {
      const payload = validateListCodeqlDatabasesInput(input);
      const response = await client.fetchJSON(`${repoPath(payload.owner, payload.repo)}/code-scanning/codeql/databases`);
      if (response.status === 200 && Array.isArray(response.body)) {
        return { ok: true as const, databases: response.body.filter(isRecord).map(normalizeCodeqlDatabase) };
      }
      if (response.status === 404) return upstream("CodeQL databases not found.");
      return mapRateOrUpstream(response, "GitHub rejected the list CodeQL databases request.");
    },

    async listOrgCodeScanningAlerts(input: unknown) {
      const payload = validateListOrgCodeScanningAlertsInput(input);
      const path = `/orgs/${encodeURIComponent(payload.org)}/code-scanning/alerts${query({
        tool_name: payload.toolName,
        tool_guid: payload.toolGuid,
        before: payload.before,
        after: payload.after,
        per_page: payload.perPage,
        page: payload.page,
        direction: payload.direction,
        state: payload.state,
        sort: payload.sort,
        severity: payload.severity,
        assignees: payload.assignees,
      })}`;
      const response = await client.fetchJSON(path);
      if (response.status === 200 && Array.isArray(response.body)) {
        return { ok: true as const, alerts: response.body.filter(isRecord).map(normalizeOrgCodeScanningAlert) };
      }
      if (response.status === 404) return upstream("Organization code scanning alerts not found.");
      return mapRateOrUpstream(response, "GitHub rejected the list organization code scanning alerts request.");
    },

    async getGlobalAdvisory(input: unknown) {
      const payload = validateGetGlobalAdvisoryInput(input);
      const response = await client.fetchJSON(`/advisories/${encodeURIComponent(payload.ghsaId)}`);
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, advisory: normalizeGlobalAdvisory(response.body) };
      }
      if (response.status === 404) return upstream("Global security advisory not found.");
      return mapRateOrUpstream(response, "GitHub rejected the global security advisory request.");
    },

    async listGlobalAdvisories(input: unknown) {
      const payload = validateListGlobalAdvisoriesInput(input);
      const path = `/advisories${query({
        ghsa_id: payload.ghsaId,
        type: payload.advisoryType,
        cve_id: payload.cveId,
        ecosystem: payload.ecosystem,
        severity: payload.severity,
        cwes: payload.cwes,
        is_withdrawn: payload.isWithdrawn === undefined ? undefined : String(payload.isWithdrawn),
        affects: payload.affects,
        published: payload.published,
        updated: payload.updated,
        modified: payload.modified,
        epss_percentage: payload.epssPercentage,
        epss_percentile: payload.epssPercentile,
        before: payload.before,
        after: payload.after,
        direction: payload.direction,
        per_page: payload.perPage,
        sort: payload.sort,
      })}`;
      const response = await client.fetchJSON(path);
      if (response.status === 200 && Array.isArray(response.body)) {
        return { ok: true as const, advisories: response.body.filter(isRecord).map(normalizeGlobalAdvisory) };
      }
      if (response.status === 404) return upstream("Global security advisories not found.");
      return mapRateOrUpstream(response, "GitHub rejected the list global security advisories request.");
    },
  };
}

function pageQuery(payload: Page): Record<string, number | undefined> {
  return { per_page: payload.perPage, page: payload.page };
}

function query(fields: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}

function repoPath(owner: string, repo: string): string {
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

function repoScope(input: Record<string, unknown>): { owner: string; repo: string } {
  return {
    owner: requireSingleSegment(input.owner, "owner"),
    repo: requireSingleSegment(input.repo, "repo"),
  };
}

function pageInput(input: Record<string, unknown>): Page {
  return {
    perPage: optionalPage(input.perPage, "perPage", 100),
    page: optionalPage(input.page, "page", 1_000_000),
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

function requireDeploymentId(value: unknown): string {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 1) return String(value);
  return requireSingleSegment(value, "pagesDeploymentId");
}

function requireGhsaId(value: unknown, field: string): string {
  const text = requireString(value, field);
  if (!/^GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/i.test(text)) {
    throw new Error(`${field} must be a GHSA id`);
  }
  return text;
}

function requireSingleSegment(value: unknown, field: string): string {
  const text = requireString(value, field);
  if (text.includes("/") || text.includes("?") || text.includes("#")) {
    throw new Error(`${field} must be a single path segment`);
  }
  return text;
}

function requireId(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${field} must be a positive integer`);
  }
  return value;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function optionalQueryString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  const text = requireString(value, field);
  if (/[\r\n]/.test(text)) throw new Error(`${field} must be a single line`);
  return text;
}

function optionalEnum(value: unknown, field: string, allowed: Set<string>): string | undefined {
  const text = optionalQueryString(value, field);
  if (text === undefined) return undefined;
  if (!allowed.has(text)) throw new Error(`${field} is not a documented value`);
  return text;
}

function optionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new Error(`${field} must be a boolean`);
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
