import { createTypeFormClient, parseTypeFormRateLimit, type TypeFormClient } from "./http";

// ─── Types ────────────────────────────────────────────────────────────────────

export type TypeFormFormDetail = {
  id: string;
  title: string;
  description?: string | null;
  created_at?: string;
  updated_at?: string;
  last_response_at?: string | null;
  fields?: TypeFormField[];
  settings?: Record<string, unknown>;
  self?: { href: string };
  _links?: { display: string };
  [key: string]: unknown;
};

export type TypeFormField = {
  id: string;
  title: string;
  type: string;
  ref?: string;
  [key: string]: unknown;
};

export type NormalizedFormDetail = {
  id: string;
  provider: "typeform";
  providerFormId: string;
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  fieldCount: number;
  modelVersion: "2026-05-17";
  raw: TypeFormFormDetail;
};

export function normalizeFormDetail(f: TypeFormFormDetail): NormalizedFormDetail {
  return {
    id: `tf-form:${f.id}`,
    provider: "typeform",
    providerFormId: f.id,
    title: f.title ?? "",
    description: typeof f.description === "string" ? f.description : "",
    createdAt: f.created_at ?? "",
    updatedAt: f.updated_at ?? "",
    fieldCount: Array.isArray(f.fields) ? f.fields.length : 0,
    modelVersion: "2026-05-17",
    raw: f,
  };
}

// ─── Validation ───────────────────────────────────────────────────────────────

export type FormsListInput = { page?: number; pageSize?: number; search?: string };
export type FormsGetInput = { formId: string };
export type FormsCreateInput = { title: string; fields?: unknown[]; settings?: Record<string, unknown>; welcomeScreens?: unknown[]; thankyouScreens?: unknown[] };
export type FormsUpdateInput = {
  formId: string;
  title: string;
  fields?: unknown[];
  settings?: Record<string, unknown>;
  welcomeScreens?: unknown[];
  thankyouScreens?: unknown[];
  logic?: unknown[];
  hidden?: unknown[];
  theme?: Record<string, unknown>;
  type?: string;
  variables?: Record<string, unknown>;
  workspace?: Record<string, unknown>;
};
export type FormsDeleteInput = { formId: string };
export type ResponsesListInput = { formId: string; pageSize?: number; since?: string; until?: string; after?: string; before?: string };
export type ResponsesDeleteInput = { formId: string; includedTokens: string[] };

export function validateFormsListInput(input: unknown): FormsListInput {
  if (!isRecord(input)) throw new Error("forms.list input must be an object");
  return {
    page: typeof input.page === "number" ? input.page : undefined,
    pageSize: typeof input.pageSize === "number" ? input.pageSize : undefined,
    search: typeof input.search === "string" ? input.search : undefined,
  };
}

export function validateFormsGetInput(input: unknown): FormsGetInput {
  if (!isRecord(input)) throw new Error("forms.get input must be an object");
  return { formId: requireString(input.formId, "formId") };
}

export function validateFormsCreateInput(input: unknown): FormsCreateInput {
  if (!isRecord(input)) throw new Error("forms.create input must be an object");
  return {
    title: requireString(input.title, "title"),
    fields: Array.isArray(input.fields) ? input.fields : undefined,
    settings: isRecord(input.settings) ? (input.settings as Record<string, unknown>) : undefined,
    welcomeScreens: Array.isArray(input.welcomeScreens) ? input.welcomeScreens : undefined,
    thankyouScreens: Array.isArray(input.thankyouScreens) ? input.thankyouScreens : undefined,
  };
}

export function validateFormsUpdateInput(input: unknown): FormsUpdateInput {
  if (!isRecord(input)) throw new Error("forms.update input must be an object");
  return {
    formId: requireString(input.formId, "formId"),
    title: requireString(input.title, "title"),
    fields: Array.isArray(input.fields) ? input.fields : undefined,
    settings: isRecord(input.settings) ? (input.settings as Record<string, unknown>) : undefined,
    welcomeScreens: Array.isArray(input.welcomeScreens) ? input.welcomeScreens : undefined,
    thankyouScreens: Array.isArray(input.thankyouScreens) ? input.thankyouScreens : undefined,
    logic: Array.isArray(input.logic) ? input.logic : undefined,
    hidden: Array.isArray(input.hidden) ? input.hidden : undefined,
    theme: isRecord(input.theme) ? (input.theme as Record<string, unknown>) : undefined,
    type: typeof input.type === "string" ? input.type : undefined,
    variables: isRecord(input.variables) ? (input.variables as Record<string, unknown>) : undefined,
    workspace: isRecord(input.workspace) ? (input.workspace as Record<string, unknown>) : undefined,
  };
}

