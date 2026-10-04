import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";

type Page = { perPage?: number; page?: number };
type Repo = { owner: string; repo: string };

export type ListOrgIssuesInput = {
  org: string;
  filter?: string;
  state?: string;
  labels?: string;
  sort?: string;
  direction?: string;
  since?: string;
} & Page;

export type ListIssueDependenciesInput = Repo & { issueNumber: number } & Page;
export type ListRepoReviewCommentsInput = Repo & {
  sort?: string;
  direction?: string;
  since?: string;
} & Page;
export type PinIssueCommentInput = Repo & { commentId: number };
export type AddIssueBlockedByInput = Repo & { issueNumber: number; issueId: number };
export type RemoveIssueBlockedByInput = AddIssueBlockedByInput;
export type RerequestPullReviewersInput = Repo & {
  pullNumber: number;
  reviewers?: string[];
  teamReviewers?: string[];
};
export type RenderMarkdownInput = { text: string; mode?: string; context?: string };

export type NormalizedOrgIssue = {
  id: number;
  number: number;
  title: string;
  state: string;
  htmlUrl: string;
};

export type NormalizedDependencyIssue = NormalizedOrgIssue;

export type NormalizedRepoReviewComment = {
  id: number;
  body: string;
  path: string;
  user: string;
  htmlUrl: string;
  commitId: string;
  pullRequestReviewId: number;
};

export type NormalizedPinnedComment = {
  id: number;
  body: string;
  user: string;
  htmlUrl: string;
  createdAt: string;
  pinnedAt: string;
  pinnedBy: string;
};

const FILTERS = new Set(["assigned", "created", "mentioned", "subscribed", "repos", "all"]);
const STATES = new Set(["open", "closed", "all"]);
const ISSUE_SORTS = new Set(["created", "updated", "comments"]);
const DIRECTIONS = new Set(["asc", "desc"]);
const COMMENT_SORTS = new Set(["created", "updated", "created_at"]);
const MARKDOWN_MODES = new Set(["markdown", "gfm"]);

export function validateListOrgIssuesInput(input: unknown): ListOrgIssuesInput {
  if (!isRecord(input)) throw new Error("orgs.issues.list input must be an object");
  return {
    org: requireSingleSegment(input.org, "org"),
    filter: optionalEnum(input.filter, "filter", FILTERS),
    state: optionalEnum(input.state, "state", STATES),
    labels: optionalString(input.labels, "labels"),
    sort: optionalEnum(input.sort, "sort", ISSUE_SORTS),
    direction: optionalEnum(input.direction, "direction", DIRECTIONS),
    since: optionalString(input.since, "since"),
    ...pageInput(input),
  };
}

export function validateListIssueBlockedByInput(input: unknown): ListIssueDependenciesInput {
  if (!isRecord(input)) throw new Error("issues.dependencies.blocked_by.list input must be an object");
  return { ...repoScope(input), issueNumber: requireId(input.issueNumber, "issueNumber"), ...pageInput(input) };
}

export function validateListIssueBlockingInput(input: unknown): ListIssueDependenciesInput {
  if (!isRecord(input)) throw new Error("issues.dependencies.blocking.list input must be an object");
  return { ...repoScope(input), issueNumber: requireId(input.issueNumber, "issueNumber"), ...pageInput(input) };
}

export function validateListRepoReviewCommentsInput(input: unknown): ListRepoReviewCommentsInput {
  if (!isRecord(input)) throw new Error("pulls.review_comments.repo.list input must be an object");
  return {
    ...repoScope(input),
    sort: optionalEnum(input.sort, "sort", COMMENT_SORTS),
    direction: optionalEnum(input.direction, "direction", DIRECTIONS),
    since: optionalString(input.since, "since"),
    ...pageInput(input),
  };
}

export function validatePinIssueCommentInput(input: unknown): PinIssueCommentInput {
  if (!isRecord(input)) throw new Error("issues.comments.pin input must be an object");
  return { ...repoScope(input), commentId: requireId(input.commentId, "commentId") };
}

export function validateUnpinIssueCommentInput(input: unknown): PinIssueCommentInput {
  if (!isRecord(input)) throw new Error("issues.comments.unpin input must be an object");
  return { ...repoScope(input), commentId: requireId(input.commentId, "commentId") };
}

export function validateAddIssueBlockedByInput(input: unknown): AddIssueBlockedByInput {
  if (!isRecord(input)) throw new Error("issues.dependencies.blocked_by.add input must be an object");
  return {
    ...repoScope(input),
    issueNumber: requireId(input.issueNumber, "issueNumber"),
    issueId: requireId(input.issueId, "issueId"),
  };
}

export function validateRemoveIssueBlockedByInput(input: unknown): RemoveIssueBlockedByInput {
  if (!isRecord(input)) throw new Error("issues.dependencies.blocked_by.remove input must be an object");
  return {
    ...repoScope(input),
    issueNumber: requireId(input.issueNumber, "issueNumber"),
    issueId: requireId(input.issueId, "issueId"),
  };
}

