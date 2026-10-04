import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";
import { normalizeGitHubNotification, type GitHubNotification } from "./notifications_social";
import { normalizeSubscription } from "./repos_reads";

export type NormalizedListedLicense = {
  key: string;
  name: string;
  spdxId: string;
  url: string;
  nodeId: string;
  htmlUrl: string;
};

export type NormalizedRateResource = {
  limit: number;
  used: number;
  remaining: number;
  reset: number;
};

export type NormalizedRateLimit = {
  resources: Record<string, NormalizedRateResource>;
  rate: NormalizedRateResource;
};

export type NormalizedThreadSubscription = {
  subscribed: boolean;
  ignored: boolean;
  reason: string;
  createdAt: string;
  url: string;
  threadUrl: string;
};

export type RepoScope = { owner: string; repo: string };
export type Page = { perPage?: number; page?: number };
export type ThreadScope = { threadId: string };
export type RepoNotificationsList = RepoScope & Page & {
  all?: boolean;
  participating?: boolean;
  since?: string;
  before?: string;
};
export type MarkRepoNotificationsRead = RepoScope & { lastReadAt?: string; read?: boolean };
export type PutThreadSubscription = ThreadScope & { ignored?: boolean };
export type PutRepoSubscription = RepoScope & { subscribed?: boolean; ignored?: boolean };

export function validateListLicensesInput(input: unknown): Record<string, never> {
  if (input === undefined || input === null) return {};
  if (!isRecord(input)) throw new Error("licenses.list input must be an object");
  return {};
}

export function validateListGitignoreTemplatesInput(input: unknown): Record<string, never> {
  if (input === undefined || input === null) return {};
  if (!isRecord(input)) throw new Error("gitignore.templates.list input must be an object");
  return {};
}

export function validateGetRateLimitInput(input: unknown): Record<string, never> {
  if (input === undefined || input === null) return {};
  if (!isRecord(input)) throw new Error("rate_limit.get input must be an object");
  return {};
}

export function validateGetMetaRootInput(input: unknown): Record<string, never> {
  if (input === undefined || input === null) return {};
  if (!isRecord(input)) throw new Error("meta.root.get input must be an object");
  return {};
}

export function validateListRepoNotificationsInput(input: unknown): RepoNotificationsList {
  if (!isRecord(input)) throw new Error("activity.repo_notifications.list input must be an object");
  return {
    ...repo(input),
    all: optionalBool(input.all, "all"),
    participating: optionalBool(input.participating, "participating"),
    since: optionalString(input.since, "since"),
    before: optionalString(input.before, "before"),
    perPage: optionalPage(input.perPage, "perPage"),
    page: optionalPage(input.page, "page", 1_000_000),
  };
}

export function validateCheckStarredInput(input: unknown): RepoScope {
  if (!isRecord(input)) throw new Error("activity.starred.check input must be an object");
  return repo(input);
}

export function validateMarkThreadDoneInput(input: unknown): ThreadScope {
  if (!isRecord(input)) throw new Error("activity.thread.mark_done input must be an object");
  return thread(input);
}

export function validatePutThreadSubscriptionInput(input: unknown): PutThreadSubscription {
  if (!isRecord(input)) throw new Error("activity.thread.subscription.put input must be an object");
  return { ...thread(input), ignored: optionalBool(input.ignored, "ignored") };
}

export function validateDeleteThreadSubscriptionInput(input: unknown): ThreadScope {
  if (!isRecord(input)) throw new Error("activity.thread.subscription.delete input must be an object");
  return thread(input);
}

export function validateMarkRepoNotificationsReadInput(input: unknown): MarkRepoNotificationsRead {
  if (!isRecord(input)) throw new Error("activity.repo_notifications.mark_read input must be an object");
  return {
    ...repo(input),
    lastReadAt: optionalString(input.lastReadAt, "lastReadAt"),
    read: optionalBool(input.read, "read"),
  };
}

export function validatePutRepoSubscriptionInput(input: unknown): PutRepoSubscription {
  if (!isRecord(input)) throw new Error("activity.repo.subscription.put input must be an object");
  return {
    ...repo(input),
    subscribed: optionalBool(input.subscribed, "subscribed"),
    ignored: optionalBool(input.ignored, "ignored"),
  };
}

