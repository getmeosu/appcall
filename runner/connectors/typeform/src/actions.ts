import {
  createFormsClient,
  validateFormsListInput,
  validateFormsGetInput,
  validateFormsCreateInput,
  validateFormsUpdateInput,
  validateFormsDeleteInput,
  validateResponsesListInput,
  validateResponsesDeleteInput,
} from "./forms";
import {
  createWebhooksClient,
  validateWebhooksCreateInput,
  validateWebhooksListInput,
  validateWebhooksGetInput,
  validateWebhooksDeleteInput,
} from "./webhooks";
import {
  createUsersClient,
  createWorkspacesClient,
  createThemesClient,
  createImagesClient,
  createFormExtrasClient,
  validateUsersMeInput,
  validateWorkspacesListInput,
  validateWorkspacesGetInput,
  validateWorkspacesCreateInput,
  validateWorkspacesCreateInAccountInput,
  validateWorkspacesUpdateInput,
  validateWorkspacesDeleteInput,
  validateThemesListInput,
  validateThemesGetInput,
  validateThemesCreateInput,
  validateThemesUpdateInput,
  validateThemesPatchInput,
  validateThemesDeleteInput,
  validateImagesListInput,
  validateImagesCreateInput,
  validateImagesDeleteInput,
  validateImageSizeInput,
  validateBackgroundSizeInput,
  validateChoiceSizeInput,
  validateFormMessagesGetInput,
  validateFormMessagesUpdateInput,
  validateFormsPatchInput,
  validateResponseFilesGetInput,
  validateVideosUploadInput,
} from "./depth";

// ─── forms.list ───────────────────────────────────────────────────────────────

export function listForms(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createFormsClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).list(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
      }
      return { connector: "typeform", action: "forms.list", source: "connector", forms: result.forms, totalItems: result.totalItems };
    });
  }
  return { connector: "typeform", action: "forms.list", source: "connector", validated: validateFormsListInput(input) };
}

// ─── forms.get ────────────────────────────────────────────────────────────────

export function getForm(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createFormsClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).get(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: (result.error as Record<string, unknown>).retryAfterSeconds };
      }
      return { connector: "typeform", action: "forms.get", source: "connector", form: result.form };
    });
  }
  return { connector: "typeform", action: "forms.get", source: "connector", validated: validateFormsGetInput(input) };
}

// ─── forms.create ─────────────────────────────────────────────────────────────

export function createForm(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createFormsClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).create(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: (result.error as Record<string, unknown>).retryAfterSeconds };
      }
      return { connector: "typeform", action: "forms.create", source: "connector", form: result.form };
    });
  }
  return { connector: "typeform", action: "forms.create", source: "connector", validated: validateFormsCreateInput(input) };
}

// ─── forms.update ─────────────────────────────────────────────────────────────

export function updateForm(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createFormsClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).update(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: (result.error as Record<string, unknown>).retryAfterSeconds };
      }
      return { connector: "typeform", action: "forms.update", source: "connector", form: result.form };
    });
  }
  return { connector: "typeform", action: "forms.update", source: "connector", validated: validateFormsUpdateInput(input) };
}

// ─── forms.delete ─────────────────────────────────────────────────────────────

export function deleteForm(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createFormsClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).delete(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: (result.error as Record<string, unknown>).retryAfterSeconds };
      }
      return { connector: "typeform", action: "forms.delete", source: "connector", deleted: result.deleted, formId: result.formId };
    });
  }
  return { connector: "typeform", action: "forms.delete", source: "connector", validated: validateFormsDeleteInput(input) };
}

// ─── responses.list (action) ──────────────────────────────────────────────────

export function listResponses(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createFormsClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).listResponses(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: (result.error as Record<string, unknown>).retryAfterSeconds };
      }
      return { connector: "typeform", action: "responses.list", source: "connector", responses: result.responses, totalItems: result.totalItems };
    });
  }
  return { connector: "typeform", action: "responses.list", source: "connector", validated: validateResponsesListInput(input) };
}

// ─── responses.delete ─────────────────────────────────────────────────────────

export function deleteResponses(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createFormsClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).deleteResponses(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: (result.error as Record<string, unknown>).retryAfterSeconds };
      }
      return { connector: "typeform", action: "responses.delete", source: "connector", deleted: result.deleted, formId: result.formId };
    });
  }
  return { connector: "typeform", action: "responses.delete", source: "connector", validated: validateResponsesDeleteInput(input) };
}

// ─── webhooks.create ──────────────────────────────────────────────────────────

export function createWebhook(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createWebhooksClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).create(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: (result.error as Record<string, unknown>).retryAfterSeconds };
      }
      return { connector: "typeform", action: "webhooks.create", source: "connector", webhook: result.webhook };
    });
  }
  return { connector: "typeform", action: "webhooks.create", source: "connector", validated: validateWebhooksCreateInput(input) };
}

