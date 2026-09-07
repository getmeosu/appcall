import { createKlaviyoClient, parseKlaviyoRateLimit, isRecord } from "./http";
import { normalizeContact } from "./objects";

// ─── Re-exports for new actions ───────────────────────────────────────────────
export {
  validateGetProfileInput,
  validateUpdateProfileInput,
  validateAddProfilesToListInput,
  validateRemoveProfilesFromListInput,
  getProfileFromClient,
  updateProfileFromClient,
  addProfilesToListFromClient,
  removeProfilesFromListFromClient,
} from "./profiles";
export { validateCreateListInput, validateGetListInput, createListFromClient, getListFromClient } from "./lists_actions";
export { validateCreateEventInput, createEventFromClient, normalizeEvent } from "./events_actions";
export { validateGetSegmentInput, getSegmentFromClient, normalizeSegment } from "./segments_actions";
export { validateCreateCampaignInput, createCampaignFromClient } from "./campaigns_actions";

// ─── contacts.create (existing) ───────────────────────────────────────────────

export type CreateContactInput = { email: string; firstName?: string; lastName?: string; phone?: string };

export function createContact(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    const payload = validateCreateContactInput(input);
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    return createKlaviyoClient({ apiKey: input.apiKey, fetch: fetchFn, operation: "contacts.create" })
      .fetchJSON("/profiles", {
        method: "POST",
        body: JSON.stringify({ data: { type: "profile", attributes: { email: payload.email, first_name: payload.firstName, last_name: payload.lastName, phone_number: payload.phone } } }),
      })
      .then((result) => {
        if (result.status === 200 || result.status === 201) {
          const body = result.body as any;
          const created = isRecord(body) && isRecord(body.data) ? body.data : { id: payload.email, attributes: { email: payload.email } };
          return { connector: "klaviyo", action: "contacts.create", source: "connector", contact: normalizeContact(created) };
        }
        const rl = parseKlaviyoRateLimit(result.status, result.headers);
        if (rl.limited) throw { ok: false, code: "CONNECTOR_RATE_LIMITED", message: "Klaviyo rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds };
        throw { ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message: "Klaviyo rejected the request." };
      });
  }
  return { connector: "klaviyo", action: "contacts.create", source: "connector", validated: validateCreateContactInput(input) };
}

function validateCreateContactInput(input: unknown): CreateContactInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  return {
    email: requireString(input.email, "email"),
    firstName: typeof input.firstName === "string" ? input.firstName : undefined,
    lastName: typeof input.lastName === "string" ? input.lastName : undefined,
    phone: typeof input.phone === "string" ? input.phone : undefined,
  };
}

// ─── profiles.get ─────────────────────────────────────────────────────────────

export async function getProfile(input: unknown): Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    const { getProfileFromClient } = await import("./profiles");
    const result = await getProfileFromClient({ apiKey: input.apiKey as string, fetch: fetchFn }, input);
    if (result.ok) return { connector: "klaviyo", action: "profiles.get", source: "connector", profile: result.profile };
    const err = result.error;
    throw { ok: false, code: err.code, message: err.message, ...(err.retryAfterSeconds !== undefined ? { retryAfterSeconds: err.retryAfterSeconds } : {}) };
  }
  const { validateGetProfileInput } = await import("./profiles");
  return { connector: "klaviyo", action: "profiles.get", source: "connector", validated: validateGetProfileInput(input) };
}

// ─── profiles.update ──────────────────────────────────────────────────────────

export async function updateProfile(input: unknown): Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    const { updateProfileFromClient } = await import("./profiles");
    const result = await updateProfileFromClient({ apiKey: input.apiKey as string, fetch: fetchFn }, input);
    if (result.ok) return { connector: "klaviyo", action: "profiles.update", source: "connector", profile: result.profile };
    const err = result.error;
    throw { ok: false, code: err.code, message: err.message, ...(err.retryAfterSeconds !== undefined ? { retryAfterSeconds: err.retryAfterSeconds } : {}) };
  }
  const { validateUpdateProfileInput } = await import("./profiles");
  return { connector: "klaviyo", action: "profiles.update", source: "connector", validated: validateUpdateProfileInput(input) };
}

// ─── lists.create ─────────────────────────────────────────────────────────────

export async function createList(input: unknown): Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    const { createListFromClient } = await import("./lists_actions");
    const result = await createListFromClient({ apiKey: input.apiKey as string, fetch: fetchFn }, input);
    if (result.ok) return { connector: "klaviyo", action: "lists.create", source: "connector", list: result.list };
    const err = result.error;
    throw { ok: false, code: err.code, message: err.message, ...(err.retryAfterSeconds !== undefined ? { retryAfterSeconds: err.retryAfterSeconds } : {}) };
  }
  const { validateCreateListInput } = await import("./lists_actions");
  return { connector: "klaviyo", action: "lists.create", source: "connector", validated: validateCreateListInput(input) };
}

