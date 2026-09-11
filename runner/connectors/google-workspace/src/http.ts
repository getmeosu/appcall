import { supportsOperationBudget, type OperationBudgetLike } from "../../../bun/src/budget";
import { createConnectorHttpClient, ConnectorHttpError, type ConnectorHttpClient } from "../../../bun/src/http";
import manifest from "../manifest.json";

export type GoogleRateLimitResult =
  | { limited: true; retryAfterSeconds: number }
  | { limited: false };

export type ConnectorErrorCode =
  | "CONNECTOR_RATE_LIMITED"
  | "CONNECTOR_UPSTREAM_ERROR";

export type ConnectorError = {
  code: ConnectorErrorCode;
  message: string;
  retryAfterSeconds?: number;
  providerError?: string;
};

export function parseGoogleRetryAfter(value: unknown, nowMs = Date.now()): number | undefined {
  const numeric = typeof value === "number" || typeof value === "string" ? Number(value) : Number.NaN;
  if (Number.isFinite(numeric)) {
    return numeric;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const dateMs = Date.parse(value);
  return Number.isFinite(dateMs) ? (dateMs - nowMs) / 1000 : undefined;
}

export function parseGoogleRateLimit(response: Response): GoogleRateLimitResult {
  if (response.status === 429) {
    return { limited: true, retryAfterSeconds: parseGoogleRetryAfter(response.headers.get("Retry-After")) ?? 0 };
  }
  return { limited: false };
}

export function parseGoogleRateLimitMetadata(status: number, headers: Record<string, string>): GoogleRateLimitResult {
  if (status === 429) {
    const retryAfter = parseGoogleRetryAfter(headers["retry-after"] ?? headers["Retry-After"]);
    return { limited: true, retryAfterSeconds: retryAfter ?? 0 };
  }
  return { limited: false };
}

export function parseGoogleError(body: unknown): ConnectorError | null {
  if (!isRecord(body)) {
    return null;
  }
  const error = body.error;
  if (!isRecord(error)) {
    return null;
  }
  const status = typeof error.status === "number" ? error.status : 0;
  const message = typeof error.message === "string" ? error.message : "Google API error";
  const code = typeof error.code === "number" ? error.code : status;
  const retryAfter = parseRetryAfterFromError(error);

  if (status === 429 || code === 429) {
    return { code: "CONNECTOR_RATE_LIMITED", message, retryAfterSeconds: retryAfter };
  }
  return { code: "CONNECTOR_UPSTREAM_ERROR", message, providerError: `${code}` };
}

function parseRetryAfterFromError(error: Record<string, unknown>): number {
  const errors = error.errors;
  if (!Array.isArray(errors) || errors.length === 0) {
    return 0;
  }
  const first = errors[0];
  if (!isRecord(first)) {
    return 0;
  }
  const domain = first.domain;
  if (domain === "usageLimits") {
    const retryAfter = first.retryDelay;
    if (typeof retryAfter === "number") {
      return retryAfter;
    }
  }
  return 0;
}

export function parseNextPageToken(response: unknown): string | null {
  if (!isRecord(response)) {
    return null;
  }
  const token = response.nextPageToken;
  return typeof token === "string" && token.length > 0 ? token : null;
}

export type GoogleClientOptions = {
  accessToken: string;
  fetch?: typeof fetch;
  httpClient?: ConnectorHttpClient;
  operation: string;
};

export function createGoogleClient(options: GoogleClientOptions): ConnectorHttpClient {
  const operationSpec = (manifest.operations as Record<string, OperationBudgetLike>)[options.operation];
  if (!supportsOperationBudget(operationSpec)) {
    throw new ConnectorHttpError(
      "OUTBOUND_UNSUPPORTED_BUDGET",
      "Outbound operation budget is not supported.",
    );
  }
  return options.httpClient ?? createConnectorHttpClient({
    allowedHosts: manifest.network.allowedHosts as string[],
    timeoutMs: operationSpec.timeoutMs,
    maxResponseBytes: operationSpec.maxResponseBytes,
    fetch: options.fetch,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
