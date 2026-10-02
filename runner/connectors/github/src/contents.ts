import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";

// ─── Input types & validators ─────────────────────────────────────────────────

export type PutContentsInput = {
  owner: string;
  repo: string;
  path: string;
  message: string;
  content: string;
  branch?: string;
  sha?: string;
  committerName?: string;
  committerEmail?: string;
  authorName?: string;
  authorEmail?: string;
};

export function validatePutContentsInput(input: unknown): PutContentsInput {
  if (!isRecord(input)) throw new Error("put contents input must be an object");
  // Accept `ref` as alias for `branch` so EffectPolicy Reconcile can reuse
  // contents.put input when calling repos.contents.get (which takes `ref`).
  const branchRaw = input.branch ?? input.ref;
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    path: requireString(input.path, "path"),
    message: requireString(input.message, "message"),
    content: requireString(input.content, "content"),
    branch: typeof branchRaw === "string" ? branchRaw : undefined,
    sha: typeof input.sha === "string" ? input.sha : undefined,
    committerName: typeof input.committerName === "string" ? input.committerName : undefined,
    committerEmail: typeof input.committerEmail === "string" ? input.committerEmail : undefined,
    authorName: typeof input.authorName === "string" ? input.authorName : undefined,
    authorEmail: typeof input.authorEmail === "string" ? input.authorEmail : undefined,
  };
}

export type DeleteContentsInput = {
  owner: string;
  repo: string;
  path: string;
  message: string;
  sha: string;
  branch?: string;
  committerName?: string;
  committerEmail?: string;
  authorName?: string;
  authorEmail?: string;
};

export function validateDeleteContentsInput(input: unknown): DeleteContentsInput {
  if (!isRecord(input)) throw new Error("delete contents input must be an object");
  const branchRaw = input.branch ?? input.ref;
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    path: requireString(input.path, "path"),
    message: requireString(input.message, "message"),
    sha: requireString(input.sha, "sha"),
    branch: typeof branchRaw === "string" ? branchRaw : undefined,
    committerName: typeof input.committerName === "string" ? input.committerName : undefined,
    committerEmail: typeof input.committerEmail === "string" ? input.committerEmail : undefined,
    authorName: typeof input.authorName === "string" ? input.authorName : undefined,
    authorEmail: typeof input.authorEmail === "string" ? input.authorEmail : undefined,
  };
}

export type PushFilesFile = {
  path: string;
  content: string;
  encoding?: "utf-8" | "base64";
};

export type PushFilesInput = {
  owner: string;
  repo: string;
  /** Branch name (also accepted as `ref` for Reconcile→commits.get). */
  branch: string;
  message: string;
  files: PushFilesFile[];
  /** Optional expected HEAD SHA; fails closed if branch tip differs. */
  expectedHeadSha?: string;
};

export function validatePushFilesInput(input: unknown): PushFilesInput {
  if (!isRecord(input)) throw new Error("push files input must be an object");
  const branchRaw = input.branch ?? input.ref;
  const filesRaw = input.files;
  if (!Array.isArray(filesRaw) || filesRaw.length === 0) {
    throw new Error("files must be a non-empty array");
  }
  const files: PushFilesFile[] = filesRaw.map((f, i) => {
    if (!isRecord(f)) throw new Error(`files[${i}] must be an object`);
    const encoding = f.encoding === "base64" ? "base64" : "utf-8";
    return {
      path: requireString(f.path, `files[${i}].path`),
      content: requireString(f.content, `files[${i}].content`),
      encoding,
    };
  });
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    branch: requireString(branchRaw, "branch"),
    message: requireString(input.message, "message"),
    files,
    expectedHeadSha: typeof input.expectedHeadSha === "string" ? input.expectedHeadSha : undefined,
  };
}


/** Encode each path segment so `?`, `#`, and spaces stay inside the path. */
function encodeRepoPath(path: string): string {
  return path.split("/").map((segment) => encodeURIComponent(segment)).join("/");
}

/**
 * Git ref endpoint wants `heads/main`, not `refs/heads/main`.
 * `refs/heads/main` → `heads/main`; `main` → `heads/main`.
 */
function gitRefPath(branch: string): string {
  const stripped = branch.startsWith("refs/") ? branch.slice("refs/".length) : `heads/${branch}`;
  return stripped.split("/").map((segment) => encodeURIComponent(segment)).join("/");
}

