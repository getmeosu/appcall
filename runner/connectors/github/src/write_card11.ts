import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";

type Repo = { owner: string; repo: string };
type PullReviewCommentReactionDelete = Repo & { commentId: number; reactionId: number };
type OrgRunner = { org: string; runnerId: number };
type RepoRunner = Repo & { runnerId: number };
type FollowUser = { username: string };

export function validateDeletePullReviewCommentReactionInput(input: unknown): PullReviewCommentReactionDelete {
  if (!isRecord(input)) throw new Error("pull_requests.review_comments.reactions.delete input must be an object");
  return {
    ...repo(input),
    commentId: requireId(input.commentId ?? input.comment_id, "commentId"),
    reactionId: requireId(input.reactionId ?? input.reaction_id, "reactionId"),
  };
}

export function validateDeleteOrgActionsRunnerInput(input: unknown): OrgRunner {
  if (!isRecord(input)) throw new Error("orgs.actions.runners.delete input must be an object");
  return {
    org: requireSingleSegment(input.org, "org"),
    runnerId: requireId(input.runnerId ?? input.runner_id, "runnerId"),
  };
}

export function validateDeleteRepoActionsRunnerInput(input: unknown): RepoRunner {
  if (!isRecord(input)) throw new Error("repos.actions.runners.delete input must be an object");
  return {
    ...repo(input),
    runnerId: requireId(input.runnerId ?? input.runner_id, "runnerId"),
  };
}

export function validateFollowUserInput(input: unknown): FollowUser {
  if (!isRecord(input)) throw new Error("user.following.follow input must be an object");
  return { username: requireSingleSegment(input.username, "username") };
}

export function createWriteCard11Client(options: { accessToken: string; fetch?: typeof fetch; githubClient?: GitHubClient }) {
  const base = options.githubClient;
  const clientFor = (operation: string) => base ?? createGitHubClient({
    accessToken: options.accessToken,
    fetch: options.fetch,
    operation,
  });

  return {
    async deletePullReviewCommentReaction(input: unknown) {
      const payload = validateDeletePullReviewCommentReactionInput(input);
      const response = await clientFor("pull_requests.review_comments.reactions.delete").fetchJSON(
        `/repos/${seg(payload.owner)}/${seg(payload.repo)}/pulls/comments/${payload.commentId}/reactions/${payload.reactionId}`,
        { method: "DELETE" },
      );
      return noContent(
        response,
        204,
        {
          deleted: true,
          owner: payload.owner,
          repo: payload.repo,
          commentId: payload.commentId,
          reactionId: payload.reactionId,
        },
        "Pull request review comment reaction was not found.",
        "GitHub rejected the delete pull request review comment reaction request.",
      );
    },
    async deleteOrgActionsRunner(input: unknown) {
      const payload = validateDeleteOrgActionsRunnerInput(input);
      const response = await clientFor("orgs.actions.runners.delete").fetchJSON(
        `/orgs/${seg(payload.org)}/actions/runners/${payload.runnerId}`,
        { method: "DELETE" },
      );
      return noContent(
        response,
        204,
        { deleted: true, org: payload.org, runnerId: payload.runnerId },
        "Organization self-hosted runner was not found.",
        "GitHub rejected the delete organization self-hosted runner request.",
      );
    },
    async deleteRepoActionsRunner(input: unknown) {
      const payload = validateDeleteRepoActionsRunnerInput(input);
      const response = await clientFor("repos.actions.runners.delete").fetchJSON(
        `/repos/${seg(payload.owner)}/${seg(payload.repo)}/actions/runners/${payload.runnerId}`,
        { method: "DELETE" },
      );
      return noContent(
        response,
        204,
        { deleted: true, owner: payload.owner, repo: payload.repo, runnerId: payload.runnerId },
        "Repository self-hosted runner was not found.",
        "GitHub rejected the delete repository self-hosted runner request.",
      );
    },
    async followUser(input: unknown) {
      const payload = validateFollowUserInput(input);
      const response = await clientFor("user.following.follow").fetchJSON(
        `/user/following/${seg(payload.username)}`,
        { method: "PUT" },
      );
      return noContent(
        response,
        204,
        { followed: true, username: payload.username },
        "User was not found.",
        "GitHub rejected the follow user request.",
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

function repo(input: Record<string, unknown>): Repo {
  return {
    owner: requireSingleSegment(input.owner, "owner"),
    repo: requireSingleSegment(input.repo, "repo"),
  };
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
