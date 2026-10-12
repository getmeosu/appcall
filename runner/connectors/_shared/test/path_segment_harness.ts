// SEC-PATH-2c test harness: drives an operation through the real registry with a
// recording fetch stub and checks that a path-id field rejects dot-only, empty
// and whitespace values before any request, and that percent-encoded dot forms
// never reach the provider as a dot segment.
import { expect } from "bun:test";
import { defaultConnectorRegistry } from "../../../bun/src/registry";

type Call = { url: string; method: string };

export const DOT_ONLY = [".", "..", " . ", " .. "];
export const BLANK = ["", " ", "  ", "\t"];
export const PERCENT_DOTS = ["%2e", "%2e%2e", "%2E%2E", ".%2e"];
/** Values that split or reroot a segment ('\\' becomes '/' under WHATWG URL parsing). */
export const SEPARATORS = ["a/b", "a\\b", "/", "\\", "%2f", "%5c"];

let calls: Call[] = [];
const stub = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = input instanceof Request ? input.url : String(input);
  calls.push({ url, method: init?.method ?? (input instanceof Request ? input.method : "GET") });
  return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
}) as typeof fetch;

function sample(schema: any, key: string, marker: string): unknown {
  if (!schema || typeof schema !== "object") return marker;
  if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0];
  if ("const" in schema) return schema.const;
  const t = Array.isArray(schema.type) ? schema.type.find((x: string) => x !== "null") : schema.type;
  if (t === "integer" || t === "number") return Math.max(1, typeof schema.minimum === "number" ? schema.minimum : 1);
  if (t === "boolean") return true;
  if (t === "array") return [sample(schema.items, key, marker)];
  if (t === "object") return {};
  if (schema.format === "email" || /email/i.test(key)) return `${marker}@example.com`;
  if (schema.format === "date-time") return "2026-01-01T00:00:00Z";
  if (schema.format === "date") return "2026-01-01";
  if (schema.format === "uri" || /url$/i.test(key)) return `https://example.com/${marker}`;
  return marker;
}

async function run(connector: string, action: string, input: Record<string, unknown>, credKeys: string[]) {
  const original = globalThis.fetch;
  globalThis.fetch = stub;
  try {
    return await runWithStub(connector, action, input, credKeys);
  } finally {
    globalThis.fetch = original;
  }
}

async function runWithStub(connector: string, action: string, input: Record<string, unknown>, credKeys: string[]) {
  let attempt: Record<string, unknown> = { ...input };
  for (let n = 0; n < 10; n++) {
    calls = [];
    let r: any;
    try {
      r = defaultConnectorRegistry.executeAction(connector, action, attempt);
      if (r.ok) {
        await Promise.resolve(r.output);
        return { calls: [...calls], input: attempt, ok: true };
      }
    } catch (error: any) {
      r = { ok: false, code: error?.code, message: error?.message ?? String(error) };
    }
    const m = /Unsupported input field:? ?([A-Za-z0-9_]+)?/.exec(String(r.message));
    if (m && calls.length === 0) {
      const key = m[1] && m[1] in attempt ? m[1] : credKeys.find((k) => k in attempt);
      if (key) {
        delete attempt[key];
        continue;
      }
    }
    return { calls: [...calls], input: attempt, ok: false, code: r.code as string | undefined };
  }
  return { calls: [...calls], input: attempt, ok: false };
}

function dotSegment(pathname: string): boolean {
  return pathname.split("/").some((segment) => {
    let decoded = segment;
    try { decoded = decodeURIComponent(segment); } catch { /* keep raw */ }
    return /^\s*\.+\s*$/.test(decoded) || /^\s*\.+\s*$/.test(segment);
  });
}

/** RFC 3986 dot segment after percent-decoding ('.', '..', '%2e', '%2E%2e'). */
function rfcDotSegment(pathname: string): boolean {
  return pathname.split("/").some((segment) => {
    let decoded = segment;
    try { decoded = decodeURIComponent(segment); } catch { /* keep raw */ }
    return /^\.+$/.test(decoded);
  });
}

/**
 * Builds a working baseline input for `action`, returns it with the marker used
 * for `field` so callers can assert the marker reaches the path.
 */
export async function baseline(connector: string, action: string, field: string, creds: Record<string, unknown>) {
  const manifest = defaultConnectorRegistry.describe(connector) as any;
  const op = manifest?.operations?.[action] ?? (await import(`../../${connector}/manifest.json`)).default.operations[action];
  const props = op.inputSchema?.properties ?? {};
  const input: Record<string, unknown> = { ...creds };
  const markers: Record<string, string> = {};
  let i = 0;
  for (const [k, s] of Object.entries<any>(props)) {
    if (k in creds) { i++; continue; }
    markers[k] = `mk${i++}x${k.replace(/[^A-Za-z0-9]/g, "")}`;
    input[k] = sample(s, k, markers[k]!);
  }
  let base = await run(connector, action, input, Object.keys(creds));
  if (base.calls.length === 0) {
    let j = 0;
    for (const k of Object.keys(props)) {
      if (typeof input[k] === "string" && input[k] === markers[k]) {
        markers[k] = `77${String(j).padStart(3, "0")}1`;
        input[k] = markers[k];
      }
      j++;
    }
    base = await run(connector, action, input, Object.keys(creds));
  }
  expect(base.calls.length, `${connector}.${action}: baseline made no request (${base.code})`).toBeGreaterThan(0);
  const marker = markers[field]!;
  expect(new URL(base.calls[0]!.url).pathname, `${connector}.${action}: ${field} is not in the path`).toContain(marker);
  return { input: base.input, marker };
}

