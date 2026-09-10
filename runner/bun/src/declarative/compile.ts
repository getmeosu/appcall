// Compile a declarative manifest into runner handlers.
//
// Every hand-written connector repeats the same six steps: guard on the
// credential field, validate the input, build a URL and headers, call the
// provider through the connector HTTP boundary, branch on status, and shape the
// result. Those steps are identical across providers; only the data differs.
// This module executes them once, driven by the manifest, so a new connector is
// a JSON file with no TypeScript and no registry edit.
//
// Hand-written handlers stay first-class: a manifest may declare `request` on
// some operations and leave others to registered handlers, and a registered
// handler always wins over a compiled one (see registry.ts). That keeps the
// escape hatch open for providers whose calls are genuinely irregular.

import { createConnectorHttpClient, ConnectorHttpError } from "../http";
import { isRecord, renderPath, renderTemplate, resolvePath } from "./template";
import { assertOutputSchema, validateAgainstSchema } from "./validate";
import type {
  CompiledConnector,
  CompiledHandler,
  DeclarativeErrors,
  DeclarativeHttp,
  DeclarativeManifest,
  DeclarativeOperation,
  DeclarativeRequest,
  DeclarativeSetupField,
} from "./types";

const defaultSuccessStatuses = [200, 201, 202, 204];
const defaultRateLimitStatuses = [429];
const defaultRetryAfterSeconds = 10;
const maxRetryAfterSeconds = 3600;
const defaultMessagePaths = ["error.message", "error", "message", "detail", "errors.0.message", "errors.0.detail"];

export function isDeclarativeManifest(manifest: unknown): boolean {
  if (!isRecord(manifest) || !isRecord(manifest.operations)) {
    return false;
  }
  return Object.values(manifest.operations).some(
    (operation) => isRecord(operation) && isRecord(operation.request),
  );
}

export function compileDeclarativeConnector(manifest: DeclarativeManifest): CompiledConnector {
  assertTemplatedHostsAreDeclared(manifest);
  const actions: Record<string, CompiledHandler> = {};
  const syncs: Record<string, CompiledHandler> = {};
  const operations = manifest.operations ?? {};

  for (const [operationKey, operation] of Object.entries(operations)) {
    if (!isRecord(operation) || !isRecord(operation.request)) {
      continue;
    }
    // Only actions compile today. The existing sync contract is a pure
    // transformation — a sync handler receives an already-fetched `response`
    // and returns { provider, operation, items, cursor } — which is a different
    // shape from "issue this request". Emitting a fetching sync here would ship
    // two incompatible sync contracts, so declarative syncs wait until that
    // contract is unified (see guardrails/connectors.md).
    if (operation.kind !== "action") {
      continue;
    }
    actions[operationKey] = compileOperation(manifest, operationKey, operation);
  }

  return { key: manifest.key, actions, syncs };
}

