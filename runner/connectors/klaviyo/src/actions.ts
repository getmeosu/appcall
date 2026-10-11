import { createKlaviyoClient, parseKlaviyoRateLimit, isRecord } from "./http";
import { normalizeContact } from "./objects";

// ─── Re-exports for new actions ───────────────────────────────────────────────
export {
  validateGetProfileInput,
  validateUpdateProfileInput,
  validateAddProfilesToListInput,
  validateRemoveProfilesFromListInput,
  validateDeleteProfileInput,
  validateSubscribeProfilesInput,
  getProfileFromClient,
  updateProfileFromClient,
  addProfilesToListFromClient,
  removeProfilesFromListFromClient,
  deleteProfileFromClient,
  subscribeProfilesFromClient,
} from "./profiles";
export { validateCreateListInput, validateGetListInput, createListFromClient, getListFromClient } from "./lists_actions";
export { validateCreateEventInput, validateGetEventInput, validateListEventsInput, createEventFromClient, getEventFromClient, listEventsFromClient, normalizeEvent } from "./events_actions";
export { validateGetSegmentInput, validateListSegmentsInput, getSegmentFromClient, listSegmentsFromClient, normalizeSegment } from "./segments_actions";
export { validateCreateCampaignInput, validateGetCampaignInput, validateUpdateCampaignInput, validateSendCampaignInput, createCampaignFromClient, getCampaignFromClient, updateCampaignFromClient, sendCampaignFromClient } from "./campaigns_actions";
export { validateListMetricsInput, validateGetMetricInput, listMetricsFromClient, getMetricFromClient } from "./metrics_actions";
export { validateListCatalogItemsInput, validateGetCatalogItemInput, listCatalogItemsFromClient, getCatalogItemFromClient } from "./catalog_actions";
export { validateListTemplatesInput, validateGetTemplateInput, listTemplatesFromClient, getTemplateFromClient } from "./templates_actions";
export { validateListFlowsInput, listFlowsFromClient } from "./flows_actions";

// ─── contacts.create (existing) ───────────────────────────────────────────────

export type CreateContactInput = { email: string; firstName?: string; lastName?: string; phone?: string };

