import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest);
const apiKey = "fixture-api-token";

const response = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers });

async function capture(
  operation: string,
  input: Record<string, unknown>,
  body: unknown = { ok: true },
  status = 200,
  headers?: HeadersInit,
) {
  const seen: Request[] = [];
  const result = await actions[operation]!({
    apiKey,
    ...input,
    fetch: async (url: RequestInfo | URL, init?: RequestInit) => {
      seen.push(new Request(url, init));
      return response(body, status, headers);
    },
  });
  return { seen, result };
}

describe("Cloudsmith read contract", () => {
  test("healthcheck sends the API key and no body", async () => {
    const { seen, result } = await capture("healthcheck", {}, { authenticated: true, slug: "ada" });
    expect(seen).toHaveLength(1);
    expect(seen[0].method).toBe("GET");
    expect(seen[0].url).toBe("https://api.cloudsmith.io/user/self/");
    expect(seen[0].headers.get("x-api-key")).toBe(apiKey);
    expect(seen[0].headers.get("authorization")).toBeNull();
    expect(seen[0].headers.get("accept")).toBe("application/json");
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(await seen[0].text()).toBe("");
    expect(result).toEqual({
      connector: "cloudsmith",
      action: "healthcheck",
      source: "provider",
      data: { authenticated: true, slug: "ada" },
    });
  });

  test("encodes path segments and does not follow a next link", async () => {
    const { seen, result } = await capture(
      "packages.get",
      { owner: "acme", repo: "widgets", identifier: "pkg/a" },
      { identifier_perm: "pkg/a", self_url: "https://evil.example/next" },
    );
    const url = new URL(seen[0].url);
    expect(url.hostname).toBe("api.cloudsmith.io");
    expect(url.pathname).toBe("/packages/acme/widgets/pkg%2Fa/");
    expect(url.search).toBe("");
    expect(seen).toHaveLength(1);
    expect(result.data).toEqual({ identifier_perm: "pkg/a", self_url: "https://evil.example/next" });
  });

  test("rejects dot segments, extra fields, and an oversized page", async () => {
    await expect(actions["repositories.get"]!({ apiKey, owner: "..", identifier: "widgets", fetch: async () => response({}) })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["organizations.list"]!({ apiKey, url: "https://evil.example", fetch: async () => response([]) })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["packages.search"]!({ apiKey, owner: "acme", repo: "widgets", page_size: 501, fetch: async () => response([]) })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
  });

  test("validates list output, 401, and a far rate-limit reset", async () => {
    await expect(actions["organizations.list"]!({ apiKey, fetch: async () => response({ data: [] }) })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["users.current"]!({ apiKey, fetch: async () => response({ detail: "Invalid token." }, 401) })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(actions["rates.limits"]!({ apiKey, fetch: async () => response({ detail: "throttled" }, 429, { "X-RateLimit-Reset": "1" }) })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 30 });
  });

  test("drops repository signing keys and sends official list query names", async () => {
    const repo = await capture("repositories.get", { owner: "acme", identifier: "widgets" }, {
      slug: "widgets",
      ecdsa_keys: { private: "secret" },
      gpg_keys: { armored: "secret" },
    });
    expect(repo.result.data).toEqual({ slug: "widgets" });
    const listed = await capture("packages.search", {
      owner: "acme",
      repo: "widgets",
      query: "name:lodash",
      include_connected_repositories: true,
    }, []);
    const url = new URL(listed.seen[0].url);
    expect(url.pathname).toBe("/packages/acme/widgets/");
    expect(url.searchParams.get("query")).toBe("name:lodash");
    expect(url.searchParams.get("include_connected_repositories")).toBe("true");
    expect(url.searchParams.get("page")).toBeNull();
    expect(listed.seen[0].headers.get("content-type")).toBeNull();
  });
});
