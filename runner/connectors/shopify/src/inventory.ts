import { createShopifyClient, parseShopifyRateLimit, isRecord } from "./http";
import { normalizeInventoryLevel } from "./objects";

function requireNumber(value: unknown, field: string): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") { const n = Number(value); if (Number.isFinite(n)) return n; }
  throw new Error(`${field} must be a number`);
}

function mapError(status: number, headers: Record<string, string>, fallback: string): { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } } {
  const rl = parseShopifyRateLimit(status, headers);
  if (rl.limited) return { ok: false, error: { code: "CONNECTOR_RATE_LIMITED", message: "Shopify rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
  return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: fallback } };
}

export function validateSetInventoryLevelInput(input: unknown): {
  accessToken?: string;
  shopDomain?: string;
  inventoryItemId: number;
  locationId: number;
  available: number;
} {
  if (!isRecord(input)) throw new Error("set inventory level input must be an object");
  return {
    accessToken: typeof input.accessToken === "string" ? input.accessToken : undefined,
    shopDomain: typeof input.shopDomain === "string" ? input.shopDomain : undefined,
    inventoryItemId: requireNumber(input.inventoryItemId, "inventoryItemId"),
    locationId: requireNumber(input.locationId, "locationId"),
    available: requireNumber(input.available, "available"),
  };
}

export function createInventoryClient(options: { accessToken: string; shopDomain: string; fetch?: typeof fetch }) {
  const client = createShopifyClient({ accessToken: options.accessToken, shopDomain: options.shopDomain, fetch: options.fetch, operation: "inventory.levels.set" });

  return {
    async set(input: unknown) {
      const payload = validateSetInventoryLevelInput(input);
      const response = await client.fetchJSON("/inventory_levels/set.json", {
        method: "POST",
        body: JSON.stringify({
          inventory_item_id: payload.inventoryItemId,
          location_id: payload.locationId,
          available: payload.available,
        }),
      });
      if (response.status === 200 && isRecord(response.body) && isRecord(response.body.inventory_level)) {
        return { ok: true as const, inventoryLevel: normalizeInventoryLevel(response.body.inventory_level as Record<string, unknown>) };
      }
      return mapError(response.status, response.headers, "Shopify rejected the set inventory level request.");
    },
  };
}
