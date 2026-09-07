import { describe, expect, test } from "bun:test";
import { executeJobsListSync } from "../src/sync";

// Every request is served by an injected fetch. The originals called the real
// Workable API inside a try/catch that asserted nothing when no error was
// thrown, so they reported success whether the connector worked, the network
// was down, or the provider changed its response.
function stubFetch(body: string, init: { status?: number; headers?: Record<string, string> } = {}) {
  const calls: Request[] = [];
  const impl = (async (input: string | URL | Request, requestInit?: RequestInit) => {
    calls.push(new Request(input as string, requestInit));
    return new Response(body, { status: init.status ?? 200, headers: init.headers });
  }) as unknown as typeof fetch;
  return { calls, impl };
}

describe("Workable jobs.list sync", () => {
  test("requests the documented endpoint on the allowed host", async () => {
    const { calls, impl } = stubFetch('{"jobs":[{"id":"j1","title":"Engineer"}]}');

    await executeJobsListSync({ ...{ account: "acme", accessToken: "tok_secret_value" }, fetch: impl });

    expect(calls).toHaveLength(1);
    const url = new URL(calls[0].url);
    expect(url.hostname).toBe('www.workable.com');
    expect(url.pathname).toBe('/spi/v3/accounts/acme/jobs');
    expect(calls[0].method).toBe("GET");
  });

  test("classifies an upstream failure instead of throwing a bare Error", async () => {
    const { impl } = stubFetch(`{"error":"nope"}`, { status: 500 });

    await expect(executeJobsListSync({ ...{ account: "acme", accessToken: "tok_secret_value" }, fetch: impl }))
      .rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("classifies a rate limit and carries retry-after", async () => {
    const { impl } = stubFetch("{}", { status: 429, headers: { "retry-after": "30" } });

    await expect(executeJobsListSync({ ...{ account: "acme", accessToken: "tok_secret_value" }, fetch: impl }))
      .rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 30 });
  });

  test("refuses a redirect rather than following it off the allowed host", async () => {
    const { impl } = stubFetch("", { status: 302, headers: { location: "https://evil.example.net/" } });

    await expect(executeJobsListSync({ ...{ account: "acme", accessToken: "tok_secret_value" }, fetch: impl }))
      .rejects.toMatchObject({ code: "OUTBOUND_REDIRECT_BLOCKED" });
  });

  test("rejects a tenant value that would steer the request off-host", async () => {
    const { calls, impl } = stubFetch("{}");

    await expect(executeJobsListSync({
      ...{ account: "acme", accessToken: "tok_secret_value" },
      account: "evil.example.net/",
      fetch: impl,
    })).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });
});
