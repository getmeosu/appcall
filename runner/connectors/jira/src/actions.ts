import { createJiraClient, parseJiraRateLimit } from "./http";
import { normalizeIssue } from "./issues";
import { normalizeProject } from "./projects";
import { normalizeUser } from "./users";
import { normalizeComment, parseCommentsResponse, parseTransitionsResponse } from "./comments";

// ────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ────────────────────────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function handleError(result: { status: number; headers: Record<string, string>; body: unknown }) {
  const rateLimit = parseJiraRateLimit(result.status, result.headers);
  if (rateLimit.limited) {
    return { ok: false, code: "CONNECTOR_RATE_LIMITED", message: "Jira rate limit exceeded.", retryAfterSeconds: rateLimit.retryAfterSeconds };
  }
  return { ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message: "Jira rejected the request." };
}

function getClient(input: Record<string, unknown>, operation: string) {
  const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
  return createJiraClient({ accessToken: input.accessToken as string, cloudId: input.cloudId as string, fetch: fetchFn, operation });
}

function hasAuth(input: unknown): input is Record<string, unknown> & { accessToken: string; cloudId: string } {
  return isRecord(input) && typeof input.accessToken === "string" && typeof input.cloudId === "string";
}

// ────────────────────────────────────────────────────────────────────────────
// issues.create  (existing)
// ────────────────────────────────────────────────────────────────────────────

export type CreateIssueInput = { projectKey: string; summary: string; description?: string; issueType?: string; priority?: string; assigneeId?: string; labels?: string[] };

export function createIssue(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (hasAuth(input)) {
    const payload = validateCreateIssueInput(input);
    const client = getClient(input, "issues.create");
    const fields: Record<string, unknown> = {
      project: { key: payload.projectKey },
      summary: payload.summary,
      description: payload.description ? { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: payload.description }] }] } : undefined,
      issuetype: { name: payload.issueType || "Task" },
    };
    if (payload.priority) fields.priority = { name: payload.priority };
    if (payload.assigneeId) fields.assignee = { accountId: payload.assigneeId };
    if (payload.labels?.length) fields.labels = payload.labels;

    return client
      .fetchJSON("/issue", { method: "POST", body: JSON.stringify({ fields }) })
      .then((result) => {
        if (result.status === 201) return { connector: "jira", action: "issues.create", source: "connector", issue: normalizeIssue(result.body as any) };
        throw handleError(result);
      });
  }
  return { connector: "jira", action: "issues.create", source: "connector", validated: validateCreateIssueInput(input) };
}

