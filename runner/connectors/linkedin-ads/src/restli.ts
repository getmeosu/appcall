export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Rest.li 2.0 leaf encoding. Percent-encodes one value exactly once, including
 * the Rest.li delimiters ( ) , : that encodeURIComponent would leave raw for
 * parentheses, so a URN leaf becomes urn%3Ali%3AsponsoredAccount%3A123 and can
 * never be mistaken for structure. Use it for path keys and for every leaf
 * inside List(...) and (key:value) records; the structure itself stays raw.
 * https://learn.microsoft.com/en-us/linkedin/shared/api-guide/concepts/protocol-version
 */
export function enc(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

/**
 * Joins already-serialized Rest.li 2.0 query pairs. Keys are encoded; values
 * are emitted as built (raw structure, leaves encoded once by enc()). Never use
 * URLSearchParams here: it would encode the structure and re-encode the leaves.
 */
export function qs(pairs: Array<[string, string]>): string {
  return pairs.filter(([, value]) => value !== "").map(([key, value]) => `${enc(key)}=${value}`).join("&");
}

export function restliList(values: string[]): string {
  return `List(${values.map(enc).join(",")})`;
}

/**
 * Normalizes a caller-built Rest.li expression (targetingCriteria): any raw
 * urn:li:... leaf is encoded once, already-encoded leaves are kept, and a
 * double-encoded value (%25) is refused so nothing reaches the wire as %253A.
 */
export function restliExpression(value: string, field: string): string {
  if (/%25/i.test(value)) throw new Error(`${field} must not be double-encoded`);
  const normalized = value.replace(/urn:li:[A-Za-z0-9_]+:[A-Za-z0-9_.~-]+/g, (urn) => enc(urn));
  return assertRestli(normalized, field);
}

/** Opaque cursor from metadata.nextPageToken, encoded once for the query string. */
export function pageTokenValue(value: unknown, field = "pageToken"): string | undefined {
  if (value === undefined || value === "") return undefined;
  if (typeof value !== "string" || !/^[A-Za-z0-9_.~+/=-]{1,512}$/.test(value)) {
    throw new Error(`${field} must be the nextPageToken string LinkedIn returned`);
  }
  return enc(value);
}

/**
 * Cursor-paged finders (adAccounts, adCampaignGroups, adCampaigns, creatives)
 * ignore index paging since 202401, so a caller start offset past 0 cannot be
 * honored and is refused rather than silently re-reading page one.
 */
export function rejectIndexStart(value: unknown): void {
  if (value === undefined || value === 0) return;
  throw new Error("start is not supported by this cursor-paged LinkedIn finder; pass pageToken from the previous response");
}

const SAFE_RESTLI = /^[A-Za-z0-9._:%(),=-]{1,8000}$/;

export function assertRestli(value: string, field: string): string {
  if (!SAFE_RESTLI.test(value)) throw new Error(`${field} contains unsupported characters`);
  return value;
}

export function assertToken(value: string, field: string): string {
  if (!/^[A-Za-z0-9_]{1,64}$/.test(value)) throw new Error(`${field} contains unsupported characters`);
  return value;
}

export function resourceId(value: string, prefixes: string[]): string {
  let out = value.trim();
  for (const prefix of prefixes) {
    if (out.startsWith(prefix)) out = out.slice(prefix.length);
  }
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(out)) throw new Error("LinkedIn resource id is invalid");
  return out;
}

export function asId(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim() !== "") return value.trim();
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value);
  return undefined;
}

export function sponsoredAccount(value: string): string {
  return `urn:li:sponsoredAccount:${resourceId(value, ["urn:li:sponsoredAccount:"])}`;
}

export function pageSize(value: unknown, field = "pageSize", max = 1000): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > max) {
    throw new Error(`${field} must be an integer from 1 to ${max}`);
  }
  return String(value);
}

export function pageStart(value: unknown, field = "start"): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 1_000_000) {
    throw new Error(`${field} must be a non-negative integer`);
  }
  return String(value);
}

export function stringList(value: unknown, field: string, pattern: RegExp, max = 100): string[] | undefined {
  if (value === undefined) return undefined;
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : null;
  if (!raw || raw.length < 1 || raw.length > max) throw new Error(`${field} must contain 1 to ${max} values`);
  return raw.map((item) => {
    const text = typeof item === "number" && Number.isSafeInteger(item) ? String(item) : item;
    if (typeof text !== "string" || !pattern.test(text.trim())) throw new Error(`${field} contains an unsupported value`);
    return text.trim();
  });
}

export function money(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new Error(`${field} must be an object`);
  const amount = value.amount;
  const currency = value.currencyCode ?? value.currency;
  if (typeof amount !== "string" && typeof amount !== "number") throw new Error(`${field}.amount is required`);
  const amountText = String(amount);
  if (!/^\d+(\.\d{1,4})?$/.test(amountText)) throw new Error(`${field}.amount must be a decimal string`);
  if (typeof currency !== "string" || !/^[A-Z]{3}$/.test(currency)) throw new Error(`${field}.currencyCode must be an ISO currency`);
  return `(amount:${amountText},currencyCode:${currency})`;
}
