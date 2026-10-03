import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";

// ─── Types ───────────────────────────────────────────────────────────────────

export type GitHubBranch = {
  name: string;
  commit?: { sha?: string; url?: string };
  protected?: boolean;
  [key: string]: unknown;
};

export type NormalizedBranch = {
  name: string;
  sha: string;
  protected: boolean;
  commitUrl: string;
  modelVersion: "2026-05-16";
  raw: GitHubBranch;
};

export function normalizeGitHubBranch(branch: GitHubBranch): NormalizedBranch {
  return {
    name: branch.name ?? "",
    sha: branch.commit?.sha ?? "",
    protected: branch.protected ?? false,
    commitUrl: branch.commit?.url ?? "",
    modelVersion: "2026-05-16",
    raw: branch,
  };
}

// ─── Input types & validators ─────────────────────────────────────────────────

export type GetBranchInput = { owner: string; repo: string; branch: string };

export function validateGetBranchInput(input: unknown): GetBranchInput {
  if (!isRecord(input)) throw new Error("get branch input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    branch: requireString(input.branch, "branch"),
  };
}

export type CreateBranchInput = { owner: string; repo: string; branch: string; sha: string };

export function validateCreateBranchInput(input: unknown): CreateBranchInput {
  if (!isRecord(input)) throw new Error("create branch input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    branch: requireString(input.branch, "branch"),
    sha: requireString(input.sha, "sha"),
  };
}


export type ListBranchesInput = { owner: string; repo: string; protected?: boolean; perPage?: number; page?: number };

export type DeleteBranchInput = { owner: string; repo: string; branch: string };

export function validateDeleteBranchInput(input: unknown): DeleteBranchInput {
  if (!isRecord(input)) throw new Error("delete branch input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    branch: requireString(input.branch, "branch"),
  };
}

export function validateListBranchesInput(input: unknown): ListBranchesInput {
  if (!isRecord(input)) throw new Error("list branches input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    protected: typeof input.protected === "boolean" ? input.protected : undefined,
    perPage: typeof input.perPage === "number" ? input.perPage : undefined,
    page: typeof input.page === "number" ? input.page : undefined,
  };
}

export type MergeUpstreamInput = { owner: string; repo: string; branch: string };

export function validateMergeUpstreamInput(input: unknown): MergeUpstreamInput {
  if (!isRecord(input)) throw new Error("repos.merge_upstream input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    branch: requireString(input.branch, "branch"),
  };
}

export type RenameBranchInput = { owner: string; repo: string; branch: string; newName: string };

export function validateRenameBranchInput(input: unknown): RenameBranchInput {
  if (!isRecord(input)) throw new Error("branches.rename input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    branch: requireString(input.branch, "branch"),
    newName: requireString(input.newName, "newName"),
  };
}

// ─── Client ───────────────────────────────────────────────────────────────────