// ─── Client ───────────────────────────────────────────────────────────────────

export function createContentsClient(options: { accessToken: string; fetch?: typeof fetch; githubClient?: GitHubClient }) {
  const client = options.githubClient ?? createGitHubClient({ accessToken: options.accessToken, fetch: options.fetch, operation: "contents.put" });

  return {
    async put(input: unknown) {
      const payload = validatePutContentsInput(input);
      const body: Record<string, unknown> = {
        message: payload.message,
        content: payload.content,
      };
      if (payload.branch) body.branch = payload.branch;
      if (payload.sha) body.sha = payload.sha;
      if (payload.committerName || payload.committerEmail) {
        body.committer = {
          name: payload.committerName ?? "AppCall",
          email: payload.committerEmail ?? "appcall@users.noreply.github.com",
        };
      }
      if (payload.authorName || payload.authorEmail) {
        body.author = {
          name: payload.authorName ?? "AppCall",
          email: payload.authorEmail ?? "appcall@users.noreply.github.com",
        };
      }
      const response = await client.fetchJSON(`/repos/${payload.owner}/${payload.repo}/contents/${encodeRepoPath(payload.path)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.status === 200 || response.status === 201) {
        const raw = isRecord(response.body) ? response.body : {};
        const content = isRecord(raw.content) ? raw.content : {};
        const commit = isRecord(raw.commit) ? raw.commit : {};
        return {
          ok: true as const,
          content: {
            path: typeof content.path === "string" ? content.path : payload.path,
            sha: typeof content.sha === "string" ? content.sha : "",
            url: typeof content.html_url === "string" ? content.html_url : (typeof content.url === "string" ? content.url : ""),
            commitSha: typeof commit.sha === "string" ? commit.sha : "",
            modelVersion: "2026-05-16" as const,
            raw,
          },
        };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Repository or path not found." } };
      }
      if (response.status === 409) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Conflict updating file contents (sha mismatch)." } };
      }
      if (response.status === 422) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Validation failed for put contents." } };
      }
      return mapRateOrUpstream(response, "GitHub rejected the put contents request.");
    },

    async delete(input: unknown) {
      const payload = validateDeleteContentsInput(input);
      const body: Record<string, unknown> = {
        message: payload.message,
        sha: payload.sha,
      };
      if (payload.branch) body.branch = payload.branch;
      if (payload.committerName || payload.committerEmail) {
        body.committer = {
          name: payload.committerName ?? "AppCall",
          email: payload.committerEmail ?? "appcall@users.noreply.github.com",
        };
      }
      if (payload.authorName || payload.authorEmail) {
        body.author = {
          name: payload.authorName ?? "AppCall",
          email: payload.authorEmail ?? "appcall@users.noreply.github.com",
        };
      }
      const response = await client.fetchJSON(`/repos/${payload.owner}/${payload.repo}/contents/${encodeRepoPath(payload.path)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.status === 200) {
        const raw = isRecord(response.body) ? response.body : {};
        const commit = isRecord(raw.commit) ? raw.commit : {};
        return {
          ok: true as const,
          deleted: true as const,
          path: payload.path,
          commitSha: typeof commit.sha === "string" ? commit.sha : "",
          raw,
        };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "File or repository not found." } };
      }
      if (response.status === 409) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Conflict deleting file contents (sha mismatch)." } };
      }
      if (response.status === 422) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Validation failed for delete contents." } };
      }
      return mapRateOrUpstream(response, "GitHub rejected the delete contents request.");
    },

    /**
     * Multi-file commit via Git Data API composition:
     * get ref → get commit → create blobs → create tree → create commit → update ref.
     */
    async pushFiles(input: unknown) {
      const payload = validatePushFilesInput(input);
      const base = `/repos/${payload.owner}/${payload.repo}`;
      const refName = gitRefPath(payload.branch);

      // 1. Resolve current HEAD
      const refRes = await client.fetchJSON(`${base}/git/ref/${refName}`);
      if (refRes.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Branch ref not found." } };
      }
      if (refRes.status !== 200) {
        return mapRateOrUpstream(refRes, "GitHub rejected the get ref request.");
      }
      const refBody = isRecord(refRes.body) ? refRes.body : {};
      const refObj = isRecord(refBody.object) ? refBody.object : {};
      const headSha = typeof refObj.sha === "string" ? refObj.sha : "";
      if (!headSha) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Branch ref missing object sha." } };
      }
      if (payload.expectedHeadSha && payload.expectedHeadSha !== headSha) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "expectedHeadSha does not match branch tip." } };
      }

      // 2. Get commit for base tree
      const commitRes = await client.fetchJSON(`${base}/git/commits/${headSha}`);
      if (commitRes.status !== 200) {
        if (commitRes.status === 404) {
          return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Head commit not found." } };
        }
        return mapRateOrUpstream(commitRes, "GitHub rejected the get commit request.");
      }
      const commitBody = isRecord(commitRes.body) ? commitRes.body : {};
      const treeObj = isRecord(commitBody.tree) ? commitBody.tree : {};
      const baseTreeSha = typeof treeObj.sha === "string" ? treeObj.sha : "";
      if (!baseTreeSha) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Head commit missing tree sha." } };
      }

      // 3. Create blobs for each file
      const treeEntries: Array<{ path: string; mode: string; type: string; sha: string }> = [];
      for (const file of payload.files) {
        const blobBody = {
          content: file.content,
          encoding: file.encoding === "base64" ? "base64" : "utf-8",
        };
        const blobRes = await client.fetchJSON(`${base}/git/blobs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(blobBody),
        });
        if (blobRes.status !== 201) {
          if (blobRes.status === 404) {
            return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Repository not found while creating blob." } };
          }
          if (blobRes.status === 422) {
            return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Validation failed creating blob." } };
          }
          return mapRateOrUpstream(blobRes, "GitHub rejected the create blob request.");
        }
        const blob = isRecord(blobRes.body) ? blobRes.body : {};
        const blobSha = typeof blob.sha === "string" ? blob.sha : "";
        if (!blobSha) {
          return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Create blob response missing sha." } };
        }
        treeEntries.push({ path: file.path, mode: "100644", type: "blob", sha: blobSha });
      }

      // 4. Create tree
      const treeRes = await client.fetchJSON(`${base}/git/trees`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base_tree: baseTreeSha, tree: treeEntries }),
      });
      if (treeRes.status !== 201) {
        if (treeRes.status === 422) {
          return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Validation failed creating tree." } };
        }
        return mapRateOrUpstream(treeRes, "GitHub rejected the create tree request.");
      }
      const tree = isRecord(treeRes.body) ? treeRes.body : {};
      const newTreeSha = typeof tree.sha === "string" ? tree.sha : "";
      if (!newTreeSha) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Create tree response missing sha." } };
      }

      // 5. Create commit
      const newCommitRes = await client.fetchJSON(`${base}/git/commits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: payload.message,
          tree: newTreeSha,
          parents: [headSha],
        }),
      });
      if (newCommitRes.status !== 201) {
        if (newCommitRes.status === 422) {
          return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Validation failed creating commit." } };
        }
        return mapRateOrUpstream(newCommitRes, "GitHub rejected the create commit request.");
      }
      const newCommit = isRecord(newCommitRes.body) ? newCommitRes.body : {};
      const newCommitSha = typeof newCommit.sha === "string" ? newCommit.sha : "";
      if (!newCommitSha) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Create commit response missing sha." } };
      }

      // 6. Update ref
      const updateRefRes = await client.fetchJSON(`${base}/git/refs/${refName}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sha: newCommitSha, force: false }),
      });
      if (updateRefRes.status !== 200) {
        if (updateRefRes.status === 422) {
          return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Validation failed updating ref (non-fast-forward)." } };
        }
        return mapRateOrUpstream(updateRefRes, "GitHub rejected the update ref request.");
      }

      return {
        ok: true as const,
        commit: {
          sha: newCommitSha,
          message: payload.message,
          treeSha: newTreeSha,
          branch: payload.branch,
          files: payload.files.map((f) => f.path),
          url: typeof newCommit.html_url === "string" ? newCommit.html_url : (typeof newCommit.url === "string" ? newCommit.url : ""),
          modelVersion: "2026-05-16" as const,
          raw: newCommit,
        },
      };
    },
  };
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
