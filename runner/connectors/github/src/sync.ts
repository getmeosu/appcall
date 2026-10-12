import { normalizeGitHubIssue, parseIssuesResponse, type NormalizedIssue } from "./issues";
import { normalizeGitHubPullRequestSimple, parsePullRequestsResponse, type NormalizedPullRequestSimple } from "./pull_requests";
import { requireSingleSegment } from "./path_segment";
import { normalizeGitHubCommit, parseCommitsResponse, type NormalizedCommit } from "./commits";
import { normalizeGitHubRepository, parseRepositoriesResponse, type NormalizedRepository } from "./repositories";
import { createGitHubClient, parseGitHubRateLimit, parseNextPageFromLinkHeader } from "./http";
import { listArtifacts, listAuthenticatedUserFollowers, listDeploymentStatuses, listDeployments, listWorkflows } from "./actions";

// GitHub sync ops.
//
// With credentials (`accessToken`, merged in by the control plane) a sync op fetches one page
// live and returns `{provider, operation, items, cursor}`. `cursor` is the next page number
// taken from GitHub's Link rel="next" header, or null on the last page. Pass it back as input
// `cursor` to read the next page. Without credentials the four original list syncs keep their
// offline mode: they parse a caller-supplied `response` and return `nextLink`.

export type SyncPage<T> = { provider: "github"; operation: string; items: T[]; cursor: string | null };
type Input = Record<string, unknown>;

export type IssuesListSyncInput = { response: unknown } | Input;
export type IssuesListSyncResult = { provider: "github"; operation: "issues.list"; items: NormalizedIssue[]; nextLink: string | null };

export function executeIssuesListSync(input: IssuesListSyncInput): IssuesListSyncResult | Promise<SyncPage<NormalizedIssue>> {
  if (hasCredentials(input)) {
    const payload = repoInput(input, "issues.list", { state: STATES, sort: ["created", "updated", "comments"], direction: DIRECTIONS, since: "string" });
    return livePage(input, "issues.list", `/repos/${payload.owner}/${payload.repo}/issues`, payload.query, (body) =>
      parseIssuesResponse(body).issues.filter((i) => !i.pull_request).map((i) => normalizeGitHubIssue(i)));
  }
  const response = requireRecord((input as { response?: unknown }).response, "response");
  const parsed = parseIssuesResponse(response);
  const nonPRs = parsed.issues.filter((i) => !i.pull_request);
  return { provider: "github", operation: "issues.list", items: nonPRs.map((i) => normalizeGitHubIssue(i)), nextLink: parsed.nextLink };
}

export type PullRequestsListSyncInput = { response: unknown } | Input;
export type PullRequestsListSyncResult = { provider: "github"; operation: "pull_requests.list"; items: NormalizedPullRequestSimple[]; nextLink: string | null };

export function executePullRequestsListSync(input: PullRequestsListSyncInput): PullRequestsListSyncResult | Promise<SyncPage<NormalizedPullRequestSimple>> {
  if (hasCredentials(input)) {
    const payload = repoInput(input, "pull_requests.list", { state: STATES, sort: ["created", "updated", "popularity", "long-running"], direction: DIRECTIONS });
    return livePage(input, "pull_requests.list", `/repos/${payload.owner}/${payload.repo}/pulls`, payload.query, (body) =>
      parsePullRequestsResponse(body).pullRequests.map((p) => normalizeGitHubPullRequestSimple(p)));
  }
  const response = requireRecord((input as { response?: unknown }).response, "response");
  const parsed = parsePullRequestsResponse(response);
  return { provider: "github", operation: "pull_requests.list", items: parsed.pullRequests.map((p) => normalizeGitHubPullRequestSimple(p)), nextLink: parsed.nextLink };
}

export type CommitsListSyncInput = { response: unknown } | Input;
export type CommitsListSyncResult = { provider: "github"; operation: "commits.list"; items: NormalizedCommit[]; nextLink: string | null };

