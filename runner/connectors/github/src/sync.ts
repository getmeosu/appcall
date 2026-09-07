import { normalizeGitHubIssue, parseIssuesResponse, type NormalizedIssue } from "./issues";
import { normalizeGitHubPullRequest, parsePullRequestsResponse, type NormalizedPullRequest } from "./pull_requests";
import { normalizeGitHubCommit, parseCommitsResponse, type NormalizedCommit } from "./commits";
import { normalizeGitHubRepository, parseRepositoriesResponse, type NormalizedRepository } from "./repositories";

export type IssuesListSyncInput = { response: unknown };
export type IssuesListSyncResult = { provider: "github"; operation: "issues.list"; items: NormalizedIssue[]; nextLink: string | null };

export function executeIssuesListSync(input: IssuesListSyncInput): IssuesListSyncResult {
  const response = requireRecord(input.response, "response");
  const parsed = parseIssuesResponse(response);
  const nonPRs = parsed.issues.filter((i) => !i.pull_request);
  return { provider: "github", operation: "issues.list", items: nonPRs.map((i) => normalizeGitHubIssue(i)), nextLink: parsed.nextLink };
}

export type PullRequestsListSyncInput = { response: unknown };
export type PullRequestsListSyncResult = { provider: "github"; operation: "pull_requests.list"; items: NormalizedPullRequest[]; nextLink: string | null };

export function executePullRequestsListSync(input: PullRequestsListSyncInput): PullRequestsListSyncResult {
  const response = requireRecord(input.response, "response");
  const parsed = parsePullRequestsResponse(response);
  return { provider: "github", operation: "pull_requests.list", items: parsed.pullRequests.map((p) => normalizeGitHubPullRequest(p)), nextLink: parsed.nextLink };
}

export type CommitsListSyncInput = { response: unknown };
export type CommitsListSyncResult = { provider: "github"; operation: "commits.list"; items: NormalizedCommit[]; nextLink: string | null };

export function executeCommitsListSync(input: CommitsListSyncInput): CommitsListSyncResult {
  const response = requireRecord(input.response, "response");
  const parsed = parseCommitsResponse(response);
  return { provider: "github", operation: "commits.list", items: parsed.commits.map((c) => normalizeGitHubCommit(c)), nextLink: parsed.nextLink };
}

export type RepositoriesListSyncInput = { response: unknown };
export type RepositoriesListSyncResult = { provider: "github"; operation: "repositories.list"; items: NormalizedRepository[]; nextLink: string | null };

export function executeRepositoriesListSync(input: RepositoriesListSyncInput): RepositoriesListSyncResult {
  const response = requireRecord(input.response, "response");
  const parsed = parseRepositoriesResponse(response);
  return { provider: "github", operation: "repositories.list", items: parsed.repositories.map((r) => normalizeGitHubRepository(r)), nextLink: parsed.nextLink };
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null) throw new Error(`${field} must be an object or array`);
  return value as Record<string, unknown>;
}
