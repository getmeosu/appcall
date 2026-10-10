import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import { ConnectorHttpError, createConnectorHttpClient } from "../../../bun/src/http";
import manifest from "../manifest.json";

const compiled = compileDeclarativeConnector(manifest as never);
const allowedHosts = (manifest.network as { allowedHosts: string[] }).allowedHosts;
const baseUrl = "https://api.float.com/v3";

type FetchFn = typeof fetch;
type JsonRecord = Record<string, unknown>;

const STATUS_BY_NAME: Record<string, number> = {
  draft: 0,
  tentative: 1,
  confirmed: 2,
  complete: 3,
  completed: 3,
  canceled: 4,
  cancelled: 4,
};

const RECURRENCE_BY_NAME: Record<string, number> = {
  none: 0,
  weekly: 1,
  monthly: 2,
  every_two_weeks: 3,
  every_three_weeks: 4,
  every_six_weeks: 5,
  every_two_months: 6,
  every_three_months: 7,
  every_six_months: 8,
  yearly: 9,
};

const PEOPLE_TYPE_BY_NAME: Record<string, number> = {
  employee: 1,
  contractor: 2,
  placeholder: 3,
  role_placeholder: 4,
};

const PROJECT_EXPAND_BY_NAME: Record<string, string> = {
  phases: "phases",
  project_tasks: "project_tasks",
  team: "project_team",
  project_team: "project_team",
  expenses: "expenses",
  currency: "currency",
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): JsonRecord {
  if (!isRecord(value)) throw invalid("input must be an object");
  return value;
}

function invalid(message: string): { ok: false; code: "INVALID_ACTION_INPUT"; message: string } {
  return { ok: false, code: "INVALID_ACTION_INPUT", message };
}

function first(input: JsonRecord, ...keys: string[]): unknown {
  for (const key of keys) {
    if (Object.hasOwn(input, key) && input[key] !== undefined && input[key] !== null && input[key] !== "") {
      return input[key];
    }
  }
  return undefined;
}

function present(input: JsonRecord, key: string): boolean {
  return Object.hasOwn(input, key) && input[key] !== undefined;
}

function copyAliases(input: JsonRecord, pairs: Array<[string, string]>): JsonRecord {
  const out: JsonRecord = { ...input };
  for (const [canonical, alias] of pairs) {
    if (!present(out, canonical) && present(out, alias)) out[canonical] = out[alias];
  }
  return out;
}

function flag01(value: unknown): unknown {
  if (value === true) return 1;
  if (value === false) return 0;
  return value;
}

function csv(value: unknown, mapItem?: (item: unknown) => string): unknown {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return value;
  return value.map((item) => (mapItem ? mapItem(item) : String(item))).join(",");
}

function statusCode(value: unknown): unknown {
  if (typeof value === "number") return value;
  if (typeof value === "string" && Object.hasOwn(STATUS_BY_NAME, value)) return STATUS_BY_NAME[value];
  return value;
}

function recurrenceCode(value: unknown): unknown {
  if (typeof value === "number") return value;
  if (typeof value === "string" && Object.hasOwn(RECURRENCE_BY_NAME, value)) return RECURRENCE_BY_NAME[value];
  return value;
}

function peopleTypeCode(value: unknown): string {
  if (typeof value === "number") return String(value);
  if (typeof value === "string" && Object.hasOwn(PEOPLE_TYPE_BY_NAME, value)) return String(PEOPLE_TYPE_BY_NAME[value]);
  return String(value);
}

function hexColor(value: unknown): unknown {
  if (typeof value !== "string") return value;
  return value.startsWith("#") ? value.slice(1) : value;
}

function pageFromCursor(value: unknown): unknown {
  if (typeof value !== "string") return value;
  if (/^[1-9][0-9]*$/.test(value)) return Number(value);
  return undefined;
}

function mapListCommon(input: JsonRecord): JsonRecord {
  const out = copyAliases(input, [
    ["perPage", "per_page"],
    ["departmentId", "department_id"],
    ["clientId", "client_id"],
    ["peopleId", "people_id"],
    ["projectId", "project_id"],
    ["startDate", "start_date"],
    ["endDate", "end_date"],
    ["projectCode", "project_code"],
  ]);
  const active = first(out, "active");
  if (active !== undefined) out.active = flag01(active);
  const tags = first(out, "tags");
  if (tags !== undefined) out.tags = csv(tags);
  const cursorPage = pageFromCursor(first(out, "next_cursor"));
  if (cursorPage !== undefined && !present(out, "page")) out.page = cursorPage;
  return out;
}

