import {
  createJiraClient,
  parseJiraRateLimit,
  pickValue,
  pickStr,
  pickNum,
  isRecord,
  asAdf,
  adfDoc,
  type JiraApiFamily,
} from "./http";
import rawSpecs from "./depth_specs.json";

export type DepthSpec = {
  id: string;
  tool: string;
  title: string;
  description: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  family?: JiraApiFamily;
  path: string;
  pathParams?: Record<string, string[]>;
  defaults?: Record<string, string>;
  required?: string[][];
  query?: Record<string, string[]>;
  jsonBody?: Record<string, string[]>;
  builder?: string;
  ok?: number[];
  extraHeaders?: Record<string, string>;
  sideEffect?: "read" | "write";
  sample: Record<string, unknown>;
  expectPath: string;
  timeoutMs?: number;
  maxInputBytes?: number;
  maxResponseBytes?: number;
  schema: Record<string, { type: string; description: string; items?: { type: string } }>;
  schemaRequired?: string[];
};

export const DEPTH_SPECS = rawSpecs as DepthSpec[];

type ClientOptions = {
  accessToken: string;
  cloudId: string;
  fetch?: typeof fetch;
  operation?: string;
};

function requireAliases(input: Record<string, unknown>, aliases: string[]): unknown {
  const value = pickValue(input, aliases);
  if (value === undefined) throw new Error(`${aliases[0]} is required`);
  return value;
}

function asPathSegment(value: unknown, field: string): string {
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  throw new Error(`${field} is required`);
}

function interpolatePath(spec: DepthSpec, input: Record<string, unknown>): string {
  return spec.path.replace(/\{([a-zA-Z0-9_]+)\}/g, (_m, name: string) => {
    const aliases = spec.pathParams?.[name] ?? [name];
    const value = pickValue(input, aliases) ?? spec.defaults?.[name];
    if (value === undefined) throw new Error(`${aliases[0]} is required`);
    return encodeURIComponent(asPathSegment(value, aliases[0]));
  });
}

function appendQuery(path: string, spec: DepthSpec, input: Record<string, unknown>): string {
  if (!spec.query) return path;
  const qs = new URLSearchParams();
  for (const [param, aliases] of Object.entries(spec.query)) {
    const value = pickValue(input, aliases);
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      qs.set(param, value.map((item) => String(item)).join(","));
    } else {
      qs.set(param, String(value));
    }
  }
  const encoded = qs.toString();
  return encoded ? `${path}?${encoded}` : path;
}

function mappedObject(mapping: Record<string, string[]> | undefined, input: Record<string, unknown>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (!mapping) return body;
  for (const [key, aliases] of Object.entries(mapping)) {
    const value = pickValue(input, aliases);
    if (value !== undefined) body[key] = value;
  }
  return body;
}

function jqlEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function clause(field: string, value: string): string {
  if (/^\d+$/.test(value)) return `${field} = ${value}`;
  return `${field} = "${jqlEscape(value)}"`;
}

function issueFieldsFromComposio(item: Record<string, unknown>): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  const projectKey = pickStr(item, "project_key", "projectKey", "project");
  if (projectKey) fields.project = { key: projectKey };
  const summary = pickStr(item, "summary");
  if (summary) fields.summary = summary;
  const issueType = pickStr(item, "issue_type", "issueType", "issuetype");
  if (issueType) fields.issuetype = /^\d+$/.test(issueType) ? { id: issueType } : { name: issueType };
  const description = pickValue(item, ["description"]);
  if (description !== undefined) fields.description = asAdf(description);
  const priority = pickStr(item, "priority");
  if (priority) fields.priority = /^\d+$/.test(priority) ? { id: priority } : { name: priority };
  const assignee = pickStr(item, "assignee", "assigneeId");
  if (assignee) fields.assignee = { accountId: assignee };
  const reporter = pickStr(item, "reporter");
  if (reporter) fields.reporter = { accountId: reporter };
  const labels = item.labels;
  if (Array.isArray(labels)) fields.labels = labels;
  const parent = pickStr(item, "parent", "parent_key", "parent_id");
  if (parent) fields.parent = /^\d+$/.test(parent) ? { id: parent } : { key: parent };
  const due = pickStr(item, "due_date", "dueDate");
  if (due) fields.duedate = due;
  const extra = item.additional_properties ?? item.fields;
  if (typeof extra === "string") {
    try { Object.assign(fields, JSON.parse(extra)); } catch { /* ignore */ }
  } else if (isRecord(extra)) {
    Object.assign(fields, extra);
  }
  delete fields.resolution;
  return fields;
}

