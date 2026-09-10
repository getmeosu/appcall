import { describe, expect, test } from "bun:test";
import { createSalesforceClient } from "../src/http";

const TOKEN = "00D.test-token";

describe("salesforce outbound host boundary", () => {
  test.each([
    "https://evil.acme.my.salesforce.com",
    "https://acme.my.salesforce.com.attacker.example",
    "https://salesforce.com.example",
  ])("rejects lookalike or nested host %s before dispatch", async (instanceUrl) => {
    let calls = 0;
    const client = createSalesforceClient({
      accessToken: TOKEN,
      instanceUrl,
      fetch: async () => {
        calls += 1;
        return new Response(JSON.stringify({ Id: "003" }));
      },
    });

    await expect(client.getRecord("Contact", "003")).rejects.toMatchObject({
      code: "OUTBOUND_HOST_NOT_ALLOWED",
    });
    expect(calls).toBe(0);
  });

  test.each([
    "https://evil.sandbox.my.salesforce.com",
    "https://acme--.sandbox.my.salesforce.com",
    "https://--uat.sandbox.my.salesforce.com",
  ])("requires the documented sandbox My Domain separator for %s", async (instanceUrl) => {
    let calls = 0;
    const client = createSalesforceClient({
      accessToken: TOKEN,
      instanceUrl,
      fetch: async () => {
        calls += 1;
        return new Response(JSON.stringify({ Id: "003" }));
      },
    });

    await expect(client.getRecord("Contact", "003")).rejects.toMatchObject({
      code: "OUTBOUND_HOST_NOT_ALLOWED",
    });
    expect(calls).toBe(0);
  });

  test.each([
    "http://acme.my.salesforce.com",
    "https://user:pass@acme.my.salesforce.com",
    "https://acme.my.salesforce.com:8443",
    "https://acme.my.salesforce.com/services",
  ])("rejects unsafe Salesforce instance URL %s before dispatch", async (instanceUrl) => {
    let calls = 0;
    const client = createSalesforceClient({
      accessToken: TOKEN,
      instanceUrl,
      fetch: async () => {
        calls += 1;
        return new Response(JSON.stringify({ Id: "003" }));
      },
    });

    await expect(client.getRecord("Contact", "003")).rejects.toMatchObject({
      code: "OUTBOUND_INVALID_URL",
    });
    expect(calls).toBe(0);
  });

  test("blocks redirects from a customer My Domain", async () => {
    const client = createSalesforceClient({
      accessToken: TOKEN,
      instanceUrl: "https://acme.my.salesforce.com",
      fetch: async () => new Response(null, {
        status: 302,
        headers: { location: "https://attacker.example/steal" },
      }),
    });

    await expect(client.getRecord("Contact", "003")).rejects.toMatchObject({
      code: "OUTBOUND_REDIRECT_BLOCKED",
    });
  });
});
