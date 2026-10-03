import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";
import { normalizeGitHubHook, type GitHubHook } from "./governance";

const REACTION_CONTENTS = ["+1", "-1", "laugh", "confused", "heart", "hooray", "rocket", "eyes"] as const;
const RELEASE_REACTION_CONTENTS = ["+1", "laugh", "heart", "hooray", "rocket", "eyes"] as const;

type ReactionContent = (typeof REACTION_CONTENTS)[number];
type ReleaseReactionContent = (typeof RELEASE_REACTION_CONTENTS)[number];

type Page = { perPage?: number; page?: number };

export type ListOrgHooksInput = { org: string } & Page;

export type ListIssueReactionsInput = {
  owner: string;
  repo: string;
  issueNumber: number;
  content?: ReactionContent;
} & Page;

export type ListCommentReactionsInput = {
  owner: string;
  repo: string;
  commentId: number;
  content?: ReactionContent;
} & Page;

export type ListReleaseReactionsInput = {
  owner: string;
  repo: string;
  releaseId: number;
  content?: ReleaseReactionContent;
} & Page;

export type GetOrgRunnerInput = { org: string; runnerId: number };
export type GetRepoRunnerInput = { owner: string; repo: string; runnerId: number };
export type ListRepoRunnerLabelsInput = { owner: string; repo: string; runnerId: number };

export type NormalizedReaction = {
  id: number;
  content: string;
  createdAt: string;
  userLogin: string;
};

export type NormalizedRunnerLabel = {
  id: number;
  name: string;
  type: string;
};

export type NormalizedRunner = {
  id: number;
  name: string;
  os: string;
  status: string;
  busy: boolean;
  ephemeral: boolean;
  version: string;
  labels: NormalizedRunnerLabel[];
};

export function validateListOrgHooksInput(input: unknown): ListOrgHooksInput {
  if (!isRecord(input)) throw new Error("orgs.hooks.list input must be an object");
  return { org: requireSingleSegment(input.org, "org"), ...pageInput(input) };
}

export function validateListIssueReactionsInput(input: unknown): ListIssueReactionsInput {
  if (!isRecord(input)) throw new Error("issues.reactions.list input must be an object");
  return {
    ...repoScope(input),
    issueNumber: requireId(input.issueNumber, "issueNumber"),
    content: optionalEnum(input.content, "content", REACTION_CONTENTS),
    ...pageInput(input),
  };
}

export function validateListIssueCommentReactionsInput(input: unknown): ListCommentReactionsInput {
  if (!isRecord(input)) throw new Error("issues.comments.reactions.list input must be an object");
  return commentReactions(input, REACTION_CONTENTS);
}

export function validateListCommitCommentReactionsInput(input: unknown): ListCommentReactionsInput {
  if (!isRecord(input)) throw new Error("commits.comments.reactions.list input must be an object");
  return commentReactions(input, REACTION_CONTENTS);
}

export function validateListReviewCommentReactionsInput(input: unknown): ListCommentReactionsInput {
  if (!isRecord(input)) throw new Error("pull_requests.review_comments.reactions.list input must be an object");
  return commentReactions(input, REACTION_CONTENTS);
}

export function validateListReleaseReactionsInput(input: unknown): ListReleaseReactionsInput {
  if (!isRecord(input)) throw new Error("releases.reactions.list input must be an object");
  return {
    ...repoScope(input),
    releaseId: requireId(input.releaseId, "releaseId"),
    content: optionalEnum(input.content, "content", RELEASE_REACTION_CONTENTS),
    ...pageInput(input),
  };
}

export function validateGetOrgRunnerInput(input: unknown): GetOrgRunnerInput {
  if (!isRecord(input)) throw new Error("orgs.actions.runners.get input must be an object");
  return { org: requireSingleSegment(input.org, "org"), runnerId: requireId(input.runnerId, "runnerId") };
}

export function validateGetRepoRunnerInput(input: unknown): GetRepoRunnerInput {
  if (!isRecord(input)) throw new Error("repos.actions.runners.get input must be an object");
  return { ...repoScope(input), runnerId: requireId(input.runnerId, "runnerId") };
}

