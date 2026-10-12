// QuickBooks Online list syncs (QB-SYNC-1).
//
// Each sync makes real authenticated QBO v3 query calls:
//   GET https://quickbooks.api.intuit.com/v3/company/{realmId}/query
//       ?query=SELECT * FROM <Entity> [WHERE MetaData.LastUpdatedTime >= '<since>']
//              ORDERBY MetaData.LastUpdatedTime STARTPOSITION n MAXRESULTS m
//       &minorversion=75
// Pages are 1-based (STARTPOSITION) and at most 1000 rows (MAXRESULTS). QBO can
// return a short page that is not the last one, so a short page never ends the
// sync (QB-SYNC-1b). The first call of a run issues SELECT COUNT(*) FROM <Entity>
// with the same WHERE and carries that total in the cursor; the sync stops only
// on an empty page or once the total is reached. It pages up to maxPages per call
// and hands back an opaque nextCursor for the rest, plus highWatermark (the
// greatest MetaData.LastUpdatedTime seen) to pass as `since` on the next run.
// environment: "sandbox" targets sandbox-quickbooks.api.intuit.com.
// Caveat: STARTPOSITION offsets are not a snapshot. A record edited mid-run moves
// to the end of the LastUpdatedTime order, so other rows can shift by one and be
// skipped or repeated; the next incremental run from highWatermark picks up any
// skipped edits, and consumers should upsert by id.
import { createConnectorHttpClient } from "../../../bun/src/http";
import manifest from "../manifest.json";
import {
  normalizeCustomer,
  normalizeInvoice,
  normalizePayment,
  parseCustomersResponse,
  parseInvoicesResponse,
  parsePaymentsResponse,
  type NormalizedCustomer,
  type NormalizedInvoice,
  type NormalizedPayment,
  type QBListResult,
} from "./objects";

/** Pinned QBO Accounting API minor version (75 is the floor since 2025-08-01). */
export const QBO_MINOR_VERSION = "75";
export const QBO_HOSTS = {
  production: "https://quickbooks.api.intuit.com/v3/company",
  sandbox: "https://sandbox-quickbooks.api.intuit.com/v3/company",
} as const;
export type QuickBooksEnvironment = keyof typeof QBO_HOSTS;
const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 1000;
const DEFAULT_MAX_PAGES = 10;
const MAX_MAX_PAGES = 50;
// QBO dateTime literal, e.g. 2026-10-01T00:00:00Z or 2026-10-01T05:30:00+05:30 or 2026-10-01.
const QBO_DATETIME = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})?)?$/;

export type QuickBooksListSyncInput = {
  accessToken: string;
  realmId: string;
  pageSize?: number;
  maxPages?: number;
  since?: string;
  cursor?: string;
  environment?: QuickBooksEnvironment;
  fetch?: typeof fetch;
};

type ListResult<T> = {
  items: T[];
  hasMore: boolean;
  nextCursor: string | null;
  highWatermark: string | null;
  totalCount: number;
  maxResults: number;
  startIndex: number;
};

export type InvoicesListSyncInput = QuickBooksListSyncInput;
export type InvoicesListSyncResult = { provider: "quickbooks"; operation: "invoices.list" } & ListResult<NormalizedInvoice>;
export type CustomersListSyncInput = QuickBooksListSyncInput;
export type CustomersListSyncResult = { provider: "quickbooks"; operation: "customers.list" } & ListResult<NormalizedCustomer>;
export type PaymentsListSyncInput = QuickBooksListSyncInput;
export type PaymentsListSyncResult = { provider: "quickbooks"; operation: "payments.list" } & ListResult<NormalizedPayment>;

type Cursor = { v: 1; start: number; since: string | null; hw: string | null; total?: number };

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeCursor(raw: string): Cursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    throw new Error("cursor is not a QuickBooks sync cursor");
  }
  const c = parsed as Record<string, unknown>;
  if (
    typeof c !== "object" || c === null || c.v !== 1 ||
    typeof c.start !== "number" || !Number.isInteger(c.start) || c.start < 1 ||
    !(c.since === null || (typeof c.since === "string" && QBO_DATETIME.test(c.since))) ||
    !(c.hw === null || typeof c.hw === "string") ||
    !(c.total === undefined || (typeof c.total === "number" && Number.isInteger(c.total) && c.total >= 0))
  ) {
    throw new Error("cursor is not a QuickBooks sync cursor");
  }
  const out: Cursor = { v: 1, start: c.start, since: c.since as string | null, hw: c.hw as string | null };
  if (typeof c.total === "number") out.total = c.total;
  return out;
}

function boundedInt(value: unknown, field: string, fallback: number, max: number): number {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > max) {
    throw new Error(`${field} must be an integer from 1 to ${max}`);
  }
  return value;
}

function whereClause(since: string | null): string {
  return since ? ` WHERE MetaData.LastUpdatedTime >= '${since}'` : "";
}

export function buildCountQuery(entity: string, since: string | null): string {
  return `SELECT COUNT(*) FROM ${entity}${whereClause(since)}`;
}

export function buildQuery(entity: string, since: string | null, start: number, pageSize: number): string {
  const where = whereClause(since);
  return `SELECT * FROM ${entity}${where} ORDERBY MetaData.LastUpdatedTime STARTPOSITION ${start} MAXRESULTS ${pageSize}`;
}

function laterOf(a: string | null, b: string | undefined): string | null {
  if (!b) return a;
  if (!a) return b;
  return Date.parse(b) > Date.parse(a) ? b : a;
}