function validateCreateIssueInput(input: unknown): CreateIssueInput {
  if (!isRecord(input)) throw new Error("create issue input must be an object");
  return {
    projectKey: requireString(input.projectKey, "projectKey"),
    summary: requireString(input.summary, "summary"),
    description: typeof input.description === "string" ? input.description : undefined,
    issueType: typeof input.issueType === "string" ? input.issueType : undefined,
    priority: typeof input.priority === "string" ? input.priority : undefined,
    assigneeId: typeof input.assigneeId === "string" ? input.assigneeId : undefined,
    labels: Array.isArray(input.labels) ? input.labels.filter((l): l is string => typeof l === "string") : undefined,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// issues.get
// ────────────────────────────────────────────────────────────────────────────

export type GetIssueInput = { issueKey: string };

export function validateGetIssueInput(input: unknown): GetIssueInput {
  if (!isRecord(input)) throw new Error("get issue input must be an object");
  return { issueKey: requireString(input.issueKey, "issueKey") };
}

export function getIssue(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (hasAuth(input)) {
    const payload = validateGetIssueInput(input);
    return getClient(input, "issues.get")
      .fetchJSON(`/issue/${encodeURIComponent(payload.issueKey)}`)
      .then((result) => {
        if (result.status === 200) return { connector: "jira", action: "issues.get", source: "connector", issue: normalizeIssue(result.body as any) };
        throw handleError(result);
      });
  }
  return { connector: "jira", action: "issues.get", source: "connector", validated: validateGetIssueInput(input) };
}

// ────────────────────────────────────────────────────────────────────────────
// issues.update
// ────────────────────────────────────────────────────────────────────────────

export type UpdateIssueInput = { issueKey: string; summary?: string; description?: string; priority?: string; assigneeId?: string; labels?: string[]; dueDate?: string };

export function validateUpdateIssueInput(input: unknown): UpdateIssueInput {
  if (!isRecord(input)) throw new Error("update issue input must be an object");
  return {
    issueKey: requireString(input.issueKey, "issueKey"),
    summary: typeof input.summary === "string" ? input.summary : undefined,
    description: typeof input.description === "string" ? input.description : undefined,
    priority: typeof input.priority === "string" ? input.priority : undefined,
    assigneeId: typeof input.assigneeId === "string" ? input.assigneeId : undefined,
    labels: Array.isArray(input.labels) ? input.labels.filter((l): l is string => typeof l === "string") : undefined,
    dueDate: typeof input.dueDate === "string" ? input.dueDate : undefined,
  };
}

export function updateIssue(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (hasAuth(input)) {
    const payload = validateUpdateIssueInput(input);
    const fields: Record<string, unknown> = {};
    if (payload.summary !== undefined) fields.summary = payload.summary;
    if (payload.description !== undefined) {
      fields.description = { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: payload.description }] }] };
    }
    if (payload.priority !== undefined) fields.priority = { name: payload.priority };
    if (payload.assigneeId !== undefined) fields.assignee = { accountId: payload.assigneeId };
    if (payload.labels !== undefined) fields.labels = payload.labels;
    if (payload.dueDate !== undefined) fields.duedate = payload.dueDate;

    return getClient(input, "issues.update")
      .fetchJSON(`/issue/${encodeURIComponent(payload.issueKey)}`, { method: "PUT", body: JSON.stringify({ fields }) })
      .then((result) => {
        if (result.status === 204) return { connector: "jira", action: "issues.update", source: "connector", updated: true };
        throw handleError(result);
      });
  }
  return { connector: "jira", action: "issues.update", source: "connector", validated: validateUpdateIssueInput(input) };
}

// ────────────────────────────────────────────────────────────────────────────
// issues.delete
// ────────────────────────────────────────────────────────────────────────────

export type DeleteIssueInput = { issueKey: string; deleteSubtasks?: boolean };

export function validateDeleteIssueInput(input: unknown): DeleteIssueInput {
  if (!isRecord(input)) throw new Error("delete issue input must be an object");
  return {
    issueKey: requireString(input.issueKey, "issueKey"),
    deleteSubtasks: input.deleteSubtasks === true,
  };
}

export function deleteIssue(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (hasAuth(input)) {
    const payload = validateDeleteIssueInput(input);
    const qs = payload.deleteSubtasks ? "?deleteSubtasks=true" : "";
    return getClient(input, "issues.delete")
      .fetchJSON(`/issue/${encodeURIComponent(payload.issueKey)}${qs}`, { method: "DELETE" })
      .then((result) => {
        if (result.status === 204) return { connector: "jira", action: "issues.delete", source: "connector", deleted: true };
        throw handleError(result);
      });
  }
  return { connector: "jira", action: "issues.delete", source: "connector", validated: validateDeleteIssueInput(input) };
}

// ────────────────────────────────────────────────────────────────────────────
// issues.jql_search
// ────────────────────────────────────────────────────────────────────────────

export type JqlSearchInput = { jql: string; maxResults?: number; startAt?: number; fields?: string[] };

export function validateJqlSearchInput(input: unknown): JqlSearchInput {
  if (!isRecord(input)) throw new Error("jql search input must be an object");
  return {
    jql: requireString(input.jql, "jql"),
    maxResults: typeof input.maxResults === "number" ? input.maxResults : 50,
    startAt: typeof input.startAt === "number" ? input.startAt : 0,
    fields: Array.isArray(input.fields) ? input.fields.filter((f): f is string => typeof f === "string") : undefined,
  };
}

export function jqlSearch(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (hasAuth(input)) {
    const payload = validateJqlSearchInput(input);
    const body: Record<string, unknown> = {
      jql: payload.jql,
      maxResults: payload.maxResults,
      startAt: payload.startAt,
    };
    if (payload.fields) body.fields = payload.fields;

    return getClient(input, "issues.jql_search")
      .fetchJSON("/search", { method: "POST", body: JSON.stringify(body) })
      .then((result) => {
        if (result.status === 200) {
          const r = isRecord(result.body) ? result.body : {};
          const issues = Array.isArray(r.issues) ? r.issues : [];
          return {
            connector: "jira",
            action: "issues.jql_search",
            source: "connector",
            issues: issues.filter(isRecord).map((i) => normalizeIssue(i as any)),
            total: typeof r.total === "number" ? r.total : 0,
            startAt: typeof r.startAt === "number" ? r.startAt : 0,
            maxResults: typeof r.maxResults === "number" ? r.maxResults : 0,
          };
        }
        throw handleError(result);
      });
  }
  return { connector: "jira", action: "issues.jql_search", source: "connector", validated: validateJqlSearchInput(input) };
}

