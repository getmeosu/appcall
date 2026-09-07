import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";

export type GitHubPullRequest = {
  id: number;
  number: number;
  title: string;
  body?: string;
  state?: string;
  user?: { login?: string };
  html_url?: string;
  draft?: boolean;
  merged?: boolean;
  mergeable?: boolean;
  head?: { ref?: string; sha?: string; repo?: { full_name?: string } };
  base?: { ref?: string; sha?: string; repo?: { full_name?: string } };
  created_at?: string;
  updated_at?: string;
  merged_at?: string;
  closed_at?: string;
  labels?: { name?: string }[];
  repository_url?: string;
  [key: string]: unknown;
};

export type NormalizedPullRequest = {
  id: string;
  provider: "github";
  providerPullRequestId: number;
  number: number;
  title: string;
  body: string;
  state: string;
  isOpen: boolean;
  isDraft: boolean;
  isMerged: boolean;
  url: string;
  headBranch: string;
  baseBranch: string;
  headSha: string;
  headRepo: string;
  baseRepo: string;
  repositoryUrl: string;
  author: string;
  createdAt: string;
  updatedAt: string;
  mergedAt: string;
  closedAt: string;
  modelVersion: "2026-05-16";
  raw: GitHubPullRequest;
};

export function normalizeGitHubPullRequest(pr: GitHubPullRequest): NormalizedPullRequest {
  return {
    id: `gh-pr:${pr.id}`,
    provider: "github",
    providerPullRequestId: pr.id,
    number: pr.number,
    title: pr.title ?? "",
    body: pr.body ?? "",
    state: pr.state ?? "open",
    isOpen: pr.state === "open",
    isDraft: pr.draft ?? false,
    isMerged: pr.merged ?? false,
    url: pr.html_url ?? "",
    headBranch: pr.head?.ref ?? "",
    baseBranch: pr.base?.ref ?? "",
    headSha: pr.head?.sha ?? "",
    headRepo: pr.head?.repo?.full_name ?? "",
    baseRepo: pr.base?.repo?.full_name ?? "",
    repositoryUrl: pr.repository_url ?? "",
    author: pr.user?.login ?? "",
    createdAt: pr.created_at ?? "",
    updatedAt: pr.updated_at ?? "",
    mergedAt: pr.merged_at ?? "",
    closedAt: pr.closed_at ?? "",
    modelVersion: "2026-05-16",
    raw: pr,
  };
}

export function parsePullRequestsResponse(response: unknown): { pullRequests: GitHubPullRequest[]; nextLink: string | null } {
  const nextLink = isRecord(response) ? parseNextLink(response) : null;
  const value = Array.isArray(response) ? response : (isRecord(response) ? (response.value ?? null) : null);
  if (!Array.isArray(value)) return { pullRequests: [], nextLink };
  return {
    pullRequests: value.filter(isRecord).map((p) => ({
      id: requireNumber(p.id, "id"),
      number: requireNumber(p.number, "number"),
      title: requireString(p.title, "title"),
      body: typeof p.body === "string" ? p.body : undefined,
      state: typeof p.state === "string" ? p.state : undefined,
      user: isRecord(p.user) ? { login: typeof p.user.login === "string" ? p.user.login : undefined } : undefined,
      html_url: typeof p.html_url === "string" ? p.html_url : undefined,
      draft: typeof p.draft === "boolean" ? p.draft : undefined,
      merged: typeof p.merged === "boolean" ? p.merged : undefined,
      mergeable: typeof p.mergeable === "boolean" ? p.mergeable : undefined,
      head: isRecord(p.head) ? { ref: typeof p.head.ref === "string" ? p.head.ref : undefined, sha: typeof p.head.sha === "string" ? p.head.sha : undefined, repo: isRecord(p.head.repo) ? { full_name: typeof p.head.repo.full_name === "string" ? p.head.repo.full_name : undefined } : undefined } : undefined,
      base: isRecord(p.base) ? { ref: typeof p.base.ref === "string" ? p.base.ref : undefined, sha: typeof p.base.sha === "string" ? p.base.sha : undefined, repo: isRecord(p.base.repo) ? { full_name: typeof p.base.repo.full_name === "string" ? p.base.repo.full_name : undefined } : undefined } : undefined,
      created_at: typeof p.created_at === "string" ? p.created_at : undefined,
      updated_at: typeof p.updated_at === "string" ? p.updated_at : undefined,
      merged_at: typeof p.merged_at === "string" ? p.merged_at : undefined,
      closed_at: typeof p.closed_at === "string" ? p.closed_at : undefined,
      labels: Array.isArray(p.labels) ? p.labels.filter(isRecord).map((l) => ({ name: typeof l.name === "string" ? l.name : undefined })) : undefined,
      repository_url: typeof p.repository_url === "string" ? p.repository_url : undefined,
    })),
    nextLink,
  };
}

