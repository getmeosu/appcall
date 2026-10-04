import { describe, expect, it } from "bun:test";
import {
  getAnalyticsReport,
  listAdvertisers,
  getAdvertiser,
  getCampaign,
  createCampaign,
  updateCampaign,
  updateCampaignStatus,
  getAdGroup,
  createAdGroup,
  updateAdGroup,
  updateAdGroupStatus,
  getAd,
  createAd,
  updateAd,
  updateAdStatus,
  listPixels,
  getPixel,
  getReport,
  listIdentities,
  listVideos,
  listImages,
  listCustomAudiences,
} from "../src/actions";
import advertisersList from "../fixtures/advertisers_list.json";
import advertiserGet from "../fixtures/advertiser_get.json";
import campaignGet from "../fixtures/campaign_get.json";
import campaignCreate from "../fixtures/campaign_create.json";
import campaignUpdate from "../fixtures/campaign_update.json";
import campaignStatusUpdate from "../fixtures/campaign_status_update.json";
import adGroupGet from "../fixtures/ad_group_get.json";
import adGroupCreate from "../fixtures/ad_group_create.json";
import adGroupUpdate from "../fixtures/ad_group_update.json";
import adGroupStatusUpdate from "../fixtures/ad_group_status_update.json";
import adGet from "../fixtures/ad_get.json";
import adCreate from "../fixtures/ad_create.json";
import adUpdate from "../fixtures/ad_update.json";
import adStatusUpdate from "../fixtures/ad_status_update.json";
import pixelsList from "../fixtures/pixels_list.json";
import pixelGet from "../fixtures/pixel_get.json";
import analyticsReport from "../fixtures/analytics_report.json";
import identitiesList from "../fixtures/identities_list.json";
import videosList from "../fixtures/videos_list.json";
import imagesList from "../fixtures/images_list.json";
import customAudiencesList from "../fixtures/custom_audiences_list.json";

function createMockFetch(status: number, body: unknown, sink?: { requests: Request[] }) {
  return (input: RequestInfo | URL, init?: RequestInit) => {
    sink?.requests.push(new Request(input, init));
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
    );
  };
}

const liveAuth = { accessToken: "test-token" };

describe("analytics.report.get", () => {
  it("requires advertiserId, dataLevel, and dates", () => {
    expect(() => getAnalyticsReport({})).toThrow("advertiserId is required");
    expect(() =>
      getAnalyticsReport({ advertiserId: "6987654321098765432", startDate: "2025-06-01", endDate: "2025-06-30" }),
    ).toThrow("dataLevel is required");
  });

  it("rejects unknown dataLevel", () => {
    expect(() =>
      getAnalyticsReport({
        advertiserId: "6987654321098765432",
        dataLevel: "NOPE",
        startDate: "2025-06-01",
        endDate: "2025-06-30",
      }),
    ).toThrow("dataLevel must be one of");
  });

  it("validates without credentials", () => {
    const result = getAnalyticsReport({
      advertiserId: "6987654321098765432",
      reportType: "BASIC",
      dataLevel: "AUCTION_CAMPAIGN",
      startDate: "2025-06-01",
      endDate: "2025-06-30",
      dimensions: ["campaign_id", "stat_time_day"],
      metrics: ["spend", "impressions", "clicks"],
    }) as any;
    expect(result.connector).toBe("tiktok-ads");
    expect(result.action).toBe("analytics.report.get");
    expect(result.validated.advertiserId).toBe("6987654321098765432");
    expect(result.validated.dataLevel).toBe("AUCTION_CAMPAIGN");
    expect(result.validated.startDate).toBe("2025-06-01");
  });

  it("fetches report live with mocked fetch", async () => {
    const result = (await getAnalyticsReport({
      ...liveAuth,
      advertiserId: "6987654321098765432",
      dataLevel: "AUCTION_CAMPAIGN",
      startDate: "2025-06-01",
      endDate: "2025-06-30",
      dimensions: ["campaign_id", "stat_time_day"],
      metrics: ["spend", "impressions", "clicks"],
      fetch: createMockFetch(200, analyticsReport),
    })) as any;
    expect(result.rows).toHaveLength(2);
    expect(result.rowCount).toBe(2);
    expect(result.rows[0].impressions).toBe(54000);
    expect(result.rows[0].clicks).toBe(1800);
    expect(result.rows[0].spend).toBe(1250.5);
    expect(result.rows[0].dimensions.campaign_id).toBe("1234567890");
  });
});

