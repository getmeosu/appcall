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
