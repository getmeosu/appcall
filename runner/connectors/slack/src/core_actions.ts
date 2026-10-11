import manifest from "../manifest.json";
import { renderTemplate } from "../../../bun/src/declarative/template";

type JsonSchema = {
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  minimum?: number;
  maximum?: number;
};

type SlackRequest = {
  method?: string;
  path?: string;
  query?: Record<string, unknown>;
  headers?: Record<string, string>;
  body?: unknown;
  parameters?: Array<{ wireName: string; inputName: string; in: string; explode?: boolean }>;
};

type SlackOperation = {
  kind?: string;
  request?: SlackRequest;
  inputSchema?: JsonSchema;
  maxResponseBytes?: number;
};

type SlackHttp = {
  baseUrl?: string;
  headers?: Record<string, string>;
  auth?: { field?: string; name?: string; value?: string };
};

const manifestRecord = manifest as {
  http?: SlackHttp;
  operations: Record<string, SlackOperation>;
};

const SLACK_HTTP = manifestRecord.http ?? {};
const OPERATIONS = manifestRecord.operations;

// Only operations that declare a request and are not already expanded handlers.
// Expanded actions keep their POST handlers in expanded_actions.ts and have no request block.
export const slackCoreActionHandlers: Record<string, (input: unknown) => Promise<Record<string, unknown>>> =
  Object.fromEntries(
    Object.keys(OPERATIONS)
      .filter((key) => OPERATIONS[key]?.kind !== "webhook" && OPERATIONS[key]?.request)
      .map((key) => [key, async (input: unknown) => executeCoreAction(key, input)]),
  );

export const sendMessage = slackCoreActionHandlers["messages.send"];

function executeCoreAction(operationKey: string, rawInput: unknown): Promise<Record<string, unknown>> {
  const operation = OPERATIONS[operationKey];
  const request = operation?.request;
  if (!operation || !request?.method || !request.path) {
    throw actionError("INVALID_ACTION_INPUT", `slack.${operationKey} has no Slack request.`);
  }
  const { params, token, fetcher } = validateInput(operationKey, operation.inputSchema, rawInput);
  if (!token) {
    return Promise.resolve({ connector: "slack", action: operationKey, source: "connector", validated: params });
  }
  return callSlack(operationKey, operation, request, params, token, fetcher);
}

async function callSlack(
  operationKey: string,
  operation: SlackOperation,
  request: SlackRequest,
  params: Record<string, unknown>,
  token: string,
  fetcher: typeof fetch,
): Promise<Record<string, unknown>> {
  const method = request.method ?? "GET";
  const url = buildSlackUrl(request, params);
  const body = method === "GET" || method === "DELETE" ? undefined : renderBody(request.body, params);
  const headers: Record<string, string> = {};
  if (SLACK_HTTP.headers) {
    for (const [key, value] of Object.entries(SLACK_HTTP.headers)) headers[key] = value;
  }
  headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await fetcher(url, { method, headers, body, redirect: "error" });
  } catch {
    throw actionError("CONNECTOR_UPSTREAM_ERROR", "Slack request failed.");
  }

  if (response.status === 429) {
    const retryAfterHeader = response.headers.get("Retry-After");
    const retryAfter = retryAfterHeader && /^\d+$/.test(retryAfterHeader) ? Number(retryAfterHeader) : undefined;
    throw {
      ok: false,
      code: "CONNECTOR_RATE_LIMITED",
      message: "The upstream provider rate limited this request.",
      ...(retryAfter === undefined ? {} : { retryAfterSeconds: retryAfter }),
    };
  }

  const payload = await readSlackJson(response, operation.maxResponseBytes ?? 1024 * 1024);
  if (!response.ok || payload.ok !== true) {
    const providerError = typeof payload.error === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(payload.error)
      ? payload.error
      : undefined;
    throw {
      ok: false,
      code: "CONNECTOR_UPSTREAM_ERROR",
      message: `Slack rejected the ${operationKey} request.`,
      ...(providerError ? { providerError } : {}),
    };
  }

  const result: Record<string, unknown> = {
    connector: "slack",
    action: operationKey,
    source: "connector",
    data: payload,
  };
  if (operationKey === "healthcheck") result.status = "ok";
  if (operationKey === "messages.send") {
    const message = isRecord(payload.message) ? payload.message : undefined;
    const ts = typeof payload.ts === "string" ? payload.ts : typeof message?.ts === "string" ? message.ts : undefined;
    if (ts) result.providerMessageId = ts;
    if (typeof payload.channel === "string") result.channelId = payload.channel;
    if (typeof message?.text === "string") result.text = message.text;
    else if (typeof params.text === "string") result.text = params.text;
  }
  return result;
}

