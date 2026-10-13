import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import mapping from "../fixtures/composio-mapping.json";

const recipePath = "scripts/connector-gen/openconnector/recipes/beaconchain/recipe.json";
const operations = manifest.operations as Record<string, Record<string, unknown>>;
const expected = [
  "charts.get",
  "deposits.by_tx_hash",
  "ens.resolve",
  "epoch.get",
  "ethstore.daily",
  "execution.block",
  "execution.erc20_tokens",
  "execution.produced_blocks",
  "health.node",
  "healthcheck",
  "performance.get",
  "queues.get",
  "rocketpool.validator",
  "slot.attestations",
  "slot.attester_slashings",
  "slot.get",
  "slot.proposer_slashings",
  "slot.voluntary_exits",
  "state.latest",
  "sync_committee.get",
  "validators.attestation_efficiency",
  "validators.attestations",
  "validators.balance_history",
  "validators.bls_changes",
  "validators.by_deposit_address",
  "validators.by_withdrawal_credentials",
  "validators.consensus_rewards",
  "validators.daily_stats",
  "validators.deposits",
  "validators.execution_rewards",
  "validators.get",
  "validators.income_history",
  "validators.leaderboard",
  "validators.list",
  "validators.overview.get",
  "validators.overview.post",
  "validators.proposal_luck",
  "validators.proposals",
  "validators.queue",
  "validators.withdrawals",
] as string[];

// ops the pinned recipe has real provenance for
const PINNED_OPS = [
  "charts.get",
  "deposits.by_tx_hash",
  "ens.resolve",
  "epoch.get",
  "ethstore.daily",
  "execution.block",
  "execution.erc20_tokens",
  "execution.produced_blocks",
  "health.node",
  "healthcheck",
  "performance.get",
  "queues.get",
  "rocketpool.validator",
  "slot.attestations",
  "slot.attester_slashings",
  "slot.get",
  "slot.proposer_slashings",
  "slot.voluntary_exits",
  "state.latest",
  "sync_committee.get",
  "validators.attestation_efficiency",
  "validators.attestations",
  "validators.balance_history",
  "validators.bls_changes",
  "validators.by_deposit_address",
  "validators.by_withdrawal_credentials",
  "validators.consensus_rewards",
  "validators.daily_stats",
  "validators.deposits",
  "validators.execution_rewards",
  "validators.get",
  "validators.income_history",
  "validators.leaderboard",
  "validators.list",
  "validators.proposal_luck",
  "validators.proposals",
  "validators.queue",
  "validators.withdrawals",
];
// ops this branch added from the provider's live API; no pinned action id exists
const DEEPENED_OPS = ["validators.overview.get", "validators.overview.post"];

