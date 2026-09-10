// OpenAPI -> declarative connector manifest.
//
// The declarative runtime made a connector a data file; this makes the data
// file derivable. Point it at a provider's OpenAPI document, name the tags that
// matter, and it emits a manifest whose operations already carry the tool
// schema the MCP gateway needs and the request template the runner executes.
//
// Generation is deliberately curated, not exhaustive: a spec with 400 endpoints
// produces 400 mediocre agent tools, so `includeTags`, `includePaths`, and
// `operationKeys` exist to select and name the operations a caller actually
// wants. The output is a starting point to review and commit, never something
// generated at runtime.

export type AuthOption = {
  // type is the provider's real auth model, recorded on the manifest so the
  // connect flow collects a usable credential.
  type: "oauth2" | "api_key" | "bearer" | "none";
  field: string;
  in?: "header" | "query";
  name?: string;
  value?: string;
  label?: string;
  scopes?: string[];
};

export type GenerateOptions = {
  key: string;
  name: string;
  categories?: string[];
  models?: string[];
  auth: AuthOption;
  version?: string;
  includeTags?: string[];
  includePaths?: string[];
  operationKeys?: Record<string, string>;
  timeoutMs?: number;
  maxInputBytes?: number;
  maxResponseBytes?: number;
  headers?: Record<string, string>;
};

type JSONObject = Record<string, any>;

type OpenAPIErrorCode = "OPENAPI_AMBIGUOUS_PARAMETER";

class OpenAPIError extends Error {
  readonly code: OpenAPIErrorCode;

  constructor(code: OpenAPIErrorCode, message: string) {
    super(message);
    this.name = "OpenAPIError";
    this.code = code;
  }
}

const methodVerbs: Record<string, string> = {
  post: "create",
  put: "update",
  patch: "update",
  delete: "delete",
};

export function generateManifest(spec: JSONObject, options: GenerateOptions): JSONObject {
  const baseUrl = firstServerURL(spec);
  const operations: JSONObject = {};
  const taken = new Set<string>();

  for (const [path, pathItem] of Object.entries(spec.paths ?? {})) {
    if (!isRecord(pathItem)) {
      continue;
    }
    if (options.includePaths && !options.includePaths.some((prefix) => path.startsWith(prefix))) {
      continue;
    }
    for (const [method, rawOperation] of Object.entries(pathItem)) {
      if (!isHttpMethod(method) || !isRecord(rawOperation)) {
        continue;
      }
      const operation = rawOperation as JSONObject;
      if (options.includeTags && !tagsOf(operation).some((tag) => options.includeTags!.includes(tag))) {
        continue;
      }
      const success = successStatuses(operation);
      if (success.length === 0) {
        continue;
      }

      const key = uniqueKey(operationKey(spec, options, path, method, operation), path, taken);
      operations[key] = buildOperation(spec, options, path, method, pathItem, operation, success);
    }
  }

  return {
    key: options.key,
    name: options.name,
    version: options.version ?? "0.1.0",
    runtime: "bun",
    visibility: "public",
    ...(options.categories ? { categories: options.categories } : {}),
    auth: buildAuth(options.auth),
    network: { allowedHosts: [new URL(baseUrl).hostname] },
    http: {
      baseUrl,
      ...(options.auth.type === "none" ? {} : { auth: buildHttpAuth(options.auth) }),
      headers: { "Content-Type": "application/json", ...(options.headers ?? {}) },
      errors: {
        rateLimitStatuses: [429],
        retryAfterHeader: "retry-after",
        defaultRetryAfterSeconds: 10,
        messagePaths: ["error.message", "message", "detail", "errors.0.message"],
      },
    },
    operations,
    models: options.models ?? ["record"],
  };
}

function buildOperation(
  spec: JSONObject,
  options: GenerateOptions,
  path: string,
  method: string,
  pathItem: JSONObject,
  operation: JSONObject,
  success: number[],
): JSONObject {
  const parametersByIdentity = new Map<string, JSONObject>();
  for (const rawParameter of [
    ...(Array.isArray(pathItem.parameters) ? pathItem.parameters : []),
    ...(Array.isArray(operation.parameters) ? operation.parameters : []),
  ]) {
    const parameter = resolveRef(spec, rawParameter);
    if (isRecord(parameter)) {
      parametersByIdentity.set(parameterIdentity(parameter), parameter);
    }
  }
  const parameters = [...parametersByIdentity.values()];
  const properties: JSONObject = {};
  const required: string[] = [];
  const parameterLocationsByInputName = new Map<string, string>();

  const query: JSONObject = {};
  const headers: JSONObject = {};

  for (const parameter of parameters) {
    const name = generatedParameterName(parameter);
    if (name.length === 0 || parameter.in === "cookie") {
      continue;
    }

    const location = parameterLocation(parameter);
    const previousLocation = parameterLocationsByInputName.get(name);
    if (previousLocation !== undefined && previousLocation !== location) {
      throw new OpenAPIError(
        "OPENAPI_AMBIGUOUS_PARAMETER",
        `OpenAPI parameter ${JSON.stringify(name)} has conflicting ${displayParameterLocation(previousLocation)} and ${displayParameterLocation(location)} locations.`,
      );
    }
    parameterLocationsByInputName.set(name, location);

    properties[name] = describeSchema(spec, parameterSchema(spec, parameter), parameter.description);
    if (parameter.required || parameter.in === "path") {
      required.push(name);
    }
    if (parameter.in === "query") {
      query[name] = `{{${name}}}`;
    }
    if (parameter.in === "header") {
      headers[name] = `{{${name}}}`;
    }
  }

  const body = buildBody(spec, operation, properties, required);

  const responseSchema = successResponseSchema(spec, operation);

  return {
    kind: "action",
    timeoutMs: options.timeoutMs ?? 15000,
    maxInputBytes: options.maxInputBytes ?? 65536,
    maxResponseBytes: options.maxResponseBytes ?? 1048576,
    sideEffect: method === "get" || method === "head" ? "read" : "write",
    title: title(operation, method, path),
    description: description(operation, method, path),
    inputSchema: {
      type: "object",
      properties,
      ...(required.length > 0 ? { required: dedupe(required) } : {}),
    },
    outputSchema: {
      type: "object",
      properties: { data: responseSchema ?? { type: "object" } },
    },
    request: {
      method: method.toUpperCase(),
      path: templatePath(path),
      ...(Object.keys(query).length > 0 ? { query } : {}),
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
      ...(body ? { body } : {}),
      success,
    },
  };
}

