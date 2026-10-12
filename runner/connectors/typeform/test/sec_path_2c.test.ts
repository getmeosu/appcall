import { describe, test } from "bun:test";
import { expectPathFieldGuarded } from "../../_shared/test/path_segment_harness";

// SEC-PATH-2c: every (operation, path field) below reached the provider with a
// dot-only, empty or whitespace id before this fix (fuzzed on 6af924c2). Each
// must now be rejected before any request; percent-encoded dot forms must never
// arrive as a dot segment.
const CREDS = {"accessToken": "credaccessToken"};
const CASES: Array<[string, string]> = [
  ["forms.delete", "formId"],
  ["forms.get", "formId"],
  ["forms.messages.get", "formId"],
  ["forms.messages.update", "formId"],
  ["forms.patch", "formId"],
  ["forms.update", "formId"],
  ["images.background.get", "imageId"],
  ["images.choice.get", "imageId"],
  ["images.delete", "imageId"],
  ["images.get", "imageId"],
  ["responses.delete", "formId"],
  ["responses.files.get", "formId"],
  ["responses.list.action", "formId"],
  ["themes.delete", "themeId"],
  ["themes.get", "themeId"],
  ["themes.patch", "themeId"],
  ["themes.update", "themeId"],
  ["webhooks.create", "formId"],
  ["webhooks.create", "tag"],
  ["webhooks.delete", "formId"],
  ["webhooks.delete", "tag"],
  ["webhooks.get", "formId"],
  ["webhooks.get", "tag"],
  ["webhooks.list", "formId"],
  ["workspaces.create_in_account", "accountId"],
  ["workspaces.delete", "workspaceId"],
  ["workspaces.get", "workspaceId"],
  ["workspaces.update", "workspaceId"],
];

describe("typeform SEC-PATH-2c path ids", () => {
  for (const [action, field] of CASES) {
    test(`${action} ${field} rejects dot-only/blank before fetch`, async () => {
      await expectPathFieldGuarded("typeform", action, field, CREDS);
    });
  }
});

// SEC-PATH-2c recount: a supplied but empty/blank primary id must be rejected,
// never fall back to its snake_case alias.
import { expect } from "bun:test";
import { requestsFor } from "../../_shared/test/path_segment_harness";
import { requireField } from "../src/depth";

describe("typeform blank id never falls back to the alias", () => {
  const ALIASED: Array<[string, string, string, Record<string, unknown>]> = [
    ["workspaces.get", "workspaceId", "workspace_id", {}],
    ["workspaces.delete", "workspaceId", "workspace_id", {}],
    ["themes.get", "themeId", "theme_id", {}],
    ["themes.delete", "themeId", "theme_id", {}],
    ["images.delete", "imageId", "image_id", {}],
    ["workspaces.create_in_account", "accountId", "account_id", { name: "n" }],
  ];
  for (const [action, field, alias, extra] of ALIASED) {
    test(`${action}: ${field} '' / ' ' with ${alias} set is rejected with zero requests`, async () => {
      for (const blank of ["", " ", "\t"]) {
        const calls = await requestsFor("typeform", action, { ...CREDS, ...extra, [field]: blank, [alias]: "fallback1" });
        expect(calls, `${field}=${JSON.stringify(blank)}`).toEqual([]);
      }
      const calls = await requestsFor("typeform", action, { ...CREDS, ...extra, [field]: "primary1", [alias]: "alias1" });
      expect(calls.length).toBe(1);
      expect(new URL(calls[0]!.url).pathname).toContain("primary1");
    });
  }

  test("requireField: first supplied spelling wins; blank rejects", () => {
    expect(requireField({ themeId: "a", theme_id: "b" }, "themeId", "theme_id")).toBe("a");
    expect(requireField({ theme_id: "b" }, "themeId", "theme_id")).toBe("b");
    expect(requireField({ themeId: null, theme_id: "b" }, "themeId", "theme_id")).toBe("b");
    expect(() => requireField({ themeId: "", theme_id: "b" }, "themeId", "theme_id")).toThrow("themeId is required");
    expect(() => requireField({ themeId: "  " }, "themeId", "theme_id")).toThrow("themeId is required");
    expect(() => requireField({}, "themeId", "theme_id")).toThrow("themeId is required");
  });
});
