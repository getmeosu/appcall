import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import manifest from "../manifest.json";
import mapping from "../fixtures/composio-mapping.json";

const recipeCandidates = [
  "scripts/connector-gen/openconnector/recipes/alpaca/recipe.json",
];
const recipePath = recipeCandidates.find((path) => existsSync(path)) ?? recipeCandidates[0];
const operations = manifest.operations as Record<string, Record<string, unknown>>;

// ops the pinned recipe has real provenance for
const PINNED_OPS = [
  "account.activities.by_type",
  "account.activities.list",
  "account.config.get",
  "account.config.update",
  "account.portfolio.history",
  "assets.get",
  "assets.list",
  "broker.accounts.activities.list",
  "broker.accounts.cip.upload",
  "broker.accounts.configurations.update",
  "broker.accounts.pdt.get",
  "broker.accounts.portfolio.history",
  "calendar.list",
  "calendar.market",
  "clock.get",
  "data.corporate_actions.announcement",
  "data.crypto.bars.legacy",
  "data.crypto.latest.bars",
  "data.crypto.latest.orderbooks",
  "data.crypto.latest.quotes",
  "data.crypto.quotes.latest.legacy",
  "data.crypto.snapshots",
  "data.crypto.snapshots.legacy",
  "data.crypto.symbol.bars.latest",
  "data.crypto.symbol.quotes.latest",
  "data.crypto.trades.latest.legacy",
  "data.crypto.trades.legacy",
  "data.crypto.us.bars",
  "data.crypto.us.latest.bars",
  "data.crypto.us.latest.orderbooks",
  "data.crypto.us.latest.quotes",
  "data.crypto.us.latest.trades",
  "data.crypto.us.quotes",
  "data.crypto.us.snapshots",
  "data.crypto.us.trades",
  "data.crypto_perps.global.latest.bars",
  "data.crypto_perps.global.latest.pricing",
  "data.crypto_perps.global.latest.quotes",
  "data.crypto_perps.global.latest.trades",
  "data.crypto_perps.latest.bars",
  "data.crypto_perps.latest.orderbooks",
  "data.crypto_perps.latest.pricing",
  "data.crypto_perps.latest.quotes",
  "data.crypto_perps.latest.trades",
  "data.news.list",
  "data.options.bars",
  "data.options.chain",
  "data.options.meta.conditions",
  "data.options.meta.conditions.trade",
  "data.options.quotes.latest",
  "data.options.snapshots",
  "data.options.trades",
  "data.options.trades.latest",
  "data.screener.most_actives",
  "data.screener.movers",
  "data.stocks.auctions",
  "data.stocks.bars",
  "data.stocks.bars.latest",
  "data.stocks.meta.conditions",
  "data.stocks.meta.conditions.trade",
  "data.stocks.meta.exchanges",
  "data.stocks.quotes",
  "data.stocks.quotes.latest",
  "data.stocks.snapshots",
  "data.stocks.symbol.auctions",
  "data.stocks.symbol.bars",
  "data.stocks.symbol.bars.latest",
  "data.stocks.symbol.quotes",
  "data.stocks.symbol.quotes.latest",
  "data.stocks.symbol.snapshot",
  "data.stocks.symbol.trades",
  "data.stocks.symbol.trades.latest",
  "data.stocks.trades",
  "data.stocks.trades.latest",
  "healthcheck",
  "option_contracts.get",
  "option_contracts.list",
  "orders.cancel",
  "orders.cancel_all_for_account",
  "orders.create",
  "orders.get",
  "orders.list",
  "positions.close",
  "positions.close_all",
  "positions.get",
  "positions.list",
  "positions.list_for_account",
  "rebalancing.subscriptions.delete",
  "rebalancing.subscriptions.get",
  "watchlists.add_asset",
  "watchlists.add_asset_by_name",
  "watchlists.create",
  "watchlists.create_for_account",
  "watchlists.delete",
  "watchlists.get",
  "watchlists.get_by_name",
  "watchlists.list",
  "watchlists.remove_asset",
  "watchlists.update",
  "watchlists.update_by_name",
];
// ops this branch added from the provider's live API; no pinned action id exists
const DEEPENED_OPS = ["calendar.v3"];

