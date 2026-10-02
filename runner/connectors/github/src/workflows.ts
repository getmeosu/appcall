import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";

// ─── Types / normalizers ──────────────────────────────────────────────────────

export type NormalizedWorkflow = {
  id: string;
  provider: "github";
  providerWorkflowId: number;
  name: string;
  path: string;
  state: string;
  url: string;
  htmlUrl: string;
  badgeUrl: string;
  createdAt: string;
  updatedAt: string;
  modelVersion: "2026-05-16";
  raw: Record<string, unknown>;
};

export function normalizeWorkflow(item: Record<string, unknown>): NormalizedWorkflow {
  return {
    id: `gh-workflow:${typeof item.id === "number" ? item.id : 0}`,
    provider: "github",
    providerWorkflowId: typeof item.id === "number" ? item.id : 0,
    name: typeof item.name === "string" ? item.name : "",
    path: typeof item.path === "string" ? item.path : "",
    state: typeof item.state === "string" ? item.state : "",
    url: typeof item.url === "string" ? item.url : "",
    htmlUrl: typeof item.html_url === "string" ? item.html_url : "",
    badgeUrl: typeof item.badge_url === "string" ? item.badge_url : "",
    createdAt: typeof item.created_at === "string" ? item.created_at : "",
    updatedAt: typeof item.updated_at === "string" ? item.updated_at : "",
    modelVersion: "2026-05-16",
    raw: item,
  };
}

export type NormalizedWorkflowRun = {
  id: string;
  provider: "github";
  providerRunId: number;
  name: string;
  headBranch: string;
  headSha: string;
  path: string;
  runNumber: number;
  event: string;
  status: string;
  conclusion: string;
  workflowId: number;
  url: string;
  htmlUrl: string;
  displayTitle: string;
  runAttempt: number;
  createdAt: string;
  updatedAt: string;
  runStartedAt: string;
  actor: string;
  modelVersion: "2026-05-16";
  raw: Record<string, unknown>;
};

export function normalizeWorkflowRun(item: Record<string, unknown>): NormalizedWorkflowRun {
  const actor = isRecord(item.actor) ? item.actor : {};
  return {
    id: `gh-run:${typeof item.id === "number" ? item.id : 0}`,
    provider: "github",
    providerRunId: typeof item.id === "number" ? item.id : 0,
    name: typeof item.name === "string" ? item.name : "",
    headBranch: typeof item.head_branch === "string" ? item.head_branch : "",
    headSha: typeof item.head_sha === "string" ? item.head_sha : "",
    path: typeof item.path === "string" ? item.path : "",
    runNumber: typeof item.run_number === "number" ? item.run_number : 0,
    event: typeof item.event === "string" ? item.event : "",
    status: typeof item.status === "string" ? item.status : "",
    conclusion: typeof item.conclusion === "string" ? item.conclusion : "",
    workflowId: typeof item.workflow_id === "number" ? item.workflow_id : 0,
    url: typeof item.url === "string" ? item.url : "",
    htmlUrl: typeof item.html_url === "string" ? item.html_url : "",
    displayTitle: typeof item.display_title === "string" ? item.display_title : "",
    runAttempt: typeof item.run_attempt === "number" ? item.run_attempt : 1,
    createdAt: typeof item.created_at === "string" ? item.created_at : "",
    updatedAt: typeof item.updated_at === "string" ? item.updated_at : "",
    runStartedAt: typeof item.run_started_at === "string" ? item.run_started_at : "",
    actor: typeof actor.login === "string" ? actor.login : "",
    modelVersion: "2026-05-16",
    raw: item,
  };
}

export type NormalizedWorkflowJob = {
  id: string;
  provider: "github";
  providerJobId: number;
  runId: number;
  name: string;
  status: string;
  conclusion: string;
  headSha: string;
  headBranch: string;
  url: string;
  htmlUrl: string;
  labels: string[];
  startedAt: string;
  completedAt: string;
  createdAt: string;
  modelVersion: "2026-05-16";
  raw: Record<string, unknown>;
};