export function mapPeopleListInput(input: JsonRecord): JsonRecord {
  const out = mapListCommon(input);
  const include = first(out, "include");
  if (include !== undefined && !present(out, "expand")) out.expand = csv(include);
  const employment = first(out, "employment", "employee_type");
  if (employment !== undefined && !present(out, "employeeType")) {
    out.employeeType = employment === "full_time" || employment === 1 ? 1 : 0;
  }
  const types = first(out, "people_types", "people_type_id");
  if (types !== undefined && !present(out, "peopleTypeId")) out.peopleTypeId = csv(types, peopleTypeCode);
  return out;
}

export function mapProjectListInput(input: JsonRecord): JsonRecord {
  const out = mapListCommon(input);
  const include = first(out, "include");
  if (include !== undefined && !present(out, "expand")) {
    out.expand = csv(include, (item) => PROJECT_EXPAND_BY_NAME[String(item)] ?? String(item));
  }
  const status = first(out, "status");
  if (status !== undefined) out.status = statusCode(status);
  const billable = first(out, "billable");
  if (typeof billable === "boolean" && !present(out, "nonBillable")) out.nonBillable = billable ? 0 : 1;
  return out;
}

export function mapAllocationListInput(input: JsonRecord): JsonRecord {
  const out = mapListCommon(input);
  const status = first(out, "status");
  if (status !== undefined) out.status = statusCode(status);
  const billable = first(out, "billable");
  if (typeof billable === "boolean") out.billable = billable ? 1 : 0;
  const recurrence = first(out, "recurrence", "repeat_state");
  if (recurrence !== undefined && !present(out, "repeatState")) out.repeatState = recurrenceCode(recurrence);
  const task = first(out, "project_task_id", "task_meta_id");
  if (task !== undefined && !present(out, "projectTaskId")) out.projectTaskId = task;
  const includeDays = first(out, "include_task_days", "includeTaskDays");
  if (includeDays === true && !present(out, "expand")) out.expand = "task_days";
  return out;
}

export function mapProjectGetInput(input: JsonRecord): JsonRecord {
  const out = copyAliases(input, [["projectId", "project_id"]]);
  const include = first(out, "include");
  if (include !== undefined && !present(out, "expand")) {
    out.expand = csv(include, (item) => PROJECT_EXPAND_BY_NAME[String(item)] ?? String(item));
  }
  return out;
}

function wrap(operation: string, map: (input: JsonRecord) => JsonRecord) {
  const handler = compiled.actions[operation];
  if (!handler) throw new Error(`missing compiled handler ${operation}`);
  return (input: unknown) => handler(map(asRecord(input)));
}

export const listPeople = wrap("people.list", mapPeopleListInput);
export const listProjects = wrap("projects.list", mapProjectListInput);
export const listAllocations = wrap("allocations.list", mapAllocationListInput);
export const getProject = wrap("projects.get", mapProjectGetInput);
export const listAccounts = wrap("accounts.list", mapListCommon);
export const listClients = wrap("clients.list", mapListCommon);
export const healthcheck = compiled.actions.healthcheck!;
export const getPeopleCapacityReport = wrap("reports.people.get", (input) =>
  copyAliases(input, [["startDate", "start_date"], ["endDate", "end_date"], ["peopleId", "people_id"]]),
);
export const getProjectUtilizationReport = wrap("reports.projects.get", (input) =>
  copyAliases(input, [["startDate", "start_date"], ["endDate", "end_date"], ["projectId", "project_id"]]),
);

function projectWriteBody(input: JsonRecord, updating: boolean): JsonRecord {
  const body: JsonRecord = {};
  const name = first(input, "name");
  if (name !== undefined) body.name = name;
  if (present(input, "tags")) body.tags = input.tags;
  const color = first(input, "color");
  if (color !== undefined) body.color = hexColor(color);
  if (present(input, "notes")) body.notes = input.notes;
  const status = first(input, "status");
  if (status !== undefined) body.status = statusCode(status);
  const nonBillable = first(input, "nonBillable", "non_billable");
  const billable = first(input, "billable");
  if (nonBillable !== undefined) body.non_billable = nonBillable;
  else if (typeof billable === "boolean") body.non_billable = billable ? 0 : 1;
  const endDate = first(input, "endDate", "end_date");
  if (endDate !== undefined) body.end_date = endDate;
  const startDate = first(input, "startDate", "start_date");
  if (startDate !== undefined) body.start_date = startDate;
  const projectCode = first(input, "projectCode", "project_code");
  if (projectCode !== undefined) body.project_code = projectCode;
  if (updating && present(input, "active")) body.active = flag01(input.active);
  const clientId = first(input, "clientId", "client_id");
  if (clientId !== undefined) body.client_id = clientId === 0 ? null : clientId;
  return body;
}

