// PR #641 review follow-ups: creative_assets.list paging, and input schemas
// that document the cross-field rules the handlers enforce.
import { describe, expect, it } from "bun:test";
import manifest from "../manifest.json";
import { validateStrictInput } from "../../../bun/src/declarative/strict-schema";
import { createCampaign } from "../src/g1-actions";
import { executeCreativeAssetsListSync } from "../src/sync";

const ops = manifest.operations as unknown as Record<string, { inputSchema: any }>;
const accepts = (op: string, input: Record<string, unknown>) => {
  try { validateStrictInput(input, ops[op]!.inputSchema); return true; } catch { return false; }
};
const usd = { amount: "50", currencyCode: "USD" };
const campaign = {
  accountId: "1", campaignGroup: "2", name: "C", type: "SPONSORED_UPDATES", costType: "CPM", unitCost: usd,
  locale: { country: "US", language: "en" }, status: "DRAFT", offsiteDeliveryEnabled: false, politicalIntent: "NOT_POLITICAL",
  dailyBudget: usd, associatedEntity: "urn:li:organization:7",
  targetingCriteria: { include: { and: [{ or: { "urn:li:adTargetingFacet:interfaceLocales": ["urn:li:locale:en_US"] } }] } },
};

describe("PR #641 review", () => {
  it("creative_assets.list forwards pageToken", async () => {
    let url = "";
    await executeCreativeAssetsListSync({
      accessToken: "fixture-access-value", accountId: "5", pageToken: "abc_DEF-1",
      fetch: ((input: RequestInfo | URL) => { url = String(input); return Promise.resolve(new Response(JSON.stringify({ elements: [], metadata: {} }), { status: 200 })); }) as never,
    } as never);
    expect(new URL(url).searchParams.get("pageToken")).toBe("abc_DEF-1");
    expect(accepts("creative_assets.list", { accountId: "5", pageToken: "x" })).toBe(true);
  });

  it("campaigns.create requires associatedEntity where LinkedIn does (CAM schema)", () => {
    const { associatedEntity: _a, ...noEntity } = campaign;
    expect(() => createCampaign(noEntity)).toThrow("associatedEntity is required");
    expect(() => createCampaign({ ...noEntity, type: "DYNAMIC" })).toThrow("associatedEntity is required");
    expect(() => createCampaign({ ...noEntity, type: "TEXT_AD", objectiveType: "LEAD_GENERATION" })).toThrow("associatedEntity is required");
    expect((createCampaign({ ...noEntity, type: "TEXT_AD" }) as any).validated.type).toBe("TEXT_AD");
  });

  it("schemas document the cross-field rules the handlers enforce (inputs stay union-free)", () => {
    const p = (op: string) => ops[op]!.inputSchema;
    expect(p("campaign_groups.create").properties.totalBudget.description).toContain("runSchedule.end");
    expect(p("campaigns.create").properties.dailyBudget.description).toContain("at least one is required");
    expect(p("campaigns.create").properties.associatedEntity.description).toContain("SPONSORED_UPDATES");
    for (const op of ["campaign_groups.update", "campaigns.update", "creatives.update"]) expect(p(op).description).toContain("at least one field");
  });
});