function parameterSchema(spec: JSONObject, parameter: JSONObject): unknown {
  if (!isRecord(parameter.content)) {
    return parameter.schema;
  }
  const mediaTypes = Object.values(parameter.content);
  if (mediaTypes.length !== 1) {
    return undefined;
  }
  const mediaType = resolveRef(spec, mediaTypes[0]);
  return isRecord(mediaType) ? mediaType.schema : undefined;
}

function generatedParameterName(parameter: JSONObject): string {
  const name = String(parameter.name ?? "");
  return parameter.in === "header" ? name.toLowerCase() : name;
}

function parameterIdentity(parameter: JSONObject): string {
  return JSON.stringify([generatedParameterName(parameter), parameter.in]);
}

function parameterLocation(parameter: JSONObject): string {
  return typeof parameter.in === "string" ? parameter.in : "unknown";
}

function displayParameterLocation(location: string): string {
  return ["path", "query", "header", "cookie"].includes(location) ? location : "other";
}

function buildBody(spec: JSONObject, operation: JSONObject, properties: JSONObject, required: string[]): JSONObject | undefined {
  const requestBody = resolveRef(spec, operation.requestBody);
  if (!isRecord(requestBody)) {
    return undefined;
  }
  const schema = resolveSchema(spec, requestBody.content?.["application/json"]?.schema);
  if (!isRecord(schema) || !isRecord(schema.properties)) {
    return undefined;
  }

  const body: JSONObject = {};
  for (const [name, rawProperty] of Object.entries(schema.properties)) {
    properties[name] = describeSchema(spec, rawProperty, undefined);
    body[name] = `{{${name}}}`;
  }
  if (Array.isArray(schema.required)) {
    for (const name of schema.required) {
      if (typeof name === "string") {
        required.push(name);
      }
    }
  }
  return Object.keys(body).length > 0 ? body : undefined;
}

// describeSchema flattens a parameter or property schema into the small JSON
// Schema subset the runner validates, keeping `type`, `enum`, `items`, and a
// description. Anything richer is dropped rather than half-enforced.
function describeSchema(spec: JSONObject, rawSchema: unknown, fallbackDescription: string | undefined): JSONObject {
  const schema = resolveSchema(spec, rawSchema);
  const described: JSONObject = {};
  if (isRecord(schema)) {
    if (schema.type !== undefined) {
      described.type = schema.type;
    }
    if (Array.isArray(schema.enum)) {
      described.enum = schema.enum;
    }
    if (isRecord(schema.items)) {
      described.items = describeSchema(spec, schema.items, undefined);
    }
    if (isRecord(schema.properties)) {
      described.type = described.type ?? "object";
    }
  }
  const text = fallbackDescription ?? (isRecord(schema) ? schema.description : undefined);
  if (typeof text === "string" && text.trim().length > 0) {
    described.description = text.trim();
  }
  if (described.type === undefined) {
    described.type = "string";
  }
  return described;
}

function operationKey(spec: JSONObject, options: GenerateOptions, path: string, method: string, operation: JSONObject): string {
  const operationId = typeof operation.operationId === "string" ? operation.operationId : "";
  const override = options.operationKeys?.[operationId];
  if (override) {
    return override;
  }

  const resource = slug(tagsOf(operation)[0] ?? lastStaticSegment(path) ?? options.key);
  const verb = methodVerbs[method] ?? (method === "get" ? (endsWithParameter(path) ? "get" : "list") : method);
  return `${resource}.${verb}`;
}

function uniqueKey(key: string, path: string, taken: Set<string>): string {
  if (!taken.has(key)) {
    taken.add(key);
    return key;
  }
  const suffix = slug(lastStaticSegment(path) ?? "alt");
  let candidate = `${key}-${suffix}`;
  let counter = 2;
  while (taken.has(candidate)) {
    candidate = `${key}-${suffix}-${counter}`;
    counter += 1;
  }
  taken.add(candidate);
  return candidate;
}

