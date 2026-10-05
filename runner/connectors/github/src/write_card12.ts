import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";

type UnfollowUser = { username: string };
type GistId = { gistId: string };
type GistCommentCreate = GistId & { body: string };
type GistCommentRef = GistId & { commentId: number };
type GistCommentUpdate = GistCommentRef & { body: string };

export function validateUnfollowUserInput(input: unknown): UnfollowUser {
  if (!isRecord(input)) throw new Error("user.following.unfollow input must be an object");
  return { username: requireSingleSegment(input.username, "username") };
}

export function validateCreateGistCommentInput(input: unknown): GistCommentCreate {
  if (!isRecord(input)) throw new Error("gists.comments.create input must be an object");
  const body = input.body;
  if (typeof body !== "string" || body.length === 0) throw new Error("body is required");
  return {
    gistId: requireSingleSegment(input.gistId ?? input.gist_id, "gistId"),
    body,
  };
}

export function validateDeleteGistCommentInput(input: unknown): GistCommentRef {
  if (!isRecord(input)) throw new Error("gists.comments.delete input must be an object");
  return {
    gistId: requireSingleSegment(input.gistId ?? input.gist_id, "gistId"),
    commentId: requireId(input.commentId ?? input.comment_id, "commentId"),
  };
}

export function validateUpdateGistCommentInput(input: unknown): GistCommentUpdate {
  if (!isRecord(input)) throw new Error("gists.comments.update input must be an object");
  const body = input.body;
  if (typeof body !== "string" || body.length === 0) throw new Error("body is required");
  return {
    gistId: requireSingleSegment(input.gistId ?? input.gist_id, "gistId"),
    commentId: requireId(input.commentId ?? input.comment_id, "commentId"),
    body,
  };
}

export function validateCreateGistForkInput(input: unknown): GistId {
  if (!isRecord(input)) throw new Error("gists.forks.create input must be an object");
  return { gistId: requireSingleSegment(input.gistId ?? input.gist_id, "gistId") };
}

export function validateStarGistInput(input: unknown): GistId {
  if (!isRecord(input)) throw new Error("gists.star input must be an object");
  return { gistId: requireSingleSegment(input.gistId ?? input.gist_id, "gistId") };
}

export function validateUnstarGistInput(input: unknown): GistId {
  if (!isRecord(input)) throw new Error("gists.unstar input must be an object");
  return { gistId: requireSingleSegment(input.gistId ?? input.gist_id, "gistId") };
}

export function createWriteCard12Client(options: { accessToken: string; fetch?: typeof fetch; githubClient?: GitHubClient }) {
  const base = options.githubClient;
  const clientFor = (operation: string) => base ?? createGitHubClient({
    accessToken: options.accessToken,
    fetch: options.fetch,
    operation,
  });

  return {
    async unfollowUser(input: unknown) {
      const payload = validateUnfollowUserInput(input);
      const response = await clientFor("user.following.unfollow").fetchJSON(
        `/user/following/${seg(payload.username)}`,
        { method: "DELETE" },
      );
      return noContent(
        response,
        204,
        { unfollowed: true, username: payload.username },
        "User was not found.",
        "GitHub rejected the unfollow user request.",
      );
    },
    async createGistComment(input: unknown) {
      const payload = validateCreateGistCommentInput(input);
      const response = await clientFor("gists.comments.create").fetchJSON(
        `/gists/${seg(payload.gistId)}/comments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: payload.body }),
        },
      );
      return jsonBody(
        response,
        [201],
        "comment",
        "Gist was not found.",
        "GitHub rejected the create gist comment request.",
      );
    },
    async deleteGistComment(input: unknown) {
      const payload = validateDeleteGistCommentInput(input);
      const response = await clientFor("gists.comments.delete").fetchJSON(
        `/gists/${seg(payload.gistId)}/comments/${payload.commentId}`,
        { method: "DELETE" },
      );
      return noContent(
        response,
        204,
        { deleted: true, gistId: payload.gistId, commentId: payload.commentId },
        "Gist comment was not found.",
        "GitHub rejected the delete gist comment request.",
      );
    },
    async updateGistComment(input: unknown) {
      const payload = validateUpdateGistCommentInput(input);
      const response = await clientFor("gists.comments.update").fetchJSON(
        `/gists/${seg(payload.gistId)}/comments/${payload.commentId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: payload.body }),
        },
      );
      return jsonBody(
        response,
        [200],
        "comment",
        "Gist comment was not found.",
        "GitHub rejected the update gist comment request.",
      );
    },
    async createGistFork(input: unknown) {
      const payload = validateCreateGistForkInput(input);
      const response = await clientFor("gists.forks.create").fetchJSON(
        `/gists/${seg(payload.gistId)}/forks`,
        { method: "POST" },
      );
      return jsonBody(
        response,
        [201],
        "gist",
        "Gist was not found.",
        "GitHub rejected the fork gist request.",
      );
    },
    async starGist(input: unknown) {
      const payload = validateStarGistInput(input);
      const response = await clientFor("gists.star").fetchJSON(
        `/gists/${seg(payload.gistId)}/star`,
        { method: "PUT" },
      );
      return noContent(
        response,
        204,
        { starred: true, gistId: payload.gistId },
        "Gist was not found.",
        "GitHub rejected the star gist request.",
      );
    },
    async unstarGist(input: unknown) {
      const payload = validateUnstarGistInput(input);
      const response = await clientFor("gists.unstar").fetchJSON(
        `/gists/${seg(payload.gistId)}/star`,
        { method: "DELETE" },
      );
      return noContent(
        response,
        204,
        { unstarred: true, gistId: payload.gistId },
        "Gist was not found.",
        "GitHub rejected the unstar gist request.",
      );
    },
  };
}

function noContent(
  response: { status: number; headers: Record<string, string> },
  success: number,
  value: Record<string, unknown>,
  missing: string,
  rejected: string,
) {
  if (response.status === success) return { ok: true as const, ...value };
  if (response.status === 404) return upstream(missing);
  return mapRateOrUpstream(response, rejected);
}

function jsonBody(
  response: { status: number; headers: Record<string, string>; body: unknown },
  success: number[],
  key: string,
  missing: string,
  rejected: string,
) {
  if (success.includes(response.status) && isRecord(response.body)) {
    return { ok: true as const, [key]: response.body };
  }
  if (response.status === 404) return upstream(missing);
  return mapRateOrUpstream(response, rejected);
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

function seg(value: string): string {
  return encodeURIComponent(value);
}

function requireSingleSegment(value: unknown, field: string): string {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
