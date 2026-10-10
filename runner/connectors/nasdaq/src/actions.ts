import { createConnectorHttpClient, ConnectorHttpError } from "../../../bun/src/http";
import { validateStrictInput } from "../../../bun/src/declarative/strict-schema";
import { isRecord } from "../../../bun/src/declarative/template";
import type { JSONSchema } from "../../../bun/src/declarative/validate";
import manifest from "../manifest.json";

const credentialKeys = new Set(["apiKey", "fetch"]);
const baseUrl = "https://data.nasdaq.com/api/v3";

type FetchFn = typeof fetch;

type OperationSpec = {
  timeoutMs?: number;
  maxResponseBytes?: number;
  inputSchema?: JSONSchema;
};

const operations = manifest.operations as Record<string, OperationSpec>;

export function getAnalystRatings(input: unknown): unknown {
  const validated = validateAction("analystRatings.get", input);
  if (!hasCredential(input)) return echo("analystRatings.get", validated);
  const symbol = String(validated.symbol);
  return getJson("analystRatings.get", input, "/datatables/ZACKS/AR.json", { ticker: symbol }).then((ratings) =>
    getJson("analystRatings.get", input, "/datatables/ZACKS/TP.json", { ticker: symbol }).then((targetPrices) => ({
      connector: "nasdaq",
      action: "analystRatings.get",
      source: "provider",
      data: { ratings, targetPrices },
    })),
  );
}

export function listDatabasesByDate(input: unknown): unknown {
  const validated = validateAction("databases.listByDate", input);
  if (!hasCredential(input)) return echo("databases.listByDate", validated);
  const targetDate = String(validated.target_date);
  return collectDatabases(input, 1, []).then((databases) => ({
    connector: "nasdaq",
    action: "databases.listByDate",
    source: "provider",
    data: {
      target_date: targetDate,
      databases: databases.filter((row) => stampMatches(row, targetDate)),
    },
  }));
}

export const handwrittenActions = {
  "analystRatings.get": getAnalystRatings,
  "databases.listByDate": listDatabasesByDate,
};

function collectDatabases(input: unknown, page: number, acc: Record<string, unknown>[]): Promise<Record<string, unknown>[]> {
  return getJson("databases.listByDate", input, "/databases.json", { per_page: 100, page }).then((parsed) => {
    const record = isRecord(parsed) ? parsed : {};
    const rows = Array.isArray(record.databases)
      ? record.databases.filter(isRecord)
      : Array.isArray(parsed)
        ? parsed.filter(isRecord)
        : [];
    const next = acc.concat(rows);
    const meta = isRecord(record.meta) ? record.meta : {};
    const totalPages = typeof meta.total_pages === "number" ? meta.total_pages : 1;
    if (page >= totalPages || rows.length === 0) return next;
    return collectDatabases(input, page + 1, next);
  });
}

function stampMatches(row: Record<string, unknown>, targetDate: string): boolean {
  const stamp = row.refreshed_at ?? row.updated_at ?? row.newest_available_date ?? row.to_date ?? "";
  return String(stamp).startsWith(targetDate);
}

function validateAction(action: string, input: unknown): Record<string, unknown> {
  const schema = operations[action]?.inputSchema ?? { type: "object" };
  try {
    return validateStrictInput(input, schema, credentialKeys);
  } catch (error) {
    throw {
      ok: false,
      code: "INVALID_ACTION_INPUT",
      message: error instanceof Error ? error.message : "Action input is invalid.",
    };
  }
}

function hasCredential(input: unknown): boolean {
  return isRecord(input) && typeof input.apiKey === "string" && input.apiKey.length > 0;
}

function echo(action: string, validated: Record<string, unknown>): Record<string, unknown> {
  return {
    connector: "nasdaq",
    action,
    source: "connector",
    validated,
  };
}

function getJson(
  action: string,
  input: unknown,
  path: string,
  query: Record<string, unknown> = {},
): Promise<unknown> {
  const record = isRecord(input) ? input : {};
  const operation = operations[action] ?? {};
  const client = createConnectorHttpClient({
    allowedHosts: ["data.nasdaq.com"],
    maxResponseBytes: operation.maxResponseBytes ?? 5242880,
    timeoutMs: operation.timeoutMs ?? 15000,
    fetch: typeof record.fetch === "function" ? (record.fetch as FetchFn) : undefined,
  });
  const url = new URL(`${baseUrl}${path}`);
  url.searchParams.set("api_key", String(record.apiKey));
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  return client
    .fetchText(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-Api-Token": String(record.apiKey),
      },
    })
    .then((response) => finish(action, response))
    .catch((error) => {
      if (error instanceof ConnectorHttpError) {
        throw { ok: false, code: error.code, message: error.message };
      }
      throw error;
    });
}

function finish(action: string, response: { status: number; headers: Record<string, string>; body: string }): unknown {
  if (response.status === 429) {
    throw {
      ok: false,
      code: "CONNECTOR_RATE_LIMITED",
      message: "Nasdaq Data Link rate limit exceeded.",
      retryAfterSeconds: retryAfterSeconds(response.headers),
    };
  }
  const parsed = parseJson(response.body);
  if (isRecord(parsed) && parsed.quandl_error !== undefined && parsed.quandl_error !== null) {
    throw {
      ok: false,
      code: "CONNECTOR_UPSTREAM_ERROR",
      message: extractQuandlMessage(parsed) ?? `Nasdaq Data Link rejected ${action}.`,
    };
  }
  if (response.status < 200 || response.status >= 300) {
    throw {
      ok: false,
      code: "CONNECTOR_UPSTREAM_ERROR",
      message: extractQuandlMessage(parsed) ?? `Nasdaq Data Link rejected the request (HTTP ${response.status}).`,
    };
  }
  return parsed;
}

function parseJson(body: string): unknown {
  const trimmed = body.trim();
  if (trimmed === "") {
    throw { ok: false, code: "CONNECTOR_RESPONSE_INVALID", message: "Connector returned an empty response." };
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    throw { ok: false, code: "CONNECTOR_RESPONSE_INVALID", message: "Connector returned non-JSON." };
  }
}

function extractQuandlMessage(parsed: unknown): string | undefined {
  if (!isRecord(parsed)) return undefined;
  if (isRecord(parsed.quandl_error) && typeof parsed.quandl_error.message === "string") {
    return parsed.quandl_error.message;
  }
  if (typeof parsed.message === "string") return parsed.message;
  return undefined;
}

function retryAfterSeconds(headers: Record<string, string>): number {
  const raw = headers["retry-after"] ?? headers["Retry-After"];
  const parsed = raw === undefined ? Number.NaN : Number(raw);
  return Number.isFinite(parsed) ? parsed : 30;
}