describe("advertisers.list", () => {
  it("validates without credentials and without advertiserId", () => {
    const result = listAdvertisers({}) as any;
    expect(result.connector).toBe("tiktok-ads");
    expect(result.action).toBe("advertisers.list");
    expect(result.validated).toEqual({});
  });

  it("accepts optional advertiserIds", () => {
    const result = listAdvertisers({ advertiserIds: ["6987654321098765432"] }) as any;
    expect(result.validated.advertiserIds).toEqual(["6987654321098765432"]);
  });

  it("lists advertisers live with mocked fetch", async () => {
    const result = (await listAdvertisers({
      ...liveAuth,
      fetch: createMockFetch(200, advertisersList),
    })) as any;
    expect(result.advertisers).toHaveLength(2);
    expect(result.advertisers[0].id).toBe("tt-advertiser:6987654321098765432");
    expect(result.advertisers[0].name).toBe("Acme Commerce US");
    expect(result.advertisers[0].currency).toBe("USD");
    expect(result.totalCount).toBe(2);
  });
});

describe("campaigns.get", () => {
  it("requires advertiserId and campaignId", () => {
    expect(() => getCampaign({})).toThrow("advertiserId is required");
    expect(() => getCampaign({ advertiserId: "6987654321098765432" })).toThrow("campaignId is required");
  });

  it("validates without credentials", () => {
    const result = getCampaign({ advertiserId: "6987654321098765432", campaignId: "1234567890" }) as any;
    expect(result.action).toBe("campaigns.get");
    expect(result.validated.campaignId).toBe("1234567890");
  });

  it("fetches campaign live with mocked fetch", async () => {
    const result = (await getCampaign({
      ...liveAuth,
      advertiserId: "6987654321098765432",
      campaignId: "1234567890",
      fetch: createMockFetch(200, campaignGet),
    })) as any;
    expect(result.campaign.id).toBe("tt-campaign:1234567890");
    expect(result.campaign.name).toBe("Summer Sale 2025");
    expect(result.campaign.status).toBe("ENABLE");
    expect(result.campaign.budget).toBe(50000);
  });
});

describe("ad_groups.get", () => {
  it("requires advertiserId and adGroupId", () => {
    expect(() => getAdGroup({})).toThrow("advertiserId is required");
    expect(() => getAdGroup({ advertiserId: "6987654321098765432" })).toThrow("adGroupId is required");
  });

  it("validates without credentials", () => {
    const result = getAdGroup({ advertiserId: "6987654321098765432", adGroupId: "1122334455" }) as any;
    expect(result.action).toBe("ad_groups.get");
    expect(result.validated.adGroupId).toBe("1122334455");
  });

  it("fetches ad group live with mocked fetch", async () => {
    const result = (await getAdGroup({
      ...liveAuth,
      advertiserId: "6987654321098765432",
      adGroupId: "1122334455",
      fetch: createMockFetch(200, adGroupGet),
    })) as any;
    expect(result.adGroup.id).toBe("tt-adgroup:1122334455");
    expect(result.adGroup.name).toBe("Summer Sale - Women 25-34");
    expect(result.adGroup.campaignId).toBe("1234567890");
  });
});

