import { createKlaviyoClient, parseKlaviyoRateLimit, prop, isRecord } from "./http";
import { normalizeContact, type NormalizedContact } from "./objects";

// ─── profiles.get ─────────────────────────────────────────────────────────────

export type GetProfileInput = { profileId: string };

export function validateGetProfileInput(input: unknown): GetProfileInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  return { profileId: requireString(input.profileId, "profileId") };
}

export async function getProfileFromClient(
  options: { apiKey: string; fetch?: typeof fetch },
  input: unknown
): Promise<{ ok: true; profile: NormalizedContact } | { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } }> {
  const payload = validateGetProfileInput(input);
  const client = createKlaviyoClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "profiles.get" });
  const result = await client.fetchJSON(`/profiles/${payload.profileId}`);
  if (result.status === 200) {
    const body = result.body as Record<string, unknown>;
    const data = isRecord(body.data) ? body.data : { id: payload.profileId, attributes: {} };
    return { ok: true, profile: normalizeContact(data) };
  }
  const rl = parseKlaviyoRateLimit(result.status, result.headers);
  if (rl.limited) return { ok: false, error: { code: "CONNECTOR_RATE_LIMITED", message: "Klaviyo rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
  if (result.status === 404) return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Profile not found." } };
  return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Klaviyo rejected the get profile request." } };
}

// ─── profiles.update ──────────────────────────────────────────────────────────

export type UpdateProfileInput = {
  profileId: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  properties?: Record<string, unknown>;
};

export function validateUpdateProfileInput(input: unknown): UpdateProfileInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  return {
    profileId: requireString(input.profileId, "profileId"),
    email: typeof input.email === "string" ? input.email : undefined,
    firstName: typeof input.firstName === "string" ? input.firstName : undefined,
    lastName: typeof input.lastName === "string" ? input.lastName : undefined,
    phone: typeof input.phone === "string" ? input.phone : undefined,
    properties: isRecord(input.properties) ? (input.properties as Record<string, unknown>) : undefined,
  };
}

export async function updateProfileFromClient(
  options: { apiKey: string; fetch?: typeof fetch },
  input: unknown
): Promise<{ ok: true; profile: NormalizedContact } | { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } }> {
  const payload = validateUpdateProfileInput(input);
  const client = createKlaviyoClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "profiles.update" });
  const attrs: Record<string, unknown> = {};
  if (payload.email !== undefined) attrs.email = payload.email;
  if (payload.firstName !== undefined) attrs.first_name = payload.firstName;
  if (payload.lastName !== undefined) attrs.last_name = payload.lastName;
  if (payload.phone !== undefined) attrs.phone_number = payload.phone;
  if (payload.properties !== undefined) attrs.properties = payload.properties;
  const result = await client.fetchJSON(`/profiles/${payload.profileId}`, {
    method: "PATCH",
    body: JSON.stringify({ data: { type: "profile", id: payload.profileId, attributes: attrs } }),
  });
  if (result.status === 200) {
    const body = result.body as Record<string, unknown>;
    const data = isRecord(body.data) ? body.data : { id: payload.profileId, attributes: attrs };
    return { ok: true, profile: normalizeContact(data) };
  }
  const rl = parseKlaviyoRateLimit(result.status, result.headers);
  if (rl.limited) return { ok: false, error: { code: "CONNECTOR_RATE_LIMITED", message: "Klaviyo rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
  if (result.status === 404) return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Profile not found." } };
  return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Klaviyo rejected the update profile request." } };
}

// ─── profiles.addToList ───────────────────────────────────────────────────────

export type AddProfilesToListInput = { listId: string; profileIds: string[] };

export function validateAddProfilesToListInput(input: unknown): AddProfilesToListInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  if (!Array.isArray(input.profileIds) || input.profileIds.length === 0) throw new Error("profileIds must be a non-empty array");
  return {
    listId: requireString(input.listId, "listId"),
    profileIds: (input.profileIds as unknown[]).filter((id): id is string => typeof id === "string"),
  };
}

export async function addProfilesToListFromClient(
  options: { apiKey: string; fetch?: typeof fetch },
  input: unknown
): Promise<{ ok: true; added: number } | { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } }> {
  const payload = validateAddProfilesToListInput(input);
  const client = createKlaviyoClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "profiles.addToList" });
  const result = await client.fetchJSON(`/lists/${payload.listId}/relationships/profiles`, {
    method: "POST",
    body: JSON.stringify({ data: payload.profileIds.map((id) => ({ type: "profile", id })) }),
  });
  // 204 = success (no body), 200 also acceptable
  if (result.status === 204 || result.status === 200) {
    return { ok: true, added: payload.profileIds.length };
  }
  const rl = parseKlaviyoRateLimit(result.status, result.headers);
  if (rl.limited) return { ok: false, error: { code: "CONNECTOR_RATE_LIMITED", message: "Klaviyo rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
  if (result.status === 404) return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "List not found." } };
  return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Klaviyo rejected the add profiles to list request." } };
}

// ─── profiles.removeFromList ──────────────────────────────────────────────────

export type RemoveProfilesFromListInput = { listId: string; profileIds: string[] };

export function validateRemoveProfilesFromListInput(input: unknown): RemoveProfilesFromListInput {
  if (!isRecord(input)) throw new Error("input must be an object");
  if (!Array.isArray(input.profileIds) || input.profileIds.length === 0) throw new Error("profileIds must be a non-empty array");
  return {
    listId: requireString(input.listId, "listId"),
    profileIds: (input.profileIds as unknown[]).filter((id): id is string => typeof id === "string"),
  };
}

export async function removeProfilesFromListFromClient(
  options: { apiKey: string; fetch?: typeof fetch },
  input: unknown
): Promise<{ ok: true; removed: number } | { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } }> {
  const payload = validateRemoveProfilesFromListInput(input);
  const client = createKlaviyoClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "profiles.removeFromList" });
  const result = await client.fetchJSON(`/lists/${payload.listId}/relationships/profiles`, {
    method: "DELETE",
    body: JSON.stringify({ data: payload.profileIds.map((id) => ({ type: "profile", id })) }),
  });
  // 204 = success (no body)
  if (result.status === 204 || result.status === 200) {
    return { ok: true, removed: payload.profileIds.length };
  }
  const rl = parseKlaviyoRateLimit(result.status, result.headers);
  if (rl.limited) return { ok: false, error: { code: "CONNECTOR_RATE_LIMITED", message: "Klaviyo rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
  if (result.status === 404) return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "List not found." } };
  return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Klaviyo rejected the remove profiles from list request." } };
}

function requireString(v: unknown, f: string): string {
  if (typeof v !== "string" || !v.length) throw new Error(`${f} is required`);
  return v;
}
