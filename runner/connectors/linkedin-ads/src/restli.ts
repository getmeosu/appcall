export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function enc(value: string): string {
  return encodeURIComponent(value);
}

export function qs(pairs: Array<[string, string]>): string {
  return pairs.filter(([, value]) => value !== "").map(([key, value]) => `${enc(key)}=${value}`).join("&");
}

export function restliList(values: string[]): string {
  return `List(${values.map(enc).join(",")})`;
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

export function pageSize(value: unknown, field = "pageSize"): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 1000) {
    throw new Error(`${field} must be an integer from 1 to 1000`);
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
