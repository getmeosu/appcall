import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import mapping from "../fixtures/composio-mapping.json";

const recipePath = "scripts/connector-gen/openconnector/recipes/polygon_io/recipe.json";
const operations = manifest.operations as Record<string, Record<string, unknown>>;
const addedOps = [
  "economy.labor-market.list",
  "stocks.dividends.v1.list",
  "stocks.filings.risk-factors.list",
  "stocks.income-statements.list",
  "stocks.splits.v1.list",
];

// ops the pinned recipe has real provenance for
const PINNED_OPS = [
  "aggs.grouped",
  "aggs.prev",
  "aggs.range",
  "conditions.list",
  "crypto.aggs.grouped",
  "crypto.aggs.prev",
  "crypto.aggs.range",
  "crypto.ema.get",
  "crypto.exchanges.list",
  "crypto.last-trade.get",
  "crypto.macd.get",
  "crypto.open-close.get",
  "crypto.rsi.get",
  "crypto.sma.get",
  "crypto.snapshot.all",
  "crypto.trades.list",
  "dividends.list",
  "economy.inflation-expectations.list",
  "economy.inflation.list",
  "economy.treasury-yields.list",
  "ema.get",
  "exchanges.list",
  "filing-file.get",
  "filing-files.list",
  "filing.get",
  "filings.10k-sections.list",
  "filings.list",
  "financials.list",
  "forex.aggs.grouped",
  "forex.aggs.prev",
  "forex.aggs.range",
  "forex.conversion.get",
  "forex.ema.get",
  "forex.historic-ticks.get",
  "forex.last-quote.get",
  "forex.macd.get",
  "forex.quotes.list",
  "forex.rsi.get",
  "forex.sma.get",
  "forex.snapshot.losers",
  "futures.aggs.list",
  "futures.products.list",
  "futures.quotes.list",
  "futures.schedules.list",
  "futures.trades.list",
  "healthcheck",
  "ipos.list",
  "last-quote.get",
  "macd.get",
  "market-status.get",
  "market-status.upcoming",
  "news.list",
  "open-close.get",
  "options.aggs.range",
  "options.chain.snapshot",
  "options.contract.get",
  "options.contracts.list",
  "options.ema.get",
  "options.macd.get",
  "options.rsi.get",
  "options.sma.get",
  "options.snapshot.get",
  "related-companies.get",
  "rsi.get",
  "sma.get",
  "snapshot.all",
  "snapshot.losers",
  "snapshot.ticker",
  "splits.list",
  "stocks.balance-sheets.list",
  "stocks.cash-flow-statements.list",
  "stocks.float.list",
  "stocks.short-interest.list",
  "stocks.short-volume.list",
  "taxonomies.risk-factors.list",
  "ticker-events.list",
  "ticker-types.list",
  "ticker.get",
  "tickers.list"
];

