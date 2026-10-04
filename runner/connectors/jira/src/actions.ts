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

function adfParagraph(text: string): Record<string, unknown> {
  return { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text }] }] };
}

// ────────────────────────────────────────────────────────────────────────────
// issues.changelog.get
// ────────────────────────────────────────────────────────────────────────────

export type GetIssueChangelogInput = { issueKey: string; startAt?: number; maxResults?: number };

export function validateGetIssueChangelogInput(input: unknown): GetIssueChangelogInput {
  if (!isRecord(input)) throw new Error("get changelog input must be an object");
  return {
    issueKey: requireString(input.issueKey, "issueKey"),
    startAt: typeof input.startAt === "number" ? input.startAt : 0,
    maxResults: typeof input.maxResults === "number" ? input.maxResults : 50,
  };
}

export function getIssueChangelog(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (hasAuth(input)) {
    const payload = validateGetIssueChangelogInput(input);
    const qs = `?startAt=${payload.startAt}&maxResults=${payload.maxResults}`;
    return getClient(input, "issues.changelog.get")
      .fetchJSON(`/issue/${encodeURIComponent(payload.issueKey)}/changelog${qs}`)
      .then((result) => {
        if (result.status === 200) {
          const r = isRecord(result.body) ? result.body : {};
          const values = Array.isArray(r.values) ? r.values.filter(isRecord) : [];
          return {
            connector: "jira",
            action: "issues.changelog.get",
            source: "connector",
            values,
            total: typeof r.total === "number" ? r.total : values.length,
            startAt: typeof r.startAt === "number" ? r.startAt : payload.startAt,
            maxResults: typeof r.maxResults === "number" ? r.maxResults : payload.maxResults,
          };
        }
        throw handleError(result);
      });
  }
  return { connector: "jira", action: "issues.changelog.get", source: "connector", validated: validateGetIssueChangelogInput(input) };
}

// ────────────────────────────────────────────────────────────────────────────
// issues.watchers.add
// ────────────────────────────────────────────────────────────────────────────

export type AddWatcherInput = { issueKey: string; accountId: string };

export function validateAddWatcherInput(input: unknown): AddWatcherInput {
  if (!isRecord(input)) throw new Error("add watcher input must be an object");
  return {
    issueKey: requireString(input.issueKey, "issueKey"),
    accountId: requireString(input.accountId, "accountId"),
  };
}

export function addWatcher(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (hasAuth(input)) {
    const payload = validateAddWatcherInput(input);
    return getClient(input, "issues.watchers.add")
      .fetchJSON(`/issue/${encodeURIComponent(payload.issueKey)}/watchers`, { method: "POST", body: JSON.stringify(payload.accountId) })
      .then((result) => {
        if (result.status === 204 || result.status === 201) return { connector: "jira", action: "issues.watchers.add", source: "connector", added: true };
        throw handleError(result);
      });
  }
  return { connector: "jira", action: "issues.watchers.add", source: "connector", validated: validateAddWatcherInput(input) };
}

// ────────────────────────────────────────────────────────────────────────────
// issues.links.create
// ────────────────────────────────────────────────────────────────────────────

export type CreateIssueLinkInput = { inwardIssueKey: string; outwardIssueKey: string; type: string; comment?: string };

export function validateCreateIssueLinkInput(input: unknown): CreateIssueLinkInput {
  if (!isRecord(input)) throw new Error("create issue link input must be an object");
  return {
    inwardIssueKey: requireString(input.inwardIssueKey, "inwardIssueKey"),
    outwardIssueKey: requireString(input.outwardIssueKey, "outwardIssueKey"),
    type: requireString(input.type, "type"),
    comment: typeof input.comment === "string" ? input.comment : undefined,
  };
}

export function createIssueLink(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (hasAuth(input)) {
    const payload = validateCreateIssueLinkInput(input);
    const body: Record<string, unknown> = {
      type: { name: payload.type },
      inwardIssue: { key: payload.inwardIssueKey },
      outwardIssue: { key: payload.outwardIssueKey },
    };
    if (payload.comment) body.comment = { body: adfParagraph(payload.comment) };
    return getClient(input, "issues.links.create")
      .fetchJSON("/issueLink", { method: "POST", body: JSON.stringify(body) })
      .then((result) => {
        if (result.status === 201 || result.status === 200) return { connector: "jira", action: "issues.links.create", source: "connector", created: true, link: result.body };
        throw handleError(result);
      });
  }
  return { connector: "jira", action: "issues.links.create", source: "connector", validated: validateCreateIssueLinkInput(input) };
}

