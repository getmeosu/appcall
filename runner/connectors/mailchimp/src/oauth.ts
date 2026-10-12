import { createHash } from "node:crypto";
import { createConnectorHttpClient } from "../../../bun/src/http";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

// MC-OAUTH-1: Mailchimp OAuth connections carry only an access token. The data
// center comes from GET https://login.mailchimp.com/oauth2/metadata
// (Authorization: OAuth <token>), cached per connection (keyed by a hash of the
// token, never the token itself). Requests then go to the resolved
// <dc>.api.mailchimp.com with Authorization: Bearer <token>. The API-key path
// (key-dc, Basic auth) is unchanged and takes precedence when an apiKey is set.

export const METADATA_HOST = "login.mailchimp.com";
const METADATA_URL = `https://${METADATA_HOST}/oauth2/metadata`;
const DATA_CENTER = /^[a-z]{2,5}[0-9]{1,3}$/;
const MAX_CACHE = 1024;
const hostCache = new Map<string, string>();

export type MailchimpCredential = { apiKey: string } | { accessToken: string };

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

export function hasMailchimpCredential(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && (nonEmpty((input as any).apiKey) || nonEmpty((input as any).accessToken));
}

export function mailchimpCredential(input: Record<string, unknown>): MailchimpCredential {
  return nonEmpty(input.apiKey) ? { apiKey: input.apiKey } : { accessToken: String(input.accessToken) };
}

const invalidMetadata = () => ({ ok: false, code: "CONNECTOR_RESPONSE_INVALID", message: "Mailchimp OAuth metadata did not name a valid data center." });

/** The API host for OAuth metadata, or a typed failure for anything but <dc>.api.mailchimp.com. */
export function hostFromMetadata(body: unknown): string {
  if (typeof body !== "object" || body === null || Array.isArray(body)) throw invalidMetadata();
  const { dc, api_endpoint: endpoint } = body as Record<string, unknown>;
  if (typeof dc !== "string" || !DATA_CENTER.test(dc)) throw invalidMetadata();
  const host = `${dc}.api.mailchimp.com`;
  if (endpoint !== undefined && (typeof endpoint !== "string" || endpoint.replace(/\/+$/, "") !== `https://${host}`)) {
    throw invalidMetadata();
  }
  return host;
}

export function clearMailchimpOAuthCache(): void {
  hostCache.clear();
}

export async function resolveOAuthHost(accessToken: string, fetchFn?: typeof fetch): Promise<string> {
  const key = createHash("sha256").update(accessToken).digest("hex");
  const cached = hostCache.get(key);
  if (cached) return cached;
  const client = createConnectorHttpClient({ allowedHosts: [METADATA_HOST], maxResponseBytes: 65536, fetch: fetchFn });
  let response;
  try {
    response = await client.fetchText(METADATA_URL, { method: "GET", headers: { Authorization: `OAuth ${accessToken}`, Accept: "application/json" } });
  } catch {
    throw { ok: false, code: "CONNECTOR_UNAVAILABLE", message: "Mailchimp OAuth metadata could not be fetched." };
  }
  if (response.status !== 200) {
    throw { ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message: "Mailchimp rejected the OAuth metadata request." };
  }
  let body: unknown;
  try { body = JSON.parse(response.body); } catch { throw invalidMetadata(); }
  const host = hostFromMetadata(body);
  if (hostCache.size >= MAX_CACHE) hostCache.delete(hostCache.keys().next().value as string);
  hostCache.set(key, host);
  return host;
}

// Compiled (declarative) operations: same manifest, Bearer auth on the token.
type Handler = (input: unknown) => unknown;
const base = compileDeclarativeConnector(manifest as never).actions as Record<string, Handler>;
const bearer = compileDeclarativeConnector({
  ...(manifest as Record<string, unknown>),
  http: { ...(manifest as any).http, auth: { field: "accessToken", in: "header", name: "Authorization", value: "Bearer {{accessToken}}" } },
} as never).actions as Record<string, Handler>;

/** Wrap every compiled op so an OAuth connection (token, no apiKey) resolves its host via metadata. */
export function compiledOAuthActions(handWritten: readonly string[]): Record<string, Handler> {
  const wrapped: Record<string, Handler> = {};
  for (const [op, handler] of Object.entries(base)) {
    if (op === "healthcheck" || handWritten.includes(op)) continue;
    wrapped[op] = (input: unknown) => {
      if (typeof input !== "object" || input === null || nonEmpty((input as any).apiKey) || !nonEmpty((input as any).accessToken)) {
        return handler(input);
      }
      const { accessToken, fetch: fetchFn, host: _ignored, ...rest } = input as Record<string, unknown>;
      // Validate synchronously first (same errors as the API-key path); the
      // credential-less probe's MISSING_CREDENTIAL rejection is absorbed.
      const probe = handler(rest);
      if (probe instanceof Promise) probe.catch(() => undefined);
      return resolveOAuthHost(accessToken as string, typeof fetchFn === "function" ? fetchFn as typeof fetch : undefined)
        .then((host) => bearer[op]!({ ...rest, accessToken, host, ...(fetchFn ? { fetch: fetchFn } : {}) }));
    };
  }
  return wrapped;
}

/** Hand-written handlers plus OAuth-aware wrappers for every other compiled op. */
export function withMailchimpOAuth<T extends Record<string, Handler>>(handWritten: T): Record<string, Handler> {
  return { ...compiledOAuthActions(Object.keys(handWritten)), ...handWritten };
}
