// Handler output-schema sweep (PLAT-OUT-2).
//
// Run as a subprocess by handler_output_schema.test.ts so the stubbed global
// fetch is installed before any connector module loads and nothing leaks into
// other test files. Usage:
//   bun run test/output_schema_sweep.ts <connector...>
// Prints one OUTPUT_SCHEMA_SWEEP_REPORT <json> line on stdout.
//
// Every operation is dispatched through the real createFetchHandler RPC path
// (connector.action.execute / connector.sync.list) against canned provider
// responses. The server overwrites `connector`/`action` (or `sync`) on the way
// out, which would mask a handler that leaks those keys itself, so the sweep
// records the handler's own output at the registry boundary the server calls
// (defaultConnectorRegistry.executeAction / executeSync) and checks THAT
// against the operation's closed outputSchema. The only keys forgiven are the
// envelope keys compile.ts stamps on declaratively compiled output
// (connector/action/source; PLAT-OUT-1 owns those), and only when the call
// stack of the provider request that produced the output runs through
// declarative/compile.ts and through no connector's own src/. A handwritten
// handler that copies the stamp is still caught.
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "../../..");
// --no-credentials sends no credential at all: the fixture-safe "validated"
// fallback some handlers (and compile.ts) take when none is supplied.
const noCredentials = Bun.argv.includes("--no-credentials");
const connectors = Bun.argv.slice(2).filter((arg) => arg !== "--no-credentials");
type Call = { url: string; method: string };
let calls: Call[] = [];
// Canned provider responses, tried in turn until the op succeeds.
const VARIANTS: Array<{ body: string; type: string; status?: number; headers?: Record<string, string> }> = [
  { body: "{}", type: "application/json" },
  { body: "[]", type: "application/json" },
  { body: JSON.stringify({ object: "list", data: [], has_more: false, url: "/v1/x" }), type: "application/json" },
  { body: JSON.stringify({ id: "x1", object: "x" }), type: "application/json" },
  { body: JSON.stringify({ data: [] }), type: "application/json" },
  { body: JSON.stringify({ data: {} }), type: "application/json" },
  { body: "file-bytes", type: "application/octet-stream" },
  { body: "", type: "application/json", status: 204 },
  { body: JSON.stringify({ id: "x1", object: "x", deleted: true }), type: "application/json" },
  { body: "{}", type: "application/json", status: 201 },
  { body: JSON.stringify({ id: 1 }), type: "application/json", status: 201 },
  { body: "", type: "application/json", status: 302, headers: { location: "https://example.com/consent" } },
];
let variant = 0;
// The connector's own pinned fixture responses for the op, replayed in order
// when the canned shapes above are not what the handler expects.
type Canned = { status: number; headers: Record<string, string>; body: Uint8Array };
let fixtureReplay: Canned[] | null = null;
// Stack of the latest provider request: who actually built the output.
let lastStack: string[] = [];
let fixtureIndex = 0;
function fixtureResponses(connector: string, op: string): Canned[][] {
  const dir = `${root}/runner/connectors/${connector}/fixtures`;
  const out: Canned[][] = [];
  try {
    for (const file of readdirSync(`${dir}/cases`).filter((f) => f.endsWith(".json")).sort()) {
      const item = JSON.parse(readFileSync(`${dir}/cases/${file}`, "utf8"));
      if (item.operation !== op || item.expected?.kind !== "success" || !Array.isArray(item.exchanges)) continue;
      out.push(item.exchanges.map((exchange: any) => ({
        status: exchange.response?.status ?? 200,
        headers: exchange.response?.headers ?? { "content-type": "application/json" },
        body: exchange.response?.bodyFile ? readFileSync(resolve(`${dir}/cases`, exchange.response.bodyFile)) : new Uint8Array(),
      })));
    }
  } catch {}
  for (const name of [op, op.replace(/\./g, "_")]) {
    try { out.push([{ status: 200, headers: { "content-type": "application/json" }, body: readFileSync(`${dir}/${name}.json`) }]); } catch {}
  }
  return out;
}
const stub = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = input instanceof Request ? input.url : String(input);
  calls.push({ url, method: init?.method ?? (input instanceof Request ? input.method : "GET") });
  const stack = (new Error().stack ?? "").split("\n").filter((frame) => frame.includes("/runner/"));
  lastStack = stack;
  if (fixtureReplay && fixtureReplay.length > 0) {
    const canned = fixtureReplay[Math.min(fixtureIndex++, fixtureReplay.length - 1)]!;
    return new Response(canned.status === 204 || canned.status === 304 ? null : canned.body, { status: canned.status, headers: canned.headers });
  }
  if (/\/(?:oauth2?\/)?token$/.test(new URL(url).pathname)) {
    return new Response(JSON.stringify({ access_token: "tok", token_type: "Bearer", expires_in: 3600, api_domain: "https://www.zohoapis.com" }), { status: 200, headers: { "content-type": "application/json" } });
  }
  const v = VARIANTS[variant]!;
  return new Response(v.body, { status: v.status ?? 200, headers: { "content-type": v.type, ...(v.headers ?? {}) } });
}) as typeof fetch;
globalThis.fetch = stub;

