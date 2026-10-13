import { expect, it } from "bun:test";
import manifest from "../manifest.json";

it("declares bounded action schemas with titles and descriptions", () => {
  expect(manifest.version).toBe("0.2.1");
  expect(manifest.http?.baseUrl).toBe("https://api.helpdesk.com");
  expect(manifest.http?.auth.field).toBe("apiKey");
  expect(manifest.http?.auth.basic).toEqual({ username: "{{accountId}}", password: "{{apiKey}}" });
  expect(manifest.network?.allowedHosts).toEqual(["api.helpdesk.com"]);
  const lists = {
    "emailDomains.list": "/v1/emailDomains",
    "replyAddresses.list": "/v1/replyAddresses",
    "rules.list": "/v1/rules",
    "subscriptions.list": "/v1/subscriptions",
    "trustedEmails.list": "/v1/trustedEmails",
  } as const;
  for (const [key, path] of Object.entries(lists)) {
    const request = (manifest.operations as Record<string, { request?: { method?: string; path?: string; success?: number[]; body?: unknown; headers?: unknown; query?: unknown } }>)[key]?.request;
    expect(request?.method, key).toBe("GET");
    expect(request?.path, key).toBe(path);
    expect(request?.success, key).toEqual([200]);
    expect(request?.body, key).toBeUndefined();
    expect(request?.headers, key).toBeUndefined();
    if (key === "subscriptions.list") {
      expect(request?.query, key).toEqual({ "planCodes[]": "{{planCodes}}", state: "{{state}}" });
    } else {
      expect(request?.query, key).toBeUndefined();
    }
  }
  for (const [key, op] of Object.entries(manifest.operations) as [string, any][]) {
    expect(op.title.length).toBeGreaterThan(0);
    expect(op.description.length).toBeGreaterThan(0);
    expect(op.timeoutMs).toBeGreaterThan(0);
    expect(op.maxResponseBytes).toBeLessThanOrEqual(5242880);
    expect(["read", "write", "destructive"]).toContain(op.sideEffect);
    if (op.kind === "webhook") {
      expect(key.startsWith("webhook.")).toBe(true);
      expect(op.request).toBeUndefined();
      expect(op.sideEffect).toBe("read");
      continue;
    }
    expect(op.kind).toBe("action");
    expect(op.inputSchema.type).toBe("object");
    expect(op.outputSchema.type).toBe("object");
    expect(op.enforceOutputSchema).toBe(true);
    expect(op.validationMode).toBe("strict-generated");
    expect(op.responseFormat).toBe("json");
  }
});
