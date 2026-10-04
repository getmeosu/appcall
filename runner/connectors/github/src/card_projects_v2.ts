import { createGitHubClient, parseGitHubRateLimit, type GitHubClient } from "./http";

type CursorPage = { perPage?: number; after?: string; before?: string };
type OrgProject = { org: string; projectNumber: number };
type FieldsQuery = { fields?: string | string[] };

export type ListOrgProjectsV2Input = { org: string; q?: string } & CursorPage;
export type GetOrgProjectV2Input = OrgProject;
export type ListOrgProjectFieldsInput = OrgProject & CursorPage;
export type GetOrgProjectFieldInput = OrgProject & { fieldId: number };
export type ListOrgProjectItemsInput = OrgProject & CursorPage & FieldsQuery & { q?: string };
export type GetOrgProjectItemInput = OrgProject & FieldsQuery & { itemId: number };
export type CreateOrgProjectDraftInput = OrgProject & { title: string; body?: string };
export type CreateOrgProjectFieldInput = OrgProject & {
  issueFieldId?: number;
  name?: string;
  dataType?: string;
  singleSelectOptions?: Array<{ name: string; color?: string; description?: string }>;
  iterationConfiguration?: {
    startDate: string;
    duration: number;
    iterations?: Array<{ title: string; startDate: string; duration: number }>;
  };
};
export type AddOrgProjectItemInput = OrgProject & {
  type: "Issue" | "PullRequest";
  id?: number;
  owner?: string;
  repo?: string;
  number?: number;
};
export type UpdateOrgProjectItemInput = OrgProject & {
  itemId: number;
  fields: Array<{ id: number; value: string | number | null }>;
};
export type DeleteOrgProjectItemInput = OrgProject & { itemId: number };
export type CreateOrgProjectViewInput = OrgProject & {
  name: string;
  layout: "table" | "board" | "roadmap";
  filter?: string;
  visibleFields?: number[];
  sortBy?: Array<[number, "asc" | "desc"]>;
  groupBy?: number[];
  verticalGroupBy?: number[];
};

export function validateListOrgProjectsV2Input(input: unknown): ListOrgProjectsV2Input {
  if (!isRecord(input)) throw new Error("orgs.projects_v2.list input must be an object");
  return { org: segment(input.org, "org"), q: optionalText(input.q, "q"), ...cursorPage(input) };
}

export function validateGetOrgProjectV2Input(input: unknown): GetOrgProjectV2Input {
  if (!isRecord(input)) throw new Error("orgs.projects_v2.get input must be an object");
  return orgProject(input);
}

export function validateListOrgProjectFieldsInput(input: unknown): ListOrgProjectFieldsInput {
  if (!isRecord(input)) throw new Error("orgs.projects_v2.fields.list input must be an object");
  return { ...orgProject(input), ...cursorPage(input) };
}

export function validateGetOrgProjectFieldInput(input: unknown): GetOrgProjectFieldInput {
  if (!isRecord(input)) throw new Error("orgs.projects_v2.fields.get input must be an object");
  return { ...orgProject(input), fieldId: positiveInt(input.fieldId, "fieldId") };
}

export function validateListOrgProjectItemsInput(input: unknown): ListOrgProjectItemsInput {
  if (!isRecord(input)) throw new Error("orgs.projects_v2.items.list input must be an object");
  return { ...orgProject(input), q: optionalText(input.q, "q"), fields: fieldsQuery(input.fields), ...cursorPage(input) };
}

export function validateGetOrgProjectItemInput(input: unknown): GetOrgProjectItemInput {
  if (!isRecord(input)) throw new Error("orgs.projects_v2.items.get input must be an object");
  return { ...orgProject(input), itemId: positiveInt(input.itemId, "itemId"), fields: fieldsQuery(input.fields) };
}

export function validateCreateOrgProjectDraftInput(input: unknown): CreateOrgProjectDraftInput {
  if (!isRecord(input)) throw new Error("orgs.projects_v2.drafts.create input must be an object");
  return { ...orgProject(input), title: requiredText(input.title, "title"), body: optionalText(input.body, "body") };
}

