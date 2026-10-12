import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { defaultConnectorRegistry } from "../src/registry";
import { renderPath } from "../src/declarative/template";

// SEC-PATH-2b: a whitespace-only value is never a valid URL path segment.
// "" was already rejected; "  " used to render as /%20%20 and reach the provider.
describe("declarative path templates reject blank values", () => {
  for (const bad of ["", " ", "  ", "\t", "\n"]) {
    test(`renderPath rejects ${JSON.stringify(bad)}`, () => {
      expect(() => renderPath("/items/{{id}}", { id: bad })).toThrow("id is required");
    });
  }
  test("renderPath keeps real values, including inner spaces", () => {
    expect(renderPath("/items/{{id}}", { id: "abc 1" })).toBe("/items/abc%201");
  });
});

type Call = string;
function recorder() {
  const calls: Call[] = [];
  const fetch = (async (input: RequestInfo | URL) => {
    calls.push(String(input instanceof Request ? input.url : input));
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof globalThis.fetch;
  return { calls, fetch };
}
function credentials(connector: string): Record<string, unknown> {
  const manifest = JSON.parse(readFileSync(join(import.meta.dir, "../../connectors", connector, "manifest.json"), "utf8"));
  const fields: { key: string }[] = manifest.auth?.setup?.fields ?? [];
  const out: Record<string, unknown> = fields.length === 0 ? { accessToken: "token" } : {};
  for (const field of fields) out[field.key] = field.key === "subdomain" ? "acme" : `cred-${field.key}`;
  return out;
}
async function settle(connector: string, action: string, input: Record<string, unknown>) {
  try {
    const result = defaultConnectorRegistry.executeAction(connector, action, input);
    if (!result.ok) return result.code;
    await Promise.resolve(result.output);
    return "ok";
  } catch (error) {
    return (error as { code?: string })?.code ?? "threw";
  }
}

// One declarative op per SEC-PATH-2b connector whose path ids were sent as %20.
const cases: [string, string, Record<string, unknown>, string][] = [
  ["apollo", "accounts.get", { id: "acc-1" }, "id"],
  ["sender", "groups.delete", { id: "grp-1" }, "id"],
  ["zendesk", "custom_objects.access_rules.delete", { custom_object_key: "car", id: "rule-1" }, "custom_object_key"],
  ["calendly", "groups.get", { uuid: "GRP1" }, "uuid"],
  ["clickmeeting", "get_time_zone_list_by_country", { country_code: "pl" }, "country_code"],
  ["linkedin-ads", "lead_forms.get", { leadFormId: "123" }, "leadFormId"],
  ["linkedin-ads", "creatives.list", { accountId: "507404993" }, "accountId"],
];
describe("SEC-PATH-2b connectors: blank declarative path ids make no request", () => {
  for (const [connector, action, valid, field] of cases) {
    test(`${connector} ${action}: valid ${field} reaches the provider`, async () => {
      const { calls, fetch } = recorder();
      await settle(connector, action, { ...credentials(connector), ...valid, fetch });
      expect(calls.length).toBeGreaterThan(0);
    });
    for (const bad of ["", "  "]) {
      test(`${connector} ${action}: ${field}=${JSON.stringify(bad)} is rejected with zero fetches`, async () => {
        const { calls, fetch } = recorder();
        const code = await settle(connector, action, { ...credentials(connector), ...valid, [field]: bad, fetch });
        expect(code).not.toBe("ok");
        expect(calls).toHaveLength(0);
      });
    }
  }

  test("meta-ads ad_objects.copy: blank objectId is rejected with zero fetches", async () => {
    for (const bad of ["", "  "]) {
      const { calls, fetch } = recorder();
      const code = await settle("meta-ads", "ad_objects.copy", { ...credentials("meta-ads"), objectId: bad, objectType: "campaign", fetch });
      expect(code).not.toBe("ok");
      expect(calls).toHaveLength(0);
    }
  });
});
