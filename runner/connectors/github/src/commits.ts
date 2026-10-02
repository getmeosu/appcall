import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";

export type GitHubCommit = {
  sha: string;
  commit?: {
    author?: { name?: string; email?: string; date?: string };
    committer?: { name?: string; email?: string; date?: string };
    message?: string;
  };
  html_url?: string;
  author?: { login?: string };
  [key: string]: unknown;
};

export type NormalizedCommit = {
  id: string;
  provider: "github";
  sha: string;
  message: string;
  author: string;
  authorEmail: string;
  committer: string;
  committerEmail: string;
  url: string;
  authoredAt: string;
  committedAt: string;
  modelVersion: "2026-05-16";
  raw: GitHubCommit;
};

export function normalizeGitHubCommit(commit: GitHubCommit): NormalizedCommit {
  return {
    id: `gh-commit:${commit.sha}`,
    provider: "github",
    sha: commit.sha,
    message: commit.commit?.message ?? "",
    author: commit.commit?.author?.name ?? commit.author?.login ?? "",
    authorEmail: commit.commit?.author?.email ?? "",
    committer: commit.commit?.committer?.name ?? "",
    committerEmail: commit.commit?.committer?.email ?? "",
    url: commit.html_url ?? "",
    authoredAt: commit.commit?.author?.date ?? "",
    committedAt: commit.commit?.committer?.date ?? "",
    modelVersion: "2026-05-16",
    raw: commit,
  };
}

export function parseCommitsResponse(response: unknown): { commits: GitHubCommit[]; nextLink: string | null } {
  const nextLink = isRecord(response) ? parseNextLink(response) : null;
  const value = Array.isArray(response) ? response : (isRecord(response) ? (response.value ?? null) : null);
  if (!Array.isArray(value)) return { commits: [], nextLink };
  return {
    commits: value.filter(isRecord).map((c) => ({
      sha: requireString(c.sha, "sha"),
      commit: isRecord(c.commit) ? {
        author: isRecord(c.commit.author) ? { name: typeof c.commit.author.name === "string" ? c.commit.author.name : undefined, email: typeof c.commit.author.email === "string" ? c.commit.author.email : undefined, date: typeof c.commit.author.date === "string" ? c.commit.author.date : undefined } : undefined,
        committer: isRecord(c.commit.committer) ? { name: typeof c.commit.committer.name === "string" ? c.commit.committer.name : undefined, email: typeof c.commit.committer.email === "string" ? c.commit.committer.email : undefined, date: typeof c.commit.committer.date === "string" ? c.commit.committer.date : undefined } : undefined,
        message: typeof c.commit.message === "string" ? c.commit.message : undefined,
      } : undefined,
      html_url: typeof c.html_url === "string" ? c.html_url : undefined,
      author: isRecord(c.author) ? { login: typeof c.author.login === "string" ? c.author.login : undefined } : undefined,
    })),
    nextLink,
  };
}

// ─── Combined / commit status types ───────────────────────────────────────────

export type GitHubCommitStatusItem = {
  id?: number;
  state?: string;
  description?: string | null;
  target_url?: string | null;
  context?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
};

export type NormalizedCommitStatusItem = {
  id: number | null;
  state: string;
  description: string;
  targetUrl: string;
  context: string;
  createdAt: string;
  updatedAt: string;
  raw: GitHubCommitStatusItem;
};

export function normalizeGitHubCommitStatusItem(item: GitHubCommitStatusItem): NormalizedCommitStatusItem {
  return {
    id: typeof item.id === "number" ? item.id : null,
    state: item.state ?? "",
    description: item.description ?? "",
    targetUrl: item.target_url ?? "",
    context: item.context ?? "",
    createdAt: item.created_at ?? "",
    updatedAt: item.updated_at ?? "",
    raw: item,
  };
}

export type GitHubCombinedStatus = {
  state?: string;
  sha?: string;
  total_count?: number;
  statuses?: GitHubCommitStatusItem[];
  commit_url?: string;
  url?: string;
  [key: string]: unknown;
};

export type NormalizedCombinedStatus = {
  state: string;
  sha: string;
  totalCount: number;
  statuses: NormalizedCommitStatusItem[];
  url: string;
  modelVersion: "2026-05-16";
  raw: GitHubCombinedStatus;
};

export function normalizeGitHubCombinedStatus(status: GitHubCombinedStatus): NormalizedCombinedStatus {
  const statuses = Array.isArray(status.statuses) ? status.statuses.map(normalizeGitHubCommitStatusItem) : [];
  return {
    state: status.state ?? "",
    sha: status.sha ?? "",
    totalCount: typeof status.total_count === "number" ? status.total_count : statuses.length,
    statuses,
    url: status.url ?? status.commit_url ?? "",
    modelVersion: "2026-05-16",
    raw: status,
  };
}

// ─── Input validators ─────────────────────────────────────────────────────────

export type GetCommitStatusInput = { owner: string; repo: string; ref: string };

