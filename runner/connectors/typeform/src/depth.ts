import { createTypeFormClient, parseTypeFormRateLimit, type TypeFormClient } from "./http";
import {
  normalizeWorkspace,
  normalizeTheme,
  normalizeImage,
  normalizeUser,
} from "./objects";

type TypeFormError = { code: string; message: string; retryAfterSeconds?: number };
type ClientOptions = { accessToken: string; fetch?: typeof fetch; typeFormClient?: TypeFormClient; operation?: string };

const IMAGE_SIZES = new Set(["default", "mobile", "thumbnail"]);
const BACKGROUND_SIZES = new Set(["default", "tablet", "mobile", "thumbnail"]);
const CHOICE_SIZES = new Set(["default", "thumbnail", "supersize", "supermobile", "supersizefit", "supermobilefit"]);

const MESSAGE_KEY_MAP: Record<string, string> = {
  label_button_submit: "label.button.submit",
  label_error_required: "label.error.required",
  label_button_hint_default: "label.buttonHint.default",
  block_short_text_placeholder: "block.shortText.placeholder",
  label_button_no_answer_default: "label.buttonNoAnswer.default",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function pickString(input: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

export function pickNumber(input: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
}

export function requireField(input: Record<string, unknown>, field: string, ...aliases: string[]): string {
  const value = pickString(input, field, ...aliases);
  if (!value) throw new Error(`${field} is required`);
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
  onOk: (body: unknown, status: number, headers: Record<string, string>) => T,
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
    return { ok: true, ...onOk(response.body, response.status, response.headers) };
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

function optionalRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function requireSize(size: string, allowed: Set<string>): string {
  if (!allowed.has(size)) throw new Error("size is invalid");
  return size;
}

function jsonHeaders(): Record<string, string> {
  return { Accept: "application/json" };
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
      return mapResponse(client, "/me", { headers: jsonHeaders() }, (body) => ({
        user: normalizeUser(isRecord(body) ? body : {}),
      }));
    },
  };
}

// ─── workspaces ───────────────────────────────────────────────────────────────

export type WorkspacesListInput = { page?: number; pageSize?: number; search?: string };
export type WorkspacesGetInput = { workspaceId: string };
export type WorkspacesCreateInput = { name: string };
export type WorkspacesCreateInAccountInput = { accountId: string; name: string };
export type WorkspacesUpdateInput = { workspaceId: string; name?: string; operations?: unknown[] };
export type WorkspacesDeleteInput = { workspaceId: string };

export function validateWorkspacesListInput(input: unknown): WorkspacesListInput {
  if (!isRecord(input)) throw new Error("workspaces.list input must be an object");
  return {
    page: pickNumber(input, "page"),
    pageSize: pickNumber(input, "pageSize", "page_size"),
    search: pickString(input, "search"),
  };
}

export function validateWorkspacesGetInput(input: unknown): WorkspacesGetInput {
  if (!isRecord(input)) throw new Error("workspaces.get input must be an object");
  return { workspaceId: requireField(input, "workspaceId", "workspace_id") };
}

export function validateWorkspacesCreateInput(input: unknown): WorkspacesCreateInput {
  if (!isRecord(input)) throw new Error("workspaces.create input must be an object");
  return { name: requireField(input, "name") };
}

export function validateWorkspacesCreateInAccountInput(input: unknown): WorkspacesCreateInAccountInput {
  if (!isRecord(input)) throw new Error("workspaces.create_in_account input must be an object");
  return {
    accountId: requireField(input, "accountId", "account_id"),
    name: requireField(input, "name"),
  };
}

export function validateWorkspacesUpdateInput(input: unknown): WorkspacesUpdateInput {
  if (!isRecord(input)) throw new Error("workspaces.update input must be an object");
  const operations = Array.isArray(input.operations) ? input.operations : undefined;
  const name = pickString(input, "name");
  if ((!operations || operations.length === 0) && !name) {
    throw new Error("operations is required");
  }
  return {
    workspaceId: requireField(input, "workspaceId", "workspace_id"),
    name,
    operations,
  };
}

export function validateWorkspacesDeleteInput(input: unknown): WorkspacesDeleteInput {
  if (!isRecord(input)) throw new Error("workspaces.delete input must be an object");
  return { workspaceId: requireField(input, "workspaceId", "workspace_id") };
}

export function createWorkspacesClient(options: ClientOptions) {
  const client = clientFor({ ...options, operation: options.operation ?? "workspaces.list" });
  return {
    async list(input: unknown) {
      const payload = validateWorkspacesListInput(input);
      return mapResponse(client, `/workspaces${pageQuery(payload)}`, { headers: jsonHeaders() }, (body) => {
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
      return mapResponse(client, `/workspaces/${payload.workspaceId}`, { headers: jsonHeaders() }, (body) => ({
        workspace: normalizeWorkspace(isRecord(body) ? body : {}),
      }));
    },
    async create(input: unknown) {
      const payload = validateWorkspacesCreateInput(input);
      return mapResponse(client, "/workspaces", {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ name: payload.name }),
      }, (body) => ({
        workspace: normalizeWorkspace(isRecord(body) ? body : {}),
      }));
    },
    async createInAccount(input: unknown) {
      const payload = validateWorkspacesCreateInAccountInput(input);
      return mapResponse(client, `/accounts/${payload.accountId}/workspaces`, {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ name: payload.name }),
      }, (body) => ({
        workspace: normalizeWorkspace(isRecord(body) ? body : {}),
      }));
    },
    async update(input: unknown) {
      const payload = validateWorkspacesUpdateInput(input);
      const operations = payload.operations && payload.operations.length > 0
        ? payload.operations
        : [{ op: "replace", path: "/name", value: payload.name }];
      return mapResponse(client, `/workspaces/${payload.workspaceId}`, {
        method: "PATCH",
        headers: jsonHeaders(),
        body: JSON.stringify(operations),
      }, (body, status) => ({
        updated: status === 204 || status === 200,
        workspaceId: payload.workspaceId,
        workspace: isRecord(body) && Object.keys(body).length > 0 ? normalizeWorkspace(body) : undefined,
      }));
    },
    async delete(input: unknown) {
      const payload = validateWorkspacesDeleteInput(input);
      return mapResponse(client, `/workspaces/${payload.workspaceId}`, {
        method: "DELETE",
        headers: jsonHeaders(),
      }, (_body, status) => ({
        deleted: status === 204 || status === 200,
        workspaceId: payload.workspaceId,
      }));
    },
  };
}

