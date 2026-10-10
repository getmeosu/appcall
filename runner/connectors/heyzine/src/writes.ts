import { ConnectorHttpError, createConnectorHttpClient } from "../../../bun/src/http";
import { isRecord } from "../../../bun/src/declarative/template";
import { validateStrictInput } from "../../../bun/src/declarative/strict-schema";
import type { JSONSchema } from "../../../bun/src/declarative/validate";
import manifest from "../manifest.json";

type FetchFn = typeof fetch;

const credentialKeys = new Set(["apiKey", "fetch"]);

function operation(key: string): {
  timeoutMs?: number;
  maxResponseBytes?: number;
  inputSchema?: JSONSchema;
} {
  return (manifest.operations as Record<string, { timeoutMs?: number; maxResponseBytes?: number; inputSchema?: JSONSchema }>)[key]!;
}

function validate(key: string, inputValue: unknown): Record<string, unknown> {
  const schema = operation(key).inputSchema ?? { type: "object" };
  if (!isRecord(inputValue) || typeof inputValue.apiKey !== "string" || inputValue.apiKey.length === 0) {
    throw { ok: false, code: "INVALID_ACTION_INPUT", message: "apiKey is required" };
  }
  try {
    return { ...validateStrictInput(inputValue, schema, credentialKeys), apiKey: inputValue.apiKey, fetch: inputValue.fetch };
  } catch (error) {
    throw { ok: false, code: "INVALID_ACTION_INPUT", message: error instanceof Error ? error.message : "Action input is invalid." };
  }
}

function compact(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

async function postJson(key: string, path: string, body: Record<string, unknown>, inputValue: unknown): Promise<Record<string, unknown>> {
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
    response = await client.fetchText(new URL(`https://heyzine.com${path}`), {
      method: "POST",
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
  return finish(key, response);
}

function finish(action: string, response: { status: number; headers: Record<string, string>; body: string }): Record<string, unknown> {
  let parsed: unknown = null;
  if (response.body.trim() !== "") {
    try {
      parsed = JSON.parse(response.body);
    } catch {
      throw { ok: false, code: "CONNECTOR_RESPONSE_INVALID", message: "Connector returned invalid JSON." };
    }
  }
  if (response.status === 429) {
    const retry = Number.parseInt(response.headers["retry-after"] ?? "", 10);
    throw {
      ok: false,
      code: "CONNECTOR_RATE_LIMITED",
      message: "Heyzine rate limit exceeded.",
      retryAfterSeconds: Number.isFinite(retry) ? retry : 30,
    };
  }
  const failedFlag = isRecord(parsed) && parsed.success === false;
  if (response.status < 200 || response.status >= 300 || failedFlag) {
    const detail = isRecord(parsed) && typeof parsed.msg === "string" && parsed.msg.trim() ? parsed.msg : undefined;
    throw {
      ok: false,
      code: "CONNECTOR_UPSTREAM_ERROR",
      message: detail ?? "Heyzine rejected the request.",
    };
  }
  return { connector: "heyzine", action, source: "provider", data: parsed };
}

export function deleteFlipbook(inputValue: unknown): Promise<Record<string, unknown>> {
  const input = validate("flipbooks.delete", inputValue);
  return postJson("flipbooks.delete", "/api1/flipbook-delete", { id: input.id }, inputValue);
}

export function updatePassword(inputValue: unknown): Promise<Record<string, unknown>> {
  const input = validate("flipbooks.password.update", inputValue);
  return postJson(
    "flipbooks.password.update",
    "/api1/access-setup",
    {
      mode: input.mode,
      name: input.name,
      password: input.password,
      text_password: input.text_password,
      text_user: input.text_user,
      type: input.type,
    },
    inputValue,
  );
}

export async function updateAccessList(inputValue: unknown): Promise<Record<string, unknown>> {
  const input = validate("flipbooks.access_list.update", inputValue);
  const entries = Array.isArray(input.access_list) ? input.access_list : [];
  if (entries.length === 0) {
    throw { ok: false, code: "INVALID_ACTION_INPUT", message: "access_list is required" };
  }
  let last: Record<string, unknown> | undefined;
  for (const entry of entries) {
    if (!isRecord(entry)) {
      throw { ok: false, code: "INVALID_ACTION_INPUT", message: "access_list entries must be objects" };
    }
    last = await postJson(
      "flipbooks.access_list.update",
      "/api1/access-add",
      {
        access_type: entry.access_type,
        name: input.flipbook_id,
        password: entry.password,
        type: input.type,
        user: entry.user,
      },
      inputValue,
    );
  }
  return last!;
}

export const heyzineWriteHandlers = {
  "flipbooks.delete": deleteFlipbook,
  "flipbooks.password.update": updatePassword,
  "flipbooks.access_list.update": updateAccessList,
};
