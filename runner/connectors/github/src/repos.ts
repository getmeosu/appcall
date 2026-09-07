import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";

// ─── Types ───────────────────────────────────────────────────────────────────

export type GitHubRepo = {
  id: number;
  name: string;
  full_name: string;
  private?: boolean;
  html_url?: string;
  description?: string;
  fork?: boolean;
  url?: string;
  clone_url?: string;
  ssh_url?: string;
  default_branch?: string;
  language?: string;
  stargazers_count?: number;
  forks_count?: number;
  open_issues_count?: number;
  visibility?: string;
  owner?: { login?: string; id?: number };
  created_at?: string;
  updated_at?: string;
  pushed_at?: string;
  [key: string]: unknown;
};

export type NormalizedRepo = {
  id: string;
  provider: "github";
  providerRepoId: number;
  name: string;
  fullName: string;
  private: boolean;
  url: string;
  description: string;
  fork: boolean;
  cloneUrl: string;
  sshUrl: string;
  defaultBranch: string;
  language: string;
  stars: number;
  forks: number;
  openIssues: number;
  visibility: string;
  owner: string;
  createdAt: string;
  updatedAt: string;
  pushedAt: string;
  modelVersion: "2026-05-16";
  raw: GitHubRepo;
};

export function normalizeGitHubRepo(repo: GitHubRepo): NormalizedRepo {
  return {
    id: `gh-repo:${repo.id}`,
    provider: "github",
    providerRepoId: repo.id,
    name: repo.name ?? "",
    fullName: repo.full_name ?? "",
    private: repo.private ?? false,
    url: repo.html_url ?? "",
    description: repo.description ?? "",
    fork: repo.fork ?? false,
    cloneUrl: repo.clone_url ?? "",
    sshUrl: repo.ssh_url ?? "",
    defaultBranch: repo.default_branch ?? "main",
    language: repo.language ?? "",
    stars: repo.stargazers_count ?? 0,
    forks: repo.forks_count ?? 0,
    openIssues: repo.open_issues_count ?? 0,
    visibility: repo.visibility ?? (repo.private ? "private" : "public"),
    owner: repo.owner?.login ?? "",
    createdAt: repo.created_at ?? "",
    updatedAt: repo.updated_at ?? "",
    pushedAt: repo.pushed_at ?? "",
    modelVersion: "2026-05-16",
    raw: repo,
  };
}

// ─── Input types & validators ─────────────────────────────────────────────────

export type GetRepoInput = { owner: string; repo: string };

export function validateGetRepoInput(input: unknown): GetRepoInput {
  if (!isRecord(input)) throw new Error("get repo input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
  };
}

export type CreateRepoInput = {
  name: string;
  description?: string;
  private?: boolean;
  autoInit?: boolean;
  gitignoreTemplate?: string;
  licenseTemplate?: string;
};

export function validateCreateRepoInput(input: unknown): CreateRepoInput {
  if (!isRecord(input)) throw new Error("create repo input must be an object");
  return {
    name: requireString(input.name, "name"),
    description: typeof input.description === "string" ? input.description : undefined,
    private: typeof input.private === "boolean" ? input.private : undefined,
    autoInit: typeof input.autoInit === "boolean" ? input.autoInit : undefined,
    gitignoreTemplate: typeof input.gitignoreTemplate === "string" ? input.gitignoreTemplate : undefined,
    licenseTemplate: typeof input.licenseTemplate === "string" ? input.licenseTemplate : undefined,
  };
}

export type ListReposInput = { type?: string; sort?: string; perPage?: number; page?: number };

export function validateListReposInput(input: unknown): ListReposInput {
  if (!isRecord(input)) throw new Error("list repos input must be an object");
  return {
    type: typeof input.type === "string" ? input.type : undefined,
    sort: typeof input.sort === "string" ? input.sort : undefined,
    perPage: typeof input.perPage === "number" ? input.perPage : undefined,
    page: typeof input.page === "number" ? input.page : undefined,
  };
}

export type GetRepoContentsInput = { owner: string; repo: string; path: string; ref?: string };

