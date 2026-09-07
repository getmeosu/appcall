import { parseProductsResponse } from "./objects"; import type { NormalizedProduct } from "./objects";
import { parseOrdersResponse } from "./objects"; import type { NormalizedOrder } from "./objects";
import { parseCustomersResponse } from "./objects"; import type { NormalizedCustomer } from "./objects";

export type ProductsListSyncInput = { response: unknown };
export type ProductsListSyncResult = { provider: "shopify"; operation: "products.list"; items: NormalizedProduct[] };
export function executeProductsListSync(input: ProductsListSyncInput): ProductsListSyncResult { return { provider: "shopify", operation: "products.list", items: parseProductsResponse(input.response).products }; }

export type OrdersListSyncInput = { response: unknown };
export type OrdersListSyncResult = { provider: "shopify"; operation: "orders.list"; items: NormalizedOrder[] };
export function executeOrdersListSync(input: OrdersListSyncInput): OrdersListSyncResult { return { provider: "shopify", operation: "orders.list", items: parseOrdersResponse(input.response).orders }; }

export type CustomersListSyncInput = { response: unknown };
export type CustomersListSyncResult = { provider: "shopify"; operation: "customers.list"; items: NormalizedCustomer[] };
export function executeCustomersListSync(input: CustomersListSyncInput): CustomersListSyncResult { return { provider: "shopify", operation: "customers.list", items: parseCustomersResponse(input.response).customers }; }
