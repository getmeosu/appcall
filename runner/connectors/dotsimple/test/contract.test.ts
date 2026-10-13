import { describe, expect, test } from "bun:test";
import { compileDeclarativeConnector } from "../../../bun/src/declarative/compile";
import manifest from "../manifest.json";

const { actions } = compileDeclarativeConnector(manifest as never);
const response = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers });

const workspaceId = "2576cb55-ab0f-3708-9388-6d03290fcb3f";

describe("Dotsimple contract", () => {
  test("uses bearer auth on the fixed app host", async () => {
    const seen: Request[] = [];
    await actions["accounts.list"]!({
      apiKey: "secret",
      workspaceId,
      fetch: async (input: RequestInfo, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return response({ data: [{ id: 1, uuid: "85347d5e-9724-4cb6-b91c-82d6d6d4e992" }] });
      },
    });
    const url = new URL(seen[0].url);
    expect(url.hostname).toBe("app.dotsimple.io");
    expect(url.pathname).toBe(`/app/api/${workspaceId}/accounts`);
    expect(url.search).toBe("");
    expect(seen[0].headers.get("authorization")).toBe("Bearer secret");
    expect(seen[0].headers.get("accept")).toBe("application/json");
    expect(seen[0].headers.get("content-type")).toBeNull();
    expect(seen[0].method).toBe("GET");
  });

  test("encodes a media id and does not follow a storage URL", async () => {
    const seen: Request[] = [];
    const result = await actions["media.get"]!({
      apiKey: "secret",
      workspaceId,
      mediaFileId: "file/a",
      fetch: async (input: RequestInfo, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return response({
          id: "1",
          uuid: "file/a",
          url: "https://evil.example/storage/file.png",
        });
      },
    });
    const url = new URL(seen[0].url);
    expect(url.hostname).toBe("app.dotsimple.io");
    expect(url.pathname).toBe(`/app/api/${workspaceId}/media/file%2Fa`);
    expect(result.data.uuid).toBe("file/a");
    expect(seen).toHaveLength(1);
  });

  test("sends the documented tag JSON body", async () => {
    const seen: Request[] = [];
    await actions["tags.create"]!({
      apiKey: "secret",
      workspaceId,
      name: "news",
      hex_color: "#38bdf8",
      fetch: async (input: RequestInfo, init?: RequestInit) => {
        seen.push(new Request(input, init));
        return response({ id: 3, uuid: "a09367a5-dfc1-43d7-9557-70eb93e01e01", name: "news", hex_color: "#38bdf8" });
      },
    });
    expect(seen[0].method).toBe("POST");
    expect(seen[0].headers.get("content-type")).toBe("application/json");
    expect(await seen[0].text()).toBe("{\"name\":\"news\",\"hex_color\":\"#38bdf8\"}");
    expect(new URL(seen[0].url).pathname).toBe(`/app/api/${workspaceId}/tags`);
  });

  test("validates input, malformed output, 401 and 429", async () => {
    const fetch = async () => response({});
    await expect(actions["tags.get"]!({ apiKey: "secret", workspaceId, tagId: "", fetch })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["tags.get"]!({ apiKey: "secret", workspaceId: "..", tagId: "2323e1eb-b3a6-4183-990d-4d5afea04835", fetch })).rejects.toMatchObject({ code: "INVALID_ACTION_INPUT" });
    await expect(actions["accounts.list"]!({ apiKey: "secret", workspaceId, fetch: async () => response({ data: {} }) })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["tags.get"]!({ apiKey: "secret", workspaceId, tagId: "2323e1eb-b3a6-4183-990d-4d5afea04835", fetch: async () => response([], 200) })).rejects.toMatchObject({ code: "CONNECTOR_RESPONSE_INVALID" });
    await expect(actions["accounts.list"]!({ apiKey: "secret", workspaceId, fetch: async () => response({}, 401) })).rejects.toMatchObject({ code: "CONNECTOR_UPSTREAM_ERROR" });
    await expect(actions["accounts.list"]!({ apiKey: "secret", workspaceId, fetch: async () => response({}, 429, { "Retry-After": "4" }) })).rejects.toMatchObject({ code: "CONNECTOR_RATE_LIMITED", retryAfterSeconds: 4 });
  });
});