// ────────────────────────────────────────────────────────────────────────────
// issues.comments.add
// ────────────────────────────────────────────────────────────────────────────

export type AddCommentInput = { issueKey: string; body: string };

export function validateAddCommentInput(input: unknown): AddCommentInput {
  if (!isRecord(input)) throw new Error("add comment input must be an object");
  return {
    issueKey: requireString(input.issueKey, "issueKey"),
    body: requireString(input.body, "body"),
  };
}

export function addComment(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (hasAuth(input)) {
    const payload = validateAddCommentInput(input);
    const adfBody = {
      type: "doc",
      version: 1,
      content: [{ type: "paragraph", content: [{ type: "text", text: payload.body }] }],
    };
    return getClient(input, "issues.comments.add")
      .fetchJSON(`/issue/${encodeURIComponent(payload.issueKey)}/comment`, { method: "POST", body: JSON.stringify({ body: adfBody }) })
      .then((result) => {
        if (result.status === 201) {
          return { connector: "jira", action: "issues.comments.add", source: "connector", comment: normalizeComment(result.body as any, payload.issueKey) };
        }
        throw handleError(result);
      });
  }
  return { connector: "jira", action: "issues.comments.add", source: "connector", validated: validateAddCommentInput(input) };
}

// ────────────────────────────────────────────────────────────────────────────
// issues.comments.list
// ────────────────────────────────────────────────────────────────────────────

export type ListCommentsInput = { issueKey: string; startAt?: number; maxResults?: number };

export function validateListCommentsInput(input: unknown): ListCommentsInput {
  if (!isRecord(input)) throw new Error("list comments input must be an object");
  return {
    issueKey: requireString(input.issueKey, "issueKey"),
    startAt: typeof input.startAt === "number" ? input.startAt : 0,
    maxResults: typeof input.maxResults === "number" ? input.maxResults : 50,
  };
}

export function listComments(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (hasAuth(input)) {
    const payload = validateListCommentsInput(input);
    const qs = `?startAt=${payload.startAt}&maxResults=${payload.maxResults}`;
    return getClient(input, "issues.comments.list")
      .fetchJSON(`/issue/${encodeURIComponent(payload.issueKey)}/comment${qs}`)
      .then((result) => {
        if (result.status === 200) {
          const parsed = parseCommentsResponse(result.body, payload.issueKey);
          return { connector: "jira", action: "issues.comments.list", source: "connector", comments: parsed.comments, total: parsed.total };
        }
        throw handleError(result);
      });
  }
  return { connector: "jira", action: "issues.comments.list", source: "connector", validated: validateListCommentsInput(input) };
}

// ────────────────────────────────────────────────────────────────────────────
// issues.transitions.list
// ────────────────────────────────────────────────────────────────────────────

export type ListTransitionsInput = { issueKey: string };

export function validateListTransitionsInput(input: unknown): ListTransitionsInput {
  if (!isRecord(input)) throw new Error("list transitions input must be an object");
  return { issueKey: requireString(input.issueKey, "issueKey") };
}

export function listTransitions(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (hasAuth(input)) {
    const payload = validateListTransitionsInput(input);
    return getClient(input, "issues.transitions.list")
      .fetchJSON(`/issue/${encodeURIComponent(payload.issueKey)}/transitions`)
      .then((result) => {
        if (result.status === 200) {
          const parsed = parseTransitionsResponse(result.body);
          return { connector: "jira", action: "issues.transitions.list", source: "connector", transitions: parsed.transitions };
        }
        throw handleError(result);
      });
  }
  return { connector: "jira", action: "issues.transitions.list", source: "connector", validated: validateListTransitionsInput(input) };
}

// ────────────────────────────────────────────────────────────────────────────
// issues.transitions.do
// ────────────────────────────────────────────────────────────────────────────

