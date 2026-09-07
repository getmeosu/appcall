import { createApifyClient, parseApifyRateLimit, isRecord } from "./http";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${field} is required`);
  return value;
}

function handleError(status: number, headers: Record<string, string>, fallbackMessage: string): { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } } {
  const rl = parseApifyRateLimit(status, headers);
  if (rl.limited) {
    return { ok: false, error: { code: "CONNECTOR_RATE_LIMITED", message: "Apify rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds } };
  }
  return { ok: false, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: fallbackMessage } };
}

function throwIfError(result: { ok: false; error: { code: string; message: string; retryAfterSeconds?: number } }): never {
  throw { ok: false, code: result.error.code, message: result.error.message, retryAfterSeconds: result.error.retryAfterSeconds };
}

function buildRunQueryParams(input: { memory?: number; timeout?: number; build?: string; maxItems?: number }): string {
  const params = new URLSearchParams();
  if (input.memory !== undefined) params.set("memory", String(input.memory));
  if (input.timeout !== undefined) params.set("timeout", String(input.timeout));
  if (input.build !== undefined) params.set("build", input.build);
  if (input.maxItems !== undefined) params.set("maxItems", String(input.maxItems));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

// ─── actors.list ─────────────────────────────────────────────────────────────

export type ActorsListInput = { limit?: number; offset?: number };

export function validateActorsListInput(input: unknown): ActorsListInput {
  if (!isRecord(input)) throw new Error("actors.list input must be an object");
  const payload: ActorsListInput = {};
  if (typeof input.limit === "number") payload.limit = input.limit;
  if (typeof input.offset === "number") payload.offset = input.offset;
  return payload;
}

export function createActorsClient(options: { apiKey: string; fetch?: typeof fetch }) {
  const client = createApifyClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "actors.list" });
  return {
    async list(input: unknown) {
      const payload = validateActorsListInput(input);
      const params = new URLSearchParams({ my: "1" });
      if (payload.limit !== undefined) params.set("limit", String(payload.limit));
      if (payload.offset !== undefined) params.set("offset", String(payload.offset));
      const response = await client.fetchJSON(`/acts?${params.toString()}`);
      if (response.status === 200) {
        const body = response.body as Record<string, unknown>;
        const data = isRecord(body.data) ? body.data : body;
        const items = Array.isArray((data as Record<string, unknown>).items) ? (data as Record<string, unknown>).items as unknown[] : [];
        return {
          ok: true as const,
          actors: items,
          total: typeof (data as Record<string, unknown>).total === "number" ? (data as Record<string, unknown>).total as number : items.length,
          count: typeof (data as Record<string, unknown>).count === "number" ? (data as Record<string, unknown>).count as number : items.length,
          offset: typeof (data as Record<string, unknown>).offset === "number" ? (data as Record<string, unknown>).offset as number : 0,
        };
      }
      return handleError(response.status, response.headers, "Apify rejected the actors.list request.");
    },

    async get(input: unknown) {
      if (!isRecord(input)) throw new Error("actors.get input must be an object");
      const actorId = requireString(input.actorId, "actorId");
      const response = await client.fetchJSON(`/acts/${encodeURIComponent(actorId)}`);
      if (response.status === 200) {
        const body = response.body as Record<string, unknown>;
        const actor = isRecord(body.data) ? body.data : body;
        return { ok: true as const, actor };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Actor not found." } };
      }
      return handleError(response.status, response.headers, "Apify rejected the actors.get request.");
    },
  };
}

export function validateActorsGetInput(input: unknown): { actorId: string } {
  if (!isRecord(input)) throw new Error("actors.get input must be an object");
  return { actorId: requireString(input.actorId, "actorId") };
}

export function listActors(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    return createActorsClient({
      apiKey: input.apiKey,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).list(input).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "apify", action: "actors.list", source: "connector", actors: result.actors, total: result.total, count: result.count, offset: result.offset };
    });
  }
  return { connector: "apify", action: "actors.list", source: "connector", validated: validateActorsListInput(input) };
}

export function getActor(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    return createActorsClient({
      apiKey: input.apiKey,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).get(input).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "apify", action: "actors.get", source: "connector", actor: result.actor };
    });
  }
  return { connector: "apify", action: "actors.get", source: "connector", validated: validateActorsGetInput(input) };
}

// ─── actor.run ────────────────────────────────────────────────────────────────

export type ActorRunInput = { actorId: string; runInput?: Record<string, unknown>; memory?: number; timeout?: number; build?: string; maxItems?: number };

export function validateActorRunInput(input: unknown): ActorRunInput {
  if (!isRecord(input)) throw new Error("actor.run input must be an object");
  return {
    actorId: requireString(input.actorId, "actorId"),
    runInput: isRecord(input.runInput) ? input.runInput : undefined,
    memory: typeof input.memory === "number" ? input.memory : undefined,
    timeout: typeof input.timeout === "number" ? input.timeout : undefined,
    build: typeof input.build === "string" ? input.build : undefined,
    maxItems: typeof input.maxItems === "number" ? input.maxItems : undefined,
  };
}

export function createActorRunClient(options: { apiKey: string; fetch?: typeof fetch }) {
  const client = createApifyClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "actor.run" });
  return {
    async run(input: unknown) {
      const payload = validateActorRunInput(input);
      const qs = buildRunQueryParams(payload);
      const response = await client.fetchJSON(`/acts/${encodeURIComponent(payload.actorId)}/runs${qs}`, {
        method: "POST",
        body: JSON.stringify(payload.runInput ?? {}),
      });
      if (response.status === 201 || response.status === 200) {
        const body = response.body as Record<string, unknown>;
        const run = isRecord(body.data) ? body.data : body;
        return { ok: true as const, run };
      }
      return handleError(response.status, response.headers, "Apify rejected the actor.run request.");
    },
  };
}

export function runActor(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    return createActorRunClient({
      apiKey: input.apiKey,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).run(input).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "apify", action: "actor.run", source: "connector", run: result.run };
    });
  }
  return { connector: "apify", action: "actor.run", source: "connector", validated: validateActorRunInput(input) };
}

// ─── actor.run_sync_get_dataset_items ─────────────────────────────────────────

export type ActorRunSyncInput = { actorId: string; runInput?: Record<string, unknown>; memory?: number; timeout?: number; build?: string; maxItems?: number };

export function validateActorRunSyncInput(input: unknown): ActorRunSyncInput {
  if (!isRecord(input)) throw new Error("actor.run_sync_get_dataset_items input must be an object");
  return {
    actorId: requireString(input.actorId, "actorId"),
    runInput: isRecord(input.runInput) ? input.runInput : undefined,
    memory: typeof input.memory === "number" ? input.memory : undefined,
    timeout: typeof input.timeout === "number" ? input.timeout : undefined,
    build: typeof input.build === "string" ? input.build : undefined,
    maxItems: typeof input.maxItems === "number" ? input.maxItems : undefined,
  };
}

export function createActorRunSyncClient(options: { apiKey: string; fetch?: typeof fetch }) {
  const client = createApifyClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "actor.run_sync_get_dataset_items" });
  return {
    async runSyncGetItems(input: unknown) {
      const payload = validateActorRunSyncInput(input);
      const qs = buildRunQueryParams(payload);
      const response = await client.fetchJSON(`/acts/${encodeURIComponent(payload.actorId)}/run-sync-get-dataset-items${qs}`, {
        method: "POST",
        body: JSON.stringify(payload.runInput ?? {}),
      });
      if (response.status === 200 || response.status === 201) {
        // For run-sync-get-dataset-items, the body IS the items array directly
        const items = Array.isArray(response.body) ? response.body : (isRecord(response.body) && Array.isArray((response.body as Record<string, unknown>).items) ? (response.body as Record<string, unknown>).items as unknown[] : []);
        return { ok: true as const, items, count: items.length };
      }
      return handleError(response.status, response.headers, "Apify rejected the actor.run_sync_get_dataset_items request.");
    },
  };
}

export function runActorSyncGetDatasetItems(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    return createActorRunSyncClient({
      apiKey: input.apiKey,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).runSyncGetItems(input).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "apify", action: "actor.run_sync_get_dataset_items", source: "connector", items: result.items, count: result.count };
    });
  }
  return { connector: "apify", action: "actor.run_sync_get_dataset_items", source: "connector", validated: validateActorRunSyncInput(input) };
}

// ─── runs.get ─────────────────────────────────────────────────────────────────

export type RunsGetInput = { runId: string };

export function validateRunsGetInput(input: unknown): RunsGetInput {
  if (!isRecord(input)) throw new Error("runs.get input must be an object");
  return { runId: requireString(input.runId, "runId") };
}

export function createRunsClient(options: { apiKey: string; fetch?: typeof fetch }) {
  const client = createApifyClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "runs.get" });
  return {
    async get(input: unknown) {
      const payload = validateRunsGetInput(input);
      const response = await client.fetchJSON(`/actor-runs/${encodeURIComponent(payload.runId)}`);
      if (response.status === 200) {
        const body = response.body as Record<string, unknown>;
        const run = isRecord(body.data) ? body.data : body;
        return { ok: true as const, run };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Run not found." } };
      }
      return handleError(response.status, response.headers, "Apify rejected the runs.get request.");
    },
  };
}

export function getRun(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    return createRunsClient({
      apiKey: input.apiKey,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).get(input).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "apify", action: "runs.get", source: "connector", run: result.run };
    });
  }
  return { connector: "apify", action: "runs.get", source: "connector", validated: validateRunsGetInput(input) };
}

// ─── runs.list ────────────────────────────────────────────────────────────────

export type RunsListInput = { actorId: string; limit?: number; offset?: number };

export function validateRunsListInput(input: unknown): RunsListInput {
  if (!isRecord(input)) throw new Error("runs.list input must be an object");
  return {
    actorId: requireString(input.actorId, "actorId"),
    limit: typeof input.limit === "number" ? input.limit : undefined,
    offset: typeof input.offset === "number" ? input.offset : undefined,
  };
}

export function createRunsListClient(options: { apiKey: string; fetch?: typeof fetch }) {
  const client = createApifyClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "runs.list" });
  return {
    async list(input: unknown) {
      const payload = validateRunsListInput(input);
      const params = new URLSearchParams({ desc: "1" });
      if (payload.limit !== undefined) params.set("limit", String(payload.limit));
      if (payload.offset !== undefined) params.set("offset", String(payload.offset));
      const response = await client.fetchJSON(`/acts/${encodeURIComponent(payload.actorId)}/runs?${params.toString()}`);
      if (response.status === 200) {
        const body = response.body as Record<string, unknown>;
        const data = isRecord(body.data) ? body.data : body;
        const items = Array.isArray((data as Record<string, unknown>).items) ? (data as Record<string, unknown>).items as unknown[] : [];
        return {
          ok: true as const,
          runs: items,
          total: typeof (data as Record<string, unknown>).total === "number" ? (data as Record<string, unknown>).total as number : items.length,
          count: typeof (data as Record<string, unknown>).count === "number" ? (data as Record<string, unknown>).count as number : items.length,
          offset: typeof (data as Record<string, unknown>).offset === "number" ? (data as Record<string, unknown>).offset as number : 0,
        };
      }
      return handleError(response.status, response.headers, "Apify rejected the runs.list request.");
    },
  };
}

export function listRuns(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    return createRunsListClient({
      apiKey: input.apiKey,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).list(input).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "apify", action: "runs.list", source: "connector", runs: result.runs, total: result.total, count: result.count, offset: result.offset };
    });
  }
  return { connector: "apify", action: "runs.list", source: "connector", validated: validateRunsListInput(input) };
}

// ─── runs.abort ───────────────────────────────────────────────────────────────

export type RunsAbortInput = { runId: string };

export function validateRunsAbortInput(input: unknown): RunsAbortInput {
  if (!isRecord(input)) throw new Error("runs.abort input must be an object");
  return { runId: requireString(input.runId, "runId") };
}

export function createRunsAbortClient(options: { apiKey: string; fetch?: typeof fetch }) {
  const client = createApifyClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "runs.abort" });
  return {
    async abort(input: unknown) {
      const payload = validateRunsAbortInput(input);
      const response = await client.fetchJSON(`/actor-runs/${encodeURIComponent(payload.runId)}/abort`, {
        method: "POST",
      });
      if (response.status === 200 || response.status === 201) {
        const body = response.body as Record<string, unknown>;
        const run = isRecord(body.data) ? body.data : body;
        return { ok: true as const, run };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Run not found." } };
      }
      return handleError(response.status, response.headers, "Apify rejected the runs.abort request.");
    },
  };
}

export function abortRun(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    return createRunsAbortClient({
      apiKey: input.apiKey,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).abort(input).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "apify", action: "runs.abort", source: "connector", run: result.run };
    });
  }
  return { connector: "apify", action: "runs.abort", source: "connector", validated: validateRunsAbortInput(input) };
}

// ─── datasets.get ────────────────────────────────────────────────────────────

export type DatasetsGetInput = { datasetId: string };

export function validateDatasetsGetInput(input: unknown): DatasetsGetInput {
  if (!isRecord(input)) throw new Error("datasets.get input must be an object");
  return { datasetId: requireString(input.datasetId, "datasetId") };
}

export function createDatasetsClient(options: { apiKey: string; fetch?: typeof fetch }) {
  const client = createApifyClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "datasets.get" });
  return {
    async get(input: unknown) {
      const payload = validateDatasetsGetInput(input);
      const response = await client.fetchJSON(`/datasets/${encodeURIComponent(payload.datasetId)}`);
      if (response.status === 200) {
        const body = response.body as Record<string, unknown>;
        const dataset = isRecord(body.data) ? body.data : body;
        return { ok: true as const, dataset };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Dataset not found." } };
      }
      return handleError(response.status, response.headers, "Apify rejected the datasets.get request.");
    },
  };
}

export function getDataset(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    return createDatasetsClient({
      apiKey: input.apiKey,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).get(input).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "apify", action: "datasets.get", source: "connector", dataset: result.dataset };
    });
  }
  return { connector: "apify", action: "datasets.get", source: "connector", validated: validateDatasetsGetInput(input) };
}

// ─── datasets.items ──────────────────────────────────────────────────────────

export type DatasetsItemsInput = { datasetId: string; limit?: number; offset?: number };

export function validateDatasetsItemsInput(input: unknown): DatasetsItemsInput {
  if (!isRecord(input)) throw new Error("datasets.items input must be an object");
  return {
    datasetId: requireString(input.datasetId, "datasetId"),
    limit: typeof input.limit === "number" ? input.limit : undefined,
    offset: typeof input.offset === "number" ? input.offset : undefined,
  };
}

export function createDatasetsItemsClient(options: { apiKey: string; fetch?: typeof fetch }) {
  const client = createApifyClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "datasets.items" });
  return {
    async items(input: unknown) {
      const payload = validateDatasetsItemsInput(input);
      const params = new URLSearchParams({ clean: "true", format: "json" });
      if (payload.limit !== undefined) params.set("limit", String(payload.limit));
      if (payload.offset !== undefined) params.set("offset", String(payload.offset));
      const response = await client.fetchJSON(`/datasets/${encodeURIComponent(payload.datasetId)}/items?${params.toString()}`);
      if (response.status === 200) {
        // Apify returns items array directly for dataset items endpoint
        const items = Array.isArray(response.body) ? response.body : [];
        return {
          ok: true as const,
          items,
          count: items.length,
          total: items.length,
          offset: payload.offset ?? 0,
        };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Dataset not found." } };
      }
      return handleError(response.status, response.headers, "Apify rejected the datasets.items request.");
    },
  };
}

export function getDatasetItems(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    return createDatasetsItemsClient({
      apiKey: input.apiKey,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).items(input).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "apify", action: "datasets.items", source: "connector", items: result.items, count: result.count, total: result.total, offset: result.offset };
    });
  }
  return { connector: "apify", action: "datasets.items", source: "connector", validated: validateDatasetsItemsInput(input) };
}

// ─── tasks.list ──────────────────────────────────────────────────────────────

export type TasksListInput = { limit?: number; offset?: number };

export function validateTasksListInput(input: unknown): TasksListInput {
  if (!isRecord(input)) throw new Error("tasks.list input must be an object");
  const payload: TasksListInput = {};
  if (typeof input.limit === "number") payload.limit = input.limit;
  if (typeof input.offset === "number") payload.offset = input.offset;
  return payload;
}

export function createTasksClient(options: { apiKey: string; fetch?: typeof fetch }) {
  const client = createApifyClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "tasks.list" });
  return {
    async list(input: unknown) {
      const payload = validateTasksListInput(input);
      const params = new URLSearchParams();
      if (payload.limit !== undefined) params.set("limit", String(payload.limit));
      if (payload.offset !== undefined) params.set("offset", String(payload.offset));
      const qs = params.toString();
      const response = await client.fetchJSON(`/actor-tasks${qs ? `?${qs}` : ""}`);
      if (response.status === 200) {
        const body = response.body as Record<string, unknown>;
        const data = isRecord(body.data) ? body.data : body;
        const items = Array.isArray((data as Record<string, unknown>).items) ? (data as Record<string, unknown>).items as unknown[] : [];
        return {
          ok: true as const,
          tasks: items,
          total: typeof (data as Record<string, unknown>).total === "number" ? (data as Record<string, unknown>).total as number : items.length,
          count: typeof (data as Record<string, unknown>).count === "number" ? (data as Record<string, unknown>).count as number : items.length,
          offset: typeof (data as Record<string, unknown>).offset === "number" ? (data as Record<string, unknown>).offset as number : 0,
        };
      }
      return handleError(response.status, response.headers, "Apify rejected the tasks.list request.");
    },
  };
}

export function listTasks(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    return createTasksClient({
      apiKey: input.apiKey,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).list(input).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "apify", action: "tasks.list", source: "connector", tasks: result.tasks, total: result.total, count: result.count, offset: result.offset };
    });
  }
  return { connector: "apify", action: "tasks.list", source: "connector", validated: validateTasksListInput(input) };
}

// ─── task.run ────────────────────────────────────────────────────────────────

export type TaskRunInput = { taskId: string; runInput?: Record<string, unknown> };

export function validateTaskRunInput(input: unknown): TaskRunInput {
  if (!isRecord(input)) throw new Error("task.run input must be an object");
  return {
    taskId: requireString(input.taskId, "taskId"),
    runInput: isRecord(input.runInput) ? input.runInput : undefined,
  };
}

export function createTaskRunClient(options: { apiKey: string; fetch?: typeof fetch }) {
  const client = createApifyClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "task.run" });
  return {
    async run(input: unknown) {
      const payload = validateTaskRunInput(input);
      const response = await client.fetchJSON(`/actor-tasks/${encodeURIComponent(payload.taskId)}/runs`, {
        method: "POST",
        body: JSON.stringify(payload.runInput ?? {}),
      });
      if (response.status === 201 || response.status === 200) {
        const body = response.body as Record<string, unknown>;
        const run = isRecord(body.data) ? body.data : body;
        return { ok: true as const, run };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Task not found." } };
      }
      return handleError(response.status, response.headers, "Apify rejected the task.run request.");
    },
  };
}

export function runTask(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    return createTaskRunClient({
      apiKey: input.apiKey,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).run(input).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "apify", action: "task.run", source: "connector", run: result.run };
    });
  }
  return { connector: "apify", action: "task.run", source: "connector", validated: validateTaskRunInput(input) };
}

// ─── task.run_sync_get_dataset_items ─────────────────────────────────────────

export type TaskRunSyncInput = { taskId: string; runInput?: Record<string, unknown> };

export function validateTaskRunSyncInput(input: unknown): TaskRunSyncInput {
  if (!isRecord(input)) throw new Error("task.run_sync_get_dataset_items input must be an object");
  return {
    taskId: requireString(input.taskId, "taskId"),
    runInput: isRecord(input.runInput) ? input.runInput : undefined,
  };
}

export function createTaskRunSyncClient(options: { apiKey: string; fetch?: typeof fetch }) {
  const client = createApifyClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "task.run_sync_get_dataset_items" });
  return {
    async runSyncGetItems(input: unknown) {
      const payload = validateTaskRunSyncInput(input);
      const response = await client.fetchJSON(`/actor-tasks/${encodeURIComponent(payload.taskId)}/run-sync-get-dataset-items`, {
        method: "POST",
        body: JSON.stringify(payload.runInput ?? {}),
      });
      if (response.status === 200 || response.status === 201) {
        const items = Array.isArray(response.body) ? response.body : (isRecord(response.body) && Array.isArray((response.body as Record<string, unknown>).items) ? (response.body as Record<string, unknown>).items as unknown[] : []);
        return { ok: true as const, items, count: items.length };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Task not found." } };
      }
      return handleError(response.status, response.headers, "Apify rejected the task.run_sync_get_dataset_items request.");
    },
  };
}

export function runTaskSyncGetDatasetItems(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    return createTaskRunSyncClient({
      apiKey: input.apiKey,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).runSyncGetItems(input).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "apify", action: "task.run_sync_get_dataset_items", source: "connector", items: result.items, count: result.count };
    });
  }
  return { connector: "apify", action: "task.run_sync_get_dataset_items", source: "connector", validated: validateTaskRunSyncInput(input) };
}

// ─── key_value_store.get_record ───────────────────────────────────────────────

export type KeyValueStoreGetRecordInput = { storeId: string; recordKey: string };

export function validateKeyValueStoreGetRecordInput(input: unknown): KeyValueStoreGetRecordInput {
  if (!isRecord(input)) throw new Error("key_value_store.get_record input must be an object");
  return {
    storeId: requireString(input.storeId, "storeId"),
    recordKey: requireString(input.recordKey, "recordKey"),
  };
}

export function createKeyValueStoreClient(options: { apiKey: string; fetch?: typeof fetch }) {
  const client = createApifyClient({ apiKey: options.apiKey, fetch: options.fetch, operation: "key_value_store.get_record" });
  return {
    async getRecord(input: unknown) {
      const payload = validateKeyValueStoreGetRecordInput(input);
      const response = await client.fetchJSON(`/key-value-stores/${encodeURIComponent(payload.storeId)}/records/${encodeURIComponent(payload.recordKey)}`);
      if (response.status === 200) {
        return { ok: true as const, value: response.body };
      }
      if (response.status === 404) {
        return { ok: false as const, error: { code: "CONNECTOR_UPSTREAM_ERROR", message: "Record not found." } };
      }
      return handleError(response.status, response.headers, "Apify rejected the key_value_store.get_record request.");
    },
  };
}

export function getKeyValueStoreRecord(input: unknown): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (isRecord(input) && typeof input.apiKey === "string") {
    return createKeyValueStoreClient({
      apiKey: input.apiKey,
      fetch: typeof input.fetch === "function" ? input.fetch as typeof fetch : undefined,
    }).getRecord(input).then((result) => {
      if (!result.ok) throwIfError(result);
      return { connector: "apify", action: "key_value_store.get_record", source: "connector", value: result.value };
    });
  }
  return { connector: "apify", action: "key_value_store.get_record", source: "connector", validated: validateKeyValueStoreGetRecordInput(input) };
}
