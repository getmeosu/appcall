import { createKlaviyoClient, parseKlaviyoRateLimit, isRecord } from "./http";
import { normalizeMetric, parseMetricsResponse } from "./objects";
import type { NormalizedMetric } from "./objects";

export type GetMetricInput = { metricId: string };

export function validateListMetricsInput(input: unknown): Record<string, never> {
  if (!isRecord(input)) throw new Error("input must be an object");
  return {};
}

export function validateGetMetricInput(input: unknown): GetMetricInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  return { metricId: requireString(input.metricId, "metricId") };
}

export async function listMetricsFromClient(
  options: { apiKey: string; fetch?: typeof fetch },
  input: unknown
): Promise<{ ok: true; metrics: NormalizedMetric[] } | { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } }> {
  validateListMetricsInput(input);
  const client = createKlaviyoClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "metrics.list" });
  const result = await client.fetchJSON("/metrics");
  if (result.status === 200) return { ok: true, metrics: parseMetricsResponse(result.body).metrics };
  const rl = parseKlaviyoRateLimit(result.status, result.headers);
  if (rl.limited) return { ok: false, error: { code: "CONNECTOR_RATE_LIMITED", message: "Klaviyo rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
  return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Klaviyo rejected the list metrics request." } };
}

export async function getMetricFromClient(
  options: { apiKey: string; fetch?: typeof fetch },
  input: unknown
): Promise<{ ok: true; metric: NormalizedMetric } | { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } }> {
  const payload = validateGetMetricInput(input);
  const client = createKlaviyoClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "metrics.get" });
  const result = await client.fetchJSON(`/metrics/${payload.metricId}`);
  if (result.status === 200) {
    const body = result.body as Record<string, unknown>;
    const data = isRecord(body.data) ? body.data : { id: payload.metricId, attributes: {} };
    return { ok: true, metric: normalizeMetric(data) };
  }
  const rl = parseKlaviyoRateLimit(result.status, result.headers);
  if (rl.limited) return { ok: false, error: { code: "CONNECTOR_RATE_LIMITED", message: "Klaviyo rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
  if (result.status === 404) return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Metric not found." } };
  return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Klaviyo rejected the get metric request." } };
}

function requireString(v: unknown, f: string): string {
  if (typeof v !== "string" || !v.length) throw new Error(`${f} is required`);
  return v;
}