export function validateFormsDeleteInput(input: unknown): FormsDeleteInput {
  if (!isRecord(input)) throw new Error("forms.delete input must be an object");
  return { formId: requireString(input.formId, "formId") };
}

export function validateResponsesListInput(input: unknown): ResponsesListInput {
  if (!isRecord(input)) throw new Error("responses.list input must be an object");
  return {
    formId: requireString(input.formId, "formId"),
    pageSize: typeof input.pageSize === "number" ? input.pageSize : undefined,
    since: typeof input.since === "string" ? input.since : undefined,
    until: typeof input.until === "string" ? input.until : undefined,
    after: typeof input.after === "string" ? input.after : undefined,
    before: typeof input.before === "string" ? input.before : undefined,
  };
}

export function validateResponsesDeleteInput(input: unknown): ResponsesDeleteInput {
  if (!isRecord(input)) throw new Error("responses.delete input must be an object");
  if (!Array.isArray(input.includedTokens) || input.includedTokens.length === 0) {
    throw new Error("includedTokens must be a non-empty array");
  }
  return {
    formId: requireString(input.formId, "formId"),
    includedTokens: (input.includedTokens as unknown[]).filter((t): t is string => typeof t === "string"),
  };
}

// ─── Client Factory ───────────────────────────────────────────────────────────