export function createContact(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    const rawData = isRecord(input.data) ? input.data : undefined;
    const payload = rawData ? { email: "", firstName: undefined, lastName: undefined, phone: undefined } : validateCreateContactInput(input);
    const fetchFn = typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
    const body = rawData
      ? { data: rawData }
      : { data: { type: "profile", attributes: { email: payload.email, first_name: payload.firstName, last_name: payload.lastName, phone_number: payload.phone } } };
    return createKlaviyoClient({ apiKey: input.apiKey, fetch: fetchFn, operation: "contacts.create" })
      .fetchJSON("/profiles", {
        method: "POST",
        body: JSON.stringify(body),
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

function throwKlaviyo(err: { code: string; message: string; retryAfterSeconds?: number }): never {
  throw { ok: false, code: err.code, message: err.message, ...(err.retryAfterSeconds !== undefined ? { retryAfterSeconds: err.retryAfterSeconds } : {}) };
}

function credentialed(input: unknown): input is Record<string, unknown> & { apiKey: string } {
  return isRecord(input) && typeof input.apiKey === "string";
}

function fetchFrom(input: Record<string, unknown>): typeof fetch | undefined {
  return typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined;
}

export async function deleteProfile(input: unknown): Promise<Record<string, unknown>> {
  if (credentialed(input)) {
    const { deleteProfileFromClient } = await import("./profiles");
    const result = await deleteProfileFromClient({ apiKey: input.apiKey, fetch: fetchFrom(input) }, input);
    if (result.ok) return { connector: "klaviyo", action: "profiles.delete", source: "connector", deleted: true };
    throwKlaviyo(result.error);
  }
  const { validateDeleteProfileInput } = await import("./profiles");
  return { connector: "klaviyo", action: "profiles.delete", source: "connector", validated: validateDeleteProfileInput(input) };
}

export async function getEvent(input: unknown): Promise<Record<string, unknown>> {
  if (credentialed(input)) {
    const { getEventFromClient } = await import("./events_actions");
    const result = await getEventFromClient({ apiKey: input.apiKey, fetch: fetchFrom(input) }, input);
    if (result.ok) return { connector: "klaviyo", action: "events.get", source: "connector", event: result.event };
    throwKlaviyo(result.error);
  }
  const { validateGetEventInput } = await import("./events_actions");
  return { connector: "klaviyo", action: "events.get", source: "connector", validated: validateGetEventInput(input) };
}

export async function listEvents(input: unknown): Promise<Record<string, unknown>> {
  if (credentialed(input)) {
    const { listEventsFromClient } = await import("./events_actions");
    const result = await listEventsFromClient({ apiKey: input.apiKey, fetch: fetchFrom(input) }, input);
    if (result.ok) return { connector: "klaviyo", action: "events.list", source: "connector", events: result.events };
    throwKlaviyo(result.error);
  }
  const { validateListEventsInput } = await import("./events_actions");
  return { connector: "klaviyo", action: "events.list", source: "connector", validated: validateListEventsInput(input) };
}

export async function getCampaign(input: unknown): Promise<Record<string, unknown>> {
  if (credentialed(input)) {
    const { getCampaignFromClient } = await import("./campaigns_actions");
    const result = await getCampaignFromClient({ apiKey: input.apiKey, fetch: fetchFrom(input) }, input);
    if (result.ok) return { connector: "klaviyo", action: "campaigns.get", source: "connector", campaign: result.campaign };
    throwKlaviyo(result.error);
  }
  const { validateGetCampaignInput } = await import("./campaigns_actions");
  return { connector: "klaviyo", action: "campaigns.get", source: "connector", validated: validateGetCampaignInput(input) };
}

export async function updateCampaign(input: unknown): Promise<Record<string, unknown>> {
  if (credentialed(input)) {
    const { updateCampaignFromClient } = await import("./campaigns_actions");
    const result = await updateCampaignFromClient({ apiKey: input.apiKey, fetch: fetchFrom(input) }, input);
    if (result.ok) return { connector: "klaviyo", action: "campaigns.update", source: "connector", campaign: result.campaign };
    throwKlaviyo(result.error);
  }
  const { validateUpdateCampaignInput } = await import("./campaigns_actions");
  return { connector: "klaviyo", action: "campaigns.update", source: "connector", validated: validateUpdateCampaignInput(input) };
}

export async function sendCampaign(input: unknown): Promise<Record<string, unknown>> {
  if (credentialed(input)) {
    const { sendCampaignFromClient } = await import("./campaigns_actions");
    const result = await sendCampaignFromClient({ apiKey: input.apiKey, fetch: fetchFrom(input) }, input);
    if (result.ok) return { connector: "klaviyo", action: "campaigns.send", source: "connector", job: result.job };
    throwKlaviyo(result.error);
  }
  const { validateSendCampaignInput } = await import("./campaigns_actions");
  return { connector: "klaviyo", action: "campaigns.send", source: "connector", validated: validateSendCampaignInput(input) };
}

export async function listMetrics(input: unknown): Promise<Record<string, unknown>> {
  if (credentialed(input)) {
    const { listMetricsFromClient } = await import("./metrics_actions");
    const result = await listMetricsFromClient({ apiKey: input.apiKey, fetch: fetchFrom(input) }, input);
    if (result.ok) return { connector: "klaviyo", action: "metrics.list", source: "connector", metrics: result.metrics };
    throwKlaviyo(result.error);
  }
  const { validateListMetricsInput } = await import("./metrics_actions");
  return { connector: "klaviyo", action: "metrics.list", source: "connector", validated: validateListMetricsInput(input) };
}

export async function getMetric(input: unknown): Promise<Record<string, unknown>> {
  if (credentialed(input)) {
    const { getMetricFromClient } = await import("./metrics_actions");
    const result = await getMetricFromClient({ apiKey: input.apiKey, fetch: fetchFrom(input) }, input);
    if (result.ok) return { connector: "klaviyo", action: "metrics.get", source: "connector", metric: result.metric };
    throwKlaviyo(result.error);
  }
  const { validateGetMetricInput } = await import("./metrics_actions");
  return { connector: "klaviyo", action: "metrics.get", source: "connector", validated: validateGetMetricInput(input) };
}

export async function listCatalogItems(input: unknown): Promise<Record<string, unknown>> {
  if (credentialed(input)) {
    const { listCatalogItemsFromClient } = await import("./catalog_actions");
    const result = await listCatalogItemsFromClient({ apiKey: input.apiKey, fetch: fetchFrom(input) }, input);
    if (result.ok) return { connector: "klaviyo", action: "catalog.items.list", source: "connector", items: result.items };
    throwKlaviyo(result.error);
  }
  const { validateListCatalogItemsInput } = await import("./catalog_actions");
  return { connector: "klaviyo", action: "catalog.items.list", source: "connector", validated: validateListCatalogItemsInput(input) };
}

export async function getCatalogItem(input: unknown): Promise<Record<string, unknown>> {
  if (credentialed(input)) {
    const { getCatalogItemFromClient } = await import("./catalog_actions");
    const result = await getCatalogItemFromClient({ apiKey: input.apiKey, fetch: fetchFrom(input) }, input);
    if (result.ok) return { connector: "klaviyo", action: "catalog.items.get", source: "connector", item: result.item };
    throwKlaviyo(result.error);
  }
  const { validateGetCatalogItemInput } = await import("./catalog_actions");
  return { connector: "klaviyo", action: "catalog.items.get", source: "connector", validated: validateGetCatalogItemInput(input) };
}

export async function listSegments(input: unknown): Promise<Record<string, unknown>> {
  if (credentialed(input)) {
    const { listSegmentsFromClient } = await import("./segments_actions");
    const result = await listSegmentsFromClient({ apiKey: input.apiKey, fetch: fetchFrom(input) }, input);
    if (result.ok) return { connector: "klaviyo", action: "segments.list", source: "connector", segments: result.segments };
    throwKlaviyo(result.error);
  }
  const { validateListSegmentsInput } = await import("./segments_actions");
  return { connector: "klaviyo", action: "segments.list", source: "connector", validated: validateListSegmentsInput(input) };
}

export async function listTemplates(input: unknown): Promise<Record<string, unknown>> {
  if (credentialed(input)) {
    const { listTemplatesFromClient } = await import("./templates_actions");
    const result = await listTemplatesFromClient({ apiKey: input.apiKey, fetch: fetchFrom(input) }, input);
    if (result.ok) return { connector: "klaviyo", action: "templates.list", source: "connector", templates: result.templates };
    throwKlaviyo(result.error);
  }
  const { validateListTemplatesInput } = await import("./templates_actions");
  return { connector: "klaviyo", action: "templates.list", source: "connector", validated: validateListTemplatesInput(input) };
}

export async function getTemplate(input: unknown): Promise<Record<string, unknown>> {
  if (credentialed(input)) {
    const { getTemplateFromClient } = await import("./templates_actions");
    const result = await getTemplateFromClient({ apiKey: input.apiKey, fetch: fetchFrom(input) }, input);
    if (result.ok) return { connector: "klaviyo", action: "templates.get", source: "connector", template: result.template };
    throwKlaviyo(result.error);
  }
  const { validateGetTemplateInput } = await import("./templates_actions");
  return { connector: "klaviyo", action: "templates.get", source: "connector", validated: validateGetTemplateInput(input) };
}

export async function listFlows(input: unknown): Promise<Record<string, unknown>> {
  if (credentialed(input)) {
    const { listFlowsFromClient } = await import("./flows_actions");
    const result = await listFlowsFromClient({ apiKey: input.apiKey, fetch: fetchFrom(input) }, input);
    if (result.ok) return { connector: "klaviyo", action: "flows.list", source: "connector", flows: result.flows };
    throwKlaviyo(result.error);
  }
  const { validateListFlowsInput } = await import("./flows_actions");
  return { connector: "klaviyo", action: "flows.list", source: "connector", validated: validateListFlowsInput(input) };
}

export async function subscribeProfiles(input: unknown): Promise<Record<string, unknown>> {
  if (credentialed(input)) {
    const { subscribeProfilesFromClient } = await import("./profiles");
    const result = await subscribeProfilesFromClient({ apiKey: input.apiKey, fetch: fetchFrom(input) }, input);
    if (result.ok) return { connector: "klaviyo", action: "profiles.subscribe", source: "connector", job: result.job };
    throwKlaviyo(result.error);
  }
  const { validateSubscribeProfilesInput } = await import("./profiles");
  return { connector: "klaviyo", action: "profiles.subscribe", source: "connector", validated: validateSubscribeProfilesInput(input) };
}

function requireString(v: unknown, f: string): string {
  if (typeof v !== "string" || !v.length) throw new Error(`${f} is required`);
  return v;
}