// ─── themes ───────────────────────────────────────────────────────────────────

export type ThemesListInput = { page?: number; pageSize?: number };
export type ThemesGetInput = { themeId: string };
export type ThemesCreateInput = {
  font: string;
  colors: Record<string, unknown>;
  fields: Record<string, unknown>;
  name?: string;
  background?: Record<string, unknown>;
  screens?: Record<string, unknown>;
  roundedCorners?: string;
  hasTransparentButton?: boolean;
};
export type ThemesUpdateInput = ThemesCreateInput & { themeId: string };
export type ThemesPatchInput = {
  themeId: string;
  font?: string;
  name?: string;
  colors?: Record<string, unknown>;
  fields?: Record<string, unknown>;
  screens?: Record<string, unknown>;
  background?: Record<string, unknown>;
  roundedCorners?: string;
  hasTransparentButton?: boolean;
};
export type ThemesDeleteInput = { themeId: string };

function themeBody(payload: {
  font?: string;
  name?: string;
  colors?: Record<string, unknown>;
  fields?: Record<string, unknown>;
  screens?: Record<string, unknown>;
  background?: Record<string, unknown>;
  roundedCorners?: string;
  hasTransparentButton?: boolean;
}): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (payload.font !== undefined) body.font = payload.font;
  if (payload.name !== undefined) body.name = payload.name;
  if (payload.colors !== undefined) body.colors = payload.colors;
  if (payload.fields !== undefined) body.fields = payload.fields;
  if (payload.screens !== undefined) body.screens = payload.screens;
  if (payload.background !== undefined) body.background = payload.background;
  if (payload.roundedCorners !== undefined) body.rounded_corners = payload.roundedCorners;
  if (payload.hasTransparentButton !== undefined) body.has_transparent_button = payload.hasTransparentButton;
  return body;
}

export function validateThemesListInput(input: unknown): ThemesListInput {
  if (!isRecord(input)) throw new Error("themes.list input must be an object");
  return {
    page: pickNumber(input, "page"),
    pageSize: pickNumber(input, "pageSize", "page_size"),
  };
}

