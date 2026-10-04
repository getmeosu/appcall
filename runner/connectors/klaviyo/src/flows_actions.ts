import { createKlaviyoClient, parseKlaviyoRateLimit, isRecord } from "./http";
import { parseFlowsResponse } from "./objects";
import type { NormalizedFlow } from "./objects";

export function validateListFlowsInput(input: unknown): Record<string, never> {
  if (!isRecord(input)) throw new Error("input must be an object");
  return {};
}

export async function listFlowsFromClient(
  options: { apiKey: string; fetch?: typeof fetch },
  input: unknown
): Promise<{ ok: true; flows: NormalizedFlow[] } | { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } }> {
  validateListFlowsInput(input);
  const client = createKlaviyoClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "flows.list" });
  const result = await client.fetchJSON("/flows");
  if (result.status === 200) return { ok: true, flows: parseFlowsResponse(result.body).flows };
  const rl = parseKlaviyoRateLimit(result.status, result.headers);
  if (rl.limited) return { ok: false, error: { code: "CONNECTOR_RATE_LIMITED", message: "Klaviyo rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
  return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Klaviyo rejected the list flows request." } };
}
