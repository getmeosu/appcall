import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";

// ─── Input types & validators ─────────────────────────────────────────────────

export type CreateBlobInput = {
  owner: string;
  repo: string;
  content: string;
  encoding?: "utf-8" | "base64";
};

export function validateCreateBlobInput(input: unknown): CreateBlobInput {
  if (!isRecord(input)) throw new Error("create blob input must be an object");
  const encoding = input.encoding === "base64" ? "base64" : "utf-8";
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    content: requireString(input.content, "content"),
    encoding,
  };
}

export type GetBlobInput = { owner: string; repo: string; fileSha: string };

export function validateGetBlobInput(input: unknown): GetBlobInput {
  if (!isRecord(input)) throw new Error("get blob input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    fileSha: requireString(input.fileSha ?? input.sha, "fileSha"),
  };
}

export type TreeEntryInput = {
  path: string;
  mode: string;
  type: string;
  sha?: string;
  content?: string;
};

export type CreateTreeInput = {
  owner: string;
  repo: string;
  tree: TreeEntryInput[];
  baseTree?: string;
};

export function validateCreateTreeInput(input: unknown): CreateTreeInput {
  if (!isRecord(input)) throw new Error("create tree input must be an object");
  if (!Array.isArray(input.tree) || input.tree.length === 0) {
    throw new Error("tree must be a non-empty array");
  }
  const tree: TreeEntryInput[] = input.tree.map((entry, i) => {
    if (!isRecord(entry)) throw new Error(`tree[${i}] must be an object`);
    const item: TreeEntryInput = {
      path: requireString(entry.path, `tree[${i}].path`),
      mode: requireString(entry.mode, `tree[${i}].mode`),
      type: requireString(entry.type, `tree[${i}].type`),
    };
    if (typeof entry.sha === "string") item.sha = entry.sha;
    if (typeof entry.content === "string") item.content = entry.content;
    if (!item.sha && item.content === undefined) {
      throw new Error(`tree[${i}] requires sha or content`);
    }
    return item;
  });
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    tree,
    baseTree: typeof input.baseTree === "string" ? input.baseTree : undefined,
  };
}

export type GetTreeInput = { owner: string; repo: string; treeSha: string; recursive?: boolean };

export function validateGetTreeInput(input: unknown): GetTreeInput {
  if (!isRecord(input)) throw new Error("get tree input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    treeSha: requireString(input.treeSha ?? input.sha, "treeSha"),
    recursive: typeof input.recursive === "boolean" ? input.recursive : undefined,
  };
}

export type CreateRefInput = { owner: string; repo: string; ref: string; sha: string };

export function validateCreateRefInput(input: unknown): CreateRefInput {
  if (!isRecord(input)) throw new Error("create ref input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    ref: requireString(input.ref, "ref"),
    sha: requireString(input.sha, "sha"),
  };
}

export type UpdateRefInput = {
  owner: string;
  repo: string;
  ref: string;
  sha: string;
  force?: boolean;
};

export function validateUpdateRefInput(input: unknown): UpdateRefInput {
  if (!isRecord(input)) throw new Error("update ref input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    ref: requireString(input.ref, "ref"),
    sha: requireString(input.sha, "sha"),
    force: typeof input.force === "boolean" ? input.force : undefined,
  };
}

export type ListRefsInput = {
  owner: string;
  repo: string;
  /** Prefix such as heads/ or tags/v1. Omitted lists every ref. */
  ref?: string;
  perPage?: number;
  page?: number;
};

export function validateListRefsInput(input: unknown): ListRefsInput {
  if (!isRecord(input)) throw new Error("git.refs.list input must be an object");
  const ref = typeof input.ref === "string" && input.ref.length > 0 ? input.ref : undefined;
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    ref,
    perPage: optionalPage(input.perPage, "perPage"),
    page: optionalPage(input.page, "page", 1_000_000),
  };
}

export type DeleteRefInput = { owner: string; repo: string; ref: string };

export function validateDeleteRefInput(input: unknown): DeleteRefInput {
  if (!isRecord(input)) throw new Error("git.refs.delete input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    ref: requireString(input.ref, "ref"),
  };
}

const TAG_OBJECT_TYPES = ["commit", "tree", "blob"] as const;

export type GetTagInput = { owner: string; repo: string; sha: string };

export function validateGetTagInput(input: unknown): GetTagInput {
  if (!isRecord(input)) throw new Error("git.tags.get input must be an object");
  const sha = firstString(input.sha, input.tagSha);
  if (!sha) throw new Error("sha is required");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    sha,
  };
}

