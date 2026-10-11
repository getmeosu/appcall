import { createConnectorHttpClient } from "../../../bun/src/http";
import manifest from "../manifest.json";

function assertSafePathSegment(value: string, field: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new Error(`${field} is required`);
  if (!/^[A-Za-z0-9._-]+$/.test(trimmed)) {
    throw new Error(`${field} may only contain letters, digits, dots, underscores and hyphens`);
  }
  return trimmed;
}

function upstreamErrorFor(
  provider: string,
  status: number,
  headers: Record<string, string>,
  body: string,
): { ok: false; code: string; message: string; retryAfterSeconds?: number } {
  if (status === 429) {
    const raw = Number(headers["retry-after"] ?? "");
    return {
      ok: false,
      code: "CONNECTOR_RATE_LIMITED",
      message: `${provider} rate limit exceeded.`,
      retryAfterSeconds: Number.isFinite(raw) && raw > 0 ? raw : 10,
    };
  }
  return {
    ok: false,
    code: "CONNECTOR_UPSTREAM_ERROR",
    message: `${provider} API returned ${status}: ${body.slice(0, 200)}`,
  };
}

type ActionInput = Record<string, unknown> & {
  account: string;
  accessToken: string;
  fetch?: typeof fetch;
};
type RequestSpec = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: (input: ActionInput) => string;
  query?: (input: ActionInput) => Record<string, string | undefined>;
  body?: (input: ActionInput) => unknown;
  host?: "public" | "account" | "root";
};

function value(input: ActionInput, key: string): string {
  const raw = input[key];
  if (typeof raw !== "string" || raw.trim() === "") throw new Error(`${key} is required`);
  return raw;
}
function segment(input: ActionInput, key: string): string {
  return assertSafePathSegment(value(input, key), key);
}
function queryString(values: Record<string, string | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, item] of Object.entries(values)) if (item !== undefined && item !== "") query.set(key, item);
  const encoded = query.toString();
  return encoded ? `?${encoded}` : "";
}
function jsonBody(input: ActionInput, key: string): unknown {
  const body = input[key];
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new Error(`${key} must be an object`);
  }
  return body;
}
const optional = (input: ActionInput, key: string): string | undefined => {
  const item = input[key];
  if (item === undefined || item === null || item === "") return undefined;
  if (
    typeof item !== "string" &&
    typeof item !== "number" &&
    typeof item !== "boolean"
  ) {
    throw new Error(`${key} must be a string, number, or boolean`);
  }
  return String(item);
};

