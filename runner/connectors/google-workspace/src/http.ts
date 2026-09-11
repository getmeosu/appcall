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

const DEFAULT_RETRY_AFTER_SECONDS = 10;
const MAX_RETRY_AFTER_SECONDS = 3600;

export function parseGoogleRetryAfter(value: unknown, nowMs = Date.now()): number | undefined {
  const numeric = typeof value === "number" || typeof value === "string" ? Number(value) : Number.NaN;
  if (Number.isFinite(numeric)) {
    return normalizeGoogleRetryAfter(numeric);
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const dateMs = Date.parse(value);
  return Number.isFinite(dateMs) ? normalizeGoogleRetryAfter((dateMs - nowMs) / 1000) : undefined;
}

export function parseGoogleRateLimit(response: Response): GoogleRateLimitResult {
  return parseGoogleRateLimitMetadata(response.status, Object.fromEntries(response.headers.entries()));
}

export function parseGoogleRateLimitMetadata(
  status: number,
  headers: Record<string, string>,
  bodyRetryAfter?: unknown,
): GoogleRateLimitResult {
  if (status === 429) {
    const headerRetryAfter = Object.entries(headers).find(([key]) => key.toLowerCase() === "retry-after")?.[1];
    return {
      limited: true,
      retryAfterSeconds: parseGoogleRetryAfter(headerRetryAfter)
        ?? parseGoogleRetryAfter(bodyRetryAfter)
        ?? DEFAULT_RETRY_AFTER_SECONDS,
    };
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
    return parseGoogleRetryAfter(retryAfter) ?? 0;
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

function normalizeGoogleRetryAfter(seconds: number): number | undefined {
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > MAX_RETRY_AFTER_SECONDS) {
    return undefined;
  }
  return Math.ceil(seconds);
}
