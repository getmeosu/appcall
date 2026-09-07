import { parseIssuesResponse } from "./issues";
import type { NormalizedIssue } from "./issues";
import { parseProjectsResponse } from "./projects";
import type { NormalizedProject } from "./projects";
import { parseUsersResponse } from "./users";
import type { NormalizedUser } from "./users";

export type IssuesSearchSyncInput = { response: unknown };
export type IssuesSearchSyncResult = { provider: "jira"; operation: "issues.search"; items: NormalizedIssue[]; nextPageToken: string | null };

export function executeIssuesSearchSync(input: IssuesSearchSyncInput): IssuesSearchSyncResult {
  const parsed = parseIssuesResponse(input.response);
  return { provider: "jira", operation: "issues.search", items: parsed.issues, nextPageToken: parsed.nextPageToken };
}

export type ProjectsListSyncInput = { response: unknown };
export type ProjectsListSyncResult = { provider: "jira"; operation: "projects.list"; items: NormalizedProject[]; nextStart: number | null };

export function executeProjectsListSync(input: ProjectsListSyncInput): ProjectsListSyncResult {
  const parsed = parseProjectsResponse(input.response);
  return { provider: "jira", operation: "projects.list", items: parsed.projects, nextStart: parsed.nextStart };
}

export type UsersListSyncInput = { response: unknown };
export type UsersListSyncResult = { provider: "jira"; operation: "users.list"; items: NormalizedUser[]; nextStart: number | null };

export function executeUsersListSync(input: UsersListSyncInput): UsersListSyncResult {
  const parsed = parseUsersResponse(input.response);
  return { provider: "jira", operation: "users.list", items: parsed.users, nextStart: parsed.nextStart };
}
