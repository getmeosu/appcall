import { describe, expect, test } from "bun:test";
import actorsListFixture from "../fixtures/actors_list.json";
import actorGetFixture from "../fixtures/actor_get.json";
import actorRunFixture from "../fixtures/actor_run.json";
import actorRunSyncFixture from "../fixtures/actor_run_sync_dataset_items.json";
import runGetFixture from "../fixtures/run_get.json";
import runsListFixture from "../fixtures/runs_list.json";
import runAbortFixture from "../fixtures/run_abort.json";
import datasetGetFixture from "../fixtures/dataset_get.json";
import datasetItemsFixture from "../fixtures/dataset_items.json";
import tasksListFixture from "../fixtures/tasks_list.json";
import taskRunFixture from "../fixtures/task_run.json";
import taskRunSyncFixture from "../fixtures/task_run_sync_dataset_items.json";
import kvRecordFixture from "../fixtures/key_value_store_record.json";

import {
  listActors, getActor,
  runActor, runActorSyncGetDatasetItems,
  getRun, listRuns, abortRun,
  getDataset, getDatasetItems,
  listTasks, runTask, runTaskSyncGetDatasetItems,
  getKeyValueStoreRecord,
  validateActorsListInput, validateActorsGetInput,
  validateActorRunInput, validateActorRunSyncInput,
  validateRunsGetInput, validateRunsListInput, validateRunsAbortInput,
  validateDatasetsGetInput, validateDatasetsItemsInput,
  validateTasksListInput, validateTaskRunInput, validateTaskRunSyncInput,
  validateKeyValueStoreGetRecordInput,
} from "../src/actions";

// ─── actors.list ─────────────────────────────────────────────────────────────

