import { createWooCommerceClient, parseWooCommerceRateLimit, prop, propStr, propNum, isRecord } from "./http";

// ─── Normalized type ──────────────────────────────────────────────────────────

export type NormalizedOrderAction = {
  id: string;
  provider: "woocommerce";
  providerOrderId: string;
  number: string;
  status: string;
  total: number;
  currency: string;
  billingEmail: string;
  billingFirstName: string;
  billingLastName: string;
  customerId: number;
  paymentMethod: string;
  createdAt: string;
  modelVersion: "2026-05-16";
  raw: Record<string, unknown>;
};

export function normalizeOrderAction(o: Record<string, unknown>): NormalizedOrderAction {
  const billing = isRecord(o.billing) ? o.billing : {};
  return {
    id: `wc-order:${propStr(o, "id")}`,
    provider: "woocommerce",
    providerOrderId: propStr(o, "id"),
    number: prop(o, "number"),
    status: prop(o, "status"),
    total: propNum(o, "total"),
    currency: prop(o, "currency"),
    billingEmail: prop(billing, "email"),
    billingFirstName: prop(billing, "first_name"),
    billingLastName: prop(billing, "last_name"),
    customerId: propNum(o, "customer_id"),
    paymentMethod: prop(o, "payment_method"),
    createdAt: prop(o, "date_created"),
    modelVersion: "2026-05-16",
    raw: o,
  };
}

// ─── Input types ──────────────────────────────────────────────────────────────

export type CreateOrderInput = {
  consumerKey: string;
  consumerSecret: string;
  siteUrl: string;
  status?: string;
  customer_id?: number;
  billing?: Record<string, unknown>;
  shipping?: Record<string, unknown>;
  line_items?: unknown[];
  payment_method?: string;
  payment_method_title?: string;
};

export type GetOrderInput = {
  consumerKey: string;
  consumerSecret: string;
  siteUrl: string;
  orderId: number;
};

export type UpdateOrderInput = {
  consumerKey: string;
  consumerSecret: string;
  siteUrl: string;
  orderId: number;
  status?: string;
  billing?: Record<string, unknown>;
  shipping?: Record<string, unknown>;
  customer_note?: string;
};

export type DeleteOrderInput = {
  consumerKey: string;
  consumerSecret: string;
  siteUrl: string;
  orderId: number;
  force?: boolean;
};

// ─── Validators ───────────────────────────────────────────────────────────────

export function validateCreateOrderInput(input: unknown): CreateOrderInput {
  if (!isRecord(input)) throw new Error("orders.create input must be an object");
  return {
    consumerKey: typeof input.consumerKey === "string" ? input.consumerKey : "",
    consumerSecret: typeof input.consumerSecret === "string" ? input.consumerSecret : "",
    siteUrl: typeof input.siteUrl === "string" ? input.siteUrl : "",
    status: typeof input.status === "string" ? input.status : undefined,
    customer_id: typeof input.customer_id === "number" ? input.customer_id : undefined,
    billing: isRecord(input.billing) ? input.billing : undefined,
    shipping: isRecord(input.shipping) ? input.shipping : undefined,
    line_items: Array.isArray(input.line_items) ? input.line_items : undefined,
    payment_method: typeof input.payment_method === "string" ? input.payment_method : undefined,
    payment_method_title: typeof input.payment_method_title === "string" ? input.payment_method_title : undefined,
  };
}

export function validateGetOrderInput(input: unknown): GetOrderInput {
  if (!isRecord(input)) throw new Error("orders.get input must be an object");
  if (typeof input.orderId !== "number") throw new Error("orderId must be a number");
  return {
    consumerKey: typeof input.consumerKey === "string" ? input.consumerKey : "",
    consumerSecret: typeof input.consumerSecret === "string" ? input.consumerSecret : "",
    siteUrl: typeof input.siteUrl === "string" ? input.siteUrl : "",
    orderId: input.orderId,
  };
}

export function validateUpdateOrderInput(input: unknown): UpdateOrderInput {
  if (!isRecord(input)) throw new Error("orders.update input must be an object");
  if (typeof input.orderId !== "number") throw new Error("orderId must be a number");
  return {
    consumerKey: typeof input.consumerKey === "string" ? input.consumerKey : "",
    consumerSecret: typeof input.consumerSecret === "string" ? input.consumerSecret : "",
    siteUrl: typeof input.siteUrl === "string" ? input.siteUrl : "",
    orderId: input.orderId,
    status: typeof input.status === "string" ? input.status : undefined,
    billing: isRecord(input.billing) ? input.billing : undefined,
    shipping: isRecord(input.shipping) ? input.shipping : undefined,
    customer_note: typeof input.customer_note === "string" ? input.customer_note : undefined,
  };
}

