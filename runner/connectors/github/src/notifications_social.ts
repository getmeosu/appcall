import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";
import { normalizeGitHubRepo, type GitHubRepo } from "./repos";
import { normalizeGitHubUser, type GitHubUser } from "./users";

export type GitHubNotification = {
  id: string;
  unread?: boolean;
  reason?: string;
  updated_at?: string;
  last_read_at?: string | null;
  url?: string;
  subject?: { title?: string; url?: string; type?: string };
  repository?: { full_name?: string; id?: number };
  [key: string]: unknown;
};

export type NormalizedNotification = {
  id: string;
  provider: "github";
  threadId: string;
  unread: boolean;
  reason: string;
  title: string;
  subjectType: string;
  subjectUrl: string;
  repository: string;
  updatedAt: string;
  lastReadAt: string;
  url: string;
  modelVersion: "2026-05-16";
  raw: GitHubNotification;
};

export function normalizeGitHubNotification(thread: GitHubNotification): NormalizedNotification {
  return {
    id: `gh-notification:${thread.id}`,
    provider: "github",
    threadId: String(thread.id ?? ""),
    unread: thread.unread === true,
    reason: thread.reason ?? "",
    title: thread.subject?.title ?? "",
    subjectType: thread.subject?.type ?? "",
    subjectUrl: thread.subject?.url ?? "",
    repository: thread.repository?.full_name ?? "",
    updatedAt: thread.updated_at ?? "",
    lastReadAt: thread.last_read_at ?? "",
    url: thread.url ?? "",
    modelVersion: "2026-05-16",
    raw: thread,
  };
}

export type GitHubTeam = {
  id: number;
  name?: string;
  slug?: string;
  description?: string | null;
  privacy?: string;
  permission?: string;
  html_url?: string;
  [key: string]: unknown;
};

export type NormalizedTeam = {
  id: string;
  provider: "github";
  teamId: number;
  name: string;
  slug: string;
  description: string;
  privacy: string;
  permission: string;
  url: string;
  modelVersion: "2026-05-16";
  raw: GitHubTeam;
};

export function normalizeGitHubTeam(team: GitHubTeam): NormalizedTeam {
  return {
    id: `gh-team:${team.id}`,
    provider: "github",
    teamId: team.id,
    name: team.name ?? "",
    slug: team.slug ?? "",
    description: typeof team.description === "string" ? team.description : "",
    privacy: team.privacy ?? "",
    permission: team.permission ?? "",
    url: team.html_url ?? "",
    modelVersion: "2026-05-16",
    raw: team,
  };
}

export type ListNotificationsInput = {
  all?: boolean;
  participating?: boolean;
  since?: string;
  before?: string;
  perPage?: number;
  page?: number;
};

export function validateListNotificationsInput(input: unknown): ListNotificationsInput {
  if (!isRecord(input)) throw new Error("notifications.list input must be an object");
  return {
    all: optionalBool(input.all, "all"),
    participating: optionalBool(input.participating, "participating"),
    since: optionalString(input.since, "since"),
    before: optionalString(input.before, "before"),
    perPage: optionalPage(input.perPage, "perPage"),
    page: optionalPage(input.page, "page", 1_000_000),
  };
}

export type GetNotificationInput = { threadId: string };

export function validateGetNotificationInput(input: unknown): GetNotificationInput {
  if (!isRecord(input)) throw new Error("notifications.get input must be an object");
  return { threadId: requireString(input.threadId, "threadId") };
}

export type MarkNotificationReadInput = { threadId: string };

export function validateMarkNotificationReadInput(input: unknown): MarkNotificationReadInput {
  if (!isRecord(input)) throw new Error("notifications.mark_read input must be an object");
  return { threadId: requireString(input.threadId, "threadId") };
}

export type MarkAllNotificationsReadInput = { lastReadAt?: string; read?: boolean };

export function validateMarkAllNotificationsReadInput(input: unknown): MarkAllNotificationsReadInput {
  if (!isRecord(input)) throw new Error("notifications.mark_all_read input must be an object");
  return {
    lastReadAt: optionalString(input.lastReadAt, "lastReadAt"),
    read: optionalBool(input.read, "read"),
  };
}

export type ListOrgTeamsInput = { org: string; perPage?: number; page?: number };

export function validateListOrgTeamsInput(input: unknown): ListOrgTeamsInput {
  if (!isRecord(input)) throw new Error("orgs.teams.list input must be an object");
  return {
    org: requireString(input.org, "org"),
    perPage: optionalPage(input.perPage, "perPage"),
    page: optionalPage(input.page, "page", 1_000_000),
  };
}

export type ListTeamMembersInput = { org: string; teamSlug: string; perPage?: number; page?: number };