const { createFetchHandler } = await import("../src/serve");
const { defaultConnectorRegistry } = await import("../src/registry");
const { assertOutputSchema } = await import("../src/declarative/validate");

// Record the handler's own output at the registry boundary the server calls.
let bareOutput: unknown = undefined;
const registry = defaultConnectorRegistry as unknown as Record<string, (...args: unknown[]) => unknown>;
for (const method of ["executeAction", "executeSync"] as const) {
  const original = registry[method]!.bind(defaultConnectorRegistry);
  registry[method] = (...args: unknown[]) => {
    const result = original(...args) as { ok: boolean; output?: unknown };
    if (result && result.ok) {
      return { ...result, output: Promise.resolve(result.output).then((value) => { bareOutput = value; return value; }) };
    }
    return result;
  };
}
const handler = createFetchHandler({ maxConcurrent: 4, maxQueued: 8 });
let rpcSeq = 0;

let seq = 0;
function marker(path: string) { return `mk${seq++}x${path.replace(/[^A-Za-z0-9]/g, "").slice(-24)}`; }
function sample(schema: any, path: string, markers: Map<string, string>, depth = 0): unknown {
  if (!schema || typeof schema !== "object" || depth > 6) { const m = marker(path); markers.set(path, m); return m; }
  for (const alt of ["oneOf", "anyOf"]) if (Array.isArray(schema[alt]) && schema[alt].length) return sample(schema[alt].find((s: any) => s.type !== "null") ?? schema[alt][0], path, markers, depth + 1);
  if (Array.isArray(schema.allOf) && schema.allOf.length) return sample(Object.assign({}, ...schema.allOf), path, markers, depth + 1);
  if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum.find((v: unknown) => v !== null) ?? schema.enum[0];
  if ("const" in schema) return schema.const;
  const t = Array.isArray(schema.type) ? schema.type.find((x: string) => x !== "null") : schema.type ?? (schema.properties ? "object" : schema.items ? "array" : "string");
  if (t === "integer" || t === "number") return Math.max(1, typeof schema.minimum === "number" ? schema.minimum : 1);
  if (t === "boolean") return true;
  if (t === "array") {
    const length = Math.max(1, Math.min(typeof schema.minItems === "number" ? schema.minItems : 1, 8));
    return Array.from({ length }, (_, i) => sample(schema.items, `${path}[${i}]`, markers, depth + 1));
  }
  if (t === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, s] of Object.entries<any>(schema.properties ?? {})) out[k] = sample(s, path ? `${path}.${k}` : k, markers, depth + 1);
    return out;
  }
  const key = path.split(/[.\[]/).pop() ?? path;
  if (schema.format === "email" || /email/i.test(key)) { const m = marker(path); markers.set(path, m); return `${m}@example.com`; }
  if (schema.format === "date-time" || /(At|Time|_at|start|end)$/i.test(key) && !/id$/i.test(key)) return "2026-01-01T00:00:00Z";
  if (schema.format === "date" || /date$/i.test(key)) return "2026-01-01";
  if (schema.format === "uri" || /url$/i.test(key)) { const m = marker(path); markers.set(path, m); return `https://example.com/${m}`; }
  if (schema.contentEncoding === "base64" || /base64|content$/i.test(key)) return "aGVsbG8=";
  if (typeof schema.maxLength === "number" && schema.maxLength < 12) return "ab".repeat(8).slice(0, Math.max(1, Math.min(schema.maxLength, 3)));
  if (typeof schema.pattern === "string" && /^\^?\[?0-9|\\d/.test(schema.pattern)) { const v = `77${String(seq++).padStart(4, "0")}1`; markers.set(path, v); return v; }
  const m = marker(path); markers.set(path, m);
  if (typeof schema.minLength === "number" && m.length < schema.minLength) { const p = m + "x".repeat(schema.minLength - m.length); markers.set(path, p); return p; }
  return m;
}
function getAt(obj: any, path: string): unknown {
  return path.split(/\.|\[(\d+)\]/).filter((p) => p !== undefined && p !== "").reduce((o: any, k) => (o == null ? undefined : o[k]), obj);
}
function setAt(obj: any, path: string, value: unknown) {
  const parts = path.split(/\.|\[(\d+)\]/).filter((p) => p !== undefined && p !== "");
  let o = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i]!;
    if (o[k] == null || typeof o[k] !== "object") o[k] = /^\d+$/.test(parts[i + 1]!) ? [] : {};
    o = o[k];
  }
  if (value === undefined) { if (Array.isArray(o)) o.splice(Number(parts.at(-1)), 1); else delete o[parts.at(-1)!]; }
  else o[parts.at(-1)!] = value;
}
const clone = (v: any) => structuredClone(Object.fromEntries(Object.entries(v).filter(([k]) => k !== "fetch")));

