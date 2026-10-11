// Dispatch-time input validation against each operation's manifest inputSchema.
//
// The registry validates every action and sync dispatch before the handler
// runs, whichever handler serves it: a compiled declarative handler or a
// hand-written TypeScript one. Healthchecks are the one exemption: their input
// is the stored credential bundle (the control plane's connection test sends it
// unvalidated), not caller arguments described by the operation schema. Hand-written handlers win over compiled
// ones (see declarative/loader.ts), and before this check existed they never
// saw the manifest schema. Unknown keys passed silently, and malformed input
// surfaced as a plain Error from deep inside the handler instead of
// INVALID_ACTION_INPUT.
//
// Semantics mirror the control plane validator
// (crates/appcall-connectors/src/schema.rs + appcall-actions validate_input),
// so input the control plane accepts is never rejected here:
//   - The same strict schema subset (declarative/strict-schema.ts), including
//     bounded anyOf/allOf/oneOf, with annotation keywords tolerated. Shared
//     accept/reject cases in crates/appcall-connectors/tests/schema_parity.json
//     run through both validators.
//   - Credential fields the control plane injects (auth.setup fields, routes,
//     derive, http.auth.field, accessToken; unipile account_id) and the
//     test-only `fetch` override are exempt at the top level unless the schema
//     declares them. Syncs also exempt `cursor`, which the sync worker injects.
//
// Every schema is checked when the registry is built, so a schema this
// validator cannot enforce fails registry construction loudly instead of
// silently skipping validation. Each operation's validator is compiled once,
// on first dispatch, and cached; dispatch then pays two Map lookups plus an
// input walk.

import { assertStrictSchema, compileStrictValidator } from "./declarative/strict-schema";
import { isRecord } from "./declarative/template";

export type InputValidator = (input: unknown) => void;

const RUNTIME_INPUT_KEYS = ["accessToken", "fetch"];
const CONNECTOR_RUNTIME_INPUT_KEYS: Readonly<Record<string, readonly string[]>> = {
  // The control plane re-derives account_id per channel (policy prepare_input)
  // and excludes it from schema validation.
  unipile: ["account_id"],
};
const SYNC_RUNTIME_INPUT_KEYS = ["cursor"];

export function runtimeInputKeys(manifest: { key: string; auth?: unknown; http?: unknown }, kind: unknown): Set<string> {
  const keys = new Set<string>(RUNTIME_INPUT_KEYS);
  for (const key of CONNECTOR_RUNTIME_INPUT_KEYS[manifest.key] ?? []) keys.add(key);
  if (kind === "sync") for (const key of SYNC_RUNTIME_INPUT_KEYS) keys.add(key);
  const auth = isRecord(manifest.auth) ? manifest.auth : {};
  const setup = isRecord(auth.setup) ? auth.setup : {};
  const addFields = (fields: unknown) => {
    if (!Array.isArray(fields)) return;
    for (const field of fields) if (isRecord(field) && typeof field.key === "string") keys.add(field.key);
  };
  addFields(setup.fields);
  if (Array.isArray(setup.routes)) for (const route of setup.routes) if (isRecord(route)) addFields(route.fields);
  if (Array.isArray(setup.derive)) for (const derive of setup.derive) if (isRecord(derive) && typeof derive.field === "string") keys.add(derive.field);
  const http = isRecord(manifest.http) ? manifest.http : {};
  const httpAuth = isRecord(http.auth) ? http.auth : {};
  if (typeof httpAuth.field === "string") keys.add(httpAuth.field);
  return keys;
}

type Prepared = { schema: Record<string, unknown>; credentialKeys: ReadonlySet<string> };

// InputValidators resolves the validator for a dispatch. Every inputSchema is
// checked when the registry is built (fail fast, nothing retained), and each
// operation's validator is compiled on its first dispatch and cached, so the
// cache is bounded by the number of declared operations and steady-state
// dispatch never compiles anything.
export type InputValidators = {
  get(connectorKey: string, operation: string): InputValidator | undefined;
};

export function buildInputValidators(
  manifests: ReadonlyArray<{ key: string; operations: unknown; auth?: unknown; http?: unknown }>,
): InputValidators {
  const prepared = new Map<string, Map<string, Prepared>>();
  for (const manifest of manifests) {
    const operations = isRecord(manifest.operations) ? manifest.operations : {};
    const keysByKind = new Map<unknown, ReadonlySet<string>>();
    const byOperation = new Map<string, Prepared>();
    for (const [operation, spec] of Object.entries(operations)) {
      if (!isRecord(spec) || !isRecord(spec.inputSchema)) continue;
      const schema = spec.inputSchema;
      try {
        assertStrictSchema(schema, 0, { nodes: 0 }, true);
      } catch (error) {
        throw new Error(
          `${manifest.key}.${operation}: inputSchema cannot be enforced at dispatch: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      let credentialKeys = keysByKind.get(spec.kind);
      if (!credentialKeys) {
        credentialKeys = runtimeInputKeys(manifest, spec.kind);
        keysByKind.set(spec.kind, credentialKeys);
      }
      byOperation.set(operation, { schema, credentialKeys });
    }
    prepared.set(manifest.key, byOperation);
  }

  const compiled = new Map<string, Map<string, InputValidator>>();
  return {
    get(connectorKey: string, operation: string): InputValidator | undefined {
      const cached = compiled.get(connectorKey)?.get(operation);
      if (cached) return cached;
      const entry = prepared.get(connectorKey)?.get(operation);
      if (!entry) return undefined;
      const validator = compileStrictValidator(entry.schema, { credentialKeys: entry.credentialKeys, registry: true });
      let byOperation = compiled.get(connectorKey);
      if (!byOperation) {
        byOperation = new Map();
        compiled.set(connectorKey, byOperation);
      }
      byOperation.set(operation, validator);
      return validator;
    },
  };
}

// validateDispatchInput returns null when the input satisfies the operation's
// manifest inputSchema (or the operation declares none), else the structured
// INVALID_ACTION_INPUT failure the registry returns without running the handler.
export function validateDispatchInput(
  validators: InputValidators,
  connectorKey: string,
  operation: string,
  input: unknown,
): { ok: false; code: "INVALID_ACTION_INPUT"; message: string } | null {
  const validate = validators.get(connectorKey, operation);
  if (!validate) return null;
  try {
    validate(input === undefined ? {} : input);
    return null;
  } catch (error) {
    return {
      ok: false,
      code: "INVALID_ACTION_INPUT",
      message: `${connectorKey}.${operation}: ${error instanceof Error ? error.message : "Action input is invalid."}`,
    };
  }
}
