import { describe, expect, it } from "bun:test";
import {
  executeCampaignsListSync,
  executeAdGroupsListSync,
  executeAdsListSync,
} from "../src/sync";
import campaignsFixture from "../fixtures/campaigns.json";
import campaignsPagedFixture from "../fixtures/campaigns_paged.json";
import adGroupsFixture from "../fixtures/ad_groups.json";
import adsFixture from "../fixtures/ads.json";

describe("campaigns.list sync", () => {
  it("returns normalized campaigns", () => {
    const result = executeCampaignsListSync({ response: campaignsFixture });
    expect(result.provider).toBe("tiktok-ads");
    expect(result.operation).toBe("campaigns.list");
    expect(result.items).toHaveLength(3);
    expect(result.items[0].id).toBe("tt-campaign:1234567890");
    expect(result.items[0].name).toBe("Summer Sale 2025");
    expect(result.items[0].status).toBe("ENABLE");
    expect(result.nextPage).toBeNull();
    expect(result.totalCount).toBe(3);
  });

  it("returns pagination cursor when more pages exist", () => {
    const result = executeCampaignsListSync({ response: campaignsPagedFixture });
    expect(result.items).toHaveLength(1);
    expect(result.nextPage).toBe(2);
    expect(result.totalCount).toBe(15);
  });

  it("returns empty for invalid response", () => {
    const result = executeCampaignsListSync({ response: null });
    expect(result.items).toHaveLength(0);
    expect(result.nextPage).toBeNull();
    expect(result.totalCount).toBe(0);
  });
});

describe("ad_groups.list sync", () => {
  it("returns normalized ad groups", () => {
    const result = executeAdGroupsListSync({ response: adGroupsFixture });
    expect(result.provider).toBe("tiktok-ads");
    expect(result.operation).toBe("ad_groups.list");
    expect(result.items).toHaveLength(3);
    expect(result.items[0].id).toBe("tt-adgroup:1122334455");
    expect(result.items[0].name).toBe("Summer Sale - Women 25-34");
    expect(result.items[0].campaignId).toBe("1234567890");
    expect(result.nextPage).toBeNull();
    expect(result.totalCount).toBe(3);
  });

  it("returns empty for invalid response", () => {
    const result = executeAdGroupsListSync({ response: null });
    expect(result.items).toHaveLength(0);
    expect(result.nextPage).toBeNull();
  });
});

describe("ads.list sync", () => {
  it("returns normalized ads", () => {
    const result = executeAdsListSync({ response: adsFixture });
    expect(result.provider).toBe("tiktok-ads");
    expect(result.operation).toBe("ads.list");
    expect(result.items).toHaveLength(3);
    expect(result.items[0].id).toBe("tt-ad:4455667788");
    expect(result.items[0].name).toBe("Summer Sale - Video Ad 1");
    expect(result.items[0].adGroupId).toBe("1122334455");
    expect(result.nextPage).toBeNull();
    expect(result.totalCount).toBe(3);
  });

  it("returns empty for invalid response", () => {
    const result = executeAdsListSync({ response: null });
    expect(result.items).toHaveLength(0);
    expect(result.nextPage).toBeNull();
  });
});
