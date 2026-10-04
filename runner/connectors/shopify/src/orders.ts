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

export function validateCreateOrderInput(input: unknown): {
  accessToken?: string;
  shopDomain?: string;
  email?: string;
  note?: string;
  financialStatus?: string;
  lineItems: Array<{ variantId?: number; title?: string; quantity: number; price?: string }>;
} {
  if (!isRecord(input)) throw new Error("create order input must be an object");
  if (!Array.isArray(input.lineItems) || input.lineItems.length === 0) throw new Error("lineItems is required");
  return {
    accessToken: typeof input.accessToken === "string" ? input.accessToken : undefined,
    shopDomain: typeof input.shopDomain === "string" ? input.shopDomain : undefined,
    email: typeof input.email === "string" ? input.email : undefined,
    note: typeof input.note === "string" ? input.note : undefined,
    financialStatus: typeof input.financialStatus === "string" ? input.financialStatus : undefined,
    lineItems: input.lineItems.map((item, index) => {
      if (!isRecord(item)) throw new Error(`lineItems[${index}] must be an object`);
      return {
        variantId: typeof item.variantId === "number" ? item.variantId : undefined,
        title: typeof item.title === "string" ? item.title : undefined,
        quantity: requireNumber(item.quantity, "quantity"),
        price: typeof item.price === "string" ? item.price : undefined,
      };
    }),
  };
}

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
    async create(input: unknown) {
      const payload = validateCreateOrderInput(input);
      const order: Record<string, unknown> = {
        line_items: payload.lineItems.map((item) => {
          const line: Record<string, unknown> = { quantity: item.quantity };
          if (item.variantId !== undefined) line.variant_id = item.variantId;
          if (item.title !== undefined) line.title = item.title;
          if (item.price !== undefined) line.price = item.price;
          return line;
        }),
      };
      if (payload.email !== undefined) order.email = payload.email;
      if (payload.note !== undefined) order.note = payload.note;
      if (payload.financialStatus !== undefined) order.financial_status = payload.financialStatus;
      const response = await client.fetchJSON("/orders.json", { method: "POST", body: JSON.stringify({ order }) });
      if ((response.status === 201 || response.status === 200) && isRecord(response.body) && isRecord(response.body.order)) {
        return { ok: true as const, order: normalizeOrder(response.body.order as Record<string, unknown>) };
      }
      return mapError(response.status, response.headers, "Shopify rejected the create order request.");
    },

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
