import { createWhatsAppMessagesClient, validateSendMessageInput } from "./messages";
import {
  createSendTemplateClient, validateSendTemplateInput,
  createSendImageClient, validateSendImageInput,
  createSendDocumentClient, validateSendDocumentInput,
  createSendLocationClient, validateSendLocationInput,
  createSendContactsClient, validateSendContactsInput,
  createSendReactionClient, validateSendReactionInput,
  createMarkReadClient, validateMarkReadInput,
  createSendInteractiveClient, validateSendInteractiveInput,
} from "./media_messages";
import {
  createGetMessageClient, validateGetMessageInput,
  createListTemplatesClient, validateListTemplatesInput,
  createGetMediaClient, validateGetMediaInput,
  createUploadMediaClient, validateUploadMediaInput,
  createDeleteMediaClient, validateDeleteMediaInput,
  createSendAudioClient, validateSendAudioInput,
  createSendVideoClient, validateSendVideoInput,
  createGetBusinessProfileClient, validateGetBusinessProfileInput,
  createUpdateBusinessProfileClient, validateUpdateBusinessProfileInput,
  createGetPhoneNumberClient, validateGetPhoneNumberInput,
} from "./cloud";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string") throw new Error(`${field} is required`);
  return value;
}

// ─── messages.send ────────────────────────────────────────────────────────────

export function sendMessage(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createWhatsAppMessagesClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).send(input).then((result) => {
      if (!result.ok) {
        throw {
          ok: false,
          code: result.error.code,
          message: result.error.message,
          retryAfterSeconds: result.error.retryAfterSeconds,
          providerError: result.error.providerError,
        };
      }
      return {
        connector: "whatsapp",
        action: "messages.send",
        source: "connector",
        providerMessageId: result.message.providerMessageId,
        channelId: result.message.channelId,
        text: result.message.text,
        raw: result.message.raw,
      };
    });
  }

  return {
    connector: "whatsapp",
    action: "messages.send",
    source: "connector",
    validated: validateSendMessageInput(input),
  };
}

// ─── credentials.validate ─────────────────────────────────────────────────────

export function validateCredentials(input: unknown): Record<string, unknown> {
  const credentials = validateCredentialInput(input);
  return {
    connector: "whatsapp",
    action: "credentials.validate",
    source: "connector",
    valid: true,
    phoneNumberId: credentials.phoneNumberId,
  };
}

function validateCredentialInput(input: unknown): { accessToken: string; phoneNumberId: string } {
  if (!isRecord(input)) throw new Error("credentials input must be an object");
  const accessToken = requireString(input.accessToken, "accessToken").trim();
  const phoneNumberId = requireString(input.phoneNumberId, "phoneNumberId").trim();
  if (accessToken.length === 0) throw new Error("accessToken is required");
  if (phoneNumberId.length === 0) throw new Error("phoneNumberId is required");
  return { accessToken, phoneNumberId };
}

// ─── messages.sendTemplate ────────────────────────────────────────────────────

export function sendTemplate(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createSendTemplateClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).sendTemplate(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds, providerError: result.error.providerError };
      return { connector: "whatsapp", action: "messages.sendTemplate", source: "connector", providerMessageId: result.providerMessageId, channelId: result.channelId, raw: result.raw };
    });
  }
  return { connector: "whatsapp", action: "messages.sendTemplate", source: "connector", validated: validateSendTemplateInput(input) };
}

// ─── messages.sendImage ───────────────────────────────────────────────────────

export function sendImage(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createSendImageClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).sendImage(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds, providerError: result.error.providerError };
      return { connector: "whatsapp", action: "messages.sendImage", source: "connector", providerMessageId: result.providerMessageId, channelId: result.channelId, raw: result.raw };
    });
  }
  return { connector: "whatsapp", action: "messages.sendImage", source: "connector", validated: validateSendImageInput(input) };
}

// ─── messages.sendDocument ────────────────────────────────────────────────────

export function sendDocument(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createSendDocumentClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).sendDocument(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds, providerError: result.error.providerError };
      return { connector: "whatsapp", action: "messages.sendDocument", source: "connector", providerMessageId: result.providerMessageId, channelId: result.channelId, raw: result.raw };
    });
  }
  return { connector: "whatsapp", action: "messages.sendDocument", source: "connector", validated: validateSendDocumentInput(input) };
}

// ─── messages.sendLocation ────────────────────────────────────────────────────

export function sendLocation(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createSendLocationClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).sendLocation(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds, providerError: result.error.providerError };
      return { connector: "whatsapp", action: "messages.sendLocation", source: "connector", providerMessageId: result.providerMessageId, channelId: result.channelId, raw: result.raw };
    });
  }
  return { connector: "whatsapp", action: "messages.sendLocation", source: "connector", validated: validateSendLocationInput(input) };
}

// ─── messages.sendContacts ────────────────────────────────────────────────────

export function sendContacts(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createSendContactsClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).sendContacts(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds, providerError: result.error.providerError };
      return { connector: "whatsapp", action: "messages.sendContacts", source: "connector", providerMessageId: result.providerMessageId, channelId: result.channelId, raw: result.raw };
    });
  }
  return { connector: "whatsapp", action: "messages.sendContacts", source: "connector", validated: validateSendContactsInput(input) };
}

// ─── messages.sendReaction ────────────────────────────────────────────────────

export function sendReaction(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createSendReactionClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).sendReaction(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds, providerError: result.error.providerError };
      return { connector: "whatsapp", action: "messages.sendReaction", source: "connector", providerMessageId: result.providerMessageId, channelId: result.channelId, raw: result.raw };
    });
  }
  return { connector: "whatsapp", action: "messages.sendReaction", source: "connector", validated: validateSendReactionInput(input) };
}

