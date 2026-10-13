import { expect, test } from "bun:test";
import manifest from "../manifest.json";

const operations = manifest.operations as Record<string, {
  kind?: string;
  responseFormat?: string;
  validationMode?: string;
  enforceOutputSchema?: boolean;
  timeoutMs?: number;
  maxInputBytes?: number;
  maxResponseBytes?: number;
  title?: string;
  description?: string;
  sideEffect?: string;
  inputSchema?: { type?: string; properties?: Record<string, unknown> };
  outputSchema?: { type?: string };
  request?: { method?: string; path?: string; body?: unknown; headers?: Record<string, unknown>; success?: number[] };
}>;

test("donately manifest is one JSON route per operation with strict defaults", () => {
  expect(manifest.network.allowedHosts).toEqual(["api.donately.com"]);
  expect(manifest.http.baseUrl).toBe("https://api.donately.com/v2");
  expect(manifest.http.auth).toEqual({
    field: "apiToken",
    in: "header",
    name: "Authorization",
    basic: {
      username: "{{apiToken}}",
      password: "",
    },
  });
  expect(manifest.http.headers).toEqual({
    Accept: "application/json",
    "Donately-Version": "2022-12-15",
  });
  const accountField = manifest.auth.setup.fields.find((field) => field.key === "accountId");
  expect(accountField).toEqual({
    key: "accountId",
    label: "Donately account ID",
    required: true,
    secret: false,
  });
  const keys = Object.keys(operations).sort();
  expect(keys).toEqual([
    "accounts.current",
    "campaigns.list",
    "donations.list",
    "forms.get",
    "forms.list",
    "fundraisers.list",
    "people.get",
    "people.list",
    "subscriptions.list",
    "webhooks.list",
  ]);
  for (const [key, operation] of Object.entries(operations)) {
    expect(operation.kind, key).toBe("action");
    expect(operation.responseFormat, key).toBe("json");
    expect(operation.validationMode, key).toBe("strict-generated");
    expect(operation.enforceOutputSchema, key).toBe(true);
    expect(operation.outputSchema?.type, key).toBe("object");
    expect(operation.inputSchema?.type, key).toBe("object");
    expect(operation.title, key).toEqual(expect.any(String));
    expect(operation.description, key).toEqual(expect.any(String));
    expect(operation.sideEffect, key).toBe("read");
    expect(operation.timeoutMs, key).toBeGreaterThanOrEqual(1);
    expect(operation.timeoutMs, key).toBeLessThanOrEqual(300000);
    expect(operation.maxInputBytes, key).toBeLessThanOrEqual(26214400);
    expect(operation.maxResponseBytes, key).toBeGreaterThanOrEqual(operation.maxInputBytes ?? 0);
    expect(operation.request?.method, key).toBe("GET");
    expect(operation.request?.path, key).toEqual(expect.stringMatching(/^\/[A-Za-z0-9{}/._-]+$/));
    expect(operation.request?.body, key).toBeUndefined();
    expect(operation.request?.headers?.["Content-Type"], key).toBeUndefined();
    expect(operation.request?.success, key).toEqual([200]);
    expect(operation.inputSchema?.properties?.url, key).toBeUndefined();
    if (key === "accounts.current") {
      expect(operation.request?.headers?.["Donately-Account"], key).toBeUndefined();
    } else {
      expect(operation.request?.headers?.["Donately-Account"], key).toBe("{{accountId}}");
    }
  }
});
