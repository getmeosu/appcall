import { describe, expect, it } from "bun:test";
import { buildGoogleAdsHeaders } from "../src/http";
import { getCampaign } from "../src/actions";
import campaignGet from "../fixtures/campaign_get.json";

describe("buildGoogleAdsHeaders developer-token", () => {
  it("omits developer-token when the option is absent", () => {
    const headers = buildGoogleAdsHeaders({ accessToken: "tok" });
    expect(headers.Authorization).toBe("Bearer tok");
    expect(headers["Content-Type"]).toBe("application/json");
    expect("developer-token" in headers).toBe(false);
  });

  it("omits developer-token when the value is an empty string", () => {
    const empty = buildGoogleAdsHeaders({ accessToken: "tok", developerToken: "" });
    expect("developer-token" in empty).toBe(false);
  });

  it("sends developer-token when a non-empty token is provided", () => {
    const headers = buildGoogleAdsHeaders({
      accessToken: "tok",
      developerToken: "dev-token",
      loginCustomerId: "123-456-7890",
    });
    expect(headers["developer-token"]).toBe("dev-token");
    expect(headers["login-customer-id"]).toBe("1234567890");
  });
});

describe("live auth without developerToken", () => {
  it("takes the live path with only accessToken + customerId and does not send developer-token", async () => {
    const seen: { url: string; init?: RequestInit }[] = [];
    const fetch = (url: string | URL | Request, init?: RequestInit) => {
      seen.push({ url: String(url), init });
      return Promise.resolve(
        new Response(JSON.stringify(campaignGet), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    };
    const result = (await getCampaign({
      accessToken: "test-token",
      customerId: "1234567890",
      campaignId: "1111111111",
      fetch,
    })) as any;
    expect(result.campaign).toBeTruthy();
    expect(seen).toHaveLength(1);
    const headers = seen[0]!.init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer test-token");
    expect(Object.prototype.hasOwnProperty.call(headers, "developer-token")).toBe(false);
  });
});
