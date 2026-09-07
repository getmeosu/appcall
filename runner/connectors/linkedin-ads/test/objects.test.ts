import { describe, expect, it } from "bun:test";
import {
  normalizeCampaign,
  parseCampaignsResponse,
  normalizeAdAccount,
  parseAdAccountsResponse,
  normalizeCreativeAsset,
  parseCreativeAssetsResponse,
} from "../src/objects";
import campaignsList from "../fixtures/campaigns_list.json";
import campaignsListNoPage from "../fixtures/campaigns_list_no_page.json";
import adAccountsList from "../fixtures/ad_accounts_list.json";
import adAccountsListNoPage from "../fixtures/ad_accounts_list_no_page.json";
import creativeAssetsList from "../fixtures/creative_assets_list.json";
import creativeAssetsListNoPage from "../fixtures/creative_assets_list_no_page.json";

describe("normalizeCampaign", () => {
  const raw1 = campaignsList.elements[0] as any;
  const raw2 = campaignsList.elements[1] as any;
  const raw3 = campaignsList.elements[2] as any;

  it("maps all campaign fields from active campaign", () => {
    const c = normalizeCampaign(raw1);
    expect(c.id).toBe("li-ads-campaign:111222333");
    expect(c.provider).toBe("linkedin-ads");
    expect(c.name).toBe("Q1 Brand Awareness - US");
    expect(c.status).toBe("ACTIVE");
    expect(c.type).toBe("SPONSORED_ADS");
    expect(c.accountId).toBe("555666777");
    expect(c.budget).toBe(15000.0);
    expect(c.currency).toBe("USD");
    expect(c.startDate).toBe(1704067200000);
    expect(c.endDate).toBe(1711929599000);
    expect(c.runStatus).toBe("COMPLETED");
    expect(c.costInLocalCurrency).toBe(12450.75);
    expect(c.modelVersion).toBe("2026-05-17");
  });

  it("handles draft campaign with different currency", () => {
    const c = normalizeCampaign(raw2);
    expect(c.id).toBe("li-ads-campaign:444555666");
    expect(c.name).toBe("Product Launch - EMEA");
    expect(c.status).toBe("DRAFT");
    expect(c.budget).toBe(25000.0);
    expect(c.currency).toBe("EUR");
    expect(c.runStatus).toBe("NOT_STARTED");
    expect(c.costInLocalCurrency).toBe(0);
  });

  it("handles paused campaign with null end date", () => {
    const c = normalizeCampaign(raw3);
    expect(c.id).toBe("li-ads-campaign:777888999");
    expect(c.status).toBe("PAUSED");
    expect(c.runStatus).toBe("PAUSED");
    expect(c.endDate).toBeNull();
    expect(c.costInLocalCurrency).toBe(3200.5);
  });

  it("handles minimal input", () => {
    const c = normalizeCampaign({ id: "urn:li:sponsoredCampaign:1" });
    expect(c.id).toBe("li-ads-campaign:1");
    expect(c.name).toBe("");
    expect(c.status).toBe("");
    expect(c.budget).toBe(0);
    expect(c.accountId).toBe("");
    expect(c.startDate).toBeNull();
    expect(c.endDate).toBeNull();
    expect(c.costInLocalCurrency).toBe(0);
  });
});

describe("parseCampaignsResponse", () => {
  it("parses campaigns with paging", () => {
    const result = parseCampaignsResponse(campaignsList);
    expect(result.campaigns).toHaveLength(3);
    expect(result.nextStart).toBe(10);
    expect(result.count).toBe(10);
  });

  it("returns no cursor on last page", () => {
    const result = parseCampaignsResponse(campaignsListNoPage);
    expect(result.campaigns).toHaveLength(1);
    expect(result.nextStart).toBeNull();
  });

  it("handles null input", () => {
    const result = parseCampaignsResponse(null);
    expect(result.campaigns).toHaveLength(0);
    expect(result.nextStart).toBeNull();
  });
});