export function executeCommitsListSync(input: CommitsListSyncInput): CommitsListSyncResult | Promise<SyncPage<NormalizedCommit>> {
  if (hasCredentials(input)) {
    const payload = repoInput(input, "commits.list", { sha: "string", path: "string", since: "string", until: "string" });
    return livePage(input, "commits.list", `/repos/${payload.owner}/${payload.repo}/commits`, payload.query, (body) =>
      parseCommitsResponse(body).commits.map((c) => normalizeGitHubCommit(c)));
  }
  const response = requireRecord((input as { response?: unknown }).response, "response");
  const parsed = parseCommitsResponse(response);
  return { provider: "github", operation: "commits.list", items: parsed.commits.map((c) => normalizeGitHubCommit(c)), nextLink: parsed.nextLink };
}

export type RepositoriesListSyncInput = { response: unknown } | Input;
export type RepositoriesListSyncResult = { provider: "github"; operation: "repositories.list"; items: NormalizedRepository[]; nextLink: string | null };

export function executeRepositoriesListSync(input: RepositoriesListSyncInput): RepositoriesListSyncResult | Promise<SyncPage<NormalizedRepository>> {
  if (hasCredentials(input)) {
    const query = filters(input, "repositories.list", {
      visibility: ["all", "public", "private"], affiliation: "string", sort: ["created", "updated", "pushed", "full_name"], direction: DIRECTIONS,
    });
    return livePage(input, "repositories.list", "/user/repos", query, (body) =>
      parseRepositoriesResponse(body).repositories.map((r) => normalizeGitHubRepository(r)));
  }
  const response = requireRecord((input as { response?: unknown }).response, "response");
  const parsed = parseRepositoriesResponse(response);
  return { provider: "github", operation: "repositories.list", items: parsed.repositories.map((r) => normalizeGitHubRepository(r)), nextLink: parsed.nextLink };
}

// ─── TRIG-3a polling syncs ────────────────────────────────────────────────────
// Each one runs the matching read action with the same input (`cursor` becomes `page`), so the
// request is byte-identical to that action's and the items are its normalized output.

/**
 * Field filters for polled triggers. A trigger in a poll block's onNew/onChanged applies to an
 * emitted item only when its filter passes; the filter's parameter comes from the trigger
 * subscription's config. GITHUB_WORKFLOW_RUN_ARTIFACT_ADDED is tagged on every new artifact from
 * actions.artifacts.sync and narrows to one run by the item's provider workflow_run.id. (When this
 * stack sits on the TRIG-2 trigger map, this becomes its FieldFilter { kind: "workflowRunId" }.)
 */
export const POLLED_TRIGGER_FILTERS: Readonly<Record<string, { kind: "workflowRunId"; param: "runId" }>> = {
  GITHUB_WORKFLOW_RUN_ARTIFACT_ADDED: { kind: "workflowRunId", param: "runId" },
};

export function matchesPolledTrigger(trigger: string, item: unknown, params: Record<string, unknown> = {}): boolean {
  const filter = POLLED_TRIGGER_FILTERS[trigger];
  if (!filter) return true;
  const runId = params[filter.param];
  if (typeof runId !== "number" || !Number.isSafeInteger(runId) || runId <= 0) return false;
  const raw = isRecord(item) && isRecord(item.raw) ? item.raw : {};
  const run = isRecord(raw.workflow_run) ? raw.workflow_run : {};
  return run.id === runId;
}

export function executeArtifactsSync(input: unknown): Promise<SyncPage<Record<string, unknown>>> {
  return viaAction(input, "actions.artifacts.sync", listArtifacts, "artifacts", "providerArtifactId");
}

export function executeWorkflowsSync(input: unknown): Promise<SyncPage<Record<string, unknown>>> {
  return viaAction(input, "actions.workflows.sync", listWorkflows, "workflows", "providerWorkflowId");
}

/**
 * Each deployment item carries `latestStatus` (the newest deployment status, from its statuses_url
 * GET /repos/{owner}/{repo}/deployments/{id}/statuses?per_page=1, which GitHub returns newest first,
 * via deployments.statuses.list) and `latestStatusState` (that status's state, or null when the
 * deployment has no status yet). `latestStatusState` is the poll versionKey for
 * GITHUB_DEPLOYMENT_STATE_CHANGED_TRIGGER. One status read per deployment, so perPage is capped at
 * 30 (default 20) and the reads run at most 5 at a time.
 */
