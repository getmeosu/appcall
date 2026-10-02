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


export type UpdatePullRequestBranchInput = { owner: string; repo: string; pullNumber: number; expectedHeadSha?: string };

export function validateUpdatePullRequestBranchInput(input: unknown): UpdatePullRequestBranchInput {
  if (!isRecord(input)) throw new Error("update pull request branch input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    pullNumber: requireNumber(input.pullNumber, "pullNumber"),
    expectedHeadSha: typeof input.expectedHeadSha === "string" ? input.expectedHeadSha : undefined,
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


// ─── S1: Reviews ──────────────────────────────────────────────────────────────

export type ListReviewsInput = { owner: string; repo: string; pullNumber: number; perPage?: number; page?: number };

export function validateListReviewsInput(input: unknown): ListReviewsInput {
  if (!isRecord(input)) throw new Error("list reviews input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    pullNumber: requireNumber(input.pullNumber, "pullNumber"),
    perPage: typeof input.perPage === "number" ? input.perPage : undefined,
    page: typeof input.page === "number" ? input.page : undefined,
  };
}

export type CreateReviewInput = {
  owner: string; repo: string; pullNumber: number;
  body?: string; event?: string; commitId?: string;
};

export function validateCreateReviewInput(input: unknown): CreateReviewInput {
  if (!isRecord(input)) throw new Error("create review input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    pullNumber: requireNumber(input.pullNumber, "pullNumber"),
    body: typeof input.body === "string" ? input.body : undefined,
    event: typeof input.event === "string" ? input.event : undefined,
    commitId: typeof input.commitId === "string" ? input.commitId : undefined,
  };
}

export type DismissReviewInput = {
  owner: string; repo: string; pullNumber: number; reviewId: number; message: string;
};

export function validateDismissReviewInput(input: unknown): DismissReviewInput {
  if (!isRecord(input)) throw new Error("dismiss review input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    pullNumber: requireNumber(input.pullNumber, "pullNumber"),
    reviewId: requireNumber(input.reviewId, "reviewId"),
    message: requireString(input.message, "message"),
  };
}

// ─── S1: Review comments ──────────────────────────────────────────────────────

export type ListReviewCommentsInput = { owner: string; repo: string; pullNumber: number; perPage?: number; page?: number };

export function validateListReviewCommentsInput(input: unknown): ListReviewCommentsInput {
  if (!isRecord(input)) throw new Error("list review comments input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    pullNumber: requireNumber(input.pullNumber, "pullNumber"),
    perPage: typeof input.perPage === "number" ? input.perPage : undefined,
    page: typeof input.page === "number" ? input.page : undefined,
  };
}

export type CreateReviewCommentInput = {
  owner: string; repo: string; pullNumber: number;
  body: string; commitId: string; path: string;
  line?: number; side?: string; startLine?: number; startSide?: string; inReplyTo?: number;
};

export function validateCreateReviewCommentInput(input: unknown): CreateReviewCommentInput {
  if (!isRecord(input)) throw new Error("create review comment input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    pullNumber: requireNumber(input.pullNumber, "pullNumber"),
    body: requireString(input.body, "body"),
    commitId: requireString(input.commitId, "commitId"),
    path: requireString(input.path, "path"),
    line: typeof input.line === "number" ? input.line : undefined,
    side: typeof input.side === "string" ? input.side : undefined,
    startLine: typeof input.startLine === "number" ? input.startLine : undefined,
    startSide: typeof input.startSide === "string" ? input.startSide : undefined,
    inReplyTo: typeof input.inReplyTo === "number" ? input.inReplyTo : undefined,
  };
}

export type ReplyReviewCommentInput = {
  owner: string; repo: string; pullNumber: number; commentId: number; body: string;
};

export function validateReplyReviewCommentInput(input: unknown): ReplyReviewCommentInput {
  if (!isRecord(input)) throw new Error("reply review comment input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    pullNumber: requireNumber(input.pullNumber, "pullNumber"),
    commentId: requireNumber(input.commentId, "commentId"),
    body: requireString(input.body, "body"),
  };
}

// ─── S1: Requested reviewers ──────────────────────────────────────────────────

export type RequestedReviewersInput = {
  owner: string; repo: string; pullNumber: number;
  reviewers?: string[]; teamReviewers?: string[];
};

export function validateRequestedReviewersInput(input: unknown): RequestedReviewersInput {
  if (!isRecord(input)) throw new Error("requested reviewers input must be an object");
  const reviewers = Array.isArray(input.reviewers)
    ? input.reviewers.filter((r): r is string => typeof r === "string" && r.length > 0)
    : undefined;
  const teamReviewers = Array.isArray(input.teamReviewers)
    ? input.teamReviewers.filter((r): r is string => typeof r === "string" && r.length > 0)
    : undefined;
  if ((!reviewers || reviewers.length === 0) && (!teamReviewers || teamReviewers.length === 0)) {
    throw new Error("at least one of reviewers or teamReviewers is required");
  }
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    pullNumber: requireNumber(input.pullNumber, "pullNumber"),
    reviewers,
    teamReviewers,
  };
}

// ─── S1: PR commits / merge check / draft ─────────────────────────────────────

export type ListPullRequestCommitsInput = { owner: string; repo: string; pullNumber: number; perPage?: number; page?: number };

export function validateListPullRequestCommitsInput(input: unknown): ListPullRequestCommitsInput {
  if (!isRecord(input)) throw new Error("list pull request commits input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    pullNumber: requireNumber(input.pullNumber, "pullNumber"),
    perPage: typeof input.perPage === "number" ? input.perPage : undefined,
    page: typeof input.page === "number" ? input.page : undefined,
  };
}

export type CheckMergedInput = { owner: string; repo: string; pullNumber: number };

export function validateCheckMergedInput(input: unknown): CheckMergedInput {
  if (!isRecord(input)) throw new Error("check merged input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    pullNumber: requireNumber(input.pullNumber, "pullNumber"),
  };
}

export type DraftStateInput = { owner: string; repo: string; pullNumber: number };

export function validateDraftStateInput(input: unknown): DraftStateInput {
  if (!isRecord(input)) throw new Error("draft state input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    pullNumber: requireNumber(input.pullNumber, "pullNumber"),
  };
}

export type NormalizedReview = {
  id: string;
  provider: "github";
  providerReviewId: number;
  pullRequestUrl: string;
  state: string;
  body: string;
  author: string;
  commitId: string;
  submittedAt: string;
  htmlUrl: string;
  modelVersion: "2026-05-16";
  raw: Record<string, unknown>;
};

export function normalizeGitHubReview(review: Record<string, unknown>): NormalizedReview {
  const user = isRecord(review.user) ? review.user : {};
  return {
    id: `gh-review:${review.id}`,
    provider: "github",
    providerReviewId: typeof review.id === "number" ? review.id : 0,
    pullRequestUrl: typeof review.pull_request_url === "string" ? review.pull_request_url : "",
    state: typeof review.state === "string" ? review.state : "",
    body: typeof review.body === "string" ? review.body : "",
    author: typeof user.login === "string" ? user.login : "",
    commitId: typeof review.commit_id === "string" ? review.commit_id : "",
    submittedAt: typeof review.submitted_at === "string" ? review.submitted_at : "",
    htmlUrl: typeof review.html_url === "string" ? review.html_url : "",
    modelVersion: "2026-05-16",
    raw: review,
  };
}

export type NormalizedReviewComment = {
  id: string;
  provider: "github";
  providerCommentId: number;
  pullRequestReviewId: number | null;
  body: string;
  path: string;
  commitId: string;
  author: string;
  htmlUrl: string;
  createdAt: string;
  updatedAt: string;
  inReplyToId: number | null;
  modelVersion: "2026-05-16";
  raw: Record<string, unknown>;
};

export function normalizeGitHubReviewComment(comment: Record<string, unknown>): NormalizedReviewComment {
  const user = isRecord(comment.user) ? comment.user : {};
  return {
    id: `gh-review-comment:${comment.id}`,
    provider: "github",
    providerCommentId: typeof comment.id === "number" ? comment.id : 0,
    pullRequestReviewId: typeof comment.pull_request_review_id === "number" ? comment.pull_request_review_id : null,
    body: typeof comment.body === "string" ? comment.body : "",
    path: typeof comment.path === "string" ? comment.path : "",
    commitId: typeof comment.commit_id === "string" ? comment.commit_id : "",
    author: typeof user.login === "string" ? user.login : "",
    htmlUrl: typeof comment.html_url === "string" ? comment.html_url : "",
    createdAt: typeof comment.created_at === "string" ? comment.created_at : "",
    updatedAt: typeof comment.updated_at === "string" ? comment.updated_at : "",
    inReplyToId: typeof comment.in_reply_to_id === "number" ? comment.in_reply_to_id : null,
    modelVersion: "2026-05-16",
    raw: comment,
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


    async updateBranch(input: unknown) {
      const payload = validateUpdatePullRequestBranchInput(input);
      const body: Record<string, string> = {};
      if (payload.expectedHeadSha) body.expected_head_sha = payload.expectedHeadSha;
      const response = await client.fetchJSON(`/repos/${payload.owner}/${payload.repo}/pulls/${payload.pullNumber}/update-branch`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      // GitHub returns 202 Accepted on success
      if (response.status === 202 || response.status === 200) {
        const respBody = (response.body && typeof response.body === "object") ? response.body as Record<string, unknown> : {};
        return {
          ok: true as const,
          update: {
            message: typeof respBody.message === "string" ? respBody.message : "Updating pull request branch.",
            url: typeof respBody.url === "string" ? respBody.url : "",
            accepted: true,
          },
        };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Pull request not found." } };
      }
      if (response.status === 422) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Pull request branch cannot be updated (conflict or validation)." } };
      }
      if (response.status === 429 || (response.status === 403 && parseGitHubRateLimit(response.status, response.headers).limited)) {
        const rateLimit = parseGitHubRateLimit(response.status, response.headers);
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "GitHub rate limit exceeded.", retryAfterSeconds: rateLimit.limited ? rateLimit.retryAfterSeconds : undefined } };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "GitHub rejected the update branch request." } };
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

    async listReviews(input: unknown) {
      const payload = validateListReviewsInput(input);
      const params = new URLSearchParams();
      if (payload.perPage) params.set("per_page", String(payload.perPage));
      if (payload.page) params.set("page", String(payload.page));
      const qs = params.toString() ? `?${params.toString()}` : "";
      const response = await client.fetchJSON(`/repos/${payload.owner}/${payload.repo}/pulls/${payload.pullNumber}/reviews${qs}`);
      if (response.status === 200) {
        const reviews = Array.isArray(response.body)
          ? (response.body as Record<string, unknown>[]).filter(isRecord).map((r) => normalizeGitHubReview(r))
          : [];
        return { ok: true as const, reviews };
      }
      return mapGithubError(response, "list reviews");
    },

    async createReview(input: unknown) {
      const payload = validateCreateReviewInput(input);
      const response = await client.fetchJSON(`/repos/${payload.owner}/${payload.repo}/pulls/${payload.pullNumber}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: payload.body,
          event: payload.event,
          commit_id: payload.commitId,
        }),
      });
      if (response.status === 200) {
        return { ok: true as const, review: normalizeGitHubReview(response.body as Record<string, unknown>) };
      }
      if (response.status === 422) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Validation failed for create review." } };
      }
      return mapGithubError(response, "create review");
    },

    async dismissReview(input: unknown) {
      const payload = validateDismissReviewInput(input);
      const response = await client.fetchJSON(
        `/repos/${payload.owner}/${payload.repo}/pulls/${payload.pullNumber}/reviews/${payload.reviewId}/dismissals`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: payload.message, event: "DISMISS" }),
        },
      );
      if (response.status === 200) {
        return { ok: true as const, review: normalizeGitHubReview(response.body as Record<string, unknown>) };
      }
      return mapGithubError(response, "dismiss review");
    },

    async listReviewComments(input: unknown) {
      const payload = validateListReviewCommentsInput(input);
      const params = new URLSearchParams();
      if (payload.perPage) params.set("per_page", String(payload.perPage));
      if (payload.page) params.set("page", String(payload.page));
      const qs = params.toString() ? `?${params.toString()}` : "";
      const response = await client.fetchJSON(`/repos/${payload.owner}/${payload.repo}/pulls/${payload.pullNumber}/comments${qs}`);
      if (response.status === 200) {
        const comments = Array.isArray(response.body)
          ? (response.body as Record<string, unknown>[]).filter(isRecord).map((c) => normalizeGitHubReviewComment(c))
          : [];
        return { ok: true as const, comments };
      }
      return mapGithubError(response, "list review comments");
    },

    async createReviewComment(input: unknown) {
      const payload = validateCreateReviewCommentInput(input);
      const response = await client.fetchJSON(`/repos/${payload.owner}/${payload.repo}/pulls/${payload.pullNumber}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: payload.body,
          commit_id: payload.commitId,
          path: payload.path,
          line: payload.line,
          side: payload.side,
          start_line: payload.startLine,
          start_side: payload.startSide,
          in_reply_to: payload.inReplyTo,
        }),
      });
      if (response.status === 201) {
        return { ok: true as const, comment: normalizeGitHubReviewComment(response.body as Record<string, unknown>) };
      }
      if (response.status === 422) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Validation failed for create review comment." } };
      }
      return mapGithubError(response, "create review comment");
    },

    async replyReviewComment(input: unknown) {
      const payload = validateReplyReviewCommentInput(input);
      const response = await client.fetchJSON(
        `/repos/${payload.owner}/${payload.repo}/pulls/${payload.pullNumber}/comments/${payload.commentId}/replies`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: payload.body }),
        },
      );
      if (response.status === 201) {
        return { ok: true as const, comment: normalizeGitHubReviewComment(response.body as Record<string, unknown>) };
      }
      return mapGithubError(response, "reply to review comment");
    },

    async addRequestedReviewers(input: unknown) {
      const payload = validateRequestedReviewersInput(input);
      const response = await client.fetchJSON(
        `/repos/${payload.owner}/${payload.repo}/pulls/${payload.pullNumber}/requested_reviewers`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reviewers: payload.reviewers,
            team_reviewers: payload.teamReviewers,
          }),
        },
      );
      if (response.status === 201 || response.status === 200) {
        return { ok: true as const, pullRequest: normalizeGitHubPullRequest(response.body as GitHubPullRequest) };
      }
      return mapGithubError(response, "add requested reviewers");
    },

    async removeRequestedReviewers(input: unknown) {
      const payload = validateRequestedReviewersInput(input);
      const response = await client.fetchJSON(
        `/repos/${payload.owner}/${payload.repo}/pulls/${payload.pullNumber}/requested_reviewers`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reviewers: payload.reviewers,
            team_reviewers: payload.teamReviewers,
          }),
        },
      );
      if (response.status === 200) {
        return { ok: true as const, pullRequest: normalizeGitHubPullRequest(response.body as GitHubPullRequest) };
      }
      return mapGithubError(response, "remove requested reviewers");
    },

    async listCommits(input: unknown) {
      const payload = validateListPullRequestCommitsInput(input);
      const params = new URLSearchParams();
      if (payload.perPage) params.set("per_page", String(payload.perPage));
      if (payload.page) params.set("page", String(payload.page));
      const qs = params.toString() ? `?${params.toString()}` : "";
      const response = await client.fetchJSON(`/repos/${payload.owner}/${payload.repo}/pulls/${payload.pullNumber}/commits${qs}`);
      if (response.status === 200) {
        const commits = Array.isArray(response.body)
          ? (response.body as Record<string, unknown>[]).filter(isRecord).map((c) => ({
              sha: typeof c.sha === "string" ? c.sha : "",
              message: isRecord(c.commit) && typeof c.commit.message === "string" ? c.commit.message : "",
              author: isRecord(c.author) && typeof c.author.login === "string"
                ? c.author.login
                : (isRecord(c.commit) && isRecord(c.commit.author) && typeof c.commit.author.name === "string"
                  ? c.commit.author.name
                  : ""),
              url: typeof c.html_url === "string" ? c.html_url : "",
              raw: c,
            }))
          : [];
        return { ok: true as const, commits };
      }
      return mapGithubError(response, "list pull request commits");
    },

    async checkMerged(input: unknown) {
      const payload = validateCheckMergedInput(input);
      const response = await client.fetchJSON(`/repos/${payload.owner}/${payload.repo}/pulls/${payload.pullNumber}/merge`);
      if (response.status === 204) {
        return { ok: true as const, merged: true };
      }
      if (response.status === 404) {
        return { ok: true as const, merged: false };
      }
      return mapGithubError(response, "check merged");
    },

    async convertToDraft(input: unknown) {
      const payload = validateDraftStateInput(input);
      const response = await client.fetchJSON(`/repos/${payload.owner}/${payload.repo}/pulls/${payload.pullNumber}/convert_to_draft`, {
        method: "POST",
      });
      if (response.status === 200) {
        return { ok: true as const, pullRequest: normalizeGitHubPullRequest(response.body as GitHubPullRequest) };
      }
      return mapGithubError(response, "convert to draft");
    },

    async markReady(input: unknown) {
      const payload = validateDraftStateInput(input);
      const response = await client.fetchJSON(`/repos/${payload.owner}/${payload.repo}/pulls/${payload.pullNumber}/ready_for_review`, {
        method: "POST",
      });
      if (response.status === 200) {
        return { ok: true as const, pullRequest: normalizeGitHubPullRequest(response.body as GitHubPullRequest) };
      }
      return mapGithubError(response, "mark ready for review");
    },
  };
}

function mapGithubError(
  response: { status: number; headers: Record<string, string> },
  action: string,
): { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } } {
  if (response.status === 404) {
    return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: `Not found for ${action}.` } };
  }
  if (response.status === 429 || (response.status === 403 && parseGitHubRateLimit(response.status, response.headers).limited)) {
    const rateLimit = parseGitHubRateLimit(response.status, response.headers);
    return { ok: false, error: { code: "CONNECTOR_RATE_LIMITED", message: "GitHub rate limit exceeded.", retryAfterSeconds: rateLimit.limited ? rateLimit.retryAfterSeconds : undefined } };
  }
  return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: `GitHub rejected the ${action} request.` } };
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
