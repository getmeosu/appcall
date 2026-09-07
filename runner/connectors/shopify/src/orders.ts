import { createShopifyClient, parseShopifyRateLimit, isRecord, prop, propNum } from "./http";
import { normalizeOrder } from "./objects";

// ─── Shared helpers ────────────────────────────────────────────────────────────

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

// ─── orders.get ───────────────────────────────────────────────────────────────

export function validateGetOrderInput(input: unknown): { accessToken?: string; shopDomain?: string; orderId: number } {
  if (!isRecord(input)) throw new Error("get order input must be an object");
  return {
    accessToken: typeof input.accessToken === "string" ? input.accessToken : undefined,
    shopDomain: typeof input.shopDomain === "string" ? input.shopDomain : undefined,
    orderId: requireNumber(input.orderId, "orderId"),
  };
}

// ─── orders.update ────────────────────────────────────────────────────────────

export function validateUpdateOrderInput(input: unknown): { accessToken?: string; shopDomain?: string; orderId: number; email?: string; note?: string; tags?: string } {
  if (!isRecord(input)) throw new Error("update order input must be an object");
  return {
    accessToken: typeof input.accessToken === "string" ? input.accessToken : undefined,
    shopDomain: typeof input.shopDomain === "string" ? input.shopDomain : undefined,
    orderId: requireNumber(input.orderId, "orderId"),
    email: typeof input.email === "string" ? input.email : undefined,
    note: typeof input.note === "string" ? input.note : undefined,
    tags: typeof input.tags === "string" ? input.tags : undefined,
  };
}

// ─── orders.close ─────────────────────────────────────────────────────────────

export function validateCloseOrderInput(input: unknown): { accessToken?: string; shopDomain?: string; orderId: number } {
  if (!isRecord(input)) throw new Error("close order input must be an object");
  return {
    accessToken: typeof input.accessToken === "string" ? input.accessToken : undefined,
    shopDomain: typeof input.shopDomain === "string" ? input.shopDomain : undefined,
    orderId: requireNumber(input.orderId, "orderId"),
  };
}

// ─── orders.cancel ────────────────────────────────────────────────────────────

export function validateCancelOrderInput(input: unknown): { accessToken?: string; shopDomain?: string; orderId: number; reason?: string; email?: boolean } {
  if (!isRecord(input)) throw new Error("cancel order input must be an object");
  return {
    accessToken: typeof input.accessToken === "string" ? input.accessToken : undefined,
    shopDomain: typeof input.shopDomain === "string" ? input.shopDomain : undefined,
    orderId: requireNumber(input.orderId, "orderId"),
    reason: typeof input.reason === "string" ? input.reason : undefined,
    email: typeof input.email === "boolean" ? input.email : undefined,
  };
}

// ─── Client ───────────────────────────────────────────────────────────────────

export function createOrdersClient(options: { accessToken: string; shopDomain: string; fetch?: typeof fetch }) {
  const client = createShopifyClient({ accessToken: options.accessToken, shopDomain: options.shopDomain, fetch: options.fetch, operation: "orders.list" });

  return {
    async get(input: unknown) {
      const payload = validateGetOrderInput(input);
      const response = await client.fetchJSON(`/orders/${payload.orderId}.json`);
      if (response.status === 200 && isRecord(response.body) && isRecord(response.body.order)) {
        return { ok: true as const, order: normalizeOrder(response.body.order as Record<string, unknown>) };
      }
      if (response.status === 404) return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Order not found." } };
      return mapError(response.status, response.headers, "Shopify rejected the get order request.");
    },

    async update(input: unknown) {
      const payload = validateUpdateOrderInput(input);
      const body: Record<string, unknown> = {};
      if (payload.email !== undefined) body.email = payload.email;
      if (payload.note !== undefined) body.note = payload.note;
      if (payload.tags !== undefined) body.tags = payload.tags;
      const response = await client.fetchJSON(`/orders/${payload.orderId}.json`, { method: "PUT", body: JSON.stringify({ order: body }) });
      if (response.status === 200 && isRecord(response.body) && isRecord(response.body.order)) {
        return { ok: true as const, order: normalizeOrder(response.body.order as Record<string, unknown>) };
      }
      if (response.status === 404) return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Order not found." } };
      return mapError(response.status, response.headers, "Shopify rejected the update order request.");
    },

    async close(input: unknown) {
      const payload = validateCloseOrderInput(input);
      const response = await client.fetchJSON(`/orders/${payload.orderId}/close.json`, { method: "POST", body: JSON.stringify({}) });
      if (response.status === 200 && isRecord(response.body) && isRecord(response.body.order)) {
        return { ok: true as const, order: normalizeOrder(response.body.order as Record<string, unknown>) };
      }
      if (response.status === 404) return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Order not found." } };
      return mapError(response.status, response.headers, "Shopify rejected the close order request.");
    },

    async cancel(input: unknown) {
      const payload = validateCancelOrderInput(input);
      const body: Record<string, unknown> = {};
      if (payload.reason !== undefined) body.reason = payload.reason;
      if (payload.email !== undefined) body.email = payload.email;
      const response = await client.fetchJSON(`/orders/${payload.orderId}/cancel.json`, { method: "POST", body: JSON.stringify(body) });
      if (response.status === 200 && isRecord(response.body) && isRecord(response.body.order)) {
        return { ok: true as const, order: normalizeOrder(response.body.order as Record<string, unknown>) };
      }
      if (response.status === 404) return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Order not found." } };
      return mapError(response.status, response.headers, "Shopify rejected the cancel order request.");
    },
  };
}