export function validateGetRepoContentsInput(input: unknown): GetRepoContentsInput {
  if (!isRecord(input)) throw new Error("get repo contents input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    path: requireString(input.path, "path"),
    ref: typeof input.ref === "string" ? input.ref : undefined,
  };
}

// ─── Client ───────────────────────────────────────────────────────────────────

export function createReposClient(options: { accessToken: string; fetch?: typeof fetch; githubClient?: GitHubClient }) {
  const client = options.githubClient ?? createGitHubClient({ accessToken: options.accessToken, fetch: options.fetch, operation: "repos.get" });

  return {
    async get(input: unknown) {
      const payload = validateGetRepoInput(input);
      const response = await client.fetchJSON(`/repos/${payload.owner}/${payload.repo}`);
      if (response.status === 200) {
        return { ok: true as const, repo: normalizeGitHubRepo(response.body as GitHubRepo) };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Repository not found." } };
      }
      if (response.status === 429 || (response.status === 403 && parseGitHubRateLimit(response.status, response.headers).limited)) {
        const rateLimit = parseGitHubRateLimit(response.status, response.headers);
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "GitHub rate limit exceeded.", retryAfterSeconds: rateLimit.limited ? rateLimit.retryAfterSeconds : undefined } };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "GitHub rejected the get repo request." } };
    },

    async create(input: unknown) {
      const payload = validateCreateRepoInput(input);
      const response = await client.fetchJSON("/user/repos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: payload.name,
          description: payload.description,
          private: payload.private,
          auto_init: payload.autoInit,
          gitignore_template: payload.gitignoreTemplate,
          license_template: payload.licenseTemplate,
        }),
      });
      if (response.status === 201) {
        return { ok: true as const, repo: normalizeGitHubRepo(response.body as GitHubRepo) };
      }
      if (response.status === 422) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Repository name already exists or validation failed." } };
      }
      if (response.status === 429 || (response.status === 403 && parseGitHubRateLimit(response.status, response.headers).limited)) {
        const rateLimit = parseGitHubRateLimit(response.status, response.headers);
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "GitHub rate limit exceeded.", retryAfterSeconds: rateLimit.limited ? rateLimit.retryAfterSeconds : undefined } };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "GitHub rejected the create repo request." } };
    },

    async list(input: unknown) {
      const payload = validateListReposInput(input);
      const params = new URLSearchParams();
      if (payload.type) params.set("type", payload.type);
      if (payload.sort) params.set("sort", payload.sort);
      if (payload.perPage) params.set("per_page", String(payload.perPage));
      if (payload.page) params.set("page", String(payload.page));
      const qs = params.toString() ? `?${params.toString()}` : "";
      const response = await client.fetchJSON(`/user/repos${qs}`);
      if (response.status === 200) {
        const repos = Array.isArray(response.body) ? (response.body as GitHubRepo[]).map(normalizeGitHubRepo) : [];
        return { ok: true as const, repos };
      }
      if (response.status === 429 || (response.status === 403 && parseGitHubRateLimit(response.status, response.headers).limited)) {
        const rateLimit = parseGitHubRateLimit(response.status, response.headers);
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "GitHub rate limit exceeded.", retryAfterSeconds: rateLimit.limited ? rateLimit.retryAfterSeconds : undefined } };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "GitHub rejected the list repos request." } };
    },

    async getContents(input: unknown) {
      const payload = validateGetRepoContentsInput(input);
      const params = new URLSearchParams();
      if (payload.ref) params.set("ref", payload.ref);
      const qs = params.toString() ? `?${params.toString()}` : "";
      const response = await client.fetchJSON(`/repos/${payload.owner}/${payload.repo}/contents/${payload.path}${qs}`);
      if (response.status === 200) {
        return { ok: true as const, contents: response.body };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "File or directory not found." } };
      }
      if (response.status === 429 || (response.status === 403 && parseGitHubRateLimit(response.status, response.headers).limited)) {
        const rateLimit = parseGitHubRateLimit(response.status, response.headers);
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "GitHub rate limit exceeded.", retryAfterSeconds: rateLimit.limited ? rateLimit.retryAfterSeconds : undefined } };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "GitHub rejected the get contents request." } };
    },
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
