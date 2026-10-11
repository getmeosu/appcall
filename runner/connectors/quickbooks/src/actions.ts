import { createConnectorHttpClient } from "../../../bun/src/http";
import { validateAgainstSchema } from "../../../bun/src/declarative/validate";
import manifest from "../manifest.json";
import specs from "./ops.json";

type ActionInput = Record<string, unknown> & {
  accessToken: string;
  fetch?: typeof fetch;
};

type OpSpec = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  api?: "accounting" | "payments";
  path: string;
  queryKeys?: string[];
  queryMap?: Record<string, string>;
  staticQuery?: Record<string, string>;
  body?: unknown;
  pdf?: boolean;
  sparse?: boolean;
  composio?: string;
  sql?: {
    entity?: string;
    queryField?: string;
    fieldsField?: string;
    maxField?: string;
    startField?: string;
    filters?: Record<string, string>;
  };
};

const ACCOUNTING_BASE = "https://quickbooks.api.intuit.com/v3/company";
const PAYMENTS_BASE = "https://api.intuit.com/quickbooks/v4";
const WHOLE = /^\{\{\s*([A-Za-z0-9_.$-]+)\s*\}\}$/;
const INTERPOLATED = /\{\{\s*([A-Za-z0-9_.$-]+)\s*\}\}/g;

export const QUICKBOOKS_ACTION_KEYS = Object.keys(specs as Record<string, OpSpec>);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resolvePath(expression: string, context: Record<string, unknown>): unknown {
  let current: unknown = context;
  for (const segment of expression.split(".")) {
    if (!isRecord(current)) return undefined;
    current = current[segment];
  }
  return current;
}

function renderString(template: string, context: Record<string, unknown>): unknown {
  const whole = template.match(WHOLE);
  if (whole) {
    const value = resolvePath(whole[1] as string, context);
    return value === null ? undefined : value;
  }
  if (!/\{\{\s*[A-Za-z0-9_.$-]+\s*\}\}/.test(template)) return template;
  let unresolved = false;
  const interpolated = template.replace(new RegExp(INTERPOLATED.source, "g"), (_match, expression: string) => {
    const value = resolvePath(expression, context);
    if (value === undefined || value === null || value === "") {
      unresolved = true;
      return "";
    }
    return String(value);
  });
  return unresolved ? undefined : interpolated;
}

function renderTemplate(template: unknown, context: Record<string, unknown>): unknown {
  if (typeof template === "string") return renderString(template, context);
  if (Array.isArray(template)) {
    return template.map((item) => renderTemplate(item, context)).filter((item) => item !== undefined);
  }
  if (isRecord(template)) {
    const rendered: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(template)) {
      const resolved = renderTemplate(value, context);
      if (resolved !== undefined) rendered[key] = resolved;
    }
    return rendered;
  }
  return template;
}

function assertSafeSegment(field: string, value: string): string {
  if (value === "." || value === ".." || value.includes("/") || value.includes("\\") || value.includes("%2f") || value.includes("%2F") || value.includes("%2e") || value.includes("%2E")) {
    throw new Error(`${field} is not a safe path segment`);
  }
  return encodeURIComponent(value);
}

function renderPath(path: string, input: Record<string, unknown>): string {
  return path.replace(/\{\{\s*([A-Za-z0-9_.$-]+)\s*\}\}/g, (_match, expression: string) => {
    const value = resolvePath(expression, input);
    if (value === undefined || value === null || value === "") {
      throw new Error(`${expression.split(".").pop()} is required`);
    }
    return assertSafeSegment(expression, String(value));
  });
}

function optionalString(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key];
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  throw new Error(`${key} must be a string, number, or boolean`);
}

function escapeLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

function buildSql(spec: NonNullable<OpSpec["sql"]>, input: Record<string, unknown>): string {
  const raw = optionalString(input, spec.queryField ?? "query");
  if (raw) return raw;
  const entity = spec.entity;
  if (!entity) throw new Error("query is required");
  const fields = optionalString(input, spec.fieldsField ?? "fields") ?? "*";
  if (/[;]|--|\/\*/.test(fields)) {
    throw new Error("fields must be a comma-separated column list");
  }
  const max = optionalString(input, spec.maxField ?? "max_results");
  const start = optionalString(input, spec.startField ?? "start_position");
  if (max !== undefined && (!Number.isInteger(Number(max)) || Number(max) <= 0)) {
    throw new Error("max_results must be a positive integer");
  }
  if (start !== undefined && (!Number.isInteger(Number(start)) || Number(start) <= 0)) {
    throw new Error("start_position must be a positive integer");
  }
  let sql = `SELECT ${fields} FROM ${entity}`;
  const clauses: string[] = [];
  for (const [field, column] of Object.entries(spec.filters ?? {})) {
    const value = optionalString(input, field);
    if (!value) continue;
    if (column.endsWith(">=")) clauses.push(`${column.slice(0, -2)} >= '${escapeLiteral(value)}'`);
    else if (column.endsWith("<=")) clauses.push(`${column.slice(0, -2)} <= '${escapeLiteral(value)}'`);
    else clauses.push(`${column} = '${escapeLiteral(value)}'`);
  }
  if (clauses.length > 0) sql += ` WHERE ${clauses.join(" AND ")}`;
  if (max) sql += ` MAXRESULTS ${Number(max)}`;
  if (start) sql += ` STARTPOSITION ${Number(start)}`;
  return sql;
}