// assertTemplatedHostsAreDeclared refuses a manifest whose base URL or allowed
// hosts interpolate anything but a REQUIRED declared setup field.
//
// This is the security control behind per-tenant base URLs. The control plane
// splices the connection's stored bundle over the caller's input
// (internal/actions/service.go injectCredentials writes each bundle field after
// unmarshalling the caller's object), so such a field is always the tenant's own
// configured value and can never be forged by the caller.
//
// Both conditions carry weight, and the second is the subtle one.
// connectorsetup stores a field only when its value is non-empty
// (internal/connectorsetup/service.go), so an OPTIONAL field left blank at
// connect time is simply absent from the bundle — injectCredentials has nothing
// to overwrite with, and the caller's own value survives into the runner input.
// Declared-but-blank is therefore exactly as caller-controlled as undeclared,
// and a caller-controlled host is an SSRF. Throwing here makes startup.ts refuse
// to boot rather than shipping that silently.
function assertTemplatedHostsAreDeclared(manifest: DeclarativeManifest): void {
  const required = new Map<string, boolean>();
  const declare = (field: DeclarativeSetupField) => required.set(field.key, field.required === true);
  for (const field of manifest.auth?.setup?.fields ?? []) {
    declare(field);
  }
  for (const route of manifest.auth?.setup?.routes ?? []) {
    for (const field of route.fields ?? []) {
      declare(field);
    }
  }

  const templated: unknown[] = [
    manifest.http?.baseUrl,
    ...(manifest.network?.allowedHosts ?? []),
    ...Object.values(manifest.operations ?? {}).map((operation) => operation.request?.baseUrl),
  ];

  for (const value of templated) {
    if (typeof value !== "string") {
      continue;
    }
    for (const match of value.matchAll(/\{\{\s*([A-Za-z0-9_.$-]+)\s*\}\}/g)) {
      const name = match[1] ?? "";
      const root = name.split(".")[0] ?? name;
      if (!required.has(root)) {
        throw new Error(
          `${manifest.key}: base URL or allowed host interpolates {{${name}}}, which is not a declared setup field`,
        );
      }
      if (!required.get(root)) {
        throw new Error(
          `${manifest.key}: base URL or allowed host interpolates {{${name}}}, which is an optional setup field — ` +
            "a blank optional field is absent from the credential bundle, leaving the host caller-controlled",
        );
      }
    }
  }
}

function compileOperation(
  manifest: DeclarativeManifest,
  operationKey: string,
  operation: DeclarativeOperation,
): CompiledHandler {
  const http: DeclarativeHttp = manifest.http ?? { baseUrl: "" };
  const request: DeclarativeRequest = operation.request ?? {};
  const schema = operation.inputSchema ?? { type: "object" };
  const credentialField = http.auth?.field;
  if(operation.enforceOutputSchema && operation.outputSchema?.type !== "object") throw new Error("Output enforcement requires object schema");
  const setup=manifest.auth?.setup;
  const credentialKeys=new Set([credentialField,"fetch",...(setup?.fields??[]).map(f=>f.key),...(setup?.routes??[]).flatMap(r=>(r.fields??[]).map(f=>f.key)),...((setup as any)?.derive??[]).map((d:any)=>d.field)]);
  const validateInput=(value:unknown)=> {
    if(schema.additionalProperties===false && isRecord(value)) {
      const props=isRecord(schema.properties)?schema.properties:{};
      for(const key of Object.keys(value)) if(!Object.hasOwn(props,key) && !credentialKeys.has(key)) throw new Error("Unsupported input field");
    }
    return validateAgainstSchema(value,schema);
  };

  return function execute(input: unknown): unknown {
    // No credential means this is the fixture-safe validation path: echo what
    // the input would have been without touching the network. The control
    // plane refuses to dispatch a credentialed connector without a credential,
    // so this branch never surfaces from a real action.
    if (!hasCredential(input, credentialField)) {
      validateInput(input);
      const echo = request.echo === undefined
        ? { validated: validateInput(input) }
        : renderTemplate(request.echo, isRecord(input) ? input : {});
      return {
        connector: manifest.key,
        action: operationKey,
        source: "connector",
        ...(isRecord(echo) ? echo : { validated: echo }),
      };
    }

    const record = input as Record<string, unknown>;
    let validated: Record<string, unknown>;
    try {
      validated = validateInput(record);
    } catch (error) {
      return Promise.reject({
        ok: false,
        code: "INVALID_ACTION_INPUT",
        message: error instanceof Error ? error.message : "Action input is invalid.",
      });
    }

    return callProvider(manifest, http, operationKey, operation, request, record, validated);
  };
}

