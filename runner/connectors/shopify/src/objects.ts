import { prop, propNum, isRecord } from "./http";

export type NormalizedProduct = {
  id: string; provider: "shopify"; providerProductId: number;
  title: string; handle: string; status: string;
  productType: string; vendor: string;
  variantsCount: number;
  createdAt: string; updatedAt: string;
  modelVersion: "2026-05-17"; raw: Record<string, unknown>;
};

export function normalizeProduct(p: Record<string, unknown>): NormalizedProduct {
  const variants = Array.isArray(p.variants) ? p.variants : [];
  return {
    id: `sp-product:${propNum(p, "id")}`, provider: "shopify", providerProductId: propNum(p, "id"),
    title: prop(p, "title"), handle: prop(p, "handle"), status: prop(p, "status"),
    productType: prop(p, "product_type"), vendor: prop(p, "vendor"),
    variantsCount: variants.length,
    createdAt: prop(p, "created_at"), updatedAt: prop(p, "updated_at"),
    modelVersion: "2026-05-17", raw: p,
  };
}

export function parseProductsResponse(response: unknown): { products: NormalizedProduct[] } {
  if (!isRecord(response)) return { products: [] };
  const products = response.products;
  if (!Array.isArray(products)) return { products: [] };
  return { products: products.filter(isRecord).map(normalizeProduct) };
}

export type NormalizedOrder = {
  id: string; provider: "shopify"; providerOrderId: number;
  orderNumber: number; email: string;
  total: string; currency: string; status: string;
  createdAt: string;
  modelVersion: "2026-05-17"; raw: Record<string, unknown>;
};

export function normalizeOrder(o: Record<string, unknown>): NormalizedOrder {
  return {
    id: `sp-order:${propNum(o, "id")}`, provider: "shopify", providerOrderId: propNum(o, "id"),
    orderNumber: propNum(o, "order_number"), email: prop(o, "email"),
    total: prop(o, "total_price"), currency: prop(o, "currency"), status: prop(o, "financial_status"),
    createdAt: prop(o, "created_at"),
    modelVersion: "2026-05-17", raw: o,
  };
}

export function parseOrdersResponse(response: unknown): { orders: NormalizedOrder[] } {
  if (!isRecord(response)) return { orders: [] };
  const orders = response.orders;
  if (!Array.isArray(orders)) return { orders: [] };
  return { orders: orders.filter(isRecord).map(normalizeOrder) };
}

export type NormalizedCustomer = {
  id: string; provider: "shopify"; providerCustomerId: number;
  email: string; firstName: string; lastName: string;
  ordersCount: number;
  createdAt: string;
  modelVersion: "2026-05-17"; raw: Record<string, unknown>;
};

export function normalizeCustomer(c: Record<string, unknown>): NormalizedCustomer {
  return {
    id: `sp-customer:${propNum(c, "id")}`, provider: "shopify", providerCustomerId: propNum(c, "id"),
    email: prop(c, "email"), firstName: prop(c, "first_name"), lastName: prop(c, "last_name"),
    ordersCount: propNum(c, "orders_count"),
    createdAt: prop(c, "created_at"),
    modelVersion: "2026-05-17", raw: c,
  };
}

export function parseCustomersResponse(response: unknown): { customers: NormalizedCustomer[] } {
  if (!isRecord(response)) return { customers: [] };
  const customers = response.customers;
  if (!Array.isArray(customers)) return { customers: [] };
  return { customers: customers.filter(isRecord).map(normalizeCustomer) };
}

export function extractNextPageToken(headers: Record<string, string>): string | null {
  const link = headers["link"] ?? headers["Link"] ?? "";
  const match = link.match(/<[^>]*[?&]page_info=([^&>]+)/);
  return match ? match[1] : null;
}