describe("ads.get", () => {
  it("requires advertiserId and adId", () => {
    expect(() => getAd({})).toThrow("advertiserId is required");
    expect(() => getAd({ advertiserId: "6987654321098765432" })).toThrow("adId is required");
  });

  it("validates without credentials", () => {
    const result = getAd({ advertiserId: "6987654321098765432", adId: "4455667788" }) as any;
    expect(result.action).toBe("ads.get");
    expect(result.validated.adId).toBe("4455667788");
  });

  it("fetches ad live with mocked fetch", async () => {
    const result = (await getAd({
      ...liveAuth,
      advertiserId: "6987654321098765432",
      adId: "4455667788",
      fetch: createMockFetch(200, adGet),
    })) as any;
    expect(result.ad.id).toBe("tt-ad:4455667788");
    expect(result.ad.name).toBe("Summer Sale - Video Ad 1");
    expect(result.ad.adFormat).toBe("VIDEO");
  });
});

describe("pixels.list", () => {
  it("requires advertiserId", () => {
    expect(() => listPixels({})).toThrow("advertiserId is required");
  });

  it("validates without credentials", () => {
    const result = listPixels({ advertiserId: "6987654321098765432", page: 1, pageSize: 10 }) as any;
    expect(result.action).toBe("pixels.list");
    expect(result.validated.advertiserId).toBe("6987654321098765432");
    expect(result.validated.page).toBe(1);
  });

  it("lists pixels live with mocked fetch", async () => {
    const result = (await listPixels({
      ...liveAuth,
      advertiserId: "6987654321098765432",
      fetch: createMockFetch(200, pixelsList),
    })) as any;
    expect(result.pixels).toHaveLength(2);
    expect(result.pixels[0].id).toBe("tt-pixel:7001122334455667788");
    expect(result.pixels[0].name).toBe("Acme Web Pixel");
    expect(result.pixels[0].code).toBe("CABCDEFG");
    expect(result.totalCount).toBe(2);
  });
});

const advertiserId = "6987654321098765432";

describe("campaigns.create", () => {
  it("requires advertiserId, campaignName, and objectiveType", () => {
    expect(() => createCampaign({})).toThrow("advertiserId is required");
    expect(() => createCampaign({ advertiserId })).toThrow("campaignName is required");
    expect(() => createCampaign({ advertiserId, campaignName: "Summer Sale 2025" })).toThrow(
      "objectiveType is required",
    );
  });

  it("validates without credentials", () => {
    const result = createCampaign({
      advertiserId,
      campaignName: "Summer Sale 2025",
      objectiveType: "TRAFFIC",
      budgetMode: "BUDGET_MODE_DAY",
      budget: 50,
    }) as any;
    expect(result.action).toBe("campaigns.create");
    expect(result.validated.objectiveType).toBe("TRAFFIC");
  });

  it("posts campaign create live with mocked fetch", async () => {
    const sink = { requests: [] as Request[] };
    const result = (await createCampaign({
      ...liveAuth,
      advertiserId,
      campaignName: "Summer Sale 2025",
      objectiveType: "TRAFFIC",
      budgetMode: "BUDGET_MODE_DAY",
      budget: 50,
      fetch: createMockFetch(200, campaignCreate, sink),
    })) as any;
    expect(sink.requests[0].method).toBe("POST");
    expect(sink.requests[0].url).toContain("/campaign/create/");
    const body = await sink.requests[0].json();
    expect(body.advertiser_id).toBe(advertiserId);
    expect(body.campaign_name).toBe("Summer Sale 2025");
    expect(result.campaignId).toBe("1234567890");
  });
});

describe("campaigns.update", () => {
  it("requires advertiserId and campaignId", () => {
    expect(() => updateCampaign({})).toThrow("advertiserId is required");
    expect(() => updateCampaign({ advertiserId })).toThrow("campaignId is required");
  });

  it("posts campaign update live with mocked fetch", async () => {
    const sink = { requests: [] as Request[] };
    const result = (await updateCampaign({
      ...liveAuth,
      advertiserId,
      campaignId: "1234567890",
      campaignName: "Summer Sale 2025 R2",
      budget: 75,
      fetch: createMockFetch(200, campaignUpdate, sink),
    })) as any;
    expect(sink.requests[0].method).toBe("POST");
    expect(sink.requests[0].url).toContain("/campaign/update/");
    const body = await sink.requests[0].json();
    expect(body.campaign_id).toBe("1234567890");
    expect(body.campaign_name).toBe("Summer Sale 2025 R2");
    expect(result.campaignId).toBe("1234567890");
  });
});

