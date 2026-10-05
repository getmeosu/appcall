import { describe, expect, it } from "bun:test";
import { createMetaClient, META_ADS_LIST_FIELDS, META_GRAPH_API_VERSION, META_GRAPH_BASE_URL } from "../src/http";
import campaignsList from "../fixtures/campaigns_list.json";
import adSetsList from "../fixtures/ad_sets_list.json";
import adsList from "../fixtures/ads_list.json";

describe("meta-ads Graph API version pin", () => {
  it("pins Graph API v26.0 (v19.0 sunset 2026-05-21)", () => {
    expect(META_GRAPH_API_VERSION).toBe("v26.0");
    expect(META_GRAPH_BASE_URL).toBe("https://graph.facebook.com/v26.0");
  });

  it("sends requests to https://graph.facebook.com/v26.0/", async () => {
    const calls: { url: string; auth: string | null }[] = [];
    const client = createMetaClient({
      accessToken: "test-token",
      fetch: (async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        calls.push({ url, auth: new Headers(init?.headers).get("authorization") });
        return new Response(JSON.stringify(campaignsList), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }) as typeof fetch,
    });

    const res = await client.fetchJSON("/act_123456789/campaigns?limit=25");
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
    const url = new URL(calls[0].url);
    expect(url.origin).toBe("https://graph.facebook.com");
    expect(url.pathname).toBe("/v26.0/act_123456789/campaigns");
    expect(url.pathname.startsWith("/v26.0/")).toBe(true);
    expect(calls[0].url).not.toContain("/v19.0/");
    expect(calls[0].auth).toBe("Bearer test-token");
  });

  it("ads.list fields request creative{...object_type...}, not creative{type}", () => {
    const creative = META_ADS_LIST_FIELDS.match(/creative\{([^}]*)\}/);
    expect(creative).not.toBeNull();
    const creativeFields = creative![1].split(",");
    expect(creativeFields).toContain("object_type");
    expect(creativeFields).toContain("name");
    expect(creativeFields).not.toContain("type");
    for (const f of ["id", "adset_id", "name", "status", "effective_status", "created_time", "updated_time"]) {
      expect(META_ADS_LIST_FIELDS.split(/,(?![^{]*\})/)).toContain(f);
    }
  });

  it("sends the ads.list fields param through to Graph", async () => {
    const calls: string[] = [];
    const client = createMetaClient({
      accessToken: "test-token",
      operation: "ads.list",
      fetch: (async (input: string | URL | Request) => {
        calls.push(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
        return new Response(JSON.stringify(adsList), { status: 200, headers: { "content-type": "application/json" } });
      }) as typeof fetch,
    });
    await client.fetchJSON(`/act_123456789/ads?fields=${encodeURIComponent(META_ADS_LIST_FIELDS)}&limit=25`);
    const fields = new URL(calls[0]).searchParams.get("fields")!;
    expect(fields).toContain("creative{id,name,object_type}");
    expect(fields).not.toContain("creative{type");
  });

  it("fixture paging.next URLs use v26.0", () => {
    for (const fixture of [campaignsList, adSetsList, adsList]) {
      const next = (fixture as { paging: { next: string } }).paging.next;
      expect(new URL(next).pathname.startsWith("/v26.0/")).toBe(true);
    }
  });
});