export async function executeDeploymentsSync(input: unknown): Promise<SyncPage<Record<string, unknown>>> {
  const operation = "deployments.sync";
  const payload = requireCredentials(input, operation);
  const perPage = payload.perPage ?? DEPLOYMENTS_DEFAULT_PER_PAGE;
  if (typeof perPage !== "number" || !Number.isInteger(perPage) || perPage < 1 || perPage > DEPLOYMENTS_MAX_PER_PAGE) {
    throw new Error(`${operation}: perPage must be an integer from 1 to ${DEPLOYMENTS_MAX_PER_PAGE}`);
  }
  const page = await viaAction({ ...payload, perPage }, operation, listDeployments, "deployments", "providerDeploymentId");
  const items = await mapLimit(page.items, STATUS_CONCURRENCY, async (item) => {
    const output = await listDeploymentStatuses({
      owner: payload.owner, repo: payload.repo, deploymentId: item.providerDeploymentId, perPage: 1,
      accessToken: payload.accessToken, fetch: payload.fetch,
    }) as Record<string, unknown>;
    if (!Array.isArray(output.statuses)) throw upstream(`${operation}: GitHub returned no statuses list`);
    const latest = output.statuses.find(isRecord) ?? null;
    if (latest === null) return { ...item, latestStatus: null, latestStatusState: null };
    const raw = isRecord(latest.raw) ? latest.raw : {};
    if (typeof raw.state !== "string" || raw.state.length === 0) throw upstream(`${operation}: GitHub returned a status without a state`);
    return { ...item, latestStatus: latest, latestStatusState: raw.state };
  });
  return { ...page, items };
}

export function executeFollowersSync(input: unknown): Promise<SyncPage<Record<string, unknown>>> {
  return viaAction(input, "user.followers.sync", listAuthenticatedUserFollowers, "users", "providerUserId");
}

// ─── helpers ──────────────────────────────────────────────────────────────────

const STATES = ["open", "closed", "all"];
const DIRECTIONS = ["asc", "desc"];
const DEFAULT_PER_PAGE = 100;
const DEPLOYMENTS_DEFAULT_PER_PAGE = 20;
const DEPLOYMENTS_MAX_PER_PAGE = 30;
const STATUS_CONCURRENCY = 5;
type Rule = readonly string[] | "string";

function hasCredentials(input: unknown): input is Input {
  return isRecord(input) && typeof input.accessToken === "string" && input.accessToken.length > 0;
}

function requireCredentials(input: unknown, operation: string): Input {
  if (!hasCredentials(input)) throw new Error(`${operation} requires connection credentials (accessToken)`);
  if ("page" in input) throw new Error(`${operation} pages with cursor; page is not accepted`);
  return input;
}

async function viaAction(
  input: unknown,
  operation: string,
  action: (input: unknown) => Record<string, unknown> | Promise<Record<string, unknown>>,
  listKey: string,
  idKey: string,
): Promise<SyncPage<Record<string, unknown>>> {
  const payload = requireCredentials(input, operation);
  const page = pageFromCursor(payload.cursor, operation);
  const baseFetch = typeof payload.fetch === "function" ? (payload.fetch as typeof fetch) : fetch;
  let link: string | null = null;
  const capture = (async (url: string | URL | Request, init?: RequestInit) => {
    const response = await baseFetch(url, init);
    link = response.headers.get("link");
    return response;
  }) as typeof fetch;
  const { cursor: _cursor, ...rest } = payload;
  const output = await action({ ...rest, perPage: rest.perPage ?? DEFAULT_PER_PAGE, ...(page ? { page } : {}), fetch: capture });
  const list = output[listKey];
  if (!Array.isArray(list)) throw upstream(`${operation}: GitHub returned no ${listKey} list`);
  const items = list.filter(isRecord);
  for (const item of items) {
    // The shared normalizers default a missing id to 0; a poll keyed on that would collapse items.
    const id = item[idKey];
    if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0) throw upstream(`${operation}: GitHub returned an item without an id`);
  }
  return { provider: "github", operation, items, cursor: nextCursor(link, operation) };
}

