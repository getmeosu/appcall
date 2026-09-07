import { createWooCommerceClient, parseWooCommerceRateLimit, prop, propStr, propNum, isRecord } from "./http";

// ─── Normalized type ──────────────────────────────────────────────────────────

export type NormalizedCoupon = {
  id: string;
  provider: "woocommerce";
  providerCouponId: string;
  code: string;
  discountType: string;
  amount: number;
  description: string;
  dateExpires: string;
  usageCount: number;
  usageLimit: number;
  createdAt: string;
  modelVersion: "2026-05-16";
  raw: Record<string, unknown>;
};

export function normalizeCoupon(c: Record<string, unknown>): NormalizedCoupon {
  return {
    id: `wc-coupon:${propStr(c, "id")}`,
    provider: "woocommerce",
    providerCouponId: propStr(c, "id"),
    code: prop(c, "code"),
    discountType: prop(c, "discount_type"),
    amount: propNum(c, "amount"),
    description: prop(c, "description"),
    dateExpires: prop(c, "date_expires"),
    usageCount: propNum(c, "usage_count"),
    usageLimit: propNum(c, "usage_limit"),
    createdAt: prop(c, "date_created"),
    modelVersion: "2026-05-16",
    raw: c,
  };
}

// ─── Input type ───────────────────────────────────────────────────────────────

export type CreateCouponInput = {
  consumerKey: string;
  consumerSecret: string;
  siteUrl: string;
  code: string;
  discount_type: string;
  amount: string;
  description?: string;
  date_expires?: string;
  usage_limit?: number;
  usage_limit_per_user?: number;
  individual_use?: boolean;
  free_shipping?: boolean;
};

// ─── Validator ────────────────────────────────────────────────────────────────

export function validateCreateCouponInput(input: unknown): CreateCouponInput {
  if (!isRecord(input)) throw new Error("coupons.create input must be an object");
  if (typeof input.code !== "string" || input.code.length === 0) throw new Error("code is required");
  if (typeof input.discount_type !== "string" || input.discount_type.length === 0) throw new Error("discount_type is required");
  if (typeof input.amount !== "string" || input.amount.length === 0) throw new Error("amount is required");
  return {
    consumerKey: typeof input.consumerKey === "string" ? input.consumerKey : "",
    consumerSecret: typeof input.consumerSecret === "string" ? input.consumerSecret : "",
    siteUrl: typeof input.siteUrl === "string" ? input.siteUrl : "",
    code: input.code,
    discount_type: input.discount_type,
    amount: input.amount,
    description: typeof input.description === "string" ? input.description : undefined,
    date_expires: typeof input.date_expires === "string" ? input.date_expires : undefined,
    usage_limit: typeof input.usage_limit === "number" ? input.usage_limit : undefined,
    usage_limit_per_user: typeof input.usage_limit_per_user === "number" ? input.usage_limit_per_user : undefined,
    individual_use: typeof input.individual_use === "boolean" ? input.individual_use : undefined,
    free_shipping: typeof input.free_shipping === "boolean" ? input.free_shipping : undefined,
  };
}

// ─── Client ───────────────────────────────────────────────────────────────────

export function createCouponsClient(options: { consumerKey: string; consumerSecret: string; siteUrl: string; fetch?: typeof fetch }) {
  const client = createWooCommerceClient({ consumerKey: options.consumerKey, consumerSecret: options.consumerSecret, siteUrl: options.siteUrl, fetch: options.fetch, operation: "coupons.create" });

  return {
    async create(input: unknown) {
      const payload = validateCreateCouponInput(input);
      const body: Record<string, unknown> = {
        code: payload.code,
        discount_type: payload.discount_type,
        amount: payload.amount,
      };
      if (payload.description !== undefined) body.description = payload.description;
      if (payload.date_expires !== undefined) body.date_expires = payload.date_expires;
      if (payload.usage_limit !== undefined) body.usage_limit = payload.usage_limit;
      if (payload.usage_limit_per_user !== undefined) body.usage_limit_per_user = payload.usage_limit_per_user;
      if (payload.individual_use !== undefined) body.individual_use = payload.individual_use;
      if (payload.free_shipping !== undefined) body.free_shipping = payload.free_shipping;
      const response = await client.fetchJSON("/coupons", { method: "POST", body: JSON.stringify(body) });
      if (response.status === 201) {
        return { ok: true as const, coupon: normalizeCoupon(response.body as Record<string, unknown>) };
      }
      const rateLimit = parseWooCommerceRateLimit(response.status, response.headers);
      if (rateLimit.limited) {
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED" as const, message: "WooCommerce rate limit exceeded.", retryAfterSeconds: rateLimit.retryAfterSeconds } };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: `WooCommerce rejected coupons.create (status ${response.status}).` } };
    },
  };
}
