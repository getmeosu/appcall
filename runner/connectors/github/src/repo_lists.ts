import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";
import { requireSingleSegment } from "./path_segment";
import { normalizeGitHubCommit, type GitHubCommit, type NormalizedCommit } from "./commits";
import { normalizeGitHubIssue, type GitHubIssue, type NormalizedIssue } from "./issues";
import { normalizeGitHubPullRequestSimple, type GitHubPullRequest, type NormalizedPullRequestSimple } from "./pull_requests";

// GitHub D1 (v0.87.0): repository list reads as ACTION tools. The kind=sync ops commits.list,
// pull_requests.list and issues.list are tool=false and stay as they are (poll sources); these
// actions reuse the same normalizers so a listed item has exactly the sync record's shape.
// Spec: rest-api-description 58b1e0c0 repos/list-commits, pulls/list, issues/list-for-repo.

type Repo = { owner: string; repo: string };
type Page = { perPage?: number; page?: number };
export type ListRepoCommitsInput = Repo & Page & { sha?: string; path?: string; author?: string; committer?: string; since?: string; until?: string };
export type ListRepoPullsInput = Repo & Page & { state?: "open" | "closed" | "all"; head?: string; base?: string; sort?: "created" | "updated" | "popularity" | "long-running"; direction?: "asc" | "desc" };
export type ListRepoIssuesInput = Repo & Page & {
  milestone?: string; state?: "open" | "closed" | "all"; assignee?: string; type?: string; creator?: string; mentioned?: string;
  labels?: string; sort?: "created" | "updated" | "comments"; direction?: "asc" | "desc"; since?: string;
};

type Failure = { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } };

export function validateListRepoCommitsInput(input: unknown): ListRepoCommitsInput {
  const record = requireObject(input, "repos.commits.list");
  return {
    ...repoOf(record),
    ...pageOf(record),
    ...optionalStrings(record, ["sha", "path", "author", "committer"]),
    ...optionalTimestamps(record, ["since", "until"]),
  };
}

export function validateListRepoPullsInput(input: unknown): ListRepoPullsInput {
  const record = requireObject(input, "repos.pulls.list");
  return {
    ...repoOf(record),
    ...pageOf(record),
    ...optionalStrings(record, ["head", "base"]),
    state: optionalEnum(record.state, "state", ["open", "closed", "all"] as const),
    sort: optionalEnum(record.sort, "sort", ["created", "updated", "popularity", "long-running"] as const),
    direction: optionalEnum(record.direction, "direction", ["asc", "desc"] as const),
  };
}

export function validateListRepoIssuesInput(input: unknown): ListRepoIssuesInput {
  const record = requireObject(input, "repos.issues.list");
  return {
    ...repoOf(record),
    ...pageOf(record),
    ...optionalStrings(record, ["milestone", "assignee", "type", "creator", "mentioned", "labels"]),
    ...optionalTimestamps(record, ["since"]),
    state: optionalEnum(record.state, "state", ["open", "closed", "all"] as const),
    sort: optionalEnum(record.sort, "sort", ["created", "updated", "comments"] as const),
    direction: optionalEnum(record.direction, "direction", ["asc", "desc"] as const),
  };
}

export function createRepoListsClient(options: { accessToken: string; fetch?: typeof fetch; githubClient?: GitHubClient; operation?: string }) {
  const client = options.githubClient ?? createGitHubClient({ accessToken: options.accessToken, fetch: options.fetch, operation: options.operation ?? "repos.commits.list" });
  return {
    async listCommits(input: unknown): Promise<{ ok: true; commits: NormalizedCommit[] } | Failure> {
      const p = validateListRepoCommitsInput(input);
      const response = await client.fetchJSON(`${repoPath(p)}/commits${query(p, { sha: p.sha, path: p.path, author: p.author, committer: p.committer, since: p.since, until: p.until })}`);
      // 409 = empty repository (spec: repos/list-commits); not an empty list we can fabricate.
      return readList(response, (item) => typeof item.sha === "string", (items) => ({ ok: true as const, commits: (items as GitHubCommit[]).map(normalizeGitHubCommit) }), "Repository not found.", "GitHub rejected the repos.commits.list request.");
    },
    async listPulls(input: unknown): Promise<{ ok: true; pullRequests: NormalizedPullRequestSimple[] } | Failure> {
      const p = validateListRepoPullsInput(input);
      const response = await client.fetchJSON(`${repoPath(p)}/pulls${query(p, { state: p.state, head: p.head, base: p.base, sort: p.sort, direction: p.direction })}`);
      return readList(response, hasIssueKeys, (items) => ({ ok: true as const, pullRequests: (items as GitHubPullRequest[]).map(normalizeGitHubPullRequestSimple) }), "Repository not found.", "GitHub rejected the repos.pulls.list request.");
    },
    async listIssues(input: unknown): Promise<{ ok: true; issues: NormalizedIssue[] } | Failure> {
      const p = validateListRepoIssuesInput(input);
      const response = await client.fetchJSON(`${repoPath(p)}/issues${query(p, {
        milestone: p.milestone, state: p.state, assignee: p.assignee, type: p.type, creator: p.creator, mentioned: p.mentioned,
        labels: p.labels, sort: p.sort, direction: p.direction, since: p.since,
      })}`);
      // GitHub returns pull requests on this route too (they carry a pull_request key). Like the
      // issues.list sync op, they are left out; use repos.pulls.list for pull requests.
      return readList(response, hasIssueKeys, (items) => ({
        ok: true as const,
        issues: (items as GitHubIssue[]).filter((i) => i.pull_request === undefined || i.pull_request === null).map(normalizeGitHubIssue),
      }), "Repository not found.", "GitHub rejected the repos.issues.list request.");
    },
  };
}

