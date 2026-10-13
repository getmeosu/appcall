import { expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const casesDir = fileURLToPath(new URL("../fixtures/cases/", import.meta.url));
const cases = readdirSync(casesDir)
  .filter((name) => name.endsWith(".json"))
  .sort()
  .map((name) => ({
    file: name,
    value: JSON.parse(readFileSync(resolve(casesDir, name), "utf8")),
  }));

const added = [
  "automations.email.receipts.list",
  "automations.email.receipts.create",
  "automations.email.receipts.get",
  "automations.email.receipts.update",
  "automations.email.receipts.delete",
  "post.direct_mail.locations.search.trailing",
  "referral.accounts.list.trailing",
] as const;

test("keeps origin clicksend transport and adds documented json routes", () => {
  expect(manifest.version).toBe("0.4.1");
  expect(manifest.key).toBe("clicksend");
  expect(manifest.http.baseUrl).toBe("https://rest.clicksend.com/v3");
  expect(manifest.http.headers).toEqual({ Accept: "application/json" });
  expect(manifest.http.auth).toEqual({
    basic: { username: "{{username}}", password: "{{apiKey}}" },
    field: "apiKey",
    in: "header",
    name: "Authorization",
  });
  expect(manifest.network.allowedHosts).toEqual(["rest.clicksend.com"]);
  expect(manifest.operations["automations.email.receipt.list"].request.path).toBe("/automations/email/receipt");
  expect(manifest.operations["automations.email.receipt.create"].request.path).toBe("/automations/email/receipt");
  expect(manifest.operations["post.direct_mail.locations.search"].request.path).toBe("/post/direct-mail/locations/search/{{country}}");
  expect(manifest.operations["referral.accounts.list"].request.path).toBe("/referral/accounts");
  expect(Object.keys(manifest.operations)).toHaveLength(223);

  const specs: Record<(typeof added)[number], { method: string; path: string; sideEffect: "read" | "write"; body: boolean }> = {
    "automations.email.receipts.list": { method: "GET", path: "/automations/email/receipts", sideEffect: "read", body: false },
    "automations.email.receipts.create": { method: "POST", path: "/automations/email/receipts", sideEffect: "write", body: true },
    "automations.email.receipts.get": { method: "GET", path: "/automations/email/receipts/{{receipt_rule_id}}", sideEffect: "read", body: false },
    "automations.email.receipts.update": { method: "PUT", path: "/automations/email/receipts/{{receipt_rule_id}}", sideEffect: "write", body: true },
    "automations.email.receipts.delete": { method: "DELETE", path: "/automations/email/receipts/{{receipt_rule_id}}", sideEffect: "write", body: false },
    "post.direct_mail.locations.search.trailing": { method: "GET", path: "/post/direct-mail/locations/search/{{country}}/", sideEffect: "read", body: false },
    "referral.accounts.list.trailing": { method: "GET", path: "/referral/accounts/", sideEffect: "read", body: false },
  };
  for (const id of added) {
    const operation = manifest.operations[id];
    expect(operation.request.method).toBe(specs[id].method);
    expect(operation.request.path).toBe(specs[id].path);
    expect(operation.request.baseUrl).toBeUndefined();
    expect(operation.sideEffect).toBe(specs[id].sideEffect);
    expect(operation.outputSchema.type).toBe("object");
    expect(operation.outputSchema).toEqual(manifest.operations["automations.email.receipt.list"].outputSchema);
    expect(operation.inputSchema.additionalProperties).toBe(false);
    expect(operation.maxResponseBytes).toBeGreaterThanOrEqual(operation.maxInputBytes);
    expect(operation.request.body !== undefined).toBe(specs[id].body);
    expect(operation.request.headers?.["Content-Type"]).toBe(specs[id].body ? "application/json" : undefined);
  }
});

test("fixture cases cover every operation with a success result", () => {
  const operationKeys = Object.keys(manifest.operations).sort();
  const caseOperations = [...new Set(cases.map(({ value }) => value.operation))].sort();
  expect(caseOperations).toEqual(operationKeys);
  for (const { value } of cases) {
    expect(value.input && typeof value.input === "object" && !Array.isArray(value.input)).toBe(true);
    expect(Array.isArray(value.exchanges)).toBe(true);
    for (const exchange of value.exchanges) {
      expect(exchange.request.body === null || typeof exchange.request.body === "string").toBe(true);
      expect(existsSync(resolve(casesDir, exchange.response.bodyFile))).toBe(true);
    }
    if (value.expected.kind === "success") {
      expect(existsSync(resolve(casesDir, value.expected.resultFile))).toBe(true);
    }
  }
  for (const operation of operationKeys) {
    expect(cases.some(({ value }) => value.operation === operation && value.expected.kind === "success")).toBe(true);
  }
});

test("executes the added public json routes", async () => {
  const { actions } = compileDeclarativeConnector(manifest as never);
  const credential = { username: "demo-user", apiKey: "demo-key" };
  const envelope = { http_code: 200, response_code: "SUCCESS", response_msg: "OK", data: {} };
  const body = {
    rule_name: "My Rule",
    match_type: 0,
    action: "URL",
    action_address: "http://yourdomain.com",
    enabled: 1,
  };
  const expectedBody = JSON.stringify({
    action: "URL",
    action_address: "http://yourdomain.com",
    enabled: 1,
    match_type: 0,
    rule_name: "My Rule",
  });
  const calls: Array<[string, Record<string, unknown>, string, string, string | null]> = [
    ["automations.email.receipts.list", { page: 1, limit: 10 }, "GET", "https://rest.clicksend.com/v3/automations/email/receipts?page=1&limit=10", null],
    ["automations.email.receipts.create", body, "POST", "https://rest.clicksend.com/v3/automations/email/receipts", expectedBody],
    ["automations.email.receipts.get", { receipt_rule_id: 1 }, "GET", "https://rest.clicksend.com/v3/automations/email/receipts/1", null],
    ["automations.email.receipts.update", { receipt_rule_id: 1, ...body }, "PUT", "https://rest.clicksend.com/v3/automations/email/receipts/1", expectedBody],
    ["automations.email.receipts.delete", { receipt_rule_id: 1 }, "DELETE", "https://rest.clicksend.com/v3/automations/email/receipts/1", null],
    ["post.direct_mail.locations.search.trailing", { country: "AD", q: "AD100" }, "GET", "https://rest.clicksend.com/v3/post/direct-mail/locations/search/AD/?q=AD100", null],
    ["referral.accounts.list.trailing", { page: 1, limit: 10 }, "GET", "https://rest.clicksend.com/v3/referral/accounts/?page=1&limit=10", null],
  ];
  for (const [operation, input, method, url, requestBody] of calls) {
    const result = await actions[operation]!({
      ...credential,
      ...input,
      fetch: async (seenUrl: string, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        expect(seenUrl).toBe(url);
        expect(init?.method ?? "GET").toBe(method);
        expect(headers.get("authorization")).toBe("Basic ZGVtby11c2VyOmRlbW8ta2V5");
        expect(headers.get("accept")).toBe("application/json");
        if (requestBody === null) {
          expect(init?.body ?? null).toBeNull();
          expect(headers.get("content-type")).toBeNull();
        } else {
          expect(headers.get("content-type")).toBe("application/json");
          expect(String(init?.body)).toBe(requestBody);
        }
        return new Response(JSON.stringify(envelope), { status: 200 });
      },
    });
    expect(result).toEqual({ connector: "clicksend", action: operation, source: "provider", data: envelope });
  }
  const bare = await actions["automations.email.receipts.list"]!({
    ...credential,
    fetch: async (seenUrl: string, init?: RequestInit) => {
      expect(seenUrl).toBe("https://rest.clicksend.com/v3/automations/email/receipts");
      expect(new Headers(init?.headers).get("content-type")).toBeNull();
      return new Response(JSON.stringify(envelope), { status: 200 });
    },
  });
  expect(bare).toMatchObject({ action: "automations.email.receipts.list" });
  await expect(actions["automations.email.receipts.create"]!({ ...credential, rule_name: "My Rule" })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
  await expect(actions["automations.email.receipts.get"]!({
    ...credential,
    receipt_rule_id: 1,
    extra: true,
    fetch: async () => new Response("{}", { status: 200 }),
  })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
});
