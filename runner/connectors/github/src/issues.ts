import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";

export type GitHubIssue = {
  id: number;
  number: number;
  title: string;
  body?: string;
  state?: string;
  labels?: { id?: number; name?: string; color?: string }[];
  user?: { login?: string; id?: number };
  assignee?: { login?: string; id?: number } | null;
  milestone?: { id?: number; number?: number; title?: string } | null;
  html_url?: string;
  created_at?: string;
  updated_at?: string;
  closed_at?: string;
  comments?: number;
  pull_request?: { url?: string; html_url?: string };
  repository_url?: string;
  [key: string]: unknown;
};

export type NormalizedIssue = {
  id: string;
  provider: "github";
  providerIssueId: number;
  number: number;
  title: string;
  body: string;
  state: string;
  isOpen: boolean;
  url: string;
  repositoryUrl: string;
  labels: string[];
  author: string;
  assignee: string;
  createdAt: string;
  updatedAt: string;
  closedAt: string;
  modelVersion: "2026-05-16";
  raw: GitHubIssue;
};

export function normalizeGitHubIssue(issue: GitHubIssue): NormalizedIssue {
  return {
    id: `gh-issue:${issue.id}`,
    provider: "github",
    providerIssueId: issue.id,
    number: issue.number,
    title: issue.title ?? "",
    body: issue.body ?? "",
    state: issue.state ?? "open",
    isOpen: issue.state === "open",
    url: issue.html_url ?? "",
    repositoryUrl: issue.repository_url ?? "",
    labels: (issue.labels ?? []).map((l) => typeof l.name === "string" ? l.name : ""),
    author: issue.user?.login ?? "",
    assignee: issue.assignee?.login ?? "",
    createdAt: issue.created_at ?? "",
    updatedAt: issue.updated_at ?? "",
    closedAt: issue.closed_at ?? "",
    modelVersion: "2026-05-16",
    raw: issue,
  };
}

export function parseIssuesResponse(response: unknown): { issues: GitHubIssue[]; nextLink: string | null } {
  const nextLink = isRecord(response) ? parseNextLink(response) : null;
  const value = Array.isArray(response) ? response : (isRecord(response) ? (response.value ?? null) : null);
  if (!Array.isArray(value)) return { issues: [], nextLink };
  return {
    issues: value.filter(isRecord).map((i) => ({
      id: requireNumber(i.id, "id"),
      number: requireNumber(i.number, "number"),
      title: requireString(i.title, "title"),
      body: typeof i.body === "string" ? i.body : undefined,
      state: typeof i.state === "string" ? i.state : undefined,
      labels: Array.isArray(i.labels) ? i.labels.filter(isRecord).map((l) => ({
        id: typeof l.id === "number" ? l.id : undefined,
        name: typeof l.name === "string" ? l.name : undefined,
        color: typeof l.color === "string" ? l.color : undefined,
      })) : undefined,
      user: isRecord(i.user) ? { login: typeof i.user.login === "string" ? i.user.login : undefined, id: typeof i.user.id === "number" ? i.user.id : undefined } : undefined,
      assignee: i.assignee === null ? null : (isRecord(i.assignee) ? { login: typeof i.assignee.login === "string" ? i.assignee.login : undefined, id: typeof i.assignee.id === "number" ? i.assignee.id : undefined } : undefined),
      milestone: i.milestone === null ? null : (isRecord(i.milestone) ? { id: typeof i.milestone.id === "number" ? i.milestone.id : undefined, number: typeof i.milestone.number === "number" ? i.milestone.number : undefined, title: typeof i.milestone.title === "string" ? i.milestone.title : undefined } : undefined),
      html_url: typeof i.html_url === "string" ? i.html_url : undefined,
      created_at: typeof i.created_at === "string" ? i.created_at : undefined,
      updated_at: typeof i.updated_at === "string" ? i.updated_at : undefined,
      closed_at: typeof i.closed_at === "string" ? i.closed_at : undefined,
      comments: typeof i.comments === "number" ? i.comments : undefined,
      pull_request: isRecord(i.pull_request) ? { url: typeof i.pull_request.url === "string" ? i.pull_request.url : undefined, html_url: typeof i.pull_request.html_url === "string" ? i.pull_request.html_url : undefined } : undefined,
      repository_url: typeof i.repository_url === "string" ? i.repository_url : undefined,
    })),
    nextLink,
  };
}

