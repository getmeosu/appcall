import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";

type Page = { perPage?: number; page?: number };

export type GetRateLimitInput = Record<string, never>;
export type ListRepoCommentsInput = { owner: string; repo: string } & Page;
export type GetRepoKeyInput = { owner: string; repo: string; keyId: number };
export type ListRepoKeysInput = { owner: string; repo: string } & Page;

export type NormalizedRateLimit = {
  limit: number;
  remaining: number;
  reset: number;
  used: number;
};

export type NormalizedRepoComment = {
  id: number;
  body: string;
  path: string;
  commitId: string;
  htmlUrl: string;
  userLogin: string;
  createdAt: string;
  updatedAt: string;
};

export type NormalizedRepoKey = {
  id: number;
  key: string;
  title: string;
  url: string;
  verified: boolean;
  readOnly: boolean;
  createdAt: string;
  addedBy: string;
};

export function validateGetRateLimitInput(input: unknown): GetRateLimitInput {
  if (input === undefined || input === null) return {};
  if (!isRecord(input)) throw new Error("rate_limit.get input must be an object");
  return {};
}

export function validateListRepoCommentsInput(input: unknown): ListRepoCommentsInput {
  if (!isRecord(input)) throw new Error("repos.comments.list input must be an object");
  return { ...repoScope(input), ...pageInput(input) };
}

export function validateGetRepoKeyInput(input: unknown): GetRepoKeyInput {
  if (!isRecord(input)) throw new Error("repos.keys.get input must be an object");
  return { ...repoScope(input), keyId: requireId(input.keyId, "keyId") };
}

export function validateListRepoKeysInput(input: unknown): ListRepoKeysInput {
  if (!isRecord(input)) throw new Error("repos.keys.list input must be an object");
  return { ...repoScope(input), ...pageInput(input) };
}

export function normalizeRateLimit(item: Record<string, unknown>): NormalizedRateLimit {
  const resources = isRecord(item.resources) ? item.resources : {};
  const core = isRecord(resources.core) ? resources.core : {};
  return {
    limit: numberField(core.limit),
    remaining: numberField(core.remaining),
    reset: numberField(core.reset),
    used: numberField(core.used),
  };
}

export function normalizeRepoComment(item: Record<string, unknown>): NormalizedRepoComment {
  const user = isRecord(item.user) ? item.user : {};
  return {
    id: numberField(item.id),
    body: typeof item.body === "string" ? item.body : "",
    path: typeof item.path === "string" ? item.path : "",
    commitId: typeof item.commit_id === "string" ? item.commit_id : "",
    htmlUrl: typeof item.html_url === "string" ? item.html_url : "",
    userLogin: typeof user.login === "string" ? user.login : "",
    createdAt: typeof item.created_at === "string" ? item.created_at : "",
    updatedAt: typeof item.updated_at === "string" ? item.updated_at : "",
  };
}

export function normalizeRepoKey(item: Record<string, unknown>): NormalizedRepoKey {
  return {
    id: numberField(item.id),
    key: typeof item.key === "string" ? item.key : "",
    title: typeof item.title === "string" ? item.title : "",
    url: typeof item.url === "string" ? item.url : "",
    verified: item.verified === true,
    readOnly: item.read_only === true,
    createdAt: typeof item.created_at === "string" ? item.created_at : "",
    addedBy: typeof item.added_by === "string" ? item.added_by : "",
  };
}

export function createCard17ReadsClient(options: { accessToken: string; fetch?: typeof fetch; githubClient?: GitHubClient }) {
  const client = options.githubClient ?? createGitHubClient({
    accessToken: options.accessToken,
    fetch: options.fetch,
    operation: "rate_limit.get",
  });

  return {
    async getRateLimit(input: unknown) {
      validateGetRateLimitInput(input);
      const response = await client.fetchJSON("/rate_limit");
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, rateLimit: normalizeRateLimit(response.body) };
      }
      if (response.status === 404) return upstream("Rate limit status not found.");
      return mapRateOrUpstream(response, "GitHub rejected the rate limit request.");
    },

    async listRepoComments(input: unknown) {
      const payload = validateListRepoCommentsInput(input);
      const response = await client.fetchJSON(`${repoPath(payload.owner, payload.repo)}/comments${query(pageQuery(payload))}`);
      if (response.status === 200 && Array.isArray(response.body)) {
        return { ok: true as const, comments: response.body.filter(isRecord).map(normalizeRepoComment) };
      }
      if (response.status === 404) return upstream("Repository comments not found.");
      return mapRateOrUpstream(response, "GitHub rejected the list repository comments request.");
    },

    async getRepoKey(input: unknown) {
      const payload = validateGetRepoKeyInput(input);
      const response = await client.fetchJSON(`${repoPath(payload.owner, payload.repo)}/keys/${encodeURIComponent(String(payload.keyId))}`);
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, key: normalizeRepoKey(response.body) };
      }
      if (response.status === 404) return upstream("Repository key not found.");
      return mapRateOrUpstream(response, "GitHub rejected the repository key request.");
    },

    async listRepoKeys(input: unknown) {
      const payload = validateListRepoKeysInput(input);
      const response = await client.fetchJSON(`${repoPath(payload.owner, payload.repo)}/keys${query(pageQuery(payload))}`);
      if (response.status === 200 && Array.isArray(response.body)) {
        return { ok: true as const, keys: response.body.filter(isRecord).map(normalizeRepoKey) };
      }
      if (response.status === 404) return upstream("Repository keys not found.");
      return mapRateOrUpstream(response, "GitHub rejected the list repository keys request.");
    },
  };
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

function optionalPage(value: unknown, field: string, max = 100): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > max) {
    throw new Error(`${field} must be an integer between 1 and ${max}`);
  }
  return value;
}

function numberField(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