describe("campaigns.status.update", () => {
  it("requires advertiserId, campaignId, and operationStatus", () => {
    expect(() => updateCampaignStatus({})).toThrow("advertiserId is required");
    expect(() => updateCampaignStatus({ advertiserId, campaignId: "1234567890" })).toThrow(
      "operationStatus is required",
    );
  });

  it("rejects unknown operationStatus", () => {
    expect(() =>
      updateCampaignStatus({ advertiserId, campaignId: "1234567890", operationStatus: "PAUSE" }),
    ).toThrow("operationStatus must be one of");
  });

  it("posts campaign status update live with mocked fetch", async () => {
    const sink = { requests: [] as Request[] };
    const result = (await updateCampaignStatus({
      ...liveAuth,
      advertiserId,
      campaignId: "1234567890",
      operationStatus: "DISABLE",
      fetch: createMockFetch(200, campaignStatusUpdate, sink),
    })) as any;
    expect(sink.requests[0].url).toContain("/campaign/status/update/");
    const body = await sink.requests[0].json();
    expect(body.campaign_ids).toEqual(["1234567890"]);
    expect(body.operation_status).toBe("DISABLE");
    expect(result.status).toBe("DISABLE");
  });
});

describe("ad_groups.create", () => {
  it("requires advertiserId, campaignId, and adGroupName", () => {
    expect(() => createAdGroup({})).toThrow("advertiserId is required");
    expect(() => createAdGroup({ advertiserId })).toThrow("campaignId is required");
    expect(() => createAdGroup({ advertiserId, campaignId: "1234567890" })).toThrow(
      "adGroupName is required",
    );
  });

  it("posts ad group create live with mocked fetch", async () => {
    const sink = { requests: [] as Request[] };
    const result = (await createAdGroup({
      ...liveAuth,
      advertiserId,
      campaignId: "1234567890",
      adGroupName: "Summer Sale - Women 25-34",
      promotionType: "WEBSITE",
      placementType: "PLACEMENT_TYPE_AUTOMATIC",
      budgetMode: "BUDGET_MODE_DAY",
      budget: 20,
      optimizationGoal: "CLICK",
      billingEvent: "CPC",
      locationIds: ["6252001"],
      fetch: createMockFetch(200, adGroupCreate, sink),
    })) as any;
    expect(sink.requests[0].url).toContain("/adgroup/create/");
    const body = await sink.requests[0].json();
    expect(body.adgroup_name).toBe("Summer Sale - Women 25-34");
    expect(body.location_ids).toEqual(["6252001"]);
    expect(result.adGroupId).toBe("1122334455");
  });
});

describe("ad_groups.update", () => {
  it("requires advertiserId and adGroupId", () => {
    expect(() => updateAdGroup({})).toThrow("advertiserId is required");
    expect(() => updateAdGroup({ advertiserId })).toThrow("adGroupId is required");
  });

  it("posts ad group update live with mocked fetch", async () => {
    const sink = { requests: [] as Request[] };
    const result = (await updateAdGroup({
      ...liveAuth,
      advertiserId,
      adGroupId: "1122334455",
      adGroupName: "Summer Sale - Women 25-44",
      budget: 25,
      fetch: createMockFetch(200, adGroupUpdate, sink),
    })) as any;
    expect(sink.requests[0].url).toContain("/adgroup/update/");
    const body = await sink.requests[0].json();
    expect(body.adgroup_id).toBe("1122334455");
    expect(result.adGroupId).toBe("1122334455");
  });
});

