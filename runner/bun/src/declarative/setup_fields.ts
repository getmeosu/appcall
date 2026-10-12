// SEC-SETUP-1: setup fields that a manifest renders into a request URL.
//
// A stored setup value is the tenant's own (the control plane splices the
// connection bundle over the caller's input), but it is still free text typed at
// connect time, and renderTemplate does not encode the base URL. So a value is
// held to what its position in the URL can safely carry, decided from where the
// manifest's templates put it:
//
//   - segment: inside the base URL path (amilia `/org/{{organization}}`,
//     big-commerce `/stores/{{storeHash}}`, workday `/v1/{{tenant}}`). One path
//     segment of unreserved characters, never a dot segment.
//   - label:   part of the host, next to fixed provider labels
//     (`{{shopDomain}}.myshopify.com`), for a connector whose allowlist admits a
//     wildcard. A single RFC 1123 label; an exact-host allowlist already pins the
//     host, so fields rendered against one (affinda region, lever region) are
//     left to it.
//   - host:    the whole host, which the allowlist then admits by rendering the
//     same field (`allowedHosts: ["{{host}}"]`). Such a field must have an entry
//     in SETUP_HOST_POLICIES: a vendor allowlist, or "public" for self-hosted
//     software, where any public https hostname is accepted. A manifest that
//     renders an unlisted field as a whole host does not compile.
//
// Values are normalized first, as stored connections may carry a scheme or a
// trailing slash: surrounding whitespace, a leading `https://` (any case) and
// trailing slashes are dropped; a label field also accepts its full provider
// host (`acme.myshopify.com` -> `acme`).
//
// Resolve-time checks: the runner's outbound client (http.ts) hands the URL to
// fetch, which resolves and connects itself; there is no hook between DNS
// resolution and connect, so a "public" hostname that resolves to a private
// address is not caught here. A pre-flight lookup would be defeated by DNS
// rebinding, so that belongs to egress policy, not to this check.
import type { DeclarativeManifest } from "./types";

export type HostPolicy =
  | { kind: "vendor"; suffixes: string[] }
  | { kind: "vendor-label"; suffix: string }
  | { kind: "public" };

export const SETUP_HOST_POLICIES: Record<string, Record<string, HostPolicy>> = {
  confluence: { site: { kind: "vendor-label", suffix: "atlassian.net" } },
  docusign: {
    restHost: { kind: "vendor", suffixes: ["docusign.net", "docusign.com"] },
    oauthHost: { kind: "vendor", suffixes: ["docusign.net", "docusign.com"] },
  },
  workday: { host: { kind: "vendor", suffixes: ["workday.com", "myworkday.com"] } },
  mailchimp: { host: { kind: "vendor-label", suffix: "api.mailchimp.com" } },
  gitlab: { host: { kind: "public" } },
  lemmy: { host: { kind: "public" } },
  mastodon: { instance: { kind: "public" } },
  wordpress: { host: { kind: "public" } },
};

type FieldRule = { segment: boolean; label: boolean; labelSuffixes: string[]; host?: HostPolicy };
export type SetupFieldRules = Map<string, FieldRule>;

const PLACEHOLDER = /\{\{\s*([A-Za-z0-9_.$-]+)\s*\}\}/g;
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** A rejected setup value; `host` is true when it was bound for the URL host. */
export class SetupFieldError extends Error {
  constructor(message: string, readonly host: boolean) {
    super(message);
  }
}

function fail(field: string, detail: string): never {
  throw new SetupFieldError(`${field} ${detail}`, false);
}