const requests: Record<string, RequestSpec> = {
  "healthcheck": { method: "GET", path: () => "/stages" },
  "jobs.list": {
    method: "GET",
    path: () => "/jobs",
    query: (i) => ({
      state: optional(i, "state"),
      limit: optional(i, "limit"),
      since_id: optional(i, "sinceId"),
      max_id: optional(i, "maxId"),
      created_after: optional(i, "createdAfter"),
      updated_after: optional(i, "updatedAfter"),
      include_fields: optional(i, "includeFields"),
    }),
  },
  "jobs.get": { method: "GET", path: (i) => `/jobs/${segment(i, "shortcode")}` },
  "candidates.list": {
    method: "GET",
    path: () => "/candidates",
    query: (i) => ({
      email: optional(i, "email"),
      shortcode: optional(i, "shortcode"),
      stage: optional(i, "stage"),
      limit: optional(i, "limit"),
      since_id: optional(i, "sinceId"),
      max_id: optional(i, "maxId"),
      created_after: optional(i, "createdAfter"),
      updated_after: optional(i, "updatedAfter"),
    }),
  },
  "candidates.get": { method: "GET", path: (i) => `/candidates/${segment(i, "id")}` },
  "stages.list": { method: "GET", path: () => "/stages" },
  "members.list": {
    method: "GET",
    path: () => "/members",
    query: (i) => ({
      limit: optional(i, "limit"),
      since_id: optional(i, "sinceId"),
      max_id: optional(i, "maxId"),
      role: optional(i, "role"),
      shortcode: optional(i, "shortcode"),
      email: optional(i, "email"),
      name: optional(i, "name"),
      status: optional(i, "status"),
    }),
  },
  "events.list": {
    method: "GET",
    path: () => "/events",
    query: (i) => ({
      type: optional(i, "type"),
      limit: optional(i, "limit"),
      since_id: optional(i, "sinceId"),
      max_id: optional(i, "maxId"),
      start_date: optional(i, "startDate"),
      end_date: optional(i, "endDate"),
      candidate_id: optional(i, "candidateId"),
      shortcode: optional(i, "shortcode"),
      member_id: optional(i, "memberId"),
      context: optional(i, "context"),
      include_cancelled: optional(i, "includeCancelled"),
    }),
  },
  "accounts.list": { method: "GET", host: "root", path: () => "/accounts" },
  "accounts.get": { method: "GET", host: "root", path: (i) => `/accounts/${segment(i, "subdomain")}` },
  "permission_sets.list": { method: "GET", path: () => "/permission_sets" },
  "recruiters.list": {
    method: "GET",
    path: () => "/recruiters",
    query: (i) => ({ shortcode: optional(i, "shortcode") }),
  },
  "departments.list": { method: "GET", path: () => "/departments" },
  "departments.create": {
    method: "POST",
    path: () => "/departments",
    body: (i) => ({
      name: value(i, "name"),
      ...(optional(i, "parentId") ? { parent_id: optional(i, "parentId") } : {}),
    }),
  },
  "departments.update": {
    method: "PUT",
    path: () => "/departments",
    body: (i) => ({
      id: segment(i, "departmentId"),
      ...(optional(i, "name") ? { name: optional(i, "name") } : {}),
      ...(optional(i, "parentId") ? { parent_id: optional(i, "parentId") } : {}),
    }),
  },
  "departments.delete": {
    method: "DELETE",
    path: (i) => `/departments/${segment(i, "departmentId")}`,
    query: (i) => ({ force: optional(i, "force") }),
  },
  "departments.merge": {
    method: "POST",
    path: (i) => `/departments/${segment(i, "departmentId")}/merge`,
    body: (i) => ({
      target_department_id: segment(i, "targetDepartmentId"),
      ...(typeof i.force === "boolean" ? { force: i.force } : {}),
    }),
  },
  "legal_entities.list": { method: "GET", path: () => "/legal_entities" },
  "custom_attributes.list": { method: "GET", path: () => "/custom_attributes" },
  "disqualification_reasons.list": { method: "GET", path: () => "/disqualification_reasons" },
  "requisitions.list": {
    method: "GET",
    path: () => "/requisitions",
    query: (i) => {
      const names: Record<string, string> = {
        jobId: "job_id",
        planDateFrom: "plan_date_from",
        planDateTo: "plan_date_to",
        sinceId: "since_id",
        maxId: "max_id",
        createdAfter: "created_after",
        updatedAfter: "updated_after",
      };
      const keys = [
        "state",
        "jobId",
        "planDateFrom",
        "planDateTo",
        "limit",
        "sinceId",
        "maxId",
        "createdAfter",
        "updatedAfter",
      ];
      return Object.fromEntries(keys.map((key) => [names[key] ?? key, optional(i, key)]));
    },
  },
  "requisitions.get": { method: "GET", path: (i) => `/requisitions/${segment(i, "code")}` },
  "employees.list": {
    method: "GET",
    path: () => "/employees",
    query: (i) => ({
      query: optional(i, "query"),
      employee_id: optional(i, "employeeId"),
      legal_entity_id: optional(i, "legalEntityId"),
      department_id: optional(i, "departmentId"),
      limit: optional(i, "limit"),
      offset: optional(i, "offset"),
      order_by: optional(i, "orderBy"),
      member_id: optional(i, "memberId"),
    }),
  },
  "employees.get": {
    method: "GET",
    path: (i) => `/employees/${segment(i, "employeeId")}`,
    query: (i) => ({ member_id: optional(i, "memberId") }),
  },
  "employees.create": {
    method: "POST",
    path: () => "/employees",
    body: (i) => ({
      ...(optional(i, "memberId") ? { member_id: optional(i, "memberId") } : {}),
      ...(optional(i, "state") ? { state: optional(i, "state") } : {}),
      employee: jsonBody(i, "employee"),
    }),
  },
  "employees.update": {
    method: "PATCH",
    path: (i) => `/employees/${segment(i, "employeeId")}`,
    body: (i) => ({
      ...(optional(i, "memberId") ? { member_id: optional(i, "memberId") } : {}),
      employee: jsonBody(i, "employee"),
    }),
  },
  "employees.documents.upload": {
    method: "POST",
    path: (i) => `/employees/${segment(i, "employeeId")}/documents`,
    body: (i) => ({
      ...(optional(i, "memberId") ? { member_id: optional(i, "memberId") } : {}),
      documents: i.documents,
    }),
  },
  "employee_fields.list": {
    method: "GET",
    path: () => "/employee_fields",
    query: (i) => ({ member_id: optional(i, "memberId") }),
  },
  "timeoff.balances.list": { method: "GET", path: () => "/timeoff/balances", query: (i) => ({ employee_id: optional(i, "employeeId") }) },
  "timeoff.categories.list": { method: "GET", path: () => "/timeoff/categories" },
  "work_schedules.list": { method: "GET", path: () => "/work_schedules" },
  "events.get": { method: "GET", path: (i) => `/events/${segment(i, "eventId")}` },
  "subscriptions.list": { method: "GET", path: () => "/subscriptions" },
  "subscriptions.create": {
    method: "POST",
    path: () => "/subscriptions",
    body: (i) => ({
      target: value(i, "target"),
      event: value(i, "event"),
      ...(i.args && typeof i.args === "object" ? { args: i.args } : {}),
    }),
  },
  "subscriptions.delete": { method: "DELETE", path: (i) => `/subscriptions/${segment(i, "subscriptionId")}` },
  "members.update": { method: "PUT", path: () => "/members", body: (i) => jsonBody(i, "member") },
  "members.invite": { method: "POST", path: () => "/members/invite", body: (i) => jsonBody(i, "member") },
  "members.enable": { method: "POST", path: (i) => `/members/${segment(i, "memberId")}/enable` },
  "public_jobs.list": {
    method: "GET",
    host: "public",
    path: (i) => `/api/accounts/${segment(i, "subdomain")}`,
    query: (i) => ({ details: optional(i, "details") }),
  },
  "public_locations.list": { method: "GET", host: "public", path: (i) => `/api/accounts/${segment(i, "subdomain")}/locations` },
  "background_checks.update": {
    method: "PUT",
    host: "account",
    path: (i) => `/checks/${segment(i, "backgroundCheckId")}`,
    body: (i) => {
      const status = value(i, "status");
      const resultsUrl = optional(i, "resultsUrl");
      if (status === "completed" && !resultsUrl) {
        throw new Error("resultsUrl is required when status is completed");
      }
      const check = i.check;
      if (check !== undefined && (check === null || typeof check !== "object" || Array.isArray(check))) {
        throw new Error("check must be an object");
      }
      const attachments = i.attachments;
      if (attachments !== undefined && !Array.isArray(attachments)) {
        throw new Error("attachments must be an array");
      }
      return {
        status,
        ...(resultsUrl ? { results_url: resultsUrl } : {}),
        ...(check ? { check } : {}),
        ...(attachments ? { attachments } : {}),
      };
    },
  },
};

