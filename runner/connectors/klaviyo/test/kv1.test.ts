import { describe, expect, it } from "bun:test";
import { createEvent, getEvent, listEvents, createCampaign, getCampaign, getProfile, updateProfile } from "../src/actions";
import { createKlaviyoClient } from "../src/http";
import getProfileFixture from "../fixtures/get_profile.json";
import { normalizeCampaign } from "../src/objects";
import { normalizeEvent } from "../src/events_actions";
import getEventFixture from "../fixtures/get_event.json";
import eventsListFixture from "../fixtures/events_list.json";
import getCampaignFixture from "../fixtures/get_campaign.json";
import createCampaignFixture from "../fixtures/create_campaign.json";

type Captured = { url: string; init?: RequestInit };

function capturing(status: number, body: unknown, sink: Captured[]): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
    sink.push({ url, init });
    return new Response(body === null ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}
const sentBody = (c: Captured) => JSON.parse(String(c.init?.body));
const query = (c: Captured) => new URL(c.url).searchParams;

describe("KV-1 events.create profile identifiers", () => {
  it("puts the profile id at profile.data.id and keeps email in profile.data.attributes", async () => {
    const calls: Captured[] = [];
    const result = await createEvent({ apiKey: "k", metricName: "Placed Order", profileEmail: "a@b.co", profileId: "PRO1", value: 12.5, fetch: capturing(202, null, calls) });
    const profile = sentBody(calls[0]).data.attributes.profile;
    expect(profile).toEqual({ data: { type: "profile", id: "PRO1", attributes: { email: "a@b.co" } } });
    expect(profile.data.attributes.id).toBeUndefined();
    expect((result as any).event.metricName).toBe("Placed Order");
    expect((result as any).event.profileEmail).toBe("a@b.co");
    expect((result as any).event.value).toBe(12.5);
  });

  it("omits profile.data.id when no profileId is given", async () => {
    const calls: Captured[] = [];
    await createEvent({ apiKey: "k", metricName: "M", profileEmail: "a@b.co", fetch: capturing(202, null, calls) });
    expect(sentBody(calls[0]).data.attributes.profile).toEqual({ data: { type: "profile", attributes: { email: "a@b.co" } } });
  });
});

describe("KV-1 normalizeCampaign real shapes", () => {
  const campaign = { type: "campaign", id: "c9", attributes: { name: "N", status: "Draft", created_at: "2026-07-01T00:00:00+00:00", channel: "bogus", created: "bogus" } };

  it("reads createdAt from created_at and channel from included via relationships.campaign-messages", () => {
    const d = { ...campaign, relationships: { "campaign-messages": { data: [{ type: "campaign-message", id: "m9" }] } } };
    const included = [{ type: "campaign-message", id: "m9", attributes: { definition: { channel: "sms" } } }];
    const n = normalizeCampaign(d, included);
    expect(n.createdAt).toBe("2026-07-01T00:00:00+00:00");
    expect(n.channelId).toBe("sms");
  });

  it("reads channel from an included message whose relationships.campaign points at the campaign", () => {
    const included = [
      { type: "campaign-message", id: "other", attributes: { definition: { channel: "email" } }, relationships: { campaign: { data: { type: "campaign", id: "c0" } } } },
      { type: "campaign-message", id: "mine", attributes: { definition: { channel: "mobile_push" } }, relationships: { campaign: { data: { type: "campaign", id: "c9" } } } },
    ];
    expect(normalizeCampaign(campaign, included).channelId).toBe("mobile_push");
  });

  it("returns empty channel (never attributes.channel) when no message data is available", () => {
    const n = normalizeCampaign(campaign);
    expect(n.channelId).toBe("");
    expect(n.createdAt).toBe("2026-07-01T00:00:00+00:00");
  });

  it("campaigns.get requests include=campaign-messages with a definition.channel fieldset and maps the channel", async () => {
    const calls: Captured[] = [];
    const result = await getCampaign({ apiKey: "k", campaignId: "camp1", fetch: capturing(200, getCampaignFixture, calls) });
    expect(query(calls[0]).get("include")).toBe("campaign-messages");
    expect(query(calls[0]).get("fields[campaign-message]")).toBe("definition.channel");
    expect((result as any).campaign.channelId).toBe("email");
    expect((result as any).campaign.createdAt).toBe("2024-06-01T10:00:00Z");
  });
});

describe("KV-1 normalizeEvent real shapes", () => {
  it("resolves metric and profile through relationships + included and value from event_properties.$value", () => {
    const n = normalizeEvent(getEventFixture.data as Record<string, unknown>, getEventFixture.included);
    expect(n.metricName).toBe("Placed Order");
    expect(n.profileEmail).toBe("buyer@example.com");
    expect(n.value).toBe(49.99);
    expect(n.time).toBe("2024-08-01T14:00:00+00:00");
  });

  it("ignores non-spec attributes.metric/profile/value and accepts a numeric-string $value", () => {
    const d = { type: "event", id: "e2", attributes: { metric: { name: "X" }, profile: { email: "x@y" }, value: 99, event_properties: { $value: "7.5" } } };
    const n = normalizeEvent(d);
    expect(n.metricName).toBe("");
    expect(n.profileEmail).toBe("");
    expect(n.value).toBe(7.5);
  });

  it("events.get and events.list request include=metric,profile with sparse fieldsets", async () => {
    const calls: Captured[] = [];
    const got = await getEvent({ apiKey: "k", eventId: "evt1", fetch: capturing(200, getEventFixture, calls) });
    const listed = await listEvents({ apiKey: "k", fetch: capturing(200, eventsListFixture, calls) });
    for (const c of calls) {
      expect(query(c).get("include")).toBe("metric,profile");
      expect(query(c).get("fields[metric]")).toBe("name");
      expect(query(c).get("fields[profile]")).toBe("email");
    }
    expect((got as any).event.profileEmail).toBe("buyer@example.com");
    expect((listed as any).events[0].value).toBe(49.99);
  });
});

