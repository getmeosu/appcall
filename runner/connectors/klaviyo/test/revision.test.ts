import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { REVISION } from "../src/revision";
import { getProfile, createCampaign } from "../src/actions";
import { healthcheck } from "../src/healthcheck";
import getProfileFixture from "../fixtures/get_profile.json";
import createCampaignFixture from "../fixtures/create_campaign.json";

type Captured = { url: string; init?: RequestInit };

function capturing(status: number, body: unknown, sink: Captured[]): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
    sink.push({ url, init });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}

function header(init: RequestInit | undefined, name: string): string | undefined {
  return ((init?.headers ?? {}) as Record<string, string>)[name];
}

describe("klaviyo KV-0 revision pin", () => {
  it("REVISION constant is 2026-07-15", () => {
    expect(REVISION).toBe("2026-07-15");
  });

  it("legacy op profiles.get (via http.ts) sends revision 2026-07-15", async () => {
    const calls: Captured[] = [];
    await getProfile({ apiKey: "k", profileId: "p1", fetch: capturing(200, getProfileFixture, calls) });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("https://a.klaviyo.com/api/profiles/p1");
    expect(header(calls[0].init, "revision")).toBe("2026-07-15");
    expect(header(calls[0].init, "Authorization")).toBe("Klaviyo-API-Key k");
  });

  it("healthcheck sends revision 2026-07-15", async () => {
    const calls: Captured[] = [];
    const result = await healthcheck({ apiKey: "hc", fetch: capturing(200, { data: [] }, calls) });
    expect(result).toEqual({ connector: "klaviyo", status: "ok", source: "provider" });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://a.klaviyo.com/api/lists?page%5Bsize%5D=1");
    expect(header(calls[0].init, "revision")).toBe("2026-07-15");
  });

  it("no other revision literal remains in klaviyo src", () => {
    const dir = join(import.meta.dir, "../src");
    for (const file of readdirSync(dir)) {
      const text = readFileSync(join(dir, file), "utf8");
      const literals = text.match(/revision\s*[:=]\s*["'`]\d{4}-\d{2}-\d{2}/gi) ?? [];
      const consts = text.match(/REVISION\s*=\s*["']\d{4}-\d{2}-\d{2}["']/g) ?? [];
      if (file === "revision.ts") expect(consts).toHaveLength(1);
      else {
        expect(literals).toEqual([]);
        expect(consts).toEqual([]);
      }
    }
  });
});

describe("klaviyo KV-0 campaigns.create body (revision 2026-07-15 shape)", () => {
  it("nests channel and content under campaign-messages definition", async () => {
    const calls: Captured[] = [];
    await createCampaign({
      apiKey: "k", name: "Fall", channel: "email", listId: "L1", sendTime: "2026-11-01T10:00:00Z",
      subject: "Hi", fromEmail: "a@b.co", fromLabel: "Acme", fetch: capturing(201, createCampaignFixture, calls),
    });
    const body = JSON.parse(String(calls[0].init?.body));
    expect(body).toEqual({
      data: {
        type: "campaign",
        attributes: {
          name: "Fall",
          audiences: { included: ["L1"] },
          send_strategy: { method: "static", datetime: "2026-11-01T10:00:00Z" },
          "campaign-messages": {
            data: [{ type: "campaign-message", attributes: { definition: { channel: "email", content: { subject: "Hi", from_email: "a@b.co", from_label: "Acme" } } } }],
          },
        },
      },
    });
    expect(header(calls[0].init, "revision")).toBe("2026-07-15");
  });

  it("sends no retired 2024-10-15 keys (campaign_messages, top-level channel/send_time, relationships)", async () => {
    const calls: Captured[] = [];
    await createCampaign({ apiKey: "k", name: "S", channel: "sms", body: "Hi", listId: "L2", fetch: capturing(201, createCampaignFixture, calls) });
    const body = JSON.parse(String(calls[0].init?.body));
    const attrs = body.data.attributes;
    expect(attrs.campaign_messages).toBeUndefined();
    expect(attrs.channel).toBeUndefined();
    expect(attrs.send_time).toBeUndefined();
    expect(body.data.relationships).toBeUndefined();
    expect(attrs["campaign-messages"].data[0].attributes.definition.channel).toBe("sms");
    expect(attrs.audiences).toEqual({ included: ["L2"] });
  });

  it("raw data passthrough is sent verbatim", async () => {
    const calls: Captured[] = [];
    const data = { type: "campaign", attributes: { name: "Raw" } };
    await createCampaign({ apiKey: "k", data, fetch: capturing(201, createCampaignFixture, calls) });
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ data });
  });
});
