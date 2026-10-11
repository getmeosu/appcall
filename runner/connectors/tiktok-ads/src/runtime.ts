// TikTok Ads runtime layer (TT-0).
//
// TikTok Business API v1.3 answers most failures with HTTP 200 and a non-zero
// envelope `code`. The generic declarative compiler only sees HTTP status, and
// the hand-written handlers collapse every failure into
// CONNECTOR_UPSTREAM_ERROR. This module wraps both so that:
//
// - a permission failure (code 40001 or HTTP 403) becomes
//   CONNECTOR_CAPABILITY_MISSING with reason "permission_missing", the
//   operation's requiredScopes, and reconsentRequired: true;
// - a rate limit (code 40100 or HTTP 429) becomes CONNECTOR_RATE_LIMITED;
// - every other non-zero code (for example 40002 validation) stays
//   CONNECTOR_UPSTREAM_ERROR;
// - a compiled declarative op whose 200 response carries code != 0 now fails
//   instead of returning the error envelope as data.
//
// Successful outputs are returned unchanged.
//
// TikTok permissions are numeric developer-app permission scopes, granted to
// the app in the TikTok developer portal and accepted by the advertiser at
// authorization time. They are not OAuth scope strings, so the connect request
// carries none (auth.scopes is empty). Each operation declares the first-level
// permission it needs in `requiredScopes`, using TikTok's English names.

import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import type { DeclarativeManifest } from "../../../bun/src/declarative/types";
import manifest from "../manifest.json";

type Handler = (input: unknown) => unknown;
type Operation = { kind?: string; request?: unknown; requiredScopes?: string[] };

const operations = manifest.operations as unknown as Record<string, Operation>;
const PROVIDER = "TikTok Ads";
const CAPTURE_LIMIT_BYTES = 65536;

export const TIKTOK_PERMISSION_CODE = 40001;
export const TIKTOK_VALIDATION_CODE = 40002;
export const TIKTOK_RATE_LIMIT_CODE = 40100;

export function requiredScopesFor(operationKey: string): string[] {
  const scopes = operations[operationKey]?.requiredScopes;
  return Array.isArray(scopes) ? [...scopes] : [];
}

export type TikTokFailureKind = "permission_missing" | "rate_limited" | "upstream" | "none";

export function classifyTikTokResponse(status: number, body: unknown): TikTokFailureKind {
  const code = envelopeCode(body);
  if (status === 403 || code === TIKTOK_PERMISSION_CODE) return "permission_missing";
  if (status === 429 || code === TIKTOK_RATE_LIMIT_CODE) return "rate_limited";
  if (status < 200 || status >= 300) return "upstream";
  if (code !== undefined && code !== 0) return "upstream";
  return "none";
}

export function tiktokFailure(operationKey: string, status: number, body: unknown): Record<string, unknown> {
  const kind = classifyTikTokResponse(status, body);
  const code = envelopeCode(body);
  const message = envelopeMessage(body);
  const providerCode = code === undefined ? {} : { providerCode: code };
  if (kind === "permission_missing") {
    const requiredScopes = requiredScopesFor(operationKey);
    return {
      ok: false,
      code: "CONNECTOR_CAPABILITY_MISSING",
      reason: "permission_missing",
      // The runner wire format carries only code and message today, so the
      // message names the permission too.
      message: `${PROVIDER} permission missing for ${operationKey} (requires: ${requiredScopes.join(", ") || "unknown"}).` +
        `${message ? ` TikTok said: ${message}` : ""} Enable the permission for the developer app and have the advertiser re-authorize.`,
      status,
      ...providerCode,
      missingScopes: requiredScopes,
      requiredScopes,
      reconsentRequired: true,
    };
  }
  if (kind === "rate_limited") {
    return {
      ok: false,
      code: "CONNECTOR_RATE_LIMITED",
      message: `${PROVIDER} rate limit exceeded.`,
      retryAfterSeconds: 30,
      ...providerCode,
    };
  }
  return {
    ok: false,
    code: "CONNECTOR_UPSTREAM_ERROR",
    message: message ?? `${PROVIDER} rejected the ${operationKey} request.`,
    ...providerCode,
  };
}

type Captured = { status: number; body: Promise<unknown> };

/**
 * Wrap a handler so TikTok envelope and permission failures map to typed errors.
 * envelopeOutput: the handler returns the raw TikTok envelope as `data`
 * (compiled declarative ops), so a 200 with code != 0 is a failure.
 */
export function withTikTokErrors(operationKey: string, handler: Handler, envelopeOutput = true): Handler {
  return async (input: unknown) => {
    if (!isRecord(input) || typeof input.accessToken !== "string" || input.accessToken === "") {
      return handler(input);
    }
    const baseFetch = typeof input.fetch === "function" ? (input.fetch as typeof fetch) : fetch;
    let last: Captured | undefined;
    const capturing = (async (url: string | URL | Request, init?: RequestInit) => {
      const response = await baseFetch(url as string, init);
      last = { status: response.status, body: readPrefix(response.clone()) };
      return response;
    }) as typeof fetch;

    let output: unknown;
    try {
      output = await handler({ ...input, fetch: capturing });
    } catch (error) {
      if (last && !isTypedFailure(error)) throw error;
      if (last) {
        const body = await last.body;
        if (classifyTikTokResponse(last.status, body) !== "none") {
          throw tiktokFailure(operationKey, last.status, body);
        }
      }
      throw error;
    }
    if (envelopeOutput && isRecord(output) && output.source === "provider" && "data" in output) {
      if (classifyTikTokResponse(200, output.data) !== "none") {
        throw tiktokFailure(operationKey, 200, output.data);
      }
    }
    return output;
  };
}

/**
 * Build the full tiktok-ads action map: every manifest action compiled from its
 * `request`, overridden by the hand-written handlers, all wrapped with
 * withTikTokErrors.
 */
export function wrapActions(hand: Record<string, Handler>): Record<string, Handler> {
  const compiled = compileDeclarativeConnector(manifest as unknown as DeclarativeManifest).actions as Record<string, Handler>;
  const merged: Record<string, Handler> = { ...compiled, ...hand };
  const out: Record<string, Handler> = {};
  for (const [key, handler] of Object.entries(merged)) out[key] = withTikTokErrors(key, handler, !(key in hand));
  return out;
}

function isTypedFailure(error: unknown): boolean {
  return isRecord(error) && (error.code === "CONNECTOR_UPSTREAM_ERROR" || error.code === "CONNECTOR_RATE_LIMITED");
}

async function readPrefix(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) return undefined;
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > CAPTURE_LIMIT_BYTES) {
        await reader.cancel();
        return undefined;
      }
      chunks.push(value);
    }
  } catch {
    return undefined;
  }
  const text = new TextDecoder().decode(Buffer.concat(chunks));
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function envelopeCode(body: unknown): number | undefined {
  return isRecord(body) && typeof body.code === "number" ? body.code : undefined;
}

function envelopeMessage(body: unknown): string | undefined {
  return isRecord(body) && typeof body.message === "string" && body.message !== "" ? body.message : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