export type CreateTagInput = {
  owner: string;
  repo: string;
  tag: string;
  message: string;
  object: string;
  type: string;
  taggerName: string;
  taggerEmail: string;
  taggerDate?: string;
  /** Tag object SHA for Reconcile via git.tags.get. Not sent on create. */
  sha?: string;
};

export function validateCreateTagInput(input: unknown): CreateTagInput {
  if (!isRecord(input)) throw new Error("git.tags.create input must be an object");
  const type = requireString(input.type, "type");
  if (!TAG_OBJECT_TYPES.includes(type as (typeof TAG_OBJECT_TYPES)[number])) {
    throw new Error("type must be commit, tree, or blob");
  }
  const sha = firstString(input.sha, input.tagSha);
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    tag: requireString(input.tag, "tag"),
    message: requireString(input.message, "message"),
    object: requireString(input.object, "object"),
    type,
    taggerName: requireString(input.taggerName, "taggerName"),
    taggerEmail: requireString(input.taggerEmail, "taggerEmail"),
    taggerDate: typeof input.taggerDate === "string" && input.taggerDate.length > 0 ? input.taggerDate : undefined,
    sha,
  };
}

export type GetRefInput = { owner: string; repo: string; ref: string };

export function validateGetRefInput(input: unknown): GetRefInput {
  if (!isRecord(input)) throw new Error("get ref input must be an object");
  return {
    owner: requirePathSegment(input.owner, "owner"),
    repo: requirePathSegment(input.repo, "repo"),
    ref: requireString(input.ref, "ref"),
  };
}

export type CreateGitCommitInput = {
  owner: string;
  repo: string;
  message: string;
  tree: string;
  parents?: string[];
  authorName?: string;
  authorEmail?: string;
  authorDate?: string;
  committerName?: string;
  committerEmail?: string;
  committerDate?: string;
};

export function validateCreateGitCommitInput(input: unknown): CreateGitCommitInput {
  if (!isRecord(input)) throw new Error("create git commit input must be an object");
  const parents = Array.isArray(input.parents)
    ? input.parents.filter((p): p is string => typeof p === "string" && p.length > 0)
    : undefined;
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    message: requireString(input.message, "message"),
    tree: requireString(input.tree, "tree"),
    parents,
    authorName: typeof input.authorName === "string" ? input.authorName : undefined,
    authorEmail: typeof input.authorEmail === "string" ? input.authorEmail : undefined,
    authorDate: typeof input.authorDate === "string" ? input.authorDate : undefined,
    committerName: typeof input.committerName === "string" ? input.committerName : undefined,
    committerEmail: typeof input.committerEmail === "string" ? input.committerEmail : undefined,
    committerDate: typeof input.committerDate === "string" ? input.committerDate : undefined,
  };
}


export type GetGitCommitInput = { owner: string; repo: string; commitSha: string };
export function validateGetGitCommitInput(input: unknown): GetGitCommitInput {
  if (!isRecord(input)) throw new Error("get git commit input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    commitSha: requireString(input.commitSha, "commitSha"),
  };
}

/** Normalize ref for URL path: refs/heads/x → heads/x; heads/x stays. */
export function normalizeRefPath(ref: string): string {
  return ref.startsWith("refs/") ? ref.slice("refs/".length) : ref;
}

/** Encode each ref segment so `?` and `#` cannot retarget the request. */
function encodeRefPath(ref: string): string {
  return normalizeRefPath(ref).split("/").map((segment) => encodeURIComponent(segment)).join("/");
}

// ─── Client ───────────────────────────────────────────────────────────────────

