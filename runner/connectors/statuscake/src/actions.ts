import { createConnectorHttpClient, ConnectorHttpError } from "../../../bun/src/http";
import { isRecord, renderPath, renderTemplate } from "../../../bun/src/declarative/template";
import { validateStrictInput } from "../../../bun/src/declarative/strict-schema";
import type { CompiledHandler } from "../../../bun/src/declarative/types";
import manifest from "../manifest.json";

const CHECK_RATE_ALIASES: Record<string, number> = {
  test_immediately: 0,
  every_30_seconds: 30,
  every_1_minute: 60,
  every_5_minutes: 300,
  every_15_minutes: 900,
  every_30_minutes: 1800,
  every_1_hour: 3600,
  every_24_hours: 86400,
};

const FORM_OPS = [
  "uptimeTests.create",
  "uptimeTests.update",
  "heartbeatTests.create",
  "heartbeatTests.update",
  "pagespeedTests.create",
  "pagespeedTests.update",
  "sslTests.update",
  "contactGroups.create",
  "contactGroups.update",
] as const;

const ARRAY_FIELDS = new Set([
  "tags",
  "dns_ips",
  "regions",
  "contact_groups",
  "email_addresses",
  "mobile_numbers",
  "integrations",
  "alert_at",
]);

const PATH_FIELDS = new Set(["test_id", "contact_group_id", "apiKey", "fetch"]);

type Operation = {
  inputSchema?: { type?: string; properties?: Record<string, unknown>; required?: string[] };
  request?: {
    method?: string;
    path?: string;
    success?: number[];
    result?: unknown;
  };
  maxResponseBytes?: number;
  timeoutMs?: number;
};

function hasCredential(input: unknown): input is Record<string, unknown> {
  return isRecord(input) && typeof input.apiKey === "string" && input.apiKey.length > 0;
}

function mapCheckRate(value: unknown): unknown {
  if (typeof value === "string" && value in CHECK_RATE_ALIASES) return CHECK_RATE_ALIASES[value];
  return value;
}

export function encodeStatuscakeForm(input: Record<string, unknown>): string {
  const body = new URLSearchParams();
  for (const [key, raw] of Object.entries(input)) {
    if (PATH_FIELDS.has(key) || raw === undefined || raw === null) continue;
    const value = key === "check_rate" ? mapCheckRate(raw) : raw;
    if (ARRAY_FIELDS.has(key)) {
      if (!Array.isArray(value)) continue;
      if (value.length === 0) {
        body.append(`${key}[]`, "");
        continue;
      }
      for (const item of value) {
        if (item !== undefined && item !== null && item !== "") body.append(`${key}[]`, String(item));
      }
      continue;
    }
    if (typeof value === "object") continue;
    body.append(key, String(value));
  }
  return body.toString();
}

function makeHandler(operationKey: (typeof FORM_OPS)[number]): CompiledHandler {
  const operation = (manifest.operations as Record<string, Operation>)[operationKey];
  const request = operation.request ?? {};
  const schema = operation.inputSchema ?? { type: "object" };
  const credentialKeys = new Set(["apiKey", "fetch"]);
  return function execute(input: unknown): unknown {
    if (!hasCredential(input)) {
      const validated = validateStrictInput(input, schema as never, credentialKeys);
      return { connector: "statuscake", action: operationKey, source: "connector", validated };
    }
    let validated: Record<string, unknown>;
    try {
      validated = validateStrictInput(input, schema as never, credentialKeys);
    } catch (error) {
      return Promise.reject({
        ok: false,
        code: "INVALID_ACTION_INPUT",
        message: error instanceof Error ? error.message : "Action input is invalid.",
      });
    }
    const client = createConnectorHttpClient({
      allowedHosts: ["api.statuscake.com"],
      maxResponseBytes: operation.maxResponseBytes ?? 5_242_880,
      timeoutMs: operation.timeoutMs ?? 15_000,
      fetch: typeof input.fetch === "function" ? (input.fetch as typeof fetch) : undefined,
    });
    const path = renderPath(request.path ?? "", validated);
    const url = `https://api.statuscake.com/v1${path}`;
    const body = encodeStatuscakeForm(validated);
    return client
      .fetchText(url, {
        method: request.method ?? "POST",
        headers: {
          Authorization: `Bearer ${String(input.apiKey)}`,
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      })
      .then((response) => {
        const success = request.success ?? [200, 201, 204];
        if (!success.includes(response.status)) {
          let parsed: unknown;
          try {
            parsed = response.body ? JSON.parse(response.body) : undefined;
          } catch {
            parsed = undefined;
          }
          const detail =
            isRecord(parsed) && typeof parsed.message === "string"
              ? parsed.message
              : "statuscake rejected the request.";
          throw { ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message: detail };
        }
        let parsed: unknown = null;
        if (response.body.trim() !== "") parsed = JSON.parse(response.body);
        const mapped =
          request.result === undefined
            ? { data: parsed }
            : renderTemplate(request.result, { response: parsed, status: response.status, headers: response.headers, input: validated });
        return {
          connector: "statuscake",
          action: operationKey,
          source: "provider",
          ...(isRecord(mapped) ? mapped : { data: mapped }),
        };
      })
      .catch((error) => {
        if (error instanceof ConnectorHttpError) {
          throw { ok: false, code: error.code, message: error.message };
        }
        throw error;
      });
  };
}

export const statuscakeFormHandlers: Record<string, CompiledHandler> = Object.fromEntries(
  FORM_OPS.map((key) => [key, makeHandler(key)]),
);