async function callProvider(
  manifest: DeclarativeManifest,
  http: DeclarativeHttp,
  operationKey: string,
  operation: DeclarativeOperation,
  request: DeclarativeRequest,
  input: Record<string, unknown>,
  validated: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  let url: URL;
  let headers: Record<string, string>;
  let body: string | undefined;
  try {
    url = buildURL(http, request, input);
    headers = buildHeaders(http, request, input);
    body = buildBody(request, input);
  } catch (error) {
    // A path or header template that cannot be resolved is an input problem,
    // not an upstream one.
    throw {
      ok: false,
      code: "INVALID_ACTION_INPUT",
      message: error instanceof Error ? error.message : "Action input is invalid.",
    };
  }

  // Allowlist entries render too, so a per-tenant host can be admitted by the
  // tenant's own stored value rather than by a pattern broad enough to cover
  // every tenant.
  const renderedHosts = renderTemplate(manifest.network?.allowedHosts ?? [], input);
  const client = createConnectorHttpClient({
    allowedHosts: Array.isArray(renderedHosts) ? renderedHosts.map(String) : [],
    maxResponseBytes: operation.maxResponseBytes ?? 1048576,
    timeoutMs: operation.timeoutMs,
    fetch: typeof input.fetch === "function" ? (input.fetch as typeof fetch) : undefined,
  });

  let response: { status: number; headers: Record<string, string>; body: string };
  try {
    response = await client.fetchText(url, { method: request.method ?? "GET", headers, body });
  } catch (error) {
    // Re-throw the outbound boundary failure as the structured shape the server
    // preserves; an Error instance would lose its code on the way out.
    if (error instanceof ConnectorHttpError) {
      throw { ok: false, code: error.code, message: error.message };
    }
    throw {
      ok: false,
      code: "CONNECTOR_UNAVAILABLE",
      // Native transport errors may include the URL and query credentials.
      message: "Connector request failed.",
    };
  }

  const parsed = parseBody(response.body);
  const successStatuses = request.success ?? defaultSuccessStatuses;
  if (!successStatuses.includes(response.status)) {
    throw upstreamFailure(manifest, http, operationKey, response, parsed, input);
  }
  // A success status is not proof of success. GraphQL providers answer 200 with
  // a populated `errors` array, so a manifest may nominate body paths that
  // demote such a response to a failure. Checked only after the status check so
  // a 4xx that also carries errors[] is not handled twice.
  if (hasBodyError(parsed, http.errors?.bodyErrorPaths)) {
    throw upstreamFailure(manifest, http, operationKey, response, parsed, input);
  }

  const resultContext = { response: parsed, status: response.status, headers: response.headers, input: validated };
  const result = request.result === undefined
    ? { data: parsed }
    : renderTemplate(request.result, resultContext);

  if(operation.enforceOutputSchema) {
    try { assertOutputSchema(result, operation.outputSchema!); }
    catch { throw {ok:false,code:"CONNECTOR_RESPONSE_INVALID",message:"Connector response does not match its declared schema."}; }
  }
  return {
    connector: manifest.key,
    action: operationKey,
    source: "provider",
    ...(isRecord(result) ? result : { data: result }),
  };
}

function buildURL(http: DeclarativeHttp, request: DeclarativeRequest, input: Record<string, unknown>): URL {
  // The base URL is rendered because a provider whose host carries the tenant —
  // self-managed GitLab, a per-site Confluence — cannot state it statically. The
  // placeholder holds a bare hostname and the manifest fixes the scheme, so the
  // rendered allowlist entry and url.hostname compare directly and no stored
  // value can downgrade the request to http. Only a declared, required setup
  // field may appear here; assertTemplatedHostsAreDeclared enforces that at
  // compile time, which is what keeps the host out of the caller's reach.
  const rendered = renderTemplate(request.baseUrl ?? http.baseUrl ?? "", input);
  const baseUrl = typeof rendered === "string" ? rendered : "";
  if (baseUrl === "") {
    throw new Error("baseUrl is required");
  }
  const path = renderPath(request.path ?? "", input);
  const url = new URL(`${trimTrailingSlash(baseUrl)}${path}`);

  appendQuery(url, http.query, input);
  appendQuery(url, request.query, input);

  if (http.auth?.in === "query" && http.auth.name) {
    const value = renderTemplate(http.auth.value ?? `{{${http.auth.field}}}`, input);
    if (value !== undefined) {
      url.searchParams.set(http.auth.name, String(value));
    }
  }

  return url;
}