export function validateThemesGetInput(input: unknown): ThemesGetInput {
  if (!isRecord(input)) throw new Error("themes.get input must be an object");
  return { themeId: requireField(input, "themeId", "theme_id") };
}

export function validateThemesCreateInput(input: unknown): ThemesCreateInput {
  if (!isRecord(input)) throw new Error("themes.create input must be an object");
  const colors = optionalRecord(input.colors);
  const fields = optionalRecord(input.fields);
  if (!colors) throw new Error("colors is required");
  if (!fields) throw new Error("fields is required");
  return {
    font: requireField(input, "font"),
    colors,
    fields,
    name: pickString(input, "name"),
    background: optionalRecord(input.background),
    screens: optionalRecord(input.screens),
    roundedCorners: pickString(input, "roundedCorners", "rounded_corners"),
    hasTransparentButton: typeof input.has_transparent_button === "boolean"
      ? input.has_transparent_button
      : typeof input.hasTransparentButton === "boolean" ? input.hasTransparentButton : undefined,
  };
}

export function validateThemesUpdateInput(input: unknown): ThemesUpdateInput {
  if (!isRecord(input)) throw new Error("themes.update input must be an object");
  const colors = optionalRecord(input.colors);
  if (!colors) throw new Error("colors is required");
  return {
    themeId: requireField(input, "themeId", "theme_id"),
    font: requireField(input, "font"),
    name: requireField(input, "name"),
    colors,
    fields: optionalRecord(input.fields) ?? { alignment: "left", font_size: "medium" },
    background: optionalRecord(input.background),
    screens: optionalRecord(input.screens),
    roundedCorners: pickString(input, "roundedCorners", "rounded_corners"),
    hasTransparentButton: typeof input.has_transparent_button === "boolean"
      ? input.has_transparent_button
      : typeof input.hasTransparentButton === "boolean" ? input.hasTransparentButton : undefined,
  };
}

export function validateThemesPatchInput(input: unknown): ThemesPatchInput {
  if (!isRecord(input)) throw new Error("themes.patch input must be an object");
  return {
    themeId: requireField(input, "themeId", "theme_id"),
    font: pickString(input, "font"),
    name: pickString(input, "name"),
    colors: optionalRecord(input.colors),
    fields: optionalRecord(input.fields),
    screens: optionalRecord(input.screens),
    background: optionalRecord(input.background),
    roundedCorners: pickString(input, "roundedCorners", "rounded_corners"),
    hasTransparentButton: typeof input.has_transparent_button === "boolean"
      ? input.has_transparent_button
      : typeof input.hasTransparentButton === "boolean" ? input.hasTransparentButton : undefined,
  };
}

export function validateThemesDeleteInput(input: unknown): ThemesDeleteInput {
  if (!isRecord(input)) throw new Error("themes.delete input must be an object");
  return { themeId: requireField(input, "themeId", "theme_id") };
}