export type GitHubIssueComment = {
  id: number;
  body?: string;
  user?: { login?: string };
  created_at?: string;
  html_url?: string;
  [key: string]: unknown;
};

export type NormalizedIssueComment = {
  id: string;
  provider: "github";
  providerCommentId: number;
  body: string;
  author: string;
  url: string;
  createdAt: string;
  modelVersion: "2026-05-16";
  raw: GitHubIssueComment;
};

export function normalizeGitHubComment(comment: GitHubIssueComment): NormalizedIssueComment {
  return {
    id: `gh-comment:${comment.id}`,
    provider: "github",
    providerCommentId: comment.id,
    body: comment.body ?? "",
    author: comment.user?.login ?? "",
    url: comment.html_url ?? "",
    createdAt: comment.created_at ?? "",
    modelVersion: "2026-05-16",
    raw: comment,
  };
}

export function parseCommentsResponse(response: unknown): { comments: GitHubIssueComment[]; nextLink: string | null } {
  const nextLink = isRecord(response) ? parseNextLink(response) : null;
  const value = Array.isArray(response) ? response : (isRecord(response) ? (response.value ?? null) : null);
  if (!Array.isArray(value)) return { comments: [], nextLink };
  return {
    comments: value.filter(isRecord).map((c) => ({
      id: requireNumber(c.id, "id"),
      body: typeof c.body === "string" ? c.body : undefined,
      user: isRecord(c.user) ? { login: typeof c.user.login === "string" ? c.user.login : undefined } : undefined,
      created_at: typeof c.created_at === "string" ? c.created_at : undefined,
      html_url: typeof c.html_url === "string" ? c.html_url : undefined,
    })),
    nextLink,
  };
}

// ─── Get Issue ────────────────────────────────────────────────────────────────

export type GetIssueInput = { owner: string; repo: string; issueNumber: number };

export function validateGetIssueInput(input: unknown): GetIssueInput {
  if (!isRecord(input)) throw new Error("get issue input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    issueNumber: requireNumber(input.issueNumber, "issueNumber"),
  };
}

// ─── Update Issue ─────────────────────────────────────────────────────────────

export type UpdateIssueInput = { owner: string; repo: string; issueNumber: number; title?: string; body?: string; state?: string; labels?: string[]; assignees?: string[] };

export function validateUpdateIssueInput(input: unknown): UpdateIssueInput {
  if (!isRecord(input)) throw new Error("update issue input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    issueNumber: requireNumber(input.issueNumber, "issueNumber"),
    title: typeof input.title === "string" ? input.title : undefined,
    body: typeof input.body === "string" ? input.body : undefined,
    state: typeof input.state === "string" ? input.state : undefined,
    labels: Array.isArray(input.labels) ? input.labels.filter((l): l is string => typeof l === "string") : undefined,
    assignees: Array.isArray(input.assignees) ? input.assignees.filter((a): a is string => typeof a === "string") : undefined,
  };
}

// ─── Add Labels ───────────────────────────────────────────────────────────────

export type AddLabelsInput = { owner: string; repo: string; issueNumber: number; labels: string[] };

export function validateAddLabelsInput(input: unknown): AddLabelsInput {
  if (!isRecord(input)) throw new Error("add labels input must be an object");
  if (!Array.isArray(input.labels) || input.labels.length === 0) throw new Error("labels must be a non-empty array");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    issueNumber: requireNumber(input.issueNumber, "issueNumber"),
    labels: (input.labels as unknown[]).filter((l): l is string => typeof l === "string"),
  };
}

export type CreateIssueInput = { owner: string; repo: string; title: string; body?: string; labels?: string[]; assignees?: string[] };

