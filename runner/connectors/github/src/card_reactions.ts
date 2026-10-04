import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";

const REACTION_CONTENTS = ["+1", "-1", "laugh", "confused", "heart", "hooray", "rocket", "eyes"] as const;
const RELEASE_REACTION_CONTENTS = ["+1", "laugh", "heart", "hooray", "rocket", "eyes"] as const;

type ReactionContent = (typeof REACTION_CONTENTS)[number];
type ReleaseReactionContent = (typeof RELEASE_REACTION_CONTENTS)[number];

export type CreateCommentReactionInput = {
  owner: string;
  repo: string;
  commentId: number;
  content: ReactionContent;
};

export type DeleteCommentReactionInput = {
  owner: string;
  repo: string;
  commentId: number;
  reactionId: number;
};

export type CreateIssueReactionInput = {
  owner: string;
  repo: string;
  issueNumber: number;
  content: ReactionContent;
};

export type DeleteIssueReactionInput = {
  owner: string;
  repo: string;
  issueNumber: number;
  reactionId: number;
};

export type CreateReleaseReactionInput = {
  owner: string;
  repo: string;
  releaseId: number;
  content: ReleaseReactionContent;
};

export type DeleteReleaseReactionInput = {
  owner: string;
  repo: string;
  releaseId: number;
  reactionId: number;
};

export type NormalizedReaction = {
  id: number;
  content: string;
  createdAt: string;
  userLogin: string;
};

export function validateCreateCommitCommentReactionInput(input: unknown): CreateCommentReactionInput {
  if (!isRecord(input)) throw new Error("reactions.commit_comment.create input must be an object");
  return commentCreate(input, REACTION_CONTENTS);
}

export function validateDeleteCommitCommentReactionInput(input: unknown): DeleteCommentReactionInput {
  if (!isRecord(input)) throw new Error("reactions.commit_comment.delete input must be an object");
  return commentDelete(input);
}

export function validateCreateIssueCommentReactionInput(input: unknown): CreateCommentReactionInput {
  if (!isRecord(input)) throw new Error("reactions.issue_comment.create input must be an object");
  return commentCreate(input, REACTION_CONTENTS);
}

export function validateDeleteIssueCommentReactionInput(input: unknown): DeleteCommentReactionInput {
  if (!isRecord(input)) throw new Error("reactions.issue_comment.delete input must be an object");
  return commentDelete(input);
}

export function validateCreatePullRequestCommentReactionInput(input: unknown): CreateCommentReactionInput {
  if (!isRecord(input)) throw new Error("reactions.pull_request_comment.create input must be an object");
  return commentCreate(input, REACTION_CONTENTS);
}

export function validateDeletePullRequestCommentReactionInput(input: unknown): DeleteCommentReactionInput {
  if (!isRecord(input)) throw new Error("reactions.pull_request_comment.delete input must be an object");
  return commentDelete(input);
}

export function validateCreateIssueReactionInput(input: unknown): CreateIssueReactionInput {
  if (!isRecord(input)) throw new Error("reactions.issue.create input must be an object");
  return {
    ...repoScope(input),
    issueNumber: requireId(input.issueNumber, "issueNumber"),
    content: requireEnum(input.content, "content", REACTION_CONTENTS),
  };
}

export function validateDeleteIssueReactionInput(input: unknown): DeleteIssueReactionInput {
  if (!isRecord(input)) throw new Error("reactions.issue.delete input must be an object");
  return {
    ...repoScope(input),
    issueNumber: requireId(input.issueNumber, "issueNumber"),
    reactionId: requireId(input.reactionId, "reactionId"),
  };
}

export function validateCreateReleaseReactionInput(input: unknown): CreateReleaseReactionInput {
  if (!isRecord(input)) throw new Error("reactions.release.create input must be an object");
  return {
    ...repoScope(input),
    releaseId: requireId(input.releaseId, "releaseId"),
    content: requireEnum(input.content, "content", RELEASE_REACTION_CONTENTS),
  };
}

export function validateDeleteReleaseReactionInput(input: unknown): DeleteReleaseReactionInput {
  if (!isRecord(input)) throw new Error("reactions.release.delete input must be an object");
  return {
    ...repoScope(input),
    releaseId: requireId(input.releaseId, "releaseId"),
    reactionId: requireId(input.reactionId, "reactionId"),
  };
}

export function normalizeReaction(item: Record<string, unknown>): NormalizedReaction {
  const user = isRecord(item.user) ? item.user : undefined;
  return {
    id: typeof item.id === "number" ? item.id : 0,
    content: typeof item.content === "string" ? item.content : "",
    createdAt: typeof item.created_at === "string" ? item.created_at : "",
    userLogin: user && typeof user.login === "string" ? user.login : "",
  };
}

