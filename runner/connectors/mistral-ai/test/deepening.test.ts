import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest as never);
const token = "token";
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

type Call = { url: string; init?: RequestInit };
function capture(body: unknown, status = 200) {
  const calls: Call[] = [];
  const fetchFn = async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return json(body, status);
  };
  return { calls, fetchFn };
}

describe("mistral-ai deepening", () => {
  test("compiles one handler per action", () => {
    const keys = Object.keys(manifest.operations).sort();
    expect(Object.keys(actions).sort()).toEqual(keys);
    expect(keys).toContain("ocr.create");
    expect(keys).toContain("files.upload");
    expect(keys).toContain("workflows.executions.query");
  });

  test("lists files with optional query params", async () => {
    const { calls, fetchFn } = capture({ data: [], total: 0 });
    await actions["files.list"]!({ apiKey: token, after: "file_01example", limit: 10, order: "desc", fetch: fetchFn });
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe("/v1/files");
    expect(url.searchParams.get("after")).toBe("file_01example");
    expect(url.searchParams.get("limit")).toBe("10");
    expect(url.searchParams.get("order")).toBe("desc");
  });

  test("creates OCR and agents completion on documented routes", async () => {
    const ocr = capture({ pages: [] });
    await actions["ocr.create"]!({
      apiKey: token,
      model: "mistral-ocr-latest",
      document: { type: "document_url", document_url: "https://example.com/invoice.pdf" },
      fetch: ocr.fetchFn,
    });
    expect(ocr.calls[0]!.url).toBe("https://api.mistral.ai/v1/ocr");
    expect(JSON.parse(String(ocr.calls[0]!.init?.body))).toEqual({
      model: "mistral-ocr-latest",
      document: { type: "document_url", document_url: "https://example.com/invoice.pdf" },
    });

    const complete = capture({ id: "cmpl" });
    await actions["agents.complete"]!({
      apiKey: token,
      agent_id: "ag_01example",
      messages: [{ role: "user", content: "hello" }],
      fetch: complete.fetchFn,
    });
    expect(complete.calls[0]!.url).toBe("https://api.mistral.ai/v1/agents/completions");
  });

  test("covers observability, connectors, and workflows", async () => {
    const search = capture({ events: [] });
    await actions["observability.chat_completion_events.search"]!({
      apiKey: token,
      search_params: { filters: { field: "model", op: "eq", value: "mistral-large" } },
      fetch: search.fetchFn,
    });
    expect(search.calls[0]!.url).toBe("https://api.mistral.ai/v1/observability/chat-completion-events/search");

    const connector = capture({ id: "github" });
    await actions["connectors.get"]!({ apiKey: token, connector_id_or_name: "github", fetch: connector.fetchFn });
    expect(new URL(connector.calls[0]!.url).pathname).toBe("/v1/connectors/github");

    const query = capture({ result: "ok" });
    await actions["workflows.executions.query"]!({
      apiKey: token,
      execution_id: "exec_01example",
      name: "get_progress",
      fetch: query.fetchFn,
    });
    expect(query.calls[0]!.url).toBe("https://api.mistral.ai/v1/workflows/executions/exec_01example/queries");
    expect(JSON.parse(String(query.calls[0]!.init?.body))).toEqual({ name: "get_progress" });
  });

  test("reads dataset tasks and patches libraries as JSON", async () => {
    const list = capture({ tasks: { count: 0 } });
    await actions["observability.dataset_tasks.list"]!({
      apiKey: token,
      dataset_id: "ds_01example",
      page: 1,
      page_size: 20,
      fetch: list.fetchFn,
    });
    const listUrl = new URL(list.calls[0]!.url);
    expect(listUrl.pathname).toBe("/v1/observability/datasets/ds_01example/tasks");
    expect(listUrl.searchParams.get("page")).toBe("1");
    expect(listUrl.searchParams.get("page_size")).toBe("20");
    expect(list.calls[0]!.init?.method).toBe("GET");
    expect(list.calls[0]!.init?.body).toBeUndefined();
    expect(new Headers(list.calls[0]!.init?.headers).get("content-type")).toBeNull();

    const task = capture({ id: "task_01example", status: "RUNNING" });
    await actions["observability.dataset_tasks.get"]!({
      apiKey: token,
      dataset_id: "ds_01example",
      task_id: "task_01example",
      fetch: task.fetchFn,
    });
    expect(task.calls[0]!.url).toBe("https://api.mistral.ai/v1/observability/datasets/ds_01example/tasks/task_01example");
    expect(task.calls[0]!.init?.body).toBeUndefined();
    expect(new Headers(task.calls[0]!.init?.headers).get("content-type")).toBeNull();

    const library = capture({ id: "lib_01example" });
    await actions["libraries.patch"]!({
      apiKey: token,
      library_id: "lib_01example",
      name: "Notes",
      fetch: library.fetchFn,
    });
    expect(library.calls[0]!.url).toBe("https://api.mistral.ai/v1/libraries/lib_01example");
    expect(library.calls[0]!.init?.method).toBe("PATCH");
    expect(new Headers(library.calls[0]!.init?.headers).get("content-type")).toBe("application/json");
    expect(JSON.parse(String(library.calls[0]!.init?.body))).toEqual({ name: "Notes" });

    const document = capture({ id: "doc_01example" });
    await actions["libraries.documents.patch"]!({
      apiKey: token,
      library_id: "lib_01example",
      document_id: "doc_01example",
      name: "Notes",
      attributes: { topic: "beta" },
      fetch: document.fetchFn,
    });
    expect(document.calls[0]!.url).toBe("https://api.mistral.ai/v1/libraries/lib_01example/documents/doc_01example");
    expect(document.calls[0]!.init?.method).toBe("PATCH");
    expect(new Headers(document.calls[0]!.init?.headers).get("content-type")).toBe("application/json");
    expect(JSON.parse(String(document.calls[0]!.init?.body))).toEqual({
      name: "Notes",
      attributes: { topic: "beta" },
    });
  });

  test("maps rate limits", async () => {
    await expect(
      actions["models.list"]!({ apiKey: token, fetch: async () => json({ message: "slow" }, 429) }),
    ).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED" });
  });
});