// ────────────────────────────────────────────────────────────────────────────
// worklogs.add
// ────────────────────────────────────────────────────────────────────────────

export type AddWorklogInput = { issueKey: string; timeSpent: string; started?: string; comment?: string };

export function validateAddWorklogInput(input: unknown): AddWorklogInput {
  if (!isRecord(input)) throw new Error("add worklog input must be an object");
  return {
    issueKey: requireString(input.issueKey, "issueKey"),
    timeSpent: requireString(input.timeSpent, "timeSpent"),
    started: typeof input.started === "string" ? input.started : undefined,
    comment: typeof input.comment === "string" ? input.comment : undefined,
  };
}

function normalizeWorklog(data: Record<string, unknown>, issueKey: string): Record<string, unknown> {
  const author = isRecord(data.author) ? data.author : {};
  return {
    id: `jira-worklog:${typeof data.id === "string" ? data.id : ""}`,
    provider: "jira",
    providerWorklogId: typeof data.id === "string" ? data.id : "",
    issueKey,
    timeSpent: typeof data.timeSpent === "string" ? data.timeSpent : "",
    timeSpentSeconds: typeof data.timeSpentSeconds === "number" ? data.timeSpentSeconds : 0,
    started: typeof data.started === "string" ? data.started : "",
    authorId: typeof author.accountId === "string" ? author.accountId : "",
    authorName: typeof author.displayName === "string" ? author.displayName : "",
    comment: typeof data.comment === "string" ? data.comment : "",
    raw: data,
  };
}

export function addWorklog(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (hasAuth(input)) {
    const payload = validateAddWorklogInput(input);
    const body: Record<string, unknown> = { timeSpent: payload.timeSpent };
    if (payload.started) body.started = payload.started;
    if (payload.comment) body.comment = adfParagraph(payload.comment);
    return getClient(input, "worklogs.add")
      .fetchJSON(`/issue/${encodeURIComponent(payload.issueKey)}/worklog`, { method: "POST", body: JSON.stringify(body) })
      .then((result) => {
        if (result.status === 201 || result.status === 200) {
          return {
            connector: "jira",
            action: "worklogs.add",
            source: "connector",
            worklog: normalizeWorklog(isRecord(result.body) ? result.body : {}, payload.issueKey),
          };
        }
        throw handleError(result);
      });
  }
  return { connector: "jira", action: "worklogs.add", source: "connector", validated: validateAddWorklogInput(input) };
}

// ────────────────────────────────────────────────────────────────────────────
// myself.get
// ────────────────────────────────────────────────────────────────────────────

export type GetMyselfInput = Record<string, never>;

export function validateGetMyselfInput(input: unknown): GetMyselfInput {
  if (!isRecord(input)) throw new Error("get myself input must be an object");
  return {};
}

export function getMyself(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (hasAuth(input)) {
    validateGetMyselfInput(input);
    return getClient(input, "myself.get")
      .fetchJSON("/myself")
      .then((result) => {
        if (result.status === 200) return { connector: "jira", action: "myself.get", source: "connector", user: normalizeUser(result.body as any) };
        throw handleError(result);
      });
  }
  return { connector: "jira", action: "myself.get", source: "connector", validated: validateGetMyselfInput(input) };
}

// ────────────────────────────────────────────────────────────────────────────
// fields.list
// ────────────────────────────────────────────────────────────────────────────

export type ListFieldsInput = Record<string, never>;

export function validateListFieldsInput(input: unknown): ListFieldsInput {
  if (!isRecord(input)) throw new Error("list fields input must be an object");
  return {};
}

export function listFields(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (hasAuth(input)) {
    validateListFieldsInput(input);
    return getClient(input, "fields.list")
      .fetchJSON("/field")
      .then((result) => {
        if (result.status === 200) {
          const raw = Array.isArray(result.body) ? result.body : [];
          const fields = raw.filter(isRecord).map((field) => ({
            id: typeof field.id === "string" ? field.id : "",
            key: typeof field.key === "string" ? field.key : "",
            name: typeof field.name === "string" ? field.name : "",
            custom: field.custom === true,
            schema: isRecord(field.schema) ? field.schema : {},
            raw: field,
          }));
          return { connector: "jira", action: "fields.list", source: "connector", fields };
        }
        throw handleError(result);
      });
  }
  return { connector: "jira", action: "fields.list", source: "connector", validated: validateListFieldsInput(input) };
}
