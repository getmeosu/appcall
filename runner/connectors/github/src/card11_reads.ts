import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";
import { normalizeGitHubRepo, type GitHubRepo } from "./repos";
import { normalizeGitHubUser, type GitHubUser } from "./users";

type Page = { perPage?: number; page?: number };

export type RunnerDownload = {
  os: string;
  architecture: string;
  download_url: string;
  filename: string;
  sha256_checksum: string;
};

export type RunnerLabel = { id: number; name: string; type: string };

export type Runner = {
  id: number;
  name: string;
  os: string;
  status: string;
  busy: boolean;
  labels: RunnerLabel[];
};

export function validateListOrgRunnerDownloadsInput(input: unknown): { org: string } {
  if (!isRecord(input)) throw new Error("orgs.actions.runners.downloads.list input must be an object");
  return { org: segment(input.org, "org") };
}

export function validateListRepoRunnerDownloadsInput(input: unknown): { owner: string; repo: string } {
  if (!isRecord(input)) throw new Error("repos.actions.runners.downloads.list input must be an object");
  return repoScope(input);
}

export function validateListOrgRunnersInput(input: unknown): { org: string } & Page {
  if (!isRecord(input)) throw new Error("orgs.actions.runners.list input must be an object");
  return { org: segment(input.org, "org"), ...page(input) };
}

export function validateListRepoRunnersInput(input: unknown): { owner: string; repo: string } & Page {
  if (!isRecord(input)) throw new Error("repos.actions.runners.list input must be an object");
  return { ...repoScope(input), ...page(input) };
}

export function validateCheckUserFollowingInput(input: unknown): { username: string; targetUser: string } {
  if (!isRecord(input)) throw new Error("users.following.check input must be an object");
  return { username: segment(input.username, "username"), targetUser: segment(input.targetUser, "targetUser") };
}

export function validateListUserFollowersInput(input: unknown): { username: string } & Page {
  if (!isRecord(input)) throw new Error("users.followers.list input must be an object");
  return { username: segment(input.username, "username"), ...page(input) };
}

export function validateListAuthenticatedFollowersInput(input: unknown): Page {
  if (!isRecord(input)) throw new Error("user.followers.list input must be an object");
  return page(input);
}

export function validateListUserSubscriptionsInput(input: unknown): { username: string } & Page {
  if (!isRecord(input)) throw new Error("users.subscriptions.list input must be an object");
  return { username: segment(input.username, "username"), ...page(input) };
}

export function validateListAuthenticatedSubscriptionsInput(input: unknown): Page {
  if (!isRecord(input)) throw new Error("user.subscriptions.list input must be an object");
  return page(input);
}

export function validateListRepoStargazersInput(input: unknown): { owner: string; repo: string } & Page {
  if (!isRecord(input)) throw new Error("repos.stargazers.list input must be an object");
  return { ...repoScope(input), ...page(input) };
}

export function validateListUserFollowingInput(input: unknown): { username: string } & Page {
  if (!isRecord(input)) throw new Error("users.following.list input must be an object");
  return { username: segment(input.username, "username"), ...page(input) };
}

export function validateListAuthenticatedFollowingInput(input: unknown): Page {
  if (!isRecord(input)) throw new Error("user.following.list input must be an object");
  return page(input);
}

export function validateListRepoSubscribersInput(input: unknown): { owner: string; repo: string } & Page {
  if (!isRecord(input)) throw new Error("repos.subscribers.list input must be an object");
  return { ...repoScope(input), ...page(input) };
}

