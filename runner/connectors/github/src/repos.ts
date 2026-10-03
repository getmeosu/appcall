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
  // repos.update Reconcile reuses its input. `name` is the post-rename repository name.
  // orgs.repos.create Reconcile reuses {org, name}: org is the owner when owner is absent.
  const renamed = typeof input.name === "string" && input.name.length > 0 ? input.name : undefined;
  const ownerRaw = typeof input.owner === "string" && input.owner.length > 0 ? input.owner : input.org;
  return {
    owner: requireString(ownerRaw, "owner"),
    repo: requireString(renamed ?? input.repo, "repo"),
  };
}

export type UpdateRepoInput = {
  owner: string;
  repo: string;
  name?: string;
  description?: string;
  homepage?: string;
  private?: boolean;
  visibility?: string;
  defaultBranch?: string;
  hasIssues?: boolean;
  hasWiki?: boolean;
  hasProjects?: boolean;
  archived?: boolean;
  deleteBranchOnMerge?: boolean;
};

export function validateUpdateRepoInput(input: unknown): UpdateRepoInput {
  if (!isRecord(input)) throw new Error("update repo input must be an object");
  const visibility = typeof input.visibility === "string" ? input.visibility : undefined;
  if (visibility !== undefined && !["public", "private", "internal"].includes(visibility)) {
    throw new Error("visibility must be public, private, or internal");
  }
  const payload: UpdateRepoInput = {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    name: typeof input.name === "string" && input.name.length > 0 ? input.name : undefined,
    description: typeof input.description === "string" ? input.description : undefined,
    homepage: typeof input.homepage === "string" ? input.homepage : undefined,
    private: typeof input.private === "boolean" ? input.private : undefined,
    visibility,
    defaultBranch: typeof input.defaultBranch === "string" && input.defaultBranch.length > 0 ? input.defaultBranch : undefined,
    hasIssues: typeof input.hasIssues === "boolean" ? input.hasIssues : undefined,
    hasWiki: typeof input.hasWiki === "boolean" ? input.hasWiki : undefined,
    hasProjects: typeof input.hasProjects === "boolean" ? input.hasProjects : undefined,
    archived: typeof input.archived === "boolean" ? input.archived : undefined,
    deleteBranchOnMerge: typeof input.deleteBranchOnMerge === "boolean" ? input.deleteBranchOnMerge : undefined,
  };
  const mutable = ["name", "description", "homepage", "private", "visibility", "defaultBranch", "hasIssues", "hasWiki", "hasProjects", "archived", "deleteBranchOnMerge"] as const;
  if (!mutable.some((key) => payload[key] !== undefined)) {
    throw new Error("at least one repository field is required");
  }
  return payload;
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
  // repos.contents.put / repos.contents.delete write `branch` (and only fall back to `ref`).
  // Reconcile reuses that input, so `branch` wins when both differ.
  const refRaw = input.branch ?? input.ref;
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    path: requireString(input.path, "path"),
    ref: typeof refRaw === "string" ? refRaw : undefined,
  };
}

export type GetRepoTreeInput = { owner: string; repo: string; treeSha: string; recursive?: boolean };

export function validateGetRepoTreeInput(input: unknown): GetRepoTreeInput {
  if (!isRecord(input)) throw new Error("get repo tree input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    treeSha: requireString(input.treeSha ?? input.sha, "treeSha"),
    recursive: typeof input.recursive === "boolean" ? input.recursive : undefined,
  };
}


export type CompareCommitsInput = { owner: string; repo: string; base: string; head: string; page?: number; perPage?: number };

export function validateCompareCommitsInput(input: unknown): CompareCommitsInput {
  if (!isRecord(input)) throw new Error("compare commits input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    base: requireString(input.base, "base"),
    head: requireString(input.head, "head"),
    page: typeof input.page === "number" ? input.page : undefined,
    perPage: typeof input.perPage === "number" ? input.perPage : undefined,
  };
}

// ─── Client ───────────────────────────────────────────────────────────────────

