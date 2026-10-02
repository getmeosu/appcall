import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";
import { normalizeGitHubRepo, type GitHubRepo } from "./repos";
import { normalizeGitHubUser, type GitHubUser, type NormalizedUser } from "./users";

export type GitHubOrg = {
  id: number;
  login: string;
  description?: string | null;
  html_url?: string;
  url?: string;
  avatar_url?: string;
  name?: string | null;
  company?: string | null;
  blog?: string | null;
  location?: string | null;
  email?: string | null;
  public_repos?: number;
  followers?: number;
  following?: number;
  created_at?: string;
  updated_at?: string;
  type?: string;
};

export type NormalizedOrg = {
  id: string;
  provider: "github";
  providerOrgId: number;
  login: string;
  name: string;
  description: string;
  url: string;
  avatarUrl: string;
  company: string;
  blog: string;
  location: string;
  email: string;
  publicRepos: number;
  createdAt: string;
  updatedAt: string;
  modelVersion: "2026-05-16";
  raw: Record<string, unknown>;
};

export function normalizeGitHubOrg(org: GitHubOrg): NormalizedOrg {
  return {
    id: `gh-org:${org.id}`,
    provider: "github",
    providerOrgId: org.id,
    login: typeof org.login === "string" ? org.login : "",
    name: typeof org.name === "string" ? org.name : "",
    description: typeof org.description === "string" ? org.description : "",
    url: typeof org.html_url === "string" ? org.html_url : (typeof org.url === "string" ? org.url : ""),
    avatarUrl: typeof org.avatar_url === "string" ? org.avatar_url : "",
    company: typeof org.company === "string" ? org.company : "",
    blog: typeof org.blog === "string" ? org.blog : "",
    location: typeof org.location === "string" ? org.location : "",
    email: typeof org.email === "string" ? org.email : "",
    publicRepos: typeof org.public_repos === "number" ? org.public_repos : 0,
    createdAt: typeof org.created_at === "string" ? org.created_at : "",
    updatedAt: typeof org.updated_at === "string" ? org.updated_at : "",
    modelVersion: "2026-05-16",
    raw: org as unknown as Record<string, unknown>,
  };
}

export type GetOrgInput = { org: string };
export function validateGetOrgInput(input: unknown): GetOrgInput {
  if (!isRecord(input)) throw new Error("orgs.get input must be an object");
  return { org: requireString(input.org, "org") };
}

export type ListOrgsInput = { perPage?: number; page?: number };
export function validateListOrgsInput(input: unknown): ListOrgsInput {
  if (input === undefined || input === null) return {};
  if (!isRecord(input)) throw new Error("orgs.list input must be an object");
  return {
    perPage: optionalPage(input.perPage, "perPage"),
    page: optionalPage(input.page, "page", 1_000_000),
  };
}

export type ListOrgMembersInput = {
  org: string;
  role?: string;
  perPage?: number;
  page?: number;
};
export function validateListOrgMembersInput(input: unknown): ListOrgMembersInput {
  if (!isRecord(input)) throw new Error("orgs.members.list input must be an object");
  const role = typeof input.role === "string" ? input.role : undefined;
  if (role !== undefined && role !== "all" && role !== "admin" && role !== "member") {
    throw new Error("role must be all, admin, or member");
  }
  return {
    org: requireString(input.org, "org"),
    role,
    perPage: optionalPage(input.perPage, "perPage"),
    page: optionalPage(input.page, "page", 1_000_000),
  };
}

export type ListOrgReposInput = {
  org: string;
  type?: string;
  sort?: string;
  direction?: string;
  perPage?: number;
  page?: number;
};
export function validateListOrgReposInput(input: unknown): ListOrgReposInput {
  if (!isRecord(input)) throw new Error("orgs.repos.list input must be an object");
  const type = typeof input.type === "string" ? input.type : undefined;
  if (type !== undefined && !["all", "public", "private", "forks", "sources", "member"].includes(type)) {
    throw new Error("type must be all, public, private, forks, sources, or member");
  }
  const direction = typeof input.direction === "string" ? input.direction : undefined;
  if (direction !== undefined && direction !== "asc" && direction !== "desc") {
    throw new Error("direction must be asc or desc");
  }
  return {
    org: requireString(input.org, "org"),
    type,
    sort: typeof input.sort === "string" ? input.sort : undefined,
    direction,
    perPage: optionalPage(input.perPage, "perPage"),
    page: optionalPage(input.page, "page", 1_000_000),
  };
}

