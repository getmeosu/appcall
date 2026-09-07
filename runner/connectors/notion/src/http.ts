import { type ConnectorHttpClient } from "../../../bun/src/http";

export const notionVersion = "2026-03-11";

export function readJsonObject(bodyText: string): Record<string, unknown> {
  try {
    const decoded = JSON.parse(bodyText);
    return isRecord(decoded) ? decoded : {};
  } catch {
    return {};
  }
}

export function isConnectorHttpClient(value: unknown): value is ConnectorHttpClient {
  return isRecord(value) && typeof value.fetchText === "function";
}

export function requireString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`${field} is required`);
  }
  return value;
}

export function requireNonEmptyString(value: unknown, field: string): string {
  const text = requireString(value, field).trim();
  if (text.length === 0) {
    throw new Error(`${field} is required`);
  }
  return text;
}

export function requireArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${field} must be an array`);
  }
  return value;
}

export function readPageSize(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 100) {
    throw new Error("pageSize must be an integer between 1 and 100");
  }
  return value;
}

export function readDepth(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 5) {
    throw new Error("depth must be an integer between 1 and 5");
  }
  return value;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function mapNotionSearchError(status: number, headers: Record<string, string>, body: Record<string, unknown>): Record<string, unknown> {
  return mapNotionError(status, headers, body, {
    forbidden: "Notion credentials do not have access to search pages.",
    notFound: "Notion page was not found or is not shared with the integration.",
    upstream: "Notion rejected the document search request.",
  });
}

export function mapNotionPageError(status: number, headers: Record<string, string>, body: Record<string, unknown>): Record<string, unknown> {
  return mapNotionError(status, headers, body, {
    forbidden: "Notion credentials do not have access to retrieve pages.",
    notFound: "Notion page was not found or is not shared with the integration.",
    upstream: "Notion rejected the document retrieval request.",
  });
}

export function mapNotionAppendBlocksError(status: number, headers: Record<string, string>, body: Record<string, unknown>): Record<string, unknown> {
  return mapNotionError(status, headers, body, {
    forbidden: "Notion credentials do not have access to append block children.",
    notFound: "Notion block was not found or is not shared with the integration.",
    upstream: "Notion rejected the block append request.",
  });
}

export function mapNotionCreatePageError(status: number, headers: Record<string, string>, body: Record<string, unknown>): Record<string, unknown> {
  return mapNotionError(status, headers, body, {
    forbidden: "Notion credentials do not have access to create pages.",
    notFound: "Notion parent page was not found or is not shared with the integration.",
    upstream: "Notion rejected the page create request.",
  });
}

export function mapNotionUpdatePageError(status: number, headers: Record<string, string>, body: Record<string, unknown>): Record<string, unknown> {
  return mapNotionError(status, headers, body, {
    forbidden: "Notion credentials do not have access to update pages.",
    notFound: "Notion page was not found or is not shared with the integration.",
    upstream: "Notion rejected the page update request.",
  });
}

export function mapNotionDatabaseError(status: number, headers: Record<string, string>, body: Record<string, unknown>): Record<string, unknown> {
  return mapNotionError(status, headers, body, {
    forbidden: "Notion credentials do not have access to retrieve databases.",
    notFound: "Notion database was not found or is not shared with the integration.",
    upstream: "Notion rejected the database retrieval request.",
  });
}

export function mapNotionCommentsError(status: number, headers: Record<string, string>, body: Record<string, unknown>): Record<string, unknown> {
  return mapNotionError(status, headers, body, {
    forbidden: "Notion credentials do not have read comments capability.",
    upstream: "Notion rejected the comments list request.",
  });
}

export function mapNotionCommentsCreateError(status: number, headers: Record<string, string>, body: Record<string, unknown>): Record<string, unknown> {
  return mapNotionError(status, headers, body, {
    forbidden: "Notion credentials do not have insert comments capability.",
    upstream: "Notion rejected the comment create request.",
  });
}

function mapNotionError(
  status: number,
  headers: Record<string, string>,
  body: Record<string, unknown>,
  messages: { forbidden: string; notFound?: string; upstream: string },
): Record<string, unknown> {
  const providerError = typeof body.code === "string" ? body.code : undefined;
  if (status === 429) {
    const retryAfter = Number(headers["retry-after"] ?? headers["Retry-After"] ?? "0");
    return {
      code: "CONNECTOR_RATE_LIMITED",
      message: "The upstream provider rate limited this request.",
      providerError,
      retryAfterSeconds: Number.isFinite(retryAfter) ? retryAfter : 0,
    };
  }
  if (status === 401) {
    return {
      code: "AUTHENTICATION_FAILED",
      message: "Notion rejected the provided credentials.",
      providerError,
    };
  }
  if (status === 403) {
    return {
      code: "CONNECTOR_CAPABILITY_MISSING",
      message: messages.forbidden,
      providerError,
    };
  }
  if (status === 404 && messages.notFound) {
    return {
      code: "CONNECTOR_NOT_FOUND",
      message: messages.notFound,
      providerError,
    };
  }
  return {
    code: "CONNECTOR_UPSTREAM_ERROR",
    message: messages.upstream,
    providerError,
  };
}