async function runListSync<Raw extends { MetaData?: { LastUpdatedTime?: string } }, Out>(
  operation: "invoices.list" | "customers.list" | "payments.list",
  entity: "Invoice" | "Customer" | "Payment",
  parse: (queryResponse: unknown) => QBListResult<Raw>,
  normalize: (raw: Raw) => Out,
  rawInput: QuickBooksListSyncInput,
): Promise<ListResult<Out>> {
  if (!rawInput || typeof rawInput !== "object" || Array.isArray(rawInput)) throw new Error("input must be an object");
  const input = rawInput;
  if (typeof input.accessToken !== "string" || input.accessToken.length === 0) throw new Error("accessToken is required");
  if (typeof input.realmId !== "string" || !/^[0-9]{1,32}$/.test(input.realmId)) throw new Error("realmId must be a numeric QuickBooks company ID");
  const pageSize = boundedInt(input.pageSize, "pageSize", DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const maxPages = boundedInt(input.maxPages, "maxPages", DEFAULT_MAX_PAGES, MAX_MAX_PAGES);
  const environment = input.environment ?? "production";
  if (environment !== "production" && environment !== "sandbox") throw new Error('environment must be "production" or "sandbox"');
  const queryBase = `${QBO_HOSTS[environment]}/${input.realmId}/query`;

  let state: Cursor;
  if (typeof input.cursor === "string" && input.cursor.length > 0) {
    state = decodeCursor(input.cursor);
  } else {
    if (input.since !== undefined && (typeof input.since !== "string" || !QBO_DATETIME.test(input.since))) {
      throw new Error("since must be an ISO 8601 date or date-time");
    }
    state = { v: 1, start: 1, since: input.since ?? null, hw: null };
  }

  const op = (manifest.operations as Record<string, { maxResponseBytes?: number; timeoutMs?: number }>)[operation];
  const http = createConnectorHttpClient({
    allowedHosts: manifest.network.allowedHosts as string[],
    maxResponseBytes: op?.maxResponseBytes ?? 5_242_880,
    timeoutMs: op?.timeoutMs ?? 30_000,
    fetch: input.fetch,
  });

  const query = async (q: string): Promise<Record<string, unknown>> => {
    const params = new URLSearchParams({ query: q, minorversion: QBO_MINOR_VERSION });
    const response = await http.fetchText(`${queryBase}?${params.toString()}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${input.accessToken}`, Accept: "application/json" },
    });
    if (response.status === 429) {
      const retryAfter = Number(response.headers["retry-after"] ?? "30");
      throw { ok: false, code: "CONNECTOR_RATE_LIMITED", message: "QuickBooks rate limit exceeded.", retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 30 };
    }
    if (response.status === 401) {
      throw { ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message: `QuickBooks rejected the access token for ${operation} (HTTP 401 AuthenticationFailed); refresh or reconnect the connection.` };
    }
    if (response.status < 200 || response.status >= 300) {
      throw { ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message: `QuickBooks rejected ${operation} (HTTP ${response.status}).` };
    }
    let body: unknown;
    try {
      body = JSON.parse(response.body);
    } catch {
      throw { ok: false, code: "CONNECTOR_RESPONSE_INVALID", message: `QuickBooks returned a non-JSON body for ${operation}.` };
    }
    const qr = typeof body === "object" && body !== null ? (body as Record<string, unknown>).QueryResponse : undefined;
    if (typeof qr !== "object" || qr === null || Array.isArray(qr)) {
      throw { ok: false, code: "CONNECTOR_RESPONSE_INVALID", message: `QuickBooks ${operation} response has no QueryResponse.` };
    }
    return qr as Record<string, unknown>;
  };

  let total = state.total;
  if (total === undefined) {
    const countResponse = await query(buildCountQuery(entity, state.since));
    const n = countResponse.totalCount ?? 0;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 0) {
      throw { ok: false, code: "CONNECTOR_RESPONSE_INVALID", message: `QuickBooks ${operation} COUNT(*) response has no valid totalCount.` };
    }
    total = n;
  }

  const firstStart = state.start;
  const items: Out[] = [];
  let hw = state.hw;
  let start = state.start;
  // Done once the COUNT(*) total is reached (start is 1-based) or a page comes back empty.
  let done = start - 1 >= total;
  for (let page = 0; page < maxPages && !done; page += 1) {
    const parsed = parse(await query(buildQuery(entity, state.since, start, pageSize)));
    for (const raw of parsed.items) {
      items.push(normalize(raw));
      hw = laterOf(hw, raw.MetaData?.LastUpdatedTime);
    }
    start += parsed.items.length;
    // A short page is NOT the end: QBO can return fewer than MAXRESULTS mid-set.
    if (parsed.items.length === 0 || start - 1 >= total) done = true;
  }

  return {
    items,
    hasMore: !done,
    nextCursor: done ? null : encodeCursor({ v: 1, start, since: state.since, hw, total }),
    highWatermark: hw,
    totalCount: items.length,
    maxResults: pageSize,
    startIndex: firstStart,
  };
}

export async function executeInvoicesListSync(input: InvoicesListSyncInput): Promise<InvoicesListSyncResult> {
  const result = await runListSync("invoices.list", "Invoice", parseInvoicesResponse, normalizeInvoice, input);
  return { provider: "quickbooks", operation: "invoices.list", ...result };
}

export async function executeCustomersListSync(input: CustomersListSyncInput): Promise<CustomersListSyncResult> {
  const result = await runListSync("customers.list", "Customer", parseCustomersResponse, normalizeCustomer, input);
  return { provider: "quickbooks", operation: "customers.list", ...result };
}

export async function executePaymentsListSync(input: PaymentsListSyncInput): Promise<PaymentsListSyncResult> {
  const result = await runListSync("payments.list", "Payment", parsePaymentsResponse, normalizePayment, input);
  return { provider: "quickbooks", operation: "payments.list", ...result };
}