export function validateDeleteRepoSubscriptionInput(input: unknown): RepoScope {
  if (!isRecord(input)) throw new Error("activity.repo.subscription.delete input must be an object");
  return repo(input);
}

export function createCardActivityRemainingClient(options: {
  accessToken: string;
  fetch?: typeof fetch;
  githubClient?: GitHubClient;
}) {
  const client = options.githubClient ?? createGitHubClient({
    accessToken: options.accessToken,
    fetch: options.fetch,
    operation: "licenses.list",
  });

  return {
    async listLicenses(input: unknown) {
      validateListLicensesInput(input);
      const response = await client.fetchJSON("/licenses");
      const limited = rate(response.status, response.headers);
      if (limited) return limited;
      if (response.status === 404) return upstream("Licenses were not found.");
      if (response.status === 401) return upstream("GitHub rejected the licenses.list request.");
      if (response.status === 200 && Array.isArray(response.body)) {
        return {
          ok: true as const,
          licenses: response.body.filter(isRecord).map(normalizeListedLicense),
        };
      }
      return upstream("GitHub rejected the licenses.list request.");
    },

    async listGitignoreTemplates(input: unknown) {
      validateListGitignoreTemplatesInput(input);
      const response = await client.fetchJSON("/gitignore/templates");
      const limited = rate(response.status, response.headers);
      if (limited) return limited;
      if (response.status === 404) return upstream("Gitignore templates were not found.");
      if (response.status === 401) return upstream("GitHub rejected the gitignore.templates.list request.");
      if (response.status === 200 && Array.isArray(response.body)) {
        return {
          ok: true as const,
          templates: response.body.filter((entry): entry is string => typeof entry === "string"),
        };
      }
      return upstream("GitHub rejected the gitignore.templates.list request.");
    },

    async getRateLimit(input: unknown) {
      validateGetRateLimitInput(input);
      const response = await client.fetchJSON("/rate_limit");
      const limited = rate(response.status, response.headers);
      if (limited) return limited;
      if (response.status === 404) return upstream("Rate limit was not found.");
      if (response.status === 401) return upstream("GitHub rejected the rate_limit.get request.");
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, rateLimit: normalizeRateLimit(response.body) };
      }
      return upstream("GitHub rejected the rate_limit.get request.");
    },

    async listRepoNotifications(input: unknown) {
      const payload = validateListRepoNotificationsInput(input);
      const response = await client.fetchJSON(
        `/repos/${encodeURIComponent(payload.owner)}/${encodeURIComponent(payload.repo)}/notifications${notificationQuery(payload)}`,
      );
      const limited = rate(response.status, response.headers);
      if (limited) return limited;
      if (response.status === 404) return upstream("Repository notifications were not found.");
      if (response.status === 401) return upstream("GitHub rejected the activity.repo_notifications.list request.");
      if (response.status === 200 && Array.isArray(response.body)) {
        return {
          ok: true as const,
          notifications: (response.body as GitHubNotification[]).map(normalizeGitHubNotification),
        };
      }
      return upstream("GitHub rejected the activity.repo_notifications.list request.");
    },

    async checkStarred(input: unknown) {
      const payload = validateCheckStarredInput(input);
      const response = await client.fetchJSON(
        `/user/starred/${encodeURIComponent(payload.owner)}/${encodeURIComponent(payload.repo)}`,
      );
      const limited = rate(response.status, response.headers);
      if (limited) return limited;
      // Docs: 204 starred, 404 not starred. The 404 is a documented negative, not an upstream miss.
      if (response.status === 204) return { ok: true as const, starred: true as const };
      if (response.status === 404) return { ok: true as const, starred: false as const };
      if (response.status === 401) return upstream("GitHub rejected the activity.starred.check request.");
      return upstream("GitHub rejected the activity.starred.check request.");
    },

    async getMetaRoot(input: unknown) {
      validateGetMetaRootInput(input);
      const response = await client.fetchJSON("/");
      const limited = rate(response.status, response.headers);
      if (limited) return limited;
      if (response.status === 404) return upstream("GitHub API root was not found.");
      if (response.status === 401) return upstream("GitHub rejected the meta.root.get request.");
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, root: normalizeRoot(response.body) };
      }
      return upstream("GitHub rejected the meta.root.get request.");
    },

    async markThreadDone(input: unknown) {
      const payload = validateMarkThreadDoneInput(input);
      const response = await client.fetchJSON(`/notifications/threads/${encodeURIComponent(payload.threadId)}`, {
        method: "DELETE",
      });
      const limited = rate(response.status, response.headers);
      if (limited) return limited;
      if (response.status === 204 || response.status === 200) {
        return { ok: true as const, done: true as const, threadId: payload.threadId };
      }
      if (response.status === 404) return upstream("Notification thread not found.");
      return upstream("GitHub rejected the activity.thread.mark_done request.");
    },

    async putThreadSubscription(input: unknown) {
      const payload = validatePutThreadSubscriptionInput(input);
      const body: Record<string, unknown> = {};
      if (payload.ignored !== undefined) body.ignored = payload.ignored;
      const response = await client.fetchJSON(
        `/notifications/threads/${encodeURIComponent(payload.threadId)}/subscription`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const limited = rate(response.status, response.headers);
      if (limited) return limited;
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, subscription: normalizeThreadSubscription(response.body) };
      }
      if (response.status === 404) return upstream("Thread subscription not found.");
      return upstream("GitHub rejected the activity.thread.subscription.put request.");
    },

    async deleteThreadSubscription(input: unknown) {
      const payload = validateDeleteThreadSubscriptionInput(input);
      const response = await client.fetchJSON(
        `/notifications/threads/${encodeURIComponent(payload.threadId)}/subscription`,
        { method: "DELETE" },
      );
      const limited = rate(response.status, response.headers);
      if (limited) return limited;
      if (response.status === 204 || response.status === 200) {
        return { ok: true as const, deleted: true as const, threadId: payload.threadId };
      }
      if (response.status === 404) return upstream("Thread subscription not found.");
      return upstream("GitHub rejected the activity.thread.subscription.delete request.");
    },

    async markRepoNotificationsRead(input: unknown) {
      const payload = validateMarkRepoNotificationsReadInput(input);
      const body: Record<string, unknown> = {};
      if (payload.lastReadAt !== undefined) body.last_read_at = payload.lastReadAt;
      if (payload.read !== undefined) body.read = payload.read;
      const response = await client.fetchJSON(
        `/repos/${encodeURIComponent(payload.owner)}/${encodeURIComponent(payload.repo)}/notifications`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const limited = rate(response.status, response.headers);
      if (limited) return limited;
      if (response.status === 202 || response.status === 205 || response.status === 200) {
        return { ok: true as const, marked: true as const };
      }
      if (response.status === 404) return upstream("Repository notifications were not found.");
      return upstream("GitHub rejected the activity.repo_notifications.mark_read request.");
    },

    async putRepoSubscription(input: unknown) {
      const payload = validatePutRepoSubscriptionInput(input);
      const body: Record<string, unknown> = {};
      if (payload.subscribed !== undefined) body.subscribed = payload.subscribed;
      if (payload.ignored !== undefined) body.ignored = payload.ignored;
      const response = await client.fetchJSON(
        `/repos/${encodeURIComponent(payload.owner)}/${encodeURIComponent(payload.repo)}/subscription`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const limited = rate(response.status, response.headers);
      if (limited) return limited;
      if ((response.status === 200 || response.status === 201) && isRecord(response.body)) {
        return { ok: true as const, subscription: normalizeSubscription(response.body) };
      }
      if (response.status === 404) return upstream("Repository subscription not found.");
      return upstream("GitHub rejected the activity.repo.subscription.put request.");
    },

    async deleteRepoSubscription(input: unknown) {
      const payload = validateDeleteRepoSubscriptionInput(input);
      const response = await client.fetchJSON(
        `/repos/${encodeURIComponent(payload.owner)}/${encodeURIComponent(payload.repo)}/subscription`,
        { method: "DELETE" },
      );
      const limited = rate(response.status, response.headers);
      if (limited) return limited;
      if (response.status === 204 || response.status === 200) {
        return { ok: true as const, deleted: true as const, owner: payload.owner, repo: payload.repo };
      }
      if (response.status === 404) return upstream("Repository subscription not found.");
      return upstream("GitHub rejected the activity.repo.subscription.delete request.");
    },
  };
}