// ─── webhooks.list ────────────────────────────────────────────────────────────

export function listWebhooks(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createWebhooksClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).list(input).then((result) => {
      if (!result.ok) {
        throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: (result.error as Record<string, unknown>).retryAfterSeconds };
      }
      return { connector: "typeform", action: "webhooks.list", source: "connector", webhooks: result.webhooks };
    });
  }
  return { connector: "typeform", action: "webhooks.list", source: "connector", validated: validateWebhooksListInput(input) };
}

function wrapTypeformAction(
  action: string,
  validate: (input: unknown) => unknown,
  execute: (input: Record<string, unknown> & { accessToken: string }) => Promise<Record<string, unknown>>,
) {
  return (input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> => {
    if (isRecord(input) && typeof input.accessToken === "string") {
      return execute(input as Record<string, unknown> & { accessToken: string });
    }
    return { connector: "typeform", action, source: "connector", validated: validate(input) };
  };
}

function unwrap(
  result: { ok: boolean; error?: { code: string; message: string; retryAfterSeconds?: number }; [key: string]: unknown },
  action: string,
): Record<string, unknown> {
  if (!result.ok) {
    throw {
      ok: false,
      code: result.error?.code,
      message: result.error?.message,
      retryAfterSeconds: result.error?.retryAfterSeconds,
    };
  }
  const rest = { ...result };
  delete rest.ok;
  delete rest.error;
  return { connector: "typeform", action, source: "connector", ...rest };
}

function fetchFrom(input: Record<string, unknown>): typeof fetch | undefined {
  return typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
}

export const getUserMe = wrapTypeformAction("users.me", validateUsersMeInput, (input) =>
  createUsersClient({ accessToken: input.accessToken, fetch: fetchFrom(input), operation: "users.me" })
    .me(input)
    .then((result) => unwrap(result, "users.me")),
);

export const listWorkspaces = wrapTypeformAction("workspaces.list", validateWorkspacesListInput, (input) =>
  createWorkspacesClient({ accessToken: input.accessToken, fetch: fetchFrom(input), operation: "workspaces.list" })
    .list(input)
    .then((result) => unwrap(result, "workspaces.list")),
);

export const getWorkspace = wrapTypeformAction("workspaces.get", validateWorkspacesGetInput, (input) =>
  createWorkspacesClient({ accessToken: input.accessToken, fetch: fetchFrom(input), operation: "workspaces.get" })
    .get(input)
    .then((result) => unwrap(result, "workspaces.get")),
);

export const createWorkspace = wrapTypeformAction("workspaces.create", validateWorkspacesCreateInput, (input) =>
  createWorkspacesClient({ accessToken: input.accessToken, fetch: fetchFrom(input), operation: "workspaces.create" })
    .create(input)
    .then((result) => unwrap(result, "workspaces.create")),
);

export const createAccountWorkspace = wrapTypeformAction("workspaces.create_in_account", validateWorkspacesCreateInAccountInput, (input) =>
  createWorkspacesClient({ accessToken: input.accessToken, fetch: fetchFrom(input), operation: "workspaces.create_in_account" })
    .createInAccount(input)
    .then((result) => unwrap(result, "workspaces.create_in_account")),
);

export const updateWorkspace = wrapTypeformAction("workspaces.update", validateWorkspacesUpdateInput, (input) =>
  createWorkspacesClient({ accessToken: input.accessToken, fetch: fetchFrom(input), operation: "workspaces.update" })
    .update(input)
    .then((result) => unwrap(result, "workspaces.update")),
);

export const deleteWorkspace = wrapTypeformAction("workspaces.delete", validateWorkspacesDeleteInput, (input) =>
  createWorkspacesClient({ accessToken: input.accessToken, fetch: fetchFrom(input), operation: "workspaces.delete" })
    .delete(input)
    .then((result) => unwrap(result, "workspaces.delete")),
);

export const listThemes = wrapTypeformAction("themes.list", validateThemesListInput, (input) =>
  createThemesClient({ accessToken: input.accessToken, fetch: fetchFrom(input), operation: "themes.list" })
    .list(input)
    .then((result) => unwrap(result, "themes.list")),
);

export const getTheme = wrapTypeformAction("themes.get", validateThemesGetInput, (input) =>
  createThemesClient({ accessToken: input.accessToken, fetch: fetchFrom(input), operation: "themes.get" })
    .get(input)
    .then((result) => unwrap(result, "themes.get")),
);

export const createTheme = wrapTypeformAction("themes.create", validateThemesCreateInput, (input) =>
  createThemesClient({ accessToken: input.accessToken, fetch: fetchFrom(input), operation: "themes.create" })
    .create(input)
    .then((result) => unwrap(result, "themes.create")),
);

export const updateTheme = wrapTypeformAction("themes.update", validateThemesUpdateInput, (input) =>
  createThemesClient({ accessToken: input.accessToken, fetch: fetchFrom(input), operation: "themes.update" })
    .update(input)
    .then((result) => unwrap(result, "themes.update")),
);

export const patchTheme = wrapTypeformAction("themes.patch", validateThemesPatchInput, (input) =>
  createThemesClient({ accessToken: input.accessToken, fetch: fetchFrom(input), operation: "themes.patch" })
    .patch(input)
    .then((result) => unwrap(result, "themes.patch")),
);

export const deleteTheme = wrapTypeformAction("themes.delete", validateThemesDeleteInput, (input) =>
  createThemesClient({ accessToken: input.accessToken, fetch: fetchFrom(input), operation: "themes.delete" })
    .delete(input)
    .then((result) => unwrap(result, "themes.delete")),
);

export const listImages = wrapTypeformAction("images.list", validateImagesListInput, (input) =>
  createImagesClient({ accessToken: input.accessToken, fetch: fetchFrom(input), operation: "images.list" })
    .list(input)
    .then((result) => unwrap(result, "images.list")),
);

export const createImage = wrapTypeformAction("images.create", validateImagesCreateInput, (input) =>
  createImagesClient({ accessToken: input.accessToken, fetch: fetchFrom(input), operation: "images.create" })
    .create(input)
    .then((result) => unwrap(result, "images.create")),
);

export const deleteImage = wrapTypeformAction("images.delete", validateImagesDeleteInput, (input) =>
  createImagesClient({ accessToken: input.accessToken, fetch: fetchFrom(input), operation: "images.delete" })
    .delete(input)
    .then((result) => unwrap(result, "images.delete")),
);

export const getImageBySize = wrapTypeformAction("images.get", validateImageSizeInput, (input) =>
  createImagesClient({ accessToken: input.accessToken, fetch: fetchFrom(input), operation: "images.get" })
    .getBySize(input, "image")
    .then((result) => unwrap(result, "images.get")),
);

export const getBackgroundBySize = wrapTypeformAction("images.background.get", validateBackgroundSizeInput, (input) =>
  createImagesClient({ accessToken: input.accessToken, fetch: fetchFrom(input), operation: "images.background.get" })
    .getBySize(input, "background")
    .then((result) => unwrap(result, "images.background.get")),
);

export const getChoiceImageBySize = wrapTypeformAction("images.choice.get", validateChoiceSizeInput, (input) =>
  createImagesClient({ accessToken: input.accessToken, fetch: fetchFrom(input), operation: "images.choice.get" })
    .getBySize(input, "choice")
    .then((result) => unwrap(result, "images.choice.get")),
);

export const getWebhook = wrapTypeformAction("webhooks.get", validateWebhooksGetInput, (input) =>
  createWebhooksClient({ accessToken: input.accessToken, fetch: fetchFrom(input) })
    .get(input)
    .then((result) => unwrap(result, "webhooks.get")),
);

export const deleteWebhook = wrapTypeformAction("webhooks.delete", validateWebhooksDeleteInput, (input) =>
  createWebhooksClient({ accessToken: input.accessToken, fetch: fetchFrom(input) })
    .delete(input)
    .then((result) => unwrap(result, "webhooks.delete")),
);

export const getFormMessages = wrapTypeformAction("forms.messages.get", validateFormMessagesGetInput, (input) =>
  createFormExtrasClient({ accessToken: input.accessToken, fetch: fetchFrom(input), operation: "forms.messages.get" })
    .getMessages(input)
    .then((result) => unwrap(result, "forms.messages.get")),
);

export const updateFormMessages = wrapTypeformAction("forms.messages.update", validateFormMessagesUpdateInput, (input) =>
  createFormExtrasClient({ accessToken: input.accessToken, fetch: fetchFrom(input), operation: "forms.messages.update" })
    .updateMessages(input)
    .then((result) => unwrap(result, "forms.messages.update")),
);

export const patchForm = wrapTypeformAction("forms.patch", validateFormsPatchInput, (input) =>
  createFormExtrasClient({ accessToken: input.accessToken, fetch: fetchFrom(input), operation: "forms.patch" })
    .patch(input)
    .then((result) => unwrap(result, "forms.patch")),
);

export const getResponseFiles = wrapTypeformAction("responses.files.get", validateResponseFilesGetInput, (input) =>
  createFormExtrasClient({ accessToken: input.accessToken, fetch: fetchFrom(input), operation: "responses.files.get" })
    .getResponseFiles(input)
    .then((result) => unwrap(result, "responses.files.get")),
);

export const uploadVideo = wrapTypeformAction("videos.upload", validateVideosUploadInput, (input) =>
  createFormExtrasClient({ accessToken: input.accessToken, fetch: fetchFrom(input), operation: "videos.upload" })
    .uploadVideo(input)
    .then((result) => unwrap(result, "videos.upload")),
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