export function validateCreateOrgProjectFieldInput(input: unknown): CreateOrgProjectFieldInput {
  if (!isRecord(input)) throw new Error("orgs.projects_v2.fields.create input must be an object");
  const base = orgProject(input);
  if (input.issueFieldId !== undefined) {
    return { ...base, issueFieldId: positiveInt(input.issueFieldId, "issueFieldId") };
  }
  const name = requiredText(input.name, "name");
  const dataType = requiredText(input.dataType, "dataType");
  if (dataType === "text" || dataType === "number" || dataType === "date") {
    return { ...base, name, dataType };
  }
  if (dataType === "single_select") {
    return { ...base, name, dataType, singleSelectOptions: singleSelectOptions(input.singleSelectOptions) };
  }
  if (dataType === "iteration") {
    return { ...base, name, dataType, iterationConfiguration: iterationConfiguration(input.iterationConfiguration) };
  }
  throw new Error("dataType must be text, number, date, single_select, or iteration");
}

export function validateAddOrgProjectItemInput(input: unknown): AddOrgProjectItemInput {
  if (!isRecord(input)) throw new Error("orgs.projects_v2.items.add input must be an object");
  const type = requiredText(input.type, "type");
  if (type !== "Issue" && type !== "PullRequest") throw new Error("type must be Issue or PullRequest");
  const base = { ...orgProject(input), type };
  if (input.id !== undefined) return { ...base, id: positiveInt(input.id, "id") };
  if (input.owner !== undefined || input.repo !== undefined || input.number !== undefined) {
    return {
      ...base,
      owner: segment(input.owner, "owner"),
      repo: segment(input.repo, "repo"),
      number: positiveInt(input.number, "number"),
    };
  }
  throw new Error("id or owner, repo, and number is required");
}

export function validateUpdateOrgProjectItemInput(input: unknown): UpdateOrgProjectItemInput {
  if (!isRecord(input)) throw new Error("orgs.projects_v2.items.update input must be an object");
  if (!Array.isArray(input.fields) || input.fields.length === 0) throw new Error("fields is required");
  return {
    ...orgProject(input),
    itemId: positiveInt(input.itemId, "itemId"),
    fields: input.fields.map((entry, index) => fieldUpdate(entry, index)),
  };
}

export function validateDeleteOrgProjectItemInput(input: unknown): DeleteOrgProjectItemInput {
  if (!isRecord(input)) throw new Error("orgs.projects_v2.items.delete input must be an object");
  return { ...orgProject(input), itemId: positiveInt(input.itemId, "itemId") };
}

export function validateCreateOrgProjectViewInput(input: unknown): CreateOrgProjectViewInput {
  if (!isRecord(input)) throw new Error("orgs.projects_v2.views.create input must be an object");
  const layout = requiredText(input.layout, "layout");
  if (layout !== "table" && layout !== "board" && layout !== "roadmap") {
    throw new Error("layout must be table, board, or roadmap");
  }
  return {
    ...orgProject(input),
    name: requiredText(input.name, "name"),
    layout,
    filter: optionalText(input.filter, "filter"),
    visibleFields: optionalIdList(input.visibleFields, "visibleFields"),
    sortBy: optionalSortBy(input.sortBy),
    groupBy: optionalIdList(input.groupBy, "groupBy", 1),
    verticalGroupBy: optionalIdList(input.verticalGroupBy, "verticalGroupBy", 1),
  };
}