const SYNC_KEYS = new Set([
  "jobs.list",
  "jobs.get",
  "candidates.list",
  "candidates.get",
  "stages.list",
  "members.list",
  "events.list",
]);

export const WORKABLE_ACTION_KEYS = Object.keys(requests).filter(
  (operation) => operation !== "healthcheck" && !SYNC_KEYS.has(operation),
);

export async function executeWorkableAction(operation: string, rawInput: unknown): Promise<unknown> {
  if (!rawInput || typeof rawInput !== "object" || Array.isArray(rawInput)) throw new Error("input must be an object");
  const input = rawInput as ActionInput;
  const request = requests[operation];
  if (!request) throw new Error(`Unsupported Workable action: ${operation}`);
  const account = assertSafePathSegment(input.account, "account");
  if (typeof input.accessToken !== "string" || input.accessToken.length === 0) throw new Error("accessToken is required");
  const baseUrl =
    request.host === "public"
      ? "https://www.workable.com"
      : request.host === "root"
        ? "https://workable.com/spi/v3"
        : request.host === "account"
          ? `https://${account}.workable.com`
          : `https://${account}.workable.com/spi/v3`;
  const spec = (manifest.operations as Record<string, { maxResponseBytes?: number; timeoutMs?: number }>)[operation];
  const http = createConnectorHttpClient({
    allowedHosts: manifest.network.allowedHosts,
    maxResponseBytes: spec?.maxResponseBytes ?? 5_242_880,
    timeoutMs: spec?.timeoutMs ?? 30_000,
    fetch: input.fetch,
  });
  const suffix = queryString(request.query?.(input) ?? {});
  const body = request.body?.(input);
  const response = await http.fetchText(`${baseUrl}${request.path(input)}${suffix}`, {
    method: request.method,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${input.accessToken}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (response.status < 200 || response.status >= 300) {
    throw upstreamErrorFor("Workable", response.status, response.headers, response.body);
  }
  if (response.body.length === 0) return { ok: true };
  try {
    return JSON.parse(response.body);
  } catch {
    throw { ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message: "Workable returned a non-JSON body." };
  }
}

export function createWorkableActionHandlers(): Record<string, (input: unknown) => Promise<unknown>> {
  return Object.fromEntries(
    WORKABLE_ACTION_KEYS.map((operation) => [
      operation,
      (input: unknown) => executeWorkableAction(operation, input),
    ]),
  );
}
