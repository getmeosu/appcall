// PLAT-NOCRED-1: fail closed when a required credential is missing.
//
// A connector whose manifest declares authentication must never report
// success for an action or sync it could not authenticate. Without a credential
// the operation fails with the typed MISSING_CREDENTIAL error (the code the Rust
// control plane already maps to 422, crates/appcall-api/src/lib.rs) before any
// handler or network call runs. Connectors whose auth is "none" (public
// endpoints) are unaffected.

export const MISSING_CREDENTIAL = "MISSING_CREDENTIAL";

export type MissingCredentialFailure = {
  ok: false;
  code: typeof MISSING_CREDENTIAL;
  message: string;
};

export function missingCredentialFailure(): MissingCredentialFailure {
  return {
    ok: false,
    code: MISSING_CREDENTIAL,
    message: "Connection is missing a required credential; reconnect it.",
  };
}

// Auth types whose credential bundle carries an access token. OAuth
// connections resolve to { accessToken } (crates/appcall-oauth lifecycle) and
// external bearer callers to { accessToken } (crates/appcall-actions
// credentials.rs), whatever the http.auth field is named.
const TOKEN_AUTH_TYPES = new Set(["oauth2", "bearer", "external_bearer"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function templateRoots(value: unknown): string[] {
  const text = typeof value === "string" ? value : "";
  return [...text.matchAll(/\{\{\s*([A-Za-z0-9_$-]+)/g)].map((match) => match[1] ?? "").filter(Boolean);
}

/**
 * credentialKeys returns the input keys any one of which proves a credential
 * was supplied, derived only from the manifest auth declaration:
 * the http.auth field, basic-auth templates, the access token for token auth
 * types, and required secret setup fields (top level and per route).
 *
 * `undefined` means the manifest requires no credential (auth "none" or no
 * auth block) or declares nothing a credential could be recognised by, so the
 * operation is not gated.
 */
export function credentialKeys(manifest: { auth?: unknown; http?: unknown }): string[] | undefined {
  const auth = isRecord(manifest.auth) ? manifest.auth : undefined;
  const type = typeof auth?.type === "string" ? auth.type : "none";
  if (type === "none") return undefined;
  const keys = new Set<string>();
  const httpAuth = isRecord(manifest.http) && isRecord(manifest.http.auth) ? manifest.http.auth : undefined;
  if (typeof httpAuth?.field === "string" && httpAuth.field.length > 0) keys.add(httpAuth.field);
  if (isRecord(httpAuth?.basic)) {
    for (const root of [...templateRoots(httpAuth.basic.username), ...templateRoots(httpAuth.basic.password)]) {
      keys.add(root);
    }
  }
  if (TOKEN_AUTH_TYPES.has(type)) keys.add("accessToken");
  const setup = isRecord(auth?.setup) ? auth.setup : undefined;
  const fields = [
    ...(Array.isArray(setup?.fields) ? setup.fields : []),
    ...(Array.isArray(setup?.routes)
      ? setup.routes.flatMap((route) => (isRecord(route) && Array.isArray(route.fields) ? route.fields : []))
      : []),
  ];
  for (const field of fields) {
    if (isRecord(field) && field.secret === true && field.required === true && typeof field.key === "string") {
      keys.add(field.key);
    }
  }
  return keys.size > 0 ? [...keys] : undefined;
}

export function hasCredentialInput(input: unknown, keys: readonly string[]): boolean {
  return isRecord(input) && keys.some((key) => typeof input[key] === "string" && (input[key] as string).length > 0);
}