export function createGitClient(options: { accessToken: string; fetch?: typeof fetch; githubClient?: GitHubClient }) {
  const client = options.githubClient ?? createGitHubClient({ accessToken: options.accessToken, fetch: options.fetch, operation: "git.blobs.create" });

  return {
    async createBlob(input: unknown) {
      const payload = validateCreateBlobInput(input);
      const response = await client.fetchJSON(`/repos/${payload.owner}/${payload.repo}/git/blobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: payload.content, encoding: payload.encoding }),
      });
      if (response.status === 201) {
        const body = isRecord(response.body) ? response.body : {};
        return {
          ok: true as const,
          blob: {
            sha: typeof body.sha === "string" ? body.sha : "",
            url: typeof body.url === "string" ? body.url : "",
            modelVersion: "2026-05-16" as const,
            raw: body,
          },
        };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Repository not found." } };
      }
      if (response.status === 422) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Validation failed for create blob." } };
      }
      return mapRateOrUpstream(response, "GitHub rejected the create blob request.");
    },

    async getBlob(input: unknown) {
      const payload = validateGetBlobInput(input);
      const response = await client.fetchJSON(
        `/repos/${payload.owner}/${payload.repo}/git/blobs/${encodeURIComponent(payload.fileSha)}`
      );
      if (response.status === 200) {
        const body = isRecord(response.body) ? response.body : {};
        return {
          ok: true as const,
          blob: {
            sha: typeof body.sha === "string" ? body.sha : payload.fileSha,
            content: typeof body.content === "string" ? body.content : "",
            encoding: typeof body.encoding === "string" ? body.encoding : "",
            size: typeof body.size === "number" ? body.size : 0,
            url: typeof body.url === "string" ? body.url : "",
            modelVersion: "2026-05-16" as const,
            raw: body,
          },
        };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Blob not found." } };
      }
      return mapRateOrUpstream(response, "GitHub rejected the get blob request.");
    },

    async createTree(input: unknown) {
      const payload = validateCreateTreeInput(input);
      const body: Record<string, unknown> = {
        tree: payload.tree.map((e) => {
          const entry: Record<string, unknown> = { path: e.path, mode: e.mode, type: e.type };
          if (e.sha) entry.sha = e.sha;
          if (e.content !== undefined) entry.content = e.content;
          return entry;
        }),
      };
      if (payload.baseTree) body.base_tree = payload.baseTree;
      const response = await client.fetchJSON(`/repos/${payload.owner}/${payload.repo}/git/trees`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.status === 201) {
        const raw = isRecord(response.body) ? response.body : {};
        const tree = Array.isArray(raw.tree) ? raw.tree : [];
        return {
          ok: true as const,
          tree: {
            sha: typeof raw.sha === "string" ? raw.sha : "",
            url: typeof raw.url === "string" ? raw.url : "",
            truncated: raw.truncated === true,
            tree,
            modelVersion: "2026-05-16" as const,
            raw,
          },
        };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Repository not found." } };
      }
      if (response.status === 422) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Validation failed for create tree." } };
      }
      return mapRateOrUpstream(response, "GitHub rejected the create tree request.");
    },

    async getTree(input: unknown) {
      const payload = validateGetTreeInput(input);
      const params = new URLSearchParams();
      if (payload.recursive === true) params.set("recursive", "1");
      const qs = params.toString() ? `?${params.toString()}` : "";
      const response = await client.fetchJSON(
        `/repos/${payload.owner}/${payload.repo}/git/trees/${encodeURIComponent(payload.treeSha)}${qs}`
      );
      if (response.status === 200) {
        const raw = isRecord(response.body) ? response.body : {};
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
      return mapRateOrUpstream(response, "GitHub rejected the get tree request.");
    },

    async createRef(input: unknown) {
      const payload = validateCreateRefInput(input);
      const ref = payload.ref.startsWith("refs/") ? payload.ref : `refs/${payload.ref}`;
      const response = await client.fetchJSON(`/repos/${payload.owner}/${payload.repo}/git/refs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ref, sha: payload.sha }),
      });
      if (response.status === 201) {
        const body = isRecord(response.body) ? response.body : {};
        const obj = isRecord(body.object) ? body.object : {};
        return {
          ok: true as const,
          ref: {
            ref: typeof body.ref === "string" ? body.ref : ref,
            sha: typeof obj.sha === "string" ? obj.sha : payload.sha,
            url: typeof body.url === "string" ? body.url : "",
            modelVersion: "2026-05-16" as const,
            raw: body,
          },
        };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Repository not found." } };
      }
      if (response.status === 422) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Ref already exists or SHA is invalid." } };
      }
      return mapRateOrUpstream(response, "GitHub rejected the create ref request.");
    },

    async updateRef(input: unknown) {
      const payload = validateUpdateRefInput(input);
      const refPath = encodeRefPath(payload.ref);
      const body: Record<string, unknown> = { sha: payload.sha };
      if (payload.force !== undefined) body.force = payload.force;
      const response = await client.fetchJSON(`/repos/${payload.owner}/${payload.repo}/git/refs/${refPath}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.status === 200) {
        const raw = isRecord(response.body) ? response.body : {};
        const obj = isRecord(raw.object) ? raw.object : {};
        return {
          ok: true as const,
          ref: {
            ref: typeof raw.ref === "string" ? raw.ref : payload.ref,
            sha: typeof obj.sha === "string" ? obj.sha : payload.sha,
            url: typeof raw.url === "string" ? raw.url : "",
            modelVersion: "2026-05-16" as const,
            raw,
          },
        };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Ref not found." } };
      }
      if (response.status === 422) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Validation failed updating ref (non-fast-forward)." } };
      }
      return mapRateOrUpstream(response, "GitHub rejected the update ref request.");
    },

    async listRefs(input: unknown) {
      const payload = validateListRefsInput(input);
      const params = new URLSearchParams();
      if (payload.perPage) params.set("per_page", String(payload.perPage));
      if (payload.page) params.set("page", String(payload.page));
      const qs = params.toString() ? `?${params.toString()}` : "";
      // Prefix uses matching-refs. No prefix uses the repo refs list (GET /git/refs).
      const path = payload.ref
        ? `${repoPath(payload.owner, payload.repo)}/git/matching-refs/${encodeRefPath(payload.ref)}${qs}`
        : `${repoPath(payload.owner, payload.repo)}/git/refs${qs}`;
      const response = await client.fetchJSON(path);
      if (response.status === 200) {
        const items = Array.isArray(response.body)
          ? response.body
          : isRecord(response.body) ? [response.body] : [];
        return { ok: true as const, refs: items.filter(isRecord).map(normalizeListedRef) };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Not found for git.refs.list." } };
      }
      return mapRateOrUpstream(response, "GitHub rejected the git.refs.list request.");
    },

    async deleteRef(input: unknown) {
      const payload = validateDeleteRefInput(input);
      // GitHub wants heads/... or tags/..., never a leading refs/.
      const response = await client.fetchJSON(
        `${repoPath(payload.owner, payload.repo)}/git/refs/${encodeRefPath(payload.ref)}`,
        { method: "DELETE" },
      );
      if (response.status === 204) {
        return { ok: true as const, deleted: true as const, ref: normalizeRefPath(payload.ref) };
      }
      // Same as contents.delete: 404 is an upstream error, not a second success.
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Ref not found." } };
      }
      return mapRateOrUpstream(response, "GitHub rejected the git.refs.delete request.");
    },

    async getTag(input: unknown) {
      const payload = validateGetTagInput(input);
      const response = await client.fetchJSON(
        `${repoPath(payload.owner, payload.repo)}/git/tags/${encodeURIComponent(payload.sha)}`,
      );
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, tag: normalizeGitTag(response.body) };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Tag not found." } };
      }
      return mapRateOrUpstream(response, "GitHub rejected the git.tags.get request.");
    },

    async createTag(input: unknown) {
      const payload = validateCreateTagInput(input);
      // sha/tagSha is only for Reconcile → git.tags.get. A retry must not POST another tag object
      // on the observe path; this POST never sends the tag-object SHA.
      const body: Record<string, unknown> = {
        tag: payload.tag,
        message: payload.message,
        object: payload.object,
        type: payload.type,
        tagger: {
          name: payload.taggerName,
          email: payload.taggerEmail,
          ...(payload.taggerDate ? { date: payload.taggerDate } : {}),
        },
      };
      const response = await client.fetchJSON(`${repoPath(payload.owner, payload.repo)}/git/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.status === 201 && isRecord(response.body)) {
        return { ok: true as const, tag: normalizeGitTag(response.body) };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Repository not found." } };
      }
      if (response.status === 422) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Validation failed for create tag." } };
      }
      return mapRateOrUpstream(response, "GitHub rejected the git.tags.create request.");
    },

    async getRef(input: unknown) {
      const payload = validateGetRefInput(input);
      const refPath = encodeRefPath(payload.ref);
      const response = await client.fetchJSON(`/repos/${encodeURIComponent(payload.owner)}/${encodeURIComponent(payload.repo)}/git/ref/${refPath}`);
      if (response.status === 200) {
        const raw = isRecord(response.body) ? response.body : {};
        const obj = isRecord(raw.object) ? raw.object : {};
        return {
          ok: true as const,
          ref: {
            ref: typeof raw.ref === "string" ? raw.ref : payload.ref,
            sha: typeof obj.sha === "string" ? obj.sha : "",
            url: typeof raw.url === "string" ? raw.url : "",
            modelVersion: "2026-05-16" as const,
            raw,
          },
        };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Ref not found." } };
      }
      return mapRateOrUpstream(response, "GitHub rejected the get ref request.");
    },


    async getCommit(input: unknown) {
      const payload = validateGetGitCommitInput(input);
      const response = await client.fetchJSON(
        `${repoPath(payload.owner, payload.repo)}/git/commits/${encodeURIComponent(payload.commitSha)}`,
      );
      if (response.status === 200 && isRecord(response.body)) {
        const raw = response.body;
        const tree = isRecord(raw.tree) ? raw.tree : {};
        const parents = Array.isArray(raw.parents) ? raw.parents.filter(isRecord) : [];
        return {
          ok: true as const,
          commit: {
            sha: typeof raw.sha === "string" ? raw.sha : payload.commitSha,
            message: typeof raw.message === "string" ? raw.message : "",
            treeSha: typeof tree.sha === "string" ? tree.sha : "",
            url: typeof raw.html_url === "string" ? raw.html_url : (typeof raw.url === "string" ? raw.url : ""),
            parents: parents.map((parent) => (typeof parent.sha === "string" ? parent.sha : "")),
            modelVersion: "2026-05-16" as const,
            raw,
          },
        };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Git commit not found." } };
      }
      return mapRateOrUpstream(response, "GitHub rejected the git.commits.get request.");
    },

    async createCommit(input: unknown) {
      const payload = validateCreateGitCommitInput(input);
      const body: Record<string, unknown> = {
        message: payload.message,
        tree: payload.tree,
      };
      if (payload.parents) body.parents = payload.parents;
      if (payload.authorName || payload.authorEmail || payload.authorDate) {
        body.author = {
          name: payload.authorName ?? "AppCall",
          email: payload.authorEmail ?? "appcall@users.noreply.github.com",
          ...(payload.authorDate ? { date: payload.authorDate } : {}),
        };
      }
      if (payload.committerName || payload.committerEmail || payload.committerDate) {
        body.committer = {
          name: payload.committerName ?? "AppCall",
          email: payload.committerEmail ?? "appcall@users.noreply.github.com",
          ...(payload.committerDate ? { date: payload.committerDate } : {}),
        };
      }
      const response = await client.fetchJSON(`/repos/${payload.owner}/${payload.repo}/git/commits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.status === 201) {
        const raw = isRecord(response.body) ? response.body : {};
        const tree = isRecord(raw.tree) ? raw.tree : {};
        return {
          ok: true as const,
          commit: {
            sha: typeof raw.sha === "string" ? raw.sha : "",
            message: typeof raw.message === "string" ? raw.message : payload.message,
            treeSha: typeof tree.sha === "string" ? tree.sha : payload.tree,
            url: typeof raw.html_url === "string" ? raw.html_url : (typeof raw.url === "string" ? raw.url : ""),
            modelVersion: "2026-05-16" as const,
            raw,
          },
        };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Repository not found." } };
      }
      if (response.status === 422) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Validation failed for create commit." } };
      }
      return mapRateOrUpstream(response, "GitHub rejected the create commit request.");
    },
  };
}

function repoPath(owner: string, repo: string): string {
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

function normalizeListedRef(raw: Record<string, unknown>) {
  const obj = isRecord(raw.object) ? raw.object : {};
  return {
    ref: typeof raw.ref === "string" ? raw.ref : "",
    sha: typeof obj.sha === "string" ? obj.sha : "",
    url: typeof raw.url === "string" ? raw.url : "",
  };
}

function normalizeGitTag(raw: Record<string, unknown>) {
  const obj = isRecord(raw.object) ? raw.object : {};
  return {
    sha: typeof raw.sha === "string" ? raw.sha : "",
    tag: typeof raw.tag === "string" ? raw.tag : "",
    message: typeof raw.message === "string" ? raw.message : "",
    objectSha: typeof obj.sha === "string" ? obj.sha : "",
    objectType: typeof obj.type === "string" ? obj.type : "",
    url: typeof raw.url === "string" ? raw.url : "",
    modelVersion: "2026-05-16" as const,
    raw,
  };
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

function optionalPage(value: unknown, field: string, max = 100): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > max) {
    throw new Error(`${field} must be an integer between 1 and ${max}`);
  }
  return value;
}

function mapRateOrUpstream(response: { status: number; headers: Record<string, string> }, message: string) {
  if (response.status === 429 || (response.status === 403 && parseGitHubRateLimit(response.status, response.headers).limited)) {
    const rateLimit = parseGitHubRateLimit(response.status, response.headers);
    return {
      ok: false as const,
      error: {
        code: "CONNECTOR_RATE_LIMITED",
        message: "GitHub rate limit exceeded.",
        retryAfterSeconds: rateLimit.limited ? rateLimit.retryAfterSeconds : undefined,
      },
    };
  }
  return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message } };
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function requirePathSegment(value: unknown, field: string): string {
  const text = requireString(value, field);
  if (text === "." || text === ".." || !/^[A-Za-z0-9._-]+$/.test(text)) {
    throw new Error(`${field} must be a single path segment`);
  }
  return text;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
