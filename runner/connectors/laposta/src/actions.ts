import { createConnectorHttpClient } from "../../../bun/src/http";
import manifest from "../manifest.json";

type FetchFn = typeof fetch;

const credentialKeys = new Set(["apiKey", "fetch"]);

const memberCreateFields = ["list_id", "ip", "email", "source_url", "custom_fields", "options", "user_agent"] as const;
const memberUpdateFields = ["list_id", "email", "state", "custom_fields"] as const;
const fieldCreateFields = [
  "list_id",
  "name",
  "defaultvalue",
  "datatype",
  "datatype_display",
  "options",
  "required",
  "in_form",
  "in_list",
] as const;

type FormPostConfig = {
  action: string;
  path: string;
  pathParams: string[];
  required: string[];
  fields: readonly string[];
  allowed: Set<string>;
};

function config(
  action: string,
  path: string,
  pathParams: string[],
  required: string[],
  fields: readonly string[],
): FormPostConfig {
  return {
    action,
    path,
    pathParams,
    required,
    fields,
    allowed: new Set([...fields, ...pathParams, ...credentialKeys]),
  };
}

const configs: Record<string, FormPostConfig> = {
  "members.create": config("members.create", "/v2/member", [], ["list_id", "ip", "email"], memberCreateFields),
  "members.update": config(
    "members.update",
    "/v2/member/{{member_id}}",
    ["member_id"],
    ["list_id", "member_id"],
    memberUpdateFields,
  ),
  "fields.create": config(
    "fields.create",
    "/v2/field",
    [],
    ["list_id", "name", "datatype", "required", "in_form", "in_list"],
    fieldCreateFields,
  ),
};

export function createMember(input: unknown): unknown {
  return formPost(configs["members.create"]!, input);
}

export function updateMember(input: unknown): unknown {
  return formPost(configs["members.update"]!, input);
}

export function createField(input: unknown): unknown {
  return formPost(configs["fields.create"]!, input);
}

export const handwritten: Record<string, (input: unknown) => unknown> = {
  "members.create": createMember,
  "members.update": updateMember,
  "fields.create": createField,
};

function formPost(spec: FormPostConfig, inputValue: unknown): unknown {
  if (!isRecord(inputValue)) return invalidInput();
  const apiKey = inputValue.apiKey;
  if (typeof apiKey !== "string" || apiKey.length === 0) {
    validate(spec, inputValue);
    return {
      connector: "laposta",
      action: spec.action,
      source: "connector",
      validated: stripCredentials(inputValue),
    };
  }

  let record: Record<string, unknown>;
  try {
    record = validate(spec, inputValue);
  } catch (error) {
    return Promise.reject({
      ok: false,
      code: "INVALID_ACTION_INPUT",
      message: error instanceof Error ? error.message : "Action input is invalid.",
    });
  }

  const operation = (manifest.operations as Record<string, { maxResponseBytes?: number; timeoutMs?: number }>)[spec.action];
  const client = createConnectorHttpClient({
    allowedHosts: (manifest.network as { allowedHosts: string[] }).allowedHosts,
    maxResponseBytes: operation?.maxResponseBytes ?? 5242880,
    timeoutMs: operation?.timeoutMs ?? 15000,
    fetch: typeof record.fetch === "function" ? (record.fetch as FetchFn) : undefined,
  });

  let path = spec.path;
  for (const param of spec.pathParams) {
    const value = record[param];
    if (typeof value !== "string" || value.length === 0) return invalidInput();
    path = path.replaceAll(`{{${param}}}`, encodeURIComponent(value));
  }

  const form = new URLSearchParams();
  for (const key of spec.fields) {
    if (record[key] !== undefined) appendFormValue(form, key, record[key]);
  }

  const url = new URL(`https://api.laposta.org${path}`);
  return client
    .fetchText(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${apiKey}:`, "utf8").toString("base64")}`,
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    })
    .then((response) => finish(spec.action, response));
}

export function appendFormValue(form: URLSearchParams, key: string, value: unknown): void {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      form.append(key, "");
      return;
    }
    for (const item of value) appendFormValue(form, `${key}[]`, item);
    return;
  }
  if (value && typeof value === "object") {
    for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
      appendFormValue(form, `${key}[${childKey}]`, childValue);
    }
    return;
  }
  if (value !== undefined && value !== null) form.append(key, String(value));
}

const fieldDatatypes = new Set(["text", "numeric", "date", "select_single", "select_multiple"]);
const memberStates = new Set(["active", "unsubscribed"]);

function validate(spec: FormPostConfig, input: Record<string, unknown>): Record<string, unknown> {
  for (const key of Object.keys(input)) {
    if (!spec.allowed.has(key)) throw new Error("Unsupported input field");
  }
  for (const key of spec.required) {
    const value = input[key];
    if (typeof value === "boolean") continue;
    if (typeof value !== "string" || value.length === 0) throw new Error(`${key} is required`);
  }
  if (spec.action === "fields.create") {
    if (typeof input.datatype !== "string" || !fieldDatatypes.has(input.datatype)) {
      throw new Error("datatype is invalid");
    }
  }
  if (spec.action === "members.update" && input.state !== undefined) {
    if (typeof input.state !== "string" || !memberStates.has(input.state)) {
      throw new Error("state is invalid");
    }
  }
  return input;
}

function finish(action: string, response: { status: number; headers: Record<string, string>; body: string }): Record<string, unknown> {
  const parsed = parseJson(response.body);
  if (response.status === 429) {
    throw {
      ok: false,
      code: "CONNECTOR_RATE_LIMITED",
      message: "Laposta rate limit exceeded.",
      retryAfterSeconds: retryAfterSeconds(response.headers),
    };
  }
  if (response.status < 200 || response.status >= 300) {
    throw {
      ok: false,
      code: "CONNECTOR_UPSTREAM_ERROR",
      message: messageOf(parsed) ?? `Laposta request failed with HTTP ${response.status}`,
    };
  }
  return { connector: "laposta", action, source: "provider", data: parsed };
}

function parseJson(body: string): unknown {
  if (body.trim() === "") return {};
  try {
    return JSON.parse(body);
  } catch {
    return { error: { message: body.slice(0, 4096) } };
  }
}

function messageOf(parsed: unknown): string | undefined {
  if (!isRecord(parsed)) return undefined;
  const error = parsed.error;
  if (typeof error === "string" && error.length > 0) return error;
  if (isRecord(error) && typeof error.message === "string" && error.message.length > 0) return error.message;
  if (typeof parsed.message === "string" && parsed.message.length > 0) return parsed.message;
  return undefined;
}

function retryAfterSeconds(headers: Record<string, string>): number {
  const retryAfter = Number(headers["retry-after"] ?? headers["Retry-After"]);
  if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.ceil(retryAfter);
  return 30;
}

function stripCredentials(input: Record<string, unknown>): Record<string, unknown> {
  const copy: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!credentialKeys.has(key)) copy[key] = value;
  }
  return copy;
}

function invalidInput(): never {
  throw { ok: false, code: "INVALID_ACTION_INPUT", message: "Action input is invalid." };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
