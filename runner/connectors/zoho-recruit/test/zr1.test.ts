import { describe, expect, test } from "bun:test";
import manifest from "../manifest.json";
import { ZOHO_RECRUIT_DATA_CENTERS, ZOHO_RECRUIT_DATA_CENTER_KEYS, apiHostFor, assertApiDomainMatches } from "../src/datacenter";
import { healthcheck } from "../src/healthcheck";
import {
  executeApplicationsListSync,
  executeCandidatesListSync,
  executeCandidatesSearchSync,
  executeInterviewsListSync,
  executeJobOpeningsListSync,
} from "../src/sync";
import { defaultConnectorRegistry } from "../../../bun/src/registry";

type Call = { url: string; headers: Headers };

function stub(body: unknown = { data: [], info: { more_records: false } }, status = 200) {
  const calls: Call[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const req = new Request(input as string, init);
    calls.push({ url: req.url, headers: req.headers });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { calls, impl };
}

const TOKEN = "zoho_tok_secret_value";

// (a) api.zoho.<dc> is the same DC as www.zohoapis.<dc>.
const API_ZOHO: Record<string, string> = {
  com: "https://api.zoho.com",
  eu: "https://api.zoho.eu",
  in: "https://api.zoho.in",
  "com.au": "https://api.zoho.com.au",
  jp: "https://api.zoho.jp",
  ca: "https://api.zohocloud.ca",
  sa: "https://api.zoho.sa",
  "com.cn": "https://api.zoho.com.cn",
};

describe("ZR-1 (a) api_domain equivalence", () => {
  test("api.zoho.<dc> is accepted for its own DC and routes to recruit.<dc>", async () => {
    for (const dc of ZOHO_RECRUIT_DATA_CENTER_KEYS) {
      expect(() => assertApiDomainMatches(dc, API_ZOHO[dc])).not.toThrow();
      const s = stub();
      await executeCandidatesListSync({ accessToken: TOKEN, dataCenter: dc, api_domain: API_ZOHO[dc], fetch: s.impl } as never);
      expect(s.calls).toHaveLength(1);
      expect(new URL(s.calls[0]!.url).host).toBe(apiHostFor(dc));
    }
  });

  test("www.zohoapis.<dc>, api.zoho.<dc> and recruit.<dc> are the accepted set, per DC", () => {
    for (const dc of ZOHO_RECRUIT_DATA_CENTER_KEYS) {
      const hosts = ZOHO_RECRUIT_DATA_CENTERS[dc].apiDomains.map((d) => new URL(d).host);
      expect(hosts).toHaveLength(3);
      expect(hosts).toContain(new URL(API_ZOHO[dc]!).host);
      expect(hosts).toContain(apiHostFor(dc));
      expect(hosts.filter((h) => h.startsWith("www.zohoapis."))).toHaveLength(1);
    }
  });

  test("api.zoho.<other dc> and non-existent api.zoho.ca are rejected with no request", async () => {
    const bad: Array<[string, string]> = [
      ["com", "https://api.zoho.eu"],
      ["eu", "https://api.zoho.com"],
      ["ca", "https://api.zoho.ca"],
      ["ca", "https://api.zoho.com"],
      ["com.au", "https://api.zoho.com"],
      ["com", "https://api.zoho.com.evil.example"],
      ["com", "http://api.zoho.com"],
      ["com.cn", "https://api.zoho.com"],
    ];
    for (const [dc, apiDomain] of bad) {
      const s = stub();
      await expect(executeCandidatesListSync({ accessToken: TOKEN, dataCenter: dc, apiDomain, fetch: s.impl } as never)).rejects.toMatchObject({
        code: "CONNECTOR_DATA_CENTER_MISMATCH",
      });
      expect({ dc, apiDomain, calls: s.calls.length }).toEqual({ dc, apiDomain, calls: 0 });
    }
  });
});

describe("ZR-1 (b) api_domain check is dormant until the platform supplies it", () => {
  test("no api_domain in input: the check is skipped and the request goes to the table host", async () => {
    for (const dc of ZOHO_RECRUIT_DATA_CENTER_KEYS) {
      const s = stub();
      await executeJobOpeningsListSync({ accessToken: TOKEN, dataCenter: dc, fetch: s.impl } as never);
      expect(new URL(s.calls[0]!.url).host).toBe(apiHostFor(dc));
    }
  });

  test("the OAuth-resolved credential shape ({ accessToken } only) reaches Zoho unchanged", async () => {
    const s = stub();
    await executeCandidatesListSync({ accessToken: TOKEN, fetch: s.impl } as never);
    expect(s.calls[0]!.url).toBe("https://recruit.zoho.com/recruit/v2/Candidates");
    expect(s.calls[0]!.headers.get("authorization")).toBe(`Zoho-oauthtoken ${TOKEN}`);
  });

  test("api_domain is never used as a request host", async () => {
    const s = stub();
    await executeCandidatesListSync({ accessToken: TOKEN, dataCenter: "eu", api_domain: "https://www.zohoapis.eu", fetch: s.impl } as never);
    expect(new URL(s.calls[0]!.url).host).toBe("recruit.zoho.eu");
  });
});

describe("ZR-1 host correction", () => {
  test("every DC's API base is https://recruit.<dc>/recruit/v2 and is in allowedHosts", () => {
    for (const dc of ZOHO_RECRUIT_DATA_CENTER_KEYS) {
      const url = new URL(ZOHO_RECRUIT_DATA_CENTERS[dc].apiBaseUrl);
      expect(url.host).toMatch(/^recruit\.zoho(cloud)?\./);
      expect(url.pathname).toBe("/recruit/v2");
      expect(manifest.network.allowedHosts).toContain(url.host);
    }
    expect(apiHostFor("ca")).toBe("recruit.zohocloud.ca");
    expect(JSON.stringify(manifest.network)).not.toContain("zohoapis");
  });

  test("a connection's client is narrowed to its own DC host", async () => {
    const s = stub();
    await executeInterviewsListSync({ accessToken: TOKEN, dataCenter: "jp", fetch: s.impl } as never);
    expect(new URL(s.calls[0]!.url).host).toBe("recruit.zoho.jp");
  });
});

describe("ZR-1 (e) list filters", () => {
  const LISTS = [
    ["candidates.list", executeCandidatesListSync, "/recruit/v2/Candidates"],
    ["job_openings.list", executeJobOpeningsListSync, "/recruit/v2/Job_Openings"],
    ["applications.list", executeApplicationsListSync, "/recruit/v2/Applications"],
    ["interviews.list", executeInterviewsListSync, "/recruit/v2/Interviews"],
  ] as const;

  test("cvid, converted, approved and state ($state) are forwarded", async () => {
    for (const [name, run, path] of LISTS) {
      const s = stub();
      await run({ accessToken: TOKEN, cvid: "425248000000104001", converted: "both", approved: false, state: "draft", fetch: s.impl } as never);
      const url = new URL(s.calls[0]!.url);
      expect({ name, path: url.pathname }).toEqual({ name, path });
      expect(url.searchParams.get("cvid")).toBe("425248000000104001");
      expect(url.searchParams.get("converted")).toBe("both");
      expect(url.searchParams.get("approved")).toBe("false");
      expect(url.searchParams.get("$state")).toBe("draft");
      expect(url.searchParams.has("state")).toBe(false);
    }
  });

  test("numeric cvid and state save are accepted", async () => {
    const s = stub();
    await executeCandidatesListSync({ accessToken: TOKEN, cvid: 42, state: "save", fetch: s.impl } as never);
    const url = new URL(s.calls[0]!.url);
    expect(url.searchParams.get("cvid")).toBe("42");
    expect(url.searchParams.get("$state")).toBe("save");
  });

  test("omitted filters add nothing to the query", async () => {
    const s = stub();
    await executeApplicationsListSync({ accessToken: TOKEN, fetch: s.impl } as never);
    expect(s.calls[0]!.url).toBe("https://recruit.zoho.com/recruit/v2/Applications");
  });

  test("invalid filter values are rejected before any request", async () => {
    const bad = [
      { converted: "yes" },
      { approved: "TRUE" },
      { converted: 1 },
      { state: "published" },
      { state: "Draft" },
      { cvid: "0" },
      { cvid: "-1" },
      { cvid: "12a" },
      { cvid: 1.5 },
      { cvid: "../x" },
    ];
    for (const extra of bad) {
      for (const [name, run] of LISTS) {
        const s = stub();
        await expect(run({ accessToken: TOKEN, ...extra, fetch: s.impl } as never)).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
        expect({ name, extra, calls: s.calls.length }).toEqual({ name, extra, calls: 0 });
      }
    }
  });
});

describe("ZR-1 (e) candidates.search", () => {
  test("converted and approved are forwarded; fields is not sent", async () => {
    const s = stub();
    await executeCandidatesSearchSync({ accessToken: TOKEN, word: "Ada", converted: true, approved: "both", fields: "id,Email", fetch: s.impl } as never);
    const url = new URL(s.calls[0]!.url);
    expect(url.pathname).toBe("/recruit/v2/Candidates/search");
    expect(url.searchParams.get("converted")).toBe("true");
    expect(url.searchParams.get("approved")).toBe("both");
    expect(url.searchParams.has("fields")).toBe(false);
  });

  test("list-only filters are not sent by search", async () => {
    const s = stub();
    await executeCandidatesSearchSync({ accessToken: TOKEN, email: "a@example.com", cvid: "1", state: "draft", fetch: s.impl } as never);
    const url = new URL(s.calls[0]!.url);
    expect(url.searchParams.has("cvid")).toBe(false);
    expect(url.searchParams.has("$state")).toBe(false);
  });

  test("invalid converted is rejected with no request", async () => {
    const s = stub();
    await expect(executeCandidatesSearchSync({ accessToken: TOKEN, word: "x", converted: "maybe", fetch: s.impl } as never)).rejects.toMatchObject({
      code: "INVALID_ACTION_INPUT",
    });
    expect(s.calls).toHaveLength(0);
  });
});

describe("ZR-1 (e) requiredScopes", () => {
  test("every op declares requiredScopes from the official scope blocks; no auth.scopes", () => {
    const want: Record<string, string[]> = {
      "jobs.list": ["ZohoRecruit.modules.jobopening.READ"],
      "candidates.list": ["ZohoRecruit.modules.candidate.READ"],
      "job_openings.list": ["ZohoRecruit.modules.jobopening.READ"],
      "applications.list": ["ZohoRecruit.modules.application.READ"],
      "candidates.get": ["ZohoRecruit.modules.candidate.READ"],
      "candidates.search": ["ZohoRecruit.modules.candidate.READ", "ZohoRecruit.search.READ"],
      "interviews.list": ["ZohoRecruit.modules.interview.READ"],
      healthcheck: ["ZohoRecruit.users.READ"],
    };
    const ops = manifest.operations as Record<string, { requiredScopes?: string[] }>;
    expect(Object.keys(ops).sort()).toEqual(Object.keys(want).sort());
    for (const [op, scopes] of Object.entries(want)) expect({ op, scopes: ops[op]!.requiredScopes }).toEqual({ op, scopes });
    expect("scopes" in manifest.auth).toBe(false);
  });
});

describe("ZR-1 (e) healthcheck live probe", () => {
  const currentUser = { users: [{ id: "2445013000000114007", email: "p.boyle@zylker.com" }], info: { count: 1 } };

  test("without a credential it stays static (setup-validation path)", () => {
    expect(healthcheck()).toEqual({ connector: "zoho-recruit", status: "ok", source: "connector" });
    expect(healthcheck({})).toEqual({ connector: "zoho-recruit", status: "ok", source: "connector" });
    expect(healthcheck({ accessToken: "  " })).toEqual({ connector: "zoho-recruit", status: "ok", source: "connector" });
  });

  test("with a token it GETs /users?type=CurrentUser on the connection's DC", async () => {
    for (const dc of ZOHO_RECRUIT_DATA_CENTER_KEYS) {
      const s = stub(currentUser);
      await expect(healthcheck({ accessToken: TOKEN, dataCenter: dc, fetch: s.impl })).resolves.toEqual({
        connector: "zoho-recruit",
        status: "ok",
        source: "provider",
      });
      expect(s.calls).toHaveLength(1);
      expect(s.calls[0]!.url).toBe(`https://${apiHostFor(dc)}/recruit/v2/users?type=CurrentUser`);
      expect(s.calls[0]!.headers.get("authorization")).toBe(`Zoho-oauthtoken ${TOKEN}`);
    }
  });

  test("a 401 from Zoho fails the healthcheck", async () => {
    const s = stub({ code: "AUTHENTICATION_FAILURE", message: "Authentication failed", status: "error" }, 401);
    await expect(healthcheck({ accessToken: TOKEN, fetch: s.impl })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("a 200 without the current user fails the healthcheck", async () => {
    const s = stub({ users: [] });
    await expect(healthcheck({ accessToken: TOKEN, fetch: s.impl })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("invalid dataCenter or mismatching api_domain fails before any request", async () => {
    const s = stub(currentUser);
    await expect(Promise.resolve(healthcheck({ accessToken: TOKEN, dataCenter: "us", fetch: s.impl }))).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(
      Promise.resolve(healthcheck({ accessToken: TOKEN, dataCenter: "eu", api_domain: "https://api.zoho.com", fetch: s.impl })),
    ).rejects.toMatchObject({ code: "CONNECTOR_DATA_CENTER_MISMATCH" });
    expect(s.calls).toHaveLength(0);
  });

  test("through the registry, a credentialed healthcheck is provider-confirmed", async () => {
    const s = stub(currentUser);
    const result = defaultConnectorRegistry.healthcheck("zoho-recruit", { accessToken: TOKEN, dataCenter: "ca", fetch: s.impl });
    expect(result?.ok).toBe(true);
    if (!result?.ok) return;
    await expect(Promise.resolve(result.output)).resolves.toMatchObject({ source: "provider", status: "ok" });
    expect(new URL(s.calls[0]!.url).host).toBe("recruit.zohocloud.ca");
  });
});
