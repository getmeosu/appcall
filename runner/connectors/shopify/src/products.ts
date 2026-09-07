import { createShopifyClient, parseShopifyRateLimit, isRecord, prop, propNum } from "./http";
import { normalizeProduct } from "./objects";
import type { NormalizedProduct } from "./objects";

// ─── Shared helpers ────────────────────────────────────────────────────────────

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

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

// ─── products.get ─────────────────────────────────────────────────────────────

export type GetProductInput = { accessToken: string; shopDomain: string; productId: number };

export function validateGetProductInput(input: unknown): Omit<GetProductInput, "accessToken" | "shopDomain"> & { accessToken?: string; shopDomain?: string } {
  if (!isRecord(input)) throw new Error("get product input must be an object");
  return {
    accessToken: typeof input.accessToken === "string" ? input.accessToken : undefined,
    shopDomain: typeof input.shopDomain === "string" ? input.shopDomain : undefined,
    productId: requireNumber(input.productId, "productId"),
  };
}

// ─── products.create ──────────────────────────────────────────────────────────

export type CreateProductInput = { accessToken: string; shopDomain: string; title: string; productType?: string; vendor?: string; status?: string; bodyHtml?: string };

export function validateCreateProductInput(input: unknown): Omit<CreateProductInput, "accessToken" | "shopDomain"> & { accessToken?: string; shopDomain?: string } {
  if (!isRecord(input)) throw new Error("create product input must be an object");
  return {
    accessToken: typeof input.accessToken === "string" ? input.accessToken : undefined,
    shopDomain: typeof input.shopDomain === "string" ? input.shopDomain : undefined,
    title: requireString(input.title, "title"),
    productType: typeof input.productType === "string" ? input.productType : undefined,
    vendor: typeof input.vendor === "string" ? input.vendor : undefined,
    status: typeof input.status === "string" ? input.status : undefined,
    bodyHtml: typeof input.bodyHtml === "string" ? input.bodyHtml : undefined,
  };
}

// ─── products.update ──────────────────────────────────────────────────────────

export type UpdateProductInput = { accessToken: string; shopDomain: string; productId: number; title?: string; productType?: string; vendor?: string; status?: string; bodyHtml?: string };

export function validateUpdateProductInput(input: unknown): Omit<UpdateProductInput, "accessToken" | "shopDomain"> & { accessToken?: string; shopDomain?: string } {
  if (!isRecord(input)) throw new Error("update product input must be an object");
  return {
    accessToken: typeof input.accessToken === "string" ? input.accessToken : undefined,
    shopDomain: typeof input.shopDomain === "string" ? input.shopDomain : undefined,
    productId: requireNumber(input.productId, "productId"),
    title: typeof input.title === "string" ? input.title : undefined,
    productType: typeof input.productType === "string" ? input.productType : undefined,
    vendor: typeof input.vendor === "string" ? input.vendor : undefined,
    status: typeof input.status === "string" ? input.status : undefined,
    bodyHtml: typeof input.bodyHtml === "string" ? input.bodyHtml : undefined,
  };
}

// ─── products.delete ──────────────────────────────────────────────────────────

export type DeleteProductInput = { accessToken: string; shopDomain: string; productId: number };

export function validateDeleteProductInput(input: unknown): Omit<DeleteProductInput, "accessToken" | "shopDomain"> & { accessToken?: string; shopDomain?: string } {
  if (!isRecord(input)) throw new Error("delete product input must be an object");
  return {
    accessToken: typeof input.accessToken === "string" ? input.accessToken : undefined,
    shopDomain: typeof input.shopDomain === "string" ? input.shopDomain : undefined,
    productId: requireNumber(input.productId, "productId"),
  };
}

// ─── Client ───────────────────────────────────────────────────────────────────

export function createProductsClient(options: { accessToken: string; shopDomain: string; fetch?: typeof fetch }) {
  const client = createShopifyClient({ accessToken: options.accessToken, shopDomain: options.shopDomain, fetch: options.fetch, operation: "products.get" });

  return {
    async get(input: unknown) {
      const payload = validateGetProductInput(input);
      const response = await client.fetchJSON(`/products/${payload.productId}.json`);
      if (response.status === 200 && isRecord(response.body) && isRecord(response.body.product)) {
        return { ok: true as const, product: normalizeProduct(response.body.product as Record<string, unknown>) };
      }
      if (response.status === 404) return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Product not found." } };
      return mapError(response.status, response.headers, "Shopify rejected the get product request.");
    },

    async create(input: unknown) {
      const payload = validateCreateProductInput(input);
      const body: Record<string, unknown> = { title: payload.title };
      if (payload.productType !== undefined) body.product_type = payload.productType;
      if (payload.vendor !== undefined) body.vendor = payload.vendor;
      if (payload.status !== undefined) body.status = payload.status;
      if (payload.bodyHtml !== undefined) body.body_html = payload.bodyHtml;
      const response = await client.fetchJSON("/products.json", { method: "POST", body: JSON.stringify({ product: body }) });
      if (response.status === 201 && isRecord(response.body) && isRecord(response.body.product)) {
        return { ok: true as const, product: normalizeProduct(response.body.product as Record<string, unknown>) };
      }
      return mapError(response.status, response.headers, "Shopify rejected the create product request.");
    },

    async update(input: unknown) {
      const payload = validateUpdateProductInput(input);
      const body: Record<string, unknown> = {};
      if (payload.title !== undefined) body.title = payload.title;
      if (payload.productType !== undefined) body.product_type = payload.productType;
      if (payload.vendor !== undefined) body.vendor = payload.vendor;
      if (payload.status !== undefined) body.status = payload.status;
      if (payload.bodyHtml !== undefined) body.body_html = payload.bodyHtml;
      const response = await client.fetchJSON(`/products/${payload.productId}.json`, { method: "PUT", body: JSON.stringify({ product: body }) });
      if (response.status === 200 && isRecord(response.body) && isRecord(response.body.product)) {
        return { ok: true as const, product: normalizeProduct(response.body.product as Record<string, unknown>) };
      }
      if (response.status === 404) return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Product not found." } };
      return mapError(response.status, response.headers, "Shopify rejected the update product request.");
    },

    async delete(input: unknown) {
      const payload = validateDeleteProductInput(input);
      const response = await client.fetchJSON(`/products/${payload.productId}.json`, { method: "DELETE" });
      if (response.status === 200) return { ok: true as const, deleted: true };
      if (response.status === 404) return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Product not found." } };
      return mapError(response.status, response.headers, "Shopify rejected the delete product request.");
    },
  };
}
