import { describe, expect, it } from "bun:test";
import {
  executeCampaignsListSync,
  executeAdSetsListSync,
  executeAdsListSync,
  executeAdAccountsListSync,
} from "../src/sync";
import campaignsList from "../fixtures/campaigns_list.json";
import adSetsList from "../fixtures/ad_sets_list.json";
import adsList from "../fixtures/ads_list.json";
import adAccountsList from "../fixtures/ad_accounts_list.json";

describe("campaigns.list sync", () => {
  it("returns normalized campaigns with cursor", () => {
    const result = executeCampaignsListSync({ response: campaignsList });
    expect(result.provider).toBe("meta-ads");
    expect(result.operation).toBe("campaigns.list");
    expect(result.items).toHaveLength(2);
    expect(result.items[0].id).toBe("meta-ads:campaign:23849293847298374");
    expect(result.items[0].name).toBe("Summer Sale 2024");
    expect(result.items[0].status).toBe("ACTIVE");
    expect(result.items[1].name).toBe("Brand Awareness Q3");
    expect(result.nextCursor).toBe("MTPZNk");
  });

  it("returns no cursor when paging.cursors.after is empty", () => {
    const result = executeCampaignsListSync({ response: { data: campaignsList.data } });
    expect(result.items).toHaveLength(2);
    expect(result.nextCursor).toBeNull();
  });

  it("throws on non-object response", () => {
    expect(() => executeCampaignsListSync({ response: "not an object" })).toThrow(
      "response must be an object",
    );
  });

  it("throws on array response", () => {
    expect(() => executeCampaignsListSync({ response: [1, 2] })).toThrow(
      "response must be an object",
    );
  });
});

describe("ad_sets.list sync", () => {
  it("returns normalized ad sets with cursor", () => {
    const result = executeAdSetsListSync({ response: adSetsList });
    expect(result.provider).toBe("meta-ads");
    expect(result.operation).toBe("ad_sets.list");
    expect(result.items).toHaveLength(2);
    expect(result.items[0].id).toBe("meta-ads:adset:23849293847298380");
    expect(result.items[0].name).toBe("US - Women 25-45");
    expect(result.items[0].campaignId).toBe("23849293847298374");
    expect(result.items[1].name).toBe("CA - Broad Audience");
    expect(result.nextCursor).toBe("QVFIUkNCSV");
  });

  it("throws on null response", () => {
    expect(() => executeAdSetsListSync({ response: null })).toThrow(
      "response must be an object",
    );
  });
});

describe("ads.list sync", () => {
  it("returns normalized ads with cursor", () => {
    const result = executeAdsListSync({ response: adsList });
    expect(result.provider).toBe("meta-ads");
    expect(result.operation).toBe("ads.list");
    expect(result.items).toHaveLength(2);
    expect(result.items[0].id).toBe("meta-ads:ad:23849293847298390");
    expect(result.items[0].name).toBe("Summer Sale - Image Ad");
    expect(result.items[0].creative.type).toBe("IMAGE");
    expect(result.items[1].creative.type).toBe("VIDEO");
    expect(result.nextCursor).toBe("MTcwMDAwMDA=");
  });

  it("throws on null response", () => {
    expect(() => executeAdsListSync({ response: null })).toThrow(
      "response must be an object",
    );
  });
});

describe("ad_accounts.list sync", () => {
  it("returns normalized ad accounts with cursor", () => {
    const result = executeAdAccountsListSync({ response: adAccountsList });
    expect(result.provider).toBe("meta-ads");
    expect(result.operation).toBe("ad_accounts.list");
    expect(result.items).toHaveLength(2);
    expect(result.items[0].id).toBe("meta-ads:adaccount:act_123456789");
    expect(result.items[0].name).toBe("Acme Corp");
    expect(result.items[0].accountStatus).toBe("ACTIVE");
    expect(result.items[1].accountStatus).toBe("DISABLED");
    expect(result.nextCursor).toBe("NjQ5MTYzNjU2");
  });

  it("throws on null response", () => {
    expect(() => executeAdAccountsListSync({ response: null })).toThrow(
      "response must be an object",
    );
  });
});
