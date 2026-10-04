import { createKlaviyoClient, parseKlaviyoRateLimit, isRecord } from "./http";
import { normalizeCatalogItem, parseCatalogItemsResponse } from "./objects";
import type { NormalizedCatalogItem } from "./objects";

export type GetCatalogItemInput = { itemId: string };

export function validateListCatalogItemsInput(input: unknown): Record<string, never> {
  if (!isRecord(input)) throw new Error("input must be an object");
  return {};
}

export function validateGetCatalogItemInput(input: unknown): GetCatalogItemInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  return { itemId: requireString(input.itemId, "itemId") };
}

export async function listCatalogItemsFromClient(
  options: { apiKey: string; fetch?: typeof fetch },
  input: unknown
): Promise<{ ok: true; items: NormalizedCatalogItem[] } | { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } }> {
  validateListCatalogItemsInput(input);
  const client = createKlaviyoClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "catalog.items.list" });
  const result = await client.fetchJSON("/catalog-items");
  if (result.status === 200) return { ok: true, items: parseCatalogItemsResponse(result.body).items };
  const rl = parseKlaviyoRateLimit(result.status, result.headers);
  if (rl.limited) return { ok: false, error: { code: "CONNECTOR_RATE_LIMITED", message: "Klaviyo rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
  return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Klaviyo rejected the list catalog items request." } };
}

export async function getCatalogItemFromClient(
  options: { apiKey: string; fetch?: typeof fetch },
  input: unknown
): Promise<{ ok: true; item: NormalizedCatalogItem } | { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } }> {
  const payload = validateGetCatalogItemInput(input);
  const client = createKlaviyoClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "catalog.items.get" });
  const result = await client.fetchJSON(`/catalog-items/${encodeURIComponent(payload.itemId)}`);
  if (result.status === 200) {
    const body = result.body as Record<string, unknown>;
    const data = isRecord(body.data) ? body.data : { id: payload.itemId, attributes: {} };
    return { ok: true, item: normalizeCatalogItem(data) };
  }
  const rl = parseKlaviyoRateLimit(result.status, result.headers);
  if (rl.limited) return { ok: false, error: { code: "CONNECTOR_RATE_LIMITED", message: "Klaviyo rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
  if (result.status === 404) return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Catalog item not found." } };
  return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Klaviyo rejected the get catalog item request." } };
}

function requireString(v: unknown, f: string): string {
  if (typeof v !== "string" || !v.length) throw new Error(`${f} is required`);
  return v;
}
