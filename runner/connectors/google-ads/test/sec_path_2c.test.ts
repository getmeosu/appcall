import { describe, expect, test } from "bun:test";
import { expectPathFieldGuarded, expectRejectedWithoutFetch, requestsFor } from "../../_shared/test/path_segment_harness";

// SEC-PATH-2c: every (operation, path field) below reached the provider with a
// dot-only, empty or whitespace id before this fix (fuzzed on 6af924c2). Each
// must now be rejected before any request; percent-encoded dot forms must never
// arrive as a dot segment.
const CREDS = {"accessToken": "credaccessToken", "developerToken": "creddeveloperToken"};
const CASES: Array<[string, string]> = [
  ["ad_group_assets.get", "customerId"],
  ["ad_group_assets.mutate", "customerId"],
  ["ad_groups.get", "customerId"],
  ["ad_groups.mutate", "customerId"],
  ["ads.get", "customerId"],
  ["ads.mutate", "customerId"],
  ["assets.callout.create", "customerId"],
  ["assets.get", "customerId"],
  ["assets.list", "customerId"],
  ["assets.mutate", "customerId"],
  ["bidding_strategies.get", "customerId"],
  ["bidding_strategies.mutate", "customerId"],
  ["budgets.get", "customerId"],
  ["budgets.mutate", "customerId"],
  ["campaign_assets.get", "customerId"],
  ["campaign_assets.mutate", "customerId"],
  ["campaigns.get", "customerId"],
  ["campaigns.getByName", "customerId"],
  ["campaigns.mutate", "customerId"],
  ["conversion_actions.get", "customerId"],
  ["conversion_actions.mutate", "customerId"],
  ["conversion_actions.tag_snippets.get", "customerId"],
  ["customer_assets.get", "customerId"],
  ["customer_assets.mutate", "customerId"],
  ["customer_lists.create", "customerId"],
  ["customer_lists.mutateMembers", "customerId"],
  ["customers.listSubAccounts", "customerId"],
  ["gaql.search", "customerId"],
  ["gaql.searchStream", "customerId"],
  ["keywords.get", "customerId"],
  ["keywords.mutate", "customerId"],
  ["labels.get", "customerId"],
  ["labels.mutate", "customerId"],
  ["portfolio_bidding_strategies.mutate", "customerId"],
];

describe("google-ads SEC-PATH-2c path ids", () => {
  for (const [action, field] of CASES) {
    test(`${action} ${field} rejects dot-only/blank before fetch`, async () => {
      await expectPathFieldGuarded("google-ads", action, field, CREDS);
    });
  }
});

describe("google-ads customerId strict guard", () => {
  test("percent-encoded dot forms are rejected outright; dashed ids still work", async () => {
    for (const customerId of ["%2e%2e", "%2E", ".%2e", "1/2"]) {
      await expectRejectedWithoutFetch("google-ads", "campaigns.get", { accessToken: "t", campaignId: "1", customerId });
    }
    const calls = await requestsFor("google-ads", "campaigns.get", { accessToken: "t", campaignId: "1", customerId: "123-456-7890" });
    expect(new URL(calls[0]!.url).pathname).toContain("/customers/1234567890/");
  });
});