export function validateListTeamMembersInput(input: unknown): ListTeamMembersInput {
  if (!isRecord(input)) throw new Error("teams.members.list input must be an object");
  return {
    org: requireString(input.org, "org"),
    teamSlug: requireString(input.teamSlug, "teamSlug"),
    perPage: optionalPage(input.perPage, "perPage"),
    page: optionalPage(input.page, "page", 1_000_000),
  };
}

export type AddTeamMembershipInput = { org: string; teamSlug: string; username: string; role?: string };

export function validateAddTeamMembershipInput(input: unknown): AddTeamMembershipInput {
  if (!isRecord(input)) throw new Error("teams.membership.add input must be an object");
  const role = optionalString(input.role, "role");
  if (role !== undefined && role !== "member" && role !== "maintainer") {
    throw new Error("role must be member or maintainer");
  }
  return {
    org: requireString(input.org, "org"),
    teamSlug: requireString(input.teamSlug, "teamSlug"),
    username: requireString(input.username, "username"),
    role,
  };
}

export type ForkRepoInput = { owner: string; repo: string; organization?: string; name?: string; defaultBranchOnly?: boolean };

export function validateForkRepoInput(input: unknown): ForkRepoInput {
  if (!isRecord(input)) throw new Error("repos.fork input must be an object");
  return {
    owner: requireString(input.owner, "owner"),
    repo: requireString(input.repo, "repo"),
    organization: optionalString(input.organization, "organization"),
    name: optionalString(input.name, "name"),
    defaultBranchOnly: optionalBool(input.defaultBranchOnly, "defaultBranchOnly"),
  };
}

export type StarRepoInput = { owner: string; repo: string };

export function validateStarRepoInput(input: unknown): StarRepoInput {
  if (!isRecord(input)) throw new Error("repos.star input must be an object");
  return { owner: requireString(input.owner, "owner"), repo: requireString(input.repo, "repo") };
}

export function validateUnstarRepoInput(input: unknown): StarRepoInput {
  if (!isRecord(input)) throw new Error("repos.unstar input must be an object");
  return { owner: requireString(input.owner, "owner"), repo: requireString(input.repo, "repo") };
}

function mapError(status: number, headers: Record<string, string>, action: string) {
  if (status === 404) {
    return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: `Not found for ${action}.` } };
  }
  if (status === 422) {
    return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: `Validation failed for ${action}.` } };
  }
  if (status === 429 || (status === 403 && parseGitHubRateLimit(status, headers).limited)) {
    const rateLimit = parseGitHubRateLimit(status, headers);
    return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "GitHub rate limit exceeded.", retryAfterSeconds: rateLimit.limited ? rateLimit.retryAfterSeconds : undefined } };
  }
  return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: `GitHub rejected the ${action} request.` } };
}

function clientFor(options: { accessToken: string; fetch?: typeof fetch; githubClient?: GitHubClient }, base: GitHubClient | undefined, operation: string) {
  return base ?? createGitHubClient({ accessToken: options.accessToken, fetch: options.fetch, operation });
}

