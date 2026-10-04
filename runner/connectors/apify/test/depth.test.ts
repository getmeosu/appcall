import { describe, expect, test } from "bun:test";
import datasetsListFixture from "../fixtures/datasets_list.json";
import datasetCreateFixture from "../fixtures/dataset_create.json";
import keyValueStoresListFixture from "../fixtures/key_value_stores_list.json";
import keyValueStoreGetFixture from "../fixtures/key_value_store_get.json";
import keyValueStoreListKeysFixture from "../fixtures/key_value_store_list_keys.json";
import taskGetFixture from "../fixtures/task_get.json";
import userMeFixture from "../fixtures/user_me.json";
import webhooksListFixture from "../fixtures/webhooks_list.json";
import requestQueuesListFixture from "../fixtures/request_queues_list.json";

import {
  listDatasets,
  createDataset,
  deleteDataset,
  pushDatasetItems,
  listKeyValueStores,
  getKeyValueStore,
  putKeyValueStoreRecord,
  listKeyValueStoreKeys,
  deleteKeyValueStoreRecord,
  getTask,
  getUserMe,
  listWebhooks,
  getRunLog,
  listRequestQueues,
  validateDatasetsListInput,
  validateDatasetsCreateInput,
  validateDatasetsDeleteInput,
  validateDatasetsPushItemsInput,
  validateKeyValueStoresListInput,
  validateKeyValueStoresGetInput,
  validateKeyValueStorePutRecordInput,
  validateKeyValueStoreListKeysInput,
  validateKeyValueStoreDeleteRecordInput,
  validateTasksGetInput,
  validateUsersMeInput,
  validateWebhooksListInput,
  validateRunsLogInput,
  validateRequestQueuesListInput,
} from "../src/actions";

function mockFetch(fixture: unknown, status = 200) {
  const requests: Request[] = [];
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push(new Request(input, init));
    return new Response(JSON.stringify(fixture), { status });
  };
  return { requests, fetch };
}

// ─── datasets.list ────────────────────────────────────────────────────────────