export function createOrgsClient(options: { accessToken: string; fetch?: typeof fetch; githubClient?: GitHubClient }) {
  const base = options.githubClient;
  return {
    async get(input: unknown) {
      const payload = validateGetOrgInput(input);
      const client = base ?? createGitHubClient({ accessToken: options.accessToken, fetch: options.fetch, operation: "orgs.get" });
      const response = await client.fetchJSON(`/orgs/${encodeURIComponent(payload.org)}`);
      const rate = parseGitHubRateLimit(response.status, response.headers);
      if (rate.limited) return { ok: false as const, error: { code: "rate_limited", message: "GitHub rate limit exceeded", retryAfterSeconds: rate.retryAfterSeconds } };
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, organization: normalizeGitHubOrg(response.body as GitHubOrg) };
      }
      return { ok: false as const, error: { code: "upstream", message: `GitHub orgs.get failed with status ${response.status}`, retryAfterSeconds: undefined as number | undefined } };
    },

    async list(input: unknown) {
      const payload = validateListOrgsInput(input);
      const client = base ?? createGitHubClient({ accessToken: options.accessToken, fetch: options.fetch, operation: "orgs.list" });
      const params = new URLSearchParams();
      if (payload.perPage) params.set("per_page", String(payload.perPage));
      if (payload.page) params.set("page", String(payload.page));
      const qs = params.toString();
      const response = await client.fetchJSON(`/user/orgs${qs ? `?${qs}` : ""}`);
      const rate = parseGitHubRateLimit(response.status, response.headers);
      if (rate.limited) return { ok: false as const, error: { code: "rate_limited", message: "GitHub rate limit exceeded", retryAfterSeconds: rate.retryAfterSeconds } };
      if (response.status === 200 && Array.isArray(response.body)) {
        return { ok: true as const, organizations: (response.body as GitHubOrg[]).map(normalizeGitHubOrg) };
      }
      return { ok: false as const, error: { code: "upstream", message: `GitHub orgs.list failed with status ${response.status}`, retryAfterSeconds: undefined as number | undefined } };
    },

    async listMembers(input: unknown) {
      const payload = validateListOrgMembersInput(input);
      const client = base ?? createGitHubClient({ accessToken: options.accessToken, fetch: options.fetch, operation: "orgs.members.list" });
      const params = new URLSearchParams();
      if (payload.role) params.set("role", payload.role);
      if (payload.perPage) params.set("per_page", String(payload.perPage));
      if (payload.page) params.set("page", String(payload.page));
      const qs = params.toString();
      const path = `/orgs/${encodeURIComponent(payload.org)}/members${qs ? `?${qs}` : ""}`;
      const response = await client.fetchJSON(path);
      const rate = parseGitHubRateLimit(response.status, response.headers);
      if (rate.limited) return { ok: false as const, error: { code: "rate_limited", message: "GitHub rate limit exceeded", retryAfterSeconds: rate.retryAfterSeconds } };
      if (response.status === 200 && Array.isArray(response.body)) {
        const members: NormalizedUser[] = (response.body as GitHubUser[]).map(normalizeGitHubUser);
        return { ok: true as const, members };
      }
      return { ok: false as const, error: { code: "upstream", message: `GitHub orgs.members.list failed with status ${response.status}`, retryAfterSeconds: undefined as number | undefined } };
    },

    async listRepos(input: unknown) {
      const payload = validateListOrgReposInput(input);
      const client = base ?? createGitHubClient({ accessToken: options.accessToken, fetch: options.fetch, operation: "orgs.repos.list" });
      const params = new URLSearchParams();
      if (payload.type) params.set("type", payload.type);
      if (payload.sort) params.set("sort", payload.sort);
      if (payload.direction) params.set("direction", payload.direction);
      if (payload.perPage) params.set("per_page", String(payload.perPage));
      if (payload.page) params.set("page", String(payload.page));
      const qs = params.toString();
      const path = `/orgs/${encodeURIComponent(payload.org)}/repos${qs ? `?${qs}` : ""}`;
      const response = await client.fetchJSON(path);
      const rate = parseGitHubRateLimit(response.status, response.headers);
      if (rate.limited) return { ok: false as const, error: { code: "rate_limited", message: "GitHub rate limit exceeded", retryAfterSeconds: rate.retryAfterSeconds } };
      if (response.status === 200 && Array.isArray(response.body)) {
        return { ok: true as const, repositories: (response.body as GitHubRepo[]).map(normalizeGitHubRepo) };
      }
      return { ok: false as const, error: { code: "upstream", message: `GitHub orgs.repos.list failed with status ${response.status}`, retryAfterSeconds: undefined as number | undefined } };
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