// ─── lists.get ────────────────────────────────────────────────────────────────

export async function getList(input: unknown): Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    const { getListFromClient } = await import("./lists_actions");
    const result = await getListFromClient({ apiKey: input.apiKey as string, fetch: fetchFn }, input);
    if (result.ok) return { connector: "klaviyo", action: "lists.get", source: "connector", list: result.list };
    const err = result.error;
    throw { ok: false, code: err.code, message: err.message, ...(err.retryAfterSeconds !== undefined ? { retryAfterSeconds: err.retryAfterSeconds } : {}) };
  }
  const { validateGetListInput } = await import("./lists_actions");
  return { connector: "klaviyo", action: "lists.get", source: "connector", validated: validateGetListInput(input) };
}

// ─── profiles.addToList ───────────────────────────────────────────────────────

export async function addProfilesToList(input: unknown): Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    const { addProfilesToListFromClient } = await import("./profiles");
    const result = await addProfilesToListFromClient({ apiKey: input.apiKey as string, fetch: fetchFn }, input);
    if (result.ok) return { connector: "klaviyo", action: "profiles.addToList", source: "connector", added: result.added };
    const err = result.error;
    throw { ok: false, code: err.code, message: err.message, ...(err.retryAfterSeconds !== undefined ? { retryAfterSeconds: err.retryAfterSeconds } : {}) };
  }
  const { validateAddProfilesToListInput } = await import("./profiles");
  return { connector: "klaviyo", action: "profiles.addToList", source: "connector", validated: validateAddProfilesToListInput(input) };
}

// ─── profiles.removeFromList ──────────────────────────────────────────────────

export async function removeProfilesFromList(input: unknown): Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    const { removeProfilesFromListFromClient } = await import("./profiles");
    const result = await removeProfilesFromListFromClient({ apiKey: input.apiKey as string, fetch: fetchFn }, input);
    if (result.ok) return { connector: "klaviyo", action: "profiles.removeFromList", source: "connector", removed: result.removed };
    const err = result.error;
    throw { ok: false, code: err.code, message: err.message, ...(err.retryAfterSeconds !== undefined ? { retryAfterSeconds: err.retryAfterSeconds } : {}) };
  }
  const { validateRemoveProfilesFromListInput } = await import("./profiles");
  return { connector: "klaviyo", action: "profiles.removeFromList", source: "connector", validated: validateRemoveProfilesFromListInput(input) };
}

// ─── events.create ────────────────────────────────────────────────────────────

export async function createEvent(input: unknown): Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    const { createEventFromClient } = await import("./events_actions");
    const result = await createEventFromClient({ apiKey: input.apiKey as string, fetch: fetchFn }, input);
    if (result.ok) return { connector: "klaviyo", action: "events.create", source: "connector", event: result.event };
    const err = result.error;
    throw { ok: false, code: err.code, message: err.message, ...(err.retryAfterSeconds !== undefined ? { retryAfterSeconds: err.retryAfterSeconds } : {}) };
  }
  const { validateCreateEventInput } = await import("./events_actions");
  return { connector: "klaviyo", action: "events.create", source: "connector", validated: validateCreateEventInput(input) };
}

// ─── segments.get ─────────────────────────────────────────────────────────────

export async function getSegment(input: unknown): Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    const { getSegmentFromClient } = await import("./segments_actions");
    const result = await getSegmentFromClient({ apiKey: input.apiKey as string, fetch: fetchFn }, input);
    if (result.ok) return { connector: "klaviyo", action: "segments.get", source: "connector", segment: result.segment };
    const err = result.error;
    throw { ok: false, code: err.code, message: err.message, ...(err.retryAfterSeconds !== undefined ? { retryAfterSeconds: err.retryAfterSeconds } : {}) };
  }
  const { validateGetSegmentInput } = await import("./segments_actions");
  return { connector: "klaviyo", action: "segments.get", source: "connector", validated: validateGetSegmentInput(input) };
}

// ─── campaigns.create ─────────────────────────────────────────────────────────

export async function createCampaign(input: unknown): Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    const { createCampaignFromClient } = await import("./campaigns_actions");
    const result = await createCampaignFromClient({ apiKey: input.apiKey as string, fetch: fetchFn }, input);
    if (result.ok) return { connector: "klaviyo", action: "campaigns.create", source: "connector", campaign: result.campaign };
    const err = result.error;
    throw { ok: false, code: err.code, message: err.message, ...(err.retryAfterSeconds !== undefined ? { retryAfterSeconds: err.retryAfterSeconds } : {}) };
  }
  const { validateCreateCampaignInput } = await import("./campaigns_actions");
  return { connector: "klaviyo", action: "campaigns.create", source: "connector", validated: validateCreateCampaignInput(input) };
}

function requireString(v: unknown, f: string): string {
  if (typeof v !== "string" || !v.length) throw new Error(`${f} is required`);
  return v;
}
