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
  // Idempotent-style id projection (milestones.get) and Reconcile reuse of create input.
  let checkRunId: number;
  if (input.checkRunId !== undefined) {
    checkRunId = requireNumber(input.checkRunId, "checkRunId");
  } else if (typeof input.id === "number") {
    checkRunId = requireNumber(input.id, "id");
  } else if (typeof input.id === "string" && /^\d+$/.test(input.id)) {
    const parsed = Number(input.id);
    // Number() rounds past MAX_SAFE_INTEGER; refuse a string that is not that integer.
    if (!Number.isSafeInteger(parsed) || String(parsed) !== input.id) {
      throw new Error("checkRunId must be a safe integer");
    }
    checkRunId = parsed;
  } else {
    throw new Error("checkRunId must be a number");
  }
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    checkRunId,
  };
}

export type ListCheckAnnotationsInput = {
  owner: string;
  repo: string;
  checkRunId: number;
  perPage?: number;
  page?: number;
};

export function validateListCheckAnnotationsInput(input: unknown): ListCheckAnnotationsInput {
  if (!isRecord(input)) throw new Error("list check annotations input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    checkRunId: requireNumber(input.checkRunId, "checkRunId"),
    perPage: typeof input.perPage === "number" ? input.perPage : undefined,
    page: typeof input.page === "number" ? input.page : undefined,
  };
}

const CHECK_STATUSES = ["queued", "in_progress", "completed", "waiting", "requested", "pending"] as const;
const CHECK_CONCLUSIONS = ["action_required", "cancelled", "failure", "neutral", "success", "skipped", "stale", "timed_out"] as const;

export type CheckRunOutputInput = { title: string; summary: string; text?: string };

export type CreateCheckRunInput = {
  owner: string;
  repo: string;
  name: string;
  headSha: string;
  status?: string;
  conclusion?: string;
  detailsUrl?: string;
  externalId?: string;
  startedAt?: string;
  completedAt?: string;
  output?: CheckRunOutputInput;
  /** Optional so Reconcile can call checks.runs.get with the same input after the id is known. */
  checkRunId?: number;
};

export function validateCreateCheckRunInput(input: unknown): CreateCheckRunInput {
  if (!isRecord(input)) throw new Error("create check run input must be an object");
  const status = typeof input.status === "string" ? input.status : undefined;
  if (status !== undefined && !CHECK_STATUSES.includes(status as (typeof CHECK_STATUSES)[number])) {
    throw new Error("status must be a check run status");
  }
  const conclusion = typeof input.conclusion === "string" ? input.conclusion : undefined;
  if (conclusion !== undefined && !CHECK_CONCLUSIONS.includes(conclusion as (typeof CHECK_CONCLUSIONS)[number])) {
    throw new Error("conclusion must be a check run conclusion");
  }
  let output: CheckRunOutputInput | undefined;
  if (input.output !== undefined) {
    if (!isRecord(input.output)) throw new Error("output must be an object");
    output = {
      title: requireString(input.output.title, "output.title"),
      summary: requireString(input.output.summary, "output.summary"),
      text: typeof input.output.text === "string" ? input.output.text : undefined,
    };
  }
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    name: requireString(input.name, "name"),
    headSha: requireString(input.headSha, "headSha"),
    status,
    conclusion,
    detailsUrl: typeof input.detailsUrl === "string" ? input.detailsUrl : undefined,
    externalId: typeof input.externalId === "string" ? input.externalId : undefined,
    startedAt: typeof input.startedAt === "string" ? input.startedAt : undefined,
    completedAt: typeof input.completedAt === "string" ? input.completedAt : undefined,
    output,
    checkRunId: input.checkRunId === undefined ? undefined : requireNumber(input.checkRunId, "checkRunId"),
  };
}

export type NormalizedCheckAnnotation = {
  path: string;
  startLine: number | null;
  endLine: number | null;
  annotationLevel: string;
  message: string;
  modelVersion: "2026-05-16";
  raw: Record<string, unknown>;
};

export function normalizeCheckAnnotation(item: Record<string, unknown>): NormalizedCheckAnnotation {
  return {
    path: typeof item.path === "string" ? item.path : "",
    startLine: typeof item.start_line === "number" ? item.start_line : null,
    endLine: typeof item.end_line === "number" ? item.end_line : null,
    annotationLevel: typeof item.annotation_level === "string" ? item.annotation_level : "",
    message: typeof item.message === "string" ? item.message : "",
    modelVersion: "2026-05-16",
    raw: item,
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

    async listAnnotations(input: unknown) {
      const payload = validateListCheckAnnotationsInput(input);
      const params = new URLSearchParams();
      if (payload.perPage) params.set("per_page", String(payload.perPage));
      if (payload.page) params.set("page", String(payload.page));
      const qs = params.toString() ? `?${params.toString()}` : "";
      const response = await client.fetchJSON(
        `${repoPath(payload.owner, payload.repo)}/check-runs/${payload.checkRunId}/annotations${qs}`,
      );
      if (response.status === 200) {
        const annotations = Array.isArray(response.body)
          ? (response.body as Record<string, unknown>[]).filter(isRecord).map(normalizeCheckAnnotation)
          : [];
        return { ok: true as const, annotations };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Check run not found." } };
      }
      return mapRateOrUpstream(response, "GitHub rejected the list check annotations request.");
    },

    async createRun(input: unknown) {
      const payload = validateCreateCheckRunInput(input);
      const body: Record<string, unknown> = {
        name: payload.name,
        head_sha: payload.headSha,
      };
      if (payload.status !== undefined) body.status = payload.status;
      if (payload.conclusion !== undefined) body.conclusion = payload.conclusion;
      if (payload.detailsUrl !== undefined) body.details_url = payload.detailsUrl;
      if (payload.externalId !== undefined) body.external_id = payload.externalId;
      if (payload.startedAt !== undefined) body.started_at = payload.startedAt;
      if (payload.completedAt !== undefined) body.completed_at = payload.completedAt;
      if (payload.output) {
        const output: Record<string, string> = {
          title: payload.output.title,
          summary: payload.output.summary,
        };
        if (payload.output.text !== undefined) output.text = payload.output.text;
        body.output = output;
      }
      const response = await client.fetchJSON(`${repoPath(payload.owner, payload.repo)}/check-runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.status === 201 && isRecord(response.body)) {
        const checkRun = normalizeGitHubCheckRun(response.body as GitHubCheckRun);
        return { ok: true as const, checkRun, id: checkRun.id };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Repository not found." } };
      }
      if (response.status === 422) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Validation failed for create check run." } };
      }
      return mapRateOrUpstream(response, "GitHub rejected the create check run request.");
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

function repoPath(owner: string, repo: string): string {
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
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
