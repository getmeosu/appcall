import { describe, expect, it } from "bun:test";
import {
  normalizeCampaign,
  parseCampaignsResponse,
  normalizeAdSet,
  parseAdSetsResponse,
  normalizeAd,
  parseAdsResponse,
  normalizeAdAccount,
  AD_ACCOUNT_STATUS_MAP,
  parseAdAccountsResponse,
} from "../src/objects";
import campaignsList from "../fixtures/campaigns_list.json";
import adSetsList from "../fixtures/ad_sets_list.json";
import adsList from "../fixtures/ads_list.json";
import adsListLegacyType from "../fixtures/ads_list_legacy_type.json";
import adAccountsList from "../fixtures/ad_accounts_list.json";

// ---------------------------------------------------------------------------
// Campaign
// ---------------------------------------------------------------------------

describe("normalizeCampaign", () => {
  const raw = campaignsList.data[0] as any;

  it("maps all campaign fields", () => {
    const c = normalizeCampaign(raw);
    expect(c.id).toBe("meta-ads:campaign:23849293847298374");
    expect(c.provider).toBe("meta-ads");
    expect(c.name).toBe("Summer Sale 2024");
    expect(c.status).toBe("ACTIVE");
    expect(c.objective).toBe("CONVERSIONS");
    expect(c.dailyBudget).toBe(1500);
    expect(c.lifetimeBudget).toBe(0);
    expect(c.startTime).toBe("2024-06-01T07:00:00+0000");
    expect(c.stopTime).toBe("2024-08-31T07:00:00+0000");
    expect(c.createdTime).toBe("2024-05-15T10:30:00+0000");
    expect(c.updatedTime).toBe("2024-07-20T14:22:00+0000");
    expect(c.effectiveStatus).toBe("ACTIVE");
  });

  it("handles lifetime_budget", () => {
    const raw2 = campaignsList.data[1] as any;
    const c = normalizeCampaign(raw2);
    expect(c.dailyBudget).toBe(2000);
    expect(c.lifetimeBudget).toBe(50000);
  });

  it("handles missing optional fields", () => {
    const rawMinimal = { id: "23849293847299999" };
    const c = normalizeCampaign(rawMinimal);
    expect(c.id).toBe("meta-ads:campaign:23849293847299999");
    expect(c.name).toBe("");
    expect(c.status).toBe("");
    expect(c.dailyBudget).toBe(0);
    expect(c.lifetimeBudget).toBe(0);
  });

  it("stores raw object", () => {
    const c = normalizeCampaign(raw);
    expect(c.raw).toBe(raw);
  });
});