async function exec(connector: string, op: string, kind: string, input: Record<string, unknown>) {
  calls = []; bareOutput = undefined; fixtureIndex = 0; lastStack = [];
  const method = kind === "sync" ? "connector.sync.list" : "connector.action.execute";
  const params: Record<string, unknown> = { connectorKey: connector, input };
  if (kind === "sync") params.sync = op; else params.action = op;
  const res = await handler(new Request("http://runner/rpc", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: `os${rpcSeq++}`, method, params }) }));
  const body: any = await res.json();
  if (body.ok) return { calls: [...calls], ok: true as const, output: bareOutput, stack: lastStack };
  return { calls: [...calls], ok: false as const, code: body.error?.code as string | undefined, message: String(body.error?.message ?? "") };
}

// Repair common validator complaints; returns true when the input changed.
function repair(input: any, msg: string, markers: Map<string, string>, creds: Set<string>): boolean {
  let m: RegExpExecArray | null;
  if ((m = /Unsupported input field:? ?([A-Za-z0-9_]+)?/.exec(msg))) {
    const k = m[1] && m[1] in input ? m[1] : [...creds].find((c) => c in input && !["accessToken"].includes(c));
    if (k) { delete input[k]; return true; }
    return false;
  }
  if ((m = /(?:^|[\s:])([A-Za-z_][\w]*(?:\[\d+\]|\.[A-Za-z_]\w*)*) (?:is|are) only (?:allowed|supported) when/.exec(msg))) {
    const list = m[1]!.split("/"); let ch = false;
    for (const k of list) if (getAt(input, k) !== undefined) { setAt(input, k, undefined); ch = true; }
    if (ch) return true;
  }
  if ((m = /([\w./]+) are only allowed when/.exec(msg))) { let ch = false; for (const k of m[1]!.split("/")) if (k in input) { delete input[k]; ch = true; } if (ch) return true; }
  if ((m = /only supported for (?:status|\w+) ([A-Z_]+)/.exec(msg)) || (m = /^(\w+) is only supported/.exec(msg))) {
    const f = /^(\w+) is only/.exec(msg)?.[1]; if (f && f in input) { delete input[f]; return true; }
  }
  if ((m = /([\w.\[\]]+) must include exactly one of ([\w, ]+?),? or (\w+)/.exec(msg))) {
    const names = (m[2]! + "," + m[3]!).split(/,\s*/).filter(Boolean);
    names.slice(1).forEach((k) => setAt(input, `${m![1]}.${k}`, undefined));
    const v = `77${String(seq++).padStart(4, "0")}1`; setAt(input, `${m[1]}.${names[0]}`, v); markers.set(`${m[1]}.${names[0]}`, v); return true;
  }
  if ((m = /:? ([\w.\[\]]+) has an invalid type \(expected string\)/.exec(msg))) { const v = `77${String(seq++).padStart(4, "0")}1`; setAt(input, m[1]!, v); markers.set(m[1]!, v); return true; }
  if ((m = /:? ([\w.\[\]]+) is too long/.exec(msg))) { setAt(input, m[1]!, "ab"); markers.delete(m[1]!); return true; }
  if ((m = /exactly one of ([\w, ]+?),? or (\w+) is required/i.exec(msg)) || (m = /Provide exactly one of (\w+).*? or (\w+)/i.exec(msg))) {
    const names = (m[1]! + "," + m[2]!).split(/,\s*|\s+/).map((s) => s.replace(/\(.*\)/, "")).filter((s) => /^\w+$/.test(s) && s !== "or");
    let ch = false; names.slice(1).forEach((k) => { if (k in input) { delete input[k]; ch = true; } });
    if (!(names[0]! in input)) { input[names[0]!] = marker(names[0]!); markers.set(names[0]!, input[names[0]!]); ch = true; }
    if (ch) return true;
  }
  if ((m = /provide either (\w+) or (\w+), not both/i.exec(msg)) && m[2]! in input) { delete input[m[2]!]; return true; }
  if ((m = /Use either (\w+) or ([\w/]+), not both/.exec(msg))) { let ch = false; for (const k of m[2]!.split("/")) if (k in input) { delete input[k]; ch = true; } if (ch) return true; }
  if ((m = /([\w.\[\]]+) must be (?:one of )?([a-z_]+(?:\|[a-z_]+)+)/i.exec(msg))) { setAt(input, m[1]!, m[2]!.split("|")[0]); return true; }
  if ((m = /([\w.\[\]]+?)(?: ids?)? must be an? (?:positive )?integer/i.exec(msg))) {
    let ch = false;
    for (const k of m[1]!.split("/")) for (const kk of Object.keys(input).filter((x) => !creds.has(x) && typeof input[x] !== "boolean" && (x === k || x.toLowerCase().endsWith(k.toLowerCase())))) {
      const cur = getAt(input, kk); const v = typeof cur === "number" ? undefined : `77${String(seq++).padStart(4, "0")}1`;
      if (v && cur !== v && !/^\d+$/.test(String(cur))) { setAt(input, kk, v); markers.set(kk, v); ch = true; }
      else if (typeof cur === "string" && /^\d+$/.test(cur)) { setAt(input, kk, Number(cur)); ch = true; }
    }
    return ch;
  }
  if ((m = /([\w.\[\]]+) is required/.exec(msg)) && getAt(input, m[1]!) === undefined && !creds.has(m[1]!)) { const v = marker(m[1]!); markers.set(m[1]!, v); setAt(input, m[1]!, v); return true; }
  if ((m = /(\w+) and (\w+) cannot both be set/.exec(msg)) && m[2]! in input) { delete input[m[2]!]; return true; }
  if ((m = /(?:^|[\s:])(\w+) is not supported/.exec(msg)) && m[1]! in input) { delete input[m[1]!]; return true; }
  if ((m = /([\w.\[\]]+) is too short/.exec(msg))) { const v = `${marker(m[1]!)}${"x".repeat(24)}`; markers.set(m[1]!, v); setAt(input, m[1]!, v); return true; }
  return false;
}
const OVERRIDE: Record<string, Record<string, unknown>> = {
  mailchimp: { apiKey: "key-us1" }, salesforce: { accessToken: "t", instanceUrl: "https://acme.my.salesforce.com", instance_host: "acme.my.salesforce.com" },
  sendgrid: { apiKey: "SG.key" }, slack: { accessToken: "xoxb-1" }, lever: { apiKey: "k", region: "co" }, brevo: { apiKey: "k" }, resend: { apiKey: "re_key" },
  docusign: { accessToken: "t", restHost: "demo.docusign.net", oauthHost: "account-d.docusign.com", accountId: "acct1" },
  woocommerce: { siteUrl: "https://shop.mystore.test", consumerKey: "ck_1", consumerSecret: "cs_1" },
  whatsapp: { accessToken: "t", phoneNumberId: "1234567", graphVersion: "v25.0" }, caldav: { baseUrl: "https://caldav.icloud.com", username: "u", password: "p" },
  jira: { accessToken: "t", cloudId: "cloud1" }, workable: { accessToken: "t", account: "acme" }, zendesk: { email: "a@b.c", apiToken: "t", subdomain: "acme" },
  smartrecruiters: { apiKey: "t" }, greenhouse: { clientId: "cid", clientSecret: "csec", userId: "7001" }, ashby: { apiKey: "k" },
};
const sourceCache = new Map<string, string[]>();
function sourceInputNames(connector: string): string[] {
  if (sourceCache.has(connector)) return sourceCache.get(connector)!;
  const dir = `${root}/runner/connectors/${connector}/src`;
  const names = new Set<string>();
  try {
    for (const f of readdirSync(dir)) if (f.endsWith(".ts")) for (const m of readFileSync(`${dir}/${f}`, "utf8").matchAll(/\b(?:input|raw|rawInput|params|args|record)\.([A-Za-z_]\w*)/g)) names.add(m[1]!);
  } catch {}
  for (const k of ["fetch", "response", "trim", "length", "toString", "cursor", "since", "updatedSince", "updated_since", "createdAfter", "modifiedSince", "startDate", "endDate"]) names.delete(k);
  const out = [...names];
  sourceCache.set(connector, out);
  return out;
}
const OPFIX: Record<string, (input: any, markers: Map<string, string>) => void> = {
  "greenhouse applications.move": (i) => { i.fromStageId = 7001; i.toStageId = 7002; delete i.toJobId; i.emailFromUserId = 7003; },
  "zoho-recruit *": (i, m) => { i.dataCenter = "com"; for (const k of Object.keys(i)) if (/domain/i.test(k)) { delete i[k]; m.delete(k); } },
  "slack messages.list": (i, m) => { i.channelId = "C0123"; m.set("channelId", "C0123"); },
  "caldav events.create": (i) => { i.attendees = ["mailto:a@example.com"]; i.timezone = "UTC"; },
  "caldav events.update": (i) => { i.attendees = ["mailto:a@example.com"]; i.timezone = "UTC"; },
  "raisely campaigns.media.upload": (i) => { i.file = { name: "a.png", contentBase64: "aGVsbG8=" }; delete i.folderUuid; },
  "stripe files.create": (i) => { i.content_type = "text/plain"; i.file_name = "a.txt"; },
  "greenhouse jobs.list_internal": (i) => { i.confidential = true; },
  "bigmailer suppressionLists.create": (i) => { i.contentType = "text/csv"; },
  "smartrecruiters applications.properties.update": (i, m) => { i.properties = [{ id: "propA", textValue: "v" }]; m.delete("properties[0].id"); },
};
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
// A healthcheck answers the control plane's HealthcheckResponse, which requires
// `status` and reads `source` ("provider" is what marks a connection verified;
// crates/appcall-runner-client HealthcheckResponse, appcall-api services.rs).
// Those two keys are that contract, not a handler leak, on healthcheck only.
const HEALTHCHECK_CONTRACT = ["status", "source"];
const COMPILE_ENVELOPE = ["connector", "action", "source"];
function platformInjected(connector: string, output: Record<string, unknown>, allowed: Set<string>, stack: string[] | undefined): string[] {
  const keys = COMPILE_ENVELOPE.filter((k) => k in output && !allowed.has(k));
  if (keys.length === 0 || output.connector !== connector || !stack) return [];
  const compiled = stack.some((frame) => frame.includes("/runner/bun/src/declarative/compile.ts"));
  const handwritten = stack.some((frame) => frame.includes("/runner/connectors/"));
  return compiled && !handwritten ? keys : [];
}
function schemaError(output: unknown, schema: any): string | null {
  try { assertOutputSchema(output, schema); return null; } catch (error) { return error instanceof Error ? error.message : String(error); }
}