describe("ad_groups.status.update", () => {
  it("requires advertiserId, adGroupId, and operationStatus", () => {
    expect(() => updateAdGroupStatus({ advertiserId, adGroupId: "1122334455" })).toThrow(
      "operationStatus is required",
    );
  });

  it("posts ad group status update live with mocked fetch", async () => {
    const sink = { requests: [] as Request[] };
    const result = (await updateAdGroupStatus({
      ...liveAuth,
      advertiserId,
      adGroupId: "1122334455",
      operationStatus: "DISABLE",
      fetch: createMockFetch(200, adGroupStatusUpdate, sink),
    })) as any;
    expect(sink.requests[0].url).toContain("/adgroup/status/update/");
    const body = await sink.requests[0].json();
    expect(body.adgroup_ids).toEqual(["1122334455"]);
    expect(result.status).toBe("DISABLE");
  });
});

describe("ads.create", () => {
  it("requires advertiserId, adGroupId, and adName", () => {
    expect(() => createAd({})).toThrow("advertiserId is required");
    expect(() => createAd({ advertiserId })).toThrow("adGroupId is required");
    expect(() => createAd({ advertiserId, adGroupId: "1122334455" })).toThrow("adName is required");
  });

  it("posts ad create live with mocked fetch", async () => {
    const sink = { requests: [] as Request[] };
    const result = (await createAd({
      ...liveAuth,
      advertiserId,
      adGroupId: "1122334455",
      adName: "Summer Sale - Video Ad 1",
      identityId: "701122334455667788",
      identityType: "CUSTOMIZED_USER",
      adFormat: "SINGLE_VIDEO",
      videoId: "v10001",
      adText: "Shop the summer sale",
      callToAction: "SHOP_NOW",
      landingPageUrl: "https://example.com/sale",
      fetch: createMockFetch(200, adCreate, sink),
    })) as any;
    expect(sink.requests[0].url).toContain("/ad/create/");
    const body = await sink.requests[0].json();
    expect(body.adgroup_id).toBe("1122334455");
    expect(body.creatives[0].ad_name).toBe("Summer Sale - Video Ad 1");
    expect(body.creatives[0].video_id).toBe("v10001");
    expect(result.adIds).toEqual(["4455667788"]);
  });
});

describe("ads.update", () => {
  it("requires advertiserId and adId", () => {
    expect(() => updateAd({ advertiserId })).toThrow("adId is required");
  });

  it("posts ad update live with mocked fetch", async () => {
    const sink = { requests: [] as Request[] };
    const result = (await updateAd({
      ...liveAuth,
      advertiserId,
      adId: "4455667788",
      adName: "Summer Sale - Video Ad 1b",
      adText: "Ends Sunday",
      fetch: createMockFetch(200, adUpdate, sink),
    })) as any;
    expect(sink.requests[0].url).toContain("/ad/update/");
    const body = await sink.requests[0].json();
    expect(body.ad_id).toBe("4455667788");
    expect(result.adIds).toEqual(["4455667788"]);
  });
});

describe("ads.status.update", () => {
  it("posts ad status update live with mocked fetch", async () => {
    const sink = { requests: [] as Request[] };
    const result = (await updateAdStatus({
      ...liveAuth,
      advertiserId,
      adId: "4455667788",
      operationStatus: "DISABLE",
      fetch: createMockFetch(200, adStatusUpdate, sink),
    })) as any;
    expect(sink.requests[0].url).toContain("/ad/status/update/");
    const body = await sink.requests[0].json();
    expect(body.ad_ids).toEqual(["4455667788"]);
    expect(result.status).toBe("DISABLE");
  });

  it("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(
      updateAdStatus({
        ...liveAuth,
        advertiserId,
        adId: "4455667788",
        operationStatus: "ENABLE",
        fetch: createMockFetch(429, { code: 40100, message: "rate limited" }),
      }),
    ).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED" });
  });
});

describe("advertisers.get", () => {
  it("requires advertiserId", () => {
    expect(() => getAdvertiser({})).toThrow("advertiserId is required");
  });

  it("fetches advertiser live with mocked fetch", async () => {
    const sink = { requests: [] as Request[] };
    const result = (await getAdvertiser({
      ...liveAuth,
      advertiserId,
      fetch: createMockFetch(200, advertiserGet, sink),
    })) as any;
    expect(sink.requests[0].url).toContain("/advertiser/info/");
    expect(sink.requests[0].url).toContain(encodeURIComponent(advertiserId));
    expect(result.advertiser.id).toBe("tt-advertiser:6987654321098765432");
    expect(result.advertiser.name).toBe("Acme Commerce US");
  });
});