export function createCard11ReadsClient(options: { accessToken: string; fetch?: typeof fetch; githubClient?: GitHubClient }) {
  const client = options.githubClient ?? createGitHubClient({
    accessToken: options.accessToken,
    fetch: options.fetch,
    operation: "orgs.actions.runners.list",
  });

  return {
    async listOrgRunnerDownloads(input: unknown) {
      const payload = validateListOrgRunnerDownloadsInput(input);
      return downloads(client, `/orgs/${encodeURIComponent(payload.org)}/actions/runners/downloads`, "orgs.actions.runners.downloads.list");
    },
    async listRepoRunnerDownloads(input: unknown) {
      const payload = validateListRepoRunnerDownloadsInput(input);
      return downloads(client, `/repos/${encodeURIComponent(payload.owner)}/${encodeURIComponent(payload.repo)}/actions/runners/downloads`, "repos.actions.runners.downloads.list");
    },
    async listOrgRunners(input: unknown) {
      const payload = validateListOrgRunnersInput(input);
      return runners(client, `/orgs/${encodeURIComponent(payload.org)}/actions/runners${pageQuery(payload)}`, "orgs.actions.runners.list");
    },
    async listRepoRunners(input: unknown) {
      const payload = validateListRepoRunnersInput(input);
      return runners(client, `/repos/${encodeURIComponent(payload.owner)}/${encodeURIComponent(payload.repo)}/actions/runners${pageQuery(payload)}`, "repos.actions.runners.list");
    },
    async checkFollowing(input: unknown) {
      const payload = validateCheckUserFollowingInput(input);
      const path = `/users/${encodeURIComponent(payload.username)}/following/${encodeURIComponent(payload.targetUser)}`;
      const response = await client.fetchJSON(path);
      const limited = rate(response.status, response.headers);
      if (limited) return limited;
      // Official docs: 204 if username follows target_user, 404 if not. Empty bodies are expected.
      // This is the only card-11 route where 404 is a successful read.
      if (response.status === 204) return { ok: true as const, following: true as const };
      if (response.status === 404) return { ok: true as const, following: false as const };
      return upstream("GitHub rejected the users.following.check request.");
    },
    async listUserFollowers(input: unknown) {
      const payload = validateListUserFollowersInput(input);
      return users(client, `/users/${encodeURIComponent(payload.username)}/followers${pageQuery(payload)}`, "users.followers.list", "GitHub followers were not found.");
    },
    async listAuthenticatedFollowers(input: unknown) {
      const payload = validateListAuthenticatedFollowersInput(input);
      return users(client, `/user/followers${pageQuery(payload)}`, "user.followers.list", "GitHub followers were not found.");
    },
    async listUserSubscriptions(input: unknown) {
      const payload = validateListUserSubscriptionsInput(input);
      return repos(client, `/users/${encodeURIComponent(payload.username)}/subscriptions${pageQuery(payload)}`, "users.subscriptions.list", "GitHub subscriptions were not found.");
    },
    async listAuthenticatedSubscriptions(input: unknown) {
      const payload = validateListAuthenticatedSubscriptionsInput(input);
      return repos(client, `/user/subscriptions${pageQuery(payload)}`, "user.subscriptions.list", "GitHub subscriptions were not found.");
    },
    async listStargazers(input: unknown) {
      const payload = validateListRepoStargazersInput(input);
      return users(client, `/repos/${encodeURIComponent(payload.owner)}/${encodeURIComponent(payload.repo)}/stargazers${pageQuery(payload)}`, "repos.stargazers.list", "GitHub stargazers were not found.");
    },
    async listUserFollowing(input: unknown) {
      const payload = validateListUserFollowingInput(input);
      return users(client, `/users/${encodeURIComponent(payload.username)}/following${pageQuery(payload)}`, "users.following.list", "GitHub following list was not found.");
    },
    async listAuthenticatedFollowing(input: unknown) {
      const payload = validateListAuthenticatedFollowingInput(input);
      return users(client, `/user/following${pageQuery(payload)}`, "user.following.list", "GitHub following list was not found.");
    },
    async listSubscribers(input: unknown) {
      const payload = validateListRepoSubscribersInput(input);
      return users(client, `/repos/${encodeURIComponent(payload.owner)}/${encodeURIComponent(payload.repo)}/subscribers${pageQuery(payload)}`, "repos.subscribers.list", "GitHub subscribers were not found.");
    },
  };
}