const report = { reached: 0, closedChecked: 0, platformEnveloped: 0, healthcheckContract: [] as string[], healthcheckNoCredential: [] as string[], findings: [] as Array<{ connector: string; kind: string; op: string; extra: string[]; missing: string[] }>, invalid: [] as Array<{ connector: string; kind: string; op: string; error: string }>, skipped: [] as Array<{ connector: string; kind: string; op: string; reason: string }> };
for (const connector of connectors) {
  const manifest = JSON.parse(readFileSync(`${root}/runner/connectors/${connector}/manifest.json`, "utf8"));
  let creds: Record<string, unknown> = {};
  for (const f of manifest.auth?.setup?.fields ?? []) creds[f.key] = /subdomain|account$|domain$/i.test(f.key) ? "acme" : /dsn/i.test(f.key) ? "https://api1.unipile.com:13111" : `cred${f.key}`;
  for (const r of manifest.auth?.setup?.routes ?? []) for (const f of r.fields ?? []) if (!(f.key in creds)) creds[f.key] = `cred${f.key}`;
  if (Object.keys(creds).length === 0 || manifest.auth?.type === "oauth2") creds.accessToken = "credaccessToken";
  if (connector === "unipile") creds.account_id = "credaccountid";
  if (OVERRIDE[connector]) creds = { ...OVERRIDE[connector] };
  if (noCredentials) creds = {};
  const credSet = new Set(Object.keys(creds));
  for (const [op, spec] of Object.entries<any>(manifest.operations)) {
    const kind = spec.kind ?? "action";
    if (kind === "webhook") continue;
    const markers = new Map<string, string>();
    let schema = spec.inputSchema;
    if (!schema) {
      schema = { type: "object", properties: Object.fromEntries(sourceInputNames(connector).map((k) => [k, /^(limit|perPage|per_page|pageSize|page|offset|max\w*)$/i.test(k) ? { type: "integer" } : { type: "string" }])) };
    }
    const base: any = { ...(sample(schema, "", markers) as object) };
    for (const k of Object.keys(base)) if (credSet.has(k)) { delete base[k]; markers.delete(k); }
    Object.assign(base, creds);
    OPFIX[`${connector} *`]?.(base, markers);
    OPFIX[`${connector} ${op}`]?.(base, markers);
    variant = 0;
    let res = await exec(connector, op, kind, clone(base));
    for (let n = 0; n < 12 && res.calls.length === 0 && !res.ok; n++) {
      if (!repair(base, res.message ?? "", markers, credSet)) break;
      res = await exec(connector, op, kind, clone(base));
    }
    if (res.calls.length === 0 && !res.ok) {
      for (const [p, m] of markers) if (getAt(base, p) === m) { const v = `77${String(seq++).padStart(4, "0")}1`; markers.set(p, v); setAt(base, p, v); }
      res = await exec(connector, op, kind, clone(base));
      for (let n = 0; n < 8 && res.calls.length === 0 && !res.ok; n++) { if (!repair(base, res.message ?? "", markers, credSet)) break; res = await exec(connector, op, kind, clone(base)); }
    }
    for (let v = 1; !res.ok && res.calls.length > 0 && v < VARIANTS.length; v++) { variant = v; res = await exec(connector, op, kind, clone(base)); }
    if (!res.ok && res.calls.length > 0) {
      variant = 0;
      for (const replay of fixtureResponses(connector, op)) {
        fixtureReplay = replay; fixtureIndex = 0;
        res = await exec(connector, op, kind, clone(base));
        if (res.ok) break;
      }
    }
    // A static healthcheck that makes no provider call is refused with a
    // credential (no provider evidence), so it is never reached above; check
    // its shape on the credential-free path instead (e.g. quickbooks). Only that
    // refusal qualifies: other credential-free healthchecks are the compile.ts
    // "validated" echo, which is not handler output.
    if (!res.ok && res.calls.length === 0 && kind === "action" && op === "healthcheck" && credSet.size > 0 && /did not confirm provider health/.test(res.message ?? "")) {
      const bare = Object.fromEntries(Object.entries(base).filter(([k]) => !credSet.has(k)));
      const again = await exec(connector, op, kind, bare);
      if (again.ok && again.calls.length === 0) { res = again; report.healthcheckNoCredential.push(connector); }
    }
    if (!res.ok) { fixtureReplay = null; report.skipped.push({ connector, kind, op, reason: `${res.code}: ${(res.message ?? "").slice(0, 160)}` }); continue; }
    report.reached++;
    const os = spec.outputSchema;
    if (!isRecord(os) || os.additionalProperties !== false || !isRecord(res.output)) { fixtureReplay = null; continue; }
    report.closedChecked++;
    const output = res.output;
    const allowed = new Set(Object.keys((os.properties as object) ?? {}));
    const forgiven = platformInjected(connector, output, allowed, res.stack);
    if (forgiven.length) report.platformEnveloped++;
    const contract = op === "healthcheck" ? HEALTHCHECK_CONTRACT.filter((k) => k in output && !allowed.has(k)) : [];
    if (contract.length) report.healthcheckContract.push(`${connector} ${contract.join(",")}`);
    const extra = Object.keys(output).filter((k) => !allowed.has(k) && !forgiven.includes(k) && !contract.includes(k));
    const missing = (Array.isArray(os.required) ? os.required as string[] : []).filter((k) => output[k] === undefined);
    if (extra.length || missing.length) { fixtureReplay = null; report.findings.push({ connector, kind, op, extra, missing }); continue; }
    const stripped = Object.fromEntries(Object.entries(output).filter(([k]) => !forgiven.includes(k) && !contract.includes(k)));
    let error = schemaError(stripped, os);
    // A canned response may simply be the wrong shape for this op (e.g. an
    // empty 204 where the schema wants an object); look for one that fits.
    for (let v = 0; error && v < VARIANTS.length; v++) {
      variant = v;
      const again = await exec(connector, op, kind, clone(base));
      if (!again.ok || !isRecord(again.output)) continue;
      const f2 = platformInjected(connector, again.output, allowed, again.stack);
      const s2 = Object.fromEntries(Object.entries(again.output).filter(([k]) => !f2.includes(k) && !contract.includes(k)));
      if (Object.keys(s2).every((k) => allowed.has(k))) error = schemaError(s2, os) ? error : null;
    }
    variant = 0;
    fixtureReplay = null;
    if (error) report.invalid.push({ connector, kind, op, error });
  }
}
// Await the write: process.exit right after a large write to a pipe can cut
// the report short.
await Bun.write(Bun.stdout, `\nOUTPUT_SCHEMA_SWEEP_REPORT ${JSON.stringify(report)}\n`);
process.exit(0);