export function createCardProjectsV2Client(options: { accessToken: string; fetch?: typeof fetch; githubClient?: GitHubClient }) {
  const client = options.githubClient ?? createGitHubClient({
    accessToken: options.accessToken,
    fetch: options.fetch,
    operation: "orgs.projects_v2.list",
  });

  return {
    async listProjects(input: unknown) {
      const payload = validateListOrgProjectsV2Input(input);
      const path = `${orgProjects(payload.org)}${query({
        q: payload.q,
        per_page: payload.perPage,
        after: payload.after,
        before: payload.before,
      })}`;
      const result = await read(client, path, "orgs.projects_v2.list", "GitHub organization projects were not found.");
      if (!result.ok) return result;
      if (!Array.isArray(result.body)) return upstream("GitHub rejected the orgs.projects_v2.list request.");
      return { ok: true as const, projects: result.body.filter(isRecord).map(normalizeProject) };
    },

    async getProject(input: unknown) {
      const payload = validateGetOrgProjectV2Input(input);
      const result = await read(client, projectPath(payload), "orgs.projects_v2.get", "GitHub organization project was not found.");
      if (!result.ok) return result;
      if (!isRecord(result.body)) return upstream("GitHub rejected the orgs.projects_v2.get request.");
      return { ok: true as const, project: normalizeProject(result.body) };
    },

    async listFields(input: unknown) {
      const payload = validateListOrgProjectFieldsInput(input);
      const path = `${projectPath(payload)}/fields${query({
        per_page: payload.perPage,
        after: payload.after,
        before: payload.before,
      })}`;
      const result = await read(client, path, "orgs.projects_v2.fields.list", "GitHub organization project fields were not found.");
      if (!result.ok) return result;
      if (!Array.isArray(result.body)) return upstream("GitHub rejected the orgs.projects_v2.fields.list request.");
      return { ok: true as const, fields: result.body.filter(isRecord).map(normalizeField) };
    },

    async getField(input: unknown) {
      const payload = validateGetOrgProjectFieldInput(input);
      const result = await read(
        client,
        `${projectPath(payload)}/fields/${payload.fieldId}`,
        "orgs.projects_v2.fields.get",
        "GitHub organization project field was not found.",
      );
      if (!result.ok) return result;
      if (!isRecord(result.body)) return upstream("GitHub rejected the orgs.projects_v2.fields.get request.");
      return { ok: true as const, field: normalizeField(result.body) };
    },

    async listItems(input: unknown) {
      const payload = validateListOrgProjectItemsInput(input);
      const path = `${projectPath(payload)}/items${query({
        q: payload.q,
        fields: payload.fields,
        per_page: payload.perPage,
        after: payload.after,
        before: payload.before,
      })}`;
      const result = await read(client, path, "orgs.projects_v2.items.list", "GitHub organization project items were not found.");
      if (!result.ok) return result;
      if (!Array.isArray(result.body)) return upstream("GitHub rejected the orgs.projects_v2.items.list request.");
      return { ok: true as const, items: result.body.filter(isRecord).map(normalizeItem) };
    },

    async getItem(input: unknown) {
      const payload = validateGetOrgProjectItemInput(input);
      const path = `${projectPath(payload)}/items/${payload.itemId}${query({ fields: payload.fields })}`;
      const result = await read(client, path, "orgs.projects_v2.items.get", "GitHub organization project item was not found.");
      if (!result.ok) return result;
      if (!isRecord(result.body)) return upstream("GitHub rejected the orgs.projects_v2.items.get request.");
      return { ok: true as const, item: normalizeItem(result.body) };
    },

    async createDraft(input: unknown) {
      const payload = validateCreateOrgProjectDraftInput(input);
      const body: Record<string, unknown> = { title: payload.title };
      if (payload.body !== undefined) body.body = payload.body;
      const result = await write(client, `${projectPath(payload)}/drafts`, "POST", body, "orgs.projects_v2.drafts.create", 201);
      if (!result.ok) return result;
      if (!isRecord(result.body)) return upstream("GitHub rejected the orgs.projects_v2.drafts.create request.");
      return { ok: true as const, item: normalizeItem(result.body) };
    },

    async createField(input: unknown) {
      const payload = validateCreateOrgProjectFieldInput(input);
      const result = await write(client, `${projectPath(payload)}/fields`, "POST", fieldBody(payload), "orgs.projects_v2.fields.create", 201);
      if (!result.ok) return result;
      if (!isRecord(result.body)) return upstream("GitHub rejected the orgs.projects_v2.fields.create request.");
      return { ok: true as const, field: normalizeField(result.body) };
    },

    async addItem(input: unknown) {
      const payload = validateAddOrgProjectItemInput(input);
      const body: Record<string, unknown> = { type: payload.type };
      if (payload.id !== undefined) body.id = payload.id;
      else {
        body.owner = payload.owner;
        body.repo = payload.repo;
        body.number = payload.number;
      }
      const result = await write(client, `${projectPath(payload)}/items`, "POST", body, "orgs.projects_v2.items.add", 201);
      if (!result.ok) return result;
      if (!isRecord(result.body)) return upstream("GitHub rejected the orgs.projects_v2.items.add request.");
      return { ok: true as const, item: normalizeItem(result.body) };
    },

    async updateItem(input: unknown) {
      const payload = validateUpdateOrgProjectItemInput(input);
      const result = await write(
        client,
        `${projectPath(payload)}/items/${payload.itemId}`,
        "PATCH",
        { fields: payload.fields },
        "orgs.projects_v2.items.update",
        200,
      );
      if (!result.ok) return result;
      if (!isRecord(result.body)) return upstream("GitHub rejected the orgs.projects_v2.items.update request.");
      return { ok: true as const, item: normalizeItem(result.body) };
    },

    async deleteItem(input: unknown) {
      const payload = validateDeleteOrgProjectItemInput(input);
      const response = await client.fetchJSON(`${projectPath(payload)}/items/${payload.itemId}`, { method: "DELETE" });
      const limited = rate(response.status, response.headers);
      if (limited) return limited;
      if (response.status === 204) return { ok: true as const, deleted: true as const, itemId: payload.itemId };
      if (response.status === 404) return upstream("GitHub organization project item was not found.");
      return upstream("GitHub rejected the orgs.projects_v2.items.delete request.");
    },

    async createView(input: unknown) {
      const payload = validateCreateOrgProjectViewInput(input);
      const result = await write(client, `${projectPath(payload)}/views`, "POST", viewBody(payload), "orgs.projects_v2.views.create", 201);
      if (!result.ok) return result;
      if (!isRecord(result.body)) return upstream("GitHub rejected the orgs.projects_v2.views.create request.");
      return { ok: true as const, view: normalizeView(result.body) };
    },
  };
}

