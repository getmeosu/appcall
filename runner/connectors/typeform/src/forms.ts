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

export type FormsListInput = { page?: number; pageSize?: number; search?: string; workspaceId?: string; sortBy?: string; orderBy?: string };
export type FormsGetInput = { formId: string };
export type FormsCreateInput = {
  title: string;
  fields?: unknown[];
  settings?: Record<string, unknown>;
  welcomeScreens?: unknown[];
  thankyouScreens?: unknown[];
  type?: string;
  logic?: unknown[];
  theme?: Record<string, unknown>;
  workspace?: Record<string, unknown>;
};
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
export type ResponsesListInput = {
  formId: string;
  pageSize?: number;
  since?: string;
  until?: string;
  after?: string;
  before?: string;
  query?: string;
  sort?: string;
  fields?: string[];
  responseType?: string[];
  answeredFields?: string[];
  excludedResponseIds?: string;
  includedResponseIds?: string;
};
export type ResponsesDeleteInput = { formId: string; includedTokens: string[]; includedResponseIds?: string };

function stringField(input: Record<string, unknown>, field: string, alias?: string): string {
  const value = input[field] ?? (alias ? input[alias] : undefined);
  return requireString(value, field);
}

function optionalString(input: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

function optionalNumber(input: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
}

function stringList(value: unknown): string[] | undefined {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value === "string" && value.length > 0) return value.split(",").map((item) => item.trim()).filter(Boolean);
  return undefined;
}

export function validateFormsListInput(input: unknown): FormsListInput {
  if (!isRecord(input)) throw new Error("forms.list input must be an object");
  return {
    page: optionalNumber(input, "page"),
    pageSize: optionalNumber(input, "pageSize", "page_size"),
    search: optionalString(input, "search"),
    workspaceId: optionalString(input, "workspaceId", "workspace_id"),
    sortBy: optionalString(input, "sortBy", "sort_by"),
    orderBy: optionalString(input, "orderBy", "order_by"),
  };
}

export function validateFormsGetInput(input: unknown): FormsGetInput {
  if (!isRecord(input)) throw new Error("forms.get input must be an object");
  return { formId: stringField(input, "formId", "form_id") };
}

export function validateFormsCreateInput(input: unknown): FormsCreateInput {
  if (!isRecord(input)) throw new Error("forms.create input must be an object");
  return {
    title: requireString(input.title, "title"),
    fields: Array.isArray(input.fields) ? input.fields : undefined,
    settings: isRecord(input.settings) ? input.settings : undefined,
    welcomeScreens: Array.isArray(input.welcomeScreens) ? input.welcomeScreens : Array.isArray(input.welcome_screens) ? input.welcome_screens : undefined,
    thankyouScreens: Array.isArray(input.thankyouScreens) ? input.thankyouScreens : Array.isArray(input.thankyou_screens) ? input.thankyou_screens : undefined,
    type: optionalString(input, "type"),
    logic: Array.isArray(input.logic) ? input.logic : undefined,
    theme: isRecord(input.theme) ? input.theme : undefined,
    workspace: isRecord(input.workspace) ? input.workspace : undefined,
  };
}

export function validateFormsUpdateInput(input: unknown): FormsUpdateInput {
  if (!isRecord(input)) throw new Error("forms.update input must be an object");
  return {
    formId: stringField(input, "formId", "form_id"),
    title: requireString(input.title, "title"),
    fields: Array.isArray(input.fields) ? input.fields : undefined,
    settings: isRecord(input.settings) ? input.settings : undefined,
    welcomeScreens: Array.isArray(input.welcomeScreens) ? input.welcomeScreens : Array.isArray(input.welcome_screens) ? input.welcome_screens : undefined,
    thankyouScreens: Array.isArray(input.thankyouScreens) ? input.thankyouScreens : Array.isArray(input.thankyou_screens) ? input.thankyou_screens : undefined,
    logic: Array.isArray(input.logic) ? input.logic : undefined,
    hidden: Array.isArray(input.hidden) ? input.hidden : undefined,
    theme: isRecord(input.theme) ? input.theme : undefined,
    type: optionalString(input, "type"),
    variables: isRecord(input.variables) ? input.variables : undefined,
    workspace: isRecord(input.workspace) ? input.workspace : undefined,
  };
}

export function validateFormsDeleteInput(input: unknown): FormsDeleteInput {
  if (!isRecord(input)) throw new Error("forms.delete input must be an object");
  return { formId: stringField(input, "formId", "form_id") };
}

export function validateResponsesListInput(input: unknown): ResponsesListInput {
  if (!isRecord(input)) throw new Error("responses.list input must be an object");
  return {
    formId: stringField(input, "formId", "form_id"),
    pageSize: optionalNumber(input, "pageSize", "page_size"),
    since: optionalString(input, "since"),
    until: optionalString(input, "until"),
    after: optionalString(input, "after"),
    before: optionalString(input, "before"),
    query: optionalString(input, "query"),
    sort: optionalString(input, "sort"),
    fields: stringList(input.fields),
    responseType: stringList(input.response_type ?? input.responseType),
    answeredFields: stringList(input.answered_fields ?? input.answeredFields),
    excludedResponseIds: optionalString(input, "excludedResponseIds", "excluded_response_ids"),
    includedResponseIds: optionalString(input, "includedResponseIds", "included_response_ids"),
  };
}

export function validateResponsesDeleteInput(input: unknown): ResponsesDeleteInput {
  if (!isRecord(input)) throw new Error("responses.delete input must be an object");
  const includedResponseIds = optionalString(input, "includedResponseIds", "included_response_ids");
  const includedTokens = Array.isArray(input.includedTokens)
    ? (input.includedTokens as unknown[]).filter((t): t is string => typeof t === "string")
    : includedResponseIds ? includedResponseIds.split(",").map((item) => item.trim()).filter(Boolean) : [];
  if (includedTokens.length === 0 && !includedResponseIds) {
    throw new Error("includedTokens must be a non-empty array");
  }
  return {
    formId: stringField(input, "formId", "form_id"),
    includedTokens,
    includedResponseIds: includedResponseIds ?? (includedTokens.length > 0 ? includedTokens.join(",") : undefined),
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
      if (payload.workspaceId !== undefined) params.set("workspace_id", payload.workspaceId);
      if (payload.sortBy !== undefined) params.set("sort_by", payload.sortBy);
      if (payload.orderBy !== undefined) params.set("order_by", payload.orderBy);
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
      if (payload.type !== undefined) body.type = payload.type;
      if (payload.logic !== undefined) body.logic = payload.logic;
      if (payload.theme !== undefined) body.theme = payload.theme;
      if (payload.workspace !== undefined) body.workspace = payload.workspace;
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
      if (payload.query !== undefined) params.set("query", payload.query);
      if (payload.sort !== undefined) params.set("sort", payload.sort);
      if (payload.includedResponseIds !== undefined) params.set("included_response_ids", payload.includedResponseIds);
      if (payload.excludedResponseIds !== undefined) params.set("excluded_response_ids", payload.excludedResponseIds);
      for (const field of payload.fields ?? []) params.append("fields", field);
      for (const field of payload.answeredFields ?? []) params.append("answered_fields", field);
      for (const type of payload.responseType ?? []) params.append("response_type", type);
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
      if (payload.includedResponseIds) params.set("included_response_ids", payload.includedResponseIds);
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
