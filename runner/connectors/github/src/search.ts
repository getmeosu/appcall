import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";
import { normalizeGitHubIssue, type GitHubIssue, type NormalizedIssue } from "./issues";
import { normalizeGitHubOrg, type GitHubOrg } from "./orgs";
import { normalizeGitHubRepo, type GitHubRepo } from "./repos";
import { normalizeGitHubUser, type GitHubUser, type NormalizedUser } from "./users";

export type SearchIssuesInput = {
  q: string;
  sort?: string;
  order?: string;
  perPage?: number;
  page?: number;
};

function optionalPage(value: unknown, field: string, max = 100): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > max) {
    throw new Error(`${field} must be an integer between 1 and ${max}`);
  }
  return value;
}

export function validateSearchIssuesInput(input: unknown): SearchIssuesInput {
  if (!isRecord(input)) throw new Error("search issues input must be an object");
  const order = typeof input.order === "string" ? input.order : undefined;
  if (order !== undefined && order !== "asc" && order !== "desc") {
    throw new Error("order must be asc or desc");
  }
  return {
    q: requireString(input.q, "q"),
    sort: typeof input.sort === "string" ? input.sort : undefined,
    order,
    perPage: optionalPage(input.perPage, "perPage"),
    page: optionalPage(input.page, "page", 1_000_000),
  };
}

export type SearchPullRequestsInput = SearchIssuesInput;

export function validateSearchPullRequestsInput(input: unknown): SearchPullRequestsInput {
  return validateSearchIssuesInput(input);
}

export type NormalizedSearchPullRequest = {
  id: string;
  provider: "github";
  providerPullRequestId: number;
  number: number;
  title: string;
  body: string;
  state: string;
  url: string;
  author: string;
  createdAt: string;
  updatedAt: string;
  repositoryUrl: string;
  modelVersion: "2026-05-16";
  raw: Record<string, unknown>;
};

export function normalizeSearchPullRequest(item: Record<string, unknown>): NormalizedSearchPullRequest {
  const user = isRecord(item.user) ? item.user : {};
  return {
    id: `gh-pr:${typeof item.id === "number" ? item.id : 0}`,
    provider: "github",
    providerPullRequestId: typeof item.id === "number" ? item.id : 0,
    number: typeof item.number === "number" ? item.number : 0,
    title: typeof item.title === "string" ? item.title : "",
    body: typeof item.body === "string" ? item.body : "",
    state: typeof item.state === "string" ? item.state : "",
    url: typeof item.html_url === "string" ? item.html_url : "",
    author: typeof user.login === "string" ? user.login : "",
    createdAt: typeof item.created_at === "string" ? item.created_at : "",
    updatedAt: typeof item.updated_at === "string" ? item.updated_at : "",
    repositoryUrl: typeof item.repository_url === "string" ? item.repository_url : "",
    modelVersion: "2026-05-16",
    raw: item,
  };
}

export type SearchIssuesResult = {
  totalCount: number;
  incompleteResults: boolean;
  items: NormalizedIssue[];
};

export type SearchPullRequestsResult = {
  totalCount: number;
  incompleteResults: boolean;
  items: NormalizedSearchPullRequest[];
};

function buildSearchQuery(q: string, force: "issue" | "pr"): string {
  if (force === "pr") {
    if (/\bis:pr\b/i.test(q) || /\bis:pull-request\b/i.test(q)) return q;
    return `${q} is:pr`;
  }
  if (/\bis:issue\b/i.test(q)) return q;
  // Exclude PRs at the query layer so total_count matches returned items.
  if (/\bis:pr\b/i.test(q)) return q;
  return `${q} is:issue`;
}

function buildSearchPath(payload: SearchIssuesInput, force: "issue" | "pr"): string {
  const params = new URLSearchParams();
  params.set("q", buildSearchQuery(payload.q, force));
  if (payload.sort) params.set("sort", payload.sort);
  if (payload.order) params.set("order", payload.order);
  if (payload.perPage) params.set("per_page", String(payload.perPage));
  if (payload.page) params.set("page", String(payload.page));
  return `/search/issues?${params.toString()}`;
}


