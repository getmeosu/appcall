// PLAT-OUT-1: runner bookkeeping (connector / action / source) must not be
// merged into the handler output. The Rust host validates `result.output`
// against the operation's declared outputSchema (appcall-actions
// service.rs -> appcall_connectors schema.rs), and a closed schema
// (additionalProperties: false) rejects any key it does not declare.
//
// The declarative compiler still returns its historical
// { connector, action, source, ...result } object, because in-process callers
// (registry healthcheck enforcement, connector tests) read those keys. It
// records which keys it injected under a non-enumerable symbol, so the server
// can move exactly those keys to the RPC result envelope and send the bare
// handler output. A handler's own key with the same name is never touched.

const OPERATION_METADATA = Symbol.for("appcall.runner.operationMetadataKeys");

export function markOperationMetadata<T extends Record<string, unknown>>(output: T, injectedKeys: readonly string[]): T {
  Object.defineProperty(output, OPERATION_METADATA, { value: Object.freeze([...injectedKeys]), enumerable: false });
  return output;
}

export function splitOperationMetadata(output: unknown): { output: unknown; metadata: Record<string, unknown> } {
  if (output === null || typeof output !== "object" || Array.isArray(output)) return { output, metadata: {} };
  const keys = (output as Record<PropertyKey, unknown>)[OPERATION_METADATA];
  if (!Array.isArray(keys) || keys.length === 0) return { output, metadata: {} };
  const bare: Record<string, unknown> = { ...(output as Record<string, unknown>) };
  const metadata: Record<string, unknown> = {};
  for (const key of keys) {
    if (typeof key === "string" && Object.hasOwn(bare, key)) {
      metadata[key] = bare[key];
      delete bare[key];
    }
  }
  return { output: bare, metadata };
}