export function validateCreateIssueInput(input: unknown): CreateIssueInput {
  if (!isRecord(input)) throw new Error("create issue input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    title: requireString(input.title, "title"),
    body: typeof input.body === "string" ? input.body : undefined,
    labels: Array.isArray(input.labels) ? input.labels.filter((l): l is string => typeof l === "string") : undefined,
    assignees: Array.isArray(input.assignees) ? input.assignees.filter((a): a is string => typeof a === "string") : undefined,
  };
}

export type CreateCommentInput = { owner: string; repo: string; issueNumber: number; body: string };

export function validateCreateCommentInput(input: unknown): CreateCommentInput {
  if (!isRecord(input)) throw new Error("create comment input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    issueNumber: requireNumber(input.issueNumber, "issueNumber"),
    body: requireString(input.body, "body"),
  };
}


// ─── S2: List Comments ────────────────────────────────────────────────────────

export type ListCommentsInput = { owner: string; repo: string; issueNumber: number; perPage?: number; page?: number };

export function validateListCommentsInput(input: unknown): ListCommentsInput {
  if (!isRecord(input)) throw new Error("list comments input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    issueNumber: requireNumber(input.issueNumber, "issueNumber"),
    perPage: optionalPage(input.perPage, "perPage"),
    page: optionalPage(input.page, "page", 1_000_000),
  };
}

// ─── S2: Update Comment ───────────────────────────────────────────────────────

export type UpdateCommentInput = { owner: string; repo: string; commentId: number; body: string };

export function validateUpdateCommentInput(input: unknown): UpdateCommentInput {
  if (!isRecord(input)) throw new Error("update comment input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    commentId: requireNumber(input.commentId, "commentId"),
    body: requireString(input.body, "body"),
  };
}

// ─── S2: Delete Comment ───────────────────────────────────────────────────────

export type DeleteCommentInput = { owner: string; repo: string; commentId: number };

export function validateDeleteCommentInput(input: unknown): DeleteCommentInput {
  if (!isRecord(input)) throw new Error("delete comment input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    commentId: requireNumber(input.commentId, "commentId"),
  };
}

// ─── S2: Assignees ────────────────────────────────────────────────────────────

export type AssigneesInput = { owner: string; repo: string; issueNumber: number; assignees: string[] };

export function validateAssigneesInput(input: unknown): AssigneesInput {
  if (!isRecord(input)) throw new Error("assignees input must be an object");
  if (!Array.isArray(input.assignees) || input.assignees.length === 0) throw new Error("assignees must be a non-empty array");
  if (!(input.assignees as unknown[]).every((a) => typeof a === "string" && a.length > 0)) {
    throw new Error("assignees must be an array of non-empty strings");
  }
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    issueNumber: requireNumber(input.issueNumber, "issueNumber"),
    assignees: input.assignees as string[],
  };
}

// ─── S2: Remove Labels ────────────────────────────────────────────────────────

export type RemoveLabelsInput = { owner: string; repo: string; issueNumber: number; labels: string[] };

export function validateRemoveLabelsInput(input: unknown): RemoveLabelsInput {
  if (!isRecord(input)) throw new Error("remove labels input must be an object");
  if (!Array.isArray(input.labels) || input.labels.length === 0) throw new Error("labels must be a non-empty array");
  if (!(input.labels as unknown[]).every((l) => typeof l === "string" && l.length > 0)) {
    throw new Error("labels must be an array of non-empty strings");
  }
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    issueNumber: requireNumber(input.issueNumber, "issueNumber"),
    labels: input.labels as string[],
  };
}

// ─── S2: Set Labels ───────────────────────────────────────────────────────────

export type SetLabelsInput = { owner: string; repo: string; issueNumber: number; labels: string[] };

export function validateSetLabelsInput(input: unknown): SetLabelsInput {
  if (!isRecord(input)) throw new Error("set labels input must be an object");
  if (!Array.isArray(input.labels)) throw new Error("labels must be an array");
  if (!(input.labels as unknown[]).every((l) => typeof l === "string")) {
    throw new Error("labels must be an array of strings");
  }
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    issueNumber: requireNumber(input.issueNumber, "issueNumber"),
    labels: input.labels as string[],
  };
}

// ─── S2: Lock / Unlock ────────────────────────────────────────────────────────