export type SearchUsersInput = {
  q: string;
  sort?: string;
  order?: string;
  perPage?: number;
  page?: number;
};

export function validateSearchUsersInput(input: unknown): SearchUsersInput {
  if (!isRecord(input)) throw new Error("search users input must be an object");
  const order = typeof input.order === "string" ? input.order : undefined;
  if (order !== undefined && order !== "asc" && order !== "desc") {
    throw new Error("order must be asc or desc");
  }
  return {
    q: requireString(input.q, "q"),
    sort: typeof input.sort === "string" ? input.sort : undefined,
    order,
    perPage: optionalPage(input.perPage, "perPage"),
    page: optionalPage(input.page, "page", 1_000_000),
  };
}

export type SearchUsersResult = {
  totalCount: number;
  incompleteResults: boolean;
  items: ReturnType<typeof normalizeGitHubUser>[];
};


export type SearchQueryInput = {
  q: string;
  sort?: string;
  order?: string;
  perPage?: number;
  page?: number;
};

function validateNamedSearchInput(input: unknown, label: string): SearchQueryInput {
  if (!isRecord(input)) throw new Error(`${label} input must be an object`);
  const order = typeof input.order === "string" ? input.order : undefined;
  if (order !== undefined && order !== "asc" && order !== "desc") {
    throw new Error("order must be asc or desc");
  }
  if (input.sort !== undefined && typeof input.sort !== "string") throw new Error("sort must be a string");
  return {
    q: requireString(input.q, "q"),
    sort: typeof input.sort === "string" ? input.sort : undefined,
    order,
    perPage: optionalPage(input.perPage, "perPage"),
    page: optionalPage(input.page, "page", 1_000_000),
  };
}

export function validateSearchCodeInput(input: unknown): SearchQueryInput {
  return validateNamedSearchInput(input, "search code");
}

export function validateSearchCommitsInput(input: unknown): SearchQueryInput {
  return validateNamedSearchInput(input, "search commits");
}

export function validateSearchRepositoriesInput(input: unknown): SearchQueryInput {
  return validateNamedSearchInput(input, "search repositories");
}

export function validateSearchOrgsInput(input: unknown): SearchQueryInput {
  return validateNamedSearchInput(input, "search orgs");
}

export type NormalizedSearchCode = {
  id: string;
  provider: "github";
  name: string;
  path: string;
  sha: string;
  url: string;
  repository: string;
  modelVersion: "2026-05-16";
  raw: Record<string, unknown>;
};

export function normalizeSearchCode(item: Record<string, unknown>): NormalizedSearchCode {
  const repo = isRecord(item.repository) ? item.repository : {};
  const sha = typeof item.sha === "string" ? item.sha : "";
  const path = typeof item.path === "string" ? item.path : "";
  const fullName = typeof repo.full_name === "string" ? repo.full_name : "";
  return {
    id: `gh-code:${fullName}:${path}:${sha}`,
    provider: "github",
    name: typeof item.name === "string" ? item.name : "",
    path,
    sha,
    url: typeof item.html_url === "string" ? item.html_url : "",
    repository: fullName,
    modelVersion: "2026-05-16",
    raw: item,
  };
}

export type NormalizedSearchCommit = {
  id: string;
  provider: "github";
  sha: string;
  message: string;
  url: string;
  author: string;
  repository: string;
  modelVersion: "2026-05-16";
  raw: Record<string, unknown>;
};