describe("reports.get", () => {
  it("requires advertiserId and dates, defaults BASIC auction campaign", () => {
    expect(() => getReport({})).toThrow("advertiserId is required");
    const result = getReport({
      advertiserId,
      startDate: "2025-06-01",
      endDate: "2025-06-30",
    }) as any;
    expect(result.action).toBe("reports.get");
    expect(result.validated.reportType).toBe("BASIC");
    expect(result.validated.dataLevel).toBe("AUCTION_CAMPAIGN");
  });

  it("fetches basic report live with mocked fetch", async () => {
    const sink = { requests: [] as Request[] };
    const result = (await getReport({
      ...liveAuth,
      advertiserId,
      startDate: "2025-06-01",
      endDate: "2025-06-30",
      fetch: createMockFetch(200, analyticsReport, sink),
    })) as any;
    expect(sink.requests[0].url).toContain("/report/integrated/get/");
    expect(sink.requests[0].url).toContain("report_type=BASIC");
    expect(result.rowCount).toBe(2);
    expect(result.rows[0].spend).toBe(1250.5);
  });
});

describe("identities.list", () => {
  it("requires advertiserId", () => {
    expect(() => listIdentities({})).toThrow("advertiserId is required");
  });

  it("lists identities live with mocked fetch", async () => {
    const result = (await listIdentities({
      ...liveAuth,
      advertiserId,
      fetch: createMockFetch(200, identitiesList),
    })) as any;
    expect(result.identities).toHaveLength(2);
    expect(result.identities[0].id).toBe("tt-identity:701122334455667788");
    expect(result.identities[0].displayName).toBe("Acme Shop");
  });
});

describe("videos.list", () => {
  it("lists videos live with mocked fetch", async () => {
    const sink = { requests: [] as Request[] };
    const result = (await listVideos({
      ...liveAuth,
      advertiserId,
      fetch: createMockFetch(200, videosList, sink),
    })) as any;
    expect(sink.requests[0].url).toContain("/file/video/ad/search/");
    expect(result.videos[0].id).toBe("tt-video:v10001");
    expect(result.videos[0].fileName).toBe("summer-sale.mp4");
  });
});

describe("images.list", () => {
  it("lists images live with mocked fetch", async () => {
    const sink = { requests: [] as Request[] };
    const result = (await listImages({
      ...liveAuth,
      advertiserId,
      fetch: createMockFetch(200, imagesList, sink),
    })) as any;
    expect(sink.requests[0].url).toContain("/file/image/ad/search/");
    expect(result.images[0].id).toBe("tt-image:img10001");
  });
});

describe("custom_audiences.list", () => {
  it("lists custom audiences live with mocked fetch", async () => {
    const sink = { requests: [] as Request[] };
    const result = (await listCustomAudiences({
      ...liveAuth,
      advertiserId,
      fetch: createMockFetch(200, customAudiencesList, sink),
    })) as any;
    expect(sink.requests[0].url).toContain("/dmp/custom_audience/list/");
    expect(result.audiences[0].id).toBe("tt-audience:aud10001");
    expect(result.audiences[0].name).toBe("Past purchasers 90d");
  });
});

describe("pixels.get", () => {
  it("requires advertiserId and pixelId", () => {
    expect(() => getPixel({ advertiserId })).toThrow("pixelId is required");
  });

  it("fetches pixel live with mocked fetch", async () => {
    const result = (await getPixel({
      ...liveAuth,
      advertiserId,
      pixelId: "7001122334455667788",
      fetch: createMockFetch(200, pixelGet),
    })) as any;
    expect(result.pixel.id).toBe("tt-pixel:7001122334455667788");
    expect(result.pixel.name).toBe("Acme Web Pixel");
  });
});
