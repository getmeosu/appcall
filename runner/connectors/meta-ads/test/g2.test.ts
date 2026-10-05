import { describe, expect, test } from "bun:test";
import {
  deleteCampaign,
  deleteAdSet,
  deleteAd,
  updateAdCreative,
  previewAdCreative,
  listAdImages,
  uploadAdImage,
  createAdVideo,
  getAdVideo,
  listCustomAudiences,
  getCustomAudience,
  createCustomAudience,
  createAsyncInsights,
  getAsyncInsights,
  getReachEstimate,
  CREATIVE_GET_FIELDS,
  resolveObserveFields,
} from "../src/g2";
import { getAdCreative, createAd } from "../src/g1";
import campaignDeleted from "../fixtures/campaign_deleted.json";
import adsetDeleted from "../fixtures/adset_deleted.json";
import adDeleted from "../fixtures/ad_deleted.json";
import creativeUpdated from "../fixtures/adcreative_updated.json";
import creativePreview from "../fixtures/adcreative_preview.json";
import creativeGet from "../fixtures/adcreative_get.json";
import imagesList from "../fixtures/adimages_list.json";
import imageUploaded from "../fixtures/adimage_uploaded.json";
import videoCreated from "../fixtures/advideo_created.json";
import videoGet from "../fixtures/advideo_get.json";
import audiencesList from "../fixtures/customaudiences_list.json";
import audienceGet from "../fixtures/customaudience_get.json";
import audienceCreated from "../fixtures/customaudience_created.json";
import asyncCreated from "../fixtures/insights_async_created.json";
import asyncGet from "../fixtures/insights_async_get.json";
import reachEstimate from "../fixtures/reachestimate_get.json";
import adCreated from "../fixtures/ad_created.json";