export function validateRerequestPullReviewersInput(input: unknown): RerequestPullReviewersInput {
  if (!isRecord(input)) throw new Error("pulls.reviewers.rerequest input must be an object");
  return {
    ...repoScope(input),
    pullNumber: requireId(input.pullNumber, "pullNumber"),
    reviewers: optionalStringArray(input.reviewers, "reviewers"),
    teamReviewers: optionalStringArray(input.teamReviewers, "teamReviewers"),
  };
}

export function validateRenderMarkdownInput(input: unknown): RenderMarkdownInput {
  if (!isRecord(input)) throw new Error("markdown.render input must be an object");
  return {
    text: requireString(input.text, "text"),
    mode: optionalEnum(input.mode, "mode", MARKDOWN_MODES),
    context: optionalString(input.context, "context"),
  };
}

export function normalizeOrgIssue(item: Record<string, unknown>): NormalizedOrgIssue {
  return {
    id: typeof item.id === "number" ? item.id : 0,
    number: typeof item.number === "number" ? item.number : 0,
    title: typeof item.title === "string" ? item.title : "",
    state: typeof item.state === "string" ? item.state : "",
    htmlUrl: typeof item.html_url === "string" ? item.html_url : "",
  };
}

export function normalizeRepoReviewComment(item: Record<string, unknown>): NormalizedRepoReviewComment {
  const user = isRecord(item.user) ? item.user : {};
  return {
    id: typeof item.id === "number" ? item.id : 0,
    body: typeof item.body === "string" ? item.body : "",
    path: typeof item.path === "string" ? item.path : "",
    user: typeof user.login === "string" ? user.login : "",
    htmlUrl: typeof item.html_url === "string" ? item.html_url : "",
    commitId: typeof item.commit_id === "string" ? item.commit_id : "",
    pullRequestReviewId: typeof item.pull_request_review_id === "number" ? item.pull_request_review_id : 0,
  };
}

export function normalizePinnedComment(item: Record<string, unknown>): NormalizedPinnedComment {
  const user = isRecord(item.user) ? item.user : {};
  const pin = isRecord(item.pin) ? item.pin : {};
  const pinnedBy = isRecord(pin.pinned_by) ? pin.pinned_by : {};
  return {
    id: typeof item.id === "number" ? item.id : 0,
    body: typeof item.body === "string" ? item.body : "",
    user: typeof user.login === "string" ? user.login : "",
    htmlUrl: typeof item.html_url === "string" ? item.html_url : "",
    createdAt: typeof item.created_at === "string" ? item.created_at : "",
    pinnedAt: typeof pin.pinned_at === "string" ? pin.pinned_at : "",
    pinnedBy: typeof pinnedBy.login === "string" ? pinnedBy.login : "",
  };
}

