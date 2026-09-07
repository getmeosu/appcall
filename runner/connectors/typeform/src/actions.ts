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
} from "./webhooks";

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
