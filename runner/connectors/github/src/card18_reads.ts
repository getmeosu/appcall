import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";

type Page = { perPage?: number; page?: number };

export type ListRepoPullCommentsInput = {
  owner: string;
  repo: string;
  sort?: string;
  direction?: string;
  since?: string;
} & Page;

export type NormalizedRepoPullComment = {
  id: number;
  pullRequestReviewId: number;
  body: string;
  path: string;
  commitId: string;
  author: string;
  htmlUrl: string;
  createdAt: string;
  updatedAt: string;
};

const SORT = new Set(["created", "updated", "created_at"]);
const DIRECTION = new Set(["asc", "desc"]);

export function validateListRepoPullCommentsInput(input: unknown): ListRepoPullCommentsInput {
  if (!isRecord(input)) throw new Error("repos.pulls.comments.list input must be an object");
  const payload: ListRepoPullCommentsInput = { ...repoScope(input) };
  const sort = optionalEnum(input.sort, "sort", SORT);
  const direction = optionalEnum(input.direction, "direction", DIRECTION);
  const since = optionalQueryString(input.since, "since");
  const page = pageInput(input);
  if (sort !== undefined) payload.sort = sort;
  if (direction !== undefined) payload.direction = direction;
  if (since !== undefined) payload.since = since;
  if (page.perPage !== undefined) payload.perPage = page.perPage;
  if (page.page !== undefined) payload.page = page.page;
  return payload;
}

export function normalizeRepoPullComment(item: Record<string, unknown>): NormalizedRepoPullComment {
  const user = isRecord(item.user) ? item.user : {};
  return {
    id: typeof item.id === "number" ? item.id : 0,
    pullRequestReviewId: typeof item.pull_request_review_id === "number" ? item.pull_request_review_id : 0,
    body: typeof item.body === "string" ? item.body : "",
    path: typeof item.path === "string" ? item.path : "",
    commitId: typeof item.commit_id === "string" ? item.commit_id : "",
    author: typeof user.login === "string" ? user.login : "",
    htmlUrl: typeof item.html_url === "string" ? item.html_url : "",
    createdAt: typeof item.created_at === "string" ? item.created_at : "",
    updatedAt: typeof item.updated_at === "string" ? item.updated_at : "",
  };
}

export function createCard18ReadsClient(options: { accessToken: string; fetch?: typeof fetch; githubClient?: GitHubClient }) {
  const client = options.githubClient ?? createGitHubClient({
    accessToken: options.accessToken,
    fetch: options.fetch,
    operation: "repos.pulls.comments.list",
  });

  return {
    async listRepoPullComments(input: unknown) {
      const payload = validateListRepoPullCommentsInput(input);
      const path = `${repoPath(payload.owner, payload.repo)}/pulls/comments${query({
        sort: payload.sort,
        direction: payload.direction,
        since: payload.since,
        per_page: payload.perPage,
        page: payload.page,
      })}`;
      const response = await client.fetchJSON(path);
      if (response.status === 200 && Array.isArray(response.body)) {
        return { ok: true as const, comments: response.body.filter(isRecord).map(normalizeRepoPullComment) };
      }
      if (response.status === 404) return upstream("Repository pull review comments not found.");
      return mapRateOrUpstream(response, "GitHub rejected the list repository pull review comments request.");
    },
  };
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

function repoScope(input: Record<string, unknown>): { owner: string; repo: string } {
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

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function optionalQueryString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  const text = requireString(value, field);
  if (/[\r\n]/.test(text)) throw new Error(`${field} must be a single line`);
  return text;
}

function optionalEnum(value: unknown, field: string, allowed: Set<string>): string | undefined {
  const text = optionalQueryString(value, field);
  if (text === undefined) return undefined;
  if (!allowed.has(text)) throw new Error(`${field} is not a documented value`);
  return text;
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