function hasIssueKeys(item: Record<string, unknown>): boolean {
  return typeof item.id === "number" && typeof item.number === "number" && typeof item.title === "string";
}

function readList<T>(
  response: { status: number; headers: Record<string, string>; body: unknown },
  valid: (item: Record<string, unknown>) => boolean,
  ok: (items: Record<string, unknown>[]) => T,
  notFound: string,
  rejected: string,
): T | Failure {
  if (response.status === 200) {
    if (Array.isArray(response.body) && response.body.every((item) => isRecord(item) && valid(item))) return ok(response.body as Record<string, unknown>[]);
    return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "GitHub returned a malformed list." } };
  }
  if (response.status === 404) return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: notFound } };
  if (response.status === 429 || (response.status === 403 && parseGitHubRateLimit(response.status, response.headers).limited)) {
    const rateLimit = parseGitHubRateLimit(response.status, response.headers);
    return { ok: false, error: { code: "CONNECTOR_RATE_LIMITED", message: "GitHub rate limit exceeded.", retryAfterSeconds: rateLimit.limited ? rateLimit.retryAfterSeconds : undefined } };
  }
  return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: rejected } };
}

function repoPath(p: Repo): string {
  return `/repos/${encodeURIComponent(p.owner)}/${encodeURIComponent(p.repo)}`;
}

function query(page: Page, params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined) search.set(key, value);
  if (page.perPage !== undefined) search.set("per_page", String(page.perPage));
  if (page.page !== undefined) search.set("page", String(page.page));
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

function repoOf(record: Record<string, unknown>): Repo {
  return { owner: requireSingleSegment(record.owner, "owner"), repo: requireSingleSegment(record.repo, "repo") };
}

function pageOf(record: Record<string, unknown>): Page {
  const out: Page = {};
  const perPage = optionalInt(record.perPage ?? record.per_page, "perPage", 100);
  const page = optionalInt(record.page, "page", 1_000_000);
  if (perPage !== undefined) out.perPage = perPage;
  if (page !== undefined) out.page = page;
  return out;
}

function optionalInt(value: unknown, field: string, max: number): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > max) throw new Error(`${field} must be an integer between 1 and ${max}`);
  return value;
}

function optionalStrings<K extends string>(record: Record<string, unknown>, keys: readonly K[]): Partial<Record<K, string>> {
  const out: Partial<Record<K, string>> = {};
  for (const key of keys) {
    const value = record[key];
    if (value === undefined) continue;
    if (typeof value !== "string" || value.trim().length === 0 || value.length > 1024) throw new Error(`${key} must be a non-empty string`);
    out[key] = value;
  }
  return out;
}

function optionalTimestamps<K extends string>(record: Record<string, unknown>, keys: readonly K[]): Partial<Record<K, string>> {
  const out = optionalStrings(record, keys);
  for (const key of keys) {
    const value = out[key];
    if (value !== undefined && Number.isNaN(Date.parse(value))) throw new Error(`${key} must be an ISO 8601 timestamp`);
  }
  return out;
}

function optionalEnum<T extends string>(value: unknown, field: string, allowed: readonly T[]): T | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) throw new Error(`${field} must be one of ${allowed.join(", ")}`);
  return value as T;
}

function requireObject(input: unknown, op: string): Record<string, unknown> {
  if (!isRecord(input)) throw new Error(`${op} input must be an object`);
  return input;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
