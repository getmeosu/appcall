import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";
import { gqlRequest } from "./graphql";

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
  body: string | null;
  state: string | null;
  isOpen: boolean;
  isDraft: boolean | null;
  isMerged: boolean;
  url: string;
  headBranch: string;
  baseBranch: string;
  headSha: string;
  headRepo: string | null;
  baseRepo: string;
  repositoryUrl: string | null;
  author: string;
  createdAt: string;
  updatedAt: string;
  mergedAt: string | null;
  closedAt: string | null;
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
    // GH-TYPED-READS (0.86.6): body, merged_at and closed_at are nullable and draft optional
    // upstream; state is never invented as "open". Missing values are null.
    body: typeof pr.body === "string" ? pr.body : null,
    state: typeof pr.state === "string" ? pr.state : null,
    isOpen: pr.state === "open",
    isDraft: typeof pr.draft === "boolean" ? pr.draft : null,
    // GH-TYPED-READS TR-3: list endpoints return pull-request-simple, which has no `merged`; there a
    // merged PR was reported isMerged:false. merged_at (required, nullable) decides instead.
    isMerged: typeof pr.merged === "boolean" ? pr.merged : typeof pr.merged_at === "string",
    url: pr.html_url ?? "",
    headBranch: pr.head?.ref ?? "",
    baseBranch: pr.base?.ref ?? "",
    headSha: pr.head?.sha ?? "",
    // GH-TYPED-READS TR-4: head.repo is null when the head fork was deleted (the pinned spec's
    // webhook pull_request schemas mark head.repo nullable), so headRepo is null, not "".
    // base.repo is required and non-null in every pinned PR schema, so baseRepo keeps its fallback.
    headRepo: typeof pr.head?.repo?.full_name === "string" ? pr.head.repo.full_name : null,
    baseRepo: pr.base?.repo?.full_name ?? "",
    // repository_url is not a property of pull-request or pull-request-simple; null when absent.
    repositoryUrl: typeof pr.repository_url === "string" ? pr.repository_url : null,
    author: pr.user?.login ?? "",
    createdAt: pr.created_at ?? "",
    updatedAt: pr.updated_at ?? "",
    mergedAt: typeof pr.merged_at === "string" ? pr.merged_at : null,
    closedAt: typeof pr.closed_at === "string" ? pr.closed_at : null,
    modelVersion: "2026-05-16",
    raw: pr,
  };
}

// GH-TYPED-READS TR-4: list reads and the requested_reviewers writes return pull-request-simple,
// whose user is nullable-simple-user, so author is null when user is null (pull-request's user is
// required and non-null, so the full normalizer keeps its fallback).
export type NormalizedPullRequestSimple = Omit<NormalizedPullRequest, "author"> & { author: string | null };

export function normalizeGitHubPullRequestSimple(pr: GitHubPullRequest): NormalizedPullRequestSimple {
  const user = pr.user as { login?: unknown } | null | undefined;
  return { ...normalizeGitHubPullRequest(pr), author: user && typeof user.login === "string" ? user.login : null };
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

export type GetReviewInput = { owner: string; repo: string; pullNumber: number; reviewId: number };

export function validateGetReviewInput(input: unknown): GetReviewInput {
  if (!isRecord(input)) throw new Error("get review input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    pullNumber: requireNumber(input.pullNumber, "pullNumber"),
    reviewId: requireNumber(input.reviewId, "reviewId"),
  };
}

export type UpdateReviewInput = GetReviewInput & { body: string };

export function validateUpdateReviewInput(input: unknown): UpdateReviewInput {
  if (!isRecord(input)) throw new Error("update review input must be an object");
  return {
    ...validateGetReviewInput(input),
    body: requireString(input.body, "body"),
  };
}

const SUBMIT_REVIEW_EVENTS = ["APPROVE", "REQUEST_CHANGES", "COMMENT"] as const;

export type SubmitReviewInput = {
  owner: string; repo: string; pullNumber: number; reviewId: number;
  event: string; body?: string;
};

export function validateSubmitReviewInput(input: unknown): SubmitReviewInput {
  if (!isRecord(input)) throw new Error("submit review input must be an object");
  const event = requireString(input.event, "event");
  if (!SUBMIT_REVIEW_EVENTS.includes(event as (typeof SUBMIT_REVIEW_EVENTS)[number])) {
    throw new Error("event must be APPROVE, REQUEST_CHANGES, or COMMENT");
  }
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    pullNumber: requireNumber(input.pullNumber, "pullNumber"),
    reviewId: requireNumber(input.reviewId, "reviewId"),
    event,
    body: typeof input.body === "string" ? input.body : undefined,
  };
}

