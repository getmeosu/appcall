import { createResendClient, encodeResendPathIdentifier, isRecord, parseResendRateLimit } from "./http";
import operationSpecs from "./advanced_ops.json";
import manifest from "../manifest.json";

type JsonSchema = {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: JsonSchema;
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
};

type OperationSpec = {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  pathParams: string[];
  queryParams: string[];
  bodyFields: string[];
  bodyArrayField?: string;
  requiredAnyOf?: string[][];
  requireNonEmptyBody?: boolean;
  paginationMode?: "all_contacts";
  timeoutMs?: number;
};

const specs = operationSpecs as Record<string, OperationSpec>;
const operationManifests = manifest.operations as Record<string, { inputSchema: JsonSchema }>;

export async function executeResendOperation(
  operation: string,
  input: unknown,
): Promise<Record<string, unknown>> {
  const spec = specs[operation];
  const operationManifest = operationManifests[operation];
  if (!spec || !operationManifest) throw new Error(`Unknown Resend operation: ${operation}`);

  const { parameters, apiKey, fetchFn } = validateInput(input, operation, spec, operationManifest.inputSchema);
  if (!apiKey) {
    return {
      connector: "resend",
      action: operation,
      source: "connector",
      validated: parameters,
    };
  }

  if (spec.paginationMode === "all_contacts") {
    return listAllContacts(operation, parameters, apiKey, fetchFn);
  }
  return callProvider(operation, spec, parameters, apiKey, fetchFn).then((result) => {
    assertProviderSuccess(operation, result.status, result.headers);
    return providerOutput(operation, result.body);
  });
}

export const resendAdvancedActions: Record<
  string,
  (input: unknown) => Record<string, unknown> | Promise<Record<string, unknown>>
> = Object.fromEntries(
  Object.keys(specs).map((operation) => [
    operation,
    (input: unknown) => executeResendOperation(operation, input),
  ]),
);

function validateInput(
  input: unknown,
  operation: string,
  spec: OperationSpec,
  schema: JsonSchema,
): { parameters: Record<string, unknown>; apiKey?: string; fetchFn?: typeof fetch } {
  if (!isRecord(input)) throw new Error("input must be an object");
  const parameters = { ...input };
  const rawApiKey = parameters.apiKey;
  const rawFetch = parameters.fetch;
  delete parameters.apiKey;
  delete parameters.fetch;

  validateSchemaValue(parameters, schema, "input");
  validateOperationSpecificInput(operation, parameters);
  for (const requiredGroup of spec.requiredAnyOf ?? []) {
    if (!requiredGroup.some((field) => parameters[field] !== undefined)) {
      throw new Error(`at least one of ${requiredGroup.join(", ")} is required`);
    }
  }
  const hasBodyFields = spec.bodyFields.some((field) => parameters[field] !== undefined);
  const hasBodyArray = spec.bodyArrayField !== undefined && parameters[spec.bodyArrayField] !== undefined;
  if (spec.requireNonEmptyBody && !hasBodyFields && !hasBodyArray) {
    throw new Error("at least one update field is required");
  }
  if (parameters.after !== undefined && parameters.before !== undefined) {
    throw new Error("after and before cannot both be set");
  }
  if (rawApiKey !== undefined && (typeof rawApiKey !== "string" || rawApiKey.length === 0)) {
    throw new Error("apiKey must be a non-empty string");
  }

  return {
    parameters,
    apiKey: typeof rawApiKey === "string" ? rawApiKey : undefined,
    fetchFn: typeof rawFetch === "function" ? (rawFetch as typeof fetch) : undefined,
  };
}