function buildSlackUrl(request: SlackRequest, params: Record<string, unknown>): string {
  const base = (SLACK_HTTP.baseUrl ?? "https://slack.com").replace(/\/$/, "");
  const url = new URL(`${base}${request.path ?? ""}`);
  const renderedQuery = renderTemplate(request.query ?? {}, params);
  if (isRecord(renderedQuery)) {
    for (const [key, value] of Object.entries(renderedQuery)) {
      url.searchParams.set(key, typeof value === "object" ? JSON.stringify(value) : String(value));
    }
  }
  const extras: string[] = [];
  for (const parameter of request.parameters ?? []) {
    if (parameter.in !== "query") continue;
    const value = params[parameter.inputName];
    if (value === undefined || value === null) continue;
    const encoded = Array.isArray(value)
      ? value.map((item) => encodeURIComponent(String(item))).join(",")
      : encodeURIComponent(String(value));
    extras.push(`${encodeURIComponent(parameter.wireName)}=${encoded}`);
  }
  if (extras.length > 0) {
    url.search = url.search ? `${url.search}&${extras.join("&")}` : `?${extras.join("&")}`;
  }
  return url.toString();
}

function renderBody(template: unknown, params: Record<string, unknown>): string | undefined {
  if (template === undefined) return undefined;
  const rendered = renderTemplate(template, params);
  if (rendered === undefined) return undefined;
  return JSON.stringify(rendered);
}

function validateInput(
  operationKey: string,
  schema: JsonSchema | undefined,
  rawInput: unknown,
): { params: Record<string, unknown>; token?: string; fetcher: typeof fetch } {
  if (!isRecord(rawInput)) throw invalidInput(operationKey);
  const properties = isRecord(schema?.properties) ? schema.properties : {};
  for (const key of Object.keys(rawInput)) {
    if (key !== "token" && key !== "fetch" && !(key in properties)) throw invalidInput(operationKey);
  }
  const tokenValue = rawInput.token;
  if (tokenValue !== undefined && (typeof tokenValue !== "string" || /[\r\n]/.test(tokenValue) || tokenValue.length > 8192)) {
    throw invalidInput(operationKey);
  }
  if (rawInput.fetch !== undefined && typeof rawInput.fetch !== "function") throw invalidInput(operationKey);
  for (const field of schema?.required ?? []) {
    if (!hasValue(rawInput[field])) throw invalidInput(operationKey);
  }
  const params: Record<string, unknown> = {};
  for (const [field, fieldSchema] of Object.entries(properties)) {
    if (!hasValue(rawInput[field])) continue;
    if (!matchesSchema(fieldSchema, rawInput[field])) throw invalidInput(operationKey);
    params[field] = rawInput[field];
  }
  const fetcher = (typeof rawInput.fetch === "function" ? rawInput.fetch : fetch) as typeof fetch;
  return {
    params,
    ...(typeof tokenValue === "string" && tokenValue.trim() ? { token: tokenValue.trim() } : {}),
    fetcher,
  };
}

function matchesSchema(schema: JsonSchema, value: unknown): boolean {
  if (schema.type === "string") return typeof value === "string" && value.trim().length > 0;
  if (schema.type === "boolean") return typeof value === "boolean";
  if (schema.type === "number" || schema.type === "integer") {
    return typeof value === "number" && Number.isFinite(value) &&
      (schema.type !== "integer" || Number.isInteger(value)) &&
      (typeof schema.minimum !== "number" || value >= schema.minimum) &&
      (typeof schema.maximum !== "number" || value <= schema.maximum);
  }
  if (schema.type === "array") {
    if (!Array.isArray(value) || value.length === 0) return false;
    const items = schema.items;
    return !items || value.every((item) => matchesSchema(items, item));
  }
  if (schema.type === "object") return isRecord(value);
  return true;
}

async function readSlackJson(response: Response, maxBytes: number): Promise<Record<string, unknown>> {
  const declaredLength = Number(response.headers.get("Content-Length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw actionError("CONNECTOR_UPSTREAM_ERROR", "Slack response exceeded the supported size limit.");
  }
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw actionError("CONNECTOR_UPSTREAM_ERROR", "Slack response exceeded the supported size limit.");
  }
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw actionError("CONNECTOR_UPSTREAM_ERROR", "Slack returned an invalid JSON response.");
  }
  if (!isRecord(payload)) throw actionError("CONNECTOR_UPSTREAM_ERROR", "Slack returned an invalid response shape.");
  return payload;
}

function invalidInput(operationKey: string): Record<string, unknown> {
  return actionError("INVALID_ACTION_INPUT", `Invalid input for slack.${operationKey}.`);
}

function actionError(code: string, message: string): Record<string, unknown> {
  return { ok: false, code, message };
}

function hasValue(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