function buildSearchJql(input: Record<string, unknown>): string {
  const raw = pickStr(input, "jql");
  if (raw) return raw;
  const parts: string[] = [];
  const project = pickStr(input, "project_key", "projectKey");
  if (project) parts.push(clause("project", project));
  const status = pickStr(input, "status_id_or_name", "status");
  if (status) parts.push(clause("status", status));
  const issueType = pickStr(input, "issue_type_id_or_name", "issue_type");
  if (issueType) parts.push(clause("issuetype", issueType));
  const priority = pickStr(input, "priority_id_or_name", "priority");
  if (priority) parts.push(clause("priority", priority));
  const assignee = pickStr(input, "assignee");
  if (assignee) {
    parts.push(assignee.toLowerCase() === "unassigned" ? "assignee is EMPTY" : clause("assignee", assignee));
  }
  const labels = input.labels;
  if (Array.isArray(labels) && labels.length > 0) {
    for (const label of labels) {
      if (typeof label === "string" && label.length > 0) parts.push(`labels = "${jqlEscape(label)}"`);
    }
  }
  const text = pickStr(input, "text_search");
  if (text) parts.push(`text ~ "${jqlEscape(text)}"`);
  const createdAfter = pickStr(input, "created_after");
  if (createdAfter) parts.push(`created >= "${jqlEscape(createdAfter)}"`);
  const createdBefore = pickStr(input, "created_before");
  if (createdBefore) parts.push(`created <= "${jqlEscape(createdBefore)}"`);
  const updatedAfter = pickStr(input, "updated_after");
  if (updatedAfter) parts.push(`updated >= "${jqlEscape(updatedAfter)}"`);
  const updatedBefore = pickStr(input, "updated_before");
  if (updatedBefore) parts.push(`updated <= "${jqlEscape(updatedBefore)}"`);
  const sprint = pickStr(input, "sprint_id_or_name");
  if (sprint) parts.push(clause("sprint", sprint));
  const order = pickStr(input, "preserved_order_by");
  const jql = parts.join(" AND ");
  if (!jql && !pickStr(input, "next_page_token", "nextPageToken")) {
    throw new Error("at least one search filter is required");
  }
  return order ? `${jql} ${order}`.trim() : jql;
}

type BuiltRequest = {
  path: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
  family?: JiraApiFamily;
};