export function normalizeWorkflowJob(item: Record<string, unknown>): NormalizedWorkflowJob {
  const labels = Array.isArray(item.labels)
    ? item.labels.filter((l): l is string => typeof l === "string")
    : [];
  return {
    id: `gh-job:${typeof item.id === "number" ? item.id : 0}`,
    provider: "github",
    providerJobId: typeof item.id === "number" ? item.id : 0,
    runId: typeof item.run_id === "number" ? item.run_id : 0,
    name: typeof item.name === "string" ? item.name : "",
    status: typeof item.status === "string" ? item.status : "",
    conclusion: typeof item.conclusion === "string" ? item.conclusion : "",
    headSha: typeof item.head_sha === "string" ? item.head_sha : "",
    headBranch: typeof item.head_branch === "string" ? item.head_branch : "",
    url: typeof item.url === "string" ? item.url : "",
    htmlUrl: typeof item.html_url === "string" ? item.html_url : "",
    labels,
    startedAt: typeof item.started_at === "string" ? item.started_at : "",
    completedAt: typeof item.completed_at === "string" ? item.completed_at : "",
    createdAt: typeof item.created_at === "string" ? item.created_at : "",
    modelVersion: "2026-05-16",
    raw: item,
  };
}

export type NormalizedArtifact = {
  id: string;
  provider: "github";
  providerArtifactId: number;
  name: string;
  sizeInBytes: number;
  url: string;
  archiveDownloadUrl: string;
  expired: boolean;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  runId: number;
  modelVersion: "2026-05-16";
  raw: Record<string, unknown>;
};

export function normalizeArtifact(item: Record<string, unknown>): NormalizedArtifact {
  const run = isRecord(item.workflow_run) ? item.workflow_run : {};
  return {
    id: `gh-artifact:${typeof item.id === "number" ? item.id : 0}`,
    provider: "github",
    providerArtifactId: typeof item.id === "number" ? item.id : 0,
    name: typeof item.name === "string" ? item.name : "",
    sizeInBytes: typeof item.size_in_bytes === "number" ? item.size_in_bytes : 0,
    url: typeof item.url === "string" ? item.url : "",
    archiveDownloadUrl: typeof item.archive_download_url === "string" ? item.archive_download_url : "",
    expired: item.expired === true,
    createdAt: typeof item.created_at === "string" ? item.created_at : "",
    updatedAt: typeof item.updated_at === "string" ? item.updated_at : "",
    expiresAt: typeof item.expires_at === "string" ? item.expires_at : "",
    runId: typeof run.id === "number" ? run.id : 0,
    modelVersion: "2026-05-16",
    raw: item,
  };
}

// ─── Validation ───────────────────────────────────────────────────────────────

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new Error(`${field} must be a positive integer`);
  }
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

/** workflow_id may be a numeric id or a workflow file name (e.g. ci.yml). */
function requireWorkflowId(value: unknown): string {
  if (typeof value === "number" && Number.isInteger(value) && value >= 1) return String(value);
  if (typeof value === "string" && value.length > 0) return value;
  throw new Error("workflowId is required (numeric id or workflow file name)");
}

export type ListWorkflowsInput = { owner: string; repo: string; perPage?: number; page?: number };
export function validateListWorkflowsInput(input: unknown): ListWorkflowsInput {
  if (!isRecord(input)) throw new Error("list workflows input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    perPage: optionalPage(input.perPage, "perPage"),
    page: optionalPage(input.page, "page", 1_000_000),
  };
}

export type GetWorkflowInput = { owner: string; repo: string; workflowId: string };
export function validateGetWorkflowInput(input: unknown): GetWorkflowInput {
  if (!isRecord(input)) throw new Error("get workflow input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    workflowId: requireWorkflowId(input.workflowId),
  };
}