export type DoTransitionInput = { issueKey: string; transitionId: string; comment?: string };

export function validateDoTransitionInput(input: unknown): DoTransitionInput {
  if (!isRecord(input)) throw new Error("do transition input must be an object");
  return {
    issueKey: requireString(input.issueKey, "issueKey"),
    transitionId: requireString(input.transitionId, "transitionId"),
    comment: typeof input.comment === "string" ? input.comment : undefined,
  };
}

export function doTransition(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (hasAuth(input)) {
    const payload = validateDoTransitionInput(input);
    const body: Record<string, unknown> = { transition: { id: payload.transitionId } };
    if (payload.comment) {
      body.update = {
        comment: [
          {
            add: {
              body: {
                type: "doc",
                version: 1,
                content: [{ type: "paragraph", content: [{ type: "text", text: payload.comment }] }],
              },
            },
          },
        ],
      };
    }
    return getClient(input, "issues.transitions.do")
      .fetchJSON(`/issue/${encodeURIComponent(payload.issueKey)}/transitions`, { method: "POST", body: JSON.stringify(body) })
      .then((result) => {
        if (result.status === 204) return { connector: "jira", action: "issues.transitions.do", source: "connector", transitioned: true };
        throw handleError(result);
      });
  }
  return { connector: "jira", action: "issues.transitions.do", source: "connector", validated: validateDoTransitionInput(input) };
}

// ────────────────────────────────────────────────────────────────────────────
// issues.assign
// ────────────────────────────────────────────────────────────────────────────

export type AssignIssueInput = { issueKey: string; accountId?: string };

export function validateAssignIssueInput(input: unknown): AssignIssueInput {
  if (!isRecord(input)) throw new Error("assign issue input must be an object");
  return {
    issueKey: requireString(input.issueKey, "issueKey"),
    accountId: typeof input.accountId === "string" ? input.accountId : undefined,
  };
}

export function assignIssue(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (hasAuth(input)) {
    const payload = validateAssignIssueInput(input);
    const body = { accountId: payload.accountId ?? null };
    return getClient(input, "issues.assign")
      .fetchJSON(`/issue/${encodeURIComponent(payload.issueKey)}/assignee`, { method: "PUT", body: JSON.stringify(body) })
      .then((result) => {
        if (result.status === 204) return { connector: "jira", action: "issues.assign", source: "connector", assigned: true };
        throw handleError(result);
      });
  }
  return { connector: "jira", action: "issues.assign", source: "connector", validated: validateAssignIssueInput(input) };
}

// ────────────────────────────────────────────────────────────────────────────
// projects.get
// ────────────────────────────────────────────────────────────────────────────

export type GetProjectInput = { projectKey: string };

export function validateGetProjectInput(input: unknown): GetProjectInput {
  if (!isRecord(input)) throw new Error("get project input must be an object");
  return { projectKey: requireString(input.projectKey, "projectKey") };
}

export function getProject(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (hasAuth(input)) {
    const payload = validateGetProjectInput(input);
    return getClient(input, "projects.get")
      .fetchJSON(`/project/${encodeURIComponent(payload.projectKey)}`)
      .then((result) => {
        if (result.status === 200) return { connector: "jira", action: "projects.get", source: "connector", project: normalizeProject(result.body as any) };
        throw handleError(result);
      });
  }
  return { connector: "jira", action: "projects.get", source: "connector", validated: validateGetProjectInput(input) };
}

// ────────────────────────────────────────────────────────────────────────────
// users.get
// ────────────────────────────────────────────────────────────────────────────

export type GetUserInput = { accountId: string };

export function validateGetUserInput(input: unknown): GetUserInput {
  if (!isRecord(input)) throw new Error("get user input must be an object");
  return { accountId: requireString(input.accountId, "accountId") };
}

export function getUser(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (hasAuth(input)) {
    const payload = validateGetUserInput(input);
    return getClient(input, "users.get")
      .fetchJSON(`/user?accountId=${encodeURIComponent(payload.accountId)}`)
      .then((result) => {
        if (result.status === 200) return { connector: "jira", action: "users.get", source: "connector", user: normalizeUser(result.body as any) };
        throw handleError(result);
      });
  }
  return { connector: "jira", action: "users.get", source: "connector", validated: validateGetUserInput(input) };
}
