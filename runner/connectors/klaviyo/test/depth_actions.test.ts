import { describe, expect, it } from "bun:test";
import {
  deleteProfile,
  getEvent,
  listEvents,
  getCampaign,
  updateCampaign,
  sendCampaign,
  listMetrics,
  getMetric,
  listCatalogItems,
  getCatalogItem,
  listSegments,
  listTemplates,
  getTemplate,
  listFlows,
  subscribeProfiles,
} from "../src/actions";
import getEventFixture from "../fixtures/get_event.json";
import eventsListFixture from "../fixtures/events_list.json";
import getCampaignFixture from "../fixtures/get_campaign.json";
import updateCampaignFixture from "../fixtures/update_campaign.json";
import sendCampaignFixture from "../fixtures/send_campaign.json";
import metricsListFixture from "../fixtures/metrics_list.json";
import getMetricFixture from "../fixtures/get_metric.json";
import catalogItemsListFixture from "../fixtures/catalog_items_list.json";
import getCatalogItemFixture from "../fixtures/get_catalog_item.json";
import segmentsListFixture from "../fixtures/segments_list.json";
import templatesListFixture from "../fixtures/templates_list.json";
import getTemplateFixture from "../fixtures/get_template.json";
import flowsListFixture from "../fixtures/flows_list.json";
import subscribeProfilesFixture from "../fixtures/subscribe_profiles.json";

