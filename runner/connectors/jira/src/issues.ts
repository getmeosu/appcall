import { extractAdfText, prop } from "./http";

export type NormalizedIssue = {
  id: string;
  provider: "jira";
  providerIssueId: string;
  key: string;
  summary: string;
  description: string;
  status: string;
  statusCategory: string;
  priority: string;
  issueType: string;
  assigneeId: string;
  assigneeName: string;
  reporterId: string;
  reporterName: string;
  projectId: string;
  projectKey: string;
  projectName: string;
  labels: string[];
  dueDate: string;
  created: string;
  updated: string;
  resolutionDate: string;
  modelVersion: "2026-05-16";
  raw: Record<string, unknown>;
};

export function normalizeIssue(data: Record<string, unknown>): NormalizedIssue {
  const fields = isRecord(data.fields) ? data.fields : {};
  const status = isRecord(fields.status) ? fields.status : {};
  const statusCategory = isRecord(status.statusCategory) ? status.statusCategory : {};
  const priority = isRecord(fields.priority) ? fields.priority : {};
  const issueType = isRecord(fields.issuetype) ? fields.issuetype : {};
  const assignee = isRecord(fields.assignee) ? fields.assignee : {};
  const reporter = isRecord(fields.reporter) ? fields.reporter : {};
  const project = isRecord(fields.project) ? fields.project : {};

  return {
    id: `jira-issue:${prop(data, "id")}`,
    provider: "jira",
    providerIssueId: prop(data, "id"),
    key: prop(data, "key"),
    summary: prop(fields, "summary"),
    description: extractAdfText(fields.description),
    status: prop(status, "name"),
    statusCategory: prop(statusCategory, "name"),
    priority: prop(priority, "name"),
    issueType: prop(issueType, "name"),
    assigneeId: prop(assignee, "accountId"),
    assigneeName: prop(assignee, "displayName"),
    reporterId: prop(reporter, "accountId"),
    reporterName: prop(reporter, "displayName"),
    projectId: prop(project, "id"),
    projectKey: prop(project, "key"),
    projectName: prop(project, "name"),
    labels: Array.isArray(fields.labels) ? fields.labels.filter((l): l is string => typeof l === "string") : [],
    dueDate: prop(fields, "duedate"),
    created: prop(fields, "created"),
    updated: prop(fields, "updated"),
    resolutionDate: prop(fields, "resolutiondate"),
    modelVersion: "2026-05-16",
    raw: data,
  };
}

export function parseIssuesResponse(response: unknown): { issues: NormalizedIssue[]; nextPageToken: string | null } {
  if (!isRecord(response)) return { issues: [], nextPageToken: null };
  const issues = response.issues;
  if (!Array.isArray(issues)) return { issues: [], nextPageToken: null };
  return {
    issues: issues.filter(isRecord).map(normalizeIssue),
    nextPageToken: typeof response.nextPageToken === "string" && response.nextPageToken.length > 0 ? response.nextPageToken : null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