describe("listDatasets", () => {
  test("validation mode returns validated output", () => {
    const result = listDatasets({ limit: 10 });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("datasets.list");
    expect((result.validated as { limit: number }).limit).toBe(10);
  });

  test("accepts empty object input", () => {
    expect(validateDatasetsListInput({})).toEqual({});
  });

  test("calls GET /v2/datasets with pagination", async () => {
    const { requests, fetch } = mockFetch(datasetsListFixture);
    const result = await listDatasets({ apiKey: "apify_api_test", limit: 10, offset: 0, fetch });
    expect(requests).toHaveLength(1);
    const url = new URL(requests[0].url);
    expect(url.pathname).toBe("/v2/datasets");
    expect(url.searchParams.get("limit")).toBe("10");
    expect(url.searchParams.get("offset")).toBe("0");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer apify_api_test");
    expect(result.action).toBe("datasets.list");
    expect(Array.isArray(result.datasets)).toBe(true);
    expect((result.datasets as unknown[]).length).toBe(2);
    expect(result.total).toBe(2);
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(listDatasets({
      apiKey: "key",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "21" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 21 });
  });
});

// ─── datasets.create ──────────────────────────────────────────────────────────

describe("createDataset", () => {
  test("validation mode returns validated output", () => {
    const result = createDataset({ name: "outbound-leads" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("datasets.create");
    expect((result.validated as { name: string }).name).toBe("outbound-leads");
  });

  test("accepts unnamed dataset create", () => {
    expect(validateDatasetsCreateInput({})).toEqual({});
  });

  test("calls POST /v2/datasets with optional name", async () => {
    const { requests, fetch } = mockFetch(datasetCreateFixture, 201);
    const result = await createDataset({ apiKey: "apify_api_test", name: "outbound-leads", fetch });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.apify.com/v2/datasets");
    expect(requests[0].method).toBe("POST");
    const body = await requests[0].json() as Record<string, unknown>;
    expect(body.name).toBe("outbound-leads");
    expect(result.action).toBe("datasets.create");
    expect((result.dataset as Record<string, unknown>).id).toBe("dsCreated001");
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(createDataset({
      apiKey: "key",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "4" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });
});

// ─── datasets.delete ──────────────────────────────────────────────────────────

describe("deleteDataset", () => {
  test("validation mode returns validated output", () => {
    const result = deleteDataset({ datasetId: "wmKPijuyDnPZAPRMk" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("datasets.delete");
    expect((result.validated as { datasetId: string }).datasetId).toBe("wmKPijuyDnPZAPRMk");
  });

  test("throws when datasetId is missing", () => {
    expect(() => validateDatasetsDeleteInput({})).toThrow("datasetId is required");
  });

  test("calls DELETE /v2/datasets/{datasetId}", async () => {
    const requests: Request[] = [];
    const result = await deleteDataset({
      apiKey: "apify_api_test",
      datasetId: "wmKPijuyDnPZAPRMk",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response("", { status: 204 });
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toContain("/v2/datasets/wmKPijuyDnPZAPRMk");
    expect(requests[0].method).toBe("DELETE");
    expect(result.action).toBe("datasets.delete");
    expect(result.datasetId).toBe("wmKPijuyDnPZAPRMk");
  });

  test("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(deleteDataset({
      apiKey: "key",
      datasetId: "missing",
      fetch: async () => new Response("{}", { status: 404 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

// ─── datasets.push_items ──────────────────────────────────────────────────────

describe("pushDatasetItems", () => {
  test("validation mode returns validated output", () => {
    const result = pushDatasetItems({ datasetId: "wmKPijuyDnPZAPRMk", items: [{ url: "https://example.com" }] });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("datasets.push_items");
    expect((result.validated as { items: unknown[] }).items).toHaveLength(1);
  });

  test("throws when datasetId or items is missing", () => {
    expect(() => validateDatasetsPushItemsInput({ items: [{ url: "https://example.com" }] })).toThrow("datasetId is required");
    expect(() => validateDatasetsPushItemsInput({ datasetId: "wmKPijuyDnPZAPRMk" })).toThrow("items is required");
  });

  test("calls POST /v2/datasets/{datasetId}/items with items array", async () => {
    const requests: Request[] = [];
    const items = [{ url: "https://example.com", title: "Example" }];
    const result = await pushDatasetItems({
      apiKey: "apify_api_test",
      datasetId: "wmKPijuyDnPZAPRMk",
      items,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response("", { status: 201 });
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toContain("/v2/datasets/wmKPijuyDnPZAPRMk/items");
    expect(requests[0].method).toBe("POST");
    const body = await requests[0].json();
    expect(body).toEqual(items);
    expect(result.action).toBe("datasets.push_items");
    expect(result.count).toBe(1);
  });

  test("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(pushDatasetItems({
      apiKey: "key",
      datasetId: "missing",
      items: [{ url: "https://example.com" }],
      fetch: async () => new Response("{}", { status: 404 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

// ─── key_value_stores.list ────────────────────────────────────────────────────

describe("listKeyValueStores", () => {
  test("validation mode returns validated output", () => {
    const result = listKeyValueStores({ limit: 5 });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("key_value_stores.list");
    expect((result.validated as { limit: number }).limit).toBe(5);
  });

  test("accepts empty object input", () => {
    expect(validateKeyValueStoresListInput({})).toEqual({});
  });

  test("calls GET /v2/key-value-stores with pagination", async () => {
    const { requests, fetch } = mockFetch(keyValueStoresListFixture);
    const result = await listKeyValueStores({ apiKey: "apify_api_test", limit: 5, fetch });
    expect(requests).toHaveLength(1);
    const url = new URL(requests[0].url);
    expect(url.pathname).toBe("/v2/key-value-stores");
    expect(url.searchParams.get("limit")).toBe("5");
    expect(result.action).toBe("key_value_stores.list");
    expect(Array.isArray(result.stores)).toBe(true);
    expect((result.stores as unknown[]).length).toBe(2);
    expect(result.total).toBe(2);
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(listKeyValueStores({
      apiKey: "key",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "13" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 13 });
  });
});

// ─── key_value_stores.get ─────────────────────────────────────────────────────

describe("getKeyValueStore", () => {
  test("validation mode returns validated output", () => {
    const result = getKeyValueStore({ storeId: "eJNzqsbPiopwJcgGQ" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("key_value_stores.get");
    expect((result.validated as { storeId: string }).storeId).toBe("eJNzqsbPiopwJcgGQ");
  });

  test("throws when storeId is missing", () => {
    expect(() => validateKeyValueStoresGetInput({})).toThrow("storeId is required");
  });

  test("calls GET /v2/key-value-stores/{storeId}", async () => {
    const { requests, fetch } = mockFetch(keyValueStoreGetFixture);
    const result = await getKeyValueStore({ apiKey: "apify_api_test", storeId: "eJNzqsbPiopwJcgGQ", fetch });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toContain("/v2/key-value-stores/eJNzqsbPiopwJcgGQ");
    expect(result.action).toBe("key_value_stores.get");
    expect((result.store as Record<string, unknown>).name).toBe("web-scraper-store");
  });

  test("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(getKeyValueStore({
      apiKey: "key",
      storeId: "missing",
      fetch: async () => new Response("{}", { status: 404 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

// ─── key_value_store.put_record ───────────────────────────────────────────────

describe("putKeyValueStoreRecord", () => {
  test("validation mode returns validated output", () => {
    const result = putKeyValueStoreRecord({ storeId: "eJNzqsbPiopwJcgGQ", recordKey: "OUTPUT", value: { ok: true } });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("key_value_store.put_record");
    expect((result.validated as { recordKey: string }).recordKey).toBe("OUTPUT");
  });

  test("throws when storeId, recordKey, or value is missing", () => {
    expect(() => validateKeyValueStorePutRecordInput({ recordKey: "OUTPUT", value: {} })).toThrow("storeId is required");
    expect(() => validateKeyValueStorePutRecordInput({ storeId: "store", value: {} })).toThrow("recordKey is required");
    expect(() => validateKeyValueStorePutRecordInput({ storeId: "store", recordKey: "OUTPUT" })).toThrow("value is required");
  });

  test("calls PUT /v2/key-value-stores/{storeId}/records/{recordKey}", async () => {
    const requests: Request[] = [];
    const result = await putKeyValueStoreRecord({
      apiKey: "apify_api_test",
      storeId: "eJNzqsbPiopwJcgGQ",
      recordKey: "OUTPUT",
      value: { totalItemCount: 3 },
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response("", { status: 201 });
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toContain("/v2/key-value-stores/eJNzqsbPiopwJcgGQ/records/OUTPUT");
    expect(requests[0].method).toBe("PUT");
    const body = await requests[0].json() as Record<string, unknown>;
    expect(body.totalItemCount).toBe(3);
    expect(result.action).toBe("key_value_store.put_record");
    expect(result.recordKey).toBe("OUTPUT");
  });

  test("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(putKeyValueStoreRecord({
      apiKey: "key",
      storeId: "missing",
      recordKey: "OUTPUT",
      value: {},
      fetch: async () => new Response("{}", { status: 404 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

// ─── key_value_store.list_keys ────────────────────────────────────────────────

describe("listKeyValueStoreKeys", () => {
  test("validation mode returns validated output", () => {
    const result = listKeyValueStoreKeys({ storeId: "eJNzqsbPiopwJcgGQ", limit: 100 });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("key_value_store.list_keys");
    expect((result.validated as { storeId: string }).storeId).toBe("eJNzqsbPiopwJcgGQ");
  });

  test("throws when storeId is missing", () => {
    expect(() => validateKeyValueStoreListKeysInput({})).toThrow("storeId is required");
  });

  test("calls GET /v2/key-value-stores/{storeId}/keys", async () => {
    const { requests, fetch } = mockFetch(keyValueStoreListKeysFixture);
    const result = await listKeyValueStoreKeys({
      apiKey: "apify_api_test",
      storeId: "eJNzqsbPiopwJcgGQ",
      limit: 100,
      fetch,
    });
    expect(requests).toHaveLength(1);
    const url = new URL(requests[0].url);
    expect(url.pathname).toBe("/v2/key-value-stores/eJNzqsbPiopwJcgGQ/keys");
    expect(url.searchParams.get("limit")).toBe("100");
    expect(result.action).toBe("key_value_store.list_keys");
    expect(Array.isArray(result.keys)).toBe(true);
    expect((result.keys as unknown[]).length).toBe(3);
    expect(result.count).toBe(3);
  });

  test("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(listKeyValueStoreKeys({
      apiKey: "key",
      storeId: "missing",
      fetch: async () => new Response("{}", { status: 404 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

// ─── key_value_store.delete_record ────────────────────────────────────────────

describe("deleteKeyValueStoreRecord", () => {
  test("validation mode returns validated output", () => {
    const result = deleteKeyValueStoreRecord({ storeId: "eJNzqsbPiopwJcgGQ", recordKey: "OUTPUT" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("key_value_store.delete_record");
    expect((result.validated as { recordKey: string }).recordKey).toBe("OUTPUT");
  });

  test("throws when storeId or recordKey is missing", () => {
    expect(() => validateKeyValueStoreDeleteRecordInput({ recordKey: "OUTPUT" })).toThrow("storeId is required");
    expect(() => validateKeyValueStoreDeleteRecordInput({ storeId: "store" })).toThrow("recordKey is required");
  });

  test("calls DELETE /v2/key-value-stores/{storeId}/records/{recordKey}", async () => {
    const requests: Request[] = [];
    const result = await deleteKeyValueStoreRecord({
      apiKey: "apify_api_test",
      storeId: "eJNzqsbPiopwJcgGQ",
      recordKey: "OUTPUT",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response("", { status: 204 });
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toContain("/v2/key-value-stores/eJNzqsbPiopwJcgGQ/records/OUTPUT");
    expect(requests[0].method).toBe("DELETE");
    expect(result.action).toBe("key_value_store.delete_record");
    expect(result.recordKey).toBe("OUTPUT");
  });

  test("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(deleteKeyValueStoreRecord({
      apiKey: "key",
      storeId: "missing",
      recordKey: "OUTPUT",
      fetch: async () => new Response("{}", { status: 404 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

// ─── tasks.get ────────────────────────────────────────────────────────────────

describe("getTask", () => {
  test("validation mode returns validated output", () => {
    const result = getTask({ taskId: "TASK_ID_001" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("tasks.get");
    expect((result.validated as { taskId: string }).taskId).toBe("TASK_ID_001");
  });

  test("throws when taskId is missing", () => {
    expect(() => validateTasksGetInput({})).toThrow("taskId is required");
  });

  test("calls GET /v2/actor-tasks/{taskId}", async () => {
    const { requests, fetch } = mockFetch(taskGetFixture);
    const result = await getTask({ apiKey: "apify_api_test", taskId: "TASK_ID_001", fetch });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toContain("/v2/actor-tasks/TASK_ID_001");
    expect(result.action).toBe("tasks.get");
    expect((result.task as Record<string, unknown>).name).toBe("scrape-example-com");
  });

  test("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(getTask({
      apiKey: "key",
      taskId: "missing",
      fetch: async () => new Response("{}", { status: 404 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

// ─── users.me ─────────────────────────────────────────────────────────────────

describe("getUserMe", () => {
  test("validation mode returns validated output", () => {
    const result = getUserMe({});
    expect(result.source).toBe("connector");
    expect(result.action).toBe("users.me");
    expect(result.validated).toEqual({});
  });

  test("rejects non-object input", () => {
    expect(() => validateUsersMeInput(null)).toThrow("users.me input must be an object");
  });

  test("calls GET /v2/users/me", async () => {
    const { requests, fetch } = mockFetch(userMeFixture);
    const result = await getUserMe({ apiKey: "apify_api_test", fetch });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.apify.com/v2/users/me");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer apify_api_test");
    expect(result.action).toBe("users.me");
    expect((result.user as Record<string, unknown>).username).toBe("apify-user");
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(getUserMe({
      apiKey: "key",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "16" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 16 });
  });
});

// ─── webhooks.list ────────────────────────────────────────────────────────────

describe("listWebhooks", () => {
  test("validation mode returns validated output", () => {
    const result = listWebhooks({ limit: 20 });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("webhooks.list");
    expect((result.validated as { limit: number }).limit).toBe(20);
  });

  test("accepts empty object input", () => {
    expect(validateWebhooksListInput({})).toEqual({});
  });

  test("calls GET /v2/webhooks with pagination", async () => {
    const { requests, fetch } = mockFetch(webhooksListFixture);
    const result = await listWebhooks({ apiKey: "apify_api_test", limit: 20, fetch });
    expect(requests).toHaveLength(1);
    const url = new URL(requests[0].url);
    expect(url.pathname).toBe("/v2/webhooks");
    expect(url.searchParams.get("limit")).toBe("20");
    expect(result.action).toBe("webhooks.list");
    expect(Array.isArray(result.webhooks)).toBe(true);
    expect((result.webhooks as unknown[]).length).toBe(1);
    expect(result.total).toBe(1);
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(listWebhooks({
      apiKey: "key",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "19" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 19 });
  });
});

// ─── runs.log ─────────────────────────────────────────────────────────────────

describe("getRunLog", () => {
  test("validation mode returns validated output", () => {
    const result = getRunLog({ runId: "HG7ML7M8z78YcAPEB" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("runs.log");
    expect((result.validated as { runId: string }).runId).toBe("HG7ML7M8z78YcAPEB");
  });

  test("throws when runId is missing", () => {
    expect(() => validateRunsLogInput({})).toThrow("runId is required");
  });

  test("calls GET /v2/actor-runs/{runId}/log and returns text", async () => {
    const requests: Request[] = [];
    const logText = "2017-07-14T06:00:49.733Z Application started.\n";
    const result = await getRunLog({
      apiKey: "apify_api_test",
      runId: "HG7ML7M8z78YcAPEB",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(logText, { status: 200, headers: { "content-type": "text/plain" } });
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toContain("/v2/actor-runs/HG7ML7M8z78YcAPEB/log");
    expect(result.action).toBe("runs.log");
    expect(result.log).toBe(logText);
  });

  test("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(getRunLog({
      apiKey: "key",
      runId: "missing",
      fetch: async () => new Response("{}", { status: 404 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

// ─── request_queues.list ──────────────────────────────────────────────────────

describe("listRequestQueues", () => {
  test("validation mode returns validated output", () => {
    const result = listRequestQueues({ limit: 10 });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("request_queues.list");
    expect((result.validated as { limit: number }).limit).toBe(10);
  });

  test("accepts empty object input", () => {
    expect(validateRequestQueuesListInput({})).toEqual({});
  });

  test("calls GET /v2/request-queues with pagination", async () => {
    const { requests, fetch } = mockFetch(requestQueuesListFixture);
    const result = await listRequestQueues({ apiKey: "apify_api_test", limit: 10, fetch });
    expect(requests).toHaveLength(1);
    const url = new URL(requests[0].url);
    expect(url.pathname).toBe("/v2/request-queues");
    expect(url.searchParams.get("limit")).toBe("10");
    expect(result.action).toBe("request_queues.list");
    expect(Array.isArray(result.queues)).toBe(true);
    expect((result.queues as unknown[]).length).toBe(2);
    expect(result.total).toBe(2);
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(listRequestQueues({
      apiKey: "key",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "22" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 22 });
  });
});