export function createBranchesClient(options: { accessToken: string; fetch?: typeof fetch; githubClient?: GitHubClient }) {
  const client = options.githubClient ?? createGitHubClient({ accessToken: options.accessToken, fetch: options.fetch, operation: "branches.get" });

  const api = {
    async list(input: unknown) {
      const payload = validateListBranchesInput(input);
      const params = new URLSearchParams();
      if (payload.protected !== undefined) params.set("protected", String(payload.protected));
      if (payload.perPage) params.set("per_page", String(payload.perPage));
      if (payload.page) params.set("page", String(payload.page));
      const qs = params.toString() ? `?${params.toString()}` : "";
      const response = await client.fetchJSON(`/repos/${payload.owner}/${payload.repo}/branches${qs}`);
      if (response.status === 200) {
        const branches = Array.isArray(response.body) ? (response.body as GitHubBranch[]).map(normalizeGitHubBranch) : [];
        return { ok: true as const, branches };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Repository not found." } };
      }
      if (response.status === 429 || (response.status === 403 && parseGitHubRateLimit(response.status, response.headers).limited)) {
        const rateLimit = parseGitHubRateLimit(response.status, response.headers);
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "GitHub rate limit exceeded.", retryAfterSeconds: rateLimit.limited ? rateLimit.retryAfterSeconds : undefined } };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "GitHub rejected the list branches request." } };
    },

    async get(input: unknown) {
      const payload = validateGetBranchInput(input);
      const response = await client.fetchJSON(`/repos/${payload.owner}/${payload.repo}/branches/${encodeURIComponent(payload.branch)}`);
      if (response.status === 200) {
        return { ok: true as const, found: true as const, branch: normalizeGitHubBranch(response.body as GitHubBranch) };
      }
      // GitHub says "Branch not found" for a missing ref and "Not Found" when the repo is missing.
      // Only the branch case is a soft not-found so delete Reconcile does not confirm a missing repo.
      if (response.status === 404) {
        const message = isRecord(response.body) && typeof response.body.message === "string" ? response.body.message : "";
        if (message.toLowerCase().includes("branch not found")) {
          return { ok: true as const, found: false as const, branch: null, name: payload.branch };
        }
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Repository not found." } };
      }
      if (response.status === 429 || (response.status === 403 && parseGitHubRateLimit(response.status, response.headers).limited)) {
        const rateLimit = parseGitHubRateLimit(response.status, response.headers);
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "GitHub rate limit exceeded.", retryAfterSeconds: rateLimit.limited ? rateLimit.retryAfterSeconds : undefined } };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "GitHub rejected the get branch request." } };
    },

    async create(input: unknown) {
      const payload = validateCreateBranchInput(input);
      const response = await client.fetchJSON(`/repos/${payload.owner}/${payload.repo}/git/refs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ref: `refs/heads/${payload.branch}`,
          sha: payload.sha,
        }),
      });
      if (response.status === 201) {
        const body = response.body as Record<string, unknown>;
        const refObj = isRecord(body.object) ? body.object : {};
        return {
          ok: true as const,
          branch: {
            name: payload.branch,
            ref: typeof body.ref === "string" ? body.ref : `refs/heads/${payload.branch}`,
            sha: typeof refObj.sha === "string" ? refObj.sha : payload.sha,
            url: typeof body.url === "string" ? body.url : "",
          },
        };
      }
      if (response.status === 422) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Branch already exists or SHA is invalid." } };
      }
      if (response.status === 429 || (response.status === 403 && parseGitHubRateLimit(response.status, response.headers).limited)) {
        const rateLimit = parseGitHubRateLimit(response.status, response.headers);
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "GitHub rate limit exceeded.", retryAfterSeconds: rateLimit.limited ? rateLimit.retryAfterSeconds : undefined } };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "GitHub rejected the create branch request." } };
    },

    async delete(input: unknown) {
      const payload = validateDeleteBranchInput(input);
      const ref = payload.branch.split("/").map((part) => encodeURIComponent(part)).join("/");
      const response = await client.fetchJSON(`/repos/${payload.owner}/${payload.repo}/git/refs/heads/${ref}`, {
        method: "DELETE",
      });
      if (response.status === 204) {
        return { ok: true as const, deleted: true as const, branch: payload.branch };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Branch not found." } };
      }
      if (response.status === 422) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Branch is protected or cannot be deleted." } };
      }
      if (response.status === 429 || (response.status === 403 && parseGitHubRateLimit(response.status, response.headers).limited)) {
        const rateLimit = parseGitHubRateLimit(response.status, response.headers);
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "GitHub rate limit exceeded.", retryAfterSeconds: rateLimit.limited ? rateLimit.retryAfterSeconds : undefined } };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "GitHub rejected the delete branch request." } };
    },

    async mergeUpstream(input: unknown) {
      const payload = validateMergeUpstreamInput(input);
      const response = await client.fetchJSON(`/repos/${payload.owner}/${payload.repo}/merge-upstream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branch: payload.branch }),
      });
      // 409 does not converge. Do not retry it as success.
      if (response.status === 409) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Merge conflict. A conflict does not converge." } };
      }
      if (response.status === 422) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "The branch could not be synced." } };
      }
      if (response.status === 200 && isRecord(response.body)) {
        // Handler read of the tip via branches.get. Not a retry key and not desired state.
        const tip = await api.get({ owner: payload.owner, repo: payload.repo, branch: payload.branch });
        const sha = tip.ok && tip.found && tip.branch ? tip.branch.sha : "";
        return {
          ok: true as const,
          synced: true as const,
          message: typeof response.body.message === "string" ? response.body.message : "",
          mergeType: typeof response.body.merge_type === "string" ? response.body.merge_type : "",
          baseBranch: typeof response.body.base_branch === "string" ? response.body.base_branch : "",
          sha,
        };
      }
      if (response.status === 429 || (response.status === 403 && parseGitHubRateLimit(response.status, response.headers).limited)) {
        const rateLimit = parseGitHubRateLimit(response.status, response.headers);
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "GitHub rate limit exceeded.", retryAfterSeconds: rateLimit.limited ? rateLimit.retryAfterSeconds : undefined } };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "GitHub rejected the merge upstream request." } };
    },

    async rename(input: unknown) {
      const payload = validateRenameBranchInput(input);
      const response = await client.fetchJSON(
        `/repos/${payload.owner}/${payload.repo}/branches/${encodeURIComponent(payload.branch)}/rename`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ new_name: payload.newName }),
        },
      );
      // A second POST on the old name is 404, not a no-op.
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Branch not found." } };
      }
      if (response.status === 422) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Validation failed for rename branch." } };
      }
      if (response.status === 201) {
        const created = isRecord(response.body) ? normalizeGitHubBranch(response.body as GitHubBranch) : null;
        // branches.get of the new name stays in the handler only.
        const tip = await api.get({ owner: payload.owner, repo: payload.repo, branch: payload.newName });
        const sha = tip.ok && tip.found && tip.branch ? tip.branch.sha : (created?.sha ?? "");
        return { ok: true as const, renamed: true as const, name: payload.newName, sha };
      }
      if (response.status === 429 || (response.status === 403 && parseGitHubRateLimit(response.status, response.headers).limited)) {
        const rateLimit = parseGitHubRateLimit(response.status, response.headers);
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "GitHub rate limit exceeded.", retryAfterSeconds: rateLimit.limited ? rateLimit.retryAfterSeconds : undefined } };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "GitHub rejected the rename branch request." } };
    },
  };
  return api;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