/** Derive each URL-rendered setup field's rule from the manifest's templates. */
export function setupFieldRules(manifest: DeclarativeManifest): SetupFieldRules {
  const rules: SetupFieldRules = new Map();
  const rule = (name: string): FieldRule => {
    let entry = rules.get(name);
    if (!entry) rules.set(name, (entry = { segment: false, label: false, labelSuffixes: [] }));
    return entry;
  };
  const allowedHosts = (manifest.network?.allowedHosts ?? []).filter((h): h is string => typeof h === "string");
  const wildcard = allowedHosts.some((host) => host.startsWith("*."));
  const policies = SETUP_HOST_POLICIES[manifest.key] ?? {};
  const wholeHost = (name: string) => {
    const policy = policies[name];
    if (!policy) {
      throw new Error(
        `${manifest.key}: setup field ${name} is rendered as a whole host; add a SETUP_HOST_POLICIES entry (vendor allowlist or public)`,
      );
    }
    rule(name).host = policy;
  };
  for (const host of allowedHosts) {
    const whole = /^\{\{\s*([A-Za-z0-9_.$-]+)\s*\}\}$/.exec(host.trim());
    if (whole) wholeHost(whole[1]!.split(".")[0]!);
  }
  const bases = [manifest.http?.baseUrl, ...Object.values(manifest.operations ?? {}).map((op) => op?.request?.baseUrl)];
  for (const base of bases) {
    if (typeof base !== "string" || !base.includes("{{")) continue;
    const match = /^[a-z]+:\/\/([^/]*)(.*)$/i.exec(base);
    if (!match) continue;
    const authority = match[1]!;
    const path = match[2]!;
    for (const found of authority.matchAll(PLACEHOLDER)) {
      const name = found[1]!.split(".")[0]!;
      if (authority.trim() === found[0]) {
        if (rules.get(name)?.host === undefined && policies[name]) rule(name).host = policies[name];
        continue; // a whole-host field rendered only into the base URL is pinned by a static allowlist
      }
      if (!wildcard) continue;
      const entry = rule(name);
      entry.label = true;
      const suffix = authority.slice((found.index ?? 0) + found[0].length);
      const lower = suffix.toLowerCase();
      if (lower && !lower.includes("{{") && !entry.labelSuffixes.includes(lower)) entry.labelSuffixes.push(lower);
    }
    for (const found of path.matchAll(PLACEHOLDER)) rule(found[1]!.split(".")[0]!).segment = true;
  }
  return rules;
}