export function normalizeSearchCommit(item: Record<string, unknown>): NormalizedSearchCommit {
  const commit = isRecord(item.commit) ? item.commit : {};
  const authorObj = isRecord(item.author) ? item.author : {};
  const commitAuthor = isRecord(commit.author) ? commit.author : {};
  const repo = isRecord(item.repository) ? item.repository : {};
  const sha = typeof item.sha === "string" ? item.sha : "";
  return {
    id: `gh-commit:${sha}`,
    provider: "github",
    sha,
    message: typeof commit.message === "string" ? commit.message : "",
    url: typeof item.html_url === "string" ? item.html_url : "",
    author: typeof authorObj.login === "string" ? authorObj.login : (typeof commitAuthor.name === "string" ? commitAuthor.name : ""),
    repository: typeof repo.full_name === "string" ? repo.full_name : "",
    modelVersion: "2026-05-16",
    raw: item,
  };
}

/** GitHub has no /search/orgs. Organizations are users with type:org. */
export function buildOrgSearchQuery(q: string): string {
  // A leading "-" is an exclusion (`-type:org`). Only a positive qualifier counts.
  if (/(?:^|\s)type:org(?:\s|$)/i.test(q)) return q;
  return `${q} type:org`;
}

function buildQueryPath(path: string, payload: SearchQueryInput, q: string): string {
  const params = new URLSearchParams();
  params.set("q", q);
  if (payload.sort) params.set("sort", payload.sort);
  if (payload.order) params.set("order", payload.order);
  if (payload.perPage) params.set("per_page", String(payload.perPage));
  if (payload.page) params.set("page", String(payload.page));
  return `${path}?${params.toString()}`;
}

type SearchHttpResponse = { status: number; headers: Record<string, string>; body: unknown };

function searchFailure(response: SearchHttpResponse, message: string) {
  if (response.status === 422) {
    return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: "Invalid search query.", retryAfterSeconds: undefined as number | undefined } };
  }
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
  return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message, retryAfterSeconds: undefined as number | undefined } };
}

function readSearchItems<T>(response: SearchHttpResponse, mapItem: (item: Record<string, unknown>) => T, message: string) {
  if (response.status === 200 && isRecord(response.body)) {
    const itemsRaw = Array.isArray(response.body.items) ? response.body.items : [];
    const items = itemsRaw.filter(isRecord).map(mapItem);
    return {
      ok: true as const,
      result: {
        totalCount: typeof response.body.total_count === "number" ? response.body.total_count : items.length,
        incompleteResults: response.body.incomplete_results === true,
        items,
      },
    };
  }
  return searchFailure(response, message);
}

function buildUsersSearchPath(payload: SearchUsersInput): string {
  const params = new URLSearchParams();
  params.set("q", payload.q);
  if (payload.sort) params.set("sort", payload.sort);
  if (payload.order) params.set("order", payload.order);
  if (payload.perPage) params.set("per_page", String(payload.perPage));
  if (payload.page) params.set("page", String(payload.page));
  return `/search/users?${params.toString()}`;
}