describe("normalizeAdAccount", () => {
  const raw1 = adAccountsList.elements[0] as any;
  const raw2 = adAccountsList.elements[1] as any;
  const raw3 = adAccountsList.elements[2] as any;

  it("maps all ad account fields", () => {
    const a = normalizeAdAccount(raw1);
    expect(a.id).toBe("li-ads-account:555666777");
    expect(a.provider).toBe("linkedin-ads");
    expect(a.name).toBe("TechCo Inc - Marketing");
    expect(a.status).toBe("ACTIVE");
    expect(a.type).toBe("BUSINESS");
    expect(a.currency).toBe("USD");
    expect(a.reference).toBe("act_555666777");
    expect(a.modelVersion).toBe("2026-05-17");
  });

  it("handles account with different currency", () => {
    const a = normalizeAdAccount(raw2);
    expect(a.id).toBe("li-ads-account:888999000");
    expect(a.name).toBe("TechCo Inc - EMEA");
    expect(a.currency).toBe("EUR");
    expect(a.status).toBe("ACTIVE");
  });

  it("handles paused account", () => {
    const a = normalizeAdAccount(raw3);
    expect(a.id).toBe("li-ads-account:111222333");
    expect(a.status).toBe("PAUSED");
  });

  it("handles minimal input", () => {
    const a = normalizeAdAccount({ id: "urn:li:sponsoredAccount:1" });
    expect(a.id).toBe("li-ads-account:1");
    expect(a.name).toBe("");
    expect(a.status).toBe("");
    expect(a.currency).toBe("");
    expect(a.reference).toBe("");
  });
});

describe("parseAdAccountsResponse", () => {
  it("parses ad accounts with paging", () => {
    const result = parseAdAccountsResponse(adAccountsList);
    expect(result.adAccounts).toHaveLength(3);
    expect(result.nextStart).toBe(10);
    expect(result.count).toBe(10);
  });

  it("returns no cursor on last page", () => {
    const result = parseAdAccountsResponse(adAccountsListNoPage);
    expect(result.adAccounts).toHaveLength(1);
    expect(result.nextStart).toBeNull();
  });

  it("handles null input", () => {
    const result = parseAdAccountsResponse(null);
    expect(result.adAccounts).toHaveLength(0);
    expect(result.nextStart).toBeNull();
  });
});

describe("normalizeCreativeAsset", () => {
  const raw1 = creativeAssetsList.elements[0] as any;
  const raw2 = creativeAssetsList.elements[1] as any;
  const raw3 = creativeAssetsList.elements[2] as any;

  it("maps all creative asset fields", () => {
    const c = normalizeCreativeAsset(raw1);
    expect(c.id).toBe("li-ads-creative:1234567890");
    expect(c.provider).toBe("linkedin-ads");
    expect(c.type).toBe("SPONSORED_UPDATE_CREATIVE");
    expect(c.status).toBe("ACTIVE");
    expect(c.createdAt).toBe(1704067200000);
    expect(c.updatedAt).toBe(1711929599000);
    expect(c.modelVersion).toBe("2026-05-17");
  });

  it("handles image creative", () => {
    const c = normalizeCreativeAsset(raw2);
    expect(c.id).toBe("li-ads-creative:2345678901");
    expect(c.type).toBe("IMAGE_CREATIVE");
    expect(c.status).toBe("ACTIVE");
  });

  it("handles draft creative", () => {
    const c = normalizeCreativeAsset(raw3);
    expect(c.id).toBe("li-ads-creative:3456789012");
    expect(c.type).toBe("VIDEO_CREATIVE");
    expect(c.status).toBe("DRAFT");
  });

  it("handles minimal input", () => {
    const c = normalizeCreativeAsset({ id: "urn:li:creatives:1" });
    expect(c.id).toBe("li-ads-creative:1");
    expect(c.type).toBe("");
    expect(c.status).toBe("");
    expect(c.createdAt).toBeNull();
    expect(c.updatedAt).toBeNull();
  });
});

describe("parseCreativeAssetsResponse", () => {
  it("parses creative assets with paging", () => {
    const result = parseCreativeAssetsResponse(creativeAssetsList);
    expect(result.creativeAssets).toHaveLength(3);
    expect(result.nextStart).toBe(10);
    expect(result.count).toBe(10);
  });

  it("returns no cursor on last page", () => {
    const result = parseCreativeAssetsResponse(creativeAssetsListNoPage);
    expect(result.creativeAssets).toHaveLength(1);
    expect(result.nextStart).toBeNull();
  });

  it("handles null input", () => {
    const result = parseCreativeAssetsResponse(null);
    expect(result.creativeAssets).toHaveLength(0);
    expect(result.nextStart).toBeNull();
  });
});
