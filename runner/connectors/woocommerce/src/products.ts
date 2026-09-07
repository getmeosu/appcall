import { createWooCommerceClient, parseWooCommerceRateLimit, prop, propStr, propNum, isRecord } from "./http";

// ─── Normalized type ──────────────────────────────────────────────────────────

export type NormalizedProductAction = {
  id: string;
  provider: "woocommerce";
  providerProductId: string;
  name: string;
  slug: string;
  status: string;
  type: string;
  price: number;
  salePrice: number;
  regularPrice: number;
  stockQuantity: number;
  sku: string;
  description: string;
  shortDescription: string;
  createdAt: string;
  modelVersion: "2026-05-16";
  raw: Record<string, unknown>;
};

export function normalizeProductAction(p: Record<string, unknown>): NormalizedProductAction {
  return {
    id: `wc-product:${propStr(p, "id")}`,
    provider: "woocommerce",
    providerProductId: propStr(p, "id"),
    name: prop(p, "name"),
    slug: prop(p, "slug"),
    status: prop(p, "status"),
    type: prop(p, "type"),
    price: propNum(p, "price"),
    salePrice: propNum(p, "sale_price"),
    regularPrice: propNum(p, "regular_price"),
    stockQuantity: propNum(p, "stock_quantity"),
    sku: prop(p, "sku"),
    description: prop(p, "description"),
    shortDescription: prop(p, "short_description"),
    createdAt: prop(p, "date_created"),
    modelVersion: "2026-05-16",
    raw: p,
  };
}

// ─── Input types ──────────────────────────────────────────────────────────────

export type CreateProductInput = {
  consumerKey: string;
  consumerSecret: string;
  siteUrl: string;
  name: string;
  type?: string;
  status?: string;
  regular_price?: string;
  sale_price?: string;
  sku?: string;
  description?: string;
  short_description?: string;
  manage_stock?: boolean;
  stock_quantity?: number;
};

export type GetProductInput = {
  consumerKey: string;
  consumerSecret: string;
  siteUrl: string;
  productId: number;
};

export type UpdateProductInput = {
  consumerKey: string;
  consumerSecret: string;
  siteUrl: string;
  productId: number;
  name?: string;
  status?: string;
  regular_price?: string;
  sale_price?: string;
  sku?: string;
  description?: string;
  stock_quantity?: number;
};

export type DeleteProductInput = {
  consumerKey: string;
  consumerSecret: string;
  siteUrl: string;
  productId: number;
  force?: boolean;
};

// ─── Validators ───────────────────────────────────────────────────────────────

export function validateCreateProductInput(input: unknown): CreateProductInput {
  if (!isRecord(input)) throw new Error("products.create input must be an object");
  if (typeof input.name !== "string" || input.name.length === 0) throw new Error("name is required");
  return {
    consumerKey: typeof input.consumerKey === "string" ? input.consumerKey : "",
    consumerSecret: typeof input.consumerSecret === "string" ? input.consumerSecret : "",
    siteUrl: typeof input.siteUrl === "string" ? input.siteUrl : "",
    name: input.name,
    type: typeof input.type === "string" ? input.type : undefined,
    status: typeof input.status === "string" ? input.status : undefined,
    regular_price: typeof input.regular_price === "string" ? input.regular_price : undefined,
    sale_price: typeof input.sale_price === "string" ? input.sale_price : undefined,
    sku: typeof input.sku === "string" ? input.sku : undefined,
    description: typeof input.description === "string" ? input.description : undefined,
    short_description: typeof input.short_description === "string" ? input.short_description : undefined,
    manage_stock: typeof input.manage_stock === "boolean" ? input.manage_stock : undefined,
    stock_quantity: typeof input.stock_quantity === "number" ? input.stock_quantity : undefined,
  };
}

export function validateGetProductInput(input: unknown): GetProductInput {
  if (!isRecord(input)) throw new Error("products.get input must be an object");
  if (typeof input.productId !== "number") throw new Error("productId must be a number");
  return {
    consumerKey: typeof input.consumerKey === "string" ? input.consumerKey : "",
    consumerSecret: typeof input.consumerSecret === "string" ? input.consumerSecret : "",
    siteUrl: typeof input.siteUrl === "string" ? input.siteUrl : "",
    productId: input.productId,
  };
}

export function validateUpdateProductInput(input: unknown): UpdateProductInput {
  if (!isRecord(input)) throw new Error("products.update input must be an object");
  if (typeof input.productId !== "number") throw new Error("productId must be a number");
  return {
    consumerKey: typeof input.consumerKey === "string" ? input.consumerKey : "",
    consumerSecret: typeof input.consumerSecret === "string" ? input.consumerSecret : "",
    siteUrl: typeof input.siteUrl === "string" ? input.siteUrl : "",
    productId: input.productId,
    name: typeof input.name === "string" ? input.name : undefined,
    status: typeof input.status === "string" ? input.status : undefined,
    regular_price: typeof input.regular_price === "string" ? input.regular_price : undefined,
    sale_price: typeof input.sale_price === "string" ? input.sale_price : undefined,
    sku: typeof input.sku === "string" ? input.sku : undefined,
    description: typeof input.description === "string" ? input.description : undefined,
    stock_quantity: typeof input.stock_quantity === "number" ? input.stock_quantity : undefined,
  };
}