function normalizeListedLicense(item: Record<string, unknown>): NormalizedListedLicense {
  return {
    key: typeof item.key === "string" ? item.key : "",
    name: typeof item.name === "string" ? item.name : "",
    spdxId: typeof item.spdx_id === "string" ? item.spdx_id : "",
    url: typeof item.url === "string" ? item.url : "",
    nodeId: typeof item.node_id === "string" ? item.node_id : "",
    htmlUrl: typeof item.html_url === "string" ? item.html_url : "",
  };
}

function normalizeRateResource(item: unknown): NormalizedRateResource {
  if (!isRecord(item)) return { limit: 0, used: 0, remaining: 0, reset: 0 };
  return {
    limit: typeof item.limit === "number" ? item.limit : 0,
    used: typeof item.used === "number" ? item.used : 0,
    remaining: typeof item.remaining === "number" ? item.remaining : 0,
    reset: typeof item.reset === "number" ? item.reset : 0,
  };
}

function normalizeRateLimit(item: Record<string, unknown>): NormalizedRateLimit {
  const resources: Record<string, NormalizedRateResource> = {};
  if (isRecord(item.resources)) {
    for (const [key, value] of Object.entries(item.resources)) {
      resources[key] = normalizeRateResource(value);
    }
  }
  return {
    resources,
    rate: normalizeRateResource(item.rate),
  };
}

