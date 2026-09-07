import { describe, expect, it } from "bun:test";
import { executeCampaignsListSync, executeAdAccountsListSync, executeCreativeAssetsListSync } from "../src/sync";
import campaignsList from "../fixtures/campaigns_list.json";
import campaignsListNoPage from "../fixtures/campaigns_list_no_page.json";
import adAccountsList from "../fixtures/ad_accounts_list.json";
import adAccountsListNoPage from "../fixtures/ad_accounts_list_no_page.json";
import creativeAssetsList from "../fixtures/creative_assets_list.json";
import creativeAssetsListNoPage from "../fixtures/creative_assets_list_no_page.json";

describe("campaigns.list sync", () => {
  it("returns normalized campaigns with cursor", () => {
    const result = executeCampaignsListSync({ response: campaignsList });
    expect(result.provider).toBe("linkedin-ads");
    expect(result.operation).toBe("campaigns.list");
    expect(result.items).toHaveLength(3);
    expect(result.items[0].id).toBe("li-ads-campaign:111222333");
    expect(result.items[0].name).toBe("Q1 Brand Awareness - US");
    expect(result.items[0].status).toBe("ACTIVE");
    expect(result.nextStart).toBe(10);
  });

  it("returns no cursor on last page", () => {
    const result = executeCampaignsListSync({ response: campaignsListNoPage });
    expect(result.items).toHaveLength(1);
    expect(result.nextStart).toBeNull();
  });

  it("returns empty for invalid response", () => {
    const result = executeCampaignsListSync({ response: null });
    expect(result.items).toHaveLength(0);
    expect(result.nextStart).toBeNull();
  });
});

describe("ad_accounts.list sync", () => {
  it("returns normalized ad accounts with cursor", () => {
    const result = executeAdAccountsListSync({ response: adAccountsList });
    expect(result.provider).toBe("linkedin-ads");
    expect(result.operation).toBe("ad_accounts.list");
    expect(result.items).toHaveLength(3);
    expect(result.items[0].id).toBe("li-ads-account:555666777");
    expect(result.items[0].name).toBe("TechCo Inc - Marketing");
    expect(result.items[0].currency).toBe("USD");
    expect(result.nextStart).toBe(10);
  });

  it("returns no cursor on last page", () => {
    const result = executeAdAccountsListSync({ response: adAccountsListNoPage });
    expect(result.items).toHaveLength(1);
    expect(result.nextStart).toBeNull();
  });

  it("returns empty for invalid response", () => {
    const result = executeAdAccountsListSync({ response: null });
    expect(result.items).toHaveLength(0);
    expect(result.nextStart).toBeNull();
  });
});

describe("creative_assets.list sync", () => {
  it("returns normalized creative assets with cursor", () => {
    const result = executeCreativeAssetsListSync({ response: creativeAssetsList });
    expect(result.provider).toBe("linkedin-ads");
    expect(result.operation).toBe("creative_assets.list");
    expect(result.items).toHaveLength(3);
    expect(result.items[0].id).toBe("li-ads-creative:1234567890");
    expect(result.items[0].type).toBe("SPONSORED_UPDATE_CREATIVE");
    expect(result.items[0].status).toBe("ACTIVE");
    expect(result.nextStart).toBe(10);
  });

  it("returns no cursor on last page", () => {
    const result = executeCreativeAssetsListSync({ response: creativeAssetsListNoPage });
    expect(result.items).toHaveLength(1);
    expect(result.nextStart).toBeNull();
  });

  it("returns empty for invalid response", () => {
    const result = executeCreativeAssetsListSync({ response: null });
    expect(result.items).toHaveLength(0);
    expect(result.nextStart).toBeNull();
  });
});
