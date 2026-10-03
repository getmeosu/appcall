import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";

type RepoScope = { owner: string; repo: string };
type TrafficWindow = RepoScope & { per?: "day" | "week" };

export type NormalizedContributorWeek = { w: number; a: number; d: number; c: number };

export type NormalizedContributor = {
  login: string;
  id: number;
  total: number;
  weeks: NormalizedContributorWeek[];
};

export type NormalizedTrafficPoint = { timestamp: string; count: number; uniques: number };

export type NormalizedTrafficSeries = {
  count: number;
  uniques: number;
  points: NormalizedTrafficPoint[];
};

export type NormalizedPunchCard = { day: number; hour: number; commits: number };

export type NormalizedCommitActivity = { days: number[]; total: number; week: number };

export type NormalizedCodeFrequency = { week: number; additions: number; deletions: number };

export type NormalizedParticipation = { all: number[]; owner: number[] };

export type NormalizedPopularPath = { path: string; title: string; count: number; uniques: number };

export type NormalizedPopularReferrer = { referrer: string; count: number; uniques: number };

export function validateListStatsContributorsInput(input: unknown): RepoScope {
  return repoInput(input, "repos.stats.contributors.list");
}

export function validateGetTrafficViewsInput(input: unknown): TrafficWindow {
  return windowInput(input, "repos.traffic.views.get");
}

export function validateGetTrafficClonesInput(input: unknown): TrafficWindow {
  return windowInput(input, "repos.traffic.clones.get");
}

export function validateGetStatsPunchCardInput(input: unknown): RepoScope {
  return repoInput(input, "repos.stats.punch_card.get");
}

export function validateListStatsCommitActivityInput(input: unknown): RepoScope {
  return repoInput(input, "repos.stats.commit_activity.list");
}

export function validateGetStatsCodeFrequencyInput(input: unknown): RepoScope {
  return repoInput(input, "repos.stats.code_frequency.get");
}

export function validateGetStatsParticipationInput(input: unknown): RepoScope {
  return repoInput(input, "repos.stats.participation.get");
}

export function validateListTrafficPopularPathsInput(input: unknown): RepoScope {
  return repoInput(input, "repos.traffic.popular.paths.list");
}

export function validateListTrafficPopularReferrersInput(input: unknown): RepoScope {
  return repoInput(input, "repos.traffic.popular.referrers.list");
}

export function normalizeContributor(item: Record<string, unknown>): NormalizedContributor {
  const author = isRecord(item.author) ? item.author : {};
  const weeks = Array.isArray(item.weeks) ? item.weeks.filter(isRecord).map(normalizeWeek) : [];
  return {
    login: typeof author.login === "string" ? author.login : "",
    id: typeof author.id === "number" ? author.id : 0,
    total: numberOrZero(item.total),
    weeks,
  };
}

export function normalizeTrafficSeries(item: Record<string, unknown>, pointsKey: "views" | "clones"): NormalizedTrafficSeries {
  const raw = Array.isArray(item[pointsKey]) ? item[pointsKey] : [];
  return {
    count: numberOrZero(item.count),
    uniques: numberOrZero(item.uniques),
    points: raw.filter(isRecord).map(normalizeTrafficPoint),
  };
}

export function normalizePunchCard(item: unknown): NormalizedPunchCard | null {
  if (!Array.isArray(item) || item.length < 3) return null;
  if (typeof item[0] !== "number" || typeof item[1] !== "number" || typeof item[2] !== "number") return null;
  return { day: item[0], hour: item[1], commits: item[2] };
}

export function normalizeCommitActivity(item: Record<string, unknown>): NormalizedCommitActivity {
  const days = Array.isArray(item.days) ? item.days.filter((value): value is number => typeof value === "number") : [];
  return { days, total: numberOrZero(item.total), week: numberOrZero(item.week) };
}

export function normalizeCodeFrequency(item: unknown): NormalizedCodeFrequency | null {
  if (!Array.isArray(item) || item.length < 3) return null;
  if (typeof item[0] !== "number" || typeof item[1] !== "number" || typeof item[2] !== "number") return null;
  return { week: item[0], additions: item[1], deletions: item[2] };
}

