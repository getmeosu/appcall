import { createShopifyClient, parseShopifyRateLimit, isRecord } from "./http";
import { normalizeCustomer } from "./objects";

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

// ─── customers.get ────────────────────────────────────────────────────────────

export function validateGetCustomerInput(input: unknown): { accessToken?: string; shopDomain?: string; customerId: number } {
  if (!isRecord(input)) throw new Error("get customer input must be an object");
  return {
    accessToken: typeof input.accessToken === "string" ? input.accessToken : undefined,
    shopDomain: typeof input.shopDomain === "string" ? input.shopDomain : undefined,
    customerId: requireNumber(input.customerId, "customerId"),
  };
}

// ─── customers.create ─────────────────────────────────────────────────────────

export function validateCreateCustomerInput(input: unknown): { accessToken?: string; shopDomain?: string; email: string; firstName?: string; lastName?: string; phone?: string } {
  if (!isRecord(input)) throw new Error("create customer input must be an object");
  return {
    accessToken: typeof input.accessToken === "string" ? input.accessToken : undefined,
    shopDomain: typeof input.shopDomain === "string" ? input.shopDomain : undefined,
    email: requireString(input.email, "email"),
    firstName: typeof input.firstName === "string" ? input.firstName : undefined,
    lastName: typeof input.lastName === "string" ? input.lastName : undefined,
    phone: typeof input.phone === "string" ? input.phone : undefined,
  };
}

// ─── customers.update ─────────────────────────────────────────────────────────

export function validateUpdateCustomerInput(input: unknown): { accessToken?: string; shopDomain?: string; customerId: number; email?: string; firstName?: string; lastName?: string; phone?: string; note?: string } {
  if (!isRecord(input)) throw new Error("update customer input must be an object");
  return {
    accessToken: typeof input.accessToken === "string" ? input.accessToken : undefined,
    shopDomain: typeof input.shopDomain === "string" ? input.shopDomain : undefined,
    customerId: requireNumber(input.customerId, "customerId"),
    email: typeof input.email === "string" ? input.email : undefined,
    firstName: typeof input.firstName === "string" ? input.firstName : undefined,
    lastName: typeof input.lastName === "string" ? input.lastName : undefined,
    phone: typeof input.phone === "string" ? input.phone : undefined,
    note: typeof input.note === "string" ? input.note : undefined,
  };
}

// ─── Client ───────────────────────────────────────────────────────────────────

export function createCustomersClient(options: { accessToken: string; shopDomain: string; fetch?: typeof fetch }) {
  const client = createShopifyClient({ accessToken: options.accessToken, shopDomain: options.shopDomain, fetch: options.fetch, operation: "customers.list" });

  return {
    async get(input: unknown) {
      const payload = validateGetCustomerInput(input);
      const response = await client.fetchJSON(`/customers/${payload.customerId}.json`);
      if (response.status === 200 && isRecord(response.body) && isRecord(response.body.customer)) {
        return { ok: true as const, customer: normalizeCustomer(response.body.customer as Record<string, unknown>) };
      }
      if (response.status === 404) return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Customer not found." } };
      return mapError(response.status, response.headers, "Shopify rejected the get customer request.");
    },

    async create(input: unknown) {
      const payload = validateCreateCustomerInput(input);
      const body: Record<string, unknown> = { email: payload.email };
      if (payload.firstName !== undefined) body.first_name = payload.firstName;
      if (payload.lastName !== undefined) body.last_name = payload.lastName;
      if (payload.phone !== undefined) body.phone = payload.phone;
      const response = await client.fetchJSON("/customers.json", { method: "POST", body: JSON.stringify({ customer: body }) });
      if (response.status === 201 && isRecord(response.body) && isRecord(response.body.customer)) {
        return { ok: true as const, customer: normalizeCustomer(response.body.customer as Record<string, unknown>) };
      }
      return mapError(response.status, response.headers, "Shopify rejected the create customer request.");
    },

    async update(input: unknown) {
      const payload = validateUpdateCustomerInput(input);
      const body: Record<string, unknown> = {};
      if (payload.email !== undefined) body.email = payload.email;
      if (payload.firstName !== undefined) body.first_name = payload.firstName;
      if (payload.lastName !== undefined) body.last_name = payload.lastName;
      if (payload.phone !== undefined) body.phone = payload.phone;
      if (payload.note !== undefined) body.note = payload.note;
      const response = await client.fetchJSON(`/customers/${payload.customerId}.json`, { method: "PUT", body: JSON.stringify({ customer: body }) });
      if (response.status === 200 && isRecord(response.body) && isRecord(response.body.customer)) {
        return { ok: true as const, customer: normalizeCustomer(response.body.customer as Record<string, unknown>) };
      }
      if (response.status === 404) return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Customer not found." } };
      return mapError(response.status, response.headers, "Shopify rejected the update customer request.");
    },
  };
}