function mockFetch(status: number, body: unknown) {
  return () =>
    Promise.resolve(
      new Response(body == null ? "" : JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
    );
}

function capturingFetch(status: number, body: unknown, capture: { url?: string; method?: string; auth?: string; payload?: unknown }) {
  return (url: string, init?: RequestInit) => {
    capture.url = url;
    capture.method = init?.method ?? "GET";
    capture.auth = ((init?.headers ?? {}) as Record<string, string>)["Authorization"];
    try {
      capture.payload = init?.body ? JSON.parse(String(init.body)) : undefined;
    } catch {
      capture.payload = init?.body;
    }
    return Promise.resolve(
      new Response(body == null ? "" : JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
    );
  };
}

describe("deleteProfile action", () => {
  it("validates input without apiKey", async () => {
    const result = await deleteProfile({ profileId: "prof1" });
    expect(result.action).toBe("profiles.delete");
    expect((result as any).validated.profileId).toBe("prof1");
  });

  it("throws when profileId is missing", async () => {
    await expect(deleteProfile({})).rejects.toThrow("profileId is required");
  });

  it("deletes a profile", async () => {
    const capture: { url?: string; method?: string; auth?: string } = {};
    const result = await deleteProfile({
      apiKey: "k",
      profileId: "prof1",
      fetch: capturingFetch(204, null, capture),
    });
    expect((result as any).deleted).toBe(true);
    expect(capture.method).toBe("DELETE");
    expect(capture.url).toContain("/profiles/prof1");
    expect(capture.auth).toBe("Klaviyo-API-Key k");
  });

  it("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(deleteProfile({ apiKey: "k", profileId: "prof1", fetch: mockFetch(429, {}) }))
      .rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED" });
  });

  it("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(deleteProfile({ apiKey: "k", profileId: "missing", fetch: mockFetch(404, {}) }))
      .rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

describe("getEvent action", () => {
  it("validates input without apiKey", async () => {
    const result = await getEvent({ eventId: "evt1" });
    expect(result.action).toBe("events.get");
    expect((result as any).validated.eventId).toBe("evt1");
  });

  it("throws when eventId is missing", async () => {
    await expect(getEvent({})).rejects.toThrow("eventId is required");
  });

  it("fetches an event", async () => {
    const capture: { url?: string } = {};
    const result = await getEvent({
      apiKey: "k",
      eventId: "evt1",
      fetch: capturingFetch(200, getEventFixture, capture),
    });
    expect((result as any).event.providerEventId).toBe("evt1");
    expect((result as any).event.metricName).toBe("Placed Order");
    expect(capture.url).toContain("/events/evt1");
  });

  it("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(getEvent({ apiKey: "k", eventId: "missing", fetch: mockFetch(404, {}) }))
      .rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

describe("listEvents action", () => {
  it("validates input without apiKey", async () => {
    const result = await listEvents({});
    expect(result.action).toBe("events.list");
  });

  it("lists events", async () => {
    const capture: { url?: string; method?: string } = {};
    const result = await listEvents({
      apiKey: "k",
      fetch: capturingFetch(200, eventsListFixture, capture),
    });
    expect((result as any).events).toHaveLength(1);
    expect((result as any).events[0].metricName).toBe("Placed Order");
    expect(capture.method).toBe("GET");
    expect(capture.url).toContain("/events");
  });

  it("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(listEvents({ apiKey: "k", fetch: mockFetch(429, {}) }))
      .rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED" });
  });
});

describe("getCampaign action", () => {
  it("validates input without apiKey", async () => {
    const result = await getCampaign({ campaignId: "camp1" });
    expect(result.action).toBe("campaigns.get");
  });

  it("throws when campaignId is missing", async () => {
    await expect(getCampaign({})).rejects.toThrow("campaignId is required");
  });

  it("fetches a campaign", async () => {
    const capture: { url?: string } = {};
    const result = await getCampaign({
      apiKey: "k",
      campaignId: "camp1",
      fetch: capturingFetch(200, getCampaignFixture, capture),
    });
    expect((result as any).campaign.providerCampaignId).toBe("camp1");
    expect((result as any).campaign.name).toBe("Summer Sale 2024");
    expect(capture.url).toContain("/campaigns/camp1");
  });

  it("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(getCampaign({ apiKey: "k", campaignId: "missing", fetch: mockFetch(404, {}) }))
      .rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

describe("updateCampaign action", () => {
  it("validates input without apiKey", async () => {
    const result = await updateCampaign({ campaignId: "camp1", name: "Updated" });
    expect(result.action).toBe("campaigns.update");
    expect((result as any).validated.name).toBe("Updated");
  });

  it("throws when campaignId is missing", async () => {
    await expect(updateCampaign({ name: "X" })).rejects.toThrow("campaignId is required");
  });

  it("patches a campaign", async () => {
    const capture: { url?: string; method?: string; payload?: unknown } = {};
    const result = await updateCampaign({
      apiKey: "k",
      campaignId: "camp1",
      name: "Summer Sale 2024 (updated)",
      fetch: capturingFetch(200, updateCampaignFixture, capture),
    });
    expect((result as any).campaign.name).toBe("Summer Sale 2024 (updated)");
    expect(capture.method).toBe("PATCH");
    expect(capture.url).toContain("/campaigns/camp1");
    expect((capture.payload as any).data.attributes.name).toBe("Summer Sale 2024 (updated)");
  });

  it("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(updateCampaign({ apiKey: "k", campaignId: "camp1", fetch: mockFetch(429, {}) }))
      .rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED" });
  });
});

describe("sendCampaign action", () => {
  it("validates input without apiKey", async () => {
    const result = await sendCampaign({ campaignId: "camp1" });
    expect(result.action).toBe("campaigns.send");
  });

  it("throws when campaignId is missing", async () => {
    await expect(sendCampaign({})).rejects.toThrow("campaignId is required");
  });

  it("queues a campaign send job", async () => {
    const capture: { url?: string; method?: string; payload?: unknown } = {};
    const result = await sendCampaign({
      apiKey: "k",
      campaignId: "camp1",
      fetch: capturingFetch(202, sendCampaignFixture, capture),
    });
    expect((result as any).job.id).toBe("camp1");
    expect((result as any).job.status).toBe("queued");
    expect(capture.method).toBe("POST");
    expect(capture.url).toContain("/campaign-send-jobs");
    expect((capture.payload as any).data.id).toBe("camp1");
  });

  it("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(sendCampaign({ apiKey: "k", campaignId: "missing", fetch: mockFetch(404, {}) }))
      .rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

describe("listMetrics action", () => {
  it("validates input without apiKey", async () => {
    const result = await listMetrics({});
    expect(result.action).toBe("metrics.list");
  });

  it("lists metrics", async () => {
    const capture: { url?: string } = {};
    const result = await listMetrics({
      apiKey: "k",
      fetch: capturingFetch(200, metricsListFixture, capture),
    });
    expect((result as any).metrics[0].name).toBe("Placed Order");
    expect(capture.url).toContain("/metrics");
  });

  it("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(listMetrics({ apiKey: "k", fetch: mockFetch(429, {}) }))
      .rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED" });
  });
});

describe("getMetric action", () => {
  it("validates input without apiKey", async () => {
    const result = await getMetric({ metricId: "met1" });
    expect(result.action).toBe("metrics.get");
  });

  it("throws when metricId is missing", async () => {
    await expect(getMetric({})).rejects.toThrow("metricId is required");
  });

  it("fetches a metric", async () => {
    const capture: { url?: string } = {};
    const result = await getMetric({
      apiKey: "k",
      metricId: "met1",
      fetch: capturingFetch(200, getMetricFixture, capture),
    });
    expect((result as any).metric.providerMetricId).toBe("met1");
    expect(capture.url).toContain("/metrics/met1");
  });

  it("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(getMetric({ apiKey: "k", metricId: "missing", fetch: mockFetch(404, {}) }))
      .rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

describe("listCatalogItems action", () => {
  it("validates input without apiKey", async () => {
    const result = await listCatalogItems({});
    expect(result.action).toBe("catalog.items.list");
  });

  it("lists catalog items", async () => {
    const capture: { url?: string } = {};
    const result = await listCatalogItems({
      apiKey: "k",
      fetch: capturingFetch(200, catalogItemsListFixture, capture),
    });
    expect((result as any).items[0].title).toBe("Blue Shirt");
    expect(capture.url).toContain("/catalog-items");
  });

  it("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(listCatalogItems({ apiKey: "k", fetch: mockFetch(429, {}) }))
      .rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED" });
  });
});

describe("getCatalogItem action", () => {
  it("validates input without apiKey", async () => {
    const result = await getCatalogItem({ itemId: "$custom:::$default:::SKU-1" });
    expect(result.action).toBe("catalog.items.get");
  });

  it("throws when itemId is missing", async () => {
    await expect(getCatalogItem({})).rejects.toThrow("itemId is required");
  });

  it("fetches a catalog item and encodes the id", async () => {
    const capture: { url?: string } = {};
    const result = await getCatalogItem({
      apiKey: "k",
      itemId: "$custom:::$default:::SKU-1",
      fetch: capturingFetch(200, getCatalogItemFixture, capture),
    });
    expect((result as any).item.externalId).toBe("SKU-1");
    expect(capture.url).toContain("/catalog-items/");
    expect(capture.url).toContain(encodeURIComponent("$custom:::$default:::SKU-1"));
  });

  it("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(getCatalogItem({ apiKey: "k", itemId: "missing", fetch: mockFetch(404, {}) }))
      .rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

describe("listSegments action", () => {
  it("validates input without apiKey", async () => {
    const result = await listSegments({});
    expect(result.action).toBe("segments.list");
  });

  it("lists segments", async () => {
    const capture: { url?: string } = {};
    const result = await listSegments({
      apiKey: "k",
      fetch: capturingFetch(200, segmentsListFixture, capture),
    });
    expect((result as any).segments[0].name).toBe("High-Value Customers");
    expect(capture.url).toContain("/segments");
  });

  it("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(listSegments({ apiKey: "k", fetch: mockFetch(429, {}) }))
      .rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED" });
  });
});

describe("listTemplates action", () => {
  it("validates input without apiKey", async () => {
    const result = await listTemplates({});
    expect(result.action).toBe("templates.list");
  });

  it("lists templates", async () => {
    const capture: { url?: string } = {};
    const result = await listTemplates({
      apiKey: "k",
      fetch: capturingFetch(200, templatesListFixture, capture),
    });
    expect((result as any).templates[0].name).toBe("Welcome");
    expect(capture.url).toContain("/templates");
  });

  it("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(listTemplates({ apiKey: "k", fetch: mockFetch(429, {}) }))
      .rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED" });
  });
});

describe("getTemplate action", () => {
  it("validates input without apiKey", async () => {
    const result = await getTemplate({ templateId: "tmpl1" });
    expect(result.action).toBe("templates.get");
  });

  it("throws when templateId is missing", async () => {
    await expect(getTemplate({})).rejects.toThrow("templateId is required");
  });

  it("fetches a template", async () => {
    const capture: { url?: string } = {};
    const result = await getTemplate({
      apiKey: "k",
      templateId: "tmpl1",
      fetch: capturingFetch(200, getTemplateFixture, capture),
    });
    expect((result as any).template.name).toBe("Welcome");
    expect(capture.url).toContain("/templates/tmpl1");
  });

  it("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(getTemplate({ apiKey: "k", templateId: "missing", fetch: mockFetch(404, {}) }))
      .rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

describe("listFlows action", () => {
  it("validates input without apiKey", async () => {
    const result = await listFlows({});
    expect(result.action).toBe("flows.list");
  });

  it("lists flows", async () => {
    const capture: { url?: string } = {};
    const result = await listFlows({
      apiKey: "k",
      fetch: capturingFetch(200, flowsListFixture, capture),
    });
    expect((result as any).flows[0].name).toBe("Welcome Series");
    expect((result as any).flows[0].status).toBe("live");
    expect(capture.url).toContain("/flows");
  });

  it("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(listFlows({ apiKey: "k", fetch: mockFetch(429, {}) }))
      .rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED" });
  });
});

describe("subscribeProfiles action", () => {
  it("validates input without apiKey", async () => {
    const result = await subscribeProfiles({ email: "new@example.com", listId: "list1" });
    expect(result.action).toBe("profiles.subscribe");
    expect((result as any).validated.email).toBe("new@example.com");
  });

  it("throws when email is missing", async () => {
    await expect(subscribeProfiles({ listId: "list1" })).rejects.toThrow("email is required");
  });

  it("creates a subscription job", async () => {
    const capture: { url?: string; method?: string; payload?: unknown } = {};
    const result = await subscribeProfiles({
      apiKey: "k",
      email: "new@example.com",
      listId: "list1",
      fetch: capturingFetch(202, subscribeProfilesFixture, capture),
    });
    expect((result as any).job.id).toBe("job1");
    expect(capture.method).toBe("POST");
    expect(capture.url).toContain("/profile-subscription-bulk-create-jobs");
    expect((capture.payload as any).data.relationships.list.data.id).toBe("list1");
  });

  it("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(subscribeProfiles({ apiKey: "k", email: "a@b.com", fetch: mockFetch(429, {}) }))
      .rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED" });
  });
});