function appendQuery(url: URL, template: Record<string, unknown> | undefined, input: Record<string, unknown>): void {
  if (!template) {
    return;
  }
  const rendered = renderTemplate(template, input);
  if (!isRecord(rendered)) {
    return;
  }
  for (const [key, value] of Object.entries(rendered)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, String(item));
      }
      continue;
    }
    url.searchParams.set(key, typeof value === "object" ? JSON.stringify(value) : String(value));
  }
}

function buildHeaders(http: DeclarativeHttp, request: DeclarativeRequest, input: Record<string, unknown>): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const template of [http.headers, request.headers]) {
    const rendered = renderTemplate(template ?? {}, input);
    if (!isRecord(rendered)) {
      continue;
    }
    for (const [key, value] of Object.entries(rendered)) {
      headers[key] = typeof value === "object" ? JSON.stringify(value) : String(value);
    }
  }

  const auth = http.auth;
  if (auth && (auth.in ?? "header") === "header" && auth.name) {
    const value = renderTemplate(auth.value ?? `{{${auth.field}}}`, input);
    if (value !== undefined) {
      headers[auth.name] = String(value);
    }
  }

  return headers;
}

function buildBody(request: DeclarativeRequest, input: Record<string, unknown>): string | undefined {
  if (request.body === undefined) {
    return undefined;
  }
  const rendered = renderTemplate(request.body, input);
  return rendered === undefined ? undefined : JSON.stringify(rendered);
}

function upstreamFailure(
  manifest: DeclarativeManifest,
  http: DeclarativeHttp,
  operationKey: string,
  response: { status: number; headers: Record<string, string> },
  parsed: unknown,
  input: Record<string, unknown>,
): Record<string, unknown> {
  const errors = http.errors ?? {};
  const providerName = manifest.name ?? manifest.key;

  if (isRateLimited(response.status, parsed, errors)) {
    return {
      ok: false,
      code: "CONNECTOR_RATE_LIMITED",
      message: `${providerName} rate limit exceeded.`,
      retryAfterSeconds: parseRetryAfter(response.headers, parsed, errors),
    };
  }

  const detail = extractMessage(parsed, errors.messagePaths ?? defaultMessagePaths);
  return {
    ok: false,
    code: "CONNECTOR_UPSTREAM_ERROR",
    message: detail === undefined
      ? `${providerName} rejected the ${operationKey} request.`
      : redactCredentialDetail(detail, manifest, http, input),
  };
}

// Preserve provider diagnostics, removing only known credential values and the
// URL encodings a provider may reflect. Derived auth values are already stored
// in the injected bundle; never recompute or coerce arbitrary input objects.
function redactCredentialDetail(detail: string, manifest: DeclarativeManifest, http: DeclarativeHttp, input: Record<string, unknown>): string {
  const setup = manifest.auth?.setup;
  const fields = [
    ...(setup?.fields ?? []),
    ...(setup?.routes ?? []).flatMap(route => route.fields ?? []),
  ];
  const keys = fields.filter(field => isRecord(field) && field.secret === true).map(field => field.key);
  if (http.auth?.field) keys.push(http.auth.field);
  if (isRecord(setup) && Array.isArray(setup.derive)) {
    for (const derived of setup.derive) {
      if (isRecord(derived) && typeof derived.field === "string") keys.push(derived.field);
    }
  }
  const variants = new Set<string>();
  for (const key of keys) {
    const value = input[key];
    if (typeof value !== "string" || value.length === 0) continue;
    variants.add(value);
    // URLSearchParams replaces malformed Unicode safely; encodeURIComponent
    // throws on lone surrogates, so retain raw and form variants in that case.
    variants.add(new URLSearchParams({ v: value }).toString().slice(2));
    try { variants.add(encodeURIComponent(value)); } catch { /* Raw value remains protected. */ }
  }
  const encodedVariants = [...variants].flatMap(value => [value, value.replace(/%[0-9A-F]{2}/g, part => part.toLowerCase())]);
  return [...new Set(encodedVariants)].sort((a, b) => b.length - a.length)
    .reduce((message, value) => message.replaceAll(value, "[REDACTED]"), detail);
}

