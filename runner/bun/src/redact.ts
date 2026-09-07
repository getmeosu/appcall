import {executionContext} from "./execution";
// Redaction for anything the runner writes to stdout/stderr.
//
// The runner is the only process that holds decrypted connector credentials, so
// it is the one place where a bearer token can reach a log line. Provider SDKs
// and fetch wrappers routinely attach the failing request — headers included —
// to the error they throw, and the runner logs that error verbatim on the
// failure path.
//
// The Go control plane has internal/secrets/redact.go for the same reason; this
// is its counterpart on the Bun side.

// Keys whose VALUES are always secret. Matched as substrings against the key
// lowercased with separators stripped, so apiKey, api_key, X-Api-Key and
// apiKeyValue all collapse to the same "apikey" and none of them slips through
// on spelling.
const SECRET_KEY_FRAGMENTS = [
  "authorization",
  "auth",
  "token",
  "secret",
  "password",
  "passwd",
  "apikey",
  "credential",
  "cookie",
  "session",
  "signature",
  "private",
  "dsn",
];

// Bearer/Basic credentials and long opaque keys that appear inside a free-text
// error message rather than as a structured field.
const SECRET_TEXT_PATTERNS: RegExp[] = [
  /\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  // Provider-prefixed keys: sk_live_..., cal_live_..., xoxb-..., ghp_..., etc.
  /\b[A-Za-z][A-Za-z0-9]{1,12}[_-](live|test|prod|sk|pk)[_-][A-Za-z0-9._~+/=-]{8,}/gi,
  /\bxox[abposr]-[A-Za-z0-9-]{8,}/gi,
  /\bgh[pousr]_[A-Za-z0-9]{16,}/gi,
  // JWTs.
  /\beyJ[A-Za-z0-9._-]{16,}/g,
];

export const REDACTED = "[REDACTED]";

function isSecretKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  return SECRET_KEY_FRAGMENTS.some((fragment) => normalized.includes(fragment));
}

export function redactText(text: string): string {
  let out = text;
  const values = (executionContext()?.secrets??[]).flatMap(value=>{
    const variants=[value,new URLSearchParams({v:value}).toString().slice(2)];
    try{variants.push(encodeURIComponent(value));}catch{}
    return variants.flatMap(v=>[v,v.replace(/%[0-9A-F]{2}/g,p=>p.toLowerCase())]);
  });
  for(const value of [...new Set(values)].sort((a,b)=>b.length-a.length)) if(value)out=out.replaceAll(value,REDACTED);
  for (const pattern of SECRET_TEXT_PATTERNS) {
    out = out.replace(pattern, REDACTED);
  }
  return out;
}

// maxDepth bounds the walk so a cyclic or pathologically nested error object
// cannot stall the log call. Depth 6 covers every realistic error shape.
const maxDepth = 6;

/**
 * redact returns a copy of `value` safe to write to a log, with secret-looking
 * fields replaced and secret-looking substrings scrubbed from every string.
 * Structure is preserved so the log stays useful for triage.
 */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > maxDepth) {
    return "[TRUNCATED]";
  }
  if (typeof value === "string") {
    return redactText(value);
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redact(item, depth + 1));
  }
  if (value instanceof Error) {
    return { name: value.name, message: redactText(value.message) };
  }
  // Headers and Map both carry credentials and neither survives a spread.
  if (value instanceof Headers || value instanceof Map) {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of value.entries()) {
      out[String(key)] = isSecretKey(String(key)) ? REDACTED : redact(entry, depth + 1);
    }
    return out;
  }
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    out[key] = isSecretKey(key) ? REDACTED : redact(entry, depth + 1);
  }
  return out;
}

/** logLine serializes a structured log record with every value redacted. */
export function logLine(record: Record<string, unknown>): string {
  return JSON.stringify(redact(record));
}
