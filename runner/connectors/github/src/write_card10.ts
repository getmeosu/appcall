import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";

const REACTION_CONTENTS = new Set(["+1", "-1", "laugh", "confused", "heart", "hooray", "rocket", "eyes"]);
const RELEASE_REACTION_CONTENTS = new Set(["+1", "laugh", "heart", "hooray", "rocket", "eyes"]);

type OrgHook = { org: string; hookId: number };
type RepoHook = { owner: string; repo: string; hookId: number };
type OrgDelivery = OrgHook & { deliveryId: number };
type RepoDelivery = RepoHook & { deliveryId: number };
type HookConfig = {
  url?: string;
  events?: string[];
  name?: string;
  active?: boolean;
  contentType?: "json" | "form";
  secret?: string;
  insecureSsl?: boolean;
};
type CreateOrgHook = { org: string; url: string; events: string[] } & HookConfig;
type UpdateOrgHook = OrgHook & HookConfig;
type UpdateRepoHook = RepoHook & HookConfig;
type Repo = { owner: string; repo: string };
type IssueReaction = Repo & { issueNumber: number; content: string };
type CommentReaction = Repo & { commentId: number; content: string };
type ReleaseReaction = Repo & { releaseId: number; content: string };
type IssueReactionDelete = Repo & { issueNumber: number; reactionId: number };
type CommentReactionDelete = Repo & { commentId: number; reactionId: number };
type ReleaseReactionDelete = Repo & { releaseId: number; reactionId: number };

export function validateCreateOrgHookInput(input: unknown): CreateOrgHook {
  if (!isRecord(input)) throw new Error("orgs.hooks.create input must be an object");
  const events = requireStringList(input.events, "events");
  if (events.length === 0) throw new Error("events is required");
  return {
    org: requireSingleSegment(input.org, "org"),
    url: requireNonEmpty(input.url, "url"),
    events,
    ...hookConfig(input),
  };
}

export function validateDeleteRepoHookInput(input: unknown): RepoHook {
  if (!isRecord(input)) throw new Error("repos.hooks.delete input must be an object");
  return { ...repo(input), hookId: requireId(input.hookId ?? input.hook_id, "hookId") };
}

export function validateDeleteOrgHookInput(input: unknown): OrgHook {
  if (!isRecord(input)) throw new Error("orgs.hooks.delete input must be an object");
  return { org: requireSingleSegment(input.org, "org"), hookId: requireId(input.hookId ?? input.hook_id, "hookId") };
}

export function validatePingOrgHookInput(input: unknown): OrgHook {
  if (!isRecord(input)) throw new Error("orgs.hooks.ping input must be an object");
  return { org: requireSingleSegment(input.org, "org"), hookId: requireId(input.hookId ?? input.hook_id, "hookId") };
}

export function validatePingRepoHookInput(input: unknown): RepoHook {
  if (!isRecord(input)) throw new Error("repos.hooks.ping input must be an object");
  return { ...repo(input), hookId: requireId(input.hookId ?? input.hook_id, "hookId") };
}

export function validateRedeliverOrgHookDeliveryInput(input: unknown): OrgDelivery {
  if (!isRecord(input)) throw new Error("orgs.hooks.deliveries.redeliver input must be an object");
  return {
    org: requireSingleSegment(input.org, "org"),
    hookId: requireId(input.hookId ?? input.hook_id, "hookId"),
    deliveryId: requireId(input.deliveryId ?? input.delivery_id, "deliveryId"),
  };
}

export function validateRedeliverRepoHookDeliveryInput(input: unknown): RepoDelivery {
  if (!isRecord(input)) throw new Error("repos.hooks.deliveries.redeliver input must be an object");
  return {
    ...repo(input),
    hookId: requireId(input.hookId ?? input.hook_id, "hookId"),
    deliveryId: requireId(input.deliveryId ?? input.delivery_id, "deliveryId"),
  };
}

export function validateUpdateOrgHookInput(input: unknown): UpdateOrgHook {
  if (!isRecord(input)) throw new Error("orgs.hooks.update input must be an object");
  return {
    org: requireSingleSegment(input.org, "org"),
    hookId: requireId(input.hookId ?? input.hook_id, "hookId"),
    ...hookConfig(input, { requireEvents: false }),
  };
}