export function createCardIssuesRemainingClient(options: {
  accessToken: string;
  fetch?: typeof fetch;
  githubClient?: GitHubClient;
}) {
  const client = options.githubClient ?? createGitHubClient({
    accessToken: options.accessToken,
    fetch: options.fetch,
    operation: "orgs.issues.list",
  });

  return {
    async listOrgIssues(input: unknown) {
      const payload = validateListOrgIssuesInput(input);
      const path = `/orgs/${encodeURIComponent(payload.org)}/issues${query({
        filter: payload.filter,
        state: payload.state,
        labels: payload.labels,
        sort: payload.sort,
        direction: payload.direction,
        since: payload.since,
        per_page: payload.perPage,
        page: payload.page,
      })}`;
      return listIssues(client, path, "Organization issues not found.", "GitHub rejected the list organization issues request.");
    },

    async listBlockedBy(input: unknown) {
      const payload = validateListIssueBlockedByInput(input);
      const path = `${repoPath(payload.owner, payload.repo)}/issues/${payload.issueNumber}/dependencies/blocked_by${query(pageQuery(payload))}`;
      return listIssues(client, path, "Blocked-by dependencies not found.", "GitHub rejected the list blocked-by dependencies request.");
    },

    async listBlocking(input: unknown) {
      const payload = validateListIssueBlockingInput(input);
      const path = `${repoPath(payload.owner, payload.repo)}/issues/${payload.issueNumber}/dependencies/blocking${query(pageQuery(payload))}`;
      return listIssues(client, path, "Blocking dependencies not found.", "GitHub rejected the list blocking dependencies request.");
    },

    async listRepoReviewComments(input: unknown) {
      const payload = validateListRepoReviewCommentsInput(input);
      const path = `${repoPath(payload.owner, payload.repo)}/pulls/comments${query({
        sort: payload.sort,
        direction: payload.direction,
        since: payload.since,
        per_page: payload.perPage,
        page: payload.page,
      })}`;
      const response = await client.fetchJSON(path);
      if (response.status === 200 && Array.isArray(response.body)) {
        return { ok: true as const, comments: response.body.filter(isRecord).map(normalizeRepoReviewComment) };
      }
      if (response.status === 404) return upstream("Repository review comments not found.");
      return mapRateOrUpstream(response, "GitHub rejected the list repository review comments request.");
    },

    async pinComment(input: unknown) {
      const payload = validatePinIssueCommentInput(input);
      const response = await client.fetchJSON(
        `${repoPath(payload.owner, payload.repo)}/issues/comments/${payload.commentId}/pin`,
        { method: "PUT" },
      );
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, comment: normalizePinnedComment(response.body) };
      }
      if (response.status === 404) return upstream("Issue comment not found.");
      return mapRateOrUpstream(response, "GitHub rejected the pin issue comment request.");
    },

    async unpinComment(input: unknown) {
      const payload = validateUnpinIssueCommentInput(input);
      const response = await client.fetchJSON(
        `${repoPath(payload.owner, payload.repo)}/issues/comments/${payload.commentId}/pin`,
        { method: "DELETE" },
      );
      if (response.status === 204) {
        return { ok: true as const, unpinned: true as const, commentId: payload.commentId };
      }
      if (response.status === 404) return upstream("Issue comment not found.");
      return mapRateOrUpstream(response, "GitHub rejected the unpin issue comment request.");
    },

    async addBlockedBy(input: unknown) {
      const payload = validateAddIssueBlockedByInput(input);
      const response = await client.fetchJSON(
        `${repoPath(payload.owner, payload.repo)}/issues/${payload.issueNumber}/dependencies/blocked_by`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ issue_id: payload.issueId }),
        },
      );
      if ((response.status === 201 || response.status === 200) && isRecord(response.body)) {
        return { ok: true as const, issue: normalizeOrgIssue(response.body) };
      }
      if (response.status === 404) return upstream("Issue dependency not found.");
      return mapRateOrUpstream(response, "GitHub rejected the add blocked-by dependency request.");
    },

    async removeBlockedBy(input: unknown) {
      const payload = validateRemoveIssueBlockedByInput(input);
      const response = await client.fetchJSON(
        `${repoPath(payload.owner, payload.repo)}/issues/${payload.issueNumber}/dependencies/blocked_by/${payload.issueId}`,
        { method: "DELETE" },
      );
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, issue: normalizeOrgIssue(response.body) };
      }
      if (response.status === 204) {
        return { ok: true as const, issue: { id: payload.issueId, number: 0, title: "", state: "", htmlUrl: "" } };
      }
      if (response.status === 404) return upstream("Issue dependency not found.");
      return mapRateOrUpstream(response, "GitHub rejected the remove blocked-by dependency request.");
    },

    async rerequestReviewers(input: unknown) {
      const payload = validateRerequestPullReviewersInput(input);
      const body: Record<string, string[]> = {};
      if (payload.reviewers) body.reviewers = payload.reviewers;
      if (payload.teamReviewers) body.team_reviewers = payload.teamReviewers;
      const response = await client.fetchJSON(
        `${repoPath(payload.owner, payload.repo)}/pulls/${payload.pullNumber}/requested_reviewers/rerequest`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (response.status === 200 || response.status === 201 || response.status === 204) {
        return { ok: true as const, rerequested: true as const };
      }
      if (response.status === 404) return upstream("Pull request not found.");
      return mapRateOrUpstream(response, "GitHub rejected the rerequest reviewers request.");
    },

    async renderMarkdown(input: unknown) {
      const payload = validateRenderMarkdownInput(input);
      const body: Record<string, string> = { text: payload.text };
      if (payload.mode) body.mode = payload.mode;
      if (payload.context) body.context = payload.context;
      const response = await client.fetchJSON("/markdown", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.status === 200) {
        const html = typeof response.body === "string" ? response.body : String(response.body ?? "");
        return { ok: true as const, html };
      }
      if (response.status === 404) return upstream("Markdown render was not found.");
      return mapRateOrUpstream(response, "GitHub rejected the markdown render request.");
    },
  };
}

async function listIssues(client: GitHubClient, path: string, missing: string, rejected: string) {
  const response = await client.fetchJSON(path);
  if (response.status === 200 && Array.isArray(response.body)) {
    return { ok: true as const, issues: response.body.filter(isRecord).map(normalizeOrgIssue) };
  }
  if (response.status === 404) return upstream(missing);
  return mapRateOrUpstream(response, rejected);
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

function repoScope(input: Record<string, unknown>): Repo {
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

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} must be a non-empty string`);
  return value;
}

function optionalEnum(value: unknown, field: string, allowed: Set<string>): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !allowed.has(value)) {
    throw new Error(`${field} must be one of: ${[...allowed].join(", ")}`);
  }
  return value;
}

function optionalStringArray(value: unknown, field: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string" && entry.length > 0)) {
    throw new Error(`${field} must be an array of non-empty strings`);
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
