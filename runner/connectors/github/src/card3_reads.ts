import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";
import { executionContext } from "../../../bun/src/execution";
import { normalizeRefPath } from "./git";
import manifest from "../manifest.json";

type RepoScope = { owner: string; repo: string };
type RoleUsers = { org: string; roleId: number; perPage?: number; page?: number };
type ArchiveGet = RepoScope & { ref: string };
type AssigneeCheck = RepoScope & { assignee: string };

export type NormalizedRoleUser = { id: number; login: string };
export type NormalizedThreadSubscription = {
  subscribed: boolean;
  ignored: boolean;
  reason: string;
  createdAt: string;
  url: string;
  threadUrl: string;
};
export type NormalizedUsageItem = {
  date: string;
  product: string;
  sku: string;
  quantity: number;
  unitType: string;
  netAmount: number;
};

export function validateListOrgRoleUsersInput(input: unknown): RoleUsers {
  if (!isRecord(input)) throw new Error("orgs.organization_roles.users.list input must be an object");
  return {
    org: requireSingleSegment(input.org, "org"),
    roleId: requireId(input.role_id ?? input.roleId, "role_id"),
    perPage: optionalPage(input.perPage, "perPage", 100),
    page: optionalPage(input.page, "page", 1_000_000),
  };
}

export function validateGetRepoTarballInput(input: unknown): ArchiveGet {
  return validateArchive(input, "repos.tarball.get");
}

export function validateGetRepoZipballInput(input: unknown): ArchiveGet {
  return validateArchive(input, "repos.zipball.get");
}

export function validateCheckRepoAssigneeInput(input: unknown): AssigneeCheck {
  if (!isRecord(input)) throw new Error("repos.assignees.check input must be an object");
  return { ...repo(input), assignee: requireSingleSegment(input.assignee, "assignee") };
}

export function validateCheckUserBlockedInput(input: unknown): { username: string } {
  if (!isRecord(input)) throw new Error("user.blocks.check input must be an object");
  return { username: requireSingleSegment(input.username, "username") };
}

export function validateGetThreadSubscriptionInput(input: unknown): { threadId: string } {
  if (!isRecord(input)) throw new Error("notifications.threads.subscription.get input must be an object");
  return { threadId: requireSingleSegment(input.thread_id ?? input.threadId, "thread_id") };
}

export function validateGetUserBillingUsageInput(input: unknown): { username: string } {
  if (!isRecord(input)) throw new Error("users.billing.usage.get input must be an object");
  return { username: requireSingleSegment(input.username, "username") };
}

export function createCard3ReadsClient(options: { accessToken: string; fetch?: typeof fetch; githubClient?: GitHubClient }) {
  const fetchImpl = options.fetch ?? fetch;
  const client = options.githubClient ?? createGitHubClient({
    accessToken: options.accessToken,
    fetch: options.fetch,
    operation: "orgs.organization_roles.users.list",
  });

  return {
    async listOrgRoleUsers(input: unknown) {
      const payload = validateListOrgRoleUsersInput(input);
      const response = await client.fetchJSON(`/orgs/${encodeURIComponent(payload.org)}/organization-roles/${payload.roleId}/users${pageQuery(payload)}`);
      if (response.status === 200) {
        const raw = Array.isArray(response.body)
          ? response.body
          : (isRecord(response.body) && Array.isArray(response.body.users) ? response.body.users : null);
        if (!raw) return upstream("GitHub rejected the list organization role users request.");
        return { ok: true as const, users: raw.filter(isRecord).map(normalizeRoleUser) };
      }
      if (response.status === 404) return upstream("Organization role users not found.");
      return mapRateOrUpstream(response, "GitHub rejected the list organization role users request.");
    },

    async getTarball(input: unknown) {
      const payload = validateGetRepoTarballInput(input);
      return captureArchive(fetchImpl, options.accessToken, `${repoPath(payload)}/tarball/${encodeRef(payload.ref)}`, "repository tarball");
    },

    async getZipball(input: unknown) {
      const payload = validateGetRepoZipballInput(input);
      return captureArchive(fetchImpl, options.accessToken, `${repoPath(payload)}/zipball/${encodeRef(payload.ref)}`, "repository zipball");
    },

    async checkAssignee(input: unknown) {
      const payload = validateCheckRepoAssigneeInput(input);
      const response = await client.fetchJSON(`${repoPath(payload)}/assignees/${encodeURIComponent(payload.assignee)}`);
      if (response.status === 204) return { ok: true as const, assigned: true as const };
      if (response.status === 404) return { ok: true as const, assigned: false as const };
      return mapRateOrUpstream(response, "GitHub rejected the check assignee request.");
    },

    async checkBlocked(input: unknown) {
      const payload = validateCheckUserBlockedInput(input);
      const response = await client.fetchJSON(`/user/blocks/${encodeURIComponent(payload.username)}`);
      if (response.status === 204) return { ok: true as const, blocked: true as const };
      // GitHub uses 404 both for not-blocked and for a spam-flagged account. That stays no, not upstream.
      if (response.status === 404) return { ok: true as const, blocked: false as const };
      return mapRateOrUpstream(response, "GitHub rejected the check blocked user request.");
    },

    async getThreadSubscription(input: unknown) {
      const payload = validateGetThreadSubscriptionInput(input);
      const response = await fetchManual(fetchImpl, options.accessToken, `/notifications/threads/${encodeURIComponent(payload.threadId)}/subscription`, "notifications.threads.subscription.get");
      if (response.status === 304) {
        return { ok: true as const, notModified: true as const };
      }
      if (response.status === 200) {
        let body: unknown;
        try {
          body = JSON.parse(response.body);
        } catch {
          return upstream("GitHub rejected the get thread subscription request.");
        }
        if (!isRecord(body)) return upstream("GitHub rejected the get thread subscription request.");
        return { ok: true as const, notModified: false as const, subscription: normalizeThreadSubscription(body) };
      }
      if (response.status === 404) return upstream("Thread subscription not found.");
      return mapRateOrUpstream(response, "GitHub rejected the get thread subscription request.");
    },

    async getBillingUsage(input: unknown) {
      const payload = validateGetUserBillingUsageInput(input);
      const response = await client.fetchJSON(`/users/${encodeURIComponent(payload.username)}/settings/billing/usage`);
      if (response.status === 200 && isRecord(response.body)) {
        const raw = Array.isArray(response.body.usageItems)
          ? response.body.usageItems
          : (Array.isArray(response.body.usage_items) ? response.body.usage_items : []);
        return { ok: true as const, usageItems: raw.filter(isRecord).map(normalizeUsageItem) };
      }
      if (response.status === 404) return upstream("Billing usage not found.");
      return mapRateOrUpstream(response, "GitHub rejected the get billing usage request.");
    },
  };
}

