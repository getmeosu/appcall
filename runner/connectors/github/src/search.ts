import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";
import { normalizeGitHubIssue, type GitHubIssue, type NormalizedIssue } from "./issues";
import { normalizeGitHubPullRequest, type GitHubPullRequest, type NormalizedPullRequest } from "./pull_requests";

export type SearchIssuesInput = {
  q: string;
  sort?: string;
  order?: string;
  perPage?: number;
  page?: number;
};

export function validateSearchIssuesInput(input: unknown): SearchIssuesInput {
  if (!isRecord(input)) throw new Error("search issues input must be an object");
  return {
    q: requireString(input.q, "q"),
    sort: typeof input.sort === "string" ? input.sort : undefined,
    order: typeof input.order === "string" ? input.order : undefined,
    perPage: typeof input.perPage === "number" ? input.perPage : undefined,
    page: typeof input.page === "number" ? input.page : undefined,
  };
}

export type SearchPullRequestsInput = SearchIssuesInput;

export function validateSearchPullRequestsInput(input: unknown): SearchPullRequestsInput {
  return validateSearchIssuesInput(input);
}

export type SearchIssuesResult = {
  totalCount: number;
  incompleteResults: boolean;
  items: NormalizedIssue[];
};

export type SearchPullRequestsResult = {
  totalCount: number;
  incompleteResults: boolean;
  items: NormalizedPullRequest[];
};

function buildSearchQuery(q: string, forcePr: boolean): string {
  if (!forcePr) return q;
  if (/\bis:pr\b/i.test(q) || /\bis:pull-request\b/i.test(q)) return q;
  return `${q} is:pr`;
}

function buildSearchPath(payload: SearchIssuesInput, forcePr: boolean): string {
  const params = new URLSearchParams();
  params.set("q", buildSearchQuery(payload.q, forcePr));
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
      const response = await client.fetchJSON(buildSearchPath(payload, false));
      if (response.status === 200 && isRecord(response.body)) {
        const itemsRaw = Array.isArray(response.body.items) ? response.body.items : [];
        const issues = itemsRaw
          .filter(isRecord)
          .filter((item) => !isRecord(item.pull_request))
          .map((item) => normalizeGitHubIssue(item as GitHubIssue));
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
      const response = await client.fetchJSON(buildSearchPath(payload, true));
      if (response.status === 200 && isRecord(response.body)) {
        const itemsRaw = Array.isArray(response.body.items) ? response.body.items : [];
        const prs = itemsRaw.filter(isRecord).map((item) => {
          // Search returns issue-shaped PR objects; normalize via PR helper with best-effort fields.
          const asPr = {
            id: item.id,
            number: item.number,
            title: item.title,
            body: item.body,
            state: item.state,
            user: item.user,
            html_url: item.html_url,
            draft: item.draft,
            created_at: item.created_at,
            updated_at: item.updated_at,
            closed_at: item.closed_at,
            labels: item.labels,
            repository_url: item.repository_url,
            pull_request: item.pull_request,
          } as GitHubPullRequest;
          return normalizeGitHubPullRequest(asPr);
        });
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