function normalizeProject(item: Record<string, unknown>) {
  return {
    id: numberOrZero(item.id),
    nodeId: text(item.node_id),
    number: numberOrZero(item.number),
    title: text(item.title),
    description: item.description === null ? null : text(item.description),
    shortDescription: item.short_description === null ? null : text(item.short_description),
    public: item.public === true,
    closedAt: item.closed_at === null ? null : text(item.closed_at),
    createdAt: text(item.created_at),
    updatedAt: text(item.updated_at),
    deletedAt: item.deleted_at === null ? null : text(item.deleted_at),
    state: text(item.state),
    isTemplate: item.is_template === true,
    owner: identity(item.owner),
    creator: identity(item.creator),
    deletedBy: item.deleted_by === null ? null : identity(item.deleted_by),
    latestStatusUpdate: item.latest_status_update === null ? null : statusUpdate(item.latest_status_update),
  };
}

function normalizeField(item: Record<string, unknown>) {
  return {
    id: numberOrZero(item.id),
    issueFieldId: typeof item.issue_field_id === "number" ? item.issue_field_id : undefined,
    nodeId: text(item.node_id),
    projectUrl: text(item.project_url),
    name: text(item.name),
    dataType: text(item.data_type),
    createdAt: text(item.created_at),
    updatedAt: text(item.updated_at),
    options: Array.isArray(item.options) ? item.options.filter(isRecord).map(selectOption) : undefined,
    configuration: isRecord(item.configuration) ? fieldConfiguration(item.configuration) : undefined,
  };
}

function normalizeItem(item: Record<string, unknown>) {
  return {
    id: numberOrZero(item.id),
    nodeId: text(item.node_id),
    contentType: text(item.content_type),
    createdAt: text(item.created_at),
    updatedAt: text(item.updated_at),
    archivedAt: item.archived_at === null ? null : text(item.archived_at),
    projectUrl: text(item.project_url),
    itemUrl: item.item_url === null ? null : text(item.item_url),
    creator: item.creator === undefined ? undefined : identity(item.creator),
    content: item.content === null || item.content === undefined ? item.content : contentOf(item.content),
    fields: Array.isArray(item.fields) ? item.fields.filter(isRecord).map(itemField) : undefined,
  };
}

function normalizeView(item: Record<string, unknown>) {
  return {
    id: numberOrZero(item.id),
    number: numberOrZero(item.number),
    name: text(item.name),
    layout: text(item.layout),
    nodeId: text(item.node_id),
    projectUrl: text(item.project_url),
    htmlUrl: text(item.html_url),
    creator: identity(item.creator),
    createdAt: text(item.created_at),
    updatedAt: text(item.updated_at),
    filter: item.filter === null ? null : text(item.filter),
    visibleFields: numberList(item.visible_fields),
    sortBy: Array.isArray(item.sort_by) ? item.sort_by : [],
    groupBy: numberList(item.group_by),
    verticalGroupBy: numberList(item.vertical_group_by),
  };
}

function identity(value: unknown) {
  if (!isRecord(value)) return null;
  return {
    id: numberOrZero(value.id),
    login: text(value.login),
    nodeId: text(value.node_id),
    htmlUrl: text(value.html_url),
    avatarUrl: text(value.avatar_url),
    type: text(value.type),
  };
}