function pageQuery(perPage?: number, page?: number, extra?: Record<string, string>): string {
  const params = new URLSearchParams();
  if (extra) for (const [k, v] of Object.entries(extra)) params.set(k, v);
  if (perPage) params.set("per_page", String(perPage));
  if (page) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function createNotificationsSocialClient(options: { accessToken: string; fetch?: typeof fetch; githubClient?: GitHubClient }) {
  const base = options.githubClient;
  return {
    async listNotifications(input: unknown) {
      const payload = validateListNotificationsInput(input);
      const client = clientFor(options, base, "notifications.list");
      const extra: Record<string, string> = {};
      if (payload.all !== undefined) extra.all = String(payload.all);
      if (payload.participating !== undefined) extra.participating = String(payload.participating);
      if (payload.since) extra.since = payload.since;
      if (payload.before) extra.before = payload.before;
      const response = await client.fetchJSON(`/notifications${pageQuery(payload.perPage, payload.page, extra)}`);
      if (response.status === 200 && Array.isArray(response.body)) {
        return { ok: true as const, notifications: (response.body as GitHubNotification[]).map(normalizeGitHubNotification) };
      }
      return mapError(response.status, response.headers, "notifications.list");
    },

    async getNotification(input: unknown) {
      const payload = validateGetNotificationInput(input);
      const client = clientFor(options, base, "notifications.get");
      const response = await client.fetchJSON(`/notifications/threads/${encodeURIComponent(payload.threadId)}`);
      if (response.status === 200 && isRecord(response.body)) {
        return { ok: true as const, notification: normalizeGitHubNotification(response.body as GitHubNotification) };
      }
      return mapError(response.status, response.headers, "notifications.get");
    },

    async markRead(input: unknown) {
      const payload = validateMarkNotificationReadInput(input);
      const client = clientFor(options, base, "notifications.mark_read");
      const response = await client.fetchJSON(`/notifications/threads/${encodeURIComponent(payload.threadId)}`, { method: "PATCH" });
      if (response.status === 205 || response.status === 200) {
        return { ok: true as const, threadId: payload.threadId, unread: false };
      }
      return mapError(response.status, response.headers, "notifications.mark_read");
    },

    async markAllRead(input: unknown) {
      const payload = validateMarkAllNotificationsReadInput(input);
      const client = clientFor(options, base, "notifications.mark_all_read");
      const body: Record<string, unknown> = {};
      if (payload.lastReadAt !== undefined) body.last_read_at = payload.lastReadAt;
      if (payload.read !== undefined) body.read = payload.read;
      const response = await client.fetchJSON("/notifications", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.status === 202 || response.status === 205 || response.status === 200) {
        return { ok: true as const, marked: true };
      }
      return mapError(response.status, response.headers, "notifications.mark_all_read");
    },

    async listOrgTeams(input: unknown) {
      const payload = validateListOrgTeamsInput(input);
      const client = clientFor(options, base, "orgs.teams.list");
      const response = await client.fetchJSON(`/orgs/${encodeURIComponent(payload.org)}/teams${pageQuery(payload.perPage, payload.page)}`);
      if (response.status === 200 && Array.isArray(response.body)) {
        return { ok: true as const, teams: (response.body as GitHubTeam[]).map(normalizeGitHubTeam) };
      }
      return mapError(response.status, response.headers, "orgs.teams.list");
    },

    async listTeamMembers(input: unknown) {
      const payload = validateListTeamMembersInput(input);
      const client = clientFor(options, base, "teams.members.list");
      const response = await client.fetchJSON(`/orgs/${encodeURIComponent(payload.org)}/teams/${encodeURIComponent(payload.teamSlug)}/members${pageQuery(payload.perPage, payload.page)}`);
      if (response.status === 200 && Array.isArray(response.body)) {
        return { ok: true as const, members: (response.body as GitHubUser[]).map(normalizeGitHubUser) };
      }
      return mapError(response.status, response.headers, "teams.members.list");
    },

    async addTeamMembership(input: unknown) {
      const payload = validateAddTeamMembershipInput(input);
      const client = clientFor(options, base, "teams.membership.add");
      const body: Record<string, unknown> = {};
      if (payload.role) body.role = payload.role;
      const response = await client.fetchJSON(
        `/orgs/${encodeURIComponent(payload.org)}/teams/${encodeURIComponent(payload.teamSlug)}/memberships/${encodeURIComponent(payload.username)}`,
        { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
      );
      if ((response.status === 200 || response.status === 201) && isRecord(response.body)) {
        return {
          ok: true as const,
          username: payload.username,
          role: typeof response.body.role === "string" ? response.body.role : payload.role ?? "member",
          state: typeof response.body.state === "string" ? response.body.state : "",
        };
      }
      return mapError(response.status, response.headers, "teams.membership.add");
    },

    async forkRepo(input: unknown) {
      const payload = validateForkRepoInput(input);
      const client = clientFor(options, base, "repos.fork");
      const body: Record<string, unknown> = {};
      if (payload.organization) body.organization = payload.organization;
      if (payload.name) body.name = payload.name;
      if (payload.defaultBranchOnly !== undefined) body.default_branch_only = payload.defaultBranchOnly;
      const response = await client.fetchJSON(`/repos/${encodeURIComponent(payload.owner)}/${encodeURIComponent(payload.repo)}/forks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if ((response.status === 202 || response.status === 200) && isRecord(response.body)) {
        const repo = normalizeGitHubRepo(response.body as GitHubRepo);
        return { ok: true as const, repository: repo, id: repo.providerRepoId };
      }
      return mapError(response.status, response.headers, "repos.fork");
    },

    async starRepo(input: unknown) {
      const payload = validateStarRepoInput(input);
      const client = clientFor(options, base, "repos.star");
      const response = await client.fetchJSON(`/user/starred/${encodeURIComponent(payload.owner)}/${encodeURIComponent(payload.repo)}`, {
        method: "PUT",
        headers: { "Content-Length": "0" },
      });
      if (response.status === 204 || response.status === 200) {
        return { ok: true as const, owner: payload.owner, repo: payload.repo, starred: true };
      }
      return mapError(response.status, response.headers, "repos.star");
    },

    async unstarRepo(input: unknown) {
      const payload = validateUnstarRepoInput(input);
      const client = clientFor(options, base, "repos.unstar");
      const response = await client.fetchJSON(`/user/starred/${encodeURIComponent(payload.owner)}/${encodeURIComponent(payload.repo)}`, { method: "DELETE" });
      if (response.status === 204 || response.status === 200) {
        return { ok: true as const, owner: payload.owner, repo: payload.repo, starred: false };
      }
      return mapError(response.status, response.headers, "repos.unstar");
    },
  };
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

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
