// Declarative connector types.
//
// A declarative connector is data, not code: `manifest.json` alone describes
// how each operation talks to the provider, and the runner compiles handlers
// from it at startup. Two blocks extend the core manifest, both additive and
// both ignored by the Go control plane's lenient manifest decoding:
//
//   - connector-level `http`: base URL, credential placement, shared headers,
//     and how the provider reports rate limits and errors.
//   - operation-level `request`: method, path, query, body, success statuses,
//     and how the response maps to the operation's result.

import type { JSONSchema } from "./validate";

export type DeclarativeAuthPlacement = "header" | "query";

export type DeclarativeAuth = {
  // field names the input key that carries the credential. Its presence is
  // what separates a live provider call from the fixture-safe validated echo,
  // mirroring the `typeof input.apiKey === "string"` guard hand-written
  // connectors use.
  field: string;
  in?: DeclarativeAuthPlacement;
  name?: string;
  value?: string;
};

export type DeclarativeErrors = {
  rateLimitStatuses?: number[];
  retryAfterHeader?: string;
  // retryAfterKind says how to read that header. "seconds" is the RFC 7231
  // delta most providers send; "unix" is the absolute epoch-second reset time
  // that ClickUp, GitHub, and Twitter send instead, which taken as a delta
  // would ask a caller to wait fifty years.
  retryAfterKind?: "seconds" | "unix";
  defaultRetryAfterSeconds?: number;
  // messagePaths are dotted paths tried in order against the parsed error body
  // to recover the provider's own message, so a caller sees "record not found"
  // rather than a generic upstream failure.
  messagePaths?: string[];
  // bodyErrorPaths mark a response a failure even when its status says success.
  // GraphQL providers answer HTTP 200 with a populated `errors` array, so a
  // status-only check reports success on every error — the one failure mode a
  // connector must never have. A path counts as an error when it resolves to a
  // non-empty array, string, or object, or to a number or `true`; `false`,
  // `null`, `undefined` and empties do not, because Figma reports success as
  // `{"error": false}`.
  bodyErrorPaths?: string[];
  // rateLimitCodePaths + rateLimitCodes classify a failure as rate limiting
  // from the body rather than the status. Linear answers HTTP 400 with
  // errors.0.extensions.code == "RATELIMITED", so status alone cannot tell a
  // throttle from a bad request — and retrying forever is the wrong reaction to
  // one, while never retrying is the wrong reaction to the other.
  rateLimitCodePaths?: string[];
  rateLimitCodes?: string[];
  // retryAfterPaths read the retry delay out of the body, for providers that
  // send no Retry-After header — monday puts it in retry_in_seconds, Todoist in
  // error_extra.retry_after. Tried before the header.
  retryAfterPaths?: string[];
};

export type DeclarativeHttp = {
  baseUrl: string;
  auth?: DeclarativeAuth;
  headers?: Record<string, unknown>;
  query?: Record<string, unknown>;
  errors?: DeclarativeErrors;
};

export type DeclarativeRequest = {
  method?: string;
  path?: string;
  baseUrl?: string;
  query?: Record<string, unknown>;
  headers?: Record<string, unknown>;
  body?: unknown;
  success?: number[];
  // result maps the provider response onto the operation output. Placeholders
  // resolve against { response, status, headers, input }. Omitted, the parsed
  // body is returned under `data`.
  result?: unknown;
  // echo replaces the default `{ validated }` body of the no-credential
  // response. A healthcheck uses it to keep the static setup-validation shape
  // (`{ status: "ok" }`) that the control plane already understands.
  echo?: Record<string, unknown>;
};

export type DeclarativeOperation = {
  kind?: string;
  timeoutMs?: number;
  maxInputBytes?: number;
  maxResponseBytes?: number;
  title?: string;
  description?: string;
  inputSchema?: JSONSchema;
  outputSchema?: JSONSchema;
  enforceOutputSchema?: boolean;
  request?: DeclarativeRequest;
};

// DeclarativeSetupField is the subset of the core manifest's setup field the
// engine needs. Both properties are load-bearing for a templated base URL:
//
//   - key, because a placeholder may only name a declared setup field.
//   - required, because connectorsetup writes a field into the credential
//     bundle only when its value is non-empty. An optional field left blank at
//     connect time is absent from the bundle, so injectCredentials has nothing
//     to overwrite with and the CALLER's value for that key survives into the
//     runner input. A caller-controlled host is an SSRF, so a placeholder may
//     only name a field the connection is guaranteed to carry.
export type DeclarativeSetupField = { key: string; required?: boolean };

export type DeclarativeManifest = {
  key: string;
  name?: string;
  network?: { allowedHosts?: string[] };
  auth?: {
    setup?: {
      fields?: DeclarativeSetupField[];
      routes?: { fields?: DeclarativeSetupField[] }[];
    };
  };
  http?: DeclarativeHttp;
  operations?: Record<string, DeclarativeOperation>;
};

export type CompiledHandler = (input: unknown) => unknown;

export type CompiledConnector = {
  key: string;
  actions: Record<string, CompiledHandler>;
  syncs: Record<string, CompiledHandler>;
};