export type ListRunsInput = {
  owner: string;
  repo: string;
  actor?: string;
  branch?: string;
  event?: string;
  status?: string;
  perPage?: number;
  page?: number;
  headSha?: string;
};
export function validateListRunsInput(input: unknown): ListRunsInput {
  if (!isRecord(input)) throw new Error("list runs input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    actor: typeof input.actor === "string" ? input.actor : undefined,
    branch: typeof input.branch === "string" ? input.branch : undefined,
    event: typeof input.event === "string" ? input.event : undefined,
    status: typeof input.status === "string" ? input.status : undefined,
    perPage: optionalPage(input.perPage, "perPage"),
    page: optionalPage(input.page, "page", 1_000_000),
    headSha: typeof input.headSha === "string" ? input.headSha : undefined,
  };
}

export type GetRunInput = { owner: string; repo: string; runId: number };
export function validateGetRunInput(input: unknown): GetRunInput {
  if (!isRecord(input)) throw new Error("get run input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    runId: requireNumber(input.runId, "runId"),
  };
}

export type CancelRunInput = GetRunInput;
export function validateCancelRunInput(input: unknown): CancelRunInput {
  return validateGetRunInput(input);
}

export type RerunRunInput = GetRunInput & { enableDebugLogging?: boolean };
export function validateRerunRunInput(input: unknown): RerunRunInput {
  if (!isRecord(input)) throw new Error("rerun run input must be an object");
  const base = validateGetRunInput(input);
  if (input.enableDebugLogging !== undefined && typeof input.enableDebugLogging !== "boolean") {
    throw new Error("enableDebugLogging must be a boolean");
  }
  return {
    ...base,
    enableDebugLogging: typeof input.enableDebugLogging === "boolean" ? input.enableDebugLogging : undefined,
  };
}

export type DispatchWorkflowInput = {
  owner: string;
  repo: string;
  workflowId: string;
  ref: string;
  inputs?: Record<string, string>;
};
export function validateDispatchWorkflowInput(input: unknown): DispatchWorkflowInput {
  if (!isRecord(input)) throw new Error("dispatch workflow input must be an object");
  let inputs: Record<string, string> | undefined;
  if (input.inputs !== undefined) {
    if (!isRecord(input.inputs)) throw new Error("inputs must be an object of string values");
    inputs = {};
    for (const [k, v] of Object.entries(input.inputs)) {
      if (typeof v !== "string") throw new Error(`inputs.${k} must be a string`);
      inputs[k] = v;
    }
  }
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    workflowId: requireWorkflowId(input.workflowId),
    ref: requireString(input.ref, "ref"),
    inputs,
  };
}

export type ListJobsInput = { owner: string; repo: string; runId: number; filter?: string; perPage?: number; page?: number };
export function validateListJobsInput(input: unknown): ListJobsInput {
  if (!isRecord(input)) throw new Error("list jobs input must be an object");
  const filter = typeof input.filter === "string" ? input.filter : undefined;
  if (filter !== undefined && filter !== "latest" && filter !== "all") {
    throw new Error("filter must be latest or all");
  }
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    runId: requireNumber(input.runId, "runId"),
    filter,
    perPage: optionalPage(input.perPage, "perPage"),
    page: optionalPage(input.page, "page", 1_000_000),
  };
}

export type GetJobInput = { owner: string; repo: string; jobId: number };
export function validateGetJobInput(input: unknown): GetJobInput {
  if (!isRecord(input)) throw new Error("get job input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    jobId: requireNumber(input.jobId, "jobId"),
  };
}

export type GetJobLogsInput = GetJobInput;
export function validateGetJobLogsInput(input: unknown): GetJobLogsInput {
  return validateGetJobInput(input);
}

export type ListArtifactsInput = {
  owner: string;
  repo: string;
  runId?: number;
  name?: string;
  perPage?: number;
  page?: number;
};
export function validateListArtifactsInput(input: unknown): ListArtifactsInput {
  if (!isRecord(input)) throw new Error("list artifacts input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    runId: input.runId === undefined ? undefined : requireNumber(input.runId, "runId"),
    name: typeof input.name === "string" ? input.name : undefined,
    perPage: optionalPage(input.perPage, "perPage"),
    page: optionalPage(input.page, "page", 1_000_000),
  };
}

