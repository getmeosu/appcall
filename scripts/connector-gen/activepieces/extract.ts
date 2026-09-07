// Extract draft connector operations from an Activepieces piece.
//
// For each action the piece exports we always recover the expensive half — the
// title, the agent-facing description, and an inputSchema derived from the
// declared props. We then try to recover the request itself by executing the
// action against sentinel inputs and a recording HTTP client. When that
// succeeds the operation is complete; when it does not (a vendor SDK, a
// multi-request action, a body that reads the response) the operation is
// emitted without a `request` and marked for a human, which is strictly better
// than a plausible-looking wrong template.
//
// Activepieces community pieces are MIT licensed. A connector derived from one
// must carry the MIT notice — see runner/connectors/DECLARATIVE.md.

import { propsToSchema, type PropsSchema } from "./props";
import { authSentinel, buildSentinels, splitURL, templatize, isRecord } from "./templatize";
import { takeRecorded, type RecordedRequest } from "./shims/recorder";

export type ExtractedAction = {
  key: string;
  sourceName: string;
  title: string;
  description: string;
  inputSchema: PropsSchema;
  sideEffect: "read" | "write";
  request?: Record<string, unknown>;
  baseUrl?: string;
  // Where the credential appeared. A provider puts it in a header (most) or in
  // query parameters (Trello, Asana's legacy key/token pairs). Either way it
  // belongs on the connector, not repeated on every operation.
  authIn?: { in: "header" | "query"; name: string; value: string };
  review: string[];
};

const knownVerbs: Record<string, string> = {
  create: "create",
  add: "create",
  new: "create",
  get: "get",
  fetch: "get",
  retrieve: "get",
  read: "get",
  list: "list",
  find: "search",
  search: "search",
  update: "update",
  edit: "update",
  upsert: "update",
  delete: "delete",
  remove: "delete",
  send: "send",
  run: "run",
};

const readVerbs = new Set(["get", "list", "search"]);

export function operationKeyFor(actionName: string): string {
  const tokens = actionName
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter((token) => token.length > 0)
    .map((token) => token.toLowerCase());

  if (tokens.length === 0) {
    return "action.run";
  }
  const verb = knownVerbs[tokens[0]!];
  if (!verb || tokens.length === 1) {
    return `${slug(tokens.join("-"))}.run`;
  }
  return `${slug(pluralize(tokens.slice(1)))}.${verb}`;
}

export async function extractAction(action: Record<string, unknown>): Promise<ExtractedAction> {
  const sourceName = String(action.name ?? "action");
  const inputSchema = propsToSchema((action.props ?? {}) as Record<string, never>);
  const key = operationKeyFor(sourceName);
  const review: string[] = [];

  const extracted: ExtractedAction = {
    key,
    sourceName,
    title: String(action.displayName ?? sourceName),
    description: describeAction(action),
    inputSchema,
    sideEffect: readVerbs.has(key.split(".")[1] ?? "") ? "read" : "write",
    review,
  };

  const { values, sentinels, untraceable } = buildSentinels(inputSchema);
  if (untraceable.length > 0) {
    review.push(`boolean input(s) ${untraceable.join(", ")} cannot be traced; confirm where they belong`);
  }

  takeRecorded();
  const run = action.run;
  if (typeof run !== "function") {
    review.push("action exposes no run function");
    return extracted;
  }

  try {
    await withTimeout(Promise.resolve(run(buildContext(values))), 2000);
  } catch (error) {
    review.push(`run threw: ${short(error)}`);
  }

  const requests = takeRecorded();
  if (requests.length === 0) {
    review.push("no HTTP request was recorded; the action likely uses a vendor SDK or raw fetch");
    return extracted;
  }
  if (requests.length > 1) {
    review.push(`${requests.length} requests recorded; a declarative operation issues exactly one`);
    return extracted;
  }

  applyRequest(extracted, requests[0]!, sentinels);
  return extracted;
}

function applyRequest(extracted: ExtractedAction, recorded: RecordedRequest, sentinels: ReturnType<typeof buildSentinels>["sentinels"]): void {
  const rawUrl = typeof recorded.url === "string" ? recorded.url : "";
  if (!rawUrl.startsWith("http")) {
    extracted.review.push(`recorded URL is not absolute: ${rawUrl || "(empty)"}`);
    return;
  }

  // A tenant-specific host or path segment ("{store}.myshopify.com") comes from
  // a setup field the extractor cannot see, and renders as the literal string
  // "undefined". Emitting that would produce a connector that always calls the
  // wrong host, so it is refused rather than flagged.
  if (/\b(undefined|null)\b/.test(rawUrl)) {
    extracted.review.push(
      `recorded URL contains an unresolved segment (${rawUrl}); this provider's endpoint depends on a setup field`,
    );
    return;
  }

  // A per-tenant host ("{store}.myshopify.com", "{subdomain}.zendesk.com") is a
  // setup field, not a credential, and the declarative manifest's baseUrl is
  // static. Emitting one would point every call at the wrong host.
  // URL parsing lower-cases the host, so the sentinel is matched case-insensitively.
  const host = hostOf(rawUrl);
  if (host === undefined || host.toUpperCase().includes("__AP_")) {
    extracted.review.push(
      `host is not static (${host ?? rawUrl}); this provider is per-tenant and needs a setup field in the base URL`,
    );
    return;
  }

  const { baseUrl, path, query } = splitURL(rawUrl, sentinels);
  const headers = templatize(recorded.headers ?? {}, sentinels);
  const extraQuery = templatize(recorded.queryParams ?? {}, sentinels);
  const body = recorded.body === undefined ? undefined : templatize(recorded.body, sentinels);

  const mergedQuery = { ...query, ...(isRecord(extraQuery) ? extraQuery : {}) };
  const credential = takeCredential(isRecord(headers) ? headers : {}, mergedQuery, extracted.review);
  if (!credential && recorded.authentication === undefined) {
    extracted.review.push("no credential appeared in the request; check how this provider authenticates");
  }

  extracted.baseUrl = baseUrl;
  extracted.authIn = credential;
  extracted.request = {
    method: String(recorded.method ?? "GET").toUpperCase(),
    path,
    ...(Object.keys(mergedQuery).length > 0 ? { query: mergedQuery } : {}),
    ...(isRecord(headers) && Object.keys(headers).length > 0 ? { headers } : {}),
    ...(body !== undefined && !isEmpty(body) ? { body } : {}),
  };
}