const BUILDERS: Record<string, (spec: DepthSpec, input: Record<string, unknown>) => BuiltRequest> = {
  addAttachment(spec, input) {
    const issueKey = asPathSegment(requireAliases(input, ["issue_key", "issueKey", "issue_id_or_key"]), "issue_key");
    const file = pickValue(input, ["file_to_upload", "file"]);
    const form = new FormData();
    if (typeof Blob !== "undefined" && file instanceof Blob) {
      form.append("file", file, "upload.bin");
    } else if (isRecord(file)) {
      const name = pickStr(file, "name", "filename", "file_name") ?? "upload.bin";
      const type = pickStr(file, "contentType", "content_type", "mimeType") ?? "application/octet-stream";
      const content = file.content ?? file.data ?? file.bytes ?? "";
      const blob = typeof content === "string" ? new Blob([content], { type }) : new Blob([JSON.stringify(content)], { type });
      form.append("file", blob, name);
    } else if (typeof file === "string") {
      form.append("file", new Blob([file], { type: "text/plain" }), "upload.txt");
    } else {
      throw new Error("file_to_upload is required");
    }
    return {
      path: `/issue/${encodeURIComponent(issueKey)}/attachments`,
      method: "POST",
      body: form,
      headers: { "X-Atlassian-Token": "no-check" },
    };
  },
  bulkCreate(_spec, input) {
    const issues = pickValue(input, ["issues"]);
    if (!Array.isArray(issues) || issues.length === 0) throw new Error("issues is required");
    const issueUpdates = issues.map((item, index) => {
      if (!isRecord(item)) throw new Error(`issues[${index}] must be an object`);
      return { fields: issueFieldsFromComposio(item) };
    });
    return { path: "/issue/bulk", method: "POST", body: { issueUpdates } };
  },
  searchIssues(spec, input) {
    const jql = buildSearchJql(input);
    const body: Record<string, unknown> = {};
    if (jql) body.jql = jql;
    const maxResults = pickNum(input, "max_results", "maxResults");
    if (maxResults !== undefined) body.maxResults = maxResults;
    const token = pickStr(input, "next_page_token", "nextPageToken");
    if (token) body.nextPageToken = token;
    const fields = pickValue(input, ["fields"]);
    body.fields = Array.isArray(fields) ? fields : ["*navigable"];
    return { path: "/search/jql", method: "POST", body };
  },
  notify(spec, input) {
    const path = interpolatePath(spec, input);
    const body: Record<string, unknown> = {
      subject: requireAliases(input, ["subject"]),
      textBody: requireAliases(input, ["text_body", "textBody"]),
      to: requireAliases(input, ["to"]),
    };
    const html = pickValue(input, ["html_body", "htmlBody"]);
    if (html !== undefined) body.htmlBody = html;
    const restrict = pickValue(input, ["restrict"]);
    if (restrict !== undefined) body.restrict = restrict;
    return { path, method: "POST", body };
  },
  permissionsCheck(_spec, input) {
    const body: Record<string, unknown> = {};
    const accountId = pickStr(input, "account_id", "accountId");
    if (accountId) body.accountId = accountId;
    const globalPermissions = pickValue(input, ["global_permissions", "globalPermissions"]);
    if (globalPermissions !== undefined) body.globalPermissions = globalPermissions;
    const projectPermissions = pickValue(input, ["project_permissions", "projectPermissions"]);
    if (projectPermissions !== undefined) body.projectPermissions = projectPermissions;
    return { path: "/permissions/check", method: "POST", body };
  },
  permittedProjects(_spec, input) {
    return {
      path: "/permissions/project",
      method: "POST",
      body: { permissions: requireAliases(input, ["permissions"]) },
    };
  },
  analyseExpression(_spec, input) {
    const body: Record<string, unknown> = {
      expressions: requireAliases(input, ["expressions"]),
    };
    const check = pickStr(input, "check");
    if (check) body.check = check;
    const context = pickValue(input, ["context_variables", "context"]);
    if (context !== undefined) body.context = context;
    return { path: "/expression/analyse", method: "POST", body };
  },
  evaluateExpression(spec, input) {
    const body: Record<string, unknown> = {
      expression: requireAliases(input, ["expression"]),
    };
    const context = pickValue(input, ["context"]);
    if (context !== undefined) body.context = context;
    const path = appendQuery("/expression/eval", spec, input);
    return { path, method: "POST", body };
  },
  commentsByIds(spec, input) {
    const ids = requireAliases(input, ["ids"]);
    const path = appendQuery("/comment/list", spec, input);
    return { path, method: "POST", body: { ids } };
  },
  roleActorsAdd(spec, input) {
    const path = interpolatePath(spec, input);
    const body: Record<string, unknown> = {};
    const users = pickValue(input, ["user_account_ids", "user"]);
    if (users !== undefined) body.user = users;
    const groupIds = pickValue(input, ["group_ids", "groupId"]);
    const groupNames = pickValue(input, ["group_names", "group"]);
    if (groupIds !== undefined) body.groupId = groupIds;
    else if (groupNames !== undefined) body.group = groupNames;
    if (body.user === undefined && body.group === undefined && body.groupId === undefined) {
      throw new Error("user_account_ids is required");
    }
    return { path, method: "POST", body };
  },
  createBoard(_spec, input) {
    const body: Record<string, unknown> = {
      name: requireAliases(input, ["name"]),
      type: requireAliases(input, ["type"]),
    };
    const filterId = pickNum(input, "filterId", "filter_id");
    if (filterId !== undefined) body.filterId = filterId;
    const location = pickValue(input, ["location"]);
    if (location !== undefined) body.location = location;
    return { path: "/board", method: "POST", body, family: "agile" };
  },
  createProject(_spec, input) {
    const body: Record<string, unknown> = {
      key: requireAliases(input, ["key"]),
      name: requireAliases(input, ["name"]),
      leadAccountId: requireAliases(input, ["lead_account_id", "leadAccountId"]),
      projectTypeKey: requireAliases(input, ["project_type_key", "projectTypeKey"]),
      projectTemplateKey: requireAliases(input, ["project_template_key", "projectTemplateKey"]),
    };
    const optional: Record<string, string[]> = {
      url: ["url"],
      description: ["description"],
      assigneeType: ["assignee_type", "assigneeType"],
      avatarId: ["avatar_id", "avatarId"],
      categoryId: ["category_id", "categoryId"],
      permissionScheme: ["permission_scheme", "permissionScheme"],
      notificationScheme: ["notification_scheme", "notificationScheme"],
      issueSecurityScheme: ["issue_security_scheme", "issueSecurityScheme"],
    };
    Object.assign(body, mappedObject(optional, input));
    const extra = pickValue(input, ["additional_properties"]);
    if (isRecord(extra)) Object.assign(body, extra);
    return { path: "/project", method: "POST", body };
  },
  createSprint(_spec, input) {
    const body: Record<string, unknown> = {
      name: requireAliases(input, ["name"]),
      originBoardId: requireAliases(input, ["origin_board_id", "originBoardId"]),
    };
    const goal = pickStr(input, "goal");
    if (goal) body.goal = goal;
    const startDate = pickStr(input, "start_date", "startDate");
    if (startDate) body.startDate = startDate;
    const endDate = pickStr(input, "end_date", "endDate");
    if (endDate) body.endDate = endDate;
    const extra = pickValue(input, ["additional_properties"]);
    if (isRecord(extra)) Object.assign(body, extra);
    return { path: "/sprint", method: "POST", body, family: "agile" };
  },
  createVersion(_spec, input) {
    const body: Record<string, unknown> = {
      name: requireAliases(input, ["name"]),
      projectId: requireAliases(input, ["project_id", "projectId"]),
    };
    Object.assign(body, mappedObject({
      description: ["description"],
      archived: ["archived"],
      released: ["released"],
      startDate: ["start_date", "startDate"],
      releaseDate: ["release_date", "releaseDate"],
    }, input));
    const extra = pickValue(input, ["additional_properties"]);
    if (isRecord(extra)) Object.assign(body, extra);
    return { path: "/version", method: "POST", body };
  },
  addGroupUser(spec, input) {
    const qs = new URLSearchParams();
    const groupId = pickStr(input, "group_id", "groupId");
    const groupName = pickStr(input, "group_name", "groupname");
    if (groupId) qs.set("groupId", groupId);
    else if (groupName) qs.set("groupname", groupName);
    else throw new Error("group_name is required");
    return {
      path: `/group/user?${qs.toString()}`,
      method: "POST",
      body: { accountId: requireAliases(input, ["account_id", "accountId"]) },
    };
  },
  removeGroupUser(spec, input) {
    const qs = new URLSearchParams();
    qs.set("accountId", asPathSegment(requireAliases(input, ["account_id", "accountId"]), "account_id"));
    const groupId = pickStr(input, "group_id", "groupId");
    const groupName = pickStr(input, "group_name", "groupname");
    if (groupId) qs.set("groupId", groupId);
    else if (groupName) qs.set("groupname", groupName);
    else throw new Error("group_name is required");
    return { path: `/group/user?${qs.toString()}`, method: "DELETE" };
  },
  parseJql(_spec, input) {
    const body: Record<string, unknown> = { queries: requireAliases(input, ["queries"]) };
    const validation = pickStr(input, "validation");
    if (validation) body.validation = validation;
    return { path: "/jql/parse", method: "POST", body };
  },
  autocompleteCreate(_spec, input) {
    const body: Record<string, unknown> = {};
    const projectIds = pickValue(input, ["project_ids", "projectIds"]);
    if (projectIds !== undefined) body.projectIds = projectIds;
    const includeCollapsed = pickValue(input, ["include_collapsed_fields", "includeCollapsedFields"]);
    if (includeCollapsed !== undefined) body.includeCollapsedFields = includeCollapsed;
    return { path: "/jql/autocompletedata", method: "POST", body };
  },
  moveToSprint(spec, input) {
    const path = interpolatePath(spec, input);
    const body: Record<string, unknown> = { issues: requireAliases(input, ["issues"]) };
    Object.assign(body, mappedObject({
      rankBeforeIssue: ["rank_before_issue", "rankBeforeIssue"],
      rankAfterIssue: ["rank_after_issue", "rankAfterIssue"],
      rankCustomFieldId: ["rank_custom_field_id", "rankCustomFieldId"],
    }, input));
    return { path, method: "POST", body, family: "agile" };
  },
  bulkFetch(_spec, input) {
    const body: Record<string, unknown> = {
      issueIdsOrKeys: requireAliases(input, ["issueIdsOrKeys", "issue_ids_or_keys"]),
    };
    Object.assign(body, mappedObject({
      expand: ["expand"],
      fields: ["fields"],
      properties: ["properties"],
      fieldsByKeys: ["fieldsByKeys", "fields_by_keys"],
    }, input));
    return { path: "/issue/bulkfetch", method: "POST", body };
  },
  updateComment(spec, input) {
    const path = interpolatePath(spec, input);
    const qs = new URLSearchParams();
    const notify = pickValue(input, ["notify_users", "notifyUsers"]);
    if (notify !== undefined) qs.set("notifyUsers", String(notify));
    const body: Record<string, unknown> = {
      body: asAdf(requireAliases(input, ["comment_text", "body", "comment"])) ?? adfDoc(""),
    };
    const visType = pickStr(input, "visibility_type");
    const visValue = pickStr(input, "visibility_value");
    if (visType && visValue) body.visibility = { type: visType, value: visValue };
    const extra = pickValue(input, ["additional_properties"]);
    if (isRecord(extra)) Object.assign(body, extra);
    return { path: qs.toString() ? `${path}?${qs}` : path, method: "PUT", body };
  },
  searchJqlPost(spec, input) {
    const body: Record<string, unknown> = {};
    const jql = pickStr(input, "jql");
    if (jql) body.jql = jql;
    Object.assign(body, mappedObject({
      expand: ["expand"],
      fields: ["fields"],
      maxResults: ["maxResults", "max_results"],
      properties: ["properties"],
      fieldsByKeys: ["fieldsByKeys", "fields_by_keys"],
      nextPageToken: ["nextPageToken", "next_page_token"],
      reconcileIssues: ["reconcileIssues", "reconcile_issues"],
    }, input));
    if (!body.jql && !body.nextPageToken) throw new Error("jql is required");
    return { path: "/search/jql", method: "POST", body };
  },
  componentsSearch(spec, input) {
    const projects = pickValue(input, ["projectIdsOrKeys", "project_ids_or_keys", "projectKey", "project_id_or_key"]);
    const project = Array.isArray(projects) ? projects[0] : projects;
    if (project !== undefined && project !== null && `${project}`.length > 0) {
      const path = appendQuery(`/project/${encodeURIComponent(String(project))}/component`, spec, input);
      return { path, method: "GET" };
    }
    const id = pickStr(input, "query", "id", "component_id");
    if (!id) throw new Error("projectIdsOrKeys is required");
    return { path: `/component/${encodeURIComponent(id)}`, method: "GET" };
  },
  getProjectType(_spec, input) {
    const key = pickStr(input, "project_type_key", "projectTypeKey");
    if (key) return { path: `/project/type/${encodeURIComponent(key)}`, method: "GET" };
    return { path: "/project/type", method: "GET" };
  },
};

