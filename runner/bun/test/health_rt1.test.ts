// HEALTH-RT-1: OAuth healthcheck input carries declared non-secret setup
// fields; the runner derives instanceUrl from them and never from secrets.
import { describe, expect, test } from "bun:test";
import { defaultConnectorRegistry, withDerivedInstanceUrl } from "../src/registry";

function recordingFetch(body: unknown) {
  const urls: string[] = [];
  const fetchFn = (async (url: string | URL | Request) => {
    urls.push(String(url instanceof Request ? url.url : url));
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { urls, fetchFn };
}

async function run(key: string, input: Record<string, unknown>) {
  const result = defaultConnectorRegistry.healthcheck(key, input);
  if (!result || !result.ok) throw new Error(`healthcheck failed: ${JSON.stringify(result)}`);
  return await (result as { output: unknown }).output;
}

describe("HEALTH-RT-1 setup fields reach OAuth healthchecks", () => {
  test("salesforce: instance_host becomes instanceUrl and the probe hits that host", async () => {
    const { urls, fetchFn } = recordingFetch({ id: "005" });
    const out = await run("salesforce", { accessToken: "tok", instance_host: "acme.my.salesforce.com", fetch: fetchFn });
    expect(out).toMatchObject({ connector: "salesforce", source: "provider" });
    expect(urls.length).toBe(1);
    expect(new URL(urls[0]!).host).toBe("acme.my.salesforce.com");
  });

  test("salesforce: a host outside the allowlist is not turned into a URL", async () => {
    const { urls, fetchFn } = recordingFetch({});
    const result = defaultConnectorRegistry.healthcheck("salesforce", { accessToken: "tok", instance_host: "evil.example.com", fetch: fetchFn });
    let failed = false;
    try {
      if (result?.ok) await (result as { output: unknown }).output;
      else failed = true;
    } catch {
      failed = true;
    }
    expect(failed).toBe(true);
    expect(urls.length).toBe(0);
  });

  test("zoho-recruit: non-US dataCenter routes the probe to that data centre", async () => {
    const { urls, fetchFn } = recordingFetch({ users: [{ id: "1" }] });
    const out = await run("zoho-recruit", { accessToken: "tok", dataCenter: "eu", fetch: fetchFn });
    expect(out).toMatchObject({ connector: "zoho-recruit", source: "provider" });
    expect(new URL(urls[0]!).host).toBe("recruit.zoho.eu");
  });

  test("derivation never reads secret fields and an explicit instanceUrl wins", () => {
    const manifest = {
      key: "x",
      auth: { type: "oauth2", setup: { mode: "oauth2", fields: [{ key: "host", secret: true }] } },
      http: { baseUrl: "https://{{host}}" },
      network: { allowedHosts: ["*.example.com"] },
    } as never;
    const input = { accessToken: "t", host: "a.example.com" };
    expect(withDerivedInstanceUrl("x", [manifest], input)).toEqual(input);
    const explicit = { accessToken: "t", instance_host: "acme.my.salesforce.com", instanceUrl: "https://given.my.salesforce.com" };
    expect((withDerivedInstanceUrl("salesforce", [], explicit) as Record<string, unknown>).instanceUrl).toBe("https://given.my.salesforce.com");
  });
});