export function normalizeParticipation(item: Record<string, unknown>): NormalizedParticipation {
  return {
    all: numberArray(item.all),
    owner: numberArray(item.owner),
  };
}

export function normalizePopularPath(item: Record<string, unknown>): NormalizedPopularPath {
  return {
    path: typeof item.path === "string" ? item.path : "",
    title: typeof item.title === "string" ? item.title : "",
    count: numberOrZero(item.count),
    uniques: numberOrZero(item.uniques),
  };
}

export function normalizePopularReferrer(item: Record<string, unknown>): NormalizedPopularReferrer {
  return {
    referrer: typeof item.referrer === "string" ? item.referrer : "",
    count: numberOrZero(item.count),
    uniques: numberOrZero(item.uniques),
  };
}

export function createTrafficClient(options: { accessToken: string; fetch?: typeof fetch; githubClient?: GitHubClient }) {
  const client = options.githubClient ?? createGitHubClient({
    accessToken: options.accessToken,
    fetch: options.fetch,
    operation: "repos.stats.contributors.list",
  });

  return {
    async listContributors(input: unknown) {
      const payload = validateListStatsContributorsInput(input);
      const result = await read(client, `${repoPath(payload)}/stats/contributors`, "repos.stats.contributors.list");
      if (!result.ok) return result;
      if (!Array.isArray(result.body)) return upstream("GitHub rejected the repos.stats.contributors.list request.");
      return { ok: true as const, contributors: result.body.filter(isRecord).map(normalizeContributor) };
    },

    async getViews(input: unknown) {
      const payload = validateGetTrafficViewsInput(input);
      const result = await read(client, `${repoPath(payload)}/traffic/views${perQuery(payload.per)}`, "repos.traffic.views.get");
      if (!result.ok) return result;
      if (!isRecord(result.body)) return upstream("GitHub rejected the repos.traffic.views.get request.");
      return { ok: true as const, views: normalizeTrafficSeries(result.body, "views") };
    },

    async getClones(input: unknown) {
      const payload = validateGetTrafficClonesInput(input);
      const result = await read(client, `${repoPath(payload)}/traffic/clones${perQuery(payload.per)}`, "repos.traffic.clones.get");
      if (!result.ok) return result;
      if (!isRecord(result.body)) return upstream("GitHub rejected the repos.traffic.clones.get request.");
      return { ok: true as const, clones: normalizeTrafficSeries(result.body, "clones") };
    },

    async getPunchCard(input: unknown) {
      const payload = validateGetStatsPunchCardInput(input);
      const result = await read(client, `${repoPath(payload)}/stats/punch_card`, "repos.stats.punch_card.get");
      if (!result.ok) return result;
      if (!Array.isArray(result.body)) return upstream("GitHub rejected the repos.stats.punch_card.get request.");
      return { ok: true as const, punchCard: result.body.map(normalizePunchCard).filter((row): row is NormalizedPunchCard => row !== null) };
    },

    async listCommitActivity(input: unknown) {
      const payload = validateListStatsCommitActivityInput(input);
      const result = await read(client, `${repoPath(payload)}/stats/commit_activity`, "repos.stats.commit_activity.list");
      if (!result.ok) return result;
      if (!Array.isArray(result.body)) return upstream("GitHub rejected the repos.stats.commit_activity.list request.");
      return { ok: true as const, activity: result.body.filter(isRecord).map(normalizeCommitActivity) };
    },

    async getCodeFrequency(input: unknown) {
      const payload = validateGetStatsCodeFrequencyInput(input);
      const result = await read(client, `${repoPath(payload)}/stats/code_frequency`, "repos.stats.code_frequency.get");
      if (!result.ok) return result;
      if (!Array.isArray(result.body)) return upstream("GitHub rejected the repos.stats.code_frequency.get request.");
      return { ok: true as const, frequency: result.body.map(normalizeCodeFrequency).filter((row): row is NormalizedCodeFrequency => row !== null) };
    },

    async getParticipation(input: unknown) {
      const payload = validateGetStatsParticipationInput(input);
      const result = await read(client, `${repoPath(payload)}/stats/participation`, "repos.stats.participation.get");
      if (!result.ok) return result;
      if (!isRecord(result.body)) return upstream("GitHub rejected the repos.stats.participation.get request.");
      return { ok: true as const, participation: normalizeParticipation(result.body) };
    },

    async listPopularPaths(input: unknown) {
      const payload = validateListTrafficPopularPathsInput(input);
      const result = await read(client, `${repoPath(payload)}/traffic/popular/paths`, "repos.traffic.popular.paths.list");
      if (!result.ok) return result;
      if (!Array.isArray(result.body)) return upstream("GitHub rejected the repos.traffic.popular.paths.list request.");
      return { ok: true as const, paths: result.body.filter(isRecord).map(normalizePopularPath) };
    },

    async listPopularReferrers(input: unknown) {
      const payload = validateListTrafficPopularReferrersInput(input);
      const result = await read(client, `${repoPath(payload)}/traffic/popular/referrers`, "repos.traffic.popular.referrers.list");
      if (!result.ok) return result;
      if (!Array.isArray(result.body)) return upstream("GitHub rejected the repos.traffic.popular.referrers.list request.");
      return { ok: true as const, referrers: result.body.filter(isRecord).map(normalizePopularReferrer) };
    },
  };
}

