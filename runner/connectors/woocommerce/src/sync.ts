import { parseProductsResponse } from "./objects"; import type { NormalizedProduct } from "./objects";
import { parseOrdersResponse } from "./objects"; import type { NormalizedOrder } from "./objects";
import { parseCustomersResponse } from "./objects"; import type { NormalizedCustomer } from "./objects";

export type ProductsListSyncInput = { response: unknown; headers?: Record<string, string> };
export type ProductsListSyncResult = { provider: "woocommerce"; operation: "products.list"; items: NormalizedProduct[]; totalPages: number };
export function executeProductsListSync(input: ProductsListSyncInput): ProductsListSyncResult { const p = parseProductsResponse(input.response, input.headers ?? {}); return { provider: "woocommerce", operation: "products.list", items: p.products, totalPages: p.totalPages }; }

export type OrdersListSyncInput = { response: unknown; headers?: Record<string, string> };
export type OrdersListSyncResult = { provider: "woocommerce"; operation: "orders.list"; items: NormalizedOrder[]; totalPages: number };
export function executeOrdersListSync(input: OrdersListSyncInput): OrdersListSyncResult { const p = parseOrdersResponse(input.response, input.headers ?? {}); return { provider: "woocommerce", operation: "orders.list", items: p.orders, totalPages: p.totalPages }; }

export type CustomersListSyncInput = { response: unknown; headers?: Record<string, string> };
export type CustomersListSyncResult = { provider: "woocommerce"; operation: "customers.list"; items: NormalizedCustomer[]; totalPages: number };
export function executeCustomersListSync(input: CustomersListSyncInput): CustomersListSyncResult { const p = parseCustomersResponse(input.response, input.headers ?? {}); return { provider: "woocommerce", operation: "customers.list", items: p.customers, totalPages: p.totalPages }; }