export function createReposClient(options: { accessToken: string; fetch?: typeof fetch; githubClient?: GitHubClient }) {
  const client = options.githubClient ?? createGitHubClient({ accessToken: options.accessToken, fetch: options.fetch, operation: "repos.get" });

  return {
    async compare(input: unknown) {
      const payload = validateCompareCommitsInput(input);
      const params = new URLSearchParams();
      if (payload.perPage) params.set("per_page", String(payload.perPage));
      if (payload.page) params.set("page", String(payload.page));
      const qs = params.toString() ? `?${params.toString()}` : "";
      const base = encodeURIComponent(payload.base);
      const head = encodeURIComponent(payload.head);
      const response = await client.fetchJSON(`/repos/${payload.owner}/${payload.repo}/compare/${base}...${head}${qs}`);
      if (response.status === 200) {
        const body = (response.body && typeof response.body === "object") ? response.body as Record<string, unknown> : {};
        const files = Array.isArray(body.files) ? body.files : [];
        const commits = Array.isArray(body.commits) ? body.commits : [];
        return {
          ok: true as const,
          comparison: {
            url: typeof body.html_url === "string" ? body.html_url : (typeof body.url === "string" ? body.url : ""),
            status: typeof body.status === "string" ? body.status : "",
            aheadBy: typeof body.ahead_by === "number" ? body.ahead_by : 0,
            behindBy: typeof body.behind_by === "number" ? body.behind_by : 0,
            totalCommits: typeof body.total_commits === "number" ? body.total_commits : commits.length,
            commits: commits,
            files: files,
            baseCommit: body.base_commit ?? null,
            mergeBaseCommit: body.merge_base_commit ?? null,
            permalinkUrl: typeof body.permalink_url === "string" ? body.permalink_url : "",
            modelVersion: "2026-05-16" as const,
            raw: body,
          },
        };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Repository or comparison refs not found." } };
      }
      if (response.status === 429 || (response.status === 403 && parseGitHubRateLimit(response.status, response.headers).limited)) {
        const rateLimit = parseGitHubRateLimit(response.status, response.headers);
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "GitHub rate limit exceeded.", retryAfterSeconds: rateLimit.limited ? rateLimit.retryAfterSeconds : undefined } };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "GitHub rejected the compare request." } };
    },

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

    async update(input: unknown) {
      const payload = validateUpdateRepoInput(input);
      const body: Record<string, unknown> = {};
      if (payload.name !== undefined) body.name = payload.name;
      if (payload.description !== undefined) body.description = payload.description;
      if (payload.homepage !== undefined) body.homepage = payload.homepage;
      if (payload.private !== undefined) body.private = payload.private;
      if (payload.visibility !== undefined) body.visibility = payload.visibility;
      if (payload.defaultBranch !== undefined) body.default_branch = payload.defaultBranch;
      if (payload.hasIssues !== undefined) body.has_issues = payload.hasIssues;
      if (payload.hasWiki !== undefined) body.has_wiki = payload.hasWiki;
      if (payload.hasProjects !== undefined) body.has_projects = payload.hasProjects;
      if (payload.archived !== undefined) body.archived = payload.archived;
      if (payload.deleteBranchOnMerge !== undefined) body.delete_branch_on_merge = payload.deleteBranchOnMerge;
      const response = await client.fetchJSON(`/repos/${payload.owner}/${payload.repo}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.status === 200) {
        return { ok: true as const, repo: normalizeGitHubRepo(response.body as GitHubRepo) };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Repository not found." } };
      }
      if (response.status === 422) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Repository update validation failed." } };
      }
      if (response.status === 429 || (response.status === 403 && parseGitHubRateLimit(response.status, response.headers).limited)) {
        const rateLimit = parseGitHubRateLimit(response.status, response.headers);
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "GitHub rate limit exceeded.", retryAfterSeconds: rateLimit.limited ? rateLimit.retryAfterSeconds : undefined } };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "GitHub rejected the update repo request." } };
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
      const encodedPath = payload.path.split("/").map((segment) => encodeURIComponent(segment)).join("/");
      const response = await client.fetchJSON(`/repos/${payload.owner}/${payload.repo}/contents/${encodedPath}${qs}`);
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

    async getTree(input: unknown) {
      const payload = validateGetRepoTreeInput(input);
      const params = new URLSearchParams();
      if (payload.recursive === true) params.set("recursive", "1");
      const qs = params.toString() ? `?${params.toString()}` : "";
      const response = await client.fetchJSON(
        `/repos/${payload.owner}/${payload.repo}/git/trees/${encodeURIComponent(payload.treeSha)}${qs}`
      );
      if (response.status === 200) {
        const raw = (response.body && typeof response.body === "object") ? response.body as Record<string, unknown> : {};
        const tree = Array.isArray(raw.tree) ? raw.tree : [];
        return {
          ok: true as const,
          tree: {
            sha: typeof raw.sha === "string" ? raw.sha : payload.treeSha,
            url: typeof raw.url === "string" ? raw.url : "",
            truncated: raw.truncated === true,
            tree,
            modelVersion: "2026-05-16" as const,
            raw,
          },
        };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Tree not found." } };
      }
      if (response.status === 422) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Tree SHA is invalid." } };
      }
      if (response.status === 429 || (response.status === 403 && parseGitHubRateLimit(response.status, response.headers).limited)) {
        const rateLimit = parseGitHubRateLimit(response.status, response.headers);
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "GitHub rate limit exceeded.", retryAfterSeconds: rateLimit.limited ? rateLimit.retryAfterSeconds : undefined } };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "GitHub rejected the get tree request." } };
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
