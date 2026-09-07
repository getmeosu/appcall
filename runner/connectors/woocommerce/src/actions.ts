import { healthcheck } from "./healthcheck";
import {
  createProductsClient,
  validateCreateProductInput,
  validateGetProductInput,
  validateUpdateProductInput,
  validateDeleteProductInput,
} from "./products";
import {
  createOrdersClient,
  validateCreateOrderInput,
  validateGetOrderInput,
  validateUpdateOrderInput,
  validateDeleteOrderInput,
} from "./orders";
import {
  createCustomersClient,
  validateCreateCustomerInput,
  validateGetCustomerInput,
  validateUpdateCustomerInput,
} from "./customers";
import { createCouponsClient, validateCreateCouponInput } from "./coupons";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasWooAuth(input: unknown): input is Record<string, unknown> & { consumerKey: string; consumerSecret: string; siteUrl: string } {
  return (
    isRecord(input) &&
    typeof input.consumerKey === "string" &&
    typeof input.consumerSecret === "string" &&
    typeof input.siteUrl === "string"
  );
}

function wooClientOpts(input: Record<string, unknown> & { consumerKey: string; consumerSecret: string; siteUrl: string }) {
  return {
    consumerKey: input.consumerKey,
    consumerSecret: input.consumerSecret,
    siteUrl: input.siteUrl,
    fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
  };
}

function throwOnError(result: { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } }): never {
  throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
}

// ─── Healthcheck ──────────────────────────────────────────────────────────────

export function doHealthcheck(_input: unknown): Record<string, unknown> {
  return healthcheck();
}

// ─── products.create ─────────────────────────────────────────────────────────

export function createProduct(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (hasWooAuth(input)) {
    return createProductsClient(wooClientOpts(input)).create(input).then((result) => {
      if (!result.ok) throwOnError(result);
      return { connector: "woocommerce", action: "products.create", source: "connector", product: result.product };
    });
  }
  return { connector: "woocommerce", action: "products.create", source: "connector", validated: validateCreateProductInput(input) };
}

// ─── products.get ────────────────────────────────────────────────────────────

export function getProduct(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (hasWooAuth(input)) {
    return createProductsClient(wooClientOpts(input)).get(input).then((result) => {
      if (!result.ok) throwOnError(result);
      return { connector: "woocommerce", action: "products.get", source: "connector", product: result.product };
    });
  }
  return { connector: "woocommerce", action: "products.get", source: "connector", validated: validateGetProductInput(input) };
}

// ─── products.update ─────────────────────────────────────────────────────────

export function updateProduct(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (hasWooAuth(input)) {
    return createProductsClient(wooClientOpts(input)).update(input).then((result) => {
      if (!result.ok) throwOnError(result);
      return { connector: "woocommerce", action: "products.update", source: "connector", product: result.product };
    });
  }
  return { connector: "woocommerce", action: "products.update", source: "connector", validated: validateUpdateProductInput(input) };
}

// ─── products.delete ─────────────────────────────────────────────────────────

export function deleteProduct(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (hasWooAuth(input)) {
    return createProductsClient(wooClientOpts(input)).delete(input).then((result) => {
      if (!result.ok) throwOnError(result);
      return { connector: "woocommerce", action: "products.delete", source: "connector", deleted: result.deleted, productId: result.productId };
    });
  }
  return { connector: "woocommerce", action: "products.delete", source: "connector", validated: validateDeleteProductInput(input) };
}

// ─── orders.create ───────────────────────────────────────────────────────────

export function createOrder(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (hasWooAuth(input)) {
    return createOrdersClient(wooClientOpts(input)).create(input).then((result) => {
      if (!result.ok) throwOnError(result);
      return { connector: "woocommerce", action: "orders.create", source: "connector", order: result.order };
    });
  }
  return { connector: "woocommerce", action: "orders.create", source: "connector", validated: validateCreateOrderInput(input) };
}

// ─── orders.get ──────────────────────────────────────────────────────────────

export function getOrder(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (hasWooAuth(input)) {
    return createOrdersClient(wooClientOpts(input)).get(input).then((result) => {
      if (!result.ok) throwOnError(result);
      return { connector: "woocommerce", action: "orders.get", source: "connector", order: result.order };
    });
  }
  return { connector: "woocommerce", action: "orders.get", source: "connector", validated: validateGetOrderInput(input) };
}

// ─── orders.update ───────────────────────────────────────────────────────────

export function updateOrder(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (hasWooAuth(input)) {
    return createOrdersClient(wooClientOpts(input)).update(input).then((result) => {
      if (!result.ok) throwOnError(result);
      return { connector: "woocommerce", action: "orders.update", source: "connector", order: result.order };
    });
  }
  return { connector: "woocommerce", action: "orders.update", source: "connector", validated: validateUpdateOrderInput(input) };
}

// ─── orders.delete ───────────────────────────────────────────────────────────

export function deleteOrder(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (hasWooAuth(input)) {
    return createOrdersClient(wooClientOpts(input)).delete(input).then((result) => {
      if (!result.ok) throwOnError(result);
      return { connector: "woocommerce", action: "orders.delete", source: "connector", deleted: result.deleted, orderId: result.orderId };
    });
  }
  return { connector: "woocommerce", action: "orders.delete", source: "connector", validated: validateDeleteOrderInput(input) };
}

// ─── customers.create ────────────────────────────────────────────────────────

export function createCustomer(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (hasWooAuth(input)) {
    return createCustomersClient(wooClientOpts(input)).create(input).then((result) => {
      if (!result.ok) throwOnError(result);
      return { connector: "woocommerce", action: "customers.create", source: "connector", customer: result.customer };
    });
  }
  return { connector: "woocommerce", action: "customers.create", source: "connector", validated: validateCreateCustomerInput(input) };
}

// ─── customers.get ───────────────────────────────────────────────────────────

export function getCustomer(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (hasWooAuth(input)) {
    return createCustomersClient(wooClientOpts(input)).get(input).then((result) => {
      if (!result.ok) throwOnError(result);
      return { connector: "woocommerce", action: "customers.get", source: "connector", customer: result.customer };
    });
  }
  return { connector: "woocommerce", action: "customers.get", source: "connector", validated: validateGetCustomerInput(input) };
}

// ─── customers.update ────────────────────────────────────────────────────────

export function updateCustomer(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (hasWooAuth(input)) {
    return createCustomersClient(wooClientOpts(input)).update(input).then((result) => {
      if (!result.ok) throwOnError(result);
      return { connector: "woocommerce", action: "customers.update", source: "connector", customer: result.customer };
    });
  }
  return { connector: "woocommerce", action: "customers.update", source: "connector", validated: validateUpdateCustomerInput(input) };
}

// ─── coupons.create ──────────────────────────────────────────────────────────

export function createCoupon(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (hasWooAuth(input)) {
    return createCouponsClient(wooClientOpts(input)).create(input).then((result) => {
      if (!result.ok) throwOnError(result);
      return { connector: "woocommerce", action: "coupons.create", source: "connector", coupon: result.coupon };
    });
  }
  return { connector: "woocommerce", action: "coupons.create", source: "connector", validated: validateCreateCouponInput(input) };
}