// takeCredential pulls whatever carries the auth sentinel out of the operation
// and hands it to the connector-level `http.auth` block, where a credential
// belongs. It mutates the maps so the credential is not repeated on every
// operation. A provider needing two credentials at once (Trello's key AND
// token) cannot be expressed by a single `http.auth`, so it is reported rather
// than half-applied.
function takeCredential(
  headers: Record<string, unknown>,
  query: Record<string, unknown>,
  review: string[],
): { in: "header" | "query"; name: string; value: string } | undefined {
  const found: Array<{ in: "header" | "query"; name: string; value: string }> = [];

  for (const [name, value] of Object.entries(headers)) {
    if (typeof value === "string" && value.includes(authSentinel)) {
      found.push({ in: "header", name, value });
    }
  }
  for (const [name, value] of Object.entries(query)) {
    if (typeof value === "string" && value.includes(authSentinel)) {
      found.push({ in: "query", name, value });
    }
  }

  if (found.length === 0) {
    return undefined;
  }
  if (found.length > 1) {
    review.push(
      `credential appears in ${found.length} places (${found.map((entry) => `${entry.in}:${entry.name}`).join(", ")}); ` +
        "a declarative connector carries one, so this provider needs a multi-field credential bundle",
    );
    return undefined;
  }

  const credential = found[0]!;
  if (credential.in === "header") {
    delete headers[credential.name];
  } else {
    delete query[credential.name];
  }
  return credential;
}

function describeAction(action: Record<string, unknown>): string {
  const metadata = isRecord(action.aiMetadata) ? action.aiMetadata : {};
  const parts = [action.description, metadata.description]
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .map((part) => part.trim());
  const unique = [...new Set(parts)];
  return unique.length > 0 ? unique.join(" ") : `Run ${String(action.displayName ?? action.name ?? "action")}.`;
}

// buildContext supplies the shape an action's `run` expects. Unknown members
// resolve to a permissive proxy so an action that reaches for the store, the
// file system, or connection metadata still runs far enough to issue its
// request.
function buildContext(propsValue: Record<string, unknown>): Record<string, unknown> {
  // The credential is reached in many shapes: `context.auth` itself, an OAuth
  // bundle's `.access_token`, a custom-auth bundle's `.props.apiKey`. A proxy
  // that answers every property with another proxy, and coerces to the sentinel
  // in a string, covers all of them at any depth.
  const auth = authProxy();

  const anything: Record<string, unknown> = {
    auth,
    propsValue,
    files: { write: async () => "https://files.local/placeholder" },
    store: { get: async () => undefined, put: async () => undefined, delete: async () => undefined },
    connections: { get: async () => auth },
    server: { publicUrl: "https://runner.local/", token: "token" },
    run: { id: "run", stop: () => undefined, pause: () => undefined },
    generateResumeUrl: () => "https://runner.local/resume",
    project: { id: "project", externalId: "project" },
    output: {},
  };
  return anything;
}

function authProxy(): unknown {
  return new Proxy(Object(authSentinel), {
    get(target, key) {
      if (key === Symbol.toPrimitive || key === "toString" || key === "valueOf") {
        return () => authSentinel;
      }
      if (key === "then") {
        return undefined;
      }
      const own = Reflect.get(target, key);
      return own === undefined ? authProxy() : own;
    },
  });
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function hostOf(rawUrl: string): string | undefined {
  try {
    return new URL(rawUrl).hostname;
  } catch {
    return undefined;
  }
}

function isEmpty(value: unknown): boolean {
  return isRecord(value) && Object.keys(value).length === 0;
}

function short(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > 120 ? `${message.slice(0, 117)}...` : message;
}

function pluralize(tokens: string[]): string {
  const last = tokens[tokens.length - 1] ?? "";
  if (last.length === 0 || last.endsWith("s")) {
    return tokens.join("-");
  }
  const pluralLast = last.endsWith("y") && !/[aeiou]y$/.test(last) ? `${last.slice(0, -1)}ies` : `${last}s`;
  return [...tokens.slice(0, -1), pluralLast].join("-");
}

function slug(value: string): string {
  return value.replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
}
