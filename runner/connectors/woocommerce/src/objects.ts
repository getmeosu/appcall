import { prop, propStr, propNum, isRecord } from "./http";

export type NormalizedProduct = {
  id: string; provider: "woocommerce"; providerProductId: string;
  name: string; slug: string; status: string; type: string;
  price: number; salePrice: number; stockQuantity: number; sku: string;
  createdAt: string;
  modelVersion: "2026-05-16"; raw: Record<string, unknown>;
};
export function normalizeProduct(p: Record<string, unknown>): NormalizedProduct {
  return {
    id: `wc-product:${propStr(p, "id")}`, provider: "woocommerce", providerProductId: propStr(p, "id"),
    name: prop(p, "name"), slug: prop(p, "slug"), status: prop(p, "status"), type: prop(p, "type"),
    price: propNum(p, "price"), salePrice: propNum(p, "sale_price"), stockQuantity: propNum(p, "stock_quantity"), sku: prop(p, "sku"),
    createdAt: prop(p, "date_created"),
    modelVersion: "2026-05-16", raw: p,
  };
}
export function parseProductsResponse(response: unknown, headers: Record<string, string> = {}): { products: NormalizedProduct[]; totalPages: number } {
  const items = Array.isArray(response) ? response.filter(isRecord) : [];
  const totalPages = Number(headers["x-wp-totalpages"] ?? "1") || 1;
  return { products: items.map(normalizeProduct), totalPages };
}

export type NormalizedOrder = {
  id: string; provider: "woocommerce"; providerOrderId: string;
  number: string; status: string; total: number; currency: string;
  billingEmail: string; billingFirstName: string; billingLastName: string;
  createdAt: string;
  modelVersion: "2026-05-16"; raw: Record<string, unknown>;
};
export function normalizeOrder(o: Record<string, unknown>): NormalizedOrder {
  const billing = isRecord(o.billing) ? o.billing : {};
  return {
    id: `wc-order:${propStr(o, "id")}`, provider: "woocommerce", providerOrderId: propStr(o, "id"),
    number: prop(o, "number"), status: prop(o, "status"), total: propNum(o, "total"), currency: prop(o, "currency"),
    billingEmail: prop(billing, "email"), billingFirstName: prop(billing, "first_name"), billingLastName: prop(billing, "last_name"),
    createdAt: prop(o, "date_created"),
    modelVersion: "2026-05-16", raw: o,
  };
}
export function parseOrdersResponse(response: unknown, headers: Record<string, string> = {}): { orders: NormalizedOrder[]; totalPages: number } {
  const items = Array.isArray(response) ? response.filter(isRecord) : [];
  const totalPages = Number(headers["x-wp-totalpages"] ?? "1") || 1;
  return { orders: items.map(normalizeOrder), totalPages };
}

export type NormalizedCustomer = {
  id: string; provider: "woocommerce"; providerCustomerId: string;
  email: string; firstName: string; lastName: string; username: string;
  ordersCount: number; totalSpent: number;
  createdAt: string;
  modelVersion: "2026-05-16"; raw: Record<string, unknown>;
};
export function normalizeCustomer(c: Record<string, unknown>): NormalizedCustomer {
  return {
    id: `wc-customer:${propStr(c, "id")}`, provider: "woocommerce", providerCustomerId: propStr(c, "id"),
    email: prop(c, "email"), firstName: prop(c, "first_name"), lastName: prop(c, "last_name"), username: prop(c, "username"),
    ordersCount: propNum(c, "orders_count"), totalSpent: propNum(c, "total_spent"),
    createdAt: prop(c, "date_created"),
    modelVersion: "2026-05-16", raw: c,
  };
}
export function parseCustomersResponse(response: unknown, headers: Record<string, string> = {}): { customers: NormalizedCustomer[]; totalPages: number } {
  const items = Array.isArray(response) ? response.filter(isRecord) : [];
  const totalPages = Number(headers["x-wp-totalpages"] ?? "1") || 1;
  return { customers: items.map(normalizeCustomer), totalPages };
}
