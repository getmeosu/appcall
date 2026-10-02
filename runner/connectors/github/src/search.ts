import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";
import { normalizeGitHubIssue, type GitHubIssue, type NormalizedIssue } from "./issues";

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
  };
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