// ─── messages.markRead ────────────────────────────────────────────────────────

export function markRead(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createMarkReadClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).markRead(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds, providerError: result.error.providerError };
      return { connector: "whatsapp", action: "messages.markRead", source: "connector", success: result.success, raw: result.raw };
    });
  }
  return { connector: "whatsapp", action: "messages.markRead", source: "connector", validated: validateMarkReadInput(input) };
}

// ─── messages.sendInteractive ─────────────────────────────────────────────────

export function sendInteractive(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createSendInteractiveClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).sendInteractive(input).then((result) => {
      if (!result.ok) throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds, providerError: result.error.providerError };
      return { connector: "whatsapp", action: "messages.sendInteractive", source: "connector", providerMessageId: result.providerMessageId, channelId: result.channelId, raw: result.raw };
    });
  }
  return { connector: "whatsapp", action: "messages.sendInteractive", source: "connector", validated: validateSendInteractiveInput(input) };
}

function throwUpstream(result: { error: { code: string; message: string; retryAfterSeconds?: number; providerError?: string } }): never {
  throw {
    ok: false,
    code: result.error.code,
    message: result.error.message,
    retryAfterSeconds: result.error.retryAfterSeconds,
    providerError: result.error.providerError,
  };
}

export function getMessage(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createGetMessageClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).getMessage(input).then((result) => {
      if (!result.ok) throwUpstream(result);
      return { connector: "whatsapp", action: "messages.get", source: "connector", message: result.message };
    });
  }
  return { connector: "whatsapp", action: "messages.get", source: "connector", validated: validateGetMessageInput(input) };
}

export function listTemplates(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createListTemplatesClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).listTemplates(input).then((result) => {
      if (!result.ok) throwUpstream(result);
      return { connector: "whatsapp", action: "templates.list", source: "connector", templates: result.templates, paging: result.paging, raw: result.raw };
    });
  }
  return { connector: "whatsapp", action: "templates.list", source: "connector", validated: validateListTemplatesInput(input) };
}

export function getMedia(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createGetMediaClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).getMedia(input).then((result) => {
      if (!result.ok) throwUpstream(result);
      return { connector: "whatsapp", action: "media.get", source: "connector", media: result.media };
    });
  }
  return { connector: "whatsapp", action: "media.get", source: "connector", validated: validateGetMediaInput(input) };
}

export function uploadMedia(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createUploadMediaClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).uploadMedia(input).then((result) => {
      if (!result.ok) throwUpstream(result);
      return { connector: "whatsapp", action: "media.upload", source: "connector", mediaId: result.mediaId, raw: result.raw };
    });
  }
  return { connector: "whatsapp", action: "media.upload", source: "connector", validated: validateUploadMediaInput(input) };
}

export function deleteMedia(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createDeleteMediaClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).deleteMedia(input).then((result) => {
      if (!result.ok) throwUpstream(result);
      return { connector: "whatsapp", action: "media.delete", source: "connector", success: result.success, raw: result.raw };
    });
  }
  return { connector: "whatsapp", action: "media.delete", source: "connector", validated: validateDeleteMediaInput(input) };
}

export function sendAudio(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createSendAudioClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).sendAudio(input).then((result) => {
      if (!result.ok) throwUpstream(result);
      return { connector: "whatsapp", action: "messages.sendAudio", source: "connector", providerMessageId: result.providerMessageId, channelId: result.channelId, raw: result.raw };
    });
  }
  return { connector: "whatsapp", action: "messages.sendAudio", source: "connector", validated: validateSendAudioInput(input) };
}

export function sendVideo(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createSendVideoClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).sendVideo(input).then((result) => {
      if (!result.ok) throwUpstream(result);
      return { connector: "whatsapp", action: "messages.sendVideo", source: "connector", providerMessageId: result.providerMessageId, channelId: result.channelId, raw: result.raw };
    });
  }
  return { connector: "whatsapp", action: "messages.sendVideo", source: "connector", validated: validateSendVideoInput(input) };
}

export function getBusinessProfile(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createGetBusinessProfileClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).getBusinessProfile(input).then((result) => {
      if (!result.ok) throwUpstream(result);
      return { connector: "whatsapp", action: "businessProfile.get", source: "connector", profile: result.profile, raw: result.raw };
    });
  }
  return { connector: "whatsapp", action: "businessProfile.get", source: "connector", validated: validateGetBusinessProfileInput(input) };
}

export function updateBusinessProfile(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createUpdateBusinessProfileClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).updateBusinessProfile(input).then((result) => {
      if (!result.ok) throwUpstream(result);
      return { connector: "whatsapp", action: "businessProfile.update", source: "connector", success: result.success, raw: result.raw };
    });
  }
  return { connector: "whatsapp", action: "businessProfile.update", source: "connector", validated: validateUpdateBusinessProfileInput(input) };
}

export function getPhoneNumber(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.accessToken === "string") {
    return createGetPhoneNumberClient({
      accessToken: input.accessToken,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).getPhoneNumber(input).then((result) => {
      if (!result.ok) throwUpstream(result);
      return { connector: "whatsapp", action: "phoneNumbers.get", source: "connector", phoneNumber: result.phoneNumber };
    });
  }
  return { connector: "whatsapp", action: "phoneNumbers.get", source: "connector", validated: validateGetPhoneNumberInput(input) };
}
