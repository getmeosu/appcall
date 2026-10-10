import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest as never);
const response = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers });

describe("semantic-scholar declarative Composio contract", () => {
  test("compiles every declared action with a request block", () => {
    const compiled = Object.keys(actions).sort();
    const declared = Object.entries(manifest.operations)
      .filter(([, op]) => (op as { kind: string }).kind === "action" && (op as { request?: unknown }).request)
      .map(([key]) => key)
      .sort();
    expect(compiled).toEqual(declared);
    expect(compiled.length).toBe(Object.keys(manifest.operations).length);
  });

  test("origin healthcheck keeps the documented example paper lookup", async () => {
    const seen: Request[] = [];
    const body = { paperId: "649def34f8be52c8b66281af98ae884c09aef38b", title: "Construction of the Literature Graph in Semantic Scholar" };
    const result = await actions.healthcheck!({
      apiKey: "secret",
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response(body);
      },
    });
    expect(seen[0]!.url).toBe(
      "https://api.semanticscholar.org/graph/v1/paper/649def34f8be52c8b66281af98ae884c09aef38b",
    );
    expect(seen[0]!.headers.get("x-api-key")).toBe("secret");
    expect(seen[0]!.headers.get("accept")).toBe("application/json");
    expect(result).toMatchObject({ connector: "semantic-scholar", action: "healthcheck", source: "provider", data: body });
  });

  test("papers.get URI-encodes external identifiers", async () => {
    const seen: Request[] = [];
    await actions["papers.get"]!({
      apiKey: "secret",
      paperId: "DOI:10.18653/v1/N18-3011",
      fields: "title,year",
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response({ paperId: "x", title: "t" });
      },
    });
    const url = new URL(seen[0]!.url);
    expect(url.pathname).toBe("/graph/v1/paper/DOI%3A10.18653%2Fv1%2FN18-3011");
    expect(url.searchParams.get("fields")).toBe("title,year");
  });

  test("omits optional Graph query parameters", async () => {
    const seen: Request[] = [];
    await actions["papers.search"]!({
      apiKey: "secret",
      query: "covid",
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response({ data: [] });
      },
    });
    const url = new URL(seen[0]!.url);
    expect(url.pathname).toBe("/graph/v1/paper/search");
    expect(url.searchParams.get("query")).toBe("covid");
    expect(url.searchParams.has("fields")).toBe(false);
    expect(url.searchParams.has("limit")).toBe(false);
    expect(url.searchParams.has("offset")).toBe(false);
    expect(url.searchParams.has("openAccessPdf")).toBe(false);
  });

  test("paper batch posts ids and optional fields", async () => {
    const seen: Request[] = [];
    await actions["papers.batch"]!({
      apiKey: "secret",
      ids: ["649def34f8be52c8b66281af98ae884c09aef38b", "ARXIV:2106.15928"],
      fields: "title",
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response([{ paperId: "a" }, { paperId: "b" }]);
      },
    });
    const url = new URL(seen[0]!.url);
    expect(seen[0]!.method).toBe("POST");
    expect(url.pathname).toBe("/graph/v1/paper/batch");
    expect(url.searchParams.get("fields")).toBe("title");
    expect(seen[0]!.headers.get("content-type")).toBe("application/json");
    expect(await seen[0]!.clone().text()).toBe(
      JSON.stringify({ ids: ["649def34f8be52c8b66281af98ae884c09aef38b", "ARXIV:2106.15928"] }),
    );
  });

  test("author batch posts ids", async () => {
    const seen: Request[] = [];
    await actions["authors.batch"]!({
      apiKey: "secret",
      ids: ["145612610"],
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response([{ authorId: "145612610" }]);
      },
    });
    expect(seen[0]!.method).toBe("POST");
    expect(new URL(seen[0]!.url).pathname).toBe("/graph/v1/author/batch");
    expect(await seen[0]!.clone().text()).toBe(JSON.stringify({ ids: ["145612610"] }));
  });

  test("recommendations post positive paper ids", async () => {
    const seen: Request[] = [];
    await actions["papers.recommendations"]!({
      apiKey: "secret",
      positivePaperIds: ["649def34f8be52c8b66281af98ae884c09aef38b"],
      negativePaperIds: ["ARXIV:2106.15928"],
      limit: 5,
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response({ recommendedPapers: [] });
      },
    });
    const url = new URL(seen[0]!.url);
    expect(seen[0]!.method).toBe("POST");
    expect(url.pathname).toBe("/recommendations/v1/papers/");
    expect(url.searchParams.get("limit")).toBe("5");
    expect(JSON.parse(await seen[0]!.clone().text())).toEqual({
      negativePaperIds: ["ARXIV:2106.15928"],
      positivePaperIds: ["649def34f8be52c8b66281af98ae884c09aef38b"],
    });
  });

  test("recommendations for a paper encode the path and from pool", async () => {
    const seen: Request[] = [];
    await actions["papers.recommendations.for_paper"]!({
      apiKey: "secret",
      paperId: "ARXIV:1810.04805",
      from: "all-cs",
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response({ recommendedPapers: [] });
      },
    });
    const url = new URL(seen[0]!.url);
    expect(url.pathname).toBe("/recommendations/v1/papers/forpaper/ARXIV%3A1810.04805");
    expect(url.searchParams.get("from")).toBe("all-cs");
  });

  test("dataset diffs interpolate all three path segments", async () => {
    const seen: Request[] = [];
    await actions["datasets.diffs"]!({
      apiKey: "secret",
      startReleaseId: "2023-08-01",
      endReleaseId: "latest",
      datasetName: "papers",
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return response({ diffs: [] });
      },
    });
    expect(new URL(seen[0]!.url).pathname).toBe("/datasets/v1/diffs/2023-08-01/to/latest/papers");
  });

  test("rejects missing required input before network", async () => {
    let called = false;
    await expect(
      actions["papers.get"]!({
        apiKey: "secret",
        fetch: async () => {
          called = true;
          return response({});
        },
      }),
    ).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    expect(called).toBe(false);
  });

  test("maps throttling without exposing credentials", async () => {
    await expect(
      actions.healthcheck!({
        apiKey: "secret",
        fetch: async () => response({ message: "slow" }, 429, { "Retry-After": "7" }),
      }),
    ).rejects.toMatchObject({ ok: false, code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 7 });
  });

  test("maps HTTP 403 to upstream error", async () => {
    await expect(
      actions["papers.search"]!({
        apiKey: "secret",
        query: "covid",
        fetch: async () => response({ error: "Invalid authentication credentials" }, 403),
      }),
    ).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
  });
});