function statusUpdate(value: unknown) {
  if (!isRecord(value)) return null;
  return {
    id: numberOrZero(value.id),
    nodeId: text(value.node_id),
    projectNodeId: text(value.project_node_id),
    status: value.status === null ? null : text(value.status),
    startDate: text(value.start_date),
    targetDate: text(value.target_date),
    createdAt: text(value.created_at),
    updatedAt: text(value.updated_at),
  };
}

function contentOf(value: unknown) {
  if (!isRecord(value)) return null;
  return {
    id: numberOrZero(value.id),
    nodeId: text(value.node_id),
    number: typeof value.number === "number" ? value.number : undefined,
    title: text(value.title),
    state: typeof value.state === "string" ? value.state : undefined,
    body: typeof value.body === "string" ? value.body : value.body === null ? null : undefined,
    htmlUrl: typeof value.html_url === "string" ? value.html_url : undefined,
    createdAt: typeof value.created_at === "string" ? value.created_at : undefined,
    updatedAt: typeof value.updated_at === "string" ? value.updated_at : undefined,
  };
}

function selectOption(item: Record<string, unknown>) {
  return {
    id: typeof item.id === "string" || typeof item.id === "number" ? item.id : undefined,
    name: text(item.name),
    color: typeof item.color === "string" ? item.color : undefined,
    description: typeof item.description === "string" ? item.description : undefined,
  };
}

function fieldConfiguration(item: Record<string, unknown>) {
  return {
    startDay: typeof item.start_day === "number" ? item.start_day : undefined,
    duration: typeof item.duration === "number" ? item.duration : undefined,
    iterations: Array.isArray(item.iterations) ? item.iterations.filter(isRecord) : undefined,
  };
}

function itemField(item: Record<string, unknown>) {
  return {
    id: numberOrZero(item.id),
    name: typeof item.name === "string" ? item.name : undefined,
    value: item.value === undefined ? undefined : item.value,
  };
}

function fieldBody(payload: CreateOrgProjectFieldInput): Record<string, unknown> {
  if (payload.issueFieldId !== undefined) return { issue_field_id: payload.issueFieldId };
  if (payload.dataType === "single_select") {
    return {
      name: payload.name,
      data_type: payload.dataType,
      single_select_options: (payload.singleSelectOptions ?? []).map((option) => ({
        name: option.name,
        ...(option.color ? { color: option.color } : {}),
        ...(option.description ? { description: option.description } : {}),
      })),
    };
  }
  if (payload.dataType === "iteration" && payload.iterationConfiguration) {
    const configuration: Record<string, unknown> = {
      start_date: payload.iterationConfiguration.startDate,
      duration: payload.iterationConfiguration.duration,
    };
    if (payload.iterationConfiguration.iterations) {
      configuration.iterations = payload.iterationConfiguration.iterations.map((iteration) => ({
        title: iteration.title,
        start_date: iteration.startDate,
        duration: iteration.duration,
      }));
    }
    return { name: payload.name, data_type: payload.dataType, iteration_configuration: configuration };
  }
  return { name: payload.name, data_type: payload.dataType };
}

function viewBody(payload: CreateOrgProjectViewInput): Record<string, unknown> {
  const body: Record<string, unknown> = { name: payload.name, layout: payload.layout };
  if (payload.filter !== undefined) body.filter = payload.filter;
  if (payload.visibleFields) body.visible_fields = payload.visibleFields;
  if (payload.sortBy) body.sort_by = payload.sortBy;
  if (payload.groupBy) body.group_by = payload.groupBy;
  if (payload.verticalGroupBy) body.vertical_group_by = payload.verticalGroupBy;
  return body;
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

async function write(
  client: GitHubClient,
  path: string,
  method: string,
  body: Record<string, unknown>,
  operation: string,
  success: number,
) {
  const response = await client.fetchJSON(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const limited = rate(response.status, response.headers);
  if (limited) return limited;
  if (response.status === 404) return upstream("GitHub organization project was not found.");
  if (response.status === 401) return upstream(`GitHub rejected the ${operation} request.`);
  if (response.status === success) return { ok: true as const, body: response.body };
  return upstream(`GitHub rejected the ${operation} request.`);
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

function orgProjects(org: string): string {
  return `/orgs/${encodeURIComponent(org)}/projectsV2`;
}

function projectPath(payload: OrgProject): string {
  return `${orgProjects(payload.org)}/${payload.projectNumber}`;
}

function query(fields: Record<string, string | number | string[] | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const entry of value) params.append(key, entry);
    } else {
      params.set(key, String(value));
    }
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}

function orgProject(input: Record<string, unknown>): OrgProject {
  return { org: segment(input.org, "org"), projectNumber: positiveInt(input.projectNumber, "projectNumber") };
}

function cursorPage(input: Record<string, unknown>): CursorPage {
  return {
    perPage: optionalPage(input.perPage, "perPage"),
    after: optionalText(input.after, "after"),
    before: optionalText(input.before, "before"),
  };
}

function fieldsQuery(value: unknown): string | string[] | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string") {
    if (value.length === 0) throw new Error("fields is required");
    return value;
  }
  if (!Array.isArray(value) || value.length === 0 || value.length > 50 || value.some((entry) => typeof entry !== "string" || entry.length === 0)) {
    throw new Error("fields must be a string or an array of up to 50 strings");
  }
  return value as string[];
}

