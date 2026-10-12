// SEC-SETUP-1: setup fields rendered into a request URL, by field class.
//   segment  amilia organization, big-commerce storeHash, workday tenant
//   label    the 23 subdomain fields (one RFC 1123 label)
//   vendor   docusign restHost/oauthHost, confluence site, workday host
//   public   gitlab host, lemmy host, mastodon instance, wordpress host
// Each class is driven through the compiled healthcheck with a fetch stub, so
// a rejected value is proven to make no request at all.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { compileDeclarativeConnector } from "../src/declarative/compile";
import {
  normalizeSetupHost,
  normalizeSetupLabel,
  normalizeSetupSegment,
  setupFieldRules,
  SETUP_HOST_POLICIES,
} from "../src/declarative/setup_fields";

const connectorsDir = resolve(import.meta.dir, "../../connectors");
const manifestOf = (key: string) => JSON.parse(readFileSync(resolve(connectorsDir, key, "manifest.json"), "utf8"));

type Outcome = { hosts: string[]; paths: string[]; code?: string };
async function run(key: string, overrides: Record<string, unknown>, op = "healthcheck"): Promise<Outcome> {
  const manifest = manifestOf(key);
  const creds: Record<string, unknown> = {};
  for (const field of manifest.auth?.setup?.fields ?? []) creds[field.key] = `cred${field.key}`;
  if (manifest.http?.auth?.field) creds[manifest.http.auth.field] ??= "credtoken";
  const hosts: string[] = [];
  const paths: string[] = [];
  const fetchStub = (async (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    hosts.push(url.hostname);
    paths.push(url.pathname);
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  const action = compileDeclarativeConnector(manifest).actions[op]!;
  try {
    await action({ ...creds, ...overrides, fetch: fetchStub });
    return { hosts, paths };
  } catch (error) {
    return { hosts, paths, code: (error as { code?: string }).code };
  }
}

const SEGMENT_BAD = [".", "..", " ", "", "%2e", "%2e%2e", "a/b", "a\\b", "/", "a?b", "a#b", "a b", "a%2Fb", "a@b"];
const LABEL_BAD = [
  ".", "..", "", " ", "%2e", "a.evil.example", "evil.example/x", "a/b", "a\\b", "/", "a?b", "a#b", "a@b",
  "-acme", "acme-", "a_b", "a".repeat(64), "http://acme", "acme:443", "user@acme", "https://", "https:///", "ftp://acme",
];
const PUBLIC_BAD = [
  "127.0.0.1", "127.1", "2130706433", "0177.0.0.1", "0x7f.0.0.1", "0x7f000001", "017700000001", "10.0.0.1", "172.16.0.1",
  "192.168.1.1", "169.254.169.254", "100.100.100.200", "0.0.0.0", "255.255.255.255", "168.63.129.16",
  "[::1]", "[::]", "[::ffff:127.0.0.1]", "[::ffff:7f00:1]", "[::ffff:a9fe:a9fe]", "[::127.0.0.1]", "[fd00:ec2::254]",
  "[fe80::1]", "[fc00::1]", "[64:ff9b::7f00:1]", "[2002:7f00:1::]", "[2001:db8::1]", "[ff02::1]",
  "localhost", "LOCALHOST", "localhost.", "a.localhost", "metadata.google.internal", "printer.local", "intranet",
  "host.localdomain", "gitlab.example.com:8443", "gitlab.example.com:443", "user@gitlab.example.com",
  "user:pw@gitlab.example.com", "gitlab.example.com/x", "gitlab.example.com?x", "gitlab.example.com#x",
  "http://gitlab.example.com", "https://169.254.169.254/", "https://user@gitlab.example.com", "gitlab..example.com",
  ".", "..", "", " ", "%2e", "a b.example.com", "gitlab.example.com%2f..", "[::1]:443",
];

describe("field classes come from where the manifest renders the field", () => {
  test("segment, label and host fields", () => {
    const rules = (key: string) => Object.fromEntries([...setupFieldRules(manifestOf(key))].map(([f, r]) => [f, r]));
    expect(rules("amilia").organization).toMatchObject({ segment: true, label: false });
    expect(rules("big-commerce").storeHash).toMatchObject({ segment: true, label: false });
    expect(rules("workday").tenant).toMatchObject({ segment: true });
    expect(rules("workday").host!.host).toEqual(SETUP_HOST_POLICIES.workday!.host);
    expect(rules("shopify").shopDomain).toMatchObject({ label: true, labelSuffixes: [".myshopify.com"] });
    expect(rules("quentn").systemId).toMatchObject({ label: true });
    expect(rules("quentn").serverId).toMatchObject({ label: true, labelSuffixes: [".quentn.com"] });
    expect(rules("gitlab").host!.host).toEqual({ kind: "public" });
    expect(rules("confluence").site!.host).toEqual({ kind: "vendor-label", suffix: "atlassian.net" });
    // An exact-host allowlist already pins these hosts (affinda's region is "api.us1").
    expect(rules("affinda").region).toBeUndefined();
    expect(rules("lever").region).toBeUndefined();
  });

  test("a whole-host field without a host policy does not compile", () => {
    const manifest = manifestOf("gitlab");
    expect(() => compileDeclarativeConnector({ ...manifest, key: "gitlab-unlisted" })).toThrow(/SETUP_HOST_POLICIES/);
  });
});

describe("path setup fields take the segment guard", () => {
  const CASES: Array<[string, string, Record<string, unknown>]> = [
    ["amilia", "organization", {}],
    ["big-commerce", "storeHash", {}],
    ["workday", "tenant", { host: "wd2-impl-services1.workday.com" }],
  ];
  for (const [key, field, extra] of CASES) {
    for (const bad of SEGMENT_BAD) {
      test(`${key} ${field}=${JSON.stringify(bad)} is refused before any request`, async () => {
        const out = await run(key, { ...extra, [field]: bad });
        expect(out.code).toBe("INVALID_ACTION_INPUT");
        expect(out.hosts).toEqual([]);
      });
    }
    test(`${key} ${field} keeps a real value in one segment`, async () => {
      const out = await run(key, { ...extra, [field]: " acme-Org_1.x~ " });
      expect(out.code).toBeUndefined();
      expect(out.paths[0]!.split("/")).toContain("acme-Org_1.x~");
    });
  }
});

// The 23 subdomain fields: one RFC 1123 label in front of fixed provider labels.
const LABEL_FIELDS: Array<[string, string, string]> = [
  ["algolia", "applicationId", "-dsn.algolia.net"],
  ["bamboohr", "companyDomain", ".bamboohr.com"],
  ["booqable", "companySlug", ".booqable.com"],
  ["breeze", "subdomain", ".breezechms.com"],
  ["businessmap", "account", ".kanbanize.com"],
  ["chargebee", "site", ".chargebee.com"],
  ["espocrm", "instance", ".espocloud.com"],
  ["fellow", "subdomain", ".fellow.app"],
  ["freshdesk", "domainAlias", ".freshdesk.com"],
  ["freshsales", "bundleAlias", ".myfreshworks.com"],
  ["freshteam", "domain", ".freshteam.com"],
  ["ghost", "siteSlug", ".ghost.io"],
  ["grafana", "stack", ".grafana.net"],
  ["kommo", "subdomain", ".kommo.com"],
  ["kustomer", "orgName", ".api.kustomerapp.com"],
  ["octopus-deploy", "instance", ".octopus.app"],
  ["quaderno", "accountSubdomain", ".quadernoapp.com"],
  ["quentn", "systemId", ".credserverid.quentn.com"],
  ["quentn", "serverId", ".quentn.com"], // host credsystemid.<serverId>.quentn.com
  ["supportbee", "company", ".supportbee.com"],
  ["talentlms", "domain", ".talentlms.com"],
];
// shopify shopDomain and recruitee company are hand-written (their own tests);
// zendesk subdomain and workable account are covered by SEC-PATH-2c-2.

describe("subdomain setup fields must be a single hostname label", () => {
  for (const [key, field, suffix] of LABEL_FIELDS) {
    const extra = key === "quentn" ? { serverId: "credserverid", systemId: "credsystemid" } : {};
    // quaderno's healthcheck calls the bare quadernoapp.com; use a tenant op.
    const op = key === "quaderno" ? "contacts.list" : "healthcheck";
    test(`${key} ${field}: ${LABEL_BAD.length} bad spellings make no request`, async () => {
      for (const bad of LABEL_BAD) {
        const out = await run(key, { ...extra, [field]: bad }, op);
        expect({ bad, code: out.code, hosts: out.hosts }).toEqual({ bad, code: "OUTBOUND_HOST_NOT_ALLOWED", hosts: [] });
      }
    });
    test(`${key} ${field}: stored spellings keep working`, async () => {
      const full = `acme1${suffix === ".credserverid.quentn.com" ? "" : suffix}`;
      const host = field === "serverId" ? "credsystemid.acme1.quentn.com" : `acme1${suffix}`;
      for (const good of ["acme1", " acme1 ", "ACME1", "https://acme1", "HTTPS://acme1/", "acme1//", full, `https://${full}/`]) {
        const out = await run(key, { ...extra, [field]: good }, op);
        // The request went out to the tenant host (a canned "{}" may not fit the
        // op's response schema, which is not what this checks).
        expect({ good, host: out.hosts[0] }).toEqual({ good, host });
      }
    });
  }
});

describe("vendor host fields use the vendor allowlist", () => {
  const docusign = { restHost: "demo.docusign.net", oauthHost: "account-d.docusign.com" };
  test("docusign restHost under docusign.net / docusign.com", async () => {
    for (const good of ["demo.docusign.net", "na2.docusign.net", "https://www.docusign.net/", "EU.DOCUSIGN.NET", "x.docusign.com"]) {
      const out = await run("docusign", { ...docusign, restHost: good }, "service.get");
      expect({ good, code: out.code }).toEqual({ good, code: undefined });
      expect(out.hosts[0]).toBe(good.replace(/^https:\/\//, "").replace(/\/$/, "").toLowerCase());
    }
    for (const bad of ["docusign.net", "evil.example", "docusign.net.evil.example", "evildocusign.net", "demo.docusign.net:443", "a@demo.docusign.net", "demo.docusign.net/x", "127.0.0.1", ".", ""]) {
      const out = await run("docusign", { ...docusign, restHost: bad }, "service.get");
      expect({ bad, code: out.code, hosts: out.hosts }).toEqual({ bad, code: "OUTBOUND_HOST_NOT_ALLOWED", hosts: [] });
    }
  });
  test("docusign oauthHost under docusign.net / docusign.com", () => {
    const policy = SETUP_HOST_POLICIES.docusign!.oauthHost!;
    expect(normalizeSetupHost("https://account-d.docusign.com/", "oauthHost", policy)).toBe("account-d.docusign.com");
    for (const bad of ["account.evil.example", "docusign.com", "account.docusign.com.evil.example", "localhost"]) {
      expect(() => normalizeSetupHost(bad, "oauthHost", policy)).toThrow();
    }
  });
  test("confluence site is <label>.atlassian.net", async () => {
    for (const good of ["acme.atlassian.net", "https://acme.atlassian.net/", "ACME.atlassian.net"]) {
      const out = await run("confluence", { site: good, email: "a@b.c" });
      expect({ good, code: out.code }).toEqual({ good, code: undefined });
      expect(out.hosts[0]).toBe("acme.atlassian.net");
    }
    for (const bad of ["acme", "atlassian.net", "a.b.atlassian.net", "acme.atlassian.net.evil.example", "acme.jira.com", "acme.atlassian.net:443", "evil.example", "127.0.0.1", "-a.atlassian.net"]) {
      const out = await run("confluence", { site: bad, email: "a@b.c" });
      expect({ bad, code: out.code, hosts: out.hosts }).toEqual({ bad, code: "OUTBOUND_HOST_NOT_ALLOWED", hosts: [] });
    }
  });
  test("workday host under workday.com / myworkday.com", async () => {
    for (const good of ["wd2-impl-services1.workday.com", "impl-services1.wd103.myworkday.com", "https://wd5-services1.myworkday.com/"]) {
      const out = await run("workday", { host: good, tenant: "acme" });
      expect({ good, code: out.code }).toEqual({ good, code: undefined });
    }
    for (const bad of ["workday.com", "evil.example", "workday.com.evil.example", "evilworkday.com", "wd2.workday.com:8443", "10.0.0.1"]) {
      const out = await run("workday", { host: bad, tenant: "acme" });
      expect({ bad, code: out.code, hosts: out.hosts }).toEqual({ bad, code: "OUTBOUND_HOST_NOT_ALLOWED", hosts: [] });
    }
  });
});

describe("self-hosted host fields take any public https hostname", () => {
  const CASES: Array<[string, string]> = [["gitlab", "host"], ["lemmy", "host"], ["mastodon", "instance"], ["wordpress", "host"]];
  for (const [key, field] of CASES) {
    test(`${key} ${field} accepts public hosts in stored spellings`, async () => {
      for (const [good, host] of [
        ["code.example.org", "code.example.org"], ["https://code.example.org/", "code.example.org"], ["CODE.Example.ORG", "code.example.org"],
        ["code.example.org.", "code.example.org"], ["8.8.8.8", "8.8.8.8"], ["[2606:4700:4700::1111]", "[2606:4700:4700::1111]"],
      ] as const) {
        const out = await run(key, { [field]: good });
        expect({ good, code: out.code }).toEqual({ good, code: undefined });
        expect(out.hosts[0]).toBe(host);
      }
    });
    test(`${key} ${field} refuses private, loopback, link-local, metadata and local names`, async () => {
      for (const bad of PUBLIC_BAD) {
        const out = await run(key, { [field]: bad });
        expect({ bad, code: out.code, hosts: out.hosts }).toEqual({ bad, code: "OUTBOUND_HOST_NOT_ALLOWED", hosts: [] });
      }
    });
  }
});

describe("unit", () => {
  test("segment", () => {
    expect(normalizeSetupSegment(" acme ", "f")).toBe("acme");
    expect(() => normalizeSetupSegment("..", "f")).toThrow("dot segment");
  });
  test("label keeps case and strips its provider suffix", () => {
    expect(normalizeSetupLabel("ABC123-dsn.algolia.net", "applicationId", ["-dsn.algolia.net", ".algolia.net"])).toBe("ABC123");
    expect(() => normalizeSetupLabel("a.b", "f", [".x.com"])).toThrow("single hostname label");
  });
  test("public host canonicalizes numeric IPv4 forms before checking them", () => {
    const pub = { kind: "public" } as const;
    for (const form of ["2130706433", "0x7f.1", "0177.0.0.01", "127.000.000.001"]) expect(() => normalizeSetupHost(form, "host", pub)).toThrow();
    expect(normalizeSetupHost("134744072", "host", pub)).toBe("8.8.8.8");
  });
});
