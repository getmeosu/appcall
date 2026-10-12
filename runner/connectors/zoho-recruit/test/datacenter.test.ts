import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import {
  ZOHO_RECRUIT_DATA_CENTERS,
  ZOHO_RECRUIT_DATA_CENTER_KEYS,
  assertApiDomainMatches,
  resolveDataCenter,
} from "../src/datacenter";
import {
  executeJobsListSync,
  executeCandidatesListSync,
  executeCandidatesGetSync,
  executeCandidatesSearchSync,
  executeJobOpeningsListSync,
  executeApplicationsListSync,
  executeInterviewsListSync,
} from "../src/sync";
import defaultRequests from "../fixtures/expected/default_requests.json";

type Call = { method: string; url: string; headers: [string, string][]; body: string | null };

function stub() {
  const calls: Call[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const req = new Request(input as string, init);
    calls.push({ method: req.method, url: req.url, headers: [...req.headers.entries()].sort(), body: init?.body == null ? null : String(init.body) });
    return new Response(JSON.stringify({ data: [], info: { more_records: false } }), { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { calls, impl };
}

const TOKEN = "zoho_tok_secret_value";
type Extra = Record<string, unknown>;
const OPS: Array<[string, (extra: Extra, f: typeof fetch) => Promise<unknown>]> = [
  ["jobs.list", (x, f) => executeJobsListSync({ accessToken: TOKEN, page: 2, perPage: 50, ...x, fetch: f } as never)],
  ["candidates.list", (x, f) => executeCandidatesListSync({ accessToken: TOKEN, page: 1, perPage: 10, ...x, fetch: f } as never)],
  ["candidates.get", (x, f) => executeCandidatesGetSync({ accessToken: TOKEN, id: "4000000123", ...x, fetch: f } as never)],
  ["candidates.search", (x, f) => executeCandidatesSearchSync({ accessToken: TOKEN, email: "ada@example.com", ...x, fetch: f } as never)],
  ["job_openings.list", (x, f) => executeJobOpeningsListSync({ accessToken: TOKEN, ...x, fetch: f } as never)],
  ["applications.list", (x, f) => executeApplicationsListSync({ accessToken: TOKEN, ...x, fetch: f } as never)],
  ["interviews.list", (x, f) => executeInterviewsListSync({ accessToken: TOKEN, ...x, fetch: f } as never)],
];

// Hosts per DC, from the official Zoho docs cited in src/datacenter.ts.
// ZR-1: Recruit API hosts are recruit.<dc> (live-verified; www.zohoapis.<dc> 404s for /recruit/v2).
const EXPECTED: Record<string, { accounts: string; api: string; zohoapis: string }> = {
  com: { accounts: "accounts.zoho.com", api: "recruit.zoho.com", zohoapis: "www.zohoapis.com" },
  eu: { accounts: "accounts.zoho.eu", api: "recruit.zoho.eu", zohoapis: "www.zohoapis.eu" },
  in: { accounts: "accounts.zoho.in", api: "recruit.zoho.in", zohoapis: "www.zohoapis.in" },
  "com.au": { accounts: "accounts.zoho.com.au", api: "recruit.zoho.com.au", zohoapis: "www.zohoapis.com.au" },
  jp: { accounts: "accounts.zoho.jp", api: "recruit.zoho.jp", zohoapis: "www.zohoapis.jp" },
  ca: { accounts: "accounts.zohocloud.ca", api: "recruit.zohocloud.ca", zohoapis: "www.zohoapis.ca" },
  sa: { accounts: "accounts.zoho.sa", api: "recruit.zoho.sa", zohoapis: "www.zohoapis.sa" },
  "com.cn": { accounts: "accounts.zoho.com.cn", api: "recruit.zoho.com.cn", zohoapis: "www.zohoapis.com.cn" },
};

describe("zoho-recruit data centre table", () => {
  test("allowlist is exactly the 8 documented data centres", () => {
    expect(ZOHO_RECRUIT_DATA_CENTER_KEYS).toEqual(["com", "eu", "in", "com.au", "jp", "ca", "sa", "com.cn"]);
  });

  test("each data centre maps to its documented accounts host and Recruit API host", () => {
    for (const [dc, want] of Object.entries(EXPECTED)) {
      const cfg = ZOHO_RECRUIT_DATA_CENTERS[dc as keyof typeof ZOHO_RECRUIT_DATA_CENTERS];
      expect({ dc, accounts: new URL(cfg.accountsUrl).host }).toEqual({ dc, accounts: want.accounts });
      expect({ dc, api: new URL(cfg.apiBaseUrl).host, path: new URL(cfg.apiBaseUrl).pathname }).toEqual({ dc, api: want.api, path: "/recruit/v2" });
      expect(new URL(cfg.accountsUrl).protocol).toBe("https:");
      expect(new URL(cfg.apiBaseUrl).protocol).toBe("https:");
    }
  });

  test("every API host a data centre can route to is in manifest allowedHosts, and nothing else is", () => {
    const routed = Object.values(ZOHO_RECRUIT_DATA_CENTERS).map((c) => new URL(c.apiBaseUrl).host);
    expect([...routed].sort()).toEqual([...manifest.network.allowedHosts].sort());
  });
});

describe("zoho-recruit dataCenter resolution", () => {
  test("absent dataCenter defaults to com", () => {
    expect(resolveDataCenter(undefined)).toBe("com");
    expect(resolveDataCenter(null)).toBe("com");
  });

  test("only exact, lowercase, untrimmed allowlist values are accepted", () => {
    for (const dc of ZOHO_RECRUIT_DATA_CENTER_KEYS) expect(resolveDataCenter(dc)).toBe(dc);
    for (const bad of ["us", "COM", "Com", "EU", "evil.com", "com.evil", "", " ", "\t", " com", "com ", "uk", "ae", "au", "cn", "zohocloud.ca", "recruit.zoho.eu", "https://www.zohoapis.eu", "toString", "__proto__", "constructor"]) {
      expect(() => resolveDataCenter(bad)).toThrow();
      try {
        resolveDataCenter(bad);
      } catch (e) {
        expect(e).toMatchObject({ ok: false, code: "INVALID_ACTION_INPUT" });
      }
    }
    for (const bad of [1, true, {}, ["com"]]) expect(() => resolveDataCenter(bad)).toThrow();
  });
});

describe("zoho-recruit routing per data centre", () => {
  test("default (no dataCenter) requests are byte-identical to the pre-ZR-0 snapshot", async () => {
    for (const [name, run] of OPS) {
      const s = stub();
      await run({}, s.impl);
      expect({ name, calls: s.calls }).toEqual({ name, calls: (defaultRequests as Record<string, Call[]>)[name]! });
    }
  });

  test("dataCenter com produces the same requests as the default", async () => {
    for (const [name, run] of OPS) {
      const s = stub();
      await run({ dataCenter: "com" }, s.impl);
      expect({ name, calls: s.calls }).toEqual({ name, calls: (defaultRequests as Record<string, Call[]>)[name]! });
    }
  });

  test("every data centre routes every op to its Recruit API host with the same path, query and headers", async () => {
    for (const [dc, want] of Object.entries(EXPECTED)) {
      for (const [name, run] of OPS) {
        const s = stub();
        await run({ dataCenter: dc }, s.impl);
        const base = (defaultRequests as Record<string, Call[]>)[name]![0]!;
        expect(s.calls).toHaveLength(1);
        const got = new URL(s.calls[0]!.url);
        const was = new URL(base.url);
        expect({ dc, name, host: got.host, path: got.pathname, search: got.search, protocol: got.protocol }).toEqual({
          dc,
          name,
          host: want.api,
          path: was.pathname,
          search: was.search,
          protocol: "https:",
        });
        expect(s.calls[0]!.method).toBe(base.method);
        expect(s.calls[0]!.headers).toEqual(base.headers);
      }
    }
  });

  test("an invalid dataCenter is rejected before any request", async () => {
    for (const bad of ["us", "COM", "evil.com", "com.evil", "", "   "]) {
      for (const [name, run] of OPS) {
        const s = stub();
        await expect(run({ dataCenter: bad }, s.impl)).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
        expect({ bad, name, calls: s.calls.length }).toEqual({ bad, name, calls: 0 });
      }
    }
  });
});

describe("zoho-recruit token api_domain check", () => {
  test("matching api_domain (documented origins, normalized) is accepted", async () => {
    expect(() => assertApiDomainMatches("com", "https://www.zohoapis.com")).not.toThrow();
    expect(() => assertApiDomainMatches("com", "https://recruit.zoho.com")).not.toThrow();
    expect(() => assertApiDomainMatches("com", "HTTPS://WWW.ZOHOAPIS.COM/")).not.toThrow();
    expect(() => assertApiDomainMatches("com", "https://www.zohoapis.com:443")).not.toThrow();
    expect(() => assertApiDomainMatches("eu", "https://www.zohoapis.eu")).not.toThrow();
    expect(() => assertApiDomainMatches("ca", "https://www.zohoapis.ca")).not.toThrow();
    expect(() => assertApiDomainMatches("com.cn", "https://www.zohoapis.com.cn")).not.toThrow();
    expect(() => assertApiDomainMatches("eu", undefined)).not.toThrow();

    for (const [dc, want] of Object.entries(EXPECTED)) {
      const s = stub();
      await executeJobOpeningsListSync({ accessToken: TOKEN, dataCenter: dc, api_domain: `https://${want.zohoapis}`, fetch: s.impl } as never);
      expect(s.calls).toHaveLength(1);
      expect(new URL(s.calls[0]!.url).host).toBe(want.api);
    }
  });

  test("mismatching api_domain is rejected with a clear connector error and no request is sent anywhere", async () => {
    const bad: Array<[string, string]> = [
      ["com", "https://www.zohoapis.eu"],
      ["eu", "https://www.zohoapis.com"],
      ["com", "https://evil.example"],
      ["com", "https://www.zohoapis.com.evil.example"],
      ["com", "http://www.zohoapis.com"],
      ["com", "https://www.zohoapis.com:8443"],
      ["com", "https://www.zohoapis.com/recruit/v2"],
      ["com", "https://user@www.zohoapis.com"],
      ["com", "www.zohoapis.com"],
      ["com", ""],
      ["ca", "https://www.zohoapis.com"],
      ["com.au", "https://recruit.zoho.com"],
    ];
    for (const [dc, apiDomain] of bad) {
      expect(() => assertApiDomainMatches(dc as never, apiDomain)).toThrow();
      for (const key of ["api_domain", "apiDomain"]) {
        const s = stub();
        await expect(executeCandidatesListSync({ accessToken: TOKEN, dataCenter: dc, [key]: apiDomain, fetch: s.impl } as never)).rejects.toMatchObject({
          ok: false,
          code: "CONNECTOR_DATA_CENTER_MISMATCH",
        });
        expect({ dc, apiDomain, key, calls: s.calls.length }).toEqual({ dc, apiDomain, key, calls: 0 });
      }
    }
    // Default DC (absent) with a non-US api_domain is a mismatch too.
    const s = stub();
    await expect(executeCandidatesListSync({ accessToken: TOKEN, api_domain: "https://www.zohoapis.eu", fetch: s.impl } as never)).rejects.toMatchObject({
      code: "CONNECTOR_DATA_CENTER_MISMATCH",
    });
    expect(s.calls).toHaveLength(0);
  });

  test("the error message does not echo the returned domain", () => {
    try {
      assertApiDomainMatches("com", "https://attacker.example");
    } catch (e) {
      expect(String((e as { message: string }).message)).not.toContain("attacker");
    }
  });
});