function fieldUpdate(value: unknown, index: number): { id: number; value: string | number | null } {
  if (!isRecord(value)) throw new Error(`fields[${index}] must be an object`);
  if (value.value !== null && typeof value.value !== "string" && typeof value.value !== "number") {
    throw new Error(`fields[${index}].value must be a string, number, or null`);
  }
  return { id: positiveInt(value.id, `fields[${index}].id`), value: value.value };
}

function singleSelectOptions(value: unknown): Array<{ name: string; color?: string; description?: string }> {
  if (!Array.isArray(value) || value.length === 0) throw new Error("singleSelectOptions is required");
  return value.map((entry, index) => {
    if (!isRecord(entry)) throw new Error(`singleSelectOptions[${index}] must be an object`);
    const color = optionalText(entry.color, `singleSelectOptions[${index}].color`);
    if (color && !["BLUE", "GRAY", "GREEN", "ORANGE", "PINK", "PURPLE", "RED", "YELLOW"].includes(color)) {
      throw new Error(`singleSelectOptions[${index}].color is invalid`);
    }
    return {
      name: requiredText(entry.name, `singleSelectOptions[${index}].name`),
      color,
      description: optionalText(entry.description, `singleSelectOptions[${index}].description`),
    };
  });
}

function iterationConfiguration(value: unknown): CreateOrgProjectFieldInput["iterationConfiguration"] {
  if (!isRecord(value)) throw new Error("iterationConfiguration is required");
  return {
    startDate: requiredText(value.startDate, "iterationConfiguration.startDate"),
    duration: positiveInt(value.duration, "iterationConfiguration.duration"),
    iterations: Array.isArray(value.iterations)
      ? value.iterations.map((entry, index) => {
        if (!isRecord(entry)) throw new Error(`iterationConfiguration.iterations[${index}] must be an object`);
        return {
          title: requiredText(entry.title, `iterationConfiguration.iterations[${index}].title`),
          startDate: requiredText(entry.startDate, `iterationConfiguration.iterations[${index}].startDate`),
          duration: positiveInt(entry.duration, `iterationConfiguration.iterations[${index}].duration`),
        };
      })
      : undefined,
  };
}

function optionalSortBy(value: unknown): Array<[number, "asc" | "desc"]> | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error("sortBy must be an array");
  return value.map((entry, index) => {
    if (!Array.isArray(entry) || entry.length !== 2) throw new Error(`sortBy[${index}] must be [fieldId, direction]`);
    const direction = entry[1];
    if (direction !== "asc" && direction !== "desc") throw new Error(`sortBy[${index}] direction must be asc or desc`);
    return [positiveInt(entry[0], `sortBy[${index}].fieldId`), direction];
  });
}

function optionalIdList(value: unknown, field: string, max?: number): number[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || (max !== undefined && value.length > max)) {
    throw new Error(`${field} must be an array${max ? ` of at most ${max} ids` : ""}`);
  }
  return value.map((entry, index) => positiveInt(entry, `${field}[${index}]`));
}

function numberList(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((entry): entry is number => typeof entry === "number") : [];
}

function segment(value: unknown, field: string): string {
  const textValue = requiredText(value, field);
  if (textValue.includes("/") || textValue.includes("?") || textValue.includes("#")) {
    throw new Error(`${field} must be a single path segment`);
  }
  return textValue;
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function optionalText(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function positiveInt(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new Error(`${field} must be a positive integer`);
  }
  return value;
}

function optionalPage(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 100) {
    throw new Error(`${field} must be an integer between 1 and 100`);
  }
  return value;
}

function numberOrZero(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