function validateOperationSpecificInput(operation: string, parameters: Record<string, unknown>): void {
  if (operation === "contacts.delete" || operation === "contacts.retrieve") {
    if (parameters.id !== undefined && parameters.email !== undefined) {
      throw new Error("provide either id or email, not both");
    }
  }

  if (operation === "contacts.list_all") {
    if (parameters.segmentId !== undefined && parameters.audienceId !== undefined) {
      throw new Error("provide either segmentId or audienceId, not both");
    }
    if (typeof parameters.segmentId === "string") encodeResendPathIdentifier(parameters.segmentId, "segmentId");
    if (typeof parameters.audienceId === "string") encodeResendPathIdentifier(parameters.audienceId, "audienceId");
  }

  if (operation === "contact_properties.create" && parameters.fallbackValue !== undefined) {
    const value = parameters.fallbackValue;
    const propertyType = parameters.type;
    if ((propertyType === "string" && typeof value !== "string")
      || (propertyType === "number" && (typeof value !== "number" || !Number.isFinite(value)))) {
      throw new Error("fallbackValue must match the contact property type");
    }
  }

  if (operation === "templates.create" || operation === "templates.update") {
    const variables = parameters.variables;
    if (!Array.isArray(variables)) return;
    const reserved = new Set([
      "FIRST_NAME",
      "LAST_NAME",
      "EMAIL",
      "RESEND_UNSUBSCRIBE_URL",
      "contact",
      "this",
    ]);
    variables.forEach((variable, index) => {
      if (!isRecord(variable)) return;
      if (typeof variable.key === "string" && reserved.has(variable.key)) {
        throw new Error("variables[" + index + "].key uses a reserved template variable name");
      }
      const fallbackValue = variable.fallbackValue;
      if (fallbackValue === undefined) return;
      const fallbackMatchesType = variable.type === "string"
        ? typeof fallbackValue === "string"
        : variable.type === "number"
          && typeof fallbackValue === "number"
          && Number.isFinite(fallbackValue);
      if (!fallbackMatchesType) {
        throw new Error("variables[" + index + "].fallbackValue must match the variable type");
      }
    });
  }
}