function allocationWriteBody(input: JsonRecord, creating: boolean): JsonRecord {
  const body: JsonRecord = {};
  const projectId = first(input, "projectId", "project_id");
  if (projectId !== undefined) body.project_id = projectId;
  const startDate = first(input, "startDate", "start_date");
  if (startDate !== undefined) body.start_date = startDate;
  const endDate = first(input, "endDate", "end_date");
  if (endDate !== undefined) body.end_date = endDate;
  const hours = first(input, "hours_per_day", "hours");
  if (hours !== undefined) {
    if (typeof hours === "number" && hours <= 0) throw invalid("hours_per_day must be greater than zero");
    body.hours = hours;
  }
  const peopleIds = first(input, "peopleIds", "people_ids");
  if (Array.isArray(peopleIds)) body.people_ids = peopleIds;
  else {
    const peopleId = first(input, "peopleId", "people_id");
    if (peopleId !== undefined) body.people_id = peopleId;
  }
  const phaseId = first(input, "phaseId", "phase_id");
  if (phaseId !== undefined) body.phase_id = phaseId === 0 ? null : phaseId;
  if (present(input, "notes")) body.notes = input.notes;
  const status = first(input, "status");
  if (status !== undefined) body.status = statusCode(status);
  const startTimeKey = present(input, "startTime") ? "startTime" : "start_time";
  if (present(input, startTimeKey)) body.start_time = input[startTimeKey] === "" ? null : input[startTimeKey];
  const taskName = first(input, "projectTaskName", "project_task_name");
  const taskId = first(input, "projectTaskId", "project_task_id");
  if (taskId !== undefined) body.task_meta_id = taskId === 0 ? null : taskId;
  else if (taskName !== undefined) body.name = taskName;
  const recurrence = first(input, "recurrence", "repeatState", "repeat_state");
  if (recurrence !== undefined) body.repeat_state = recurrenceCode(recurrence);
  const repeatEndDateKey = present(input, "repeatEndDate") ? "repeatEndDate" : "repeat_end_date";
  if (present(input, repeatEndDateKey)) body.repeat_end_date = input[repeatEndDateKey] === "" ? null : input[repeatEndDateKey];
  if (creating) {
    if (body.project_id === undefined) throw invalid("project_id is required");
    if (body.start_date === undefined) throw invalid("start_date is required");
    if (body.end_date === undefined) throw invalid("end_date is required");
    if (body.hours === undefined) throw invalid("hours_per_day is required");
  }
  return body;
}

function credential(input: JsonRecord): { apiKey: string; fetch?: FetchFn } {
  const apiKey = input.apiKey;
  if (typeof apiKey !== "string" || apiKey.length === 0) throw invalid("apiKey is required");
  return { apiKey, fetch: typeof input.fetch === "function" ? (input.fetch as FetchFn) : undefined };
}

function callFloat(options: {
  action: string;
  method: string;
  path: string;
  body?: JsonRecord;
  query?: JsonRecord;
  input: JsonRecord;
  success: number[];
}): Promise<JsonRecord> {
  const creds = credential(options.input);
  const operation = (manifest.operations as Record<string, { maxResponseBytes?: number; timeoutMs?: number }>)[options.action];
  const client = createConnectorHttpClient({
    allowedHosts,
    maxResponseBytes: operation?.maxResponseBytes ?? 5242880,
    timeoutMs: operation?.timeoutMs ?? 15000,
    fetch: creds.fetch,
  });
  const url = new URL(`${baseUrl}${options.path}`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  const headers: Record<string, string> = {
    Authorization: `Bearer ${creds.apiKey}`,
    Accept: "application/json",
  };
  let body: string | undefined;
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }
  return client
    .fetchText(url, { method: options.method, headers, body })
    .then((response) => finish(options.action, response, options.success))
    .catch((error) => {
      if (error instanceof ConnectorHttpError) throw { ok: false, code: error.code, message: error.message };
      throw error;
    });
}