async function read(client: GitHubClient, path: string, operation: string) {
  const response = await client.fetchJSON(path);
  const rate = parseGitHubRateLimit(response.status, response.headers);
  if (rate.limited) {
    return {
      ok: false as const,
      error: {
        code: "CONNECTOR_RATE_LIMITED" as const,
        message: "GitHub rate limit exceeded.",
        retryAfterSeconds: rate.retryAfterSeconds,
      },
    };
  }
  // Stats routes return 202 while GitHub is still building the cache. That is
  // not an empty success and must not be retried into one.
  if (response.status === 202) {
    return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: "GitHub result is not ready." } };
  }
  if (response.status === 404) {
    return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: "GitHub repository was not found." } };
  }
  if (response.status === 200) return { ok: true as const, body: response.body };
  if (response.status === 429 || (response.status === 403 && parseGitHubRateLimit(response.status, response.headers).limited)) {
    const again = parseGitHubRateLimit(response.status, response.headers);
    return {
      ok: false as const,
      error: {
        code: "CONNECTOR_RATE_LIMITED" as const,
        message: "GitHub rate limit exceeded.",
        retryAfterSeconds: again.limited ? again.retryAfterSeconds : undefined,
      },
    };
  }
  return upstream(`GitHub rejected the ${operation} request.`);
}

function repoInput(input: unknown, operation: string): RepoScope {
  if (!isRecord(input)) throw new Error(`${operation} input must be an object`);
  return repo(input);
}

function windowInput(input: unknown, operation: string): TrafficWindow {
  if (!isRecord(input)) throw new Error(`${operation} input must be an object`);
  return { ...repo(input), per: optionalPer(input.per) };
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

function perQuery(per: "day" | "week" | undefined): string {
  if (!per) return "";
  return `?${new URLSearchParams({ per }).toString()}`;
}

function upstream(message: string) {
  return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message } };
}

function normalizeWeek(item: Record<string, unknown>): NormalizedContributorWeek {
  return { w: numberOrZero(item.w), a: numberOrZero(item.a), d: numberOrZero(item.d), c: numberOrZero(item.c) };
}

function normalizeTrafficPoint(item: Record<string, unknown>): NormalizedTrafficPoint {
  return {
    timestamp: typeof item.timestamp === "string" ? item.timestamp : "",
    count: numberOrZero(item.count),
    uniques: numberOrZero(item.uniques),
  };
}

function numberArray(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((item): item is number => typeof item === "number") : [];
}

function numberOrZero(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

function optionalPer(value: unknown): "day" | "week" | undefined {
  if (value === undefined) return undefined;
  if (value !== "day" && value !== "week") throw new Error("per must be day or week");
  return value;
}

function requireSingleSegment(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  if (value.includes("/") || value.includes("?") || value.includes("#")) {
    throw new Error(`${field} must be a single path segment`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
