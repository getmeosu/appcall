import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import manifest from "../manifest.json";
import mapping from "../fixtures/composio-mapping.json";

const recipePath = join(import.meta.dir, "../../../../scripts/connector-gen/openconnector/recipes/api_sports/recipe.json");
const operations = manifest.operations as Record<string, Record<string, unknown>>;

describe("api-sports manifest", () => {
  it("keeps the connector identity and bumps the deepened version", () => {
    expect(manifest.key).toBe("api-sports");
    expect(manifest.version).toBe("0.3.0");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.categories).toEqual(["utility"]);
  });

  it("still authenticates with x-apisports-key and allowlists every sport host", () => {
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.http.auth.field).toBe("apiKey");
    expect(manifest.http.auth.name).toBe("x-apisports-key");
    expect(manifest.http.auth.value).toBe("{{apiKey}}");
    expect(manifest.http.baseUrl).toBe("https://v3.football.api-sports.io");
    expect(manifest.network.allowedHosts).toEqual([
      "v3.football.api-sports.io",
      "v1.afl.api-sports.io",
      "v1.basketball.api-sports.io",
      "v1.baseball.api-sports.io",
      "v1.formula-1.api-sports.io",
      "v1.mma.api-sports.io",
      "v2.nba.api-sports.io",
      "v1.american-football.api-sports.io",
    ]);
  });

  it("exposes every action as a real HTTP tool with title, description, and object inputSchema", () => {
    const keys = Object.keys(operations);
    expect(keys).toContain("healthcheck");
    expect(keys).toContain("leagues.list");
    expect(keys).toContain("afl.games.list");
    expect(keys).toContain("basketball.games.list");
    expect(keys).toContain("formula1.races.list");
    expect(keys).toContain("mma.fights.list");
    expect(keys).toContain("nba.players.statistics");
    expect(keys).toContain("nfl.standings.conferences");
    expect(keys.length).toBe(72);
    for (const [key, operation] of Object.entries(operations)) {
      expect(operation.kind).toBe("action");
      expect(operation.sideEffect).toBe("read");
      expect(typeof operation.title).toBe("string");
      expect(String(operation.title).length).toBeGreaterThan(0);
      expect(typeof operation.description).toBe("string");
      expect(String(operation.description).length).toBeGreaterThan(0);
      const inputSchema = operation.inputSchema as { type?: string };
      expect(inputSchema.type).toBe("object");
      expect(operation.request).toBeDefined();
      const request = operation.request as { method?: string; path?: string };
      expect(request.method).toBe("GET");
      expect(typeof request.path).toBe("string");
      expect(String(request.path).length).toBeGreaterThan(0);
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

  it("accounts for every documented Composio API-Sports tool", () => {
    expect(mapping.mapped.length + mapping.partial.length + mapping.missing.length).toBe(72);
    expect(mapping.mapped.length).toBe(72);
    expect(mapping.missing).toEqual([]);
    for (const row of mapping.mapped) {
      expect(operations[row.operation], row.tool).toBeDefined();
    }
  });
});