function stripSchemeAndSlashes(value: string): string {
  return value.trim().replace(/^https:\/\//i, "").replace(/\/+$/, "");
}

/** One base-URL path segment: unreserved characters only, never a dot segment. */
export function normalizeSetupSegment(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") return fail(field, "is required");
  const trimmed = value.trim();
  if (!/^[A-Za-z0-9._~-]+$/.test(trimmed)) fail(field, "may only contain letters, digits, dots, underscores, tildes and hyphens");
  if (/^\.+$/.test(trimmed)) fail(field, "must not be a dot segment");
  return trimmed;
}

/**
 * One RFC 1123 hostname label; the full provider host is accepted and reduced.
 * Case is kept (hosts are case-insensitive, but the same field may also feed a
 * header, e.g. Algolia's application id).
 */
export function normalizeSetupLabel(value: unknown, field: string, suffixes: string[] = []): string {
  if (typeof value !== "string" || value.trim() === "") return fail(field, "is required");
  let text = stripSchemeAndSlashes(value);
  for (const suffix of suffixes) {
    if (text.length > suffix.length && text.toLowerCase().endsWith(suffix)) {
      text = text.slice(0, -suffix.length);
      break;
    }
  }
  if (!LABEL.test(text.toLowerCase())) {
    fail(field, "must be a single hostname label (1-63 letters, digits or hyphens, not starting or ending with a hyphen)");
  }
  return text;
}

function ipv4Octets(host: string): number[] | null {
  const parts = host.split(".");
  if (parts.length !== 4 || !parts.every((p) => /^\d{1,3}$/.test(p))) return null;
  const octets = parts.map(Number);
  return octets.every((o) => o <= 255) ? octets : null;
}

function ipv4IsPublic([a, b, c, d]: number[]): boolean {
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false; // this-network, private, loopback, multicast, reserved, broadcast
  if (a === 100 && b! >= 64 && b! <= 127) return false; // CGNAT (Alibaba metadata 100.100.100.200)
  if (a === 169 && b === 254) return false; // link-local, cloud metadata 169.254.169.254
  if (a === 172 && b! >= 16 && b! <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false; // IETF assignments, TEST-NET-1
  if (a === 192 && b === 88 && c === 99) return false; // 6to4 relay anycast
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
  if (a === 198 && b === 51 && c === 100) return false; // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return false; // TEST-NET-3
  if (a === 168 && b === 63 && c === 129 && d === 16) return false; // Azure host endpoint
  return true;
}

function ipv6Groups(literal: string): number[] | null {
  // `literal` is WHATWG-serialized (compressed, lowercase, no embedded dotted quad).
  const halves = literal.split("::");
  if (halves.length > 2) return null;
  const parse = (part: string) => (part === "" ? [] : part.split(":").map((g) => parseInt(g, 16)));
  const head = parse(halves[0]!);
  const tail = halves.length === 2 ? parse(halves[1]!) : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  const groups = [...head, ...new Array(fill).fill(0), ...tail];
  return groups.length === 8 && groups.every((g) => Number.isInteger(g) && g >= 0 && g <= 0xffff) ? groups : null;
}

function ipv6IsPublic(g: number[]): boolean {
  const embedded = (hi: number, lo: number) => ipv4IsPublic([hi >> 8, hi & 0xff, lo >> 8, lo & 0xff]);
  if (g.slice(0, 6).every((x) => x === 0)) return false; // ::, ::1, IPv4-compatible ::a.b.c.d
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return false; // IPv4-mapped ::ffff:a.b.c.d
  if (g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0xffff && g[5] === 0) return false; // IPv4-translated
  if (g[0] === 0x64 && g[1] === 0xff9b) return false; // NAT64 (well-known and local-use prefixes)
  if (g[0] === 0x0100 && g[1] === 0 && g[2] === 0 && g[3] === 0) return false; // discard-only
  if ((g[0]! & 0xfe00) === 0xfc00) return false; // unique local (incl. AWS metadata fd00:ec2::254)
  if ((g[0]! & 0xffc0) === 0xfe80 || (g[0]! & 0xffc0) === 0xfec0) return false; // link-local, site-local
  if ((g[0]! & 0xff00) === 0xff00) return false; // multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return false; // documentation
  if (g[0] === 0x2001 && g[1]! < 0x0200) return false; // IETF protocol assignments, Teredo
  if (g[0] === 0x2002) return embedded(g[1]!, g[2]!); // 6to4 carries an IPv4 address
  return true;
}

const BLOCKED_NAMES = /(?:^|\.)(?:localhost|local|internal|localdomain|home\.arpa)$/;

/** A whole host under a policy; returns the canonical hostname to render. */
export function normalizeSetupHost(value: unknown, field: string, policy: HostPolicy): string {
  if (typeof value !== "string" || value.trim() === "") return fail(field, "is required");
  const text = stripSchemeAndSlashes(value);
  // Hostname only: no userinfo, port, path, query, fragment, escapes or spaces.
  if (text === "" || /[@:/\\?#%\s]/.test(text.replace(/^\[[0-9a-fA-F:.]+\]$/, "[]"))) {
    fail(field, "must be a bare hostname (no scheme other than https://, userinfo, port or path)");
  }
  let host: string;
  try {
    const url = new URL(`https://${text}/`);
    if (url.username || url.password || url.port || url.pathname !== "/" || url.search || url.hash) throw new Error();
    host = url.hostname;
  } catch {
    return fail(field, "must be a valid hostname");
  }
  host = host.replace(/\.$/, "");
  if (policy.kind !== "public") {
    const labels = host.split(".");
    if (!labels.every((label) => LABEL.test(label))) fail(field, "must be a valid hostname");
    if (policy.kind === "vendor-label") {
      if (labels.length !== policy.suffix.split(".").length + 1 || !host.endsWith(`.${policy.suffix}`)) {
        fail(field, `must be <name>.${policy.suffix}`);
      }
    } else if (!policy.suffixes.some((suffix) => host.endsWith(`.${suffix}`))) {
      fail(field, `must be a host under ${policy.suffixes.join(" or ")}`);
    }
    return host;
  }
  if (host.startsWith("[")) {
    const groups = ipv6Groups(host.slice(1, -1));
    if (!groups || !ipv6IsPublic(groups)) fail(field, "must not be a private, loopback, link-local or reserved address");
    return host;
  }
  const octets = ipv4Octets(host);
  if (octets) {
    // WHATWG already turned decimal, octal and hex forms into dotted decimal.
    if (!ipv4IsPublic(octets)) fail(field, "must not be a private, loopback, link-local or reserved address");
    return host;
  }
  const labels = host.split(".");
  if (labels.length < 2 || !labels.every((label) => LABEL.test(label))) fail(field, "must be a public hostname");
  if (BLOCKED_NAMES.test(host)) fail(field, "must be a public hostname, not a local or internal name");
  return host;
}

/** Normalize and check every URL-rendered setup field present in `input`. */
export function applySetupFieldRules(rules: SetupFieldRules, input: Record<string, unknown>): Record<string, unknown> {
  if (rules.size === 0) return input;
  const out = { ...input };
  for (const [field, rule] of rules) {
    if (!(field in out)) continue;
    let value = out[field];
    try {
      if (rule.host) value = normalizeSetupHost(value, field, rule.host);
      if (rule.label) value = normalizeSetupLabel(value, field, rule.labelSuffixes);
    } catch (error) {
      throw new SetupFieldError(error instanceof Error ? error.message : `${field} is invalid`, true);
    }
    if (rule.segment) value = normalizeSetupSegment(value, field);
    out[field] = value;
  }
  return out;
}