describe("beaconchain manifest", () => {
  it("keeps the connector identity and bumps the deepened version", () => {
    expect(manifest.key).toBe("beaconchain");
    expect(manifest.version).toBe("0.2.1");
    expect(manifest.runtime).toBe("bun");
    expect(manifest.visibility).toBe("public");
    expect(manifest.name).toBe("Beaconcha.in");
    expect(manifest.categories).toEqual(["utility"]);
  });

  it("still authenticates with Bearer apiKey on beaconcha.in", () => {
    expect(manifest.auth.type).toBe("api_key");
    expect(manifest.http.auth.field).toBe("apiKey");
    expect(manifest.http.auth.in).toBe("header");
    expect(manifest.http.auth.name).toBe("Authorization");
    expect(manifest.http.auth.value).toBe("Bearer {{apiKey}}");
    expect(manifest.http.baseUrl).toBe("https://beaconcha.in");
    expect(manifest.network.allowedHosts).toEqual(["beaconcha.in"]);
  });

  it("exposes every action as a real HTTP tool with title, description, and object inputSchema", () => {
    expect(Object.keys(operations).sort()).toEqual(expected);
    expect(expected).toHaveLength(40);
    for (const [key, operation] of Object.entries(operations)) {
      expect(operation.kind, key).toBe("action");
      expect(operation.sideEffect, key).toBe("read");
      expect(String(operation.title ?? "").length, key).toBeGreaterThan(0);
      expect(String(operation.description ?? "").length, key).toBeGreaterThan(10);
      expect((operation.inputSchema as { type?: string }).type, key).toBe("object");
      expect(operation.request, `${key} must declare a request block`).toBeDefined();
      const request = operation.request as { method?: string; path?: string };
      expect(["GET", "POST"]).toContain(String(request.method));
      expect(String(request.path ?? "").length, key).toBeGreaterThan(0);
    }
  });

  it("keeps origin V2 request shapes", () => {
    const queues = operations["queues.get"] as { request: { method: string; path: string } };
    expect(queues.request.method).toBe("POST");
    expect(queues.request.path).toBe("/api/v2/ethereum/queues");
    const performance = operations["performance.get"] as { request: { path: string } };
    expect(performance.request.path).toBe("/api/v2/ethereum/performance-aggregate");
    const get = operations["validators.get"] as { request: { path: string } };
    expect(get.request.path).toBe("/api/v2/ethereum/validators");
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

  it("recipe mirrors the deepened operations; provenance mappings stay pinned", () => {
    expect(existsSync(recipePath)).toBe(true);
    const recipe = JSON.parse(readFileSync(recipePath, "utf8")) as {
      selection: { operations: string[] };
      operationSources: Record<string, unknown>;
      manifest: { operations: Record<string, unknown>; version: string };
    };
    const runnerOps = Object.keys(operations).sort();
    const recipeOps = Object.keys(recipe.manifest.operations).sort();
    expect(recipe.manifest.version).toBe("0.2.0");
    expect(recipeOps).toHaveLength(40);
    expect(runnerOps).toEqual(recipeOps);
    expect([...recipe.selection.operations].sort()).toEqual(PINNED_OPS);
    expect(Object.keys(recipe.operationSources).sort()).toEqual(PINNED_OPS);
    expect(runnerOps.filter((key) => !Object.hasOwn(recipe.operationSources, key))).toEqual(DEEPENED_OPS);
    for (const key of recipeOps) {
      expect(operations[key], key).toEqual(recipe.manifest.operations[key]);
    }
  });

  it("adds the V1 validators overview routes without an apikey query or base URL override", () => {
    const sibling = operations["epoch.get"]!;
    const get = operations["validators.overview.get"]!;
    const post = operations["validators.overview.post"]!;
    for (const operation of [get, post]) {
      expect(operation.timeoutMs).toBe(sibling.timeoutMs);
      expect(operation.maxInputBytes).toBe(sibling.maxInputBytes);
      expect(operation.maxResponseBytes).toBe(sibling.maxResponseBytes);
      expect(operation.responseFormat).toBe("json");
      expect(operation.validationMode).toBe(sibling.validationMode);
      expect(operation.enforceOutputSchema).toBe(true);
      expect(operation.outputSchema).toEqual({
        additionalProperties: false,
        properties: { data: { additionalProperties: true, type: "object" } },
        required: ["data"],
        type: "object",
      });
    }
    const getRequest = get.request as {
      method: string;
      path: string;
      baseUrl?: string;
      query?: unknown;
      body?: unknown;
      headers?: Record<string, string>;
      success: number[];
    };
    const postRequest = post.request as typeof getRequest;
    expect(getRequest).toEqual({
      method: "GET",
      path: "/api/v1/validator/{{indexOrPubkey}}",
      success: [200],
    });
    expect(getRequest.baseUrl).toBeUndefined();
    expect(getRequest.query).toBeUndefined();
    expect(getRequest.body).toBeUndefined();
    expect(getRequest.headers).toBeUndefined();
    expect(postRequest).toEqual({
      method: "POST",
      path: "/api/v1/validator",
      body: { indicesOrPubkey: "{{indicesOrPubkey}}" },
      headers: { "Content-Type": "application/json" },
      success: [200],
    });
    expect(postRequest.baseUrl).toBeUndefined();
    expect(postRequest.query).toBeUndefined();
    const getSchema = get.inputSchema as { type: string; additionalProperties: boolean; required: string[]; properties: Record<string, { type: string }> };
    const postSchema = post.inputSchema as typeof getSchema;
    expect(getSchema.type).toBe("object");
    expect(getSchema.additionalProperties).toBe(false);
    expect(getSchema.required).toEqual(["indexOrPubkey"]);
    expect(getSchema.properties.indexOrPubkey!.type).toBe("string");
    expect(postSchema.type).toBe("object");
    expect(postSchema.additionalProperties).toBe(false);
    expect(postSchema.required).toEqual(["indicesOrPubkey"]);
    expect(postSchema.properties.indicesOrPubkey!.type).toBe("string");
    expect((operations["validators.get"]!.request as { method: string; path: string }).path).toBe("/api/v2/ethereum/validators");
    expect((operations["validators.get"]!.request as { method: string }).method).toBe("POST");
    expect((operations["validators.list"]!.request as { path: string }).path).toBe("/api/v2/ethereum/validators");
    expect((operations["charts.get"]!.request as { path: string }).path).toBe("/api/v1/chart/{{chart}}");
    expect((operations["health.node"]!.request as { path: string }).path).toBe("/api/healthz");
  });

  it("accounts for every Composio Beaconchain tool", () => {
    expect(mapping.composio_tools).toBe(37);
    expect(mapping.mapped.length).toBe(37);
    expect(mapping.missing).toEqual([]);
    for (const row of mapping.mapped as { tool: string; operation: string }[]) {
      expect(operations[row.operation], row.tool).toBeDefined();
    }
  });
});