describe("KV-1 campaigns.create body input", () => {
  it("SMS with body sends definition.content.body", async () => {
    const calls: Captured[] = [];
    await createCampaign({ apiKey: "k", name: "S", channel: "sms", body: "Sale today", listId: "L1", fetch: capturing(201, createCampaignFixture, calls) });
    const def = sentBody(calls[0]).data.attributes["campaign-messages"].data[0].attributes.definition;
    expect(def).toEqual({ channel: "sms", content: { body: "Sale today" } });
  });

  it("SMS without body throws a validation error with zero fetch calls", async () => {
    const calls: Captured[] = [];
    await expect(createCampaign({ listId: "L1", apiKey: "k", name: "S", channel: "sms", fetch: capturing(201, createCampaignFixture, calls) })).rejects.toThrow("body is required when channel is 'sms'");
    expect(calls).toHaveLength(0);
  });

  it("email is unchanged (body is not sent for email)", async () => {
    const calls: Captured[] = [];
    const result = await createCampaign({ listId: "L1", apiKey: "k", name: "E", channel: "email", subject: "Hi", body: "ignored", fetch: capturing(201, createCampaignFixture, calls) });
    expect(sentBody(calls[0])).toEqual({ data: { type: "campaign", attributes: { name: "E", audiences: { included: ["L1"] }, "campaign-messages": { data: [{ type: "campaign-message", attributes: { definition: { channel: "email", content: { subject: "Hi" } } } }] } } } });
    expect((result as any).campaign.channelId).toBe("email");
  });
});

describe("KV-1 campaigns.create requires listId", () => {
  it("throws a validation error before any HTTP call when listId is missing", async () => {
    const calls: Captured[] = [];
    await expect(createCampaign({ apiKey: "k", name: "E", channel: "email", fetch: capturing(201, createCampaignFixture, calls) }))
      .rejects.toThrow("listId is required");
    expect(calls).toHaveLength(0);
  });

  it("throws on the no-apiKey validate path too", async () => {
    await expect(createCampaign({ name: "E", channel: "email" })).rejects.toThrow("listId is required");
  });

  it("raw data passthrough without listId is sent verbatim", async () => {
    const calls: Captured[] = [];
    const data = { type: "campaign", attributes: { name: "Raw" } };
    await createCampaign({ apiKey: "k", data, fetch: capturing(201, createCampaignFixture, calls) });
    expect(calls).toHaveLength(1);
    expect(sentBody(calls[0])).toEqual({ data });
  });
});

describe("KV-1 http.ts JSON:API headers", () => {
  const h = (c: Captured) => (c.init?.headers ?? {}) as Record<string, string>;

  it("a caller-supplied revision in init.headers is overridden with 2026-07-15 on the wire", async () => {
    const calls: Captured[] = [];
    const client = createKlaviyoClient({ apiKey: "k", fetch: capturing(200, getProfileFixture, calls) });
    await client.fetchJSON("/profiles/p1", { headers: { revision: "2024-10-15", Revision: "2023-01-01", "X-Trace": "t1" } });
    const headers = h(calls[0]);
    const revisions = Object.entries(headers).filter(([k]) => k.toLowerCase() === "revision");
    expect(revisions).toEqual([["revision", "2026-07-15"]]);
    expect(headers["X-Trace"]).toBe("t1");
  });

  it("requests with a body send Content-Type application/vnd.api+json (caller override ignored)", async () => {
    const calls: Captured[] = [];
    await updateProfile({ apiKey: "k", profileId: "p1", firstName: "A", fetch: capturing(200, getProfileFixture, calls) });
    const client = createKlaviyoClient({ apiKey: "k", fetch: capturing(200, {}, calls) });
    await client.fetchJSON("/events", { method: "POST", body: "{}", headers: { "content-type": "text/plain" } });
    for (const c of calls) {
      const ct = Object.entries(h(c)).filter(([k]) => k.toLowerCase() === "content-type");
      expect(ct).toEqual([["Content-Type", "application/vnd.api+json"]]);
      expect(h(c).accept).toBe("application/vnd.api+json");
    }
  });

  it("bodyless GETs send accept application/vnd.api+json and no Content-Type", async () => {
    const calls: Captured[] = [];
    await getProfile({ apiKey: "k", profileId: "p1", fetch: capturing(200, getProfileFixture, calls) });
    const headers = h(calls[0]);
    expect(headers.accept).toBe("application/vnd.api+json");
    expect(Object.keys(headers).some((k) => k.toLowerCase() === "content-type")).toBe(false);
    expect(headers.revision).toBe("2026-07-15");
    expect(headers.Authorization).toBe("Klaviyo-API-Key k");
  });
});