async function livePage<T>(
  input: Input,
  operation: string,
  path: string,
  query: Record<string, string>,
  normalize: (body: unknown[]) => T[],
): Promise<SyncPage<T>> {
  const page = pageFromCursor(input.cursor, operation);
  const params = new URLSearchParams({ ...query, ...(page ? { page: String(page) } : {}) });
  const client = createGitHubClient({
    accessToken: input.accessToken as string,
    fetch: typeof input.fetch === "function" ? (input.fetch as typeof fetch) : undefined,
    operation,
  });
  const response = await client.fetchJSON(`${path}?${params.toString()}`);
  const headers = response.headers as Record<string, string>;
  if (response.status === 200 && Array.isArray(response.body)) {
    return { provider: "github", operation, items: normalize(response.body), cursor: nextCursor(headers.link ?? null, operation) };
  }
  const limited = parseGitHubRateLimit(response.status, headers);
  if (limited.limited) {
    throw { ok: false, code: "CONNECTOR_RATE_LIMITED", message: `GitHub rate limited ${operation}.`, retryAfterSeconds: limited.retryAfterSeconds };
  }
  if (response.status === 404) throw upstream(`${operation}: GitHub resource not found.`);
  throw upstream(`GitHub rejected the ${operation} request.`);
}

function repoInput(input: Input, operation: string, rules: Record<string, Rule>) {
  return { owner: repoPathPart(input.owner, "owner", operation), repo: repoPathPart(input.repo, "repo", operation), query: filters(input, operation, rules) };
}

function filters(input: Input, operation: string, rules: Record<string, Rule>): Record<string, string> {
  if ("page" in input) throw new Error(`${operation} pages with cursor; page is not accepted`);
  const query: Record<string, string> = {};
  for (const [key, rule] of Object.entries(rules)) {
    const value = input[key];
    if (value === undefined) continue;
    if (typeof value !== "string" || value.length === 0) throw new Error(`${operation}: ${key} must be a non-empty string`);
    if (rule !== "string" && !rule.includes(value)) throw new Error(`${operation}: ${key} must be one of ${rule.join(", ")}`);
    query[key] = value;
  }
  query.per_page = String(perPage(input.perPage, operation));
  return query;
}

function perPage(value: unknown, operation: string): number {
  if (value === undefined) return DEFAULT_PER_PAGE;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 100) {
    throw new Error(`${operation}: perPage must be an integer from 1 to 100`);
  }
  return value;
}

/** Owner/repo path parts: the shared FIX-SEGMENT guard, plus no "%" (no pre-encoded parts). */
function repoPathPart(value: unknown, field: string, operation: string): string {
  const part = requireSingleSegment(value, `${operation}: ${field}`);
  if (part.includes("%")) throw new Error(`${operation}: ${field} must be a single path segment`);
  return part;
}

function pageFromCursor(cursor: unknown, operation: string): number | null {
  if (cursor === undefined || cursor === null || cursor === "") return null;
  if (typeof cursor !== "string" || !/^[1-9][0-9]{0,5}$/.test(cursor)) throw new Error(`${operation}: cursor must be a cursor returned by this sync`);
  return Number(cursor);
}

function nextCursor(link: string | null, operation: string): string | null {
  const next = parseNextPageFromLinkHeader(link);
  if (!next) return null;
  let page: string | null = null;
  try {
    page = new URL(next).searchParams.get("page");
  } catch {
    page = null;
  }
  if (!page || !/^[1-9][0-9]{0,5}$/.test(page)) throw upstream(`${operation}: GitHub returned an unsupported next link`);
  return page;
}

async function mapLimit<T, R>(items: T[], limit: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await run(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function upstream(message: string) {
  return { ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message };
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null) throw new Error(`${field} must be an object or array`);
  return value as Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
