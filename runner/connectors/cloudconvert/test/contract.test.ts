import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest as never);
const response = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers });

const user = {
  data: {
    id: 1,
    username: "fixture-user",
    email: "fixture@example.com",
    credits: 10,
  },
};

describe("CloudConvert contract", () => {
  test("uses bearer auth on the fixed API host", async () => {
    const seen: Request[] = [];
    await actions["users.show"]!({
      apiKey: "secret",
      fetch: async (input: RequestInfo, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return response(user);
      },
    });
    const url = new URL(seen[0].url);
    expect(url.hostname).toBe("api.cloudconvert.com");
    expect(url.pathname).toBe("/v2/users/me");
    expect(url.search).toBe("");
    expect(seen[0].method).toBe("GET");
    expect(seen[0].headers.get("authorization")).toBe("Bearer secret");
    expect(seen[0].headers.get("accept")).toBe("application/json");
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(await seen[0].text()).toBe("");
  });

  test("keeps webhook and storage URLs in the JSON body", async () => {
    const seen: Request[] = [];
    const fetch = async (input: RequestInfo, init?: RequestInit) => {
      seen.push(new Request(input, init));
      return response({ data: { id: "task_1", operation: "export/s3", status: "waiting" } }, 201);
    };
    await actions["webhooks.create"]!({
      apiKey: "secret",
      url: "https://evil.example/hook",
      event: "job.failed",
      fetch,
    });
    expect(new URL(seen[0].url).hostname).toBe("api.cloudconvert.com");
    expect(new URL(seen[0].url).pathname).toBe("/v2/webhooks");
    expect(seen[0].headers.get("content-type")).toBe("application/json");
    expect(await seen[0].text()).toBe('{"url":"https://evil.example/hook","events":["job.failed"]}');
    await actions["export.s3.create"]!({
      apiKey: "secret",
      input: "task_1",
      bucket: "fixture-bucket",
      region: "eu-central-1",
      endpoint: "https://evil.example",
      accessKeyId: "fixture-access-key",
      secretAccessKey: "fixture-secret-key",
      fetch,
    });
    expect(new URL(seen[1].url).href).toBe("https://api.cloudconvert.com/v2/export/s3");
    expect(await seen[1].text()).toBe('{"input":"task_1","bucket":"fixture-bucket","region":"eu-central-1","endpoint":"https://evil.example","access_key_id":"fixture-access-key","secret_access_key":"fixture-secret-key"}');
    expect(seen).toHaveLength(2);
  });

  test("does not follow a file URL or the next link", async () => {
    const seen: Request[] = [];
    const result = await actions["tasks.list"]!({
      apiKey: "secret",
      fetch: async (input: RequestInfo, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return response({
          data: [{ id: "task_1", result: { files: [{ filename: "a.pdf", url: "https://storage.cloudconvert.com/a.pdf" }] } }],
          links: { next: "https://evil.example/next" },
        });
      },
    });
    expect(seen).toHaveLength(1);
    expect(new URL(seen[0].url).hostname).toBe("api.cloudconvert.com");
    expect(result.data.data[0].result.files[0].url).toBe("https://storage.cloudconvert.com/a.pdf");
  });

  test("validates input, malformed output, 401 and 429", async () => {
    const fetch = async () => response({});
    await expect(actions["export.s3.create"]!({ apiKey: "secret", input: "", bucket: "b", region: "eu-central-1", accessKeyId: "a", secretAccessKey: "s", fetch })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["webhooks.create"]!({ apiKey: "secret", url: "https://hooks.example.test/cloudconvert", event: "job.deleted", fetch })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["tasks.list"]!({ apiKey: "secret", perPage: 1001, fetch })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["users.show"]!({ apiKey: "secret", fetch: async () => response([]) })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["users.show"]!({ apiKey: "secret", fetch: async () => response({}, 401) })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(actions["users.show"]!({ apiKey: "secret", fetch: async () => response({}, 429, { "Retry-After": "4" }) })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });
});