describe("alpaca manifest", () => {
  it("keeps the connector identity and bumps the deepened version", () => {
    expect(manifest.key).toBe("alpaca");
    expect(manifest.version).toBe("0.3.1");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.categories).toEqual(["banking-data"]);
  });

  it("authenticates with Alpaca key id, secret, and trading host", () => {
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.http.auth.field).toBe("apiKey");
    expect(manifest.http.auth.name).toBe("APCA-API-SECRET-KEY");
    expect(manifest.http.headers["APCA-API-KEY-ID"]).toBe("{{apiKeyId}}");
    expect(manifest.auth.setup.fields.map((field: { key: string }) => field.key)).toEqual([
      "apiKey",
      "apiKeyId",
      "tradingHost",
    ]);
  });

  it("allows trading, market-data, and broker hosts", () => {
    expect(manifest.network.allowedHosts).toEqual([
      "paper-api.alpaca.markets",
      "api.alpaca.markets",
      "data.alpaca.markets",
      "broker-api.alpaca.markets",
    ]);
    expect(manifest.http.baseUrl).toBe("https://{{tradingHost}}.alpaca.markets");
  });

  it("exposes every action as a real HTTP tool with title, description, and object inputSchema", () => {
    const keys = Object.keys(operations);
    expect(keys.length).toBe(101);
    expect(keys).toContain("calendar.v3");
    expect(keys).toContain("healthcheck");
    expect(keys).toContain("watchlists.add_asset");
    expect(keys).toContain("data.stocks.bars");
    expect(keys).toContain("data.crypto.us.bars");
    expect(keys).toContain("data.options.chain");
    expect(keys).toContain("broker.accounts.cip.upload");
    expect(keys).toContain("broker.accounts.activities.list");
    expect(keys).toContain("broker.accounts.portfolio.history");
    expect(keys).toContain("broker.accounts.configurations.update");
    expect(keys).toContain("calendar.market");
    expect(keys).toContain("broker.accounts.pdt.get");
    for (const [key, operation] of Object.entries(operations)) {
      expect(operation.kind).toBe("action");
      expect(operation.sideEffect).toMatch(/^(read|write|destructive)$/);
      expect(typeof operation.title).toBe("string");
      expect(String(operation.title).length).toBeGreaterThan(0);
      expect(typeof operation.description).toBe("string");
      expect(String(operation.description).length).toBeGreaterThan(0);
      const inputSchema = operation.inputSchema as { type?: string };
      expect(inputSchema.type).toBe("object");
      expect(operation.request).toBeDefined();
      const request = operation.request as { method?: string; path?: string };
      expect(typeof request.method).toBe("string");
      expect(typeof request.path).toBe("string");
      expect(request.path.length).toBeGreaterThan(0);
      if (key.startsWith("webhook.") || operation.kind === "webhook") {
        expect(operation.sideEffect).toBe("read");
      }
    }
  });

  it("recipe mirrors the deepened operations; provenance mappings stay pinned", () => {
    expect(existsSync(recipePath)).toBe(true);
    const recipe = JSON.parse(readFileSync(recipePath, "utf8")) as {
      selection: { operations: string[] };
      operationSources: Record<string, unknown>;
      manifest: { operations: Record<string, unknown>; version: string };
    };
    const runnerOps = Object.keys(operations).sort();
    const recipeOps = Object.keys(recipe.manifest.operations).sort();
    expect(recipe.manifest.version).toBe("0.3.0");
    expect(recipeOps).toHaveLength(101);
    expect(runnerOps).toEqual(recipeOps);
    expect([...recipe.selection.operations].sort()).toEqual(PINNED_OPS);
    expect(Object.keys(recipe.operationSources).sort()).toEqual(PINNED_OPS);
    expect(runnerOps.filter((key) => !Object.hasOwn(recipe.operationSources, key))).toEqual(DEEPENED_OPS);
    for (const key of recipeOps) {
      expect(operations[key], key).toEqual(recipe.manifest.operations[key]);
    }
  });

  it("adds calendar.v3 as a body-less trading-host GET", () => {
    const operation = operations["calendar.v3"] as {
      sideEffect: string;
      timeoutMs: number;
      maxInputBytes: number;
      maxResponseBytes: number;
      title: string;
      description: string;
      responseFormat: string;
      validationMode: string;
      enforceOutputSchema: boolean;
      inputSchema: { type: string; additionalProperties: boolean; required: string[]; properties: Record<string, unknown> };
      outputSchema: { type: string; required: string[]; properties: { data: { type: string; required: string[] } } };
      request: {
        method: string;
        path: string;
        baseUrl?: string;
        success: number[];
        query: Record<string, string>;
        headers?: Record<string, string>;
        body?: unknown;
      };
    };
    expect(operation.sideEffect).toBe("read");
    expect(operation.timeoutMs).toBe(15000);
    expect(operation.maxInputBytes).toBe(65536);
    expect(operation.maxResponseBytes).toBe(5242880);
    expect(operation.title.length).toBeGreaterThan(0);
    expect(operation.description.length).toBeGreaterThan(0);
    expect(operation.responseFormat).toBe("json");
    expect(operation.validationMode).toBe("strict-generated");
    expect(operation.enforceOutputSchema).toBe(true);
    expect(operation.inputSchema.type).toBe("object");
    expect(operation.inputSchema.additionalProperties).toBe(false);
    expect(operation.inputSchema.required).toEqual(["market"]);
    expect(Object.keys(operation.inputSchema.properties).sort()).toEqual(["end", "market", "start", "timezone"]);
    expect(operation.outputSchema.type).toBe("object");
    expect(operation.outputSchema.required).toEqual(["data"]);
    expect(operation.outputSchema.properties.data.type).toBe("object");
    expect(operation.outputSchema.properties.data.required).toEqual(["market", "calendar"]);
    expect(operation.request.method).toBe("GET");
    expect(operation.request.path).toBe("/v3/calendar/{{market}}");
    expect(operation.request.baseUrl).toBeUndefined();
    expect(operation.request.success).toEqual([200]);
    expect(operation.request.query).toEqual({
      start: "{{start}}",
      end: "{{end}}",
      timezone: "{{timezone}}",
    });
    expect(operation.request.headers).toBeUndefined();
    expect(operation.request.body).toBeUndefined();
  });

  it("accounts for every Composio Alpaca tool", () => {
    expect(mapping.composio_tools).toBe(101);
    expect(mapping.mapped.length + mapping.missing.length).toBe(101);
    expect(mapping.missing).toEqual([]);
    const tools = mapping.mapped.map((row: { tool: string }) => row.tool).sort();
    expect(tools.length).toBe(101);
    // ALPACA_GET_MARKET_CALENDAR was already mapped to calendar.market.
    expect(new Set(tools).size).toBe(100);
    expect(tools[0]).toBe("ALPACA_ADD_ASSET_TO_WATCHLIST");
    expect(tools.at(-1)).toBe("ALPACA_UPLOAD_ACCOUNT_CIP");
    expect(
      mapping.mapped.some(
        (row: { tool: string; operation: string }) =>
          row.tool === "ALPACA_GET_MARKET_CALENDAR" && row.operation === "calendar.v3",
      ),
    ).toBe(true);
    expect(
      mapping.mapped.some(
        (row: { tool: string; operation: string }) =>
          row.tool === "ALPACA_GET_MARKET_CALENDAR" && row.operation === "calendar.market",
      ),
    ).toBe(true);
  });
});
