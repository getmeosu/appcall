import { describe, expect, it } from "bun:test";
import manifest from "../manifest.json";

const expected = [
  "commodities.all",
  "commodities.aluminum",
  "commodities.brent",
  "commodities.coffee",
  "commodities.copper",
  "commodities.corn",
  "commodities.cotton",
  "commodities.sugar",
  "commodities.wheat",
  "crypto.daily",
  "crypto.intraday",
  "crypto.monthly",
  "crypto.weekly",
  "economy.cpi",
  "economy.durables",
  "economy.federal_funds_rate",
  "economy.inflation",
  "economy.nonfarm_payroll",
  "economy.real_gdp",
  "economy.real_gdp_per_capita",
  "economy.retail_sales",
  "economy.treasury_yield",
  "economy.unemployment",
  "fundamentals.balance_sheet",
  "fundamentals.cash_flow",
  "fundamentals.dividends",
  "fundamentals.earnings",
  "fundamentals.earnings_calendar",
  "fundamentals.income_statement",
  "fundamentals.ipo_calendar",
  "fundamentals.overview",
  "fundamentals.splits",
  "fx.daily",
  "fx.exchange_rate",
  "fx.intraday",
  "fx.monthly",
  "fx.weekly",
  "healthcheck",
  "intelligence.analytics_sliding_window",
  "intelligence.news_sentiment",
  "intelligence.transcript",
  "market.movers",
  "market.sector",
  "market.status",
  "options.historical",
  "quote.bulk",
  "quote.get",
  "series.daily",
  "series.intraday",
  "series.intraday_extended",
  "series.monthly",
  "series.monthly_adjusted",
  "series.weekly",
  "series.weekly_adjusted",
  "symbols.listing_status",
  "symbols.search",
  "technical.indicator"
] as string[];

const composioOps = [
  "commodities.all",
  "commodities.aluminum",
  "commodities.brent",
  "commodities.coffee",
  "commodities.copper",
  "commodities.corn",
  "commodities.cotton",
  "commodities.sugar",
  "commodities.wheat",
  "crypto.daily",
  "crypto.intraday",
  "crypto.monthly",
  "crypto.weekly",
  "economy.cpi",
  "economy.durables",
  "economy.federal_funds_rate",
  "economy.inflation",
  "economy.nonfarm_payroll",
  "economy.real_gdp",
  "economy.real_gdp_per_capita",
  "economy.retail_sales",
  "economy.treasury_yield",
  "economy.unemployment",
  "fundamentals.balance_sheet",
  "fundamentals.cash_flow",
  "fundamentals.dividends",
  "fundamentals.earnings",
  "fundamentals.earnings_calendar",
  "fundamentals.income_statement",
  "fundamentals.ipo_calendar",
  "fundamentals.overview",
  "fundamentals.splits",
  "fx.daily",
  "fx.exchange_rate",
  "fx.intraday",
  "fx.monthly",
  "fx.weekly",
  "intelligence.analytics_sliding_window",
  "intelligence.news_sentiment",
  "intelligence.transcript",
  "market.movers",
  "market.sector",
  "market.status",
  "options.historical",
  "quote.bulk",
  "quote.get",
  "series.daily",
  "series.intraday",
  "series.intraday_extended",
  "series.monthly",
  "series.monthly_adjusted",
  "series.weekly",
  "series.weekly_adjusted",
  "symbols.listing_status",
  "symbols.search",
  "technical.indicator"
] as string[];

describe("alpha-vantage manifest", () => {
  it("has bounded public apikey contract and Composio coverage", () => {
    expect(manifest.key).toBe("alpha-vantage");
    expect(manifest.version).toBe("0.2.0");
    expect(manifest.visibility).toBe("public");
    expect(manifest.http.auth.field).toBe("apiKey");
    expect(manifest.http.auth.in).toBe("query");
    expect(manifest.http.auth.name).toBe("apikey");
    expect(manifest.network.allowedHosts).toEqual(["www.alphavantage.co"]);
    expect(manifest.http.baseUrl).toBe("https://www.alphavantage.co");
    expect(Object.keys(manifest.operations).sort()).toEqual(expected);
    expect(expected).toHaveLength(57);
    for (const toolOp of composioOps) {
      expect(manifest.operations[toolOp as keyof typeof manifest.operations]).toBeDefined();
    }
  });

  it("declares a real HTTP request, title, description, and object inputSchema on every action", () => {
    for (const [key, op] of Object.entries(manifest.operations) as Array<[string, any]>) {
      expect(op.kind).toBe("action");
      expect(op.sideEffect).toBe("read");
      expect(typeof op.title).toBe("string");
      expect(op.title.length).toBeGreaterThan(0);
      expect(typeof op.description).toBe("string");
      expect(op.description.length).toBeGreaterThan(10);
      expect(op.inputSchema.type).toBe("object");
      expect(op.inputSchema.additionalProperties).toBe(false);
      expect(op.request).toBeDefined();
      expect(op.request.method).toBe("GET");
      expect(op.request.path).toBe("/query");
      expect(op.request.query.function).toBeDefined();
      expect(op.enforceOutputSchema).toBe(true);
      expect(op.responseFormat).toBe("json");
      expect(op.validationMode).toBe("strict-generated");
    }
  });
});
