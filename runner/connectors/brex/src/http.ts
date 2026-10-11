import { ConnectorHttpError, createConnectorHttpClient } from "../../../bun/src/http";
import manifest from "../manifest.json";

const allowedHosts = manifest.network.allowedHosts as string[];

export type BrexError = { ok: false; code: string; message: string; retryAfterSeconds?: number };

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw { ok: false, code: "INVALID_ACTION_INPUT", message: "Action input is invalid." } satisfies BrexError;
  return value;
}

export async function brexFetch(input: Record<string, unknown>, init: { method: string; path: string; query?: Record<string, unknown>; body?: unknown; headers?: Record<string, string>; success?: number[] }): Promise<unknown> {
  const apiKey = input.apiKey;
  if (typeof apiKey !== "string" || apiKey.length === 0) {
    throw { ok: false, code: "INVALID_ACTION_INPUT", message: "apiKey is required." } satisfies BrexError;
  }
  const url = new URL(`https://api.brex.com${init.path}`);
  for (const [key, value] of Object.entries(init.query ?? {})) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) {
      for (const item of value) url.searchParams.append(key, String(item));
    } else {
      url.searchParams.set(key, String(value));
    }
  }
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/json",
    ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
    ...(init.headers ?? {}),
  };
  const client = createConnectorHttpClient({
    allowedHosts,
    maxResponseBytes: 5_242_880,
    timeoutMs: 15_000,
    fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
  });
  let response: { status: number; headers: Record<string, string>; body: string };
  try {
    response = await client.fetchText(url, {
      method: init.method,
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch (error) {
    if (error instanceof ConnectorHttpError) {
      throw { ok: false, code: error.code, message: error.message } satisfies BrexError;
    }
    throw { ok: false, code: "CONNECTOR_UNAVAILABLE", message: "Connector request failed." } satisfies BrexError;
  }
  const success = init.success ?? [200, 201, 202, 204];
  if (!success.includes(response.status)) {
    throw { ok: false, code: response.status === 429 ? "CONNECTOR_RATE_LIMITED" : "CONNECTOR_UPSTREAM_ERROR", message: `Brex rejected the ${init.method} ${init.path} request.` } satisfies BrexError;
  }
  if (response.body.trim() === "") return null;
  try {
    return JSON.parse(response.body);
  } catch {
    throw { ok: false, code: "CONNECTOR_RESPONSE_INVALID", message: "Connector returned invalid JSON." } satisfies BrexError;
  }
}

export function envelope(action: string, data: unknown): Record<string, unknown> {
  return { connector: "brex", action, source: "provider", data };
}
