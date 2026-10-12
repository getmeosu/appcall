// SEC-SETUP-2 (item 4): the mailchimp compiled host policy accepts a bare data
// center label (`us21`), as stored by older connections and accepted by the
// hand-written client, and renders it as `<label>.api.mailchimp.com`. Other
// vendor-label policies (confluence) still require the full host.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { compileDeclarativeConnector } from "../src/declarative/compile";
import { normalizeSetupHost, SETUP_HOST_POLICIES } from "../src/declarative/setup_fields";

const manifest = JSON.parse(readFileSync(resolve(import.meta.dir, "../../connectors/mailchimp/manifest.json"), "utf8"));
const policy = SETUP_HOST_POLICIES.mailchimp!.host!;

async function hostsFor(host: string): Promise<{ hosts: string[]; code?: string }> {
  const hosts: string[] = [];
  const fetchStub = (async (input: RequestInfo | URL) => {
    hosts.push(new URL(input instanceof Request ? input.url : String(input)).hostname);
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    await compileDeclarativeConnector(manifest).actions.healthcheck!({ apiKey: "k", host, fetch: fetchStub });
    return { hosts };
  } catch (error) {
    return { hosts, code: (error as { code?: string }).code };
  }
}

describe("SEC-SETUP-2 mailchimp bare data center label", () => {
  test("bare label and full-host spellings normalize to <dc>.api.mailchimp.com", () => {
    for (const value of ["us21", "US21", " us21 ", "us21.api.mailchimp.com", "https://us21.api.mailchimp.com/"]) {
      expect(normalizeSetupHost(value, "host", policy)).toBe("us21.api.mailchimp.com");
    }
  });
  test("other shapes still reject", () => {
    for (const value of ["", ".", "-us21", "us_21", "us21.evil", "evil.com", "us21.mailchimp.com", "http://us21", "us21/x", "us21:443", "169.254.169.254", "a.us21.api.mailchimp.com"]) {
      expect(() => normalizeSetupHost(value, "host", policy), value).toThrow();
    }
  });
  test("the compiled healthcheck sends a bare label to <dc>.api.mailchimp.com", async () => {
    expect(await hostsFor("us21")).toEqual({ hosts: ["us21.api.mailchimp.com"] });
    expect(await hostsFor("us21.evil")).toMatchObject({ hosts: [] });
  });
  test("confluence (vendor-label without bareLabel) still requires the full host", () => {
    expect(() => normalizeSetupHost("acme", "site", SETUP_HOST_POLICIES.confluence!.site!)).toThrow();
    expect(normalizeSetupHost("acme.atlassian.net", "site", SETUP_HOST_POLICIES.confluence!.site!)).toBe("acme.atlassian.net");
  });
});