function defaultBuild(spec: DepthSpec, input: Record<string, unknown>): BuiltRequest {
  for (const aliases of spec.required ?? []) {
    requireAliases(input, aliases);
  }
  const path = appendQuery(interpolatePath(spec, input), spec, input);
  const request: BuiltRequest = { path, method: spec.method, family: spec.family };
  if (spec.jsonBody) {
    request.body = mappedObject(spec.jsonBody, input);
  }
  if (spec.extraHeaders) request.headers = spec.extraHeaders;
  return request;
}

export function buildDepthRequest(spec: DepthSpec, input: Record<string, unknown>): BuiltRequest {
  if (spec.builder) {
    const builder = BUILDERS[spec.builder];
    if (!builder) throw new Error(`unknown builder ${spec.builder}`);
    return builder(spec, input);
  }
  return defaultBuild(spec, input);
}

function handleError(result: { status: number; headers: Record<string, string>; body: unknown }) {
  const rateLimit = parseJiraRateLimit(result.status, result.headers);
  if (rateLimit.limited) {
    return { ok: false, code: "CONNECTOR_RATE_LIMITED", message: "Jira rate limit exceeded.", retryAfterSeconds: rateLimit.retryAfterSeconds };
  }
  return { ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message: "Jira rejected the request." };
}

