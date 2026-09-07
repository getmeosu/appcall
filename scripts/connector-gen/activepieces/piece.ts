// Assemble a draft connector from an Activepieces piece descriptor.
//
// Only complete operations reach the manifest. An action whose request could
// not be recovered goes to the review list instead, because an action operation
// with no handler fails runner startup validation — a half-generated manifest
// must never be droppable into runner/connectors/ and break the boot.

import { extractAction, type ExtractedAction } from "./extract";
import { authSentinel, isRecord } from "./templatize";

export type PieceDraft = {
  manifest: Record<string, unknown>;
  review: Array<{ key: string; sourceName: string; title: string; reasons: string[] }>;
  stats: { actions: number; mechanised: number; hosts: string[] };
};

export type DraftOptions = {
  key: string;
  name?: string;
  categories?: string[];
  models?: string[];
  credentialField?: string;
  timeoutMs?: number;
  maxInputBytes?: number;
  maxResponseBytes?: number;
};

const authTypes: Record<string, string> = {
  SECRET_TEXT: "api_key",
  CUSTOM_AUTH: "api_key",
  BASIC_AUTH: "api_key",
  OAUTH2: "oauth2",
};

export async function draftFromPiece(piece: Record<string, unknown>, options: DraftOptions): Promise<PieceDraft> {
  const credentialField = options.credentialField ?? "apiKey";
  const actions = collectActions(piece);
  const extracted: ExtractedAction[] = [];
  for (const action of actions) {
    extracted.push(await extractAction(action));
  }

  const complete = extracted.filter((action) => action.request !== undefined);
  const hosts = [...new Set(complete.map((action) => hostOf(action.baseUrl)).filter((host): host is string => !!host))];
  const baseUrl = mostCommon(complete.map((action) => action.baseUrl).filter((url): url is string => !!url));
  const credential = complete.find((action) => action.authIn)?.authIn;

  const operations: Record<string, unknown> = {};
  const usedKeys = new Set<string>();
  const leaked: ExtractedAction[] = [];
  for (const action of complete) {
    // Last line of defence: a sentinel left anywhere in an operation means the
    // credential or an input was not fully recovered, and shipping it would
    // send a literal "__AP_..." to the provider.
    if (JSON.stringify(action.request).includes("__AP_")) {
      action.review.push("an unresolved sentinel survived into the request; the credential or an input was not recovered");
      leaked.push(action);
      continue;
    }
    const key = uniqueKey(action.key, usedKeys);
    const request = { ...(action.request as Record<string, unknown>) };
    // An action whose host differs from the connector default keeps its own
    // base URL rather than silently pointing at the wrong service.
    if (action.baseUrl && action.baseUrl !== baseUrl) {
      request.baseUrl = action.baseUrl;
    }
    operations[key] = {
      kind: "action",
      timeoutMs: options.timeoutMs ?? 15000,
      maxInputBytes: options.maxInputBytes ?? 65536,
      maxResponseBytes: options.maxResponseBytes ?? 1048576,
      sideEffect: action.sideEffect,
      title: action.title,
      description: action.description,
      inputSchema: action.inputSchema,
      request,
    };
  }

  const manifest = {
    key: options.key,
    name: options.name ?? String(piece.displayName ?? options.key),
    version: "0.1.0",
    runtime: "bun",
    visibility: "public",
    ...(options.categories ? { categories: options.categories } : {}),
    auth: buildAuth(piece, credentialField),
    network: { allowedHosts: hosts.length > 0 ? hosts : [] },
    http: {
      baseUrl: baseUrl ?? "",
      auth: {
        field: credentialField,
        in: credential?.in ?? "header",
        name: credential?.name ?? "Authorization",
        value: (credential?.value ?? `Bearer ${authSentinel}`).split(authSentinel).join(`{{${credentialField}}}`),
      },
      headers: { "Content-Type": "application/json" },
      errors: {
        rateLimitStatuses: [429],
        retryAfterHeader: "retry-after",
        defaultRetryAfterSeconds: 10,
        messagePaths: ["error.message", "message", "detail", "errors.0.message"],
      },
    },
    operations,
    models: options.models ?? ["record"],
  };

  return {
    manifest,
    review: extracted
      .filter((action) => action.request === undefined || action.review.length > 0 || leaked.includes(action))
      .map((action) => ({
        key: action.key,
        sourceName: action.sourceName,
        title: action.title,
        reasons: action.review,
      })),
    stats: { actions: extracted.length, mechanised: complete.length - leaked.length, hosts },
  };
}

// collectActions accepts the several shapes a piece uses for its action list:
// an array, a keyed record, or a module namespace whose exports include the
// piece descriptor.
export function collectActions(piece: Record<string, unknown>): Array<Record<string, unknown>> {
  const raw = piece.actions;
  const list = Array.isArray(raw) ? raw : isRecord(raw) ? Object.values(raw) : [];
  return list.filter((action): action is Record<string, unknown> =>
    isRecord(action) && typeof action.name === "string" && action.__customApiCall !== true);
}

export function findPieceDescriptor(module: Record<string, unknown>): Record<string, unknown> | undefined {
  for (const value of Object.values(module)) {
    if (isRecord(value) && (Array.isArray(value.actions) || isRecord(value.actions))) {
      return value;
    }
  }
  return undefined;
}

function buildAuth(piece: Record<string, unknown>, credentialField: string): Record<string, unknown> {
  const descriptor = isRecord(piece.auth) ? piece.auth : {};
  const type = authTypes[String(descriptor.type ?? "SECRET_TEXT")] ?? "api_key";
  const label = typeof descriptor.displayName === "string" ? descriptor.displayName : "API key";
  return {
    type,
    scopes: Array.isArray(descriptor.scope) ? descriptor.scope.filter((scope) => typeof scope === "string") : [],
    setup: {
      mode: type === "oauth2" ? "oauth2" : "api_key",
      fields: [{ key: credentialField, label, required: true, secret: true }],
    },
  };
}

function uniqueKey(key: string, used: Set<string>): string {
  let candidate = key;
  let counter = 2;
  while (used.has(candidate)) {
    candidate = `${key}-${counter}`;
    counter += 1;
  }
  used.add(candidate);
  return candidate;
}

function hostOf(baseUrl: string | undefined): string | undefined {
  if (!baseUrl) {
    return undefined;
  }
  try {
    return new URL(baseUrl).hostname;
  } catch {
    return undefined;
  }
}

function mostCommon(values: string[]): string | undefined {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  let best: string | undefined;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}