export function validateDeleteProductInput(input: unknown): DeleteProductInput {
  if (!isRecord(input)) throw new Error("products.delete input must be an object");
  if (typeof input.productId !== "number") throw new Error("productId must be a number");
  return {
    consumerKey: typeof input.consumerKey === "string" ? input.consumerKey : "",
    consumerSecret: typeof input.consumerSecret === "string" ? input.consumerSecret : "",
    siteUrl: typeof input.siteUrl === "string" ? input.siteUrl : "",
    productId: input.productId,
    force: typeof input.force === "boolean" ? input.force : undefined,
  };
}

// ─── Client ───────────────────────────────────────────────────────────────────

export function createProductsClient(options: { consumerKey: string; consumerSecret: string; siteUrl: string; fetch?: typeof fetch }) {
  const client = createWooCommerceClient({ consumerKey: options.consumerKey, consumerSecret: options.consumerSecret, siteUrl: options.siteUrl, fetch: options.fetch, operation: "products.create" });

  return {
    async create(input: unknown) {
      const payload = validateCreateProductInput(input);
      const body: Record<string, unknown> = { name: payload.name };
      if (payload.type !== undefined) body.type = payload.type;
      if (payload.status !== undefined) body.status = payload.status;
      if (payload.regular_price !== undefined) body.regular_price = payload.regular_price;
      if (payload.sale_price !== undefined) body.sale_price = payload.sale_price;
      if (payload.sku !== undefined) body.sku = payload.sku;
      if (payload.description !== undefined) body.description = payload.description;
      if (payload.short_description !== undefined) body.short_description = payload.short_description;
      if (payload.manage_stock !== undefined) body.manage_stock = payload.manage_stock;
      if (payload.stock_quantity !== undefined) body.stock_quantity = payload.stock_quantity;
      const response = await client.fetchJSON("/products", { method: "POST", body: JSON.stringify(body) });
      if (response.status === 201) {
        return { ok: true as const, product: normalizeProductAction(response.body as Record<string, unknown>) };
      }
      const rateLimit = parseWooCommerceRateLimit(response.status, response.headers);
      if (rateLimit.limited) {
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED" as const, message: "WooCommerce rate limit exceeded.", retryAfterSeconds: rateLimit.retryAfterSeconds } };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: `WooCommerce rejected products.create (status ${response.status}).` } };
    },

    async get(input: unknown) {
      const payload = validateGetProductInput(input);
      const response = await client.fetchJSON(`/products/${payload.productId}`);
      if (response.status === 200) {
        return { ok: true as const, product: normalizeProductAction(response.body as Record<string, unknown>) };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: "Product not found." } };
      }
      const rateLimit = parseWooCommerceRateLimit(response.status, response.headers);
      if (rateLimit.limited) {
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED" as const, message: "WooCommerce rate limit exceeded.", retryAfterSeconds: rateLimit.retryAfterSeconds } };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: `WooCommerce rejected products.get (status ${response.status}).` } };
    },

    async update(input: unknown) {
      const payload = validateUpdateProductInput(input);
      const body: Record<string, unknown> = {};
      if (payload.name !== undefined) body.name = payload.name;
      if (payload.status !== undefined) body.status = payload.status;
      if (payload.regular_price !== undefined) body.regular_price = payload.regular_price;
      if (payload.sale_price !== undefined) body.sale_price = payload.sale_price;
      if (payload.sku !== undefined) body.sku = payload.sku;
      if (payload.description !== undefined) body.description = payload.description;
      if (payload.stock_quantity !== undefined) body.stock_quantity = payload.stock_quantity;
      const response = await client.fetchJSON(`/products/${payload.productId}`, { method: "PUT", body: JSON.stringify(body) });
      if (response.status === 200) {
        return { ok: true as const, product: normalizeProductAction(response.body as Record<string, unknown>) };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: "Product not found." } };
      }
      const rateLimit = parseWooCommerceRateLimit(response.status, response.headers);
      if (rateLimit.limited) {
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED" as const, message: "WooCommerce rate limit exceeded.", retryAfterSeconds: rateLimit.retryAfterSeconds } };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: `WooCommerce rejected products.update (status ${response.status}).` } };
    },

    async delete(input: unknown) {
      const payload = validateDeleteProductInput(input);
      const qs = payload.force ? "?force=true" : "";
      const response = await client.fetchJSON(`/products/${payload.productId}${qs}`, { method: "DELETE" });
      if (response.status === 200) {
        return { ok: true as const, deleted: true, productId: payload.productId };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: "Product not found." } };
      }
      const rateLimit = parseWooCommerceRateLimit(response.status, response.headers);
      if (rateLimit.limited) {
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED" as const, message: "WooCommerce rate limit exceeded.", retryAfterSeconds: rateLimit.retryAfterSeconds } };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR" as const, message: `WooCommerce rejected products.delete (status ${response.status}).` } };
    },
  };
}