function queryString(values: Record<string, string | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, item] of Object.entries(values)) {
    if (item !== undefined && item !== "") query.set(key, item);
  }
  const encoded = query.toString();
  return encoded ? `?${encoded}` : "";
}

export async function executeQuickBooksAction(operation: string, rawInput: unknown): Promise<unknown> {
  if (!rawInput || typeof rawInput !== "object" || Array.isArray(rawInput)) {
    throw new Error("input must be an object");
  }
  const input = rawInput as ActionInput;
  const spec = (specs as Record<string, OpSpec>)[operation];
  if (!spec) throw new Error(`Unsupported QuickBooks action: ${operation}`);
  if (typeof input.accessToken !== "string" || input.accessToken.length === 0) {
    throw new Error("accessToken is required");
  }

  const op = (manifest.operations as Record<string, {
    maxResponseBytes?: number;
    timeoutMs?: number;
    inputSchema?: Record<string, unknown>;
  }>)[operation];
  if (op?.inputSchema) {
    validateAgainstSchema(input, op.inputSchema);
  }
  const http = createConnectorHttpClient({
    allowedHosts: manifest.network.allowedHosts as string[],
    maxResponseBytes: op?.maxResponseBytes ?? 5_242_880,
    timeoutMs: op?.timeoutMs ?? 30_000,
    fetch: input.fetch,
  });

  const path = renderPath(spec.path, input);
  const query: Record<string, string | undefined> = { ...(spec.staticQuery ?? {}) };
  for (const key of spec.queryKeys ?? []) {
    const wire = spec.queryMap?.[key] ?? key;
    query[wire] = optionalString(input, key);
  }
  if (spec.sql) query.query = buildSql(spec.sql, input);

  let body: unknown = spec.body === undefined ? undefined : renderTemplate(spec.body, input);
  if (spec.sparse === true) {
    if (!isRecord(body)) throw new Error("invoice must be an object");
    body = { ...body, sparse: true };
  }

  const base = spec.api === "payments" ? PAYMENTS_BASE : ACCOUNTING_BASE;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${input.accessToken}`,
    Accept: spec.pdf ? "application/pdf" : "application/json",
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const requestId = optionalString(input, "request_id") ?? optionalString(input, "requestid");
  if (spec.api === "payments" && requestId) headers["Request-Id"] = requestId;

  const response = await http.fetchText(`${base}${path}${queryString(query)}`, {
    method: spec.method ?? "GET",
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  if (response.status === 429) {
    const retryAfter = Number(response.headers["retry-after"] ?? response.headers["Retry-After"] ?? "30");
    throw {
      ok: false,
      code: "CONNECTOR_RATE_LIMITED",
      message: "QuickBooks rate limit exceeded.",
      retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 30,
    };
  }
  if (response.status < 200 || response.status >= 300) {
    throw {
      ok: false,
      code: "CONNECTOR_UPSTREAM_ERROR",
      message: `QuickBooks rejected ${operation} (HTTP ${response.status}).`,
    };
  }
  if (response.body.length === 0) {
    return { connector: "quickbooks", action: operation, source: "provider", ok: true };
  }
  if (spec.pdf) {
    return {
      connector: "quickbooks",
      action: operation,
      source: "provider",
      contentType: response.headers["content-type"] ?? "application/pdf",
      pdf: response.body,
    };
  }
  try {
    return {
      connector: "quickbooks",
      action: operation,
      source: "provider",
      data: JSON.parse(response.body),
    };
  } catch {
    return {
      connector: "quickbooks",
      action: operation,
      source: "provider",
      data: response.body,
    };
  }
}

export function createQuickBooksActionHandlers(): Record<string, (input: unknown) => Promise<unknown>> {
  return Object.fromEntries(
    QUICKBOOKS_ACTION_KEYS.map((operation) => [
      operation,
      (input: unknown) => executeQuickBooksAction(operation, input),
    ]),
  );
}
