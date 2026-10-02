import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";
import { normalizeGitHubRepo, type GitHubRepo } from "./repos";

export type GitHubUser = {
  id: number;
  login: string;
  name?: string | null;
  email?: string | null;
  bio?: string | null;
  html_url?: string;
  type?: string;
  company?: string | null;
  location?: string | null;
  blog?: string | null;
  public_repos?: number;
  followers?: number;
  following?: number;
  created_at?: string;
  updated_at?: string;
  avatar_url?: string;
};

export type NormalizedUser = {
  id: string;
  provider: "github";
  providerUserId: number;
  login: string;
  name: string;
  email: string;
  bio: string;
  url: string;
  type: string;
  company: string;
  location: string;
  blog: string;
  publicRepos: number;
  followers: number;
  following: number;
  createdAt: string;
  updatedAt: string;
  avatarUrl: string;
  modelVersion: "2026-05-16";
  raw: Record<string, unknown>;
};

export function normalizeGitHubUser(user: GitHubUser): NormalizedUser {
  return {
    id: `gh-user:${user.id}`,
    provider: "github",
    providerUserId: user.id,
    login: typeof user.login === "string" ? user.login : "",
    name: typeof user.name === "string" ? user.name : "",
    email: typeof user.email === "string" ? user.email : "",
    bio: typeof user.bio === "string" ? user.bio : "",
    url: typeof user.html_url === "string" ? user.html_url : "",
    type: typeof user.type === "string" ? user.type : "",
    company: typeof user.company === "string" ? user.company : "",
    location: typeof user.location === "string" ? user.location : "",
    blog: typeof user.blog === "string" ? user.blog : "",
    publicRepos: typeof user.public_repos === "number" ? user.public_repos : 0,
    followers: typeof user.followers === "number" ? user.followers : 0,
    following: typeof user.following === "number" ? user.following : 0,
    createdAt: typeof user.created_at === "string" ? user.created_at : "",
    updatedAt: typeof user.updated_at === "string" ? user.updated_at : "",
    avatarUrl: typeof user.avatar_url === "string" ? user.avatar_url : "",
    modelVersion: "2026-05-16",
    raw: user as unknown as Record<string, unknown>,
  };
}

export type GetAuthenticatedUserInput = Record<string, never>;

export function validateGetAuthenticatedUserInput(input: unknown): GetAuthenticatedUserInput {
  if (input === undefined || input === null) return {};
  if (!isRecord(input)) throw new Error("users.get input must be an object");
  return {};
}

export type GetUserByUsernameInput = { username: string };

export function validateUsersGetAuthenticatedInput(input: unknown): GetAuthenticatedUserInput {
  if (input === undefined || input === null) return {};
  if (!isRecord(input)) throw new Error("users.get_authenticated input must be an object");
  return {};
}

export function validateGetUserByUsernameInput(input: unknown): GetUserByUsernameInput {
  if (!isRecord(input)) throw new Error("users.get_by_username input must be an object");
  return { username: requireString(input.username, "username") };
}

export type ListUserReposInput = {
  username: string;
  type?: string;
  sort?: string;
  direction?: string;
  perPage?: number;
  page?: number;
};

export function validateListUserReposInput(input: unknown): ListUserReposInput {
  if (!isRecord(input)) throw new Error("users.repos.list input must be an object");
  if (input.type !== undefined && typeof input.type !== "string") throw new Error("type must be a string");
  if (input.sort !== undefined && typeof input.sort !== "string") throw new Error("sort must be a string");
  if (input.direction !== undefined && typeof input.direction !== "string") throw new Error("direction must be a string");
  const type = typeof input.type === "string" ? input.type : undefined;
  if (type !== undefined && !["all", "owner", "member"].includes(type)) {
    throw new Error("type must be all, owner, or member");
  }
  const direction = typeof input.direction === "string" ? input.direction : undefined;
  if (direction !== undefined && direction !== "asc" && direction !== "desc") {
    throw new Error("direction must be asc or desc");
  }
  return {
    username: requireString(input.username, "username"),
    type,
    sort: typeof input.sort === "string" ? input.sort : undefined,
    direction,
    perPage: optionalPage(input.perPage, "perPage"),
    page: optionalPage(input.page, "page", 1_000_000),
  };
}

