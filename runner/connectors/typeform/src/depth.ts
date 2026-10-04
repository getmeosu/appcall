import { createTypeFormClient, parseTypeFormRateLimit, type TypeFormClient } from "./http";
import {
  normalizeWorkspace,
  normalizeTheme,
  normalizeImage,
  normalizeUser,
} from "./objects";

type TypeFormError = { code: string; message: string; retryAfterSeconds?: number };
type ClientOptions = { accessToken: string; fetch?: typeof fetch; typeFormClient?: TypeFormClient; operation?: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function clientFor(options: ClientOptions): TypeFormClient {
  return options.typeFormClient ?? createTypeFormClient({
    accessToken: options.accessToken,
    fetch: options.fetch,
    operation: options.operation ?? "forms.list",
  });
}

async function mapResponse<T>(
  client: TypeFormClient,
  path: string,
  init: RequestInit,
  onOk: (body: unknown, status: number) => T,
): Promise<({ ok: true } & T) | { ok: false; error: TypeFormError }> {
  const response = await client.fetchJSON(path, init);
  const rateLimit = parseTypeFormRateLimit(response.status, response.headers);
  if (rateLimit.limited) {
    return {
      ok: false,
      error: {
        code: "CONNECTOR_RATE_LIMITED",
        message: "Typeform rate limit exceeded.",
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      },
    };
  }
  if (response.status === 200 || response.status === 201 || response.status === 204) {
    return { ok: true, ...onOk(response.body, response.status) };
  }
  if (response.status === 404) {
    return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Typeform resource not found." } };
  }
  return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Typeform rejected the request." } };
}

function pageQuery(input: { page?: number; pageSize?: number; search?: string }): string {
  const params = new URLSearchParams();
  if (input.page !== undefined) params.set("page", String(input.page));
  if (input.pageSize !== undefined) params.set("page_size", String(input.pageSize));
  if (input.search !== undefined) params.set("search", input.search);
  const query = params.toString();
  return query ? `?${query}` : "";
}

// ─── users.me ─────────────────────────────────────────────────────────────────

export type UsersMeInput = Record<string, never>;

export function validateUsersMeInput(input: unknown): UsersMeInput {
  if (input !== undefined && input !== null && !isRecord(input)) {
    throw new Error("users.me input must be an object");
  }
  return {};
}

export function createUsersClient(options: ClientOptions) {
  const client = clientFor({ ...options, operation: options.operation ?? "users.me" });
  return {
    async me(_input: unknown) {
      return mapResponse(client, "/me", {}, (body) => ({
        user: normalizeUser(isRecord(body) ? body : {}),
      }));
    },
  };
}

// ─── workspaces ───────────────────────────────────────────────────────────────

export type WorkspacesListInput = { page?: number; pageSize?: number; search?: string };
export type WorkspacesGetInput = { workspaceId: string };
export type WorkspacesCreateInput = { name: string };
export type WorkspacesUpdateInput = { workspaceId: string; name: string };

export function validateWorkspacesListInput(input: unknown): WorkspacesListInput {
  if (!isRecord(input)) throw new Error("workspaces.list input must be an object");
  return {
    page: typeof input.page === "number" ? input.page : undefined,
    pageSize: typeof input.pageSize === "number" ? input.pageSize : undefined,
    search: typeof input.search === "string" ? input.search : undefined,
  };
}

export function validateWorkspacesGetInput(input: unknown): WorkspacesGetInput {
  if (!isRecord(input)) throw new Error("workspaces.get input must be an object");
  return { workspaceId: requireString(input.workspaceId, "workspaceId") };
}

export function validateWorkspacesCreateInput(input: unknown): WorkspacesCreateInput {
  if (!isRecord(input)) throw new Error("workspaces.create input must be an object");
  return { name: requireString(input.name, "name") };
}

export function validateWorkspacesUpdateInput(input: unknown): WorkspacesUpdateInput {
  if (!isRecord(input)) throw new Error("workspaces.update input must be an object");
  return {
    workspaceId: requireString(input.workspaceId, "workspaceId"),
    name: requireString(input.name, "name"),
  };
}

export function createWorkspacesClient(options: ClientOptions) {
  const client = clientFor({ ...options, operation: options.operation ?? "workspaces.list" });
  return {
    async list(input: unknown) {
      const payload = validateWorkspacesListInput(input);
      return mapResponse(client, `/workspaces${pageQuery(payload)}`, {}, (body) => {
        const record = isRecord(body) ? body : {};
        const items = Array.isArray(record.items) ? record.items.filter(isRecord) : [];
        return {
          workspaces: items.map(normalizeWorkspace),
          totalItems: typeof record.total_items === "number" ? record.total_items : items.length,
        };
      });
    },
    async get(input: unknown) {
      const payload = validateWorkspacesGetInput(input);
      return mapResponse(client, `/workspaces/${payload.workspaceId}`, {}, (body) => ({
        workspace: normalizeWorkspace(isRecord(body) ? body : {}),
      }));
    },
    async create(input: unknown) {
      const payload = validateWorkspacesCreateInput(input);
      return mapResponse(client, "/workspaces", {
        method: "POST",
        body: JSON.stringify({ name: payload.name }),
      }, (body) => ({
        workspace: normalizeWorkspace(isRecord(body) ? body : {}),
      }));
    },
    async update(input: unknown) {
      const payload = validateWorkspacesUpdateInput(input);
      return mapResponse(client, `/workspaces/${payload.workspaceId}`, {
        method: "PATCH",
        body: JSON.stringify({ name: payload.name }),
      }, (body) => ({
        workspace: normalizeWorkspace(isRecord(body) ? body : {}),
      }));
    },
  };
}

// ─── themes ───────────────────────────────────────────────────────────────────

export type ThemesListInput = { page?: number; pageSize?: number };
export type ThemesGetInput = { themeId: string };

export function validateThemesListInput(input: unknown): ThemesListInput {
  if (!isRecord(input)) throw new Error("themes.list input must be an object");
  return {
    page: typeof input.page === "number" ? input.page : undefined,
    pageSize: typeof input.pageSize === "number" ? input.pageSize : undefined,
  };
}

export function validateThemesGetInput(input: unknown): ThemesGetInput {
  if (!isRecord(input)) throw new Error("themes.get input must be an object");
  return { themeId: requireString(input.themeId, "themeId") };
}

export function createThemesClient(options: ClientOptions) {
  const client = clientFor({ ...options, operation: options.operation ?? "themes.list" });
  return {
    async list(input: unknown) {
      const payload = validateThemesListInput(input);
      return mapResponse(client, `/themes${pageQuery(payload)}`, {}, (body) => {
        const record = isRecord(body) ? body : {};
        const items = Array.isArray(record.items) ? record.items.filter(isRecord) : [];
        return {
          themes: items.map(normalizeTheme),
          totalItems: typeof record.total_items === "number" ? record.total_items : items.length,
        };
      });
    },
    async get(input: unknown) {
      const payload = validateThemesGetInput(input);
      return mapResponse(client, `/themes/${payload.themeId}`, {}, (body) => ({
        theme: normalizeTheme(isRecord(body) ? body : {}),
      }));
    },
  };
}

// ─── images ───────────────────────────────────────────────────────────────────

export type ImagesListInput = Record<string, never>;

export function validateImagesListInput(input: unknown): ImagesListInput {
  if (input !== undefined && input !== null && !isRecord(input)) {
    throw new Error("images.list input must be an object");
  }
  return {};
}

export function createImagesClient(options: ClientOptions) {
  const client = clientFor({ ...options, operation: options.operation ?? "images.list" });
  return {
    async list(_input: unknown) {
      return mapResponse(client, "/images", {}, (body) => {
        const items = Array.isArray(body) ? body.filter(isRecord) : [];
        return { images: items.map(normalizeImage) };
      });
    },
  };
}

// ─── forms.messages.get / forms.patch ─────────────────────────────────────────

export type FormMessagesGetInput = { formId: string };
export type FormsPatchInput = { formId: string; operations: unknown[] };

export function validateFormMessagesGetInput(input: unknown): FormMessagesGetInput {
  if (!isRecord(input)) throw new Error("forms.messages.get input must be an object");
  return { formId: requireString(input.formId, "formId") };
}

export function validateFormsPatchInput(input: unknown): FormsPatchInput {
  if (!isRecord(input)) throw new Error("forms.patch input must be an object");
  if (!Array.isArray(input.operations) || input.operations.length === 0) {
    throw new Error("operations is required");
  }
  return {
    formId: requireString(input.formId, "formId"),
    operations: input.operations,
  };
}

export function createFormExtrasClient(options: ClientOptions) {
  const client = clientFor({ ...options, operation: options.operation ?? "forms.messages.get" });
  return {
    async getMessages(input: unknown) {
      const payload = validateFormMessagesGetInput(input);
      return mapResponse(client, `/forms/${payload.formId}/messages`, {}, (body) => ({
        messages: isRecord(body) ? body : {},
        formId: payload.formId,
      }));
    },
    async patch(input: unknown) {
      const payload = validateFormsPatchInput(input);
      return mapResponse(client, `/forms/${payload.formId}`, {
        method: "PATCH",
        body: JSON.stringify(payload.operations),
      }, (_body, status) => ({
        patched: status === 204 || status === 200,
        formId: payload.formId,
      }));
    },
  };
}
