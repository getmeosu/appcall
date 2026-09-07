import { createApifyClient, isRecord, parseApifyRateLimit, prop } from "./http";

export type ActorOption = { id: string; label: string; source: "actor" | "task" | "store" };
export type ActorsOptionsResult = { connector: "apify"; action: "actors.options"; options: ActorOption[] };

type OptionsInput = { apiKey: string; search?: string; fetch?: typeof fetch };

// runnableId builds the tilde-form actorId (username~name) the run endpoints
// accept. Falls back to the raw id when username/name are absent.
function runnableId(item: Record<string, unknown>): string {
  const username = prop(item, "username");
  const name = prop(item, "name");
  return username && name ? `${username}~${name}` : prop(item, "id");
}

function items(body: unknown): Record<string, unknown>[] {
  if (!isRecord(body)) return [];
  const data = isRecord(body.data) ? body.data : {};
  return Array.isArray(data.items) ? (data.items.filter(isRecord) as Record<string, unknown>[]) : [];
}

// throwIfNotOk surfaces upstream failures honestly instead of silently
// returning an empty picker (a 401 must read as an auth error, not "no
// actors"). Mirrors the actions.ts error convention via the shared
// parseApifyRateLimit helper so the registry maps it by error.code.
function throwIfNotOk(status: number, headers: Record<string, string>, message: string): void {
  if (status === 200) return;
  const rl = parseApifyRateLimit(status, headers);
  if (rl.limited) {
    throw { ok: false, code: "CONNECTOR_RATE_LIMITED", message: "Apify rate limit exceeded.", retryAfterSeconds: rl.retryAfterSeconds };
  }
  throw { ok: false, code: "CONNECTOR_UPSTREAM_ERROR", message };
}

export async function actorsOptions(input: OptionsInput): Promise<ActorsOptionsResult> {
  const client = createApifyClient({ apiKey: input.apiKey, fetch: input.fetch, operation: "actors.options" });
  const search = (input.search ?? "").trim();
  const q = search.toLowerCase();
  // When the user is searching, narrow the account actors/tasks by label/id too
  // (the /acts and /actor-tasks listings are not server-side searchable). With
  // no query, every account entry is shown (browse mode). Store results are
  // already query-driven by the API.
  const matches = (label: string, id: string) => !q || label.toLowerCase().includes(q) || id.toLowerCase().includes(q);

  const seen = new Set<string>();
  const options: ActorOption[] = [];
  const add = (id: string, label: string, source: ActorOption["source"]) => {
    if (!id || seen.has(id)) return;
    seen.add(id);
    options.push({ id, label, source });
  };

  // Account first: owned/added actors, then saved tasks (filtered by the query).
  const acts = await client.fetchJSON("/acts?limit=100");
  throwIfNotOk(acts.status, acts.headers, "Apify rejected the actors listing.");
  for (const a of items(acts.body)) {
    const id = runnableId(a);
    const label = prop(a, "name") || id;
    if (matches(label, id)) add(id, label, "actor");
  }

  // Tasks carry their own opaque id (not the actor tilde-form); they live in a
  // separate id namespace, so there is no real dedup collision with actors.
  const tasks = await client.fetchJSON("/actor-tasks?limit=100");
  throwIfNotOk(tasks.status, tasks.headers, "Apify rejected the tasks listing.");
  for (const t of items(tasks.body)) {
    const id = prop(t, "id");
    const label = prop(t, "name") || id;
    if (matches(label, id)) add(id, label, "task");
  }

  // Store fallback: only when the user is actively searching.
  if (search) {
    const store = await client.fetchJSON(`/store?search=${encodeURIComponent(search)}&limit=20&sortBy=relevance`);
    throwIfNotOk(store.status, store.headers, "Apify rejected the store search.");
    for (const s of items(store.body)) add(runnableId(s), prop(s, "title") || prop(s, "name") || runnableId(s), "store");
  }

  return { connector: "apify", action: "actors.options", options };
}

export type ActorInputSchemaResult = { connector: "apify"; action: "actors.input_schema"; schema: Record<string, unknown> };

export async function actorInputSchema(input: { apiKey: string; actorId: string; fetch?: typeof fetch }): Promise<ActorInputSchemaResult> {
  const client = createApifyClient({ apiKey: input.apiKey, fetch: input.fetch, operation: "actors.get" });
  const resp = await client.fetchJSON(`/actors/${encodeURIComponent(input.actorId)}/builds/default`);
  throwIfNotOk(resp.status, resp.headers, "Apify could not load the actor input schema.");
  const body = isRecord(resp.body) ? resp.body : {};
  const data = isRecord(body.data) ? body.data : {};
  const def = isRecord(data.actorDefinition) ? data.actorDefinition : {};
  const schema = isRecord(def.input) ? (def.input as Record<string, unknown>) : { type: "object", properties: {} };
  return { connector: "apify", action: "actors.input_schema", schema };
}