export function createSearchClient(options: { accessToken: string; fetch?: typeof fetch; githubClient?: GitHubClient }) {
  const client = options.githubClient ?? createGitHubClient({ accessToken: options.accessToken, fetch: options.fetch, operation: "search.issues" });

  return {
    async searchIssues(input: unknown) {
      const payload = validateSearchIssuesInput(input);
      const response = await client.fetchJSON(buildSearchPath(payload, "issue"));
      if (response.status === 200 && isRecord(response.body)) {
        const itemsRaw = Array.isArray(response.body.items) ? response.body.items : [];
        const issues = itemsRaw.filter(isRecord).map((item) => normalizeGitHubIssue(item as GitHubIssue));
        return {
          ok: true as const,
          result: {
            totalCount: typeof response.body.total_count === "number" ? response.body.total_count : issues.length,
            incompleteResults: response.body.incomplete_results === true,
            items: issues,
          } satisfies SearchIssuesResult,
        };
      }
      if (response.status === 422) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Invalid search query." } };
      }
      if (response.status === 429 || (response.status === 403 && parseGitHubRateLimit(response.status, response.headers).limited)) {
        const rateLimit = parseGitHubRateLimit(response.status, response.headers);
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "GitHub rate limit exceeded.", retryAfterSeconds: rateLimit.limited ? rateLimit.retryAfterSeconds : undefined } };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "GitHub rejected the search issues request." } };
    },

    async searchPullRequests(input: unknown) {
      const payload = validateSearchPullRequestsInput(input);
      const response = await client.fetchJSON(buildSearchPath(payload, "pr"));
      if (response.status === 200 && isRecord(response.body)) {
        const itemsRaw = Array.isArray(response.body.items) ? response.body.items : [];
        const prs = itemsRaw.filter(isRecord).map((item) => normalizeSearchPullRequest(item));
        return {
          ok: true as const,
          result: {
            totalCount: typeof response.body.total_count === "number" ? response.body.total_count : prs.length,
            incompleteResults: response.body.incomplete_results === true,
            items: prs,
          } satisfies SearchPullRequestsResult,
        };
      }
      if (response.status === 422) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Invalid search query." } };
      }
      if (response.status === 429 || (response.status === 403 && parseGitHubRateLimit(response.status, response.headers).limited)) {
        const rateLimit = parseGitHubRateLimit(response.status, response.headers);
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "GitHub rate limit exceeded.", retryAfterSeconds: rateLimit.limited ? rateLimit.retryAfterSeconds : undefined } };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "GitHub rejected the search pull requests request." } };
    },

    async searchUsers(input: unknown) {
      const payload = validateSearchUsersInput(input);
      const response = await client.fetchJSON(buildUsersSearchPath(payload));
      if (response.status === 200 && isRecord(response.body)) {
        const itemsRaw = Array.isArray(response.body.items) ? response.body.items : [];
        const users = itemsRaw.filter(isRecord).map((item) => normalizeGitHubUser(item as GitHubUser));
        return {
          ok: true as const,
          result: {
            totalCount: typeof response.body.total_count === "number" ? response.body.total_count : users.length,
            incompleteResults: response.body.incomplete_results === true,
            items: users,
          } satisfies SearchUsersResult,
        };
      }
      if (response.status === 422) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Invalid search query." } };
      }
      if (response.status === 429 || (response.status === 403 && parseGitHubRateLimit(response.status, response.headers).limited)) {
        const rateLimit = parseGitHubRateLimit(response.status, response.headers);
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "GitHub rate limit exceeded.", retryAfterSeconds: rateLimit.limited ? rateLimit.retryAfterSeconds : undefined } };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "GitHub rejected the search users request." } };
    },

    async searchCode(input: unknown) {
      const payload = validateSearchCodeInput(input);
      const response = await client.fetchJSON(buildQueryPath("/search/code", payload, payload.q));
      return readSearchItems(response, normalizeSearchCode, "GitHub rejected the search code request.");
    },

    async searchCommits(input: unknown) {
      const payload = validateSearchCommitsInput(input);
      const response = await client.fetchJSON(buildQueryPath("/search/commits", payload, payload.q));
      return readSearchItems(response, normalizeSearchCommit, "GitHub rejected the search commits request.");
    },

    async searchRepositories(input: unknown) {
      const payload = validateSearchRepositoriesInput(input);
      const response = await client.fetchJSON(buildQueryPath("/search/repositories", payload, payload.q));
      return readSearchItems(response, (item) => normalizeGitHubRepo(item as GitHubRepo), "GitHub rejected the search repositories request.");
    },

    async searchOrgs(input: unknown) {
      const payload = validateSearchOrgsInput(input);
      const response = await client.fetchJSON(buildQueryPath("/search/users", payload, buildOrgSearchQuery(payload.q)));
      return readSearchItems(response, (item) => normalizeGitHubOrg(item as GitHubOrg), "GitHub rejected the search orgs request.");
    },
  };
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
