import { createKlaviyoClient, parseKlaviyoRateLimit, prop, isRecord } from "./http";
import { normalizeList, type NormalizedList } from "./objects";

// ─── lists.create ─────────────────────────────────────────────────────────────

export type CreateListInput = { name: string };

export function validateCreateListInput(input: unknown): CreateListInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  return { name: requireString(input.name, "name") };
}

export async function createListFromClient(
  options: { apiKey: string; fetch?: typeof fetch },
  input: unknown
): Promise<{ ok: true; list: NormalizedList } | { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } }> {
  const payload = validateCreateListInput(input);
  const client = createKlaviyoClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "lists.create" });
  const result = await client.fetchJSON("/lists", {
    method: "POST",
    body: JSON.stringify({ data: { type: "list", attributes: { name: payload.name } } }),
  });
  if (result.status === 201 || result.status === 200) {
    const body = result.body as Record<string, unknown>;
    const data = isRecord(body.data) ? body.data : { id: "", attributes: { name: payload.name } };
    return { ok: true, list: normalizeList(data) };
  }
  const rl = parseKlaviyoRateLimit(result.status, result.headers);
  if (rl.limited) return { ok: false, error: { code: "CONNECTOR_RATE_LIMITED", message: "Klaviyo rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
  return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Klaviyo rejected the create list request." } };
}

// ─── lists.get ────────────────────────────────────────────────────────────────

export type GetListInput = { listId: string };

export function validateGetListInput(input: unknown): GetListInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  return { listId: requireString(input.listId, "listId") };
}

export async function getListFromClient(
  options: { apiKey: string; fetch?: typeof fetch },
  input: unknown
): Promise<{ ok: true; list: NormalizedList } | { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } }> {
  const payload = validateGetListInput(input);
  const client = createKlaviyoClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "lists.get" });
  const result = await client.fetchJSON(`/lists/${payload.listId}`);
  if (result.status === 200) {
    const body = result.body as Record<string, unknown>;
    const data = isRecord(body.data) ? body.data : { id: payload.listId, attributes: {} };
    return { ok: true, list: normalizeList(data) };
  }
  const rl = parseKlaviyoRateLimit(result.status, result.headers);
  if (rl.limited) return { ok: false, error: { code: "CONNECTOR_RATE_LIMITED", message: "Klaviyo rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
  if (result.status === 404) return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "List not found." } };
  return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Klaviyo rejected the get list request." } };
}

function requireString(v: unknown, f: string): string {
  if (typeof v !== "string" || !v.length) throw new Error(`${f} is required`);
  return v;
}