export function validateUpdateRepoHookInput(input: unknown): UpdateRepoHook {
  if (!isRecord(input)) throw new Error("repos.hooks.update input must be an object");
  return {
    ...repo(input),
    hookId: requireId(input.hookId ?? input.hook_id, "hookId"),
    ...hookConfig(input, { requireEvents: false }),
  };
}

export function validateCreateIssueReactionInput(input: unknown): IssueReaction {
  if (!isRecord(input)) throw new Error("issues.reactions.create input must be an object");
  return { ...repo(input), issueNumber: requireId(input.issueNumber ?? input.issue_number, "issueNumber"), content: requireReaction(input.content) };
}

export function validateCreateIssueCommentReactionInput(input: unknown): CommentReaction {
  if (!isRecord(input)) throw new Error("issues.comments.reactions.create input must be an object");
  return { ...repo(input), commentId: requireId(input.commentId ?? input.comment_id, "commentId"), content: requireReaction(input.content) };
}

export function validateCreateCommitCommentReactionInput(input: unknown): CommentReaction {
  if (!isRecord(input)) throw new Error("commits.comments.reactions.create input must be an object");
  return { ...repo(input), commentId: requireId(input.commentId ?? input.comment_id, "commentId"), content: requireReaction(input.content) };
}

export function validateCreatePullReviewCommentReactionInput(input: unknown): CommentReaction {
  if (!isRecord(input)) throw new Error("pull_requests.review_comments.reactions.create input must be an object");
  return { ...repo(input), commentId: requireId(input.commentId ?? input.comment_id, "commentId"), content: requireReaction(input.content) };
}

export function validateCreateReleaseReactionInput(input: unknown): ReleaseReaction {
  if (!isRecord(input)) throw new Error("releases.reactions.create input must be an object");
  return { ...repo(input), releaseId: requireId(input.releaseId ?? input.release_id, "releaseId"), content: requireReleaseReaction(input.content) };
}

export function validateDeleteReleaseReactionInput(input: unknown): ReleaseReactionDelete {
  if (!isRecord(input)) throw new Error("releases.reactions.delete input must be an object");
  return {
    ...repo(input),
    releaseId: requireId(input.releaseId ?? input.release_id, "releaseId"),
    reactionId: requireId(input.reactionId ?? input.reaction_id, "reactionId"),
  };
}

export function validateDeleteCommitCommentReactionInput(input: unknown): CommentReactionDelete {
  if (!isRecord(input)) throw new Error("commits.comments.reactions.delete input must be an object");
  return {
    ...repo(input),
    commentId: requireId(input.commentId ?? input.comment_id, "commentId"),
    reactionId: requireId(input.reactionId ?? input.reaction_id, "reactionId"),
  };
}

export function validateDeleteIssueCommentReactionInput(input: unknown): CommentReactionDelete {
  if (!isRecord(input)) throw new Error("issues.comments.reactions.delete input must be an object");
  return {
    ...repo(input),
    commentId: requireId(input.commentId ?? input.comment_id, "commentId"),
    reactionId: requireId(input.reactionId ?? input.reaction_id, "reactionId"),
  };
}

export function validateDeleteIssueReactionInput(input: unknown): IssueReactionDelete {
  if (!isRecord(input)) throw new Error("issues.reactions.delete input must be an object");
  return {
    ...repo(input),
    issueNumber: requireId(input.issueNumber ?? input.issue_number, "issueNumber"),
    reactionId: requireId(input.reactionId ?? input.reaction_id, "reactionId"),
  };
}