function stubFetch(body: unknown, init: { status?: number } = {}) {
  const calls: Request[] = [];
  const impl = (async (input: string | URL | Request, requestInit?: RequestInit) => {
    calls.push(new Request(input as string, requestInit));
    return new Response(JSON.stringify(body), {
      status: init.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { calls, impl };
}

const auth = { accessToken: "EAAB-test-token" };

describe("meta-ads G2 deletes", () => {
  test("campaigns.delete DELETEs /{id}", async () => {
    const { calls, impl } = stubFetch(campaignDeleted);
    const result = await deleteCampaign({ ...auth, campaignId: "23851234567890123", fetch: impl });
    expect(calls[0]!.method).toBe("DELETE");
    expect(new URL(calls[0]!.url).pathname).toBe("/v26.0/23851234567890123");
    expect(result.success).toBe(true);
  });

  test("ad_sets.delete and ads.delete", async () => {
    const a = stubFetch(adsetDeleted);
    await deleteAdSet({ ...auth, adSetId: "23851234567890234", fetch: a.impl });
    expect(a.calls[0]!.method).toBe("DELETE");
    expect(new URL(a.calls[0]!.url).pathname).toBe("/v26.0/23851234567890234");

    const b = stubFetch(adDeleted);
    const result = await deleteAd({ ...auth, adId: "23851234567890345", fetch: b.impl });
    expect(b.calls[0]!.method).toBe("DELETE");
    expect(result.success).toBe(true);
  });
});

describe("ad_creatives.update / preview", () => {
  test("update POSTs name/status only", async () => {
    const { calls, impl } = stubFetch(creativeUpdated);
    const result = await updateAdCreative({
      ...auth,
      creativeId: "23851234567890456",
      name: "Hero Photo v2",
      status: "ACTIVE",
      fetch: impl,
    });
    expect(new URL(calls[0]!.url).pathname).toBe("/v26.0/23851234567890456");
    const params = new URLSearchParams(await calls[0]!.text());
    expect(params.get("name")).toBe("Hero Photo v2");
    expect(params.get("status")).toBe("ACTIVE");
    expect(params.get("poll_spec")).toBeNull();
    expect(result.success).toBe(true);
  });

  test("preview GETs /{id}/previews", async () => {
    const { calls, impl } = stubFetch(creativePreview);
    const result = await previewAdCreative({
      ...auth,
      creativeId: "23851234567890456",
      adFormat: "DESKTOP_FEED_STANDARD",
      fetch: impl,
    });
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe("/v26.0/23851234567890456/previews");
    expect(url.searchParams.get("ad_format")).toBe("DESKTOP_FEED_STANDARD");
    expect(result.previews).toHaveLength(1);
  });
});

describe("ad_images / ad_videos", () => {
  test("list reads data[] and paging.cursors.after", async () => {
    const { calls, impl } = stubFetch(imagesList);
    const result = await listAdImages({ ...auth, adAccountId: "123456789", limit: 25, fetch: impl });
    expect(new URL(calls[0]!.url).pathname).toBe("/v26.0/act_123456789/adimages");
    expect(result.images).toHaveLength(2);
    expect((result.images as Array<{ hash: string }>)[0]!.hash).toBe("abc123hash");
    expect(result.nextCursor).toBe("AFTERIMG");
  });

  test("upload POSTs bytes and normalizes images map", async () => {
    const { calls, impl } = stubFetch(imageUploaded);
    const result = await uploadAdImage({
      ...auth,
      adAccountId: "act_123456789",
      bytes: "aGVsbG8=",
      name: "hero.png",
      fetch: impl,
    });
    expect(new URL(calls[0]!.url).pathname).toBe("/v26.0/act_123456789/adimages");
    const params = new URLSearchParams(await calls[0]!.text());
    expect(params.get("bytes")).toBe("aGVsbG8=");
    expect(result.hash).toBe("abc123hash");
    expect((result.image as { hash: string }).hash).toBe("abc123hash");
  });

  test("ad_videos.create POSTs file_url", async () => {
    const { calls, impl } = stubFetch(videoCreated);
    const result = await createAdVideo({
      ...auth,
      adAccountId: "123456789",
      fileUrl: "https://example.com/demo.mp4",
      title: "Product Demo",
      fetch: impl,
    });
    expect(new URL(calls[0]!.url).pathname).toBe("/v26.0/act_123456789/advideos");
    const params = new URLSearchParams(await calls[0]!.text());
    expect(params.get("file_url")).toBe("https://example.com/demo.mp4");
    expect(result.id).toBe("23851234567890567");
  });

  test("ad_videos.get normalizes", async () => {
    const { calls, impl } = stubFetch(videoGet);
    const result = await getAdVideo({ ...auth, videoId: "23851234567890567", fetch: impl });
    expect(new URL(calls[0]!.url).pathname).toBe("/v26.0/23851234567890567");
    expect(result.video).toMatchObject({
      graphId: "23851234567890567",
      title: "Product Demo",
    });
  });
});

describe("custom_audiences", () => {
  test("list reads data[] + cursors", async () => {
    const { calls, impl } = stubFetch(audiencesList);
    const result = await listCustomAudiences({ ...auth, adAccountId: "123456789", fetch: impl });
    expect(new URL(calls[0]!.url).pathname).toBe("/v26.0/act_123456789/customaudiences");
    expect(result.audiences).toHaveLength(2);
    expect((result.audiences as Array<{ subtype: string }>)[0]!.subtype).toBe("WEBSITE");
    expect(result.nextCursor).toBe("AFTERAUD");
  });

  test("get + create", async () => {
    const g = stubFetch(audienceGet);
    const got = await getCustomAudience({ ...auth, audienceId: "23851234567890678", fetch: g.impl });
    expect(got.audience).toMatchObject({ name: "Website visitors 30d", subtype: "WEBSITE" });

    const c = stubFetch(audienceCreated);
    const created = await createCustomAudience({
      ...auth,
      adAccountId: "act_123456789",
      name: "Lookalike seed",
      subtype: "CUSTOM",
      customerFileSource: "USER_PROVIDED_ONLY",
      fetch: c.impl,
    });
    const params = new URLSearchParams(await c.calls[0]!.text());
    expect(params.get("subtype")).toBe("CUSTOM");
    expect(params.get("customer_file_source")).toBe("USER_PROVIDED_ONLY");
    expect(created.id).toBe("23851234567890680");
  });
});

describe("insights.async + reach_estimate", () => {
  test("async.create POSTs async=true and returns reportRunId", async () => {
    const { calls, impl } = stubFetch(asyncCreated);
    const result = await createAsyncInsights({
      ...auth,
      objectId: "23851234567890123",
      datePreset: "last_30d",
      fields: "impressions,spend",
      fetch: impl,
    });
    expect(new URL(calls[0]!.url).pathname).toBe("/v26.0/23851234567890123/insights");
    const params = new URLSearchParams(await calls[0]!.text());
    expect(params.get("async")).toBe("true");
    expect(params.get("date_preset")).toBe("last_30d");
    expect(result.reportRunId).toBe("23851234567890789");
  });

  test("async.get polls AdReportRun", async () => {
    const { calls, impl } = stubFetch(asyncGet);
    const result = await getAsyncInsights({ ...auth, reportRunId: "23851234567890789", fetch: impl });
    expect(new URL(calls[0]!.url).pathname).toBe("/v26.0/23851234567890789");
    expect(result.reportRun).toMatchObject({
      asyncStatus: "Job Completed",
      asyncPercentCompletion: 100,
    });
  });

  test("reach_estimate.get uses targeting_spec and users_* bounds (not delivery-estimate fields)", async () => {
    const { calls, impl } = stubFetch(reachEstimate);
    const result = await getReachEstimate({
      ...auth,
      adAccountId: "123456789",
      targetingSpec: { geo_locations: { countries: ["US"] }, age_min: 20, age_max: 40 },
      fetch: impl,
    });
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe("/v26.0/act_123456789/reachestimate");
    expect(JSON.parse(url.searchParams.get("targeting_spec")!)).toEqual({
      geo_locations: { countries: ["US"] },
      age_min: 20,
      age_max: 40,
    });
    expect(result.usersLowerBound).toBe(2400000);
    expect(result.usersUpperBound).toBe(2800000);
    expect(url.searchParams.get("daily_outcomes_curve")).toBeNull();
  });
});

describe("G2 Reconcile observe + ads.create fold-in", () => {
  test("creative update mutables are a subset of CREATIVE_GET_FIELDS", () => {
    const creativeWire = { name: "name", status: "status" };
    for (const wire of Object.values(creativeWire)) {
      expect(CREATIVE_GET_FIELDS.split(",")).toContain(wire);
    }
  });

  test("ad_creatives.get observe ignores fields on update-shaped input", async () => {
    const { calls, impl } = stubFetch(creativeGet);
    await getAdCreative({
      ...auth,
      creativeId: "23851234567890456",
      name: "Hero Photo v2",
      status: "ACTIVE",
      fields: "id,name",
      fetch: impl,
    });
    expect(new URL(calls[0]!.url).searchParams.get("fields")).toBe(CREATIVE_GET_FIELDS);
    expect(
      resolveObserveFields(
        { creativeId: "1", accessToken: "t", name: "x", fields: "id" },
        CREATIVE_GET_FIELDS,
        ["creativeId"],
      ),
    ).toBe(CREATIVE_GET_FIELDS);
  });

  test("ads.create fold-in: no bid_amount on the wire", async () => {
    const { calls, impl } = stubFetch(adCreated);
    await createAd({
      ...auth,
      adAccountId: "123456789",
      name: "Carousel A",
      adsetId: "23851234567890234",
      creative: { creative_id: "23851234567890456" },
      // @ts-expect-error fold-in removed bidAmount from the op; ensure code ignores smuggled value
      bidAmount: 100,
      fetch: impl,
    });
    const params = new URLSearchParams(await calls[0]!.text());
    expect(params.get("bid_amount")).toBeNull();
  });
});