export function createFormsClient(options: { accessToken: string; fetch?: typeof fetch; typeFormClient?: TypeFormClient }) {
  const client = options.typeFormClient ?? createTypeFormClient({
    accessToken: options.accessToken,
    fetch: options.fetch,
    operation: "forms.list",
  });

  return {
    async list(input: unknown) {
      const payload = validateFormsListInput(input);
      const params = new URLSearchParams();
      if (payload.page !== undefined) params.set("page", String(payload.page));
      if (payload.pageSize !== undefined) params.set("page_size", String(payload.pageSize));
      if (payload.search !== undefined) params.set("search", payload.search);
      const query = params.toString();
      const path = `/forms${query ? `?${query}` : ""}`;
      const response = await client.fetchJSON(path);
      const rateLimit = parseTypeFormRateLimit(response.status, response.headers);
      if (rateLimit.limited) {
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "Typeform rate limit exceeded.", retryAfterSeconds: rateLimit.retryAfterSeconds } };
      }
      if (response.status === 200) {
        const body = isRecord(response.body) ? response.body : {};
        const items = Array.isArray(body.items) ? body.items : [];
        return { ok: true as const, forms: items as TypeFormFormDetail[], totalItems: typeof body.total_items === "number" ? body.total_items : items.length };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Typeform rejected the forms list request." } };
    },

    async get(input: unknown) {
      const payload = validateFormsGetInput(input);
      const response = await client.fetchJSON(`/forms/${payload.formId}`);
      const rateLimit = parseTypeFormRateLimit(response.status, response.headers);
      if (rateLimit.limited) {
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "Typeform rate limit exceeded.", retryAfterSeconds: rateLimit.retryAfterSeconds } };
      }
      if (response.status === 200) {
        return { ok: true as const, form: normalizeFormDetail(response.body as TypeFormFormDetail) };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Form not found." } };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Typeform rejected the form get request." } };
    },

    async create(input: unknown) {
      const payload = validateFormsCreateInput(input);
      const body: Record<string, unknown> = { title: payload.title };
      if (payload.fields !== undefined) body.fields = payload.fields;
      if (payload.settings !== undefined) body.settings = payload.settings;
      if (payload.welcomeScreens !== undefined) body.welcome_screens = payload.welcomeScreens;
      if (payload.thankyouScreens !== undefined) body.thankyou_screens = payload.thankyouScreens;
      const response = await client.fetchJSON("/forms", {
        method: "POST",
        body: JSON.stringify(body),
      });
      const rateLimit = parseTypeFormRateLimit(response.status, response.headers);
      if (rateLimit.limited) {
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "Typeform rate limit exceeded.", retryAfterSeconds: rateLimit.retryAfterSeconds } };
      }
      if (response.status === 200 || response.status === 201) {
        return { ok: true as const, form: normalizeFormDetail(response.body as TypeFormFormDetail) };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Typeform rejected the form create request." } };
    },

    async update(input: unknown) {
      const payload = validateFormsUpdateInput(input);
      const body: Record<string, unknown> = { title: payload.title };
      if (payload.fields !== undefined) body.fields = payload.fields;
      if (payload.settings !== undefined) body.settings = payload.settings;
      if (payload.welcomeScreens !== undefined) body.welcome_screens = payload.welcomeScreens;
      if (payload.thankyouScreens !== undefined) body.thankyou_screens = payload.thankyouScreens;
      if (payload.logic !== undefined) body.logic = payload.logic;
      if (payload.hidden !== undefined) body.hidden = payload.hidden;
      if (payload.theme !== undefined) body.theme = payload.theme;
      if (payload.type !== undefined) body.type = payload.type;
      if (payload.variables !== undefined) body.variables = payload.variables;
      if (payload.workspace !== undefined) body.workspace = payload.workspace;
      const response = await client.fetchJSON(`/forms/${payload.formId}`, {
        method: "PUT",
        body: JSON.stringify(body),
      });
      const rateLimit = parseTypeFormRateLimit(response.status, response.headers);
      if (rateLimit.limited) {
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "Typeform rate limit exceeded.", retryAfterSeconds: rateLimit.retryAfterSeconds } };
      }
      if (response.status === 200) {
        return { ok: true as const, form: normalizeFormDetail(response.body as TypeFormFormDetail) };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Form not found." } };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Typeform rejected the form update request." } };
    },

    async delete(input: unknown) {
      const payload = validateFormsDeleteInput(input);
      const response = await client.fetchJSON(`/forms/${payload.formId}`, { method: "DELETE" });
      const rateLimit = parseTypeFormRateLimit(response.status, response.headers);
      if (rateLimit.limited) {
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "Typeform rate limit exceeded.", retryAfterSeconds: rateLimit.retryAfterSeconds } };
      }
      if (response.status === 204 || response.status === 200) {
        return { ok: true as const, deleted: true, formId: payload.formId };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Form not found." } };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Typeform rejected the form delete request." } };
    },

    async listResponses(input: unknown) {
      const payload = validateResponsesListInput(input);
      const params = new URLSearchParams();
      if (payload.pageSize !== undefined) params.set("page_size", String(payload.pageSize));
      if (payload.since !== undefined) params.set("since", payload.since);
      if (payload.until !== undefined) params.set("until", payload.until);
      if (payload.after !== undefined) params.set("after", payload.after);
      if (payload.before !== undefined) params.set("before", payload.before);
      const query = params.toString();
      const path = `/forms/${payload.formId}/responses${query ? `?${query}` : ""}`;
      const response = await client.fetchJSON(path);
      const rateLimit = parseTypeFormRateLimit(response.status, response.headers);
      if (rateLimit.limited) {
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "Typeform rate limit exceeded.", retryAfterSeconds: rateLimit.retryAfterSeconds } };
      }
      if (response.status === 200) {
        const body = isRecord(response.body) ? response.body : {};
        const items = Array.isArray(body.items) ? body.items : [];
        return { ok: true as const, responses: items, totalItems: typeof body.total_items === "number" ? body.total_items : items.length };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Form not found." } };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Typeform rejected the responses list request." } };
    },

    async deleteResponses(input: unknown) {
      const payload = validateResponsesDeleteInput(input);
      const params = new URLSearchParams();
      for (const token of payload.includedTokens) {
        params.append("included_tokens", token);
      }
      const response = await client.fetchJSON(`/forms/${payload.formId}/responses?${params.toString()}`, { method: "DELETE" });
      const rateLimit = parseTypeFormRateLimit(response.status, response.headers);
      if (rateLimit.limited) {
        return { ok: false as const, error: { code: "CONNECTOR_RATE_LIMITED", message: "Typeform rate limit exceeded.", retryAfterSeconds: rateLimit.retryAfterSeconds } };
      }
      if (response.status === 204 || response.status === 200) {
        return { ok: true as const, deleted: true, formId: payload.formId };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Form not found." } };
      }
      return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Typeform rejected the responses delete request." } };
    },
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
