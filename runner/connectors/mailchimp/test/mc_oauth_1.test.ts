import { beforeEach, describe, expect, test } from "bun:test";
// Other test files in this dir mock ../src/http process-wide, so hand-written
// coverage drives the real client (the one every hand-written op uses) through
// a fresh module instance loaded via a query specifier.
const realHttp = await import("../src/http.ts?mc-oauth-real");
type ClientOptions = Parameters<typeof realHttp.createMailchimpClient>[0];
const handWritten = (options: Record<string, unknown>) =>
  realHttp.createMailchimpClient({ operation: "contacts.create", ...options } as ClientOptions)
    .fetchJSON("/lists/l1/members", { method: "POST", body: JSON.stringify({ email_address: "a@example.com" }) });
import { clearMailchimpOAuthCache, hostFromMetadata } from "../src/oauth";
import { defaultConnectorRegistry } from "../../../bun/src/registry";

// MC-OAUTH-1: OAuth connections resolve their data center from
// login.mailchimp.com/oauth2/metadata (cached), then call
// <dc>.api.mailchimp.com with Bearer auth. The API-key path is unchanged.
type Call = { url: URL; auth: string | null };
function stub(metadata: { status?: number; body?: unknown } = {}) {
  const calls: Call[] = [];
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    calls.push({ url, auth: new Headers(init?.headers).get("authorization") });
    if (url.hostname === "login.mailchimp.com") {
      return new Response(JSON.stringify(metadata.body ?? { dc: "us21", api_endpoint: "https://us21.api.mailchimp.com", login_url: "https://login.mailchimp.com" }), { status: metadata.status ?? 200 });
    }
    return new Response(JSON.stringify({ id: "m1", email_address: "a@example.com", status: "subscribed", exports: [], total_items: 0 }), { status: 200 });
  }) as typeof fetch;
  return { calls, fetch };
}
const contact = { listId: "l1", email: "a@example.com" };
async function settle(value: unknown): Promise<unknown> {
  try { return await value; } catch (error) { return error; }
}

beforeEach(() => clearMailchimpOAuthCache());

describe("MC-OAUTH-1 OAuth data-center resolution", () => {
  test("a hand-written op resolves dc via metadata once, caches it, and sends Bearer", async () => {
    const { calls, fetch } = stub();
    await handWritten({ accessToken: "tok-a", fetch });
    await handWritten({ accessToken: "tok-a", fetch });
    const metadata = calls.filter((c) => c.url.hostname === "login.mailchimp.com");
    expect(metadata).toHaveLength(1);
    expect(metadata[0]!.url.pathname).toBe("/oauth2/metadata");
    expect(metadata[0]!.auth).toBe("OAuth tok-a");
    const api = calls.filter((c) => c.url.hostname !== "login.mailchimp.com");
    expect(api.map((c) => c.url.hostname)).toEqual(["us21.api.mailchimp.com", "us21.api.mailchimp.com"]);
    expect(api.every((c) => c.auth === "Bearer tok-a")).toBe(true);
  });

  test("a compiled op resolves dc via metadata and sends Bearer through the registry", async () => {
    const { calls, fetch } = stub();
    const result = defaultConnectorRegistry.executeAction("mailchimp", "account-exports.list", { accessToken: "tok-c", fetch });
    expect(result.ok).toBe(true);
    if (result.ok) await result.output;
    expect(calls.map((c) => `${c.url.hostname}${c.url.pathname}`)).toEqual([
      "login.mailchimp.com/oauth2/metadata",
      "us21.api.mailchimp.com/3.0/account-exports",
    ]);
    expect(calls[1]!.auth).toBe("Bearer tok-c");
  });

  test("a metadata failure is a typed error with no fake success and no API call", async () => {
    const { calls, fetch } = stub({ status: 401, body: { error: "invalid_token" } });
    expect(await settle(handWritten({ accessToken: "tok-b", fetch }))).toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
    expect(calls.every((c) => c.url.hostname === "login.mailchimp.com")).toBe(true);
    // Failures are not cached.
    await settle(handWritten({ accessToken: "tok-b", fetch }));
    expect(calls).toHaveLength(2);
  });

  test("a malicious dc or api_endpoint is rejected before any API call", async () => {
    for (const body of [
      { dc: "evil.com#", api_endpoint: "https://evil.com" },
      { dc: "us21", api_endpoint: "https://us21.api.mailchimp.com.evil.com" },
      { dc: "us21", api_endpoint: "https://evil.com" },
      { dc: "169.254.169.254" },
      { dc: "US21/../x" },
      { api_endpoint: "https://us21.api.mailchimp.com" },
      [],
    ]) {
      clearMailchimpOAuthCache();
      const { calls, fetch } = stub({ body });
      expect(await settle(handWritten({ accessToken: "tok-m", fetch })), JSON.stringify(body))
        .toMatchObject({ ok: false, code: "CONNECTOR_RESPONSE_INVALID" });
      expect(calls.every((c) => c.url.hostname === "login.mailchimp.com")).toBe(true);
      expect(() => hostFromMetadata(body)).toThrow();
    }
    expect(hostFromMetadata({ dc: "us21", api_endpoint: "https://us21.api.mailchimp.com/" })).toBe("us21.api.mailchimp.com");
  });

  test("the API-key path is unchanged: key data center, Basic auth, no metadata call", async () => {
    const { calls, fetch } = stub();
    await handWritten({ apiKey: "us7aaaa", accessToken: "ignored", fetch });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url.hostname).toBe("us7.api.mailchimp.com");
    expect(calls[0]!.auth).toBe(`Basic ${btoa("anystring:us7aaaa")}`);
  });

  test("OAuth with no access token is MISSING_CREDENTIAL", async () => {
    const { calls, fetch } = stub();
    expect(defaultConnectorRegistry.executeAction("mailchimp", "contacts.create", { ...contact, fetch }))
      .toMatchObject({ ok: false, code: "MISSING_CREDENTIAL" });
    expect(defaultConnectorRegistry.executeAction("mailchimp", "account-exports.list", { accessToken: "", fetch }))
      .toMatchObject({ ok: false, code: "MISSING_CREDENTIAL" });
    expect(calls).toHaveLength(0);
  });
});