export type LockIssueInput = { owner: string; repo: string; issueNumber: number; lockReason?: string };

export function validateLockIssueInput(input: unknown): LockIssueInput {
  if (!isRecord(input)) throw new Error("lock issue input must be an object");
  const allowed = new Set(["off-topic", "too heated", "resolved", "spam"]);
  const lockReason = typeof input.lockReason === "string" ? input.lockReason : undefined;
  if (lockReason !== undefined && !allowed.has(lockReason)) {
    throw new Error("lockReason must be one of: off-topic, too heated, resolved, spam");
  }
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    issueNumber: requireNumber(input.issueNumber, "issueNumber"),
    lockReason,
  };
}

export type UnlockIssueInput = { owner: string; repo: string; issueNumber: number };

export function validateUnlockIssueInput(input: unknown): UnlockIssueInput {
  if (!isRecord(input)) throw new Error("unlock issue input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    issueNumber: requireNumber(input.issueNumber, "issueNumber"),
  };
}

// ─── S2: List Repo Labels ─────────────────────────────────────────────────────

export type ListLabelsInput = { owner: string; repo: string; perPage?: number; page?: number };

export function validateListLabelsInput(input: unknown): ListLabelsInput {
  if (!isRecord(input)) throw new Error("list labels input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    perPage: optionalPage(input.perPage, "perPage"),
    page: optionalPage(input.page, "page", 1_000_000),
  };
}

export type GitHubLabel = {
  id: number;
  name: string;
  color?: string;
  description?: string;
  [key: string]: unknown;
};

export type NormalizedLabel = {
  id: string;
  provider: "github";
  providerLabelId: number;
  name: string;
  color: string;
  description: string;
  modelVersion: "2026-05-16";
  raw: GitHubLabel;
};

export function normalizeGitHubLabel(label: GitHubLabel): NormalizedLabel {
  return {
    id: `gh-label:${label.id}`,
    provider: "github",
    providerLabelId: label.id,
    name: label.name ?? "",
    color: label.color ?? "",
    description: label.description ?? "",
    modelVersion: "2026-05-16",
    raw: label,
  };
}