export async function expectRejectedWithoutFetch(connector: string, action: string, input: Record<string, unknown>) {
  const result = await run(connector, action, input, []);
  expect(result.calls, `${connector}.${action} ${JSON.stringify(input)}`).toEqual([]);
  expect(result.ok).toBe(false);
}

/** Asserts the whole SEC-PATH-2c contract for one (action, field). */
export async function expectPathFieldGuarded(connector: string, action: string, field: string, creds: Record<string, unknown>) {
  const base = await baseline(connector, action, field, creds);
  // Drop alias spellings of the field (imageId / image_id) so a valid alias
  // cannot satisfy the request while the field under test is invalid.
  const norm = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, "");
  const input = Object.fromEntries(Object.entries(base.input).filter(([k]) => k === field || norm(k) !== norm(field)));
  for (const bad of [...DOT_ONLY, ...BLANK]) {
    await expectRejectedWithoutFetch(connector, action, { ...input, [field]: bad });
  }
  for (const bad of PERCENT_DOTS) {
    const result = await run(connector, action, { ...input, [field]: bad }, []);
    for (const call of result.calls) {
      expect(dotSegment(new URL(call.url).pathname), `${connector}.${action} ${field}=${bad} -> ${call.url}`).toBe(false);
    }
  }
}

/**
 * Like baseline(), but for the whole operation and without asserting: fills every
 * non-credential input property and returns the first input that reaches the
 * provider, or null when the sampled input is rejected before any request.
 */
export async function tryBaseline(connector: string, action: string, creds: Record<string, unknown>) {
  const op = (await import(`../../${connector}/manifest.json`)).default.operations[action];
  const props = op?.inputSchema?.properties ?? {};
  const input: Record<string, unknown> = { ...creds };
  let i = 0;
  for (const [k, s] of Object.entries<any>(props)) {
    if (k in creds) { i++; continue; }
    input[k] = sample(s, k, `mk${i++}x${k.replace(/[^A-Za-z0-9]/g, "")}`);
  }
  let base = await run(connector, action, input, Object.keys(creds));
  if (base.calls.length === 0) {
    let j = 0;
    for (const k of Object.keys(props)) {
      if (!(k in creds) && typeof input[k] === "string" && /^mk\d+x/.test(input[k] as string)) input[k] = `77${String(j).padStart(3, "0")}1`;
      j++;
    }
    base = await run(connector, action, input, Object.keys(creds));
  }
  return base.calls.length > 0 ? { input: base.input, calls: base.calls } : null;
}

const segments = (url: string) => new URL(url).pathname.split("/");

/**
 * SEC-PATH-2c setup-field contract: a credential/setup field (or a caller field
 * that the baseline passes alongside the credentials) that lands in the request
 * path must reject dot-only and blank values before any request. With strict,
 * percent-dot and separator forms must be rejected too; otherwise they may reach
 * the provider only as one opaque segment (same segment count, no dot segment).
 */
export async function expectSetupFieldGuarded(
  connector: string,
  action: string,
  field: string,
  baseInput: Record<string, unknown>,
  baseCalls: Call[],
  options: { strict?: boolean; declarative?: boolean } = {},
) {
  const value = String(baseInput[field]);
  const index = baseCalls.findIndex((call) => new URL(call.url).pathname.includes(value));
  expect(index, `${connector}.${action}: ${field}=${value} is not in the path`).toBeGreaterThanOrEqual(0);
  const baseSegments = segments(baseCalls[index]!.url).length;
  // Declarative ops render through the shared template guard: '.', '..' and
  // blank are rejected; anything else (' . ' included) is percent-encoded into
  // one opaque segment, which RFC 3986 never treats as a dot segment.
  const reject = options.declarative ? [".", "..", ...BLANK] : [...DOT_ONLY, ...BLANK];
  const opaque = options.declarative ? [" . ", " .. ", ...PERCENT_DOTS, ...SEPARATORS] : [...PERCENT_DOTS, ...SEPARATORS];
  const isDot = options.declarative ? rfcDotSegment : dotSegment;
  for (const bad of [...reject, ...(options.strict ? opaque : [])]) {
    await expectRejectedWithoutFetch(connector, action, { ...baseInput, [field]: bad });
  }
  if (!options.strict) {
    for (const bad of opaque) {
      const result = await run(connector, action, { ...baseInput, [field]: bad }, []);
      for (const call of result.calls) {
        expect(isDot(new URL(call.url).pathname), `${connector}.${action} ${field}=${bad} -> ${call.url}`).toBe(false);
      }
      if (result.calls[index]) {
        expect(segments(result.calls[index]!.url).length, `${connector}.${action} ${field}=${bad} -> ${result.calls[index]!.url}`).toBe(baseSegments);
      }
    }
  }
}

export async function requestsFor(connector: string, action: string, input: Record<string, unknown>) {
  return (await run(connector, action, input, [])).calls;
}
