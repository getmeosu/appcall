import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";

// ─── Types ───────────────────────────────────────────────────────────────────

export type GitHubCheckRun = {
  id: number;
  name?: string;
  status?: string;
  conclusion?: string | null;
  head_sha?: string;
  html_url?: string;
  details_url?: string;
  started_at?: string;
  completed_at?: string | null;
  check_suite?: { id?: number };
  app?: { name?: string; slug?: string };
  [key: string]: unknown;
};

export type NormalizedCheckRun = {
  id: number;
  name: string;
  status: string;
  conclusion: string;
  headSha: string;
  url: string;
  detailsUrl: string;
  startedAt: string;
  completedAt: string;
  checkSuiteId: number | null;
  appName: string;
  modelVersion: "2026-05-16";
  raw: GitHubCheckRun;
};

export function normalizeGitHubCheckRun(run: GitHubCheckRun): NormalizedCheckRun {
  return {
    id: run.id,
    name: run.name ?? "",
    status: run.status ?? "",
    conclusion: run.conclusion ?? "",
    headSha: run.head_sha ?? "",
    url: run.html_url ?? "",
    detailsUrl: run.details_url ?? "",
    startedAt: run.started_at ?? "",
    completedAt: run.completed_at ?? "",
    checkSuiteId: typeof run.check_suite?.id === "number" ? run.check_suite.id : null,
    appName: run.app?.name ?? run.app?.slug ?? "",
    modelVersion: "2026-05-16",
    raw: run,
  };
}

export type GitHubCheckSuite = {
  id: number;
  status?: string;
  conclusion?: string | null;
  head_sha?: string;
  head_branch?: string | null;
  url?: string;
  app?: { name?: string; slug?: string };
  [key: string]: unknown;
};

export type NormalizedCheckSuite = {
  id: number;
  status: string;
  conclusion: string;
  headSha: string;
  headBranch: string;
  url: string;
  appName: string;
  modelVersion: "2026-05-16";
  raw: GitHubCheckSuite;
};

export function normalizeGitHubCheckSuite(suite: GitHubCheckSuite): NormalizedCheckSuite {
  return {
    id: suite.id,
    status: suite.status ?? "",
    conclusion: suite.conclusion ?? "",
    headSha: suite.head_sha ?? "",
    headBranch: suite.head_branch ?? "",
    url: suite.url ?? "",
    appName: suite.app?.name ?? suite.app?.slug ?? "",
    modelVersion: "2026-05-16",
    raw: suite,
  };
}

// ─── Input types & validators ─────────────────────────────────────────────────

export type ListCheckRunsForRefInput = {
  owner: string;
  repo: string;
  ref: string;
  checkName?: string;
  status?: string;
  filter?: string;
  perPage?: number;
  page?: number;
};

export function validateListCheckRunsForRefInput(input: unknown): ListCheckRunsForRefInput {
  if (!isRecord(input)) throw new Error("list check runs input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    ref: requireString(input.ref, "ref"),
    checkName: typeof input.checkName === "string" ? input.checkName : undefined,
    status: typeof input.status === "string" ? input.status : undefined,
    filter: typeof input.filter === "string" ? input.filter : undefined,
    perPage: typeof input.perPage === "number" ? input.perPage : undefined,
    page: typeof input.page === "number" ? input.page : undefined,
  };
}

export type GetCheckRunInput = { owner: string; repo: string; checkRunId: number };

export function validateGetCheckRunInput(input: unknown): GetCheckRunInput {
  if (!isRecord(input)) throw new Error("get check run input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    checkRunId: requireNumber(input.checkRunId, "checkRunId"),
  };
}

export type ListCheckSuitesForRefInput = {
  owner: string;
  repo: string;
  ref: string;
  appId?: number;
  checkName?: string;
  perPage?: number;
  page?: number;
};

export function validateListCheckSuitesForRefInput(input: unknown): ListCheckSuitesForRefInput {
  if (!isRecord(input)) throw new Error("list check suites input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    ref: requireString(input.ref, "ref"),
    appId: typeof input.appId === "number" ? input.appId : undefined,
    checkName: typeof input.checkName === "string" ? input.checkName : undefined,
    perPage: typeof input.perPage === "number" ? input.perPage : undefined,
    page: typeof input.page === "number" ? input.page : undefined,
  };
}