export function createIssuesClient(options: { accessToken: string; fetch?: typeof fetch; githubClient?: GitHubClient }) {
  const client = options.githubClient ?? createGitHubClient({ accessToken: options.accessToken, fetch: options.fetch, operation: "issues.create" });

  return {
    async get(input: unknown) {
      const payload = validateGetIssueInput(input);
      const response = await client.fetchJSON(`/repos/${payload.owner}/${payload.repo}/issues/${payload.issueNumber}`);
      if (response.status === 200) {
        return { ok: true as const, issue: normalizeGitHubIssue(response.body as GitHubIssue) };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Issue not found." } };
      }
      if (response.status === 429 || (response.status === 403 && parseGitHubRateLimit(response.status, response.headers).limited)) {
        const rateLimit = parseGitHubRateLimit(response.status, response.headers);
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "GitHub rate limit exceeded.", retryAfterSeconds: rateLimit.limited ? rateLimit.retryAfterSeconds : undefined } };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "GitHub rejected the get issue request." } };
    },

    async update(input: unknown) {
      const payload = validateUpdateIssueInput(input);
      const response = await client.fetchJSON(`/repos/${payload.owner}/${payload.repo}/issues/${payload.issueNumber}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: payload.title,
          body: payload.body,
          state: payload.state,
          labels: payload.labels,
          assignees: payload.assignees,
        }),
      });
      if (response.status === 200) {
        return { ok: true as const, issue: normalizeGitHubIssue(response.body as GitHubIssue) };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Issue not found." } };
      }
      if (response.status === 429 || (response.status === 403 && parseGitHubRateLimit(response.status, response.headers).limited)) {
        const rateLimit = parseGitHubRateLimit(response.status, response.headers);
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "GitHub rate limit exceeded.", retryAfterSeconds: rateLimit.limited ? rateLimit.retryAfterSeconds : undefined } };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "GitHub rejected the update issue request." } };
    },

    async addLabels(input: unknown) {
      const payload = validateAddLabelsInput(input);
      const response = await client.fetchJSON(`/repos/${payload.owner}/${payload.repo}/issues/${payload.issueNumber}/labels`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ labels: payload.labels }),
      });
      if (response.status === 200) {
        const labelsList = Array.isArray(response.body)
          ? (response.body as Record<string, unknown>[]).map((l) => (typeof l.name === "string" ? l.name : ""))
          : [];
        return { ok: true as const, labels: labelsList };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Issue not found." } };
      }
      if (response.status === 429 || (response.status === 403 && parseGitHubRateLimit(response.status, response.headers).limited)) {
        const rateLimit = parseGitHubRateLimit(response.status, response.headers);
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "GitHub rate limit exceeded.", retryAfterSeconds: rateLimit.limited ? rateLimit.retryAfterSeconds : undefined } };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "GitHub rejected the add labels request." } };
    },

    async create(input: unknown) {
      const payload = validateCreateIssueInput(input);
      const response = await client.fetchJSON(`/repos/${payload.owner}/${payload.repo}/issues`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: payload.title,
          body: payload.body,
          labels: payload.labels,
          assignees: payload.assignees,
        }),
      });
      if (response.status === 201) {
        return { ok: true as const, issue: normalizeGitHubIssue(response.body as GitHubIssue) };
      }
      if (response.status === 429 || (response.status === 403 && parseGitHubRateLimit(response.status, response.headers).limited)) {
        const rateLimit = parseGitHubRateLimit(response.status, response.headers);
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "GitHub rate limit exceeded.", retryAfterSeconds: rateLimit.limited ? rateLimit.retryAfterSeconds : undefined } };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "GitHub rejected the create issue request." } };
    },

    async createComment(input: unknown) {
      const payload = validateCreateCommentInput(input);
      const response = await client.fetchJSON(`/repos/${payload.owner}/${payload.repo}/issues/${payload.issueNumber}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: payload.body }),
      });
      if (response.status === 201) {
        return { ok: true as const, comment: normalizeGitHubComment(response.body as GitHubIssueComment) };
      }
      if (response.status === 429 || (response.status === 403 && parseGitHubRateLimit(response.status, response.headers).limited)) {
        const rateLimit = parseGitHubRateLimit(response.status, response.headers);
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "GitHub rate limit exceeded.", retryAfterSeconds: rateLimit.limited ? rateLimit.retryAfterSeconds : undefined } };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "GitHub rejected the create comment request." } };
    },

    async listComments(input: unknown) {
      const payload = validateListCommentsInput(input);
      const params = new URLSearchParams();
      if (payload.perPage) params.set("per_page", String(payload.perPage));
      if (payload.page) params.set("page", String(payload.page));
      const qs = params.toString() ? `?${params.toString()}` : "";
      const response = await client.fetchJSON(`/repos/${payload.owner}/${payload.repo}/issues/${payload.issueNumber}/comments${qs}`);
      if (response.status === 200) {
        const parsed = parseCommentsResponse(response.body);
        return { ok: true as const, comments: parsed.comments.map(normalizeGitHubComment) };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Issue not found." } };
      }
      if (response.status === 429 || (response.status === 403 && parseGitHubRateLimit(response.status, response.headers).limited)) {
        const rateLimit = parseGitHubRateLimit(response.status, response.headers);
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "GitHub rate limit exceeded.", retryAfterSeconds: rateLimit.limited ? rateLimit.retryAfterSeconds : undefined } };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "GitHub rejected the list comments request." } };
    },

    async updateComment(input: unknown) {
      const payload = validateUpdateCommentInput(input);
      const response = await client.fetchJSON(`/repos/${payload.owner}/${payload.repo}/issues/comments/${payload.commentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: payload.body }),
      });
      if (response.status === 200) {
        return { ok: true as const, comment: normalizeGitHubComment(response.body as GitHubIssueComment) };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Comment not found." } };
      }
      if (response.status === 429 || (response.status === 403 && parseGitHubRateLimit(response.status, response.headers).limited)) {
        const rateLimit = parseGitHubRateLimit(response.status, response.headers);
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "GitHub rate limit exceeded.", retryAfterSeconds: rateLimit.limited ? rateLimit.retryAfterSeconds : undefined } };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "GitHub rejected the update comment request." } };
    },

    async deleteComment(input: unknown) {
      const payload = validateDeleteCommentInput(input);
      const response = await client.fetchJSON(`/repos/${payload.owner}/${payload.repo}/issues/comments/${payload.commentId}`, {
        method: "DELETE",
      });
      if (response.status === 204) {
        return { ok: true as const, deleted: true as const, commentId: payload.commentId };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Comment not found." } };
      }
      if (response.status === 429 || (response.status === 403 && parseGitHubRateLimit(response.status, response.headers).limited)) {
        const rateLimit = parseGitHubRateLimit(response.status, response.headers);
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "GitHub rate limit exceeded.", retryAfterSeconds: rateLimit.limited ? rateLimit.retryAfterSeconds : undefined } };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "GitHub rejected the delete comment request." } };
    },

    async addAssignees(input: unknown) {
      const payload = validateAssigneesInput(input);
      const response = await client.fetchJSON(`/repos/${payload.owner}/${payload.repo}/issues/${payload.issueNumber}/assignees`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignees: payload.assignees }),
      });
      if (response.status === 201 || response.status === 200) {
        return { ok: true as const, issue: normalizeGitHubIssue(response.body as GitHubIssue) };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Issue not found." } };
      }
      if (response.status === 429 || (response.status === 403 && parseGitHubRateLimit(response.status, response.headers).limited)) {
        const rateLimit = parseGitHubRateLimit(response.status, response.headers);
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "GitHub rate limit exceeded.", retryAfterSeconds: rateLimit.limited ? rateLimit.retryAfterSeconds : undefined } };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "GitHub rejected the add assignees request." } };
    },

    async removeAssignees(input: unknown) {
      const payload = validateAssigneesInput(input);
      const response = await client.fetchJSON(`/repos/${payload.owner}/${payload.repo}/issues/${payload.issueNumber}/assignees`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignees: payload.assignees }),
      });
      if (response.status === 200) {
        return { ok: true as const, issue: normalizeGitHubIssue(response.body as GitHubIssue) };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Issue not found." } };
      }
      if (response.status === 429 || (response.status === 403 && parseGitHubRateLimit(response.status, response.headers).limited)) {
        const rateLimit = parseGitHubRateLimit(response.status, response.headers);
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "GitHub rate limit exceeded.", retryAfterSeconds: rateLimit.limited ? rateLimit.retryAfterSeconds : undefined } };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "GitHub rejected the remove assignees request." } };
    },

    async removeLabels(input: unknown) {
      const payload = validateRemoveLabelsInput(input);
      const current = await client.fetchJSON(`/repos/${payload.owner}/${payload.repo}/issues/${payload.issueNumber}/labels`);
      if (current.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Issue not found." } };
      }
      if (current.status === 429 || (current.status === 403 && parseGitHubRateLimit(current.status, current.headers).limited)) {
        const rateLimit = parseGitHubRateLimit(current.status, current.headers);
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "GitHub rate limit exceeded.", retryAfterSeconds: rateLimit.limited ? rateLimit.retryAfterSeconds : undefined } };
      }
      if (current.status !== 200 || !Array.isArray(current.body)) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "GitHub rejected the list issue labels request." } };
      }
      const remove = new Set(payload.labels);
      const remaining = (current.body as Record<string, unknown>[])
        .map((l) => (typeof l.name === "string" ? l.name : ""))
        .filter((name) => name.length > 0 && !remove.has(name));
      const response = await client.fetchJSON(`/repos/${payload.owner}/${payload.repo}/issues/${payload.issueNumber}/labels`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(remaining),
      });
      if (response.status === 200) {
        const labelsList = Array.isArray(response.body)
          ? (response.body as Record<string, unknown>[]).map((l) => (typeof l.name === "string" ? l.name : ""))
          : remaining;
        return { ok: true as const, labels: labelsList };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Issue not found." } };
      }
      if (response.status === 429 || (response.status === 403 && parseGitHubRateLimit(response.status, response.headers).limited)) {
        const rateLimit = parseGitHubRateLimit(response.status, response.headers);
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "GitHub rate limit exceeded.", retryAfterSeconds: rateLimit.limited ? rateLimit.retryAfterSeconds : undefined } };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "GitHub rejected the remove labels request." } };
    },

    async setLabels(input: unknown) {
      const payload = validateSetLabelsInput(input);
      const response = await client.fetchJSON(`/repos/${payload.owner}/${payload.repo}/issues/${payload.issueNumber}/labels`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload.labels),
      });
      if (response.status === 200) {
        const labelsList = Array.isArray(response.body)
          ? (response.body as Record<string, unknown>[]).map((l) => (typeof l.name === "string" ? l.name : ""))
          : [];
        return { ok: true as const, labels: labelsList };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Issue not found." } };
      }
      if (response.status === 429 || (response.status === 403 && parseGitHubRateLimit(response.status, response.headers).limited)) {
        const rateLimit = parseGitHubRateLimit(response.status, response.headers);
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "GitHub rate limit exceeded.", retryAfterSeconds: rateLimit.limited ? rateLimit.retryAfterSeconds : undefined } };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "GitHub rejected the set labels request." } };
    },

    async lock(input: unknown) {
      const payload = validateLockIssueInput(input);
      const body: Record<string, unknown> = {};
      if (payload.lockReason) body.lock_reason = payload.lockReason;
      const response = await client.fetchJSON(`/repos/${payload.owner}/${payload.repo}/issues/${payload.issueNumber}/lock`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.status === 204) {
        return { ok: true as const, locked: true as const };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Issue not found." } };
      }
      if (response.status === 429 || (response.status === 403 && parseGitHubRateLimit(response.status, response.headers).limited)) {
        const rateLimit = parseGitHubRateLimit(response.status, response.headers);
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "GitHub rate limit exceeded.", retryAfterSeconds: rateLimit.limited ? rateLimit.retryAfterSeconds : undefined } };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "GitHub rejected the lock issue request." } };
    },

    async unlock(input: unknown) {
      const payload = validateUnlockIssueInput(input);
      const response = await client.fetchJSON(`/repos/${payload.owner}/${payload.repo}/issues/${payload.issueNumber}/lock`, {
        method: "DELETE",
      });
      if (response.status === 204) {
        return { ok: true as const, locked: false as const };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Issue not found." } };
      }
      if (response.status === 429 || (response.status === 403 && parseGitHubRateLimit(response.status, response.headers).limited)) {
        const rateLimit = parseGitHubRateLimit(response.status, response.headers);
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "GitHub rate limit exceeded.", retryAfterSeconds: rateLimit.limited ? rateLimit.retryAfterSeconds : undefined } };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "GitHub rejected the unlock issue request." } };
    },

    async listLabels(input: unknown) {
      const payload = validateListLabelsInput(input);
      const params = new URLSearchParams();
      if (payload.perPage) params.set("per_page", String(payload.perPage));
      if (payload.page) params.set("page", String(payload.page));
      const qs = params.toString() ? `?${params.toString()}` : "";
      const response = await client.fetchJSON(`/repos/${payload.owner}/${payload.repo}/labels${qs}`);
      if (response.status === 200) {
        const labels = Array.isArray(response.body)
          ? (response.body as Record<string, unknown>[]).filter(isRecord).map((l) => normalizeGitHubLabel({
              id: requireNumber(l.id, "id"),
              name: requireString(l.name, "name"),
              color: typeof l.color === "string" ? l.color : undefined,
              description: typeof l.description === "string" ? l.description : undefined,
            }))
          : [];
        return { ok: true as const, labels };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Repository not found." } };
      }
      if (response.status === 429 || (response.status === 403 && parseGitHubRateLimit(response.status, response.headers).limited)) {
        const rateLimit = parseGitHubRateLimit(response.status, response.headers);
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "GitHub rate limit exceeded.", retryAfterSeconds: rateLimit.limited ? rateLimit.retryAfterSeconds : undefined } };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "GitHub rejected the list labels request." } };
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
