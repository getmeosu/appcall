import { createWooCommerceClient, parseWooCommerceRateLimit, prop, propStr, propNum, isRecord } from "./http";

// ─── Normalized type ──────────────────────────────────────────────────────────

export type NormalizedCustomerAction = {
  id: string;
  provider: "woocommerce";
  providerCustomerId: string;
  email: string;
  firstName: string;
  lastName: string;
  username: string;
  ordersCount: number;
  totalSpent: number;
  createdAt: string;
  modelVersion: "2026-05-16";
  raw: Record<string, unknown>;
};

export function normalizeCustomerAction(c: Record<string, unknown>): NormalizedCustomerAction {
  return {
    id: `wc-customer:${propStr(c, "id")}`,
    provider: "woocommerce",
    providerCustomerId: propStr(c, "id"),
    email: prop(c, "email"),
    firstName: prop(c, "first_name"),
    lastName: prop(c, "last_name"),
    username: prop(c, "username"),
    ordersCount: propNum(c, "orders_count"),
    totalSpent: propNum(c, "total_spent"),
    createdAt: prop(c, "date_created"),
    modelVersion: "2026-05-16",
    raw: c,
  };
}

// ─── Input types ──────────────────────────────────────────────────────────────

export type CreateCustomerInput = {
  consumerKey: string;
  consumerSecret: string;
  siteUrl: string;
  email: string;
  first_name?: string;
  last_name?: string;
  username?: string;
  password?: string;
  billing?: Record<string, unknown>;
  shipping?: Record<string, unknown>;
};

export type GetCustomerInput = {
  consumerKey: string;
  consumerSecret: string;
  siteUrl: string;
  customerId: number;
};

export type UpdateCustomerInput = {
  consumerKey: string;
  consumerSecret: string;
  siteUrl: string;
  customerId: number;
  email?: string;
  first_name?: string;
  last_name?: string;
  billing?: Record<string, unknown>;
  shipping?: Record<string, unknown>;
};

// ─── Validators ───────────────────────────────────────────────────────────────

export function validateCreateCustomerInput(input: unknown): CreateCustomerInput {
  if (!isRecord(input)) throw new Error("customers.create input must be an object");
  if (typeof input.email !== "string" || input.email.length === 0) throw new Error("email is required");
  return {
    consumerKey: typeof input.consumerKey === "string" ? input.consumerKey : "",
    consumerSecret: typeof input.consumerSecret === "string" ? input.consumerSecret : "",
    siteUrl: typeof input.siteUrl === "string" ? input.siteUrl : "",
    email: input.email,
    first_name: typeof input.first_name === "string" ? input.first_name : undefined,
    last_name: typeof input.last_name === "string" ? input.last_name : undefined,
    username: typeof input.username === "string" ? input.username : undefined,
    password: typeof input.password === "string" ? input.password : undefined,
    billing: isRecord(input.billing) ? input.billing : undefined,
    shipping: isRecord(input.shipping) ? input.shipping : undefined,
  };
}

export function validateGetCustomerInput(input: unknown): GetCustomerInput {
  if (!isRecord(input)) throw new Error("customers.get input must be an object");
  if (typeof input.customerId !== "number") throw new Error("customerId must be a number");
  return {
    consumerKey: typeof input.consumerKey === "string" ? input.consumerKey : "",
    consumerSecret: typeof input.consumerSecret === "string" ? input.consumerSecret : "",
    siteUrl: typeof input.siteUrl === "string" ? input.siteUrl : "",
    customerId: input.customerId,
  };
}

export function validateUpdateCustomerInput(input: unknown): UpdateCustomerInput {
  if (!isRecord(input)) throw new Error("customers.update input must be an object");
  if (typeof input.customerId !== "number") throw new Error("customerId must be a number");
  return {
    consumerKey: typeof input.consumerKey === "string" ? input.consumerKey : "",
    consumerSecret: typeof input.consumerSecret === "string" ? input.consumerSecret : "",
    siteUrl: typeof input.siteUrl === "string" ? input.siteUrl : "",
    customerId: input.customerId,
    email: typeof input.email === "string" ? input.email : undefined,
    first_name: typeof input.first_name === "string" ? input.first_name : undefined,
    last_name: typeof input.last_name === "string" ? input.last_name : undefined,
    billing: isRecord(input.billing) ? input.billing : undefined,
    shipping: isRecord(input.shipping) ? input.shipping : undefined,
  };
}

// ─── Client ───────────────────────────────────────────────────────────────────

export function createCustomersClient(options: { consumerKey: string; consumerSecret: string; siteUrl: string; fetch?: typeof fetch }) {
  const client = createWooCommerceClient({ consumerKey: options.consumerKey, consumerSecret: options.consumerSecret, siteUrl: options.siteUrl, fetch: options.fetch, operation: "customers.create" });

  return {
    async create(input: unknown) {
      const payload = validateCreateCustomerInput(input);
      const body: Record<string, unknown> = { email: payload.email };
      if (payload.first_name !== undefined) body.first_name = payload.first_name;
      if (payload.last_name !== undefined) body.last_name = payload.last_name;
      if (payload.username !== undefined) body.username = payload.username;
      if (payload.password !== undefined) body.password = payload.password;
      if (payload.billing !== undefined) body.billing = payload.billing;
      if (payload.shipping !== undefined) body.shipping = payload.shipping;
      const response = await client.fetchJSON("/customers", { method: "POST", body: JSON.stringify(body) });
      if (response.status === 201) {
        return { ok: true as const, customer: normalizeCustomerAction(response.body as Record<string, unknown>) };
      }
      const rateLimit = parseWooCommerceRateLimit(response.status, response.headers);
      if (rateLimit.limited) {
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED" as const, message: "WooCommerce rate limit exceeded.", retryAfterSeconds: rateLimit.retryAfterSeconds } };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: `WooCommerce rejected customers.create (status ${response.status}).` } };
    },

    async get(input: unknown) {
      const payload = validateGetCustomerInput(input);
      const response = await client.fetchJSON(`/customers/${payload.customerId}`);
      if (response.status === 200) {
        return { ok: true as const, customer: normalizeCustomerAction(response.body as Record<string, unknown>) };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: "Customer not found." } };
      }
      const rateLimit = parseWooCommerceRateLimit(response.status, response.headers);
      if (rateLimit.limited) {
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED" as const, message: "WooCommerce rate limit exceeded.", retryAfterSeconds: rateLimit.retryAfterSeconds } };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: `WooCommerce rejected customers.get (status ${response.status}).` } };
    },

    async update(input: unknown) {
      const payload = validateUpdateCustomerInput(input);
      const body: Record<string, unknown> = {};
      if (payload.email !== undefined) body.email = payload.email;
      if (payload.first_name !== undefined) body.first_name = payload.first_name;
      if (payload.last_name !== undefined) body.last_name = payload.last_name;
      if (payload.billing !== undefined) body.billing = payload.billing;
      if (payload.shipping !== undefined) body.shipping = payload.shipping;
      const response = await client.fetchJSON(`/customers/${payload.customerId}`, { method: "PUT", body: JSON.stringify(body) });
      if (response.status === 200) {
        return { ok: true as const, customer: normalizeCustomerAction(response.body as Record<string, unknown>) };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: "Customer not found." } };
      }
      const rateLimit = parseWooCommerceRateLimit(response.status, response.headers);
      if (rateLimit.limited) {
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED" as const, message: "WooCommerce rate limit exceeded.", retryAfterSeconds: rateLimit.retryAfterSeconds } };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: `WooCommerce rejected customers.update (status ${response.status}).` } };
    },
  };
}