describe("listActors", () => {
  test("validation mode returns validated output", () => {
    const result = listActors({});
    expect(result.source).toBe("connector");
    expect(result.connector).toBe("apify");
    expect(result.action).toBe("actors.list");
    expect(result.validated).toEqual({});
  });

  test("validation with limit and offset", () => {
    const result = listActors({ limit: 10, offset: 20 });
    expect((result.validated as { limit: number; offset: number }).limit).toBe(10);
    expect((result.validated as { limit: number; offset: number }).offset).toBe(20);
  });

  test("calls GET /v2/acts?my=1 with Bearer token", async () => {
    const requests: Request[] = [];
    const result = await listActors({
      apiKey: "apify_api_test",
      limit: 5,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(actorsListFixture), { status: 200 });
      },
    });
    expect(requests).toHaveLength(1);
    const url = new URL(requests[0].url);
    expect(url.pathname).toBe("/v2/acts");
    expect(url.searchParams.get("my")).toBe("1");
    expect(url.searchParams.get("limit")).toBe("5");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer apify_api_test");
    expect(result.connector).toBe("apify");
    expect(result.action).toBe("actors.list");
    expect(result.source).toBe("connector");
    expect(Array.isArray(result.actors)).toBe(true);
    expect((result.actors as unknown[]).length).toBe(2);
    expect(result.total).toBe(2);
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(listActors({
      apiKey: "key",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "30" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 30 });
  });

  test("maps 500 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(listActors({
      apiKey: "key",
      fetch: async () => new Response("{}", { status: 500 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

// ─── actors.get ──────────────────────────────────────────────────────────────

describe("getActor", () => {
  test("validation mode returns validated output", () => {
    const result = getActor({ actorId: "apify~web-scraper" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("actors.get");
    expect((result.validated as { actorId: string }).actorId).toBe("apify~web-scraper");
  });

  test("throws when actorId is missing", () => {
    expect(() => validateActorsGetInput({})).toThrow("actorId is required");
  });

  test("calls GET /v2/acts/{actorId} with Bearer token", async () => {
    const requests: Request[] = [];
    const result = await getActor({
      apiKey: "apify_api_test",
      actorId: "apify~web-scraper",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(actorGetFixture), { status: 200 });
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toContain("/v2/acts/apify~web-scraper");
    expect(requests[0].method).toBe("GET");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer apify_api_test");
    expect(result.action).toBe("actors.get");
    expect(result.actor).toBeDefined();
    expect((result.actor as Record<string, unknown>).id).toBe("moJRLRc85AitArpNN");
  });

  test("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(getActor({
      apiKey: "key",
      actorId: "nonexistent~actor",
      fetch: async () => new Response("{}", { status: 404 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(getActor({
      apiKey: "key",
      actorId: "apify~web-scraper",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "15" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 15 });
  });
});

// ─── actor.run ───────────────────────────────────────────────────────────────

describe("runActor", () => {
  test("validation mode returns validated output", () => {
    const result = runActor({ actorId: "apify~web-scraper", memory: 512 });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("actor.run");
    expect((result.validated as { actorId: string; memory: number }).actorId).toBe("apify~web-scraper");
    expect((result.validated as { actorId: string; memory: number }).memory).toBe(512);
  });

  test("throws when actorId is missing", () => {
    expect(() => validateActorRunInput({})).toThrow("actorId is required");
  });

  test("calls POST /v2/acts/{actorId}/runs with input body", async () => {
    const requests: Request[] = [];
    const runInput = { startUrls: [{ url: "https://example.com" }] };
    const result = await runActor({
      apiKey: "apify_api_test",
      actorId: "apify~web-scraper",
      runInput,
      memory: 1024,
      build: "latest",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(actorRunFixture), { status: 201 });
      },
    });
    expect(requests).toHaveLength(1);
    const url = new URL(requests[0].url);
    expect(url.pathname).toBe("/v2/acts/apify~web-scraper/runs");
    expect(url.searchParams.get("memory")).toBe("1024");
    expect(url.searchParams.get("build")).toBe("latest");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer apify_api_test");
    const body = await requests[0].json() as Record<string, unknown>;
    expect(body.startUrls).toBeDefined();
    expect(result.action).toBe("actor.run");
    expect(result.run).toBeDefined();
    expect((result.run as Record<string, unknown>).status).toBe("RUNNING");
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(runActor({
      apiKey: "key",
      actorId: "apify~web-scraper",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "20" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 20 });
  });

  test("maps 400 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(runActor({
      apiKey: "key",
      actorId: "apify~web-scraper",
      fetch: async () => new Response("{}", { status: 400 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});

// ─── actor.run_sync_get_dataset_items ─────────────────────────────────────────

describe("runActorSyncGetDatasetItems", () => {
  test("validation mode returns validated output", () => {
    const result = runActorSyncGetDatasetItems({ actorId: "apify~web-scraper" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("actor.run_sync_get_dataset_items");
    expect((result.validated as { actorId: string }).actorId).toBe("apify~web-scraper");
  });

  test("throws when actorId is missing", () => {
    expect(() => validateActorRunSyncInput({})).toThrow("actorId is required");
  });

  test("calls POST /v2/acts/{actorId}/run-sync-get-dataset-items and returns items array", async () => {
    const requests: Request[] = [];
    const result = await runActorSyncGetDatasetItems({
      apiKey: "apify_api_test",
      actorId: "apify~web-scraper",
      runInput: { startUrls: [{ url: "https://example.com" }] },
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(actorRunSyncFixture), { status: 200 });
      },
    });
    expect(requests).toHaveLength(1);
    const url = new URL(requests[0].url);
    expect(url.pathname).toBe("/v2/acts/apify~web-scraper/run-sync-get-dataset-items");
    expect(requests[0].method).toBe("POST");
    expect(result.action).toBe("actor.run_sync_get_dataset_items");
    expect(Array.isArray(result.items)).toBe(true);
    expect((result.items as unknown[]).length).toBe(3);
    expect(result.count).toBe(3);
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(runActorSyncGetDatasetItems({
      apiKey: "key",
      actorId: "apify~web-scraper",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "60" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 60 });
  });
});

// ─── runs.get ─────────────────────────────────────────────────────────────────

describe("getRun", () => {
  test("validation mode returns validated output", () => {
    const result = getRun({ runId: "run_001" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("runs.get");
    expect((result.validated as { runId: string }).runId).toBe("run_001");
  });

  test("throws when runId is missing", () => {
    expect(() => validateRunsGetInput({})).toThrow("runId is required");
  });

  test("calls GET /v2/actor-runs/{runId} with Bearer token", async () => {
    const requests: Request[] = [];
    const result = await getRun({
      apiKey: "apify_api_test",
      runId: "HG7ML7M8z78YcAPEB",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(runGetFixture), { status: 200 });
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toContain("/v2/actor-runs/HG7ML7M8z78YcAPEB");
    expect(requests[0].method).toBe("GET");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer apify_api_test");
    expect(result.action).toBe("runs.get");
    expect((result.run as Record<string, unknown>).status).toBe("SUCCEEDED");
    expect((result.run as Record<string, unknown>).defaultDatasetId).toBe("wmKPijuyDnPZAPRMk");
  });

  test("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(getRun({
      apiKey: "key",
      runId: "nonexistent",
      fetch: async () => new Response("{}", { status: 404 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(getRun({
      apiKey: "key",
      runId: "run_001",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "10" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 10 });
  });
});

// ─── runs.list ────────────────────────────────────────────────────────────────

describe("listRuns", () => {
  test("validation mode returns validated output", () => {
    const result = listRuns({ actorId: "apify~web-scraper" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("runs.list");
    expect((result.validated as { actorId: string }).actorId).toBe("apify~web-scraper");
  });

  test("throws when actorId is missing", () => {
    expect(() => validateRunsListInput({})).toThrow("actorId is required");
  });

  test("calls GET /v2/acts/{actorId}/runs with desc=1", async () => {
    const requests: Request[] = [];
    const result = await listRuns({
      apiKey: "apify_api_test",
      actorId: "apify~web-scraper",
      limit: 10,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(runsListFixture), { status: 200 });
      },
    });
    expect(requests).toHaveLength(1);
    const url = new URL(requests[0].url);
    expect(url.pathname).toBe("/v2/acts/apify~web-scraper/runs");
    expect(url.searchParams.get("desc")).toBe("1");
    expect(url.searchParams.get("limit")).toBe("10");
    expect(result.action).toBe("runs.list");
    expect(Array.isArray(result.runs)).toBe(true);
    expect((result.runs as unknown[]).length).toBe(2);
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(listRuns({
      apiKey: "key",
      actorId: "apify~web-scraper",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "5" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 5 });
  });
});

// ─── runs.abort ───────────────────────────────────────────────────────────────

describe("abortRun", () => {
  test("validation mode returns validated output", () => {
    const result = abortRun({ runId: "run_001" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("runs.abort");
    expect((result.validated as { runId: string }).runId).toBe("run_001");
  });

  test("throws when runId is missing", () => {
    expect(() => validateRunsAbortInput({})).toThrow("runId is required");
  });

  test("calls POST /v2/actor-runs/{runId}/abort with Bearer token", async () => {
    const requests: Request[] = [];
    const result = await abortRun({
      apiKey: "apify_api_test",
      runId: "HG7ML7M8z78YcAPEB",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(runAbortFixture), { status: 200 });
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toContain("/v2/actor-runs/HG7ML7M8z78YcAPEB/abort");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer apify_api_test");
    expect(result.action).toBe("runs.abort");
    expect((result.run as Record<string, unknown>).status).toBe("ABORTED");
  });

  test("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(abortRun({
      apiKey: "key",
      runId: "nonexistent",
      fetch: async () => new Response("{}", { status: 404 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(abortRun({
      apiKey: "key",
      runId: "run_001",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "25" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 25 });
  });
});

// ─── datasets.get ────────────────────────────────────────────────────────────

describe("getDataset", () => {
  test("validation mode returns validated output", () => {
    const result = getDataset({ datasetId: "wmKPijuyDnPZAPRMk" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("datasets.get");
    expect((result.validated as { datasetId: string }).datasetId).toBe("wmKPijuyDnPZAPRMk");
  });

  test("throws when datasetId is missing", () => {
    expect(() => validateDatasetsGetInput({})).toThrow("datasetId is required");
  });

  test("calls GET /v2/datasets/{datasetId} with Bearer token", async () => {
    const requests: Request[] = [];
    const result = await getDataset({
      apiKey: "apify_api_test",
      datasetId: "wmKPijuyDnPZAPRMk",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(datasetGetFixture), { status: 200 });
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toContain("/v2/datasets/wmKPijuyDnPZAPRMk");
    expect(requests[0].method).toBe("GET");
    expect(result.action).toBe("datasets.get");
    expect((result.dataset as Record<string, unknown>).itemCount).toBe(3);
  });

  test("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(getDataset({
      apiKey: "key",
      datasetId: "nonexistent",
      fetch: async () => new Response("{}", { status: 404 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(getDataset({
      apiKey: "key",
      datasetId: "ds_001",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "12" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 12 });
  });
});

// ─── datasets.items ──────────────────────────────────────────────────────────

describe("getDatasetItems", () => {
  test("validation mode returns validated output", () => {
    const result = getDatasetItems({ datasetId: "wmKPijuyDnPZAPRMk", limit: 50 });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("datasets.items");
    expect((result.validated as { datasetId: string; limit: number }).datasetId).toBe("wmKPijuyDnPZAPRMk");
    expect((result.validated as { datasetId: string; limit: number }).limit).toBe(50);
  });

  test("throws when datasetId is missing", () => {
    expect(() => validateDatasetsItemsInput({})).toThrow("datasetId is required");
  });

  test("calls GET /v2/datasets/{datasetId}/items with clean=true&format=json", async () => {
    const requests: Request[] = [];
    const result = await getDatasetItems({
      apiKey: "apify_api_test",
      datasetId: "wmKPijuyDnPZAPRMk",
      limit: 10,
      offset: 0,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(datasetItemsFixture), { status: 200 });
      },
    });
    expect(requests).toHaveLength(1);
    const url = new URL(requests[0].url);
    expect(url.pathname).toBe("/v2/datasets/wmKPijuyDnPZAPRMk/items");
    expect(url.searchParams.get("clean")).toBe("true");
    expect(url.searchParams.get("format")).toBe("json");
    expect(url.searchParams.get("limit")).toBe("10");
    expect(result.action).toBe("datasets.items");
    expect(Array.isArray(result.items)).toBe(true);
    expect((result.items as unknown[]).length).toBe(3);
    expect(result.count).toBe(3);
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(getDatasetItems({
      apiKey: "key",
      datasetId: "ds_001",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "8" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 8 });
  });
});

// ─── tasks.list ──────────────────────────────────────────────────────────────

describe("listTasks", () => {
  test("validation mode returns validated output", () => {
    const result = listTasks({});
    expect(result.source).toBe("connector");
    expect(result.action).toBe("tasks.list");
    expect(result.validated).toEqual({});
  });

  test("calls GET /v2/actor-tasks with Bearer token", async () => {
    const requests: Request[] = [];
    const result = await listTasks({
      apiKey: "apify_api_test",
      limit: 5,
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(tasksListFixture), { status: 200 });
      },
    });
    expect(requests).toHaveLength(1);
    const url = new URL(requests[0].url);
    expect(url.pathname).toBe("/v2/actor-tasks");
    expect(url.searchParams.get("limit")).toBe("5");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer apify_api_test");
    expect(result.action).toBe("tasks.list");
    expect(Array.isArray(result.tasks)).toBe(true);
    expect((result.tasks as unknown[]).length).toBe(2);
    expect(result.total).toBe(2);
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(listTasks({
      apiKey: "key",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "45" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 45 });
  });
});

// ─── task.run ────────────────────────────────────────────────────────────────

describe("runTask", () => {
  test("validation mode returns validated output", () => {
    const result = runTask({ taskId: "TASK_ID_001" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("task.run");
    expect((result.validated as { taskId: string }).taskId).toBe("TASK_ID_001");
  });

  test("throws when taskId is missing", () => {
    expect(() => validateTaskRunInput({})).toThrow("taskId is required");
  });

  test("calls POST /v2/actor-tasks/{taskId}/runs with Bearer token", async () => {
    const requests: Request[] = [];
    const result = await runTask({
      apiKey: "apify_api_test",
      taskId: "TASK_ID_001",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(taskRunFixture), { status: 201 });
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toContain("/v2/actor-tasks/TASK_ID_001/runs");
    expect(requests[0].method).toBe("POST");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer apify_api_test");
    expect(result.action).toBe("task.run");
    expect((result.run as Record<string, unknown>).status).toBe("RUNNING");
  });

  test("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(runTask({
      apiKey: "key",
      taskId: "nonexistent",
      fetch: async () => new Response("{}", { status: 404 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(runTask({
      apiKey: "key",
      taskId: "TASK_ID_001",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "35" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 35 });
  });
});

// ─── task.run_sync_get_dataset_items ─────────────────────────────────────────

describe("runTaskSyncGetDatasetItems", () => {
  test("validation mode returns validated output", () => {
    const result = runTaskSyncGetDatasetItems({ taskId: "TASK_ID_001" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("task.run_sync_get_dataset_items");
    expect((result.validated as { taskId: string }).taskId).toBe("TASK_ID_001");
  });

  test("throws when taskId is missing", () => {
    expect(() => validateTaskRunSyncInput({})).toThrow("taskId is required");
  });

  test("calls POST /v2/actor-tasks/{taskId}/run-sync-get-dataset-items and returns items", async () => {
    const requests: Request[] = [];
    const result = await runTaskSyncGetDatasetItems({
      apiKey: "apify_api_test",
      taskId: "TASK_ID_001",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(taskRunSyncFixture), { status: 200 });
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toContain("/v2/actor-tasks/TASK_ID_001/run-sync-get-dataset-items");
    expect(requests[0].method).toBe("POST");
    expect(result.action).toBe("task.run_sync_get_dataset_items");
    expect(Array.isArray(result.items)).toBe(true);
    expect((result.items as unknown[]).length).toBe(2);
    expect(result.count).toBe(2);
  });

  test("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(runTaskSyncGetDatasetItems({
      apiKey: "key",
      taskId: "nonexistent",
      fetch: async () => new Response("{}", { status: 404 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(runTaskSyncGetDatasetItems({
      apiKey: "key",
      taskId: "TASK_ID_001",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "50" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 50 });
  });
});

// ─── key_value_store.get_record ───────────────────────────────────────────────

describe("getKeyValueStoreRecord", () => {
  test("validation mode returns validated output", () => {
    const result = getKeyValueStoreRecord({ storeId: "store_001", recordKey: "OUTPUT" });
    expect(result.source).toBe("connector");
    expect(result.action).toBe("key_value_store.get_record");
    expect((result.validated as { storeId: string; recordKey: string }).storeId).toBe("store_001");
    expect((result.validated as { storeId: string; recordKey: string }).recordKey).toBe("OUTPUT");
  });

  test("throws when storeId is missing", () => {
    expect(() => validateKeyValueStoreGetRecordInput({ recordKey: "OUTPUT" })).toThrow("storeId is required");
  });

  test("throws when recordKey is missing", () => {
    expect(() => validateKeyValueStoreGetRecordInput({ storeId: "store_001" })).toThrow("recordKey is required");
  });

  test("calls GET /v2/key-value-stores/{storeId}/records/{recordKey} with Bearer token", async () => {
    const requests: Request[] = [];
    const result = await getKeyValueStoreRecord({
      apiKey: "apify_api_test",
      storeId: "eJNzqsbPiopwJcgGQ",
      recordKey: "OUTPUT",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(JSON.stringify(kvRecordFixture), { status: 200 });
      },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toContain("/v2/key-value-stores/eJNzqsbPiopwJcgGQ/records/OUTPUT");
    expect(requests[0].method).toBe("GET");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer apify_api_test");
    expect(result.action).toBe("key_value_store.get_record");
    expect(result.value).toBeDefined();
    expect((result.value as Record<string, unknown>).totalItemCount).toBe(3);
  });

  test("maps 404 to CONNECTOR_UPSTREAM_ERROR", async () => {
    await expect(getKeyValueStoreRecord({
      apiKey: "key",
      storeId: "store_001",
      recordKey: "NONEXISTENT",
      fetch: async () => new Response("{}", { status: 404 }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_UPSTREAM_ERROR" });
  });

  test("maps 429 to CONNECTOR_RATE_LIMITED", async () => {
    await expect(getKeyValueStoreRecord({
      apiKey: "key",
      storeId: "store_001",
      recordKey: "OUTPUT",
      fetch: async () => new Response("{}", { status: 429, headers: { "retry-after": "18" } }),
    })).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 18 });
  });
});