export function validateListRepoRunnerLabelsInput(input: unknown): ListRepoRunnerLabelsInput {
  if (!isRecord(input)) throw new Error("repos.actions.runners.labels.list input must be an object");
  return { ...repoScope(input), runnerId: requireId(input.runnerId, "runnerId") };
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

export function normalizeRunnerLabel(item: Record<string, unknown>): NormalizedRunnerLabel {
  return {
    id: typeof item.id === "number" ? item.id : 0,
    name: typeof item.name === "string" ? item.name : "",
    type: typeof item.type === "string" ? item.type : "",
  };
}

export function normalizeRunner(item: Record<string, unknown>): NormalizedRunner {
  const labels = Array.isArray(item.labels) ? item.labels.filter(isRecord).map(normalizeRunnerLabel) : [];
  return {
    id: typeof item.id === "number" ? item.id : 0,
    name: typeof item.name === "string" ? item.name : "",
    os: typeof item.os === "string" ? item.os : "",
    status: typeof item.status === "string" ? item.status : "",
    busy: item.busy === true,
    ephemeral: item.ephemeral === true,
    version: typeof item.version === "string" ? item.version : "",
    labels,
  };
}

export function createCard10ReadsClient(options: { accessToken: string; fetch?: typeof fetch; githubClient?: GitHubClient }) {
  const client = options.githubClient ?? createGitHubClient({
    accessToken: options.accessToken,
    fetch: options.fetch,
    operation: "orgs.hooks.list",
  });

  return {
    async listOrgHooks(input: unknown) {
      const payload = validateListOrgHooksInput(input);
      const response = await client.fetchJSON(`/orgs/${encodeURIComponent(payload.org)}/hooks${query({
        per_page: payload.perPage,
        page: payload.page,
      })}`);
      if (response.status === 200 && Array.isArray(response.body)) {
        return { ok: true as const, hooks: response.body.filter(isRecord).map((item) => normalizeGitHubHook(item as GitHubHook)) };
      }
      if (response.status === 404) return upstream("Organization hooks not found.");
      return mapRateOrUpstream(response, "GitHub rejected the list organization hooks request.");
    },

    async listIssueReactions(input: unknown) {
      const payload = validateListIssueReactionsInput(input);
      return listReactions(client, repoPath(payload.owner, payload.repo) + `/issues/${payload.issueNumber}/reactions`, payload, "Issue reactions not found.");
    },

    async listIssueCommentReactions(input: unknown) {
      const payload = validateListIssueCommentReactionsInput(input);
      return listReactions(client, repoPath(payload.owner, payload.repo) + `/issues/comments/${payload.commentId}/reactions`, payload, "Issue comment reactions not found.");
    },

    async listCommitCommentReactions(input: unknown) {
      const payload = validateListCommitCommentReactionsInput(input);
      return listReactions(client, repoPath(payload.owner, payload.repo) + `/comments/${payload.commentId}/reactions`, payload, "Commit comment reactions not found.");
    },

    async listReviewCommentReactions(input: unknown) {
      const payload = validateListReviewCommentReactionsInput(input);
      return listReactions(client, repoPath(payload.owner, payload.repo) + `/pulls/comments/${payload.commentId}/reactions`, payload, "Pull request review comment reactions not found.");
    },

    async listReleaseReactions(input: unknown) {
      const payload = validateListReleaseReactionsInput(input);
      return listReactions(client, repoPath(payload.owner, payload.repo) + `/releases/${payload.releaseId}/reactions`, payload, "Release reactions not found.");
    },

    async getOrgRunner(input: unknown) {
      const payload = validateGetOrgRunnerInput(input);
      return getRunner(client, `/orgs/${encodeURIComponent(payload.org)}/actions/runners/${payload.runnerId}`, "Organization runner not found.");
    },

    async getRepoRunner(input: unknown) {
      const payload = validateGetRepoRunnerInput(input);
      return getRunner(client, `${repoPath(payload.owner, payload.repo)}/actions/runners/${payload.runnerId}`, "Repository runner not found.");
    },

    async listRepoRunnerLabels(input: unknown) {
      const payload = validateListRepoRunnerLabelsInput(input);
      const response = await client.fetchJSON(`${repoPath(payload.owner, payload.repo)}/actions/runners/${payload.runnerId}/labels`);
      if (response.status === 200 && isRecord(response.body) && Array.isArray(response.body.labels)) {
        const labels = response.body.labels.filter(isRecord).map(normalizeRunnerLabel);
        return {
          ok: true as const,
          totalCount: typeof response.body.total_count === "number" ? response.body.total_count : labels.length,
          labels,
        };
      }
      if (response.status === 404) return upstream("Repository runner labels not found.");
      return mapRateOrUpstream(response, "GitHub rejected the list runner labels request.");
    },
  };
}

async function listReactions(
  client: GitHubClient,
  path: string,
  payload: { content?: string; perPage?: number; page?: number },
  missing: string,
) {
  const response = await client.fetchJSON(`${path}${query({
    content: payload.content,
    per_page: payload.perPage,
    page: payload.page,
  })}`);
  if (response.status === 200 && Array.isArray(response.body)) {
    return { ok: true as const, reactions: response.body.filter(isRecord).map(normalizeReaction) };
  }
  if (response.status === 404) return upstream(missing);
  return mapRateOrUpstream(response, "GitHub rejected the list reactions request.");
}

async function getRunner(client: GitHubClient, path: string, missing: string) {
  const response = await client.fetchJSON(path);
  if (response.status === 200 && isRecord(response.body)) {
    return { ok: true as const, runner: normalizeRunner(response.body) };
  }
  if (response.status === 404) return upstream(missing);
  return mapRateOrUpstream(response, "GitHub rejected the get runner request.");
}

function commentReactions(input: Record<string, unknown>, allowed: readonly ReactionContent[]): ListCommentReactionsInput {
  return {
    ...repoScope(input),
    commentId: requireId(input.commentId, "commentId"),
    content: optionalEnum(input.content, "content", allowed),
    ...pageInput(input),
  };
}

function query(fields: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : "";
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

function pageInput(input: Record<string, unknown>): Page {
  return {
    perPage: optionalPage(input.perPage, "perPage", 100),
    page: optionalPage(input.page, "page", 1_000_000),
  };
}

function optionalEnum<T extends string>(value: unknown, field: string, allowed: readonly T[]): T | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new Error(`${field} must be one of ${allowed.join(", ")}`);
  }
  return value as T;
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

function optionalPage(value: unknown, field: string, max = 100): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > max) {
    throw new Error(`${field} must be an integer between 1 and ${max}`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