function finish(
  action: string,
  response: { status: number; headers: Record<string, string>; body: string },
  success: number[],
): JsonRecord {
  if (response.status === 429) {
    throw {
      ok: false,
      code: "CONNECTOR_RATE_LIMITED",
      message: "Float rate limit exceeded.",
      retryAfterSeconds: retryAfterSeconds(response.headers),
    };
  }
  if (!success.includes(response.status)) {
    throw {
      ok: false,
      code: "CONNECTOR_UPSTREAM_ERROR",
      message: upstreamMessage(response),
    };
  }
  const parsed = parseBody(response.body);
  return {
    connector: "float",
    action,
    source: "provider",
    data: parsed,
  };
}

function retryAfterSeconds(headers: Record<string, string>): number {
  const raw = header(headers, "retry-after");
  const parsed = raw ? Number(raw) : Number.NaN;
  if (Number.isFinite(parsed) && parsed > 0) return Math.min(Math.floor(parsed), 3600);
  return 60;
}

function header(headers: Record<string, string>, name: string): string | undefined {
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === wanted) return value;
  }
  return undefined;
}

function parseBody(body: string): unknown {
  const trimmed = body.trim();
  if (trimmed === "") return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

function upstreamMessage(response: { body: string }): string {
  const parsed = parseBody(response.body);
  if (isRecord(parsed)) {
    const message = parsed.message ?? parsed.error;
    if (typeof message === "string" && message.length > 0) return message;
  }
  return "Float rejected the request.";
}

export function createProject(inputValue: unknown): Promise<JsonRecord> | JsonRecord {
  try {
    const input = asRecord(inputValue);
    const name = first(input, "name");
    if (typeof name !== "string" || name.length === 0) throw invalid("name is required");
    return callFloat({
      action: "projects.create",
      method: "POST",
      path: "/projects",
      body: projectWriteBody(input, false),
      success: [201, 200],
      input,
    });
  } catch (error) {
    return Promise.reject(error);
  }
}

export function updateProject(inputValue: unknown): Promise<JsonRecord> | JsonRecord {
  try {
    const input = asRecord(inputValue);
    const projectId = first(input, "projectId", "project_id");
    if (typeof projectId !== "number" || !Number.isInteger(projectId) || projectId < 1) {
      throw invalid("project_id is required");
    }
    return callFloat({
      action: "projects.update",
      method: "PATCH",
      path: `/projects/${projectId}`,
      body: projectWriteBody(input, true),
      success: [200],
      input,
    });
  } catch (error) {
    return Promise.reject(error);
  }
}

export function createAllocation(inputValue: unknown): Promise<JsonRecord> | JsonRecord {
  try {
    const input = asRecord(inputValue);
    return callFloat({
      action: "allocations.create",
      method: "POST",
      path: "/tasks",
      body: allocationWriteBody(input, true),
      success: [201, 200],
      input,
    });
  } catch (error) {
    return Promise.reject(error);
  }
}

export function updateAllocation(inputValue: unknown): Promise<JsonRecord> | JsonRecord {
  try {
    const input = asRecord(inputValue);
    const allocationId = first(input, "taskId", "allocationId", "allocation_id");
    if (typeof allocationId !== "number" || !Number.isInteger(allocationId) || allocationId < 1) {
      throw invalid("allocation_id is required");
    }
    return callFloat({
      action: "allocations.update",
      method: "PATCH",
      path: `/tasks/${allocationId}`,
      body: allocationWriteBody(input, false),
      success: [200],
      input,
    });
  } catch (error) {
    return Promise.reject(error);
  }
}

export const floatActions: Record<string, (input: unknown) => unknown> = {
  ...compiled.actions,
  healthcheck,
  "accounts.list": listAccounts,
  "people.list": listPeople,
  "clients.list": listClients,
  "projects.list": listProjects,
  "projects.get": getProject,
  "projects.create": createProject,
  "projects.update": updateProject,
  "allocations.list": listAllocations,
  "allocations.create": createAllocation,
  "allocations.update": updateAllocation,
  "reports.people.get": getPeopleCapacityReport,
  "reports.projects.get": getProjectUtilizationReport,
};
