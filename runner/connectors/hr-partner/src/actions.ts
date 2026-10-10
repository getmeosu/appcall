import { createConnectorHttpClient, ConnectorHttpError } from "../../../bun/src/http";
import { validateStrictInput } from "../../../bun/src/declarative/strict-schema";
import { isRecord } from "../../../bun/src/declarative/template";
import type { JSONSchema } from "../../../bun/src/declarative/validate";
import manifest from "../manifest.json";

const credentialKeys = new Set(["apiKey", "fetch"]);
const baseUrl = "https://api.hrpartner.io";

type FetchFn = typeof fetch;

type OperationSpec = {
  timeoutMs?: number;
  maxResponseBytes?: number;
  inputSchema?: JSONSchema;
};

const operations = manifest.operations as Record<string, OperationSpec>;

const EMPLOYEE_RECORD_ROUTES: Record<
  string,
  {
    path: string;
    search?: string;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
    allowEmployee?: boolean;
    allowDepartment?: boolean;
  }
> = {
  contacts: { path: "/contacts", search: "search", allowEmployee: false, allowDepartment: false },
  addresses: { path: "/addresses", search: "location_search", allowEmployee: false, allowDepartment: false },
  goals: { path: "/goals", search: "description", dateFrom: "due_date_from", dateTo: "due_date_to" },
  checklists: {
    path: "/checklist",
    search: "checklist_template",
    dateFrom: "assigned_date_from",
    dateTo: "assigned_date_to",
  },
  absences: {
    path: "/absences",
    search: "comments",
    status: "absence_status",
    dateFrom: "absence_date_from",
    dateTo: "absence_date_to",
  },
  assets: { path: "/assets", search: "description", dateFrom: "in_date_from", dateTo: "in_date_to" },
  attachments: {
    path: "/attachments",
    search: "description",
    dateFrom: "uploaded_date_from",
    dateTo: "uploaded_date_to",
  },
  benefits: {
    path: "/benefits",
    search: "description",
    status: "benefit_status",
    dateFrom: "start_date_from",
    dateTo: "start_date_to",
  },
  dependents: {
    path: "/dependents",
    search: "name",
    dateFrom: "date_of_birth_from",
    dateTo: "date_of_birth_to",
  },
  education: {
    path: "/education",
    search: "qualification",
    status: "education_status",
    dateFrom: "commence_date_from",
    dateTo: "commence_date_to",
  },
  grievances: {
    path: "/grievances",
    search: "description",
    status: "grievance_status",
    dateFrom: "reported_date_from",
    dateTo: "reported_date_to",
  },
  interviews: {
    path: "/interviews",
    search: "description",
    dateFrom: "interview_date_from",
    dateTo: "interview_date_to",
  },
  notes: { path: "/notes", search: "note", dateFrom: "created_date_from", dateTo: "created_date_to" },
  positions: {
    path: "/positions",
    search: "position",
    dateFrom: "commence_date_from",
    dateTo: "commence_date_to",
  },
  renewables: {
    path: "/renewables",
    search: "description",
    dateFrom: "renewal_date_from",
    dateTo: "renewal_date_to",
  },
  legacy_reviews: {
    path: "/reviews",
    search: "description",
    status: "review_status",
    dateFrom: "review_date_from",
    dateTo: "review_date_to",
  },
  skills: { path: "/skills", search: "skill_name" },
  training: {
    path: "/training",
    search: "course_name",
    status: "training_status",
    dateFrom: "commence_date_from",
    dateTo: "commence_date_to",
  },
};

export function getRecruitmentRecord(input: unknown): unknown {
  const validated = validateAction("recruitment.get", input);
  if (!hasCredential(input)) return echo("recruitment.get", validated);
  const recordType = String(validated.record_type);
  const identifier = encodeURIComponent(String(validated.identifier));
  const path =
    recordType === "job"
      ? `/job/${identifier}`
      : recordType === "applicant"
        ? `/applicant/${identifier}`
        : `/application/${identifier}`;
  return getJson("recruitment.get", input, path);
}

export function listEmployeeRecords(input: unknown): unknown {
  const validated = validateAction("employee-records.list", input);
  if (!hasCredential(input)) return echo("employee-records.list", validated);
  const recordType = String(validated.record_type);
  const route = EMPLOYEE_RECORD_ROUTES[recordType];
  if (!route) return invalidInput("record_type is not an allowed value");
  const query: Record<string, unknown> = {};
  if (route.allowEmployee !== false && validated.employee_code !== undefined) query.employee = validated.employee_code;
  if (route.allowDepartment !== false && validated.department !== undefined) query.department = validated.department;
  if (route.search && validated.search !== undefined) query[route.search] = validated.search;
  if (route.status && validated.status !== undefined) query[route.status] = validated.status;
  if (route.dateFrom && validated.date_from !== undefined) query[route.dateFrom] = validated.date_from;
  if (route.dateTo && validated.date_to !== undefined) query[route.dateTo] = validated.date_to;
  if (recordType === "checklists") {
    if (validated.checklist_status !== undefined) query.checklist_status = validated.checklist_status;
    if (validated.include_details !== undefined) query.show_details = validated.include_details;
  }
  return getJson("employee-records.list", input, route.path, query);
}

