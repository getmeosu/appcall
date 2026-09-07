/**
 * HTTP Request connector — normalized types.
 *
 * This is a utility connector that provides generic HTTP request capabilities.
 * It has no domain-specific models; this file exists to satisfy the connector
 * contract and can be extended with request/response normalization types
 * as the connector gains operations.
 */

export type NormalizedHttpRequest = {
  id: string;
  provider: "http-request";
  method: string;
  url: string;
  statusCode: number;
  headers: Record<string, string>;
  body: unknown;
  timestamp: string;
};

export function normalizeHttpRequest(opts: {
  id?: string;
  method: string;
  url: string;
  statusCode: number;
  headers?: Record<string, string>;
  body?: unknown;
}): NormalizedHttpRequest {
  return {
    id: opts.id ?? `http-req:${Date.now()}`,
    provider: "http-request",
    method: opts.method.toUpperCase(),
    url: opts.url,
    statusCode: opts.statusCode,
    headers: opts.headers ?? {},
    body: opts.body ?? null,
    timestamp: new Date().toISOString(),
  };
}
