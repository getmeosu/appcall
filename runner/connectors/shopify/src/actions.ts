import { createProductsClient, validateGetProductInput, validateCreateProductInput, validateUpdateProductInput, validateDeleteProductInput } from "./products";
import { createOrdersClient, validateGetOrderInput, validateUpdateOrderInput, validateCloseOrderInput, validateCancelOrderInput } from "./orders";
import { createCustomersClient, validateGetCustomerInput, validateCreateCustomerInput, validateUpdateCustomerInput } from "./customers";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getFetch(input: Record<string, unknown>): typeof fetch | undefined {
  return typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
}

function throwOnError(result: { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } }): never {
  throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
}

// ─── products.get ─────────────────────────────────────────────────────────────

export function getProduct(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string" && typeof input.shopDomain === "string") {
    return createProductsClient({ accessToken: input.accessToken, shopDomain: input.shopDomain, fetch: getFetch(input) })
      .get(input).then((result) => {
        if (!result.ok) throwOnError(result);
        return { connector: "shopify", action: "products.get", source: "connector", product: result.product };
      });
  }
  return { connector: "shopify", action: "products.get", source: "connector", validated: validateGetProductInput(input) };
}

// ─── products.create ──────────────────────────────────────────────────────────

export function createProduct(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string" && typeof input.shopDomain === "string") {
    return createProductsClient({ accessToken: input.accessToken, shopDomain: input.shopDomain, fetch: getFetch(input) })
      .create(input).then((result) => {
        if (!result.ok) throwOnError(result);
        return { connector: "shopify", action: "products.create", source: "connector", product: result.product };
      });
  }
  return { connector: "shopify", action: "products.create", source: "connector", validated: validateCreateProductInput(input) };
}

// ─── products.update ──────────────────────────────────────────────────────────

export function updateProduct(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string" && typeof input.shopDomain === "string") {
    return createProductsClient({ accessToken: input.accessToken, shopDomain: input.shopDomain, fetch: getFetch(input) })
      .update(input).then((result) => {
        if (!result.ok) throwOnError(result);
        return { connector: "shopify", action: "products.update", source: "connector", product: result.product };
      });
  }
  return { connector: "shopify", action: "products.update", source: "connector", validated: validateUpdateProductInput(input) };
}

// ─── products.delete ──────────────────────────────────────────────────────────

export function deleteProduct(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string" && typeof input.shopDomain === "string") {
    return createProductsClient({ accessToken: input.accessToken, shopDomain: input.shopDomain, fetch: getFetch(input) })
      .delete(input).then((result) => {
        if (!result.ok) throwOnError(result);
        return { connector: "shopify", action: "products.delete", source: "connector", deleted: true };
      });
  }
  return { connector: "shopify", action: "products.delete", source: "connector", validated: validateDeleteProductInput(input) };
}

// ─── orders.get ───────────────────────────────────────────────────────────────

export function getOrder(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string" && typeof input.shopDomain === "string") {
    return createOrdersClient({ accessToken: input.accessToken, shopDomain: input.shopDomain, fetch: getFetch(input) })
      .get(input).then((result) => {
        if (!result.ok) throwOnError(result);
        return { connector: "shopify", action: "orders.get", source: "connector", order: result.order };
      });
  }
  return { connector: "shopify", action: "orders.get", source: "connector", validated: validateGetOrderInput(input) };
}

// ─── orders.update ────────────────────────────────────────────────────────────

export function updateOrder(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string" && typeof input.shopDomain === "string") {
    return createOrdersClient({ accessToken: input.accessToken, shopDomain: input.shopDomain, fetch: getFetch(input) })
      .update(input).then((result) => {
        if (!result.ok) throwOnError(result);
        return { connector: "shopify", action: "orders.update", source: "connector", order: result.order };
      });
  }
  return { connector: "shopify", action: "orders.update", source: "connector", validated: validateUpdateOrderInput(input) };
}

// ─── orders.close ─────────────────────────────────────────────────────────────

export function closeOrder(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string" && typeof input.shopDomain === "string") {
    return createOrdersClient({ accessToken: input.accessToken, shopDomain: input.shopDomain, fetch: getFetch(input) })
      .close(input).then((result) => {
        if (!result.ok) throwOnError(result);
        return { connector: "shopify", action: "orders.close", source: "connector", order: result.order };
      });
  }
  return { connector: "shopify", action: "orders.close", source: "connector", validated: validateCloseOrderInput(input) };
}

// ─── orders.cancel ────────────────────────────────────────────────────────────

export function cancelOrder(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string" && typeof input.shopDomain === "string") {
    return createOrdersClient({ accessToken: input.accessToken, shopDomain: input.shopDomain, fetch: getFetch(input) })
      .cancel(input).then((result) => {
        if (!result.ok) throwOnError(result);
        return { connector: "shopify", action: "orders.cancel", source: "connector", order: result.order };
      });
  }
  return { connector: "shopify", action: "orders.cancel", source: "connector", validated: validateCancelOrderInput(input) };
}

// ─── customers.get ────────────────────────────────────────────────────────────

export function getCustomer(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string" && typeof input.shopDomain === "string") {
    return createCustomersClient({ accessToken: input.accessToken, shopDomain: input.shopDomain, fetch: getFetch(input) })
      .get(input).then((result) => {
        if (!result.ok) throwOnError(result);
        return { connector: "shopify", action: "customers.get", source: "connector", customer: result.customer };
      });
  }
  return { connector: "shopify", action: "customers.get", source: "connector", validated: validateGetCustomerInput(input) };
}

// ─── customers.create ─────────────────────────────────────────────────────────

export function createCustomer(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string" && typeof input.shopDomain === "string") {
    return createCustomersClient({ accessToken: input.accessToken, shopDomain: input.shopDomain, fetch: getFetch(input) })
      .create(input).then((result) => {
        if (!result.ok) throwOnError(result);
        return { connector: "shopify", action: "customers.create", source: "connector", customer: result.customer };
      });
  }
  return { connector: "shopify", action: "customers.create", source: "connector", validated: validateCreateCustomerInput(input) };
}

// ─── customers.update ─────────────────────────────────────────────────────────

export function updateCustomer(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string" && typeof input.shopDomain === "string") {
    return createCustomersClient({ accessToken: input.accessToken, shopDomain: input.shopDomain, fetch: getFetch(input) })
      .update(input).then((result) => {
        if (!result.ok) throwOnError(result);
        return { connector: "shopify", action: "customers.update", source: "connector", customer: result.customer };
      });
  }
  return { connector: "shopify", action: "customers.update", source: "connector", validated: validateUpdateCustomerInput(input) };
}
