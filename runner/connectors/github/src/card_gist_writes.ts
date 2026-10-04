import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";

type GistId = { gistId: string };
type GistCommentId = GistId & { commentId: number };
type GistCommentBody = GistId & { body: string };
type GistCommentUpdate = GistCommentId & { body: string };

export type NormalizedGistComment = { id: number; body: string; user: string; createdAt: string };
export type NormalizedGist = { id: string; description: string; public: boolean; owner: string };

export function validateCreateGistCommentInput(input: unknown): GistCommentBody {
  const record = requireObject(input, "gists.comments.create");
  return { ...gistId(record), body: requireBody(record.body) };
}

export function validateUpdateGistCommentInput(input: unknown): GistCommentUpdate {
  const record = requireObject(input, "gists.comments.update");
  return { ...gistCommentId(record), body: requireBody(record.body) };
}

export function validateDeleteGistCommentInput(input: unknown): GistCommentId {
  const record = requireObject(input, "gists.comments.delete");
  return gistCommentId(record);
}

export function validateForkGistInput(input: unknown): GistId {
  const record = requireObject(input, "gists.fork");
  return gistId(record);
}

export function validateStarGistInput(input: unknown): GistId {
  const record = requireObject(input, "gists.star");
  return gistId(record);
}

export function validateUnstarGistInput(input: unknown): GistId {
  const record = requireObject(input, "gists.unstar");
  return gistId(record);
}

export function createGistWritesClient(options: { accessToken: string; fetch?: typeof fetch; githubClient?: GitHubClient }) {
  const client = options.githubClient ?? createGitHubClient({
    accessToken: options.accessToken,
    fetch: options.fetch,
    operation: "gists.comments.create",
  });

  return {
    async createComment(input: unknown) {
      const payload = validateCreateGistCommentInput(input);
      const response = await client.fetchJSON(`/gists/${seg(payload.gistId)}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: payload.body }),
      });
      const limited = rate(response.status, response.headers);
      if (limited) return limited;
      if (response.status === 404) return upstream("Gist not found.");
      if (response.status === 201 && isRecord(response.body)) {
        return { ok: true as const, comment: normalizeGistComment(response.body) };
      }
      return upstream("GitHub rejected the gists.comments.create request.");
    },

    async updateComment(input: unknown) {
      const payload = validateUpdateGistCommentInput(input);
      const response = await client.fetchJSON(`/gists/${seg(payload.gistId)}/comments/${payload.commentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: payload.body }),
      });
      const limited = rate(response.status, response.headers);
      if (limited) return limited;
      if (response.status === 404) return upstream("Gist comment not found.");
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, comment: normalizeGistComment(response.body) };
      }
      return upstream("GitHub rejected the gists.comments.update request.");
    },

    async deleteComment(input: unknown) {
      const payload = validateDeleteGistCommentInput(input);
      const response = await client.fetchJSON(`/gists/${seg(payload.gistId)}/comments/${payload.commentId}`, {
        method: "DELETE",
      });
      const limited = rate(response.status, response.headers);
      if (limited) return limited;
      if (response.status === 204) {
        return { ok: true as const, deleted: true as const, gistId: payload.gistId, commentId: payload.commentId };
      }
      if (response.status === 404) return upstream("Gist comment not found.");
      return upstream("GitHub rejected the gists.comments.delete request.");
    },

    async fork(input: unknown) {
      const payload = validateForkGistInput(input);
      const response = await client.fetchJSON(`/gists/${seg(payload.gistId)}/forks`, { method: "POST" });
      const limited = rate(response.status, response.headers);
      if (limited) return limited;
      if (response.status === 404) return upstream("Gist not found.");
      if ((response.status === 201 || response.status === 200) && isRecord(response.body)) {
        return { ok: true as const, gist: normalizeGist(response.body) };
      }
      return upstream("GitHub rejected the gists.fork request.");
    },

    async star(input: unknown) {
      const payload = validateStarGistInput(input);
      const response = await client.fetchJSON(`/gists/${seg(payload.gistId)}/star`, {
        method: "PUT",
        headers: { "Content-Length": "0" },
      });
      const limited = rate(response.status, response.headers);
      if (limited) return limited;
      if (response.status === 204 || response.status === 200) {
        return { ok: true as const, starred: true as const, gistId: payload.gistId };
      }
      if (response.status === 404) return upstream("Gist not found.");
      return upstream("GitHub rejected the gists.star request.");
    },

    async unstar(input: unknown) {
      const payload = validateUnstarGistInput(input);
      const response = await client.fetchJSON(`/gists/${seg(payload.gistId)}/star`, { method: "DELETE" });
      const limited = rate(response.status, response.headers);
      if (limited) return limited;
      if (response.status === 204 || response.status === 200 || response.status === 404) {
        return { ok: true as const, starred: false as const, gistId: payload.gistId };
      }
      return upstream("GitHub rejected the gists.unstar request.");
    },
  };
}

function normalizeGistComment(item: Record<string, unknown>): NormalizedGistComment {
  const user = isRecord(item.user) ? item.user : {};
  return {
    id: typeof item.id === "number" ? item.id : 0,
    body: typeof item.body === "string" ? item.body : "",
    user: typeof user.login === "string" ? user.login : "",
    createdAt: typeof item.created_at === "string" ? item.created_at : "",
  };
}

function normalizeGist(item: Record<string, unknown>): NormalizedGist {
  const owner = isRecord(item.owner) ? item.owner : {};
  return {
    id: typeof item.id === "string" ? item.id : "",
    description: typeof item.description === "string" ? item.description : "",
    public: item.public === true,
    owner: typeof owner.login === "string" ? owner.login : "",
  };
}

function rate(status: number, headers: Record<string, string>) {
  if (status === 429 || (status === 403 && parseGitHubRateLimit(status, headers).limited)) {
    const parsed = parseGitHubRateLimit(status, headers);
    return {
      ok: false as const,
      error: {
        code: "CONNECTOR_RATE_LIMITED" as const,
        message: "GitHub rate limit exceeded.",
        retryAfterSeconds: parsed.limited ? parsed.retryAfterSeconds : undefined,
      },
    };
  }
  return null;
}

function upstream(message: string) {
  return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message } };
}

function gistId(input: Record<string, unknown>): GistId {
  return { gistId: segment(input.gistId ?? input.gist_id, "gist_id") };
}

function gistCommentId(input: Record<string, unknown>): GistCommentId {
  return { ...gistId(input), commentId: requireId(input.commentId ?? input.comment_id, "comment_id") };
}

function requireBody(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) throw new Error("body is required");
  return value;
}

function requireObject(input: unknown, action: string): Record<string, unknown> {
  if (!isRecord(input)) throw new Error(`${action} input must be an object`);
  return input;
}

function segment(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  if (value.includes("/") || value.includes("?") || value.includes("#")) {
    throw new Error(`${field} must be a single path segment`);
  }
  return value;
}

function requireId(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${field} must be a positive integer`);
  }
  return value;
}

function seg(value: string): string {
  return encodeURIComponent(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