export function createThemesClient(options: ClientOptions) {
  const client = clientFor({ ...options, operation: options.operation ?? "themes.list" });
  return {
    async list(input: unknown) {
      const payload = validateThemesListInput(input);
      return mapResponse(client, `/themes${pageQuery(payload)}`, { headers: jsonHeaders() }, (body) => {
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
      return mapResponse(client, `/themes/${payload.themeId}`, { headers: jsonHeaders() }, (body) => ({
        theme: normalizeTheme(isRecord(body) ? body : {}),
      }));
    },
    async create(input: unknown) {
      const payload = validateThemesCreateInput(input);
      return mapResponse(client, "/themes", {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify(themeBody(payload)),
      }, (body) => ({
        theme: normalizeTheme(isRecord(body) ? body : {}),
      }));
    },
    async update(input: unknown) {
      const payload = validateThemesUpdateInput(input);
      return mapResponse(client, `/themes/${payload.themeId}`, {
        method: "PUT",
        headers: jsonHeaders(),
        body: JSON.stringify(themeBody(payload)),
      }, (body) => ({
        theme: normalizeTheme(isRecord(body) ? body : {}),
      }));
    },
    async patch(input: unknown) {
      const payload = validateThemesPatchInput(input);
      return mapResponse(client, `/themes/${payload.themeId}`, {
        method: "PATCH",
        headers: jsonHeaders(),
        body: JSON.stringify(themeBody(payload)),
      }, (body) => ({
        theme: normalizeTheme(isRecord(body) ? body : {}),
      }));
    },
    async delete(input: unknown) {
      const payload = validateThemesDeleteInput(input);
      return mapResponse(client, `/themes/${payload.themeId}`, {
        method: "DELETE",
        headers: jsonHeaders(),
      }, (_body, status) => ({
        deleted: status === 204 || status === 200,
        themeId: payload.themeId,
      }));
    },
  };
}

// ─── images ───────────────────────────────────────────────────────────────────

export type ImagesListInput = Record<string, never>;
export type ImagesCreateInput = { fileName: string; image?: string; url?: string };
export type ImagesDeleteInput = { imageId: string };
export type ImagesGetBySizeInput = { imageId: string; size: string };

export function validateImagesListInput(input: unknown): ImagesListInput {
  if (input !== undefined && input !== null && !isRecord(input)) {
    throw new Error("images.list input must be an object");
  }
  return {};
}

export function validateImagesCreateInput(input: unknown): ImagesCreateInput {
  if (!isRecord(input)) throw new Error("images.create input must be an object");
  const image = pickString(input, "image");
  const url = pickString(input, "url");
  if (!image && !url) throw new Error("image or url is required");
  return {
    fileName: requireField(input, "fileName", "file_name"),
    image,
    url,
  };
}

export function validateImagesDeleteInput(input: unknown): ImagesDeleteInput {
  if (!isRecord(input)) throw new Error("images.delete input must be an object");
  return { imageId: requireField(input, "imageId", "image_id") };
}

export function validateImageBySizeInput(input: unknown, allowed: Set<string>): ImagesGetBySizeInput {
  if (!isRecord(input)) throw new Error("images.get input must be an object");
  return {
    imageId: requireField(input, "imageId", "image_id"),
    size: requireSize(requireField(input, "size"), allowed),
  };
}

export function createImagesClient(options: ClientOptions) {
  const client = clientFor({ ...options, operation: options.operation ?? "images.list" });
  return {
    async list(_input: unknown) {
      return mapResponse(client, "/images", { headers: jsonHeaders() }, (body) => {
        const items = Array.isArray(body) ? body.filter(isRecord) : [];
        return { images: items.map(normalizeImage) };
      });
    },
    async create(input: unknown) {
      const payload = validateImagesCreateInput(input);
      const body: Record<string, unknown> = { file_name: payload.fileName };
      if (payload.image !== undefined) body.image = payload.image;
      if (payload.url !== undefined) body.url = payload.url;
      return mapResponse(client, "/images", {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify(body),
      }, (raw) => ({
        image: normalizeImage(isRecord(raw) ? raw : {}),
      }));
    },
    async delete(input: unknown) {
      const payload = validateImagesDeleteInput(input);
      return mapResponse(client, `/images/${payload.imageId}`, {
        method: "DELETE",
        headers: jsonHeaders(),
      }, (_body, status) => ({
        deleted: status === 204 || status === 200,
        imageId: payload.imageId,
      }));
    },
    async getBySize(input: unknown, kind: "image" | "background" | "choice") {
      const allowed = kind === "image" ? IMAGE_SIZES : kind === "background" ? BACKGROUND_SIZES : CHOICE_SIZES;
      const payload = validateImageBySizeInput(input, allowed);
      return mapResponse(client, `/images/${payload.imageId}/${kind}/${payload.size}`, {
        headers: jsonHeaders(),
      }, (body) => ({
        image: normalizeImage(isRecord(body) ? body : {}),
        size: payload.size,
      }));
    },
  };
}

export function validateImageSizeInput(input: unknown): ImagesGetBySizeInput {
  return validateImageBySizeInput(input, IMAGE_SIZES);
}

export function validateBackgroundSizeInput(input: unknown): ImagesGetBySizeInput {
  return validateImageBySizeInput(input, BACKGROUND_SIZES);
}

export function validateChoiceSizeInput(input: unknown): ImagesGetBySizeInput {
  return validateImageBySizeInput(input, CHOICE_SIZES);
}

// ─── forms extras, files, videos ──────────────────────────────────────────────

export type FormMessagesGetInput = { formId: string };
export type FormMessagesUpdateInput = { formId: string; messages: Record<string, string> };
export type FormsPatchInput = { formId: string; operations: unknown[] };
export type ResponseFilesGetInput = { formId: string };
export type VideosUploadInput = { formId: string; fieldId: string; language: string };

export function validateFormMessagesGetInput(input: unknown): FormMessagesGetInput {
  if (!isRecord(input)) throw new Error("forms.messages.get input must be an object");
  return { formId: requireField(input, "formId", "form_id") };
}

export function validateFormMessagesUpdateInput(input: unknown): FormMessagesUpdateInput {
  if (!isRecord(input)) throw new Error("forms.messages.update input must be an object");
  const messages: Record<string, string> = {};
  const provided = optionalRecord(input.messages);
  if (provided) {
    for (const [key, value] of Object.entries(provided)) {
      if (typeof value === "string") messages[key] = value;
    }
  }
  for (const [alias, apiKey] of Object.entries(MESSAGE_KEY_MAP)) {
    const value = pickString(input, alias, apiKey);
    if (value) messages[apiKey] = value;
  }
  if (Object.keys(messages).length === 0) {
    throw new Error("messages is required");
  }
  return {
    formId: requireField(input, "formId", "form_id"),
    messages,
  };
}

export function validateFormsPatchInput(input: unknown): FormsPatchInput {
  if (!isRecord(input)) throw new Error("forms.patch input must be an object");
  if (!Array.isArray(input.operations) || input.operations.length === 0) {
    throw new Error("operations is required");
  }
  return {
    formId: requireField(input, "formId", "form_id"),
    operations: input.operations,
  };
}

export function validateResponseFilesGetInput(input: unknown): ResponseFilesGetInput {
  if (!isRecord(input)) throw new Error("responses.files.get input must be an object");
  return { formId: requireField(input, "formId", "form_id") };
}

export function validateVideosUploadInput(input: unknown): VideosUploadInput {
  if (!isRecord(input)) throw new Error("videos.upload input must be an object");
  return {
    formId: requireField(input, "formId", "form_id"),
    fieldId: requireField(input, "fieldId", "field_id"),
    language: requireField(input, "language"),
  };
}

export function createFormExtrasClient(options: ClientOptions) {
  const client = clientFor({ ...options, operation: options.operation ?? "forms.messages.get" });
  return {
    async getMessages(input: unknown) {
      const payload = validateFormMessagesGetInput(input);
      return mapResponse(client, `/forms/${payload.formId}/messages`, { headers: jsonHeaders() }, (body) => ({
        messages: isRecord(body) ? body : {},
        formId: payload.formId,
      }));
    },
    async updateMessages(input: unknown) {
      const payload = validateFormMessagesUpdateInput(input);
      return mapResponse(client, `/forms/${payload.formId}/messages`, {
        method: "PUT",
        headers: jsonHeaders(),
        body: JSON.stringify(payload.messages),
      }, (_body, status) => ({
        updated: status === 204 || status === 200,
        formId: payload.formId,
      }));
    },
    async patch(input: unknown) {
      const payload = validateFormsPatchInput(input);
      return mapResponse(client, `/forms/${payload.formId}`, {
        method: "PATCH",
        headers: jsonHeaders(),
        body: JSON.stringify(payload.operations),
      }, (_body, status) => ({
        patched: status === 204 || status === 200,
        formId: payload.formId,
      }));
    },
    async getResponseFiles(input: unknown) {
      const payload = validateResponseFilesGetInput(input);
      return mapResponse(client, `/forms/${payload.formId}/responses/files`, {
        headers: { Accept: "application/zip, application/json, */*" },
      }, (body, status, headers) => ({
        formId: payload.formId,
        empty: status === 204,
        contentType: headers["content-type"] ?? headers["Content-Type"] ?? "",
        body: status === 204 ? null : body,
      }));
    },
    async uploadVideo(input: unknown) {
      const payload = validateVideosUploadInput(input);
      return mapResponse(client, "/media/videos", {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({
          form_id: payload.formId,
          field_id: payload.fieldId,
          language: payload.language,
        }),
      }, (body) => {
        const record = isRecord(body) ? body : {};
        return {
          video: {
            id: typeof record.id === "string" ? record.id : "",
            uploadUrl: typeof record.upload_url === "string" ? record.upload_url : "",
            raw: record,
          },
        };
      });
    },
  };
}