describe("parseCampaignsResponse", () => {
  it("parses campaigns and returns cursor", () => {
    const result = parseCampaignsResponse(campaignsList);
    expect(result.campaigns).toHaveLength(2);
    expect(result.nextCursor).toBe("MTPZNk");
  });

  it("returns no cursor when paging.cursors.after is missing", () => {
    const result = parseCampaignsResponse({ data: [] });
    expect(result.campaigns).toHaveLength(0);
    expect(result.nextCursor).toBeNull();
  });

  it("handles null input", () => {
    const result = parseCampaignsResponse(null);
    expect(result.campaigns).toHaveLength(0);
    expect(result.nextCursor).toBeNull();
  });

  it("handles array input", () => {
    const result = parseCampaignsResponse([1, 2]);
    expect(result.campaigns).toHaveLength(0);
    expect(result.nextCursor).toBeNull();
  });

  it("handles missing data field", () => {
    const result = parseCampaignsResponse({ paging: { cursors: {} } });
    expect(result.campaigns).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Ad Set
// ---------------------------------------------------------------------------

describe("normalizeAdSet", () => {
  const raw = adSetsList.data[0] as any;

  it("maps all ad set fields", () => {
    const a = normalizeAdSet(raw);
    expect(a.id).toBe("meta-ads:adset:23849293847298380");
    expect(a.provider).toBe("meta-ads");
    expect(a.campaignId).toBe("23849293847298374");
    expect(a.name).toBe("US - Women 25-45");
    expect(a.status).toBe("ACTIVE");
    expect(a.dailyBudget).toBe(500);
    expect(a.startTime).toBe("2024-06-01T07:00:00+0000");
    expect(a.endTime).toBe("2024-08-31T07:00:00+0000");
    expect(a.targeting.age_min).toBe(25);
    expect(a.targeting.age_max).toBe(45);
    expect(a.optimizationGoal).toBe("OFFSITE_CONVERSIONS");
  });

  it("handles missing optional fields", () => {
    const rawMinimal = { id: "23849293847299999" };
    const a = normalizeAdSet(rawMinimal);
    expect(a.id).toBe("meta-ads:adset:23849293847299999");
    expect(a.campaignId).toBe("");
    expect(a.name).toBe("");
    expect(a.dailyBudget).toBe(0);
    expect(a.targeting).toEqual({});
    expect(a.optimizationGoal).toBe("");
  });

  it("handles null targeting", () => {
    const raw = { id: "23849293847299998", targeting: null } as any;
    const a = normalizeAdSet(raw);
    expect(a.targeting).toEqual({});
  });

  it("stores raw object", () => {
    const a = normalizeAdSet(raw);
    expect(a.raw).toBe(raw);
  });
});

describe("parseAdSetsResponse", () => {
  it("parses ad sets and returns cursor", () => {
    const result = parseAdSetsResponse(adSetsList);
    expect(result.adSets).toHaveLength(2);
    expect(result.nextCursor).toBe("QVFIUkNCSV");
  });

  it("handles null input", () => {
    const result = parseAdSetsResponse(null);
    expect(result.adSets).toHaveLength(0);
    expect(result.nextCursor).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Ad
// ---------------------------------------------------------------------------

describe("normalizeAd", () => {
  const raw = adsList.data[0] as any;

  it("maps all ad fields", () => {
    const a = normalizeAd(raw);
    expect(a.id).toBe("meta-ads:ad:23849293847298390");
    expect(a.provider).toBe("meta-ads");
    expect(a.adSetId).toBe("23849293847298380");
    expect(a.name).toBe("Summer Sale - Image Ad");
    expect(a.status).toBe("ACTIVE");
    expect(a.creative.name).toBe("Summer Creative - Beach");
    expect(a.creative.type).toBe("PHOTO");
    expect(a.effectiveStatus).toBe("ACTIVE");
    expect(a.createdAt).toBe("2024-05-28T12:00:00+0000");
    expect(a.updatedAt).toBe("2024-07-15T09:30:00+0000");
  });

  it("handles missing creative", () => {
    const rawMinimal = { id: "23849293847299999" };
    const a = normalizeAd(rawMinimal);
    expect(a.id).toBe("meta-ads:ad:23849293847299999");
    expect(a.adSetId).toBe("");
    expect(a.name).toBe("");
    expect(a.creative.name).toBe("");
    expect(a.creative.type).toBe("");
  });

  it("handles null creative", () => {
    const raw = { id: "23849293847299998", creative: null } as any;
    const a = normalizeAd(raw);
    expect(a.creative.name).toBe("");
    expect(a.creative.type).toBe("");
  });

  it("stores raw object", () => {
    const a = normalizeAd(raw);
    expect(a.raw).toBe(raw);
  });

  it("maps Graph v26.0 creative.object_type into creative.type", () => {
    const [photo, video] = adsList.data as any[];
    expect(photo.creative.object_type).toBe("PHOTO");
    expect(photo.creative.type).toBeUndefined();
    expect(normalizeAd(photo).creative.type).toBe("PHOTO");
    expect(normalizeAd(video).creative.type).toBe("VIDEO");
  });

  it("prefers object_type over a legacy type when both are present", () => {
    const a = normalizeAd({ id: "1", creative: { name: "c", object_type: "SHARE", type: "IMAGE" } } as any);
    expect(a.creative.type).toBe("SHARE");
  });

  it("falls back to a legacy type-only creative", () => {
    const [image, video] = adsListLegacyType.data as any[];
    expect(image.creative.object_type).toBeUndefined();
    expect(normalizeAd(image).creative.type).toBe("IMAGE");
    expect(normalizeAd(image).creative.name).toBe("Summer Creative - Beach");
    expect(normalizeAd(video).creative.type).toBe("VIDEO");
  });

  it("keeps the normalized creative keys unchanged (name, type)", () => {
    expect(Object.keys(normalizeAd(raw).creative).sort()).toEqual(["name", "type"]);
  });
});

describe("parseAdsResponse", () => {
  it("parses ads and returns cursor", () => {
    const result = parseAdsResponse(adsList);
    expect(result.ads).toHaveLength(2);
    expect(result.nextCursor).toBe("MTcwMDAwMDA=");
  });

  it("handles null input", () => {
    const result = parseAdsResponse(null);
    expect(result.ads).toHaveLength(0);
    expect(result.nextCursor).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Ad Account
// ---------------------------------------------------------------------------

describe("normalizeAdAccount", () => {
  const raw = adAccountsList.data[0] as any;

  it("maps all ad account fields", () => {
    const a = normalizeAdAccount(raw);
    expect(a.id).toBe("meta-ads:adaccount:act_123456789");
    expect(a.provider).toBe("meta-ads");
    expect(a.name).toBe("Acme Corp");
    expect(a.accountStatus).toBe("ACTIVE");
    expect(a.currency).toBe("USD");
    expect(a.timezone).toBe("America/Los_Angeles");
    expect(a.businessName).toBe("Acme Inc");
  });

  it("maps disabled status", () => {
    const raw2 = adAccountsList.data[1] as any;
    const a = normalizeAdAccount(raw2);
    expect(a.accountStatus).toBe("DISABLED");
  });

  it("handles unknown account status", () => {
    const rawUnknown = { id: "act_000", account_status: 999 };
    const a = normalizeAdAccount(rawUnknown);
    expect(a.accountStatus).toBe("UNKNOWN");
  });

  // Graph v26.0 Ad Account reference account_status table.
  const V26_ACCOUNT_STATUS: [number, string][] = [
    [1, "ACTIVE"],
    [2, "DISABLED"],
    [3, "UNSETTLED"],
    [7, "PENDING_RISK_REVIEW"],
    [8, "PENDING_SETTLEMENT"],
    [9, "IN_GRACE_PERIOD"],
    [100, "PENDING_CLOSURE"],
    [101, "CLOSED"],
    [201, "ANY_ACTIVE"],
    [202, "ANY_CLOSED"],
  ];

  for (const [code, label] of V26_ACCOUNT_STATUS) {
    it(`maps account_status ${code} to ${label}`, () => {
      expect(normalizeAdAccount({ id: `act_${code}`, account_status: code }).accountStatus).toBe(label);
    });
  }

  it("status map is exactly the v26 reference table", () => {
    expect(AD_ACCOUNT_STATUS_MAP).toEqual(Object.fromEntries(V26_ACCOUNT_STATUS));
  });

  it("maps removed non-reference codes 402 and 403 to UNKNOWN", () => {
    expect(normalizeAdAccount({ id: "act_402", account_status: 402 }).accountStatus).toBe("UNKNOWN");
    expect(normalizeAdAccount({ id: "act_403", account_status: 403 }).accountStatus).toBe("UNKNOWN");
  });

  it("handles missing optional fields", () => {
    const rawMinimal = { id: "act_minimal" };
    const a = normalizeAdAccount(rawMinimal);
    expect(a.id).toBe("meta-ads:adaccount:act_minimal");
    expect(a.name).toBe("");
    expect(a.accountStatus).toBe("UNKNOWN");
    expect(a.currency).toBe("");
    expect(a.timezone).toBe("");
    expect(a.businessName).toBe("");
  });

  it("stores raw object", () => {
    const a = normalizeAdAccount(raw);
    expect(a.raw).toBe(raw);
  });
});

describe("parseAdAccountsResponse", () => {
  it("parses ad accounts and returns cursor", () => {
    const result = parseAdAccountsResponse(adAccountsList);
    expect(result.adAccounts).toHaveLength(2);
    expect(result.nextCursor).toBe("NjQ5MTYzNjU2");
  });

  it("returns no cursor when paging is absent", () => {
    const result = parseAdAccountsResponse({ data: [] });
    expect(result.adAccounts).toHaveLength(0);
    expect(result.nextCursor).toBeNull();
  });

  it("handles null input", () => {
    const result = parseAdAccountsResponse(null);
    expect(result.adAccounts).toHaveLength(0);
    expect(result.nextCursor).toBeNull();
  });
});