export type UpdateReviewCommentInput = {
  owner: string; repo: string; pullNumber: number; commentId: number; body: string;
};

export function validateUpdateReviewCommentInput(input: unknown): UpdateReviewCommentInput {
  if (!isRecord(input)) throw new Error("update review comment input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    pullNumber: requireNumber(input.pullNumber, "pullNumber"),
    commentId: requireNumber(input.commentId, "commentId"),
    body: requireString(input.body, "body"),
  };
}

export type DeleteReviewCommentInput = {
  owner: string; repo: string; pullNumber: number; commentId: number;
};

export function validateDeleteReviewCommentInput(input: unknown): DeleteReviewCommentInput {
  if (!isRecord(input)) throw new Error("delete review comment input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    pullNumber: requireNumber(input.pullNumber, "pullNumber"),
    commentId: requireNumber(input.commentId, "commentId"),
  };
}

export type DeletePendingReviewInput = GetReviewInput;

export function validateDeletePendingReviewInput(input: unknown): DeletePendingReviewInput {
  if (!isRecord(input)) throw new Error("delete pending review input must be an object");
  return validateGetReviewInput(input);
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

export type ListConversationCommentsInput = {
  owner: string;
  repo: string;
  pullNumber: number;
  perPage?: number;
  page?: number;
  since?: string;
};

export function validateListConversationCommentsInput(input: unknown): ListConversationCommentsInput {
  if (!isRecord(input)) throw new Error("list pull request comments input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    pullNumber: requireNumber(input.pullNumber, "pullNumber"),
    perPage: typeof input.perPage === "number" ? input.perPage : undefined,
    page: typeof input.page === "number" ? input.page : undefined,
    since: typeof input.since === "string" && input.since.length > 0 ? input.since : undefined,
  };
}

export type NormalizedConversationComment = {
  id: string;
  provider: "github";
  providerCommentId: number;
  body: string;
  author: string | null;
  htmlUrl: string;
  createdAt: string;
  updatedAt: string;
  modelVersion: "2026-05-16";
  raw: Record<string, unknown>;
};

export function normalizeConversationComment(comment: Record<string, unknown>): NormalizedConversationComment {
  const user = isRecord(comment.user) ? comment.user : {};
  return {
    id: `gh-pr-comment:${comment.id}`,
    provider: "github",
    providerCommentId: typeof comment.id === "number" ? comment.id : 0,
    body: typeof comment.body === "string" ? comment.body : "",
    author: typeof user.login === "string" ? user.login : null,
    htmlUrl: typeof comment.html_url === "string" ? comment.html_url : "",
    createdAt: typeof comment.created_at === "string" ? comment.created_at : "",
    updatedAt: typeof comment.updated_at === "string" ? comment.updated_at : "",
    modelVersion: "2026-05-16",
    raw: comment,
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

export type ListRequestedReviewersInput = { owner: string; repo: string; pullNumber: number; perPage?: number; page?: number };

export function validateListRequestedReviewersInput(input: unknown): ListRequestedReviewersInput {
  if (!isRecord(input)) throw new Error("list requested reviewers input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    pullNumber: requireNumber(input.pullNumber, "pullNumber"),
    perPage: optionalPage(input.perPage, "perPage"),
    page: optionalPage(input.page, "page", 1_000_000),
  };
}

export type GetReviewCommentInput = { owner: string; repo: string; commentId: number };

export function validateGetReviewCommentInput(input: unknown): GetReviewCommentInput {
  if (!isRecord(input)) throw new Error("get review comment input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    commentId: requireNumber(input.commentId, "commentId"),
  };
}

export type ListReviewCommentsForReviewInput = {
  owner: string;
  repo: string;
  pullNumber: number;
  reviewId: number;
  perPage?: number;
  page?: number;
};

export function validateListReviewCommentsForReviewInput(input: unknown): ListReviewCommentsForReviewInput {
  if (!isRecord(input)) throw new Error("list review comments for review input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    pullNumber: requireNumber(input.pullNumber, "pullNumber"),
    reviewId: requireNumber(input.reviewId, "reviewId"),
    perPage: optionalPage(input.perPage, "perPage"),
    page: optionalPage(input.page, "page", 1_000_000),
  };
}

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
  author: string | null;
  commitId: string | null;
  submittedAt: string | null;
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
    // GH-TYPED-READS (0.86.6): user and commit_id are nullable, submitted_at optional upstream.
    author: typeof user.login === "string" ? user.login : null,
    commitId: typeof review.commit_id === "string" ? review.commit_id : null,
    submittedAt: typeof review.submitted_at === "string" ? review.submitted_at : null,
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
  author: string | null;
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
    author: typeof user.login === "string" ? user.login : null,
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

  async function setDraftState(payload: DraftStateInput, draft: boolean) {
    const action = draft ? "convert to draft" : "mark ready for review";
    const current = await client.fetchJSON(
      `/repos/${encodeURIComponent(payload.owner)}/${encodeURIComponent(payload.repo)}/pulls/${payload.pullNumber}`,
    );
    if (current.status !== 200 || !isRecord(current.body)) {
      if (current.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Pull request not found." } };
      }
      return mapGithubError(current, action);
    }
    const pr = current.body as GitHubPullRequest;
    const nodeId = typeof pr.node_id === "string" && pr.node_id.length > 0 ? pr.node_id : null;
    if (!nodeId) {
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "GitHub returned no pull request node id." } };
    }
    const root = draft ? "convertPullRequestToDraft" : "markPullRequestReadyForReview";
    const result = await gqlRequest(
      client,
      `mutation ${draft ? "ConvertPullRequestToDraft" : "MarkPullRequestReadyForReview"}($id: ID!) { ${root}(input: { pullRequestId: $id }) { pullRequest { id isDraft state updatedAt } } }`,
      { id: nodeId },
      { operation: draft ? "pull_requests.convert_to_draft" : "pull_requests.mark_ready" },
    );
    if (!result.ok) return { ok: false as const, error: result.error };
    const payloadRoot = isRecord(result.data[root]) ? (result.data[root] as Record<string, unknown>) : null;
    const updated = payloadRoot && isRecord(payloadRoot.pullRequest) ? payloadRoot.pullRequest : null;
    if (!updated || typeof updated.isDraft !== "boolean") {
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: `GitHub returned no ${root} pull request.` } };
    }
    return {
      ok: true as const,
      pullRequest: normalizeGitHubPullRequest({
        ...pr,
        draft: updated.isDraft,
        ...(typeof updated.updatedAt === "string" ? { updated_at: updated.updatedAt } : {}),
      }),
    };
  }

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

    async getReview(input: unknown) {
      const payload = validateGetReviewInput(input);
      const response = await client.fetchJSON(
        `${repoPath(payload.owner, payload.repo)}/pulls/${payload.pullNumber}/reviews/${payload.reviewId}`,
      );
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, review: normalizeGitHubReview(response.body) };
      }
      return mapGithubError(response, "get review");
    },

    async submitReview(input: unknown) {
      const payload = validateSubmitReviewInput(input);
      const body: Record<string, unknown> = { event: payload.event };
      if (payload.body !== undefined) body.body = payload.body;
      const response = await client.fetchJSON(
        `${repoPath(payload.owner, payload.repo)}/pulls/${payload.pullNumber}/reviews/${payload.reviewId}/events`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, review: normalizeGitHubReview(response.body) };
      }
      if (response.status === 422) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Validation failed for submit review." } };
      }
      return mapGithubError(response, "submit review");
    },

    async deletePendingReview(input: unknown) {
      const payload = validateDeletePendingReviewInput(input);
      const response = await client.fetchJSON(
        `${repoPath(payload.owner, payload.repo)}/pulls/${payload.pullNumber}/reviews/${payload.reviewId}`,
        { method: "DELETE" },
      );
      if (response.status === 204) {
        return { ok: true as const, deleted: true as const, reviewId: payload.reviewId };
      }
      // Same as contents.delete: 404 is an upstream error, not a second success.
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Review not found." } };
      }
      return mapGithubError(response, "delete pending review");
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

    async updateReviewComment(input: unknown) {
      const payload = validateUpdateReviewCommentInput(input);
      const response = await client.fetchJSON(
        `${repoPath(payload.owner, payload.repo)}/pulls/comments/${payload.commentId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: payload.body }),
        },
      );
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, comment: normalizeGitHubReviewComment(response.body) };
      }
      if (response.status === 422) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Validation failed for update review comment." } };
      }
      return mapGithubError(response, "update review comment");
    },

    async deleteReviewComment(input: unknown) {
      const payload = validateDeleteReviewCommentInput(input);
      const response = await client.fetchJSON(
        `${repoPath(payload.owner, payload.repo)}/pulls/comments/${payload.commentId}`,
        { method: "DELETE" },
      );
      if (response.status === 204) {
        return { ok: true as const, deleted: true as const, commentId: payload.commentId };
      }
      return mapGithubError(response, "delete review comment");
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
        return { ok: true as const, pullRequest: normalizeGitHubPullRequestSimple(response.body as GitHubPullRequest) };
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
        return { ok: true as const, pullRequest: normalizeGitHubPullRequestSimple(response.body as GitHubPullRequest) };
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

    // FIX-G14C: GitHub has no REST convert_to_draft route and no REST draft toggle on
    // ready_for_review for PATs; both run the GraphQL mutations on the PR node id, which is
    // resolved first with GET /repos/{owner}/{repo}/pulls/{pull_number}.
    async convertToDraft(input: unknown) {
      return setDraftState(validateDraftStateInput(input), true);
    },

    async markReady(input: unknown) {
      return setDraftState(validateDraftStateInput(input), false);
    },

    async listConversationComments(input: unknown) {
      const payload = validateListConversationCommentsInput(input);
      const params = new URLSearchParams();
      if (payload.perPage) params.set("per_page", String(payload.perPage));
      if (payload.page) params.set("page", String(payload.page));
      if (payload.since) params.set("since", payload.since);
      const qs = params.toString() ? `?${params.toString()}` : "";
      // Issue-comment thread on the pull request (conversation), not diff review comments.
      const response = await client.fetchJSON(
        `/repos/${payload.owner}/${payload.repo}/issues/${payload.pullNumber}/comments${qs}`,
      );
      if (response.status === 200) {
        const comments = Array.isArray(response.body)
          ? (response.body as Record<string, unknown>[]).filter(isRecord).map((c) => normalizeConversationComment(c))
          : [];
        return { ok: true as const, comments };
      }
      return mapGithubError(response, "list pull request comments");
    },

    async listRequestedReviewers(input: unknown) {
      const payload = validateListRequestedReviewersInput(input);
      const params = new URLSearchParams();
      if (payload.perPage) params.set("per_page", String(payload.perPage));
      if (payload.page) params.set("page", String(payload.page));
      const qs = params.toString() ? `?${params.toString()}` : "";
      const response = await client.fetchJSON(
        `${repoPath(payload.owner, payload.repo)}/pulls/${payload.pullNumber}/requested_reviewers${qs}`,
      );
      if (response.status === 200 && isRecord(response.body)) {
        const users = Array.isArray(response.body.users)
          ? response.body.users.filter(isRecord).map((user) => ({
              login: typeof user.login === "string" ? user.login : "",
              id: typeof user.id === "number" ? user.id : null,
            }))
          : [];
        const teams = Array.isArray(response.body.teams)
          ? response.body.teams.filter(isRecord).map((team) => ({
              slug: typeof team.slug === "string" ? team.slug : "",
              name: typeof team.name === "string" ? team.name : "",
              id: typeof team.id === "number" ? team.id : null,
            }))
          : [];
        return { ok: true as const, users, teams };
      }
      return mapGithubError(response, "list requested reviewers");
    },

    async getReviewComment(input: unknown) {
      const payload = validateGetReviewCommentInput(input);
      const response = await client.fetchJSON(
        `${repoPath(payload.owner, payload.repo)}/pulls/comments/${payload.commentId}`,
      );
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, comment: normalizeGitHubReviewComment(response.body) };
      }
      return mapGithubError(response, "get review comment");
    },

    async listReviewCommentsForReview(input: unknown) {
      const payload = validateListReviewCommentsForReviewInput(input);
      const params = new URLSearchParams();
      if (payload.perPage) params.set("per_page", String(payload.perPage));
      if (payload.page) params.set("page", String(payload.page));
      const qs = params.toString() ? `?${params.toString()}` : "";
      const response = await client.fetchJSON(
        `${repoPath(payload.owner, payload.repo)}/pulls/${payload.pullNumber}/reviews/${payload.reviewId}/comments${qs}`,
      );
      if (response.status === 200) {
        const comments = Array.isArray(response.body)
          ? response.body.filter(isRecord).map((comment) => normalizeGitHubReviewComment(comment))
          : [];
        return { ok: true as const, comments };
      }
      return mapGithubError(response, "list review comments for review");
    },

    async updateReview(input: unknown) {
      const payload = validateUpdateReviewInput(input);
      const response = await client.fetchJSON(
        `${repoPath(payload.owner, payload.repo)}/pulls/${payload.pullNumber}/reviews/${payload.reviewId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: payload.body }),
        },
      );
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, review: normalizeGitHubReview(response.body) };
      }
      // 422 means the review is not pending. Stop. Do not retry.
      if (response.status === 422) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Review is not pending." } };
      }
      return mapGithubError(response, "update review");
    },
  };
}

function repoPath(owner: string, repo: string): string {
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
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


function optionalPage(value: unknown, field: string, max = 100): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > max) {
    throw new Error(`${field} must be an integer between 1 and ${max}`);
  }
  return value;
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== "number") throw new Error(`${field} must be a number`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