export function createCardReactionsClient(options: { accessToken: string; fetch?: typeof fetch; githubClient?: GitHubClient }) {
  const client = options.githubClient ?? createGitHubClient({
    accessToken: options.accessToken,
    fetch: options.fetch,
    operation: "reactions.issue.create",
  });

  return {
    async createCommitCommentReaction(input: unknown) {
      const payload = validateCreateCommitCommentReactionInput(input);
      return createReaction(client, `${repoPath(payload.owner, payload.repo)}/comments/${payload.commentId}/reactions`, payload.content);
    },

    async deleteCommitCommentReaction(input: unknown) {
      const payload = validateDeleteCommitCommentReactionInput(input);
      return deleteReaction(client, `${repoPath(payload.owner, payload.repo)}/comments/${payload.commentId}/reactions/${payload.reactionId}`, payload.reactionId);
    },

    async createIssueCommentReaction(input: unknown) {
      const payload = validateCreateIssueCommentReactionInput(input);
      return createReaction(client, `${repoPath(payload.owner, payload.repo)}/issues/comments/${payload.commentId}/reactions`, payload.content);
    },

    async deleteIssueCommentReaction(input: unknown) {
      const payload = validateDeleteIssueCommentReactionInput(input);
      return deleteReaction(client, `${repoPath(payload.owner, payload.repo)}/issues/comments/${payload.commentId}/reactions/${payload.reactionId}`, payload.reactionId);
    },

    async createIssueReaction(input: unknown) {
      const payload = validateCreateIssueReactionInput(input);
      return createReaction(client, `${repoPath(payload.owner, payload.repo)}/issues/${payload.issueNumber}/reactions`, payload.content);
    },

    async deleteIssueReaction(input: unknown) {
      const payload = validateDeleteIssueReactionInput(input);
      return deleteReaction(client, `${repoPath(payload.owner, payload.repo)}/issues/${payload.issueNumber}/reactions/${payload.reactionId}`, payload.reactionId);
    },

    async createPullRequestCommentReaction(input: unknown) {
      const payload = validateCreatePullRequestCommentReactionInput(input);
      return createReaction(client, `${repoPath(payload.owner, payload.repo)}/pulls/comments/${payload.commentId}/reactions`, payload.content);
    },

    async deletePullRequestCommentReaction(input: unknown) {
      const payload = validateDeletePullRequestCommentReactionInput(input);
      return deleteReaction(client, `${repoPath(payload.owner, payload.repo)}/pulls/comments/${payload.commentId}/reactions/${payload.reactionId}`, payload.reactionId);
    },

    async createReleaseReaction(input: unknown) {
      const payload = validateCreateReleaseReactionInput(input);
      return createReaction(client, `${repoPath(payload.owner, payload.repo)}/releases/${payload.releaseId}/reactions`, payload.content);
    },

    async deleteReleaseReaction(input: unknown) {
      const payload = validateDeleteReleaseReactionInput(input);
      return deleteReaction(client, `${repoPath(payload.owner, payload.repo)}/releases/${payload.releaseId}/reactions/${payload.reactionId}`, payload.reactionId);
    },
  };
}

async function createReaction(client: GitHubClient, path: string, content: string) {
  const response = await client.fetchJSON(path, {
    method: "POST",
    headers: { "Content-Type": "application/vnd.github+json" },
    body: JSON.stringify({ content }),
  });
  if ((response.status === 200 || response.status === 201) && isRecord(response.body)) {
    return { ok: true as const, reaction: normalizeReaction(response.body) };
  }
  if (response.status === 404) return upstream("Reaction target not found.");
  return mapRateOrUpstream(response, "GitHub rejected the create reaction request.");
}

async function deleteReaction(client: GitHubClient, path: string, reactionId: number) {
  const response = await client.fetchJSON(path, { method: "DELETE" });
  if (response.status === 204 || response.status === 404) {
    return { ok: true as const, deleted: true as const, reactionId };
  }
  return mapRateOrUpstream(response, "GitHub rejected the delete reaction request.");
}

function commentCreate(input: Record<string, unknown>, allowed: readonly ReactionContent[]): CreateCommentReactionInput {
  return {
    ...repoScope(input),
    commentId: requireId(input.commentId, "commentId"),
    content: requireEnum(input.content, "content", allowed),
  };
}

function commentDelete(input: Record<string, unknown>): DeleteCommentReactionInput {
  return {
    ...repoScope(input),
    commentId: requireId(input.commentId, "commentId"),
    reactionId: requireId(input.reactionId, "reactionId"),
  };
}

function repoPath(owner: string, repo: string): string {
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

function repoScope(input: Record<string, unknown>): { owner: string; repo: string } {
  return {
    owner: requireSingleSegment(input.owner, "owner"),
    repo: requireSingleSegment(input.repo, "repo"),
  };
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

function upstream(message: string) {
  return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message } };
}

function requireEnum<T extends string>(value: unknown, field: string, allowed: readonly T[]): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new Error(`${field} must be one of ${allowed.join(", ")}`);
  }
  return value as T;
}

function requireSingleSegment(value: unknown, field: string): string {
  const text = requireString(value, field);
  if (text.includes("/") || text.includes("?") || text.includes("#")) {
    throw new Error(`${field} must be a single path segment`);
  }
  return text;
}

function requireId(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${field} must be a positive integer`);
  }
  return value;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