function normalizeRoot(item: Record<string, unknown>): Record<string, string> {
  const root: Record<string, string> = {};
  for (const [key, value] of Object.entries(item)) {
    if (typeof value !== "string" || !key.endsWith("_url")) continue;
    root[camel(key)] = value;
  }
  return root;
}

function normalizeThreadSubscription(item: Record<string, unknown>): NormalizedThreadSubscription {
  return {
    subscribed: item.subscribed === true,
    ignored: item.ignored === true,
    reason: typeof item.reason === "string" ? item.reason : "",
    createdAt: typeof item.created_at === "string" ? item.created_at : "",
    url: typeof item.url === "string" ? item.url : "",
    threadUrl: typeof item.thread_url === "string" ? item.thread_url : "",
  };
}

function notificationQuery(payload: RepoNotificationsList): string {
  const params = new URLSearchParams();
  if (payload.perPage !== undefined) params.set("per_page", String(payload.perPage));
  if (payload.page !== undefined) params.set("page", String(payload.page));
  if (payload.all !== undefined) params.set("all", String(payload.all));
  if (payload.participating !== undefined) params.set("participating", String(payload.participating));
  if (payload.since) params.set("since", payload.since);
  if (payload.before) params.set("before", payload.before);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

function repo(input: Record<string, unknown>): RepoScope {
  return { owner: segment(input.owner, "owner"), repo: segment(input.repo, "repo") };
}

function thread(input: Record<string, unknown>): ThreadScope {
  return { threadId: segment(input.thread_id ?? input.threadId, "thread_id") };
}

function optionalPage(value: unknown, field: string, max = 100): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > max) {
    throw new Error(`${field} must be an integer between 1 and ${max}`);
  }
  return value;
}

function optionalBool(value: unknown, field: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new Error(`${field} must be a boolean`);
  return value;
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} must be a non-empty string`);
  return value;
}

function rate(status: number, headers: Record<string, string>) {
  const parsed = parseGitHubRateLimit(status, headers);
  if (!parsed.limited) return null;
  return {
    ok: false as const,
    error: {
      code: "CONNECTOR_RATE_LIMITED" as const,
      message: "GitHub rate limit exceeded.",
      retryAfterSeconds: parsed.retryAfterSeconds,
    },
  };
}

function upstream(message: string) {
  return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message } };
}

function segment(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  if (value.includes("/") || value.includes("?") || value.includes("#")) {
    throw new Error(`${field} must be a single path segment`);
  }
  return value;
}

function camel(key: string): string {
  return key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