// hasBodyError reports whether any nominated path carries a provider error.
// Emptiness is the test: an empty array, empty string, empty object, `false`,
// `null` and a missing path all mean "no error", because providers signal
// success that way — Figma answers `{"error": false}` and a healthy GraphQL
// call can carry `"errors": []`.
function hasBodyError(parsed: unknown, paths: string[] | undefined): boolean {
  if (!paths || paths.length === 0 || !isRecord(parsed)) {
    return false;
  }
  for (const path of paths) {
    const value = resolvePath(path, parsed);
    if (value === undefined || value === null) {
      continue;
    }
    if (Array.isArray(value)) {
      if (value.length > 0) return true;
      continue;
    }
    if (typeof value === "string") {
      if (value.trim().length > 0) return true;
      continue;
    }
    if (typeof value === "boolean") {
      if (value) return true;
      continue;
    }
    if (isRecord(value)) {
      if (Object.keys(value).length > 0) return true;
      continue;
    }
    return true;
  }
  return false;
}

// isRateLimited prefers the status, then falls back to a provider code carried
// in the body. Linear sends HTTP 400 for a throttle, so without the body check
// a rate limit would be reported as a client error the caller must not retry.
function isRateLimited(status: number, parsed: unknown, errors: DeclarativeErrors): boolean {
  if ((errors.rateLimitStatuses ?? defaultRateLimitStatuses).includes(status)) {
    return true;
  }
  const paths = errors.rateLimitCodePaths;
  const codes = errors.rateLimitCodes;
  if (!paths || !codes || !isRecord(parsed)) {
    return false;
  }
  return paths.some((path) => {
    const value = resolvePath(path, parsed);
    const code = typeof value === "string"
      ? value
      : typeof value === "number" && Number.isFinite(value) ? String(value) : undefined;
    return code !== undefined && codes.includes(code);
  });
}

function parseRetryAfter(
  headers: Record<string, string>,
  body: unknown,
  errors: DeclarativeErrors,
): number {
  const fallback = errors.defaultRetryAfterSeconds ?? defaultRetryAfterSeconds;

  // Body first: a provider that puts the delay in the body usually sends no
  // header at all, so checking the header first would always miss it.
  if (isRecord(body)) {
    for (const path of errors.retryAfterPaths ?? []) {
      const seconds = Number(resolvePath(path, body));
      if (Number.isFinite(seconds) && seconds > 0 && seconds <= maxRetryAfterSeconds) {
        return Math.ceil(seconds);
      }
    }
  }

  const headerName = (errors.retryAfterHeader ?? "retry-after").toLowerCase();
  const parsed = Number(headers[headerName]);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  if (errors.retryAfterKind !== "unix") {
    return parsed;
  }

  // An absolute reset time already past, or implausibly far out, means the
  // clocks disagree or the header is not what the manifest claims. Waiting the
  // declared default is the safe reading either way.
  const seconds = Math.ceil(parsed - Date.now() / 1000);
  return seconds > 0 && seconds <= maxRetryAfterSeconds ? seconds : fallback;
}

function extractMessage(parsed: unknown, paths: string[]): string | undefined {
  if (typeof parsed === "string") {
    const trimmed = parsed.trim();
    return trimmed.length > 0 && trimmed.length <= 400 && !trimmed.startsWith("<") ? trimmed : undefined;
  }
  if (!isRecord(parsed)) {
    return undefined;
  }
  for (const path of paths) {
    const value = resolvePath(path, parsed);
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return undefined;
}

function parseBody(raw: string): unknown {
  if (raw.length === 0) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function hasCredential(input: unknown, credentialField: string | undefined): boolean {
  if (!credentialField) {
    // A connector with no declared credential (auth.type "none") always runs
    // live; there is nothing to withhold.
    return true;
  }
  return isRecord(input) && typeof input[credentialField] === "string" && input[credentialField].length > 0;
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}
