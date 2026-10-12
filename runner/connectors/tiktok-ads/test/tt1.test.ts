// TT-1: effects on the 25 deletes, catalogs.videos.get bc_id contract,
// recipe sync, and second-source route pins. Fixture-only: every request goes
// to an injected fetch; nothing reaches TikTok.
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { wrapActions } from "../src/runtime.ts";
import { TT1_DESTRUCTIVE, TT1_DESTRUCTIVE_OPS, TT1_REVERSIBLE_DELETES } from "./destructive-set.ts";

const manifest = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8")) as any;
const recipe = JSON.parse(readFileSync(new URL("../../recipes/tiktok_ads/recipe.json", import.meta.url), "utf8")) as any;
const ops = manifest.operations as Record<string, any>;
const actions = wrapActions({});
const fixture = (name: string) => readFileSync(new URL(`../fixtures/${name}.json`, import.meta.url), "utf8");
const EFFECT_KEYS = ["effect", "effectPolicy", "reconcile", "observe", "idempotent"];

async function run(op: string, input: Record<string, unknown>, fixtureName: string) {
  const calls: Array<{ url: URL; method: string; body: any }> = [];
  const fetch = async (u: RequestInfo | URL, init: RequestInit = {}) => {
    calls.push({ url: new URL(String(u)), method: String(init.method ?? "GET"), body: init.body ? JSON.parse(String(init.body)) : undefined });
    return new Response(fixture(fixtureName), { status: 200, headers: { "content-type": "application/json" } });
  };
  const result = (await actions[op]!({ accessToken: "fixture-access-value", ...input, fetch })) as any;
  return { result, calls };
}

describe("TT-1 TT-EFFECTS: delete sideEffects", () => {
  const deletes = Object.keys(ops).filter((k) => k.endsWith(".delete"));

  it("covers exactly the 25 delete ops", () => {
    expect(deletes).toHaveLength(25);
    expect(new Set(deletes)).toEqual(new Set([...TT1_DESTRUCTIVE_OPS, ...Object.keys(TT1_REVERSIBLE_DELETES)]));
  });

  it("pins the destructive set to the 19 irreversible deletes", () => {
    const destructive = Object.entries(ops).filter(([, op]) => op.sideEffect === "destructive").map(([k]) => k).sort();
    expect(destructive).toEqual([...TT1_DESTRUCTIVE_OPS].sort());
  });

  it("keeps the 6 reversible deletes as write, with their restore op present", () => {
    for (const [key, restore] of Object.entries(TT1_REVERSIBLE_DELETES)) {
      expect(ops[key].sideEffect, key).toBe("write");
      expect(ops[restore], restore).toBeDefined();
      expect(ops[restore].sideEffect, restore).toBe("write");
    }
  });

  it("adds no effect keys and no Idempotent anywhere", () => {
    for (const [key, op] of Object.entries(ops)) {
      for (const k of EFFECT_KEYS) expect(op[k], `${key}.${k}`).toBeUndefined();
    }
    expect(JSON.stringify(manifest)).not.toMatch(/idempotent/i);
  });

  it("keeps sideEffect counts at 235 read, 170 write, 19 destructive", () => {
    const count = (s: string) => Object.values(ops).filter((op) => op.sideEffect === s).length;
    expect([count("read"), count("write"), count("destructive")]).toEqual([235, 170, 19]);
  });
});

describe("TT-1 catalogs.videos.get requires bc_id", () => {
  // Official SDK yml_files/catalog_video_get.yml (tiktok/tiktok-business-api-sdk
  // @ f809c396): query bc_id required: true.
  it("declares bcId required in the input schema", () => {
    const schema = ops["catalogs.videos.get"].inputSchema;
    expect(schema.required).toEqual(["bcId", "catalogId"]);
    expect(ops["catalogs.videos.list"].inputSchema.required).toEqual(["bcId", "catalogId"]);
  });

  it("still sends bc_id and catalog_video_ids on the wire", async () => {
    const { calls } = await run("catalogs.videos.get", { bcId: "bc-1", catalogId: "cat-1", videoIds: ["1800000000000000001"] }, "catalog_videos");
    expect(calls).toHaveLength(1);
    expect(Object.fromEntries(calls[0]!.url.searchParams)).toEqual({ bc_id: "bc-1", catalog_id: "cat-1", catalog_video_ids: "[\"1800000000000000001\"]" });
  });
});

describe("TT-1 second-source route pins", () => {
  // MCP tool table (available-tools-in-tiktok-for-business-mcp-server/v1.3) and
  // the official "Report App, Web, Offline, or CRM Events" page; see selflock.
  const pins: Array<[string, string, string]> = [
    ["tcm.spark_ads.apply", "POST", "/tcm/tt_video/apply/"],
    ["tcm.spark_ads.status.get", "GET", "/tcm/tt_video/status/"],
    ["pixels.track", "POST", "/event/track/"],
    ["pixels.batch", "POST", "/event/track/"],
    ["pixels.instant_page_events.get", "GET", "/pixel/instant_page/event/"],
  ];
  for (const [key, method, path] of pins) {
    it(`${key} -> ${method} ${path}`, () => {
      expect(ops[key].request.method).toBe(method);
      expect(ops[key].request.path).toBe(path);
    });
  }

  it("tcm.spark_ads.apply sends a JSON body, not query params", async () => {
    const { calls } = await run("tcm.spark_ads.apply", { tcm_account_id: "tto-1", video_id: "vid-1", authorization_days: 30 }, "tcm_tt_video_apply");
    expect(calls[0]!.method).toBe("POST");
    expect([...calls[0]!.url.searchParams.keys()]).toEqual([]);
    expect(calls[0]!.body).toEqual({ tcm_account_id: "tto-1", video_id: "vid-1", authorization_days: 30 });
  });
});

describe("TT-1 recipe sync", () => {
  it("pins the recipe to the connector version and op list", () => {
    expect(recipe.manifest.version).toBe(manifest.version);
    const keys = Object.keys(ops).sort();
    expect(Object.keys(recipe.manifest.operations).sort()).toEqual(keys);
    expect([...recipe.selection.operations].sort()).toEqual(keys);
    expect(Object.keys(recipe.operationSources).sort()).toEqual(keys);
  });

  it("mirrors the delete sideEffects and the catalogs.videos.get required list", () => {
    for (const key of Object.keys(ops).filter((k) => k.endsWith(".delete"))) {
      expect(recipe.manifest.operations[key].sideEffect, key).toBe(ops[key].sideEffect);
    }
    expect(recipe.manifest.operations["catalogs.videos.get"].inputSchema.required).toEqual(["bcId", "catalogId"]);
  });
});