// ─── Client ───────────────────────────────────────────────────────────────────

export function createChecksClient(options: { accessToken: string; fetch?: typeof fetch; githubClient?: GitHubClient }) {
  const client = options.githubClient ?? createGitHubClient({ accessToken: options.accessToken, fetch: options.fetch, operation: "checks.runs.list_for_ref" });

  return {
    async listRunsForRef(input: unknown) {
      const payload = validateListCheckRunsForRefInput(input);
      const params = new URLSearchParams();
      if (payload.checkName) params.set("check_name", payload.checkName);
      if (payload.status) params.set("status", payload.status);
      if (payload.filter) params.set("filter", payload.filter);
      if (payload.perPage) params.set("per_page", String(payload.perPage));
      if (payload.page) params.set("page", String(payload.page));
      const qs = params.toString() ? `?${params.toString()}` : "";
      const response = await client.fetchJSON(
        `/repos/${payload.owner}/${payload.repo}/commits/${encodeURIComponent(payload.ref)}/check-runs${qs}`
      );
      if (response.status === 200) {
        const body = isRecord(response.body) ? response.body : {};
        const runs = Array.isArray(body.check_runs) ? (body.check_runs as GitHubCheckRun[]).map(normalizeGitHubCheckRun) : [];
        return {
          ok: true as const,
          totalCount: typeof body.total_count === "number" ? body.total_count : runs.length,
          checkRuns: runs,
        };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Repository or ref not found." } };
      }
      return mapRateOrUpstream(response, "GitHub rejected the list check runs request.");
    },

    async getRun(input: unknown) {
      const payload = validateGetCheckRunInput(input);
      const response = await client.fetchJSON(`/repos/${payload.owner}/${payload.repo}/check-runs/${payload.checkRunId}`);
      if (response.status === 200) {
        return { ok: true as const, checkRun: normalizeGitHubCheckRun(response.body as GitHubCheckRun) };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Check run not found." } };
      }
      return mapRateOrUpstream(response, "GitHub rejected the get check run request.");
    },

    async listSuitesForRef(input: unknown) {
      const payload = validateListCheckSuitesForRefInput(input);
      const params = new URLSearchParams();
      if (payload.appId !== undefined) params.set("app_id", String(payload.appId));
      if (payload.checkName) params.set("check_name", payload.checkName);
      if (payload.perPage) params.set("per_page", String(payload.perPage));
      if (payload.page) params.set("page", String(payload.page));
      const qs = params.toString() ? `?${params.toString()}` : "";
      const response = await client.fetchJSON(
        `/repos/${payload.owner}/${payload.repo}/commits/${encodeURIComponent(payload.ref)}/check-suites${qs}`
      );
      if (response.status === 200) {
        const body = isRecord(response.body) ? response.body : {};
        const suites = Array.isArray(body.check_suites) ? (body.check_suites as GitHubCheckSuite[]).map(normalizeGitHubCheckSuite) : [];
        return {
          ok: true as const,
          totalCount: typeof body.total_count === "number" ? body.total_count : suites.length,
          checkSuites: suites,
        };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Repository or ref not found." } };
      }
      return mapRateOrUpstream(response, "GitHub rejected the list check suites request.");
    },
  };
}

function mapRateOrUpstream(response: { status: number; headers: Record<string, string> }, message: string) {
  if (response.status === 429 || (response.status === 403 && parseGitHubRateLimit(response.status, response.headers).limited)) {
    const rateLimit = parseGitHubRateLimit(response.status, response.headers);
    return {
      ok: false as const,
      error: {
        code: "CONNECTOR_RATE_LIMITED",
        message: "GitHub rate limit exceeded.",
        retryAfterSeconds: rateLimit.limited ? rateLimit.retryAfterSeconds : undefined,
      },
    };
  }
  return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message } };
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== "number") throw new Error(`${field} must be a number`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
