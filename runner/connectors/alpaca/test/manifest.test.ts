import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import manifest from "../manifest.json";
import mapping from "../fixtures/composio-mapping.json";

const recipeCandidates = [
  join(import.meta.dir, "../../../../scripts/connector-gen/openconnector/recipes/alpaca/recipe.json"),
  join(import.meta.dir, "../../../../scripts/connector-gen/openconnector/recipes/alpaca/recipe.json"),
];
const recipePath = recipeCandidates.find((path) => existsSync(path)) ?? recipeCandidates[0];
const operations = manifest.operations as Record<string, Record<string, unknown>>;

describe("alpaca manifest", () => {
  it("keeps the connector identity and bumps the deepened version", () => {
    expect(manifest.key).toBe("alpaca");
    expect(manifest.version).toBe("0.3.0");
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
    expect(keys.length).toBe(100);
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

  it("keeps recipe operations equal to runner operations", () => {
    expect(existsSync(recipePath)).toBe(true);
    const recipe = JSON.parse(readFileSync(recipePath, "utf8")) as {
      selection: { operations: string[] };
      operationSources: Record<string, unknown>;
      manifest: { operations: Record<string, unknown>; version: string };
    };
    const runnerOps = Object.keys(operations).sort();
    expect(recipe.manifest.version).toBe("0.3.0");
    expect(Object.keys(recipe.manifest.operations).sort()).toEqual(runnerOps);
    expect([...recipe.selection.operations].sort()).toEqual(runnerOps);
    expect(Object.keys(recipe.operationSources).sort()).toEqual(runnerOps);
  });

  it("accounts for every Composio Alpaca tool", () => {
    expect(mapping.composio_tools).toBe(100);
    expect(mapping.mapped.length + mapping.missing.length).toBe(100);
    expect(mapping.missing).toEqual([]);
    const tools = mapping.mapped.map((row: { tool: string }) => row.tool).sort();
    expect(new Set(tools).size).toBe(100);
    expect(tools[0]).toBe("ALPACA_ADD_ASSET_TO_WATCHLIST");
    expect(tools.at(-1)).toBe("ALPACA_UPLOAD_ACCOUNT_CIP");
  });
});