function hasAuth(input: unknown): input is Record<string, unknown> & { accessToken: string; cloudId: string } {
  return isRecord(input) && typeof input.accessToken === "string" && typeof input.cloudId === "string";
}

function serializeBody(body: unknown): BodyInit | undefined {
  if (body === undefined) return undefined;
  if (typeof FormData !== "undefined" && body instanceof FormData) return body;
  if (typeof body === "string") return body;
  return JSON.stringify(body);
}

export function runDepth(spec: DepthSpec, input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (!isRecord(input)) throw new Error(`${spec.id} input must be an object`);
  if (!hasAuth(input)) {
    const validated: Record<string, unknown> = {};
    for (const aliases of spec.required ?? []) {
      validated[aliases[0]] = requireAliases(input, aliases);
    }
    return { connector: "jira", action: spec.id, source: "connector", validated };
  }
  const built = buildDepthRequest(spec, input);
  const client = createJiraClient({
    accessToken: input.accessToken,
    cloudId: input.cloudId,
    fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    operation: spec.id,
    family: built.family ?? spec.family ?? "api3",
  });
  const init: RequestInit = { method: built.method, headers: built.headers };
  const serialized = serializeBody(built.body);
  if (serialized !== undefined) init.body = serialized;
  return client.fetchJSON(built.path, init).then((result) => {
    const ok = spec.ok ?? [200, 201, 202, 204];
    if (ok.includes(result.status)) {
      return { connector: "jira", action: spec.id, source: "connector", data: result.body, status: result.status };
    }
    throw handleError(result);
  });
}

function handlerFor(spec: DepthSpec) {
  return (input: unknown) => runDepth(spec, input);
}

export const jiraDepthActions: Record<string, (input: unknown) => Record<string, unknown> | Promise<Record<string, unknown>>> = {};
for (const spec of DEPTH_SPECS) {
  jiraDepthActions[spec.id] = handlerFor(spec);
}