export function createWriteCard10Client(options: { accessToken: string; fetch?: typeof fetch; githubClient?: GitHubClient }) {
  const base = options.githubClient;
  const clientFor = (operation: string) => base ?? createGitHubClient({
    accessToken: options.accessToken,
    fetch: options.fetch,
    operation,
  });

  return {
    async createOrgHook(input: unknown) {
      const payload = validateCreateOrgHookInput(input);
      const response = await clientFor("orgs.hooks.create").fetchJSON(`/orgs/${seg(payload.org)}/hooks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(hookBody(payload)),
      });
      return jsonBody(response, [201], "hook", "Organization was not found.", "GitHub rejected the create organization webhook request.");
    },
    async deleteRepoHook(input: unknown) {
      const payload = validateDeleteRepoHookInput(input);
      const response = await clientFor("repos.hooks.delete").fetchJSON(
        `/repos/${seg(payload.owner)}/${seg(payload.repo)}/hooks/${payload.hookId}`,
        { method: "DELETE" },
      );
      return noContent(response, 204, {
        deleted: true, owner: payload.owner, repo: payload.repo, hookId: payload.hookId,
      }, "Repository webhook was not found.", "GitHub rejected the delete repository webhook request.");
    },
    async deleteOrgHook(input: unknown) {
      const payload = validateDeleteOrgHookInput(input);
      const response = await clientFor("orgs.hooks.delete").fetchJSON(
        `/orgs/${seg(payload.org)}/hooks/${payload.hookId}`,
        { method: "DELETE" },
      );
      return noContent(response, 204, {
        deleted: true, org: payload.org, hookId: payload.hookId,
      }, "Organization webhook was not found.", "GitHub rejected the delete organization webhook request.");
    },
    async pingOrgHook(input: unknown) {
      const payload = validatePingOrgHookInput(input);
      const response = await clientFor("orgs.hooks.ping").fetchJSON(
        `/orgs/${seg(payload.org)}/hooks/${payload.hookId}/pings`,
        { method: "POST" },
      );
      return noContent(response, 204, {
        pinged: true, org: payload.org, hookId: payload.hookId,
      }, "Organization webhook was not found.", "GitHub rejected the ping organization webhook request.");
    },
    async pingRepoHook(input: unknown) {
      const payload = validatePingRepoHookInput(input);
      const response = await clientFor("repos.hooks.ping").fetchJSON(
        `/repos/${seg(payload.owner)}/${seg(payload.repo)}/hooks/${payload.hookId}/pings`,
        { method: "POST" },
      );
      return noContent(response, 204, {
        pinged: true, owner: payload.owner, repo: payload.repo, hookId: payload.hookId,
      }, "Repository webhook was not found.", "GitHub rejected the ping repository webhook request.");
    },
    async redeliverOrgHookDelivery(input: unknown) {
      const payload = validateRedeliverOrgHookDeliveryInput(input);
      const response = await clientFor("orgs.hooks.deliveries.redeliver").fetchJSON(
        `/orgs/${seg(payload.org)}/hooks/${payload.hookId}/deliveries/${payload.deliveryId}/attempts`,
        { method: "POST" },
      );
      return noContent(response, 202, {
        redelivered: true, org: payload.org, hookId: payload.hookId, deliveryId: payload.deliveryId,
      }, "Organization webhook delivery was not found.", "GitHub rejected the redeliver organization webhook delivery request.");
    },
    async redeliverRepoHookDelivery(input: unknown) {
      const payload = validateRedeliverRepoHookDeliveryInput(input);
      const response = await clientFor("repos.hooks.deliveries.redeliver").fetchJSON(
        `/repos/${seg(payload.owner)}/${seg(payload.repo)}/hooks/${payload.hookId}/deliveries/${payload.deliveryId}/attempts`,
        { method: "POST" },
      );
      return noContent(response, 202, {
        redelivered: true, owner: payload.owner, repo: payload.repo, hookId: payload.hookId, deliveryId: payload.deliveryId,
      }, "Repository webhook delivery was not found.", "GitHub rejected the redeliver repository webhook delivery request.");
    },
    async updateOrgHook(input: unknown) {
      const payload = validateUpdateOrgHookInput(input);
      const response = await clientFor("orgs.hooks.update").fetchJSON(
        `/orgs/${seg(payload.org)}/hooks/${payload.hookId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(hookBody(payload, { includeEmptyConfig: false })),
        },
      );
      return jsonBody(response, [200], "hook", "Organization webhook was not found.", "GitHub rejected the update organization webhook request.");
    },
    async updateRepoHook(input: unknown) {
      const payload = validateUpdateRepoHookInput(input);
      const response = await clientFor("repos.hooks.update").fetchJSON(
        `/repos/${seg(payload.owner)}/${seg(payload.repo)}/hooks/${payload.hookId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(hookBody(payload, { includeEmptyConfig: false })),
        },
      );
      return jsonBody(response, [200], "hook", "Repository webhook was not found.", "GitHub rejected the update repository webhook request.");
    },
    async createIssueReaction(input: unknown) {
      const payload = validateCreateIssueReactionInput(input);
      const response = await clientFor("issues.reactions.create").fetchJSON(
        `/repos/${seg(payload.owner)}/${seg(payload.repo)}/issues/${payload.issueNumber}/reactions`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: payload.content }) },
      );
      return jsonBody(response, [200, 201], "reaction", "Issue was not found.", "GitHub rejected the create issue reaction request.");
    },
    async createIssueCommentReaction(input: unknown) {
      const payload = validateCreateIssueCommentReactionInput(input);
      const response = await clientFor("issues.comments.reactions.create").fetchJSON(
        `/repos/${seg(payload.owner)}/${seg(payload.repo)}/issues/comments/${payload.commentId}/reactions`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: payload.content }) },
      );
      return jsonBody(response, [200, 201], "reaction", "Issue comment was not found.", "GitHub rejected the create issue comment reaction request.");
    },
    async createCommitCommentReaction(input: unknown) {
      const payload = validateCreateCommitCommentReactionInput(input);
      const response = await clientFor("commits.comments.reactions.create").fetchJSON(
        `/repos/${seg(payload.owner)}/${seg(payload.repo)}/comments/${payload.commentId}/reactions`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: payload.content }) },
      );
      return jsonBody(response, [200, 201], "reaction", "Commit comment was not found.", "GitHub rejected the create commit comment reaction request.");
    },
    async createPullReviewCommentReaction(input: unknown) {
      const payload = validateCreatePullReviewCommentReactionInput(input);
      const response = await clientFor("pull_requests.review_comments.reactions.create").fetchJSON(
        `/repos/${seg(payload.owner)}/${seg(payload.repo)}/pulls/comments/${payload.commentId}/reactions`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: payload.content }) },
      );
      return jsonBody(response, [200, 201], "reaction", "Pull request review comment was not found.", "GitHub rejected the create pull request review comment reaction request.");
    },
    async createReleaseReaction(input: unknown) {
      const payload = validateCreateReleaseReactionInput(input);
      const response = await clientFor("releases.reactions.create").fetchJSON(
        `/repos/${seg(payload.owner)}/${seg(payload.repo)}/releases/${payload.releaseId}/reactions`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: payload.content }) },
      );
      return jsonBody(response, [200, 201], "reaction", "Release was not found.", "GitHub rejected the create release reaction request.");
    },
    async deleteReleaseReaction(input: unknown) {
      const payload = validateDeleteReleaseReactionInput(input);
      const response = await clientFor("releases.reactions.delete").fetchJSON(
        `/repos/${seg(payload.owner)}/${seg(payload.repo)}/releases/${payload.releaseId}/reactions/${payload.reactionId}`,
        { method: "DELETE" },
      );
      return noContent(response, 204, {
        deleted: true, owner: payload.owner, repo: payload.repo, releaseId: payload.releaseId, reactionId: payload.reactionId,
      }, "Release reaction was not found.", "GitHub rejected the delete release reaction request.");
    },
    async deleteCommitCommentReaction(input: unknown) {
      const payload = validateDeleteCommitCommentReactionInput(input);
      const response = await clientFor("commits.comments.reactions.delete").fetchJSON(
        `/repos/${seg(payload.owner)}/${seg(payload.repo)}/comments/${payload.commentId}/reactions/${payload.reactionId}`,
        { method: "DELETE" },
      );
      return noContent(response, 204, {
        deleted: true, owner: payload.owner, repo: payload.repo, commentId: payload.commentId, reactionId: payload.reactionId,
      }, "Commit comment reaction was not found.", "GitHub rejected the delete commit comment reaction request.");
    },
    async deleteIssueCommentReaction(input: unknown) {
      const payload = validateDeleteIssueCommentReactionInput(input);
      const response = await clientFor("issues.comments.reactions.delete").fetchJSON(
        `/repos/${seg(payload.owner)}/${seg(payload.repo)}/issues/comments/${payload.commentId}/reactions/${payload.reactionId}`,
        { method: "DELETE" },
      );
      return noContent(response, 204, {
        deleted: true, owner: payload.owner, repo: payload.repo, commentId: payload.commentId, reactionId: payload.reactionId,
      }, "Issue comment reaction was not found.", "GitHub rejected the delete issue comment reaction request.");
    },
    async deleteIssueReaction(input: unknown) {
      const payload = validateDeleteIssueReactionInput(input);
      const response = await clientFor("issues.reactions.delete").fetchJSON(
        `/repos/${seg(payload.owner)}/${seg(payload.repo)}/issues/${payload.issueNumber}/reactions/${payload.reactionId}`,
        { method: "DELETE" },
      );
      return noContent(response, 204, {
        deleted: true, owner: payload.owner, repo: payload.repo, issueNumber: payload.issueNumber, reactionId: payload.reactionId,
      }, "Issue reaction was not found.", "GitHub rejected the delete issue reaction request.");
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
  field: string,
  missing: string,
  rejected: string,
) {
  if (success.includes(response.status) && isRecord(response.body)) {
    return { ok: true as const, [field]: response.body };
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

function hookConfig(input: Record<string, unknown>, options: { requireEvents?: boolean } = {}): HookConfig {
  const contentType = optionalString(input.contentType ?? input.content_type, "contentType");
  if (contentType !== undefined && contentType !== "json" && contentType !== "form") {
    throw new Error("contentType must be json or form");
  }
  const events = input.events === undefined ? undefined : requireStringList(input.events, "events");
  if (options.requireEvents && (!events || events.length === 0)) throw new Error("events is required");
  return {
    url: optionalString(input.url, "url"),
    events,
    name: optionalString(input.name, "name"),
    active: optionalBoolean(input.active, "active"),
    contentType: contentType as "json" | "form" | undefined,
    secret: optionalString(input.secret, "secret"),
    insecureSsl: optionalBoolean(input.insecureSsl ?? input.insecure_ssl, "insecureSsl"),
  };
}

function hookBody(payload: HookConfig & { url?: string; events?: string[] }, options: { includeEmptyConfig?: boolean } = {}) {
  const config: Record<string, unknown> = {};
  if (payload.url !== undefined) config.url = payload.url;
  if (payload.contentType !== undefined) config.content_type = payload.contentType;
  if (payload.secret !== undefined) config.secret = payload.secret;
  if (payload.insecureSsl !== undefined) config.insecure_ssl = payload.insecureSsl ? "1" : "0";
  const body: Record<string, unknown> = {};
  if (payload.name !== undefined) body.name = payload.name;
  if (payload.events !== undefined) body.events = payload.events;
  if (payload.active !== undefined) body.active = payload.active;
  if (Object.keys(config).length > 0 || options.includeEmptyConfig) body.config = config;
  // create always needs config.url — callers that require url put it on payload
  if (payload.url !== undefined && !("config" in body)) body.config = { url: payload.url, ...config };
  if (payload.url !== undefined) {
    body.config = { ...(isRecord(body.config) ? body.config : {}), url: payload.url };
  }
  return body;
}

function repo(input: Record<string, unknown>): Repo {
  return {
    owner: requireSingleSegment(input.owner, "owner"),
    repo: requireSingleSegment(input.repo, "repo"),
  };
}

function requireReaction(value: unknown): string {
  const content = requireNonEmpty(value, "content");
  if (!REACTION_CONTENTS.has(content)) throw new Error("content must be a GitHub reaction type");
  return content;
}

function requireReleaseReaction(value: unknown): string {
  const content = requireNonEmpty(value, "content");
  if (!RELEASE_REACTION_CONTENTS.has(content)) throw new Error("content must be a GitHub release reaction type");
  return content;
}

function requireStringList(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  return value.map((item, index) => {
    if (typeof item !== "string" || item.length === 0) throw new Error(`${field}[${index}] must be a non-empty string`);
    return item;
  });
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

function requireNonEmpty(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function requireId(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${field} must be a positive integer`);
  }
  return value;
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} must be a non-empty string`);
  return value;
}

function optionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new Error(`${field} must be a boolean`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