export function validateGetCommitStatusInput(input: unknown): GetCommitStatusInput {
  if (!isRecord(input)) throw new Error("get commit status input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    // Accept `sha` as alias for `ref` so EffectPolicy Reconcile can reuse
    // commits.statuses.create input (sha) when calling commits.status.get.
    ref: requireString(input.ref ?? input.sha, "ref"),
  };
}

export type ListCommitStatusesInput = { owner: string; repo: string; ref: string; perPage?: number; page?: number };

export function validateListCommitStatusesInput(input: unknown): ListCommitStatusesInput {
  if (!isRecord(input)) throw new Error("list commit statuses input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    // Accept `sha` as alias for `ref` (same reconcile-friendly alias as status.get).
    ref: requireString(input.ref ?? input.sha, "ref"),
    perPage: typeof input.perPage === "number" ? input.perPage : undefined,
    page: typeof input.page === "number" ? input.page : undefined,
  };
}

export type CreateCommitStatusInput = {
  owner: string;
  repo: string;
  sha: string;
  state: string;
  targetUrl?: string;
  description?: string;
  context?: string;
};

export function validateCreateCommitStatusInput(input: unknown): CreateCommitStatusInput {
  if (!isRecord(input)) throw new Error("create commit status input must be an object");
  const allowedStates = new Set(["error", "failure", "pending", "success"]);
  const state = requireString(input.state, "state");
  if (!allowedStates.has(state)) {
    throw new Error("state must be one of: error, failure, pending, success");
  }
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    sha: requireString(input.sha, "sha"),
    state,
    targetUrl: typeof input.targetUrl === "string" ? input.targetUrl : undefined,
    description: typeof input.description === "string" ? input.description : undefined,
    context: typeof input.context === "string" ? input.context : undefined,
  };
}

export type GetCommitInput = { owner: string; repo: string; ref: string };

export function validateGetCommitInput(input: unknown): GetCommitInput {
  if (!isRecord(input)) throw new Error("get commit input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    ref: requireString(input.ref, "ref"),
  };
}

// ─── Client ───────────────────────────────────────────────────────────────────

export function createCommitsClient(options: { accessToken: string; fetch?: typeof fetch; githubClient?: GitHubClient }) {
  const client = options.githubClient ?? createGitHubClient({ accessToken: options.accessToken, fetch: options.fetch, operation: "commits.get" });

  return {
    async getStatus(input: unknown) {
      const payload = validateGetCommitStatusInput(input);
      const response = await client.fetchJSON(
        `/repos/${payload.owner}/${payload.repo}/commits/${encodeURIComponent(payload.ref)}/status`
      );
      if (response.status === 200) {
        return { ok: true as const, status: normalizeGitHubCombinedStatus(response.body as GitHubCombinedStatus) };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Commit or repository not found." } };
      }
      return mapRateOrUpstream(response, "GitHub rejected the get commit status request.");
    },

    async listStatuses(input: unknown) {
      const payload = validateListCommitStatusesInput(input);
      const params = new URLSearchParams();
      if (payload.perPage) params.set("per_page", String(payload.perPage));
      if (payload.page) params.set("page", String(payload.page));
      const qs = params.toString() ? `?${params.toString()}` : "";
      const response = await client.fetchJSON(
        `/repos/${payload.owner}/${payload.repo}/commits/${encodeURIComponent(payload.ref)}/statuses${qs}`
      );
      if (response.status === 200) {
        const statuses = Array.isArray(response.body)
          ? (response.body as GitHubCommitStatusItem[]).map(normalizeGitHubCommitStatusItem)
          : [];
        return { ok: true as const, statuses };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Commit or repository not found." } };
      }
      return mapRateOrUpstream(response, "GitHub rejected the list commit statuses request.");
    },

    async createStatus(input: unknown) {
      const payload = validateCreateCommitStatusInput(input);
      const response = await client.fetchJSON(`/repos/${payload.owner}/${payload.repo}/statuses/${encodeURIComponent(payload.sha)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          state: payload.state,
          target_url: payload.targetUrl,
          description: payload.description,
          context: payload.context,
        }),
      });
      if (response.status === 201) {
        return { ok: true as const, status: normalizeGitHubCommitStatusItem(response.body as GitHubCommitStatusItem) };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Commit SHA or repository not found." } };
      }
      if (response.status === 422) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Validation failed for create commit status." } };
      }
      return mapRateOrUpstream(response, "GitHub rejected the create commit status request.");
    },

    async get(input: unknown) {
      const payload = validateGetCommitInput(input);
      const response = await client.fetchJSON(
        `/repos/${payload.owner}/${payload.repo}/commits/${encodeURIComponent(payload.ref)}`
      );
      if (response.status === 200) {
        return { ok: true as const, commit: normalizeGitHubCommit(response.body as GitHubCommit) };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Commit not found." } };
      }
      if (response.status === 422) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Commit SHA is invalid." } };
      }
      return mapRateOrUpstream(response, "GitHub rejected the get commit request.");
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

function parseNextLink(response: Record<string, unknown>): string | null {
  const link = response.nextLink;
  return typeof link === "string" && link.length > 0 ? link : null;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