// ─── Get PR ───────────────────────────────────────────────────────────────────

export type GetPullRequestInput = { owner: string; repo: string; pullNumber: number };

export function validateGetPullRequestInput(input: unknown): GetPullRequestInput {
  if (!isRecord(input)) throw new Error("get pull request input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    pullNumber: requireNumber(input.pullNumber, "pullNumber"),
  };
}

// ─── Update PR ────────────────────────────────────────────────────────────────

export type UpdatePullRequestInput = { owner: string; repo: string; pullNumber: number; title?: string; body?: string; state?: string; base?: string };

export function validateUpdatePullRequestInput(input: unknown): UpdatePullRequestInput {
  if (!isRecord(input)) throw new Error("update pull request input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    pullNumber: requireNumber(input.pullNumber, "pullNumber"),
    title: typeof input.title === "string" ? input.title : undefined,
    body: typeof input.body === "string" ? input.body : undefined,
    state: typeof input.state === "string" ? input.state : undefined,
    base: typeof input.base === "string" ? input.base : undefined,
  };
}

// ─── List PR Files ────────────────────────────────────────────────────────────

export type ListPullRequestFilesInput = { owner: string; repo: string; pullNumber: number; perPage?: number; page?: number };

export function validateListPullRequestFilesInput(input: unknown): ListPullRequestFilesInput {
  if (!isRecord(input)) throw new Error("list pull request files input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    pullNumber: requireNumber(input.pullNumber, "pullNumber"),
    perPage: typeof input.perPage === "number" ? input.perPage : undefined,
    page: typeof input.page === "number" ? input.page : undefined,
  };
}

export type CreatePullRequestInput = { owner: string; repo: string; title: string; head: string; base: string; body?: string; draft?: boolean };

export function validateCreatePullRequestInput(input: unknown): CreatePullRequestInput {
  if (!isRecord(input)) throw new Error("create pull request input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    title: requireString(input.title, "title"),
    head: requireString(input.head, "head"),
    base: requireString(input.base, "base"),
    body: typeof input.body === "string" ? input.body : undefined,
    draft: typeof input.draft === "boolean" ? input.draft : undefined,
  };
}

export type MergePullRequestInput = { owner: string; repo: string; pullNumber: number; commitTitle?: string; commitMessage?: string; mergeMethod?: string };

export function validateMergePullRequestInput(input: unknown): MergePullRequestInput {
  if (!isRecord(input)) throw new Error("merge pull request input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    pullNumber: requireNumber(input.pullNumber, "pullNumber"),
    commitTitle: typeof input.commitTitle === "string" ? input.commitTitle : undefined,
    commitMessage: typeof input.commitMessage === "string" ? input.commitMessage : undefined,
    mergeMethod: typeof input.mergeMethod === "string" ? input.mergeMethod : "merge",
  };
}