export function createUsersClient(options: { accessToken: string; fetch?: typeof fetch; githubClient?: GitHubClient }) {
  const base = options.githubClient;

  return {
    async getAuthenticatedUser(input: unknown) {
      validateGetAuthenticatedUserInput(input);
      const client = base ?? createGitHubClient({ accessToken: options.accessToken, fetch: options.fetch, operation: "users.get" });
      const response = await client.fetchJSON("/user");
      const rate = parseGitHubRateLimit(response.status, response.headers);
      if (rate.limited) return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "GitHub rate limit exceeded", retryAfterSeconds: rate.retryAfterSeconds } };
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, user: normalizeGitHubUser(response.body as GitHubUser) };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: `GitHub users.get failed with status ${response.status}`, retryAfterSeconds: undefined as number | undefined } };
    },

    async getAuthenticated(input: unknown) {
      validateUsersGetAuthenticatedInput(input);
      const client = base ?? createGitHubClient({ accessToken: options.accessToken, fetch: options.fetch, operation: "users.get_authenticated" });
      const response = await client.fetchJSON("/user");
      const rate = parseGitHubRateLimit(response.status, response.headers);
      if (rate.limited) return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "GitHub rate limit exceeded", retryAfterSeconds: rate.retryAfterSeconds } };
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, user: normalizeGitHubUser(response.body as GitHubUser) };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: `GitHub users.get_authenticated failed with status ${response.status}`, retryAfterSeconds: undefined as number | undefined } };
    },

    async getByUsername(input: unknown) {
      const payload = validateGetUserByUsernameInput(input);
      const client = base ?? createGitHubClient({ accessToken: options.accessToken, fetch: options.fetch, operation: "users.get_by_username" });
      const response = await client.fetchJSON(`/users/${encodeURIComponent(payload.username)}`);
      const rate = parseGitHubRateLimit(response.status, response.headers);
      if (rate.limited) return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "GitHub rate limit exceeded", retryAfterSeconds: rate.retryAfterSeconds } };
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, user: normalizeGitHubUser(response.body as GitHubUser) };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: `GitHub users.get_by_username failed with status ${response.status}`, retryAfterSeconds: undefined as number | undefined } };
    },

    async listRepos(input: unknown) {
      const payload = validateListUserReposInput(input);
      const client = base ?? createGitHubClient({ accessToken: options.accessToken, fetch: options.fetch, operation: "users.repos.list" });
      const params = new URLSearchParams();
      if (payload.type) params.set("type", payload.type);
      if (payload.sort) params.set("sort", payload.sort);
      if (payload.direction) params.set("direction", payload.direction);
      if (payload.perPage) params.set("per_page", String(payload.perPage));
      if (payload.page) params.set("page", String(payload.page));
      const qs = params.toString();
      const path = `/users/${encodeURIComponent(payload.username)}/repos${qs ? `?${qs}` : ""}`;
      const response = await client.fetchJSON(path);
      const rate = parseGitHubRateLimit(response.status, response.headers);
      if (rate.limited) return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "GitHub rate limit exceeded", retryAfterSeconds: rate.retryAfterSeconds } };
      if (response.status === 200 && Array.isArray(response.body)) {
        const repos = (response.body as GitHubRepo[]).map(normalizeGitHubRepo);
        return { ok: true as const, repositories: repos };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: `GitHub users.repos.list failed with status ${response.status}`, retryAfterSeconds: undefined as number | undefined } };
    },
  };
}

function optionalPage(value: unknown, field: string, max = 100): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > max) {
    throw new Error(`${field} must be an integer between 1 and ${max}`);
  }
  return value;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${field} is required`);
  return value.trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