export function validateDeleteOrderInput(input: unknown): DeleteOrderInput {
  if (!isRecord(input)) throw new Error("orders.delete input must be an object");
  if (typeof input.orderId !== "number") throw new Error("orderId must be a number");
  return {
    consumerKey: typeof input.consumerKey === "string" ? input.consumerKey : "",
    consumerSecret: typeof input.consumerSecret === "string" ? input.consumerSecret : "",
    siteUrl: typeof input.siteUrl === "string" ? input.siteUrl : "",
    orderId: input.orderId,
    force: typeof input.force === "boolean" ? input.force : undefined,
  };
}

// ─── Client ───────────────────────────────────────────────────────────────────

export function createOrdersClient(options: { consumerKey: string; consumerSecret: string; siteUrl: string; fetch?: typeof fetch }) {
  const client = createWooCommerceClient({ consumerKey: options.consumerKey, consumerSecret: options.consumerSecret, siteUrl: options.siteUrl, fetch: options.fetch, operation: "orders.create" });

  return {
    async create(input: unknown) {
      const payload = validateCreateOrderInput(input);
      const body: Record<string, unknown> = {};
      if (payload.status !== undefined) body.status = payload.status;
      if (payload.customer_id !== undefined) body.customer_id = payload.customer_id;
      if (payload.billing !== undefined) body.billing = payload.billing;
      if (payload.shipping !== undefined) body.shipping = payload.shipping;
      if (payload.line_items !== undefined) body.line_items = payload.line_items;
      if (payload.payment_method !== undefined) body.payment_method = payload.payment_method;
      if (payload.payment_method_title !== undefined) body.payment_method_title = payload.payment_method_title;
      const response = await client.fetchJSON("/orders", { method: "POST", body: JSON.stringify(body) });
      if (response.status === 201) {
        return { ok: true as const, order: normalizeOrderAction(response.body as Record<string, unknown>) };
      }
      const rateLimit = parseWooCommerceRateLimit(response.status, response.headers);
      if (rateLimit.limited) {
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED" as const, message: "WooCommerce rate limit exceeded.", retryAfterSeconds: rateLimit.retryAfterSeconds } };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: `WooCommerce rejected orders.create (status ${response.status}).` } };
    },

    async get(input: unknown) {
      const payload = validateGetOrderInput(input);
      const response = await client.fetchJSON(`/orders/${payload.orderId}`);
      if (response.status === 200) {
        return { ok: true as const, order: normalizeOrderAction(response.body as Record<string, unknown>) };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: "Order not found." } };
      }
      const rateLimit = parseWooCommerceRateLimit(response.status, response.headers);
      if (rateLimit.limited) {
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED" as const, message: "WooCommerce rate limit exceeded.", retryAfterSeconds: rateLimit.retryAfterSeconds } };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: `WooCommerce rejected orders.get (status ${response.status}).` } };
    },

    async update(input: unknown) {
      const payload = validateUpdateOrderInput(input);
      const body: Record<string, unknown> = {};
      if (payload.status !== undefined) body.status = payload.status;
      if (payload.billing !== undefined) body.billing = payload.billing;
      if (payload.shipping !== undefined) body.shipping = payload.shipping;
      if (payload.customer_note !== undefined) body.customer_note = payload.customer_note;
      const response = await client.fetchJSON(`/orders/${payload.orderId}`, { method: "PUT", body: JSON.stringify(body) });
      if (response.status === 200) {
        return { ok: true as const, order: normalizeOrderAction(response.body as Record<string, unknown>) };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: "Order not found." } };
      }
      const rateLimit = parseWooCommerceRateLimit(response.status, response.headers);
      if (rateLimit.limited) {
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED" as const, message: "WooCommerce rate limit exceeded.", retryAfterSeconds: rateLimit.retryAfterSeconds } };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: `WooCommerce rejected orders.update (status ${response.status}).` } };
    },

    async delete(input: unknown) {
      const payload = validateDeleteOrderInput(input);
      const qs = payload.force ? "?force=true" : "";
      const response = await client.fetchJSON(`/orders/${payload.orderId}${qs}`, { method: "DELETE" });
      if (response.status === 200) {
        return { ok: true as const, deleted: true, orderId: payload.orderId };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: "Order not found." } };
      }
      const rateLimit = parseWooCommerceRateLimit(response.status, response.headers);
      if (rateLimit.limited) {
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED" as const, message: "WooCommerce rate limit exceeded.", retryAfterSeconds: rateLimit.retryAfterSeconds } };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: `WooCommerce rejected orders.delete (status ${response.status}).` } };
    },
  };
}