async function captureArchive(fetchImpl: typeof fetch, accessToken: string, path: string, label: string) {
  const response = await fetchManual(fetchImpl, accessToken, path, "repos.tarball.get", false);
  if (response.status === 302 || response.status === 301 || response.status === 307 || response.status === 308) {
    const downloadUrl = response.headers.location ?? response.headers.Location ?? "";
    if (!downloadUrl) return upstream(`GitHub returned a redirect without Location for ${label}.`);
    return { ok: true as const, downloadUrl };
  }
  if (response.status === 404) return upstream(`${label[0].toUpperCase()}${label.slice(1)} not found.`);
  return mapRateOrUpstream(response, `GitHub rejected the ${label} request.`);
}

async function fetchManual(fetchImpl: typeof fetch, accessToken: string, path: string, operation: string, readBody = true) {
  const spec = (manifest.operations as Record<string, { timeoutMs?: number; maxResponseBytes?: number }>)[operation];
  const timeoutMs = spec?.timeoutMs ?? 15000;
  const maxResponseBytes = spec?.maxResponseBytes ?? 1048576;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const parent = executionContext()?.signal;
  const onParentAbort = () => controller.abort();
  if (parent) {
    if (parent.aborted) controller.abort();
    else parent.addEventListener("abort", onParentAbort, { once: true });
  }
  let response: Response;
  try {
    response = await fetchImpl(`https://api.github.com${path}`, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
  } finally {
    clearTimeout(timer);
    parent?.removeEventListener("abort", onParentAbort);
  }
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });
  if (!readBody || response.status === 302 || response.status === 304) {
    return { status: response.status, headers, body: "" };
  }
  const body = await response.text();
  if (body.length > maxResponseBytes) {
    return { status: 0, headers, body: "", tooLarge: true as const };
  }
  return { status: response.status, headers, body };
}

function normalizeRoleUser(item: Record<string, unknown>): NormalizedRoleUser {
  return {
    id: typeof item.id === "number" ? item.id : 0,
    login: typeof item.login === "string" ? item.login : "",
  };
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

function normalizeUsageItem(item: Record<string, unknown>): NormalizedUsageItem {
  return {
    date: typeof item.date === "string" ? item.date : "",
    product: typeof item.product === "string" ? item.product : "",
    sku: typeof item.sku === "string" ? item.sku : "",
    quantity: typeof item.quantity === "number" ? item.quantity : 0,
    unitType: typeof item.unitType === "string" ? item.unitType : (typeof item.unit_type === "string" ? item.unit_type : ""),
    netAmount: typeof item.netAmount === "number" ? item.netAmount : (typeof item.net_amount === "number" ? item.net_amount : 0),
  };
}

function validateArchive(input: unknown, operation: string): ArchiveGet {
  if (!isRecord(input)) throw new Error(`${operation} input must be an object`);
  return { ...repo(input), ref: requireRef(input.ref) };
}

function encodeRef(ref: string): string {
  return normalizeRefPath(ref).split("/").map((segment) => encodeURIComponent(segment)).join("/");
}

function repo(input: Record<string, unknown>): RepoScope {
  return {
    owner: requireSingleSegment(input.owner, "owner"),
    repo: requireSingleSegment(input.repo, "repo"),
  };
}

function repoPath(payload: RepoScope): string {
  return `/repos/${encodeURIComponent(payload.owner)}/${encodeURIComponent(payload.repo)}`;
}

function pageQuery(payload: { perPage?: number; page?: number }): string {
  const params = new URLSearchParams();
  if (payload.perPage) params.set("per_page", String(payload.perPage));
  if (payload.page) params.set("page", String(payload.page));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

function upstream(message: string) {
  return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message } };
}

function mapRateOrUpstream(response: { status: number; headers: Record<string, string>; tooLarge?: boolean }, message: string) {
  if (response.tooLarge) return upstream("GitHub response exceeded the connector size limit.");
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

function requireRef(value: unknown): string {
  const text = requireString(value, "ref");
  const normalized = normalizeRefPath(text);
  if (normalized.includes("?") || normalized.includes("#") || normalized.includes("\\") || normalized.startsWith("/") || normalized.includes("//")) {
    throw new Error("ref must be a relative ref");
  }
  for (const segment of normalized.split("/")) {
    if (segment.length === 0 || segment === "." || segment === "..") throw new Error("ref must be a relative ref");
  }
  return text;
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
