import { createConnectorHttpClient, ConnectorHttpError } from "../../../bun/src/http";
import { isRecord } from "../../../bun/src/declarative/template";
import manifest from "../manifest.json";

export const BASELINKER_CONNECTOR_URL = "https://api.baselinker.com/connector.php";

const CREDENTIAL_KEYS = new Set(["apiKey", "fetch"]);

export function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return isRecord(value);
}

export function compactParameters(input: Record<string, unknown>): Record<string, unknown> {
  const parameters: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (CREDENTIAL_KEYS.has(key) || value === undefined) continue;
    parameters[key] = value;
  }
  return parameters;
}

export function encodeBaselinkerForm(method: string, parameters: Record<string, unknown>): string {
  const body = new URLSearchParams();
  body.set("method", method);
  body.set("parameters", JSON.stringify(parameters));
  return body.toString();
}

function headerMap(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) out[key.toLowerCase()] = value;
  return out;
}

function parseRetryAfter(headers: Record<string, string>): number {
  const raw = headers["retry-after"];
  const parsed = raw ? Number(raw) : Number.NaN;
  if (Number.isFinite(parsed) && parsed > 0) return Math.min(parsed, 3600);
  return 30;
}

function extractMessage(payload: unknown): string | undefined {
  if (!isObjectRecord(payload)) return undefined;
  for (const path of ["error_message", "error_code", "message"]) {
    const value = payload[path];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

function hasBodyError(payload: unknown): boolean {
  if (!isObjectRecord(payload)) return false;
  if (payload.status === "ERROR") return true;
  const message = payload.error_message;
  return typeof message === "string" && message.length > 0;
}

export async function callBaselinker(input: {
  apiKey: string;
  method: string;
  operation: string;
  parameters: Record<string, unknown>;
  fetch?: typeof fetch;
}): Promise<Record<string, unknown>> {
  const operation = (manifest.operations as Record<string, { maxResponseBytes?: number; timeoutMs?: number }>)[input.operation];
  const client = createConnectorHttpClient({
    allowedHosts: (manifest.network.allowedHosts as string[]) ?? ["api.baselinker.com"],
    maxResponseBytes: operation?.maxResponseBytes ?? 5242880,
    timeoutMs: operation?.timeoutMs ?? 15000,
    fetch: input.fetch,
  });

  let response: { status: number; headers: Record<string, string>; body: string };
  try {
    response = await client.fetchText(BASELINKER_CONNECTOR_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        "X-BLToken": input.apiKey,
      },
      body: encodeBaselinkerForm(input.method, input.parameters),
    });
  } catch (error) {
    if (error instanceof ConnectorHttpError) {
      throw { ok: false, code: error.code, message: error.message };
    }
    throw { ok: false, code: "CONNECTOR_UNAVAILABLE", message: "Connector request failed." };
  }

  const headers = headerMap(response.headers);
  let parsed: unknown = {};
  if (response.body.trim() !== "") {
    try {
      parsed = JSON.parse(response.body);
    } catch {
      throw { ok: false, code: "CONNECTOR_RESPONSE_INVALID", message: "Connector returned invalid JSON." };
    }
  }

  const limited = response.status === 429 || (
    isObjectRecord(parsed) && String(parsed.error_code ?? "").toLowerCase().includes("limit")
  );
  if (limited) {
    throw {
      ok: false,
      code: "CONNECTOR_RATE_LIMITED",
      message: "BaseLinker rate limit exceeded.",
      retryAfterSeconds: parseRetryAfter(headers),
    };
  }
  if (response.status !== 200 || hasBodyError(parsed)) {
    const detail = extractMessage(parsed);
    throw {
      ok: false,
      code: "CONNECTOR_UPSTREAM_ERROR",
      message: detail ?? `BaseLinker rejected the ${input.operation} request.`,
    };
  }

  if (!isObjectRecord(parsed)) {
    throw { ok: false, code: "CONNECTOR_RESPONSE_INVALID", message: "Connector returned invalid JSON." };
  }

  return {
    connector: "baselinker",
    action: input.operation,
    source: "provider",
    data: parsed,
  };
}