function validateSchemaValue(value: unknown, schema: JsonSchema, path: string): void {
  if (schema.type) {
    const allowed = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!allowed.some((type) => isJsonType(value, type))) {
      throw new Error(`${path} must be ${allowed.join(" or ")}`);
    }
  }
  if (schema.enum && !schema.enum.some((candidate) => Object.is(candidate, value))) {
    throw new Error(`${path} must be one of ${schema.enum.join(", ")}`);
  }
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) throw new Error(`${path} must be at least ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) throw new Error(`${path} must be at most ${schema.maximum}`);
  }
  if (typeof value === "string" && schema.maxLength !== undefined && value.length > schema.maxLength) {
    throw new Error(`${path} must contain at most ${schema.maxLength} characters`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) throw new Error(`${path} must contain at least ${schema.minItems} items`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) throw new Error(`${path} must contain at most ${schema.maxItems} items`);
    if (schema.items) value.forEach((item, index) => validateSchemaValue(item, schema.items!, `${path}[${index}]`));
  }
  if (isRecord(value)) {
    for (const field of schema.required ?? []) {
      if (value[field] === undefined || value[field] === null) throw new Error(`${field} is required`);
    }
    const properties = schema.properties ?? {};
    for (const [field, child] of Object.entries(value)) {
      const childSchema = properties[field];
      if (!childSchema) {
        if (schema.additionalProperties === false) throw new Error(`${path}.${field} is not allowed`);
        continue;
      }
      validateSchemaValue(child, childSchema, `${path}.${field}`);
    }
  }
}

function isJsonType(value: unknown, type: string): boolean {
  switch (type) {
    case "object": return isRecord(value);
    case "array": return Array.isArray(value);
    case "string": return typeof value === "string";
    case "number": return typeof value === "number" && Number.isFinite(value);
    case "integer": return typeof value === "number" && Number.isInteger(value);
    case "boolean": return typeof value === "boolean";
    case "null": return value === null;
    default: return true;
  }
}

async function callProvider(
  operation: string,
  spec: OperationSpec,
  parameters: Record<string, unknown>,
  apiKey: string,
  fetchFn?: typeof fetch,
  overrides: { after?: string; limit?: number } = {},
): Promise<{ status: number; headers: Record<string, string>; body: unknown }> {
  const pathParameters = { ...parameters };
  if (operation === "contacts.delete" || operation === "contacts.retrieve") {
    pathParameters.contactId = parameters.id ?? parameters.email;
  }
  let pathTemplate = spec.path;
  if (operation === "contacts.list_all") {
    const segmentId = parameters.segmentId ?? parameters.audienceId;
    if (typeof segmentId === "string") {
      pathTemplate = "/segments/{segmentId}/contacts";
      pathParameters.segmentId = segmentId;
    }
  }
  const path = pathTemplate.replace(/\{([^}]+)\}/g, (_match, field: string) => {
    const value = pathParameters[field];
    if (typeof value !== "string") throw new Error(`${field} is required`);
    return encodeResendPathIdentifier(value, field);
  });
  const query = new URLSearchParams();
  for (const field of spec.queryParams) {
    const value = overrides[field as "after" | "limit"] ?? parameters[field];
    if (value !== undefined && value !== null) query.set(field, String(value));
  }
  const queryString = query.toString();
  const body = createBody(operation, spec, parameters);
  const client = createResendClient({ apiKey, fetch: fetchFn, operation });
  const headers: Record<string, string> = {};
  if (typeof parameters.idempotencyKey === "string" && parameters.idempotencyKey.length > 0) {
    headers["Idempotency-Key"] = parameters.idempotencyKey;
  }
  return client.fetchJSON(`${path}${queryString ? `?${queryString}` : ""}`, {
    method: spec.method,
    ...(Object.keys(headers).length > 0 ? { headers } : {}),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function createBody(
  operation: string,
  spec: OperationSpec,
  parameters: Record<string, unknown>,
): unknown {
  if (spec.bodyArrayField) {
    const value = parameters[spec.bodyArrayField];
    if (operation === "emails.batch.send" && Array.isArray(value)) {
      return value.map((entry) => isRecord(entry) ? toProviderFields(entry) : entry);
    }
    return value;
  }
  const body: Record<string, unknown> = {};
  for (const field of spec.bodyFields) {
    if (parameters[field] === undefined) continue;
    let value = parameters[field];
    if (field === "replyTo" && typeof value === "string") {
      value = [value];
    } else if (field === "variables" && Array.isArray(value)) {
      value = value.map((entry) => isRecord(entry) ? toProviderFields(entry) : entry);
    }
    body[toSnakeCase(field)] = value;
  }
  if (spec.requireNonEmptyBody && Object.keys(body).length === 0) {
    throw new Error("at least one update field is required");
  }
  return Object.keys(body).length > 0 ? body : undefined;
}

function toProviderFields(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [toSnakeCase(key), child]));
}

function toSnakeCase(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

async function listAllContacts(
  operation: string,
  parameters: Record<string, unknown>,
  apiKey: string,
  fetchFn?: typeof fetch,
): Promise<Record<string, unknown>> {
  const records: unknown[] = [];
  let after = typeof parameters.after === "string" ? parameters.after : undefined;
  const before = parameters.before;
  const limit = typeof parameters.limit === "number" ? parameters.limit : 100;
  let hasMore = false;
  let lastBody: Record<string, unknown> = {};
  let previousCursor: string | undefined;

  for (let page = 0; page < 10; page += 1) {
    const result = await callProvider(operation, specs[operation], parameters, apiKey, fetchFn, {
      limit,
      ...(after ? { after } : {}),
    });
    assertProviderSuccess(operation, result.status, result.headers);
    if (!isRecord(result.body) || !Array.isArray(result.body.data)) {
      return providerOutput(operation, result.body);
    }
    lastBody = result.body;
    records.push(...result.body.data);
    hasMore = result.body.has_more === true;
    if (!hasMore || before !== undefined || page === 9) break;

    const last = result.body.data[result.body.data.length - 1];
    const next = isRecord(last) && typeof last.id === "string" ? last.id : undefined;
    if (!next || next === previousCursor) break;
    previousCursor = next;
    after = next;
  }

  return providerOutput(operation, { ...lastBody, data: records, has_more: hasMore });
}

function assertProviderSuccess(operation: string, status: number, headers: Record<string, string>): void {
  if (status >= 200 && status < 300) return;
  const rateLimit = parseResendRateLimit(status, headers);
  if (rateLimit.limited) {
    throw {
      ok: false,
      code: "CONNECTOR_RATE_LIMITED",
      message: "Resend rate limit exceeded.",
      retryAfterSeconds: rateLimit.retryAfterSeconds,
    };
  }
  throw {
    ok: false,
    code: "CONNECTOR_UPSTREAM_ERROR",
    message: `Resend rejected the ${operation} request.`,
  };
}

function providerOutput(operation: string, body: unknown): Record<string, unknown> {
  return {
    connector: "resend",
    action: operation,
    source: "provider",
    data: body === "" ? null : body,
  };
}