function buildAuth(auth: AuthOption): JSONObject {
  if (auth.type === "none") {
    return { type: "none", scopes: [] };
  }
  return {
    type: auth.type,
    scopes: auth.scopes ?? [],
    setup: {
      mode: auth.type === "oauth2" ? "oauth2" : "api_key",
      fields: [{ key: auth.field, label: auth.label ?? auth.field, required: true, secret: true }],
    },
  };
}

function buildHttpAuth(auth: AuthOption): JSONObject {
  return {
    field: auth.field,
    in: auth.in ?? "header",
    name: auth.name ?? "Authorization",
    value: auth.value ?? `Bearer {{${auth.field}}}`,
  };
}

function firstServerURL(spec: JSONObject): string {
  const url = spec.servers?.[0]?.url;
  if (typeof url !== "string" || url.length === 0) {
    throw new Error("spec declares no server URL; pass one explicitly");
  }
  const absolute = url.startsWith("http") ? url : `https://${url}`;
  return absolute.endsWith("/") ? absolute.slice(0, -1) : absolute;
}

function successStatuses(operation: JSONObject): number[] {
  return Object.keys(operation.responses ?? {})
    .map((status) => Number(status))
    .filter((status) => Number.isInteger(status) && status >= 200 && status < 300)
    .sort((left, right) => left - right);
}

function successResponseSchema(spec: JSONObject, operation: JSONObject): JSONObject | undefined {
  for (const [status, rawResponse] of Object.entries(operation.responses ?? {})) {
    const code = Number(status);
    if (!Number.isInteger(code) || code < 200 || code >= 300) {
      continue;
    }
    const response = resolveRef(spec, rawResponse);
    const schema = resolveSchema(spec, isRecord(response) ? response.content?.["application/json"]?.schema : undefined);
    if (isRecord(schema)) {
      return schema;
    }
  }
  return undefined;
}

// resolveSchema follows $ref chains, guarding against the self-referencing
// schemas real specs contain: a visited set stops the walk and the reference is
// flattened to a plain object rather than recursing forever.
function resolveSchema(spec: JSONObject, schema: unknown, seen: Set<string> = new Set()): unknown {
  if (!isRecord(schema)) {
    return schema;
  }
  if (typeof schema.$ref === "string") {
    if (seen.has(schema.$ref)) {
      return { type: "object" };
    }
    seen.add(schema.$ref);
    return resolveSchema(spec, derefPointer(spec, schema.$ref), seen);
  }
  if (Array.isArray(schema.allOf)) {
    const merged: JSONObject = { type: "object", properties: {}, required: [] };
    for (const part of schema.allOf) {
      const resolved = resolveSchema(spec, part, seen);
      if (!isRecord(resolved)) {
        continue;
      }
      Object.assign(merged.properties, isRecord(resolved.properties) ? resolved.properties : {});
      if (Array.isArray(resolved.required)) {
        merged.required.push(...resolved.required);
      }
    }
    if (merged.required.length === 0) {
      delete merged.required;
    }
    return merged;
  }
  return schema;
}

function resolveRef(spec: JSONObject, value: unknown): unknown {
  if (isRecord(value) && typeof value.$ref === "string") {
    return derefPointer(spec, value.$ref);
  }
  return value;
}

function derefPointer(spec: JSONObject, pointer: string): unknown {
  if (!pointer.startsWith("#/")) {
    return undefined;
  }
  let current: unknown = spec;
  for (const segment of pointer.slice(2).split("/")) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[segment.replace(/~1/g, "/").replace(/~0/g, "~")];
  }
  return current;
}

function templatePath(path: string): string {
  return path.replace(/\{([^}]+)\}/g, (_match, name: string) => `{{${name}}}`);
}

function title(operation: JSONObject, method: string, path: string): string {
  const summary = typeof operation.summary === "string" ? operation.summary.trim() : "";
  return summary.length > 0 ? summary : `${method.toUpperCase()} ${path}`;
}

function description(operation: JSONObject, method: string, path: string): string {
  const parts = [operation.summary, operation.description]
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .map((part) => part.trim());
  const text = dedupe(parts).join(" ");
  return text.length > 0 ? text : `Call ${method.toUpperCase()} ${path}.`;
}

function tagsOf(operation: JSONObject): string[] {
  return Array.isArray(operation.tags) ? operation.tags.filter((tag): tag is string => typeof tag === "string") : [];
}

function endsWithParameter(path: string): boolean {
  return /\{[^}]+\}$/.test(path);
}

function lastStaticSegment(path: string): string | undefined {
  const segments = path.split("/").filter((segment) => segment.length > 0 && !segment.startsWith("{"));
  return segments[segments.length - 1];
}

function slug(value: string): string {
  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function dedupe<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function isHttpMethod(value: string): boolean {
  return ["get", "put", "post", "delete", "patch", "head"].includes(value.toLowerCase());
}

function isRecord(value: unknown): value is JSONObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