describe("polygon-io manifest", () => {
  it("keeps the connector identity and bumps the deepened version", () => {
    expect(manifest.key).toBe("polygon-io");
    expect(manifest.version).toBe("0.2.1");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.name).toBe("Massive (Polygon.io)");
    expect(manifest.categories).toEqual(["banking-data"]);
  });

  it("still authenticates with an apiKey query parameter on api.massive.com", () => {
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.http.auth.field).toBe("apiKey");
    expect(manifest.http.auth.in).toBe("query");
    expect(manifest.http.auth.name).toBe("apiKey");
    expect(manifest.http.auth.value).toBe("{{apiKey}}");
    expect(manifest.http.baseUrl).toBe("https://api.massive.com");
    expect(manifest.network.allowedHosts).toEqual(["api.massive.com"]);
  });

  it("exposes every action as a real HTTP tool with title, description, and object inputSchema", () => {
    const keys = Object.keys(operations);
    expect(keys.length).toBe(84);
    expect(keys).toContain("healthcheck");
    expect(keys).toContain("tickers.list");
    expect(keys).toContain("aggs.range");
    expect(keys).toContain("crypto.aggs.range");
    expect(keys).toContain("filings.list");
    for (const [key, operation] of Object.entries(operations)) {
      expect(operation.kind, key).toBe("action");
      expect(String(operation.title ?? "").length, key).toBeGreaterThan(0);
      expect(String(operation.description ?? "").length, key).toBeGreaterThan(0);
      expect((operation.inputSchema as { type?: string }).type, key).toBe("object");
      expect(operation.request, `${key} must declare a request block`).toBeDefined();
      expect((operation.request as { path?: string }).path, key).toBeDefined();
      expect(["read", "write", "destructive"]).toContain(operation.sideEffect as string);
      if (operation.kind === "webhook") {
        expect(operation.sideEffect).toBe("read");
      }
    }
  });

  it("classifies every GET as read", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const method = String((operation.request as { method?: string }).method);
      expect(method, key).toBe("GET");
      expect(operation.sideEffect, key).toBe("read");
    }
  });

  it("only interpolates path placeholders the schema requires", () => {
    for (const [key, operation] of Object.entries(operations)) {
      const request = operation.request as { path?: string };
      const schema = operation.inputSchema as { required?: string[] };
      const placeholders = [...String(request.path ?? "").matchAll(/\{\{\s*([A-Za-z0-9_.$-]+)\s*\}\}/g)].map(
        (match) => match[1],
      );
      for (const placeholder of placeholders) {
        expect(schema.required ?? [], `${key} path uses {{${placeholder}}}`).toContain(placeholder);
      }
    }
  });

  it("compiles every operation into a handler", () => {
    const compiled = compileDeclarativeConnector(manifest as never);
    expect(Object.keys(compiled.actions).sort()).toEqual(Object.keys(operations).sort());
  });

  it("mirrors the five deepened reads in the recipe and keeps provenance mappings pinned", () => {
    expect(existsSync(recipePath)).toBe(true);
    const recipe = JSON.parse(readFileSync(recipePath, "utf8")) as {
      selection: { operations: string[] };
      operationSources: Record<string, unknown>;
      manifest: { operations: Record<string, unknown>; version: string };
    };
    const runnerOps = Object.keys(operations).sort();
    const recipeOps = Object.keys(recipe.manifest.operations).sort();
    expect(recipe.manifest.version).toBe("0.2.0");
    expect(runnerOps).toEqual(recipeOps);
    expect([...recipe.selection.operations].sort()).toEqual(PINNED_OPS);
    expect(Object.keys(recipe.operationSources).sort()).toEqual(PINNED_OPS);
    const absentFromRecipe = runnerOps.filter((key) => !Object.hasOwn(recipe.operationSources, key));
    expect(absentFromRecipe).toEqual(addedOps);
    for (const key of recipeOps) {
      expect(operations[key], key).toEqual(recipe.manifest.operations[key]);
    }
  });

  it("adds five body-less Massive reads without replacing v3 dividends, splits, or taxonomy risk factors", () => {
    const inflation = operations["economy.inflation.list"]!;
    const sections = operations["filings.10k-sections.list"]!;
    const balance = operations["stocks.balance-sheets.list"]!;
    const dividends = operations["dividends.list"]!;
    const splits = operations["splits.list"]!;
    expect((dividends.request as { path: string }).path).toBe("/v3/reference/dividends");
    expect((splits.request as { path: string }).path).toBe("/v3/reference/splits");
    expect((operations["taxonomies.risk-factors.list"]!.request as { path: string }).path).toBe(
      "/stocks/taxonomies/vX/risk-factors",
    );

    const specs: {
      key: string;
      sibling: Record<string, unknown>;
      path: string;
      query: Record<string, string>;
      limitMax: number;
    }[] = [
      {
        key: "economy.labor-market.list",
        sibling: inflation,
        path: "/fed/v1/labor-market",
        query: { date: "{{date}}", sort: "{{sort}}", limit: "{{limit}}" },
        limitMax: 50000,
      },
      {
        key: "stocks.filings.risk-factors.list",
        sibling: sections,
        path: "/stocks/filings/vX/risk-factors",
        query: {
          ticker: "{{ticker}}",
          cik: "{{cik}}",
          filing_date: "{{filingDate}}",
          sort: "{{sort}}",
          limit: "{{limit}}",
        },
        limitMax: 50000,
      },
      {
        key: "stocks.income-statements.list",
        sibling: balance,
        path: "/stocks/financials/v1/income-statements",
        query: {
          cik: "{{cik}}",
          tickers: "{{tickers}}",
          timeframe: "{{timeframe}}",
          fiscal_year: "{{fiscalYear}}",
          fiscal_quarter: "{{fiscalQuarter}}",
          period_end: "{{periodEnd}}",
          "period_end.gt": "{{periodEndGt}}",
          "period_end.gte": "{{periodEndGte}}",
          "period_end.lt": "{{periodEndLt}}",
          "period_end.lte": "{{periodEndLte}}",
          filing_date: "{{filingDate}}",
          "filing_date.gt": "{{filingDateGt}}",
          "filing_date.gte": "{{filingDateGte}}",
          "filing_date.lt": "{{filingDateLt}}",
          "filing_date.lte": "{{filingDateLte}}",
          sort: "{{sort}}",
          limit: "{{limit}}",
        },
        limitMax: 50000,
      },
      {
        key: "stocks.dividends.v1.list",
        sibling: dividends,
        path: "/stocks/v1/dividends",
        query: {
          ticker: "{{ticker}}",
          ex_dividend_date: "{{exDividendDate}}",
          frequency: "{{frequency}}",
          distribution_type: "{{distributionType}}",
          sort: "{{sort}}",
          limit: "{{limit}}",
        },
        limitMax: 5000,
      },
      {
        key: "stocks.splits.v1.list",
        sibling: splits,
        path: "/stocks/v1/splits",
        query: {
          ticker: "{{ticker}}",
          execution_date: "{{executionDate}}",
          adjustment_type: "{{adjustmentType}}",
          sort: "{{sort}}",
          limit: "{{limit}}",
        },
        limitMax: 5000,
      },
    ];

    for (const spec of specs) {
      const operation = operations[spec.key]!;
      expect(operation.sideEffect, spec.key).toBe("read");
      expect(operation.timeoutMs, spec.key).toBe(spec.sibling.timeoutMs);
      expect(operation.maxInputBytes, spec.key).toBe(spec.sibling.maxInputBytes);
      expect(operation.maxResponseBytes, spec.key).toBe(spec.sibling.maxResponseBytes);
      expect(operation.outputSchema, spec.key).toEqual(spec.sibling.outputSchema);
      expect(operation.responseFormat, spec.key).toBe(spec.sibling.responseFormat);
      expect(operation.validationMode, spec.key).toBe(spec.sibling.validationMode);
      expect(operation.enforceOutputSchema, spec.key).toBe(spec.sibling.enforceOutputSchema);
      const request = operation.request as {
        method: string;
        path: string;
        baseUrl?: string;
        success: number[];
        body?: unknown;
        headers?: Record<string, string>;
        query: Record<string, string>;
      };
      expect(request.method, spec.key).toBe("GET");
      expect(request.path, spec.key).toBe(spec.path);
      expect(request.success, spec.key).toEqual([200]);
      expect(request.query, spec.key).toEqual(spec.query);
      expect(request.baseUrl, spec.key).toBeUndefined();
      expect(request.body, spec.key).toBeUndefined();
      expect(request.headers, spec.key).toBeUndefined();
      const schema = operation.inputSchema as {
        type: string;
        additionalProperties: boolean;
        required?: string[];
        properties: Record<string, { type?: string; minimum?: number; maximum?: number }>;
      };
      expect(schema.type, spec.key).toBe("object");
      expect(schema.additionalProperties, spec.key).toBe(false);
      expect(schema.required, spec.key).toBeUndefined();
      expect(schema.properties.limit, spec.key).toEqual({ type: "integer", minimum: 1, maximum: spec.limitMax });
    }

    const income = operations["stocks.income-statements.list"]!.inputSchema as {
      properties: Record<string, { type?: string }>;
    };
    expect(income.properties.tickers.type).toBe("string");
    expect(income.properties.fiscalYear.type).toBe("integer");
    expect(income.properties.fiscalQuarter.type).toBe("integer");
    for (const absent of ["sic", "ticker", "companyName", "companyNameSearch", "includeSources"]) {
      expect(income.properties[absent], absent).toBeUndefined();
    }
    const v1Dividends = operations["stocks.dividends.v1.list"]!.inputSchema as {
      properties: Record<string, { type?: string }>;
    };
    expect(v1Dividends.properties.frequency.type).toBe("integer");
  });

  it("accounts for every Composio Polygon tool that still has a Massive HTTP endpoint", () => {
    expect(mapping.composio_tools).toBe(90);
    expect(mapping.mapped.length).toBe(92);
    expect(mapping.unmapped_composio.map((row: { composio: string }) => row.composio).sort()).toEqual([
      "POLYGON_GET_CRYPTO_TICKER_BOOK",
      "POLYGON_GET_FOREX_LOCALES",
      "POLYGON_GET_REFERENCE_MARKETS",
    ]);
    for (const row of mapping.mapped as { composio: string; operation: string }[]) {
      expect(operations[row.operation], row.composio).toBeDefined();
    }
  });
});