export function listLeaveData(input: unknown): unknown {
  const validated = validateAction("leave.list", input);
  if (!hasCredential(input)) return echo("leave.list", validated);
  const dataType = String(validated.data_type);
  const query: Record<string, unknown> = {};
  if (validated.employee_code !== undefined) query.employee = validated.employee_code;
  if (validated.department !== undefined) query.department = validated.department;
  if (validated.location !== undefined) query.location = validated.location;
  if (validated.absence_reason !== undefined) query.absence_reason = validated.absence_reason;
  if (dataType === "requests") {
    if (validated.status !== undefined) query.status = validated.status;
    if (validated.request_type !== undefined) query.leave_request_type = validated.request_type;
    if (validated.date_from !== undefined) query.leave_start_date_from = validated.date_from;
    if (validated.date_to !== undefined) query.leave_start_date_to = validated.date_to;
    return getJson("leave.list", input, "/leave_requests", query);
  }
  if (validated.is_active !== undefined) query.is_active = validated.is_active;
  return getJson("leave.list", input, "/leave_balances", query);
}

export function searchRecruitment(input: unknown): unknown {
  const validated = validateAction("recruitment.search", input);
  if (!hasCredential(input)) return echo("recruitment.search", validated);
  const resource = String(validated.resource);
  if (resource === "jobs") {
    return getJson("recruitment.search", input, "/jobs", {
      search: validated.search,
      location: validated.location,
      department: validated.department,
      is_active: validated.is_active,
      publish_at_from: validated.date_from,
      publish_at_to: validated.date_to,
    });
  }
  if (resource === "applicants") {
    return getJson("recruitment.search", input, "/applicants", {
      search: validated.search,
    });
  }
  if (resource === "applications") {
    if (typeof validated.job_id !== "string" || validated.job_id.length === 0) {
      return invalidInput("job_id is required");
    }
    return getJson("recruitment.search", input, `/applications/${encodeURIComponent(validated.job_id)}`, {
      stage: validated.stage,
      is_flagged: validated.is_flagged,
      is_archived: validated.is_archived,
      submitted_at_from: validated.date_from,
      submitted_at_to: validated.date_to,
    });
  }
  return getJson("recruitment.search", input, "/stage/track", {
    job: validated.job_id,
    applicant: validated.applicant,
    from_stage: validated.from_stage,
    to_stage: validated.to_stage,
    changed_at_from: validated.date_from,
    changed_at_to: validated.date_to,
  });
}

export const handwrittenActions = {
  "recruitment.get": getRecruitmentRecord,
  "employee-records.list": listEmployeeRecords,
  "leave.list": listLeaveData,
  "recruitment.search": searchRecruitment,
};

function validateAction(action: string, input: unknown): Record<string, unknown> {
  const schema = operations[action]?.inputSchema ?? { type: "object" };
  try {
    return validateStrictInput(input, schema, credentialKeys);
  } catch (error) {
    throw {
      ok: false,
      code: "INVALID_ACTION_INPUT",
      message: error instanceof Error ? error.message : "Action input is invalid.",
    };
  }
}

function hasCredential(input: unknown): boolean {
  return isRecord(input) && typeof input.apiKey === "string" && input.apiKey.length > 0;
}

function echo(action: string, validated: Record<string, unknown>): Record<string, unknown> {
  return {
    connector: "hr-partner",
    action,
    source: "connector",
    validated,
  };
}

function invalidInput(message: string): never {
  throw { ok: false, code: "INVALID_ACTION_INPUT", message };
}

function getJson(
  action: string,
  input: unknown,
  path: string,
  query: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const record = isRecord(input) ? input : {};
  const operation = operations[action] ?? {};
  const client = createConnectorHttpClient({
    allowedHosts: ["api.hrpartner.io"],
    maxResponseBytes: operation.maxResponseBytes ?? 5242880,
    timeoutMs: operation.timeoutMs ?? 15000,
    fetch: typeof record.fetch === "function" ? (record.fetch as FetchFn) : undefined,
  });
  const url = new URL(`${baseUrl}${path}`);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, typeof value === "boolean" ? (value ? "true" : "false") : String(value));
  }
  return client
    .fetchText(url, {
      method: "GET",
      headers: {
        "x-api-key": String(record.apiKey),
        Accept: "application/json",
      },
    })
    .then((response) => finish(action, response))
    .catch((error) => {
      if (error instanceof ConnectorHttpError) {
        throw { ok: false, code: error.code, message: error.message };
      }
      throw error;
    });
}

function finish(
  action: string,
  response: { status: number; headers: Record<string, string>; body: string },
): Record<string, unknown> {
  if (response.status === 429) {
    throw {
      ok: false,
      code: "CONNECTOR_RATE_LIMITED",
      message: "HR Partner rate limit exceeded.",
      retryAfterSeconds: retryAfterSeconds(response.headers),
    };
  }
  if (response.status < 200 || response.status >= 300) {
    throw {
      ok: false,
      code: "CONNECTOR_UPSTREAM_ERROR",
      message: extractMessage(response.body) ?? `HR Partner rejected the request (HTTP ${response.status}).`,
    };
  }
  return {
    connector: "hr-partner",
    action,
    source: "provider",
    data: parseJson(response.body),
  };
}

function parseJson(body: string): unknown {
  const trimmed = body.trim();
  if (trimmed === "") {
    throw { ok: false, code: "CONNECTOR_RESPONSE_INVALID", message: "Connector returned an empty response." };
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    throw { ok: false, code: "CONNECTOR_RESPONSE_INVALID", message: "Connector returned invalid JSON." };
  }
}

function extractMessage(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as unknown;
    if (!isRecord(parsed)) return undefined;
    for (const key of ["error", "message"]) {
      const value = parsed[key];
      if (typeof value === "string" && value.length > 0 && value.length <= 400) return value;
      if (isRecord(value) && typeof value.message === "string" && value.message.length > 0) return value.message;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function retryAfterSeconds(headers: Record<string, string>): number {
  const raw = headers["retry-after"] ?? headers["Retry-After"];
  const parsed = raw === undefined ? Number.NaN : Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
}
