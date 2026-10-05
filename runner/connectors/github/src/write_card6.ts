import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";

type ProjectItem = { username: string; projectNumber: number; itemId: number };
type CheckSuiteCreate = { owner: string; repo: string; headSha: string };
type ThreadId = { threadId: string };
type SetThreadSubscription = ThreadId & { ignored?: boolean };

export function validateDeleteUserProjectItemInput(input: unknown): ProjectItem {
  if (!isRecord(input)) throw new Error("users.projects_v2.items.delete input must be an object");
  return {
    username: requireSingleSegment(input.username, "username"),
    projectNumber: requireId(input.projectNumber, "projectNumber"),
    itemId: requireId(input.itemId, "itemId"),
  };
}

export function validateCreateCheckSuiteInput(input: unknown): CheckSuiteCreate {
  if (!isRecord(input)) throw new Error("checks.suites.create input must be an object");
  return {
    owner: requireSingleSegment(input.owner, "owner"),
    repo: requireSingleSegment(input.repo, "repo"),
    headSha: requireSha(input.headSha, "headSha"),
  };
}

export function validateDeleteThreadSubscriptionInput(input: unknown): ThreadId {
  if (!isRecord(input)) throw new Error("notifications.threads.subscription.delete input must be an object");
  return { threadId: requireThreadId(input) };
}

export function validateMarkThreadDoneInput(input: unknown): ThreadId {
  if (!isRecord(input)) throw new Error("notifications.threads.mark_done input must be an object");
  return { threadId: requireThreadId(input) };
}

export function validateSetThreadSubscriptionInput(input: unknown): SetThreadSubscription {
  if (!isRecord(input)) throw new Error("notifications.threads.subscription.set input must be an object");
  return {
    threadId: requireThreadId(input),
    ignored: optionalBoolean(input.ignored, "ignored"),
  };
}

export function createWriteCard6Client(options: { accessToken: string; fetch?: typeof fetch; githubClient?: GitHubClient }) {
  const base = options.githubClient;
  const clientFor = (operation: string) => base ?? createGitHubClient({
    accessToken: options.accessToken,
    fetch: options.fetch,
    operation,
  });

  return {
    async deleteUserProjectItem(input: unknown) {
      const payload = validateDeleteUserProjectItemInput(input);
      const response = await clientFor("users.projects_v2.items.delete").fetchJSON(
        `/users/${encodeURIComponent(payload.username)}/projectsV2/${payload.projectNumber}/items/${payload.itemId}`,
        { method: "DELETE" },
      );
      return noContent(
        response,
        204,
        { deleted: true, username: payload.username, projectNumber: payload.projectNumber, itemId: payload.itemId },
        "User project item was not found.",
        "GitHub rejected the delete user project item request.",
      );
    },
    async createCheckSuite(input: unknown) {
      const payload = validateCreateCheckSuiteInput(input);
      const response = await clientFor("checks.suites.create").fetchJSON(
        `/repos/${encodeURIComponent(payload.owner)}/${encodeURIComponent(payload.repo)}/check-suites`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ head_sha: payload.headSha }),
        },
      );
      if ((response.status === 200 || response.status === 201) && isRecord(response.body)) {
        return { ok: true as const, suite: response.body };
      }
      if (response.status === 404) return upstream("Repository was not found.");
      return mapRateOrUpstream(response, "GitHub rejected the create check suite request.");
    },
    async deleteThreadSubscription(input: unknown) {
      const payload = validateDeleteThreadSubscriptionInput(input);
      const response = await clientFor("notifications.threads.subscription.delete").fetchJSON(
        `/notifications/threads/${encodeURIComponent(payload.threadId)}/subscription`,
        { method: "DELETE" },
      );
      return noContent(
        response,
        204,
        { deleted: true, threadId: payload.threadId },
        "Thread subscription was not found.",
        "GitHub rejected the delete thread subscription request.",
      );
    },
    async markThreadDone(input: unknown) {
      const payload = validateMarkThreadDoneInput(input);
      const response = await clientFor("notifications.threads.mark_done").fetchJSON(
        `/notifications/threads/${encodeURIComponent(payload.threadId)}`,
        { method: "DELETE" },
      );
      return noContent(
        response,
        204,
        { deleted: true, threadId: payload.threadId },
        "Notification thread was not found.",
        "GitHub rejected the mark thread as done request.",
      );
    },
    async setThreadSubscription(input: unknown) {
      const payload = validateSetThreadSubscriptionInput(input);
      const body: Record<string, boolean> = {};
      if (payload.ignored !== undefined) body.ignored = payload.ignored;
      const response = await clientFor("notifications.threads.subscription.set").fetchJSON(
        `/notifications/threads/${encodeURIComponent(payload.threadId)}/subscription`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, subscription: response.body };
      }
      if (response.status === 404) return upstream("Thread subscription was not found.");
      return mapRateOrUpstream(response, "GitHub rejected the set thread subscription request.");
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

function requireThreadId(input: Record<string, unknown>): string {
  return requireSingleSegment(input.threadId ?? input.thread_id, "threadId");
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

function requireSha(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  if (!/^[0-9a-fA-F]{7,64}$/.test(value)) throw new Error(`${field} must be a git sha`);
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
