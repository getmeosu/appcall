import { ConnectorHttpError, createConnectorHttpClient } from "../../../bun/src/http";
import { isRecord } from "../../../bun/src/declarative/template";
import { validateStrictInput } from "../../../bun/src/declarative/strict-schema";
import type { JSONSchema } from "../../../bun/src/declarative/validate";
import manifest from "../manifest.json";

type FetchFn = typeof fetch;

const credentialKeys = new Set(["apiKey", "fetch"]);
const baseUrl = "https://api.sender.net/v2";

type OperationSpec = {
  timeoutMs?: number;
  maxResponseBytes?: number;
  inputSchema?: JSONSchema;
};

const operations = manifest.operations as Record<string, OperationSpec>;

function operation(key: string): OperationSpec {
  return operations[key] ?? {};
}

function validate(key: string, inputValue: unknown): Record<string, unknown> {
  const schema = operation(key).inputSchema ?? { type: "object" };
  if (!isRecord(inputValue) || typeof inputValue.apiKey !== "string" || inputValue.apiKey.length === 0) {
    throw { ok: false, code: "INVALID_ACTION_INPUT", message: "apiKey is required" };
  }
  try {
    return {
      ...validateStrictInput(inputValue, schema, credentialKeys),
      apiKey: inputValue.apiKey,
      fetch: inputValue.fetch,
    };
  } catch (error) {
    throw {
      ok: false,
      code: "INVALID_ACTION_INPUT",
      message: error instanceof Error ? error.message : "Action input is invalid.",
    };
  }
}

function compact(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

function retryAfterSeconds(headers: Record<string, string>): number {
  const retry = Number.parseInt(headers["retry-after"] ?? "", 10);
  return Number.isFinite(retry) ? retry : 30;
}

function extractMessage(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as unknown;
    if (isRecord(parsed) && typeof parsed.message === "string" && parsed.message.trim()) {
      return parsed.message;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

async function sendJson(
  key: string,
  method: "POST" | "PATCH",
  path: string,
  body: Record<string, unknown>,
  inputValue: unknown,
): Promise<Record<string, unknown>> {
  const input = validate(key, inputValue);
  const spec = operation(key);
  const client = createConnectorHttpClient({
    allowedHosts: manifest.network.allowedHosts as string[],
    maxResponseBytes: spec.maxResponseBytes ?? 5242880,
    timeoutMs: spec.timeoutMs ?? 15000,
    fetch: input.fetch as FetchFn | undefined,
  });
  let response: { status: number; headers: Record<string, string>; body: string };
  try {
    response = await client.fetchText(new URL(`${baseUrl}${path}`), {
      method,
      headers: {
        Authorization: `Bearer ${String(input.apiKey)}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(compact(body)),
    });
  } catch (error) {
    if (error instanceof ConnectorHttpError) {
      throw { ok: false, code: error.code, message: error.message };
    }
    throw { ok: false, code: "CONNECTOR_UNAVAILABLE", message: "Connector request failed." };
  }
  if (response.status === 429) {
    throw {
      ok: false,
      code: "CONNECTOR_RATE_LIMITED",
      message: "Sender rate limit exceeded.",
      retryAfterSeconds: retryAfterSeconds(response.headers),
    };
  }
  let parsed: unknown = null;
  if (response.body.trim() !== "") {
    try {
      parsed = JSON.parse(response.body);
    } catch {
      throw { ok: false, code: "CONNECTOR_RESPONSE_INVALID", message: "Connector returned invalid JSON." };
    }
  }
  if (response.status < 200 || response.status >= 300 || (isRecord(parsed) && parsed.success === false)) {
    throw {
      ok: false,
      code: "CONNECTOR_UPSTREAM_ERROR",
      message: extractMessage(response.body) ?? "Sender rejected the request.",
    };
  }
  return { connector: "sender", action: key, source: "provider", data: parsed };
}

export function createField(inputValue: unknown): Promise<Record<string, unknown>> {
  const input = validate("fields.create", inputValue);
  return sendJson("fields.create", "POST", "/fields", { title: input.title, type: input.type }, inputValue);
}

export function updateSubscriber(inputValue: unknown): Promise<Record<string, unknown>> {
  const input = validate("subscribers.update", inputValue);
  const subscriberId = encodeURIComponent(String(input.subscriber_id));
  return sendJson(
    "subscribers.update",
    "PATCH",
    `/subscribers/${subscriberId}`,
    {
      firstname: input.firstname,
      lastname: input.lastname,
      groups: input.groups,
      fields: input.fields,
      phone: input.phone,
      trigger_automation: input.trigger_automation,
      subscriber_status: input.subscriber_status,
      sms_status: input.sms_status,
      transactional_email_status: input.transactional_email_status,
    },
    inputValue,
  );
}

export const senderWriteHandlers = {
  "fields.create": createField,
  "subscribers.update": updateSubscriber,
};