export function createPullRequestsClient(options: { accessToken: string; fetch?: typeof fetch; githubClient?: GitHubClient }) {
  const client = options.githubClient ?? createGitHubClient({ accessToken: options.accessToken, fetch: options.fetch, operation: "pull_requests.create" });

  return {
    async get(input: unknown) {
      const payload = validateGetPullRequestInput(input);
      const response = await client.fetchJSON(`/repos/${payload.owner}/${payload.repo}/pulls/${payload.pullNumber}`);
      if (response.status === 200) {
        return { ok: true as const, pullRequest: normalizeGitHubPullRequest(response.body as GitHubPullRequest) };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Pull request not found." } };
      }
      if (response.status === 429 || (response.status === 403 && parseGitHubRateLimit(response.status, response.headers).limited)) {
        const rateLimit = parseGitHubRateLimit(response.status, response.headers);
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "GitHub rate limit exceeded.", retryAfterSeconds: rateLimit.limited ? rateLimit.retryAfterSeconds : undefined } };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "GitHub rejected the get pull request." } };
    },

    async update(input: unknown) {
      const payload = validateUpdatePullRequestInput(input);
      const response = await client.fetchJSON(`/repos/${payload.owner}/${payload.repo}/pulls/${payload.pullNumber}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: payload.title,
          body: payload.body,
          state: payload.state,
          base: payload.base,
        }),
      });
      if (response.status === 200) {
        return { ok: true as const, pullRequest: normalizeGitHubPullRequest(response.body as GitHubPullRequest) };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Pull request not found." } };
      }
      if (response.status === 422) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Validation failed for update pull request." } };
      }
      if (response.status === 429 || (response.status === 403 && parseGitHubRateLimit(response.status, response.headers).limited)) {
        const rateLimit = parseGitHubRateLimit(response.status, response.headers);
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "GitHub rate limit exceeded.", retryAfterSeconds: rateLimit.limited ? rateLimit.retryAfterSeconds : undefined } };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "GitHub rejected the update pull request." } };
    },

    async listFiles(input: unknown) {
      const payload = validateListPullRequestFilesInput(input);
      const params = new URLSearchParams();
      if (payload.perPage) params.set("per_page", String(payload.perPage));
      if (payload.page) params.set("page", String(payload.page));
      const qs = params.toString() ? `?${params.toString()}` : "";
      const response = await client.fetchJSON(`/repos/${payload.owner}/${payload.repo}/pulls/${payload.pullNumber}/files${qs}`);
      if (response.status === 200) {
        const files = Array.isArray(response.body)
          ? (response.body as Record<string, unknown>[]).map((f) => ({
              filename: typeof f.filename === "string" ? f.filename : "",
              status: typeof f.status === "string" ? f.status : "",
              additions: typeof f.additions === "number" ? f.additions : 0,
              deletions: typeof f.deletions === "number" ? f.deletions : 0,
              changes: typeof f.changes === "number" ? f.changes : 0,
              blobUrl: typeof f.blob_url === "string" ? f.blob_url : "",
              rawUrl: typeof f.raw_url === "string" ? f.raw_url : "",
              patch: typeof f.patch === "string" ? f.patch : undefined,
            }))
          : [];
        return { ok: true as const, files };
      }
      if (response.status === 422) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Pull request is too large to list files." } };
      }
      if (response.status === 429 || (response.status === 403 && parseGitHubRateLimit(response.status, response.headers).limited)) {
        const rateLimit = parseGitHubRateLimit(response.status, response.headers);
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "GitHub rate limit exceeded.", retryAfterSeconds: rateLimit.limited ? rateLimit.retryAfterSeconds : undefined } };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "GitHub rejected the list PR files request." } };
    },

    async create(input: unknown) {
      const payload = validateCreatePullRequestInput(input);
      const response = await client.fetchJSON(`/repos/${payload.owner}/${payload.repo}/pulls`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: payload.title,
          head: payload.head,
          base: payload.base,
          body: payload.body,
          draft: payload.draft,
        }),
      });
      if (response.status === 201) {
        return { ok: true as const, pullRequest: normalizeGitHubPullRequest(response.body as GitHubPullRequest) };
      }
      if (response.status === 429 || (response.status === 403 && parseGitHubRateLimit(response.status, response.headers).limited)) {
        const rateLimit = parseGitHubRateLimit(response.status, response.headers);
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "GitHub rate limit exceeded.", retryAfterSeconds: rateLimit.limited ? rateLimit.retryAfterSeconds : undefined } };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "GitHub rejected the create pull request." } };
    },

    async merge(input: unknown) {
      const payload = validateMergePullRequestInput(input);
      const response = await client.fetchJSON(`/repos/${payload.owner}/${payload.repo}/pulls/${payload.pullNumber}/merge`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commit_title: payload.commitTitle,
          commit_message: payload.commitMessage,
          merge_method: payload.mergeMethod,
        }),
      });
      if (response.status === 200) {
        return { ok: true as const, merged: true };
      }
      if (response.status === 405) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Pull request is not mergeable." } };
      }
      if (response.status === 409) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Pull request merge conflict." } };
      }
      if (response.status === 429 || (response.status === 403 && parseGitHubRateLimit(response.status, response.headers).limited)) {
        const rateLimit = parseGitHubRateLimit(response.status, response.headers);
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "GitHub rate limit exceeded.", retryAfterSeconds: rateLimit.limited ? rateLimit.retryAfterSeconds : undefined } };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "GitHub rejected the merge request." } };
    },
  };
}

function parseNextLink(response: Record<string, unknown>): string | null {
  const link = response.nextLink;
  return typeof link === "string" && link.length > 0 ? link : null;
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