export type GetArtifactInput = { owner: string; repo: string; artifactId: number };
export function validateGetArtifactInput(input: unknown): GetArtifactInput {
  if (!isRecord(input)) throw new Error("get artifact input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    artifactId: requireNumber(input.artifactId, "artifactId"),
  };
}

// ─── Error helpers ────────────────────────────────────────────────────────────

function rateLimited(status: number, headers: Record<string, string>) {
  const rateLimit = parseGitHubRateLimit(status, headers);
  return {
    ok: false as const,
    error: {
      code: "CONNECTOR_RATE_LIMITED",
      message: "GitHub rate limit exceeded.",
      retryAfterSeconds: rateLimit.limited ? rateLimit.retryAfterSeconds : undefined,
    },
  };
}

function isRateLimited(status: number, headers: Record<string, string>): boolean {
  return status === 429 || (status === 403 && parseGitHubRateLimit(status, headers).limited);
}

function upstream(message: string) {
  return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message } };
}

function qs(params: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v.length > 0) sp.set(k, v);
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

// ─── Client ───────────────────────────────────────────────────────────────────

export function createWorkflowsClient(options: {
  accessToken: string;
  fetch?: typeof fetch;
  githubClient?: GitHubClient;
}) {
  const fetchImpl = options.fetch ?? fetch;
  const clientFor = (operation: string): GitHubClient =>
    options.githubClient ??
    createGitHubClient({
      accessToken: options.accessToken,
      fetch: options.fetch,
      operation,
    });

  return {
    async listWorkflows(input: unknown) {
      const payload = validateListWorkflowsInput(input);
      const client = clientFor("actions.workflows.list");
      const path =
        `/repos/${payload.owner}/${payload.repo}/actions/workflows` +
        qs({
          per_page: payload.perPage ? String(payload.perPage) : undefined,
          page: payload.page ? String(payload.page) : undefined,
        });
      const response = await client.fetchJSON(path);
      if (response.status === 200 && isRecord(response.body)) {
        const raw = Array.isArray(response.body.workflows) ? response.body.workflows : [];
        const workflows = raw.filter(isRecord).map(normalizeWorkflow);
        return {
          ok: true as const,
          totalCount: typeof response.body.total_count === "number" ? response.body.total_count : workflows.length,
          workflows,
        };
      }
      if (response.status === 404) return upstream("Repository not found.");
      if (isRateLimited(response.status, response.headers)) return rateLimited(response.status, response.headers);
      return upstream("GitHub rejected the list workflows request.");
    },

    async getWorkflow(input: unknown) {
      const payload = validateGetWorkflowInput(input);
      const client = clientFor("actions.workflows.get");
      const response = await client.fetchJSON(
        `/repos/${payload.owner}/${payload.repo}/actions/workflows/${encodeURIComponent(payload.workflowId)}`,
      );
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, workflow: normalizeWorkflow(response.body) };
      }
      if (response.status === 404) return upstream("Workflow not found.");
      if (isRateLimited(response.status, response.headers)) return rateLimited(response.status, response.headers);
      return upstream("GitHub rejected the get workflow request.");
    },

    async listRuns(input: unknown) {
      const payload = validateListRunsInput(input);
      const client = clientFor("actions.runs.list");
      const path =
        `/repos/${payload.owner}/${payload.repo}/actions/runs` +
        qs({
          actor: payload.actor,
          branch: payload.branch,
          event: payload.event,
          status: payload.status,
          head_sha: payload.headSha,
          per_page: payload.perPage ? String(payload.perPage) : undefined,
          page: payload.page ? String(payload.page) : undefined,
        });
      const response = await client.fetchJSON(path);
      if (response.status === 200 && isRecord(response.body)) {
        const raw = Array.isArray(response.body.workflow_runs) ? response.body.workflow_runs : [];
        const runs = raw.filter(isRecord).map(normalizeWorkflowRun);
        return {
          ok: true as const,
          totalCount: typeof response.body.total_count === "number" ? response.body.total_count : runs.length,
          runs,
        };
      }
      if (response.status === 404) return upstream("Repository not found.");
      if (isRateLimited(response.status, response.headers)) return rateLimited(response.status, response.headers);
      return upstream("GitHub rejected the list runs request.");
    },

    async getRun(input: unknown) {
      const payload = validateGetRunInput(input);
      const client = clientFor("actions.runs.get");
      const response = await client.fetchJSON(`/repos/${payload.owner}/${payload.repo}/actions/runs/${payload.runId}`);
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, run: normalizeWorkflowRun(response.body) };
      }
      if (response.status === 404) return upstream("Workflow run not found.");
      if (isRateLimited(response.status, response.headers)) return rateLimited(response.status, response.headers);
      return upstream("GitHub rejected the get run request.");
    },

    async cancelRun(input: unknown) {
      const payload = validateCancelRunInput(input);
      const client = clientFor("actions.runs.cancel");
      const response = await client.fetchJSON(
        `/repos/${payload.owner}/${payload.repo}/actions/runs/${payload.runId}/cancel`,
        { method: "POST" },
      );
      if (response.status === 202) {
        return { ok: true as const, cancelled: true as const, runId: payload.runId };
      }
      if (response.status === 409) return upstream("Workflow run could not be cancelled (conflict).");
      if (response.status === 404) return upstream("Workflow run not found.");
      if (isRateLimited(response.status, response.headers)) return rateLimited(response.status, response.headers);
      return upstream("GitHub rejected the cancel run request.");
    },

    async rerunRun(input: unknown) {
      const payload = validateRerunRunInput(input);
      const client = clientFor("actions.runs.rerun");
      const body: Record<string, unknown> = {};
      if (payload.enableDebugLogging === true) body.enable_debug_logging = true;
      const response = await client.fetchJSON(
        `/repos/${payload.owner}/${payload.repo}/actions/runs/${payload.runId}/rerun`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (response.status === 201) {
        return { ok: true as const, rerun: true as const, runId: payload.runId };
      }
      if (response.status === 403) return upstream("Forbidden to rerun workflow run.");
      if (response.status === 404) return upstream("Workflow run not found.");
      if (isRateLimited(response.status, response.headers)) return rateLimited(response.status, response.headers);
      return upstream("GitHub rejected the rerun run request.");
    },

    async dispatchWorkflow(input: unknown) {
      const payload = validateDispatchWorkflowInput(input);
      const client = clientFor("actions.workflows.dispatch");
      const body: Record<string, unknown> = { ref: payload.ref };
      if (payload.inputs) body.inputs = payload.inputs;
      const response = await client.fetchJSON(
        `/repos/${payload.owner}/${payload.repo}/actions/workflows/${encodeURIComponent(payload.workflowId)}/dispatches`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (response.status === 204) {
        return {
          ok: true as const,
          dispatched: true as const,
          workflowId: payload.workflowId,
          ref: payload.ref,
        };
      }
      if (response.status === 404) return upstream("Workflow not found.");
      if (response.status === 422) return upstream("Invalid workflow dispatch input.");
      if (isRateLimited(response.status, response.headers)) return rateLimited(response.status, response.headers);
      return upstream("GitHub rejected the workflow dispatch request.");
    },

    async listJobs(input: unknown) {
      const payload = validateListJobsInput(input);
      const client = clientFor("actions.jobs.list");
      const path =
        `/repos/${payload.owner}/${payload.repo}/actions/runs/${payload.runId}/jobs` +
        qs({
          filter: payload.filter,
          per_page: payload.perPage ? String(payload.perPage) : undefined,
          page: payload.page ? String(payload.page) : undefined,
        });
      const response = await client.fetchJSON(path);
      if (response.status === 200 && isRecord(response.body)) {
        const raw = Array.isArray(response.body.jobs) ? response.body.jobs : [];
        const jobs = raw.filter(isRecord).map(normalizeWorkflowJob);
        return {
          ok: true as const,
          totalCount: typeof response.body.total_count === "number" ? response.body.total_count : jobs.length,
          jobs,
        };
      }
      if (response.status === 404) return upstream("Workflow run not found.");
      if (isRateLimited(response.status, response.headers)) return rateLimited(response.status, response.headers);
      return upstream("GitHub rejected the list jobs request.");
    },

    async getJob(input: unknown) {
      const payload = validateGetJobInput(input);
      const client = clientFor("actions.jobs.get");
      const response = await client.fetchJSON(`/repos/${payload.owner}/${payload.repo}/actions/jobs/${payload.jobId}`);
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, job: normalizeWorkflowJob(response.body) };
      }
      if (response.status === 404) return upstream("Workflow job not found.");
      if (isRateLimited(response.status, response.headers)) return rateLimited(response.status, response.headers);
      return upstream("GitHub rejected the get job request.");
    },

    /**
     * Job logs return a short-lived 302 Location. The shared connector HTTP
     * boundary refuses to follow redirects; we capture Location via a manual
     * fetch against api.github.com only and return the download URL.
     */
    async getJobLogs(input: unknown) {
      const payload = validateGetJobLogsInput(input);
      const url = `https://api.github.com/repos/${payload.owner}/${payload.repo}/actions/jobs/${payload.jobId}/logs`;
      const response = await fetchImpl(url, {
        method: "GET",
        redirect: "manual",
        headers: {
          Authorization: `Bearer ${options.accessToken}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });
      const headers: Record<string, string> = {};
      response.headers.forEach((v, k) => {
        headers[k] = v;
      });
      if (response.status === 302 || response.status === 301 || response.status === 307 || response.status === 308) {
        const downloadUrl = response.headers.get("location") ?? response.headers.get("Location") ?? "";
        if (!downloadUrl) return upstream("GitHub returned a redirect without Location for job logs.");
        return {
          ok: true as const,
          logs: {
            jobId: payload.jobId,
            downloadUrl,
            expiresInSeconds: 60,
          },
        };
      }
      if (response.status === 404) return upstream("Workflow job logs not found.");
      if (isRateLimited(response.status, headers)) return rateLimited(response.status, headers);
      return upstream("GitHub rejected the get job logs request.");
    },

    async listArtifacts(input: unknown) {
      const payload = validateListArtifactsInput(input);
      const client = clientFor("actions.artifacts.list");
      const base = payload.runId
        ? `/repos/${payload.owner}/${payload.repo}/actions/runs/${payload.runId}/artifacts`
        : `/repos/${payload.owner}/${payload.repo}/actions/artifacts`;
      const path =
        base +
        qs({
          name: payload.name,
          per_page: payload.perPage ? String(payload.perPage) : undefined,
          page: payload.page ? String(payload.page) : undefined,
        });
      const response = await client.fetchJSON(path);
      if (response.status === 200 && isRecord(response.body)) {
        const raw = Array.isArray(response.body.artifacts) ? response.body.artifacts : [];
        const artifacts = raw.filter(isRecord).map(normalizeArtifact);
        return {
          ok: true as const,
          totalCount: typeof response.body.total_count === "number" ? response.body.total_count : artifacts.length,
          artifacts,
        };
      }
      if (response.status === 404) return upstream("Repository or workflow run not found.");
      if (isRateLimited(response.status, response.headers)) return rateLimited(response.status, response.headers);
      return upstream("GitHub rejected the list artifacts request.");
    },

    async getArtifact(input: unknown) {
      const payload = validateGetArtifactInput(input);
      const client = clientFor("actions.artifacts.get");
      const response = await client.fetchJSON(
        `/repos/${payload.owner}/${payload.repo}/actions/artifacts/${payload.artifactId}`,
      );
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, artifact: normalizeArtifact(response.body) };
      }
      if (response.status === 404) return upstream("Artifact not found.");
      if (isRateLimited(response.status, response.headers)) return rateLimited(response.status, response.headers);
      return upstream("GitHub rejected the get artifact request.");
    },
  };
}