async function downloads(client: GitHubClient, path: string, operation: string) {
  const result = await read(client, path, operation, "GitHub runner downloads were not found.");
  if (!result.ok) return result;
  if (!Array.isArray(result.body)) return upstream(`GitHub rejected the ${operation} request.`);
  return { ok: true as const, downloads: result.body.filter(isRecord).map(normalizeDownload) };
}

async function runners(client: GitHubClient, path: string, operation: string) {
  const result = await read(client, path, operation, "GitHub runners were not found.");
  if (!result.ok) return result;
  if (!isRecord(result.body) || !Array.isArray(result.body.runners)) return upstream(`GitHub rejected the ${operation} request.`);
  const runners = result.body.runners.filter(isRecord).map(normalizeRunner);
  return {
    ok: true as const,
    totalCount: typeof result.body.total_count === "number" ? result.body.total_count : runners.length,
    runners,
  };
}

async function users(client: GitHubClient, path: string, operation: string, missing: string) {
  const result = await read(client, path, operation, missing);
  if (!result.ok) return result;
  if (!Array.isArray(result.body)) return upstream(`GitHub rejected the ${operation} request.`);
  return { ok: true as const, users: result.body.filter(isRecord).map((user) => normalizeGitHubUser(user as GitHubUser)) };
}

async function repos(client: GitHubClient, path: string, operation: string, missing: string) {
  const result = await read(client, path, operation, missing);
  if (!result.ok) return result;
  if (!Array.isArray(result.body)) return upstream(`GitHub rejected the ${operation} request.`);
  return { ok: true as const, repositories: result.body.filter(isRecord).map((repo) => normalizeGitHubRepo(repo as GitHubRepo)) };
}

async function read(client: GitHubClient, path: string, operation: string, missing: string) {
  const response = await client.fetchJSON(path);
  const limited = rate(response.status, response.headers);
  if (limited) return limited;
  if (response.status === 404) return upstream(missing);
  if (response.status === 401) return upstream(`GitHub rejected the ${operation} request.`);
  if (response.status === 200) return { ok: true as const, body: response.body };
  return upstream(`GitHub rejected the ${operation} request.`);
}

function normalizeDownload(item: Record<string, unknown>): RunnerDownload {
  return {
    os: typeof item.os === "string" ? item.os : "",
    architecture: typeof item.architecture === "string" ? item.architecture : "",
    download_url: typeof item.download_url === "string" ? item.download_url : "",
    filename: typeof item.filename === "string" ? item.filename : "",
    sha256_checksum: typeof item.sha256_checksum === "string" ? item.sha256_checksum : "",
  };
}

function normalizeRunner(item: Record<string, unknown>): Runner {
  const labels = Array.isArray(item.labels) ? item.labels.filter(isRecord).map((label) => ({
    id: typeof label.id === "number" ? label.id : 0,
    name: typeof label.name === "string" ? label.name : "",
    type: typeof label.type === "string" ? label.type : "",
  })) : [];
  return {
    id: typeof item.id === "number" ? item.id : 0,
    name: typeof item.name === "string" ? item.name : "",
    os: typeof item.os === "string" ? item.os : "",
    status: typeof item.status === "string" ? item.status : "",
    busy: item.busy === true,
    labels,
  };
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

function repoScope(input: Record<string, unknown>): { owner: string; repo: string } {
  return { owner: segment(input.owner, "owner"), repo: segment(input.repo, "repo") };
}

function page(input: Record<string, unknown>): Page {
  return {
    ...(optionalPage(input.perPage, "perPage") !== undefined ? { perPage: optionalPage(input.perPage, "perPage") } : {}),
    ...(optionalPage(input.page, "page", 1_000_000) !== undefined ? { page: optionalPage(input.page, "page", 1_000_000) } : {}),
  };
}

function pageQuery(payload: Page): string {
  const params = new URLSearchParams();
  if (payload.perPage) params.set("per_page", String(payload.perPage));
  if (payload.page) params.set("page", String(payload.page));
  const text = params.toString();
  return text ? `?${text}` : "";
}

function segment(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  if (value.includes("/") || value.includes("?") || value.includes("#")) {
    throw new Error(`${field} must be a single path segment`);
  }
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
