import { describe, expect, it } from "bun:test";
import { loadFixtureCases, runCandidateFixtures } from "../../../../scripts/connector-gen/openconnector/recipe-fixtures";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";
import sites from "../fixtures/sites.json";

const actionKeys = Object.entries(manifest.operations)
  .filter(([, operation]) => (operation as { kind?: string }).kind === "action")
  .map(([key]) => key);

describe("Webflow depth fixtures", () => {
  it("replays authenticated fixture cases", async () => {
    const cases = loadFixtureCases(new URL("../fixtures/cases", import.meta.url).pathname);
    const runs = await runCandidateFixtures(JSON.stringify(manifest), cases);
    expect(runs.length).toBeGreaterThan(0);
    for (const run of runs) {
      if (run.status !== "passed") {
        throw new Error(`${run.caseId}: ${run.error}`);
      }
    }
  });

  it("covers every declared action with a positive fixture and skips EventOnly webhooks", () => {
    const cases = loadFixtureCases(new URL("../fixtures/cases", import.meta.url).pathname);
    const positive = new Set(cases.filter((c) => c.expected.kind === "success").map((c) => c.operation));
    expect([...positive].sort()).toEqual([...actionKeys].sort());
    for (const key of Object.keys(manifest.operations)) {
      if (key.startsWith("webhook.")) {
        expect(positive.has(key)).toBe(false);
      }
    }
  });
});

const { actions } = compileDeclarativeConnector(manifest as never);
const response = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers });

describe("webflow HTTP contract", () => {
  it("includes provenance and evidence metadata", () => {
    expect(manifest.provenance.source).toEqual({
      url: "https://github.com/oomol-lab/open-connector",
      revision: "33dd4ad6ee22f9ce5158a1516a11d8b8566b5c8a",
    });
    expect(manifest.evidence).toEqual({ fixture: { status: "supplied" }, live: { status: "unverified" } });
  });

  it("healthcheck and site listing use bearer auth", async () => {
    const seen: Request[] = [];
    const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(new Request(input, init));
      return response(sites);
    };
    await actions.healthcheck!({ apiKey: "secret", fetch });
    await actions.list_sites!({ apiKey: "secret", fetch });
    expect(seen[0].headers.get("authorization")).toBe("Bearer secret");
    expect(seen[0].url).toBe("https://api.webflow.com/v2/sites");
  });

  it("escapes IDs and maps 401 and 429", async () => {
    const seen: Request[] = [];
    await actions.list_collections!({
      apiKey: "x",
      siteId: "a/b?c",
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response({ collections: [] });
      },
    });
    expect(new URL(seen[0].url).pathname).toBe("/v2/sites/a%2Fb%3Fc/collections");
    await expect(actions.list_sites!({ apiKey: "x", fetch: async () => response({}, 401) })).rejects.toMatchObject({
      code: "CONNECTOR_UPSTREAM_ERROR",
    });
    await expect(
      actions.list_sites!({ apiKey: "x", fetch: async () => response({}, 429, { "retry-after": "4" }) }),
    ).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });
});

describe("Webflow depth contracts", () => {
  const mock = (body: unknown, status = 200) => {
    const calls: Request[] = [];
    const fetch = async (u: RequestInfo | URL, i?: RequestInit) => {
      calls.push(new Request(u, i));
      return response(body, status);
    };
    return { calls, fetch };
  };

  it("routes ecommerce order operations under the site", async () => {
    const refund = mock({ orderId: "order-1", status: "refunded" });
    await actions["orders.refund"]!({
      apiKey: "tok",
      siteId: "site-1",
      orderId: "order-1",
      reason: "requested",
      fetch: refund.fetch,
    });
    expect(refund.calls[0].method).toBe("POST");
    expect(refund.calls[0].url).toBe("https://api.webflow.com/v2/sites/site-1/orders/order-1/refund");
    expect(await refund.calls[0].json()).toEqual({ reason: "requested" });

    const fulfill = mock({ orderId: "order-1", status: "fulfilled" });
    await actions["orders.fulfill"]!({
      apiKey: "tok",
      siteId: "site-1",
      orderId: "order-1",
      sendOrderFulfilledEmail: true,
      fetch: fulfill.fetch,
    });
    expect(fulfill.calls[0].url).toBe("https://api.webflow.com/v2/sites/site-1/orders/order-1/fulfill");
    expect(await fulfill.calls[0].json()).toEqual({ sendOrderFulfilledEmail: true });
  });

  it("renders order list filters as query parameters", async () => {
    const m = mock({ orders: [], pagination: { limit: 10, offset: 0, total: 0 } });
    await actions["orders.list"]!({
      apiKey: "tok",
      siteId: "site-1",
      status: "unfulfilled",
      limit: 10,
      offset: 0,
      fetch: m.fetch,
    });
    expect(m.calls[0].url).toBe("https://api.webflow.com/v2/sites/site-1/orders?status=unfulfilled&offset=0&limit=10");
  });

  it("registers asset metadata and updates live items in bulk", async () => {
    const asset = mock({ id: "asset-1" });
    await actions["assets.create"]!({
      apiKey: "tok",
      siteId: "site-1",
      fileName: "logo.png",
      fileHash: "d41d8cd98f00b204e9800998ecf8427e",
      fetch: asset.fetch,
    });
    expect(asset.calls[0].method).toBe("POST");
    expect(asset.calls[0].url).toBe("https://api.webflow.com/v2/sites/site-1/assets");
    expect(await asset.calls[0].json()).toEqual({ fileName: "logo.png", fileHash: "d41d8cd98f00b204e9800998ecf8427e" });

    const live = mock({ items: [] });
    await actions["live_items.update"]!({
      apiKey: "tok",
      collectionId: "col-1",
      items: [{ id: "item-1" }],
      skipInvalidFiles: false,
      fetch: live.fetch,
    });
    expect(live.calls[0].url).toBe("https://api.webflow.com/v2/collections/col-1/items/live?skipInvalidFiles=false");
    expect(await live.calls[0].json()).toEqual({ items: [{ id: "item-1" }] });
  });

  it("updates page settings with a PUT and locale query", async () => {
    const m = mock({ id: "page-1" });
    await actions["pages.update"]!({
      apiKey: "tok",
      pageId: "page-1",
      title: "Home",
      localeId: "locale-1",
      fetch: m.fetch,
    });
    expect(m.calls[0].method).toBe("PUT");
    expect(m.calls[0].url).toBe("https://api.webflow.com/v2/pages/page-1?localeId=locale-1");
    expect(await m.calls[0].json()).toEqual({ title: "Home" });
  });

  it("requires documented inputs before any network call", async () => {
    const m = mock({});
    await expect(
      actions["inventory.update"]!({ apiKey: "tok", skuCollectionId: "sku-col-1", skuId: "sku-1", fetch: m.fetch }),
    ).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    expect(m.calls.length).toBe(0);
  });
});
